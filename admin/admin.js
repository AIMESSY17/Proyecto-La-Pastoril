/* =====================================================================
   Panel del dueño · La Pastoril
   Todo vive en Supabase: Auth (login), tablas protegidas con RLS,
   funciones RPC y Realtime. Única librería: supabase-js (CDN).
   ===================================================================== */

// ---------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------
import { imageUrl } from '../images.js';

const config = window.LP_CONFIG || {};
const configured = Boolean(
  window.supabase?.createClient
  && config.SUPABASE_URL
  && config.SUPABASE_ANON_KEY
  && !/TODO/i.test(`${config.SUPABASE_URL}${config.SUPABASE_ANON_KEY}`),
);
const sb = configured
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    // Sesión recordada en este dispositivo, con una clave propia del panel.
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lapastoril-admin-auth' },
  })
  : null;

const SITE_URL = new URL('../', window.location.href); // raíz de la tienda
const BUCKET = 'product-images';
const STALE_HOURS = 48;              // pedidos "nuevo" sin respuesta pasan a "Para revisar"
const ORDERS_DAYS_LOADED = 180;      // historial que se trae para la lista y las estadísticas
const TRASH_DAYS = 30;
const MAX_ROUTE_STOPS = 9;
const BASE_TITLE = 'Panel · La Pastoril';
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const CATEGORY_LABELS = { gallina: 'Gallina', codorniz: 'Codorniz', pack: 'Pack', mayor: 'Por mayor' };
const STOCK_LABELS = { disponible: 'Disponible', pocos: 'Quedan pocos', agotado: 'Agotado' };
const STATUS_LABELS = { nuevo: 'Nuevo', confirmado: 'Confirmado', entregado: 'Entregado', cancelado: 'Cancelado' };
const FILTER_HINTS = {
  hoy: 'Pedidos que entraron hoy y confirmados para entregar hoy. Ordenados del más cercano a la granja al más lejano.',
  nuevos: 'Pedidos sin confirmar de las últimas 48 horas.',
  confirmados: 'Pedidos confirmados, pendientes de entrega.',
  revisar: 'Pedidos "nuevo" con más de 48 horas sin respuesta. No cuentan como venta.',
  todos: `Todos los pedidos de los últimos ${ORDERS_DAYS_LOADED} días.`,
};

const state = {
  user: null,
  orders: new Map(),
  zones: [],
  zoneMap: new Map(),
  campo: { nombre: 'Guernica, Presidente Perón', lat: -34.917, lng: -58.383 },
  whatsapp: '',
  businessName: 'La Pastoril',
  products: [],
  trash: [],
  reviews: [],
  productsLoaded: false,
  orderFilter: 'hoy',
  activeTab: 'pedidos',
  unseen: 0,
  soundOn: false,
  channel: null,
  needsResync: false,
  hiddenSince: 0,
  lastBatchId: null,
  form: null, // estado del formulario de producto
};

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const $ = (selector, root = document) => root.querySelector(selector);
// Ícono SVG del sprite de index.html (mismo trazo que la tienda).
const icon = (name) => `<svg class="ico" aria-hidden="true" focusable="false"><use href="#i-${name}" /></svg>`;
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function money(value) {
  return moneyFormat.format(Number(value) || 0);
}

// Escapa TODO texto que viene de clientes o de la base antes de usarlo como HTML.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function normalizeText(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function readPref(key) {
  try { return localStorage.getItem(key); } catch (error) { return null; }
}

function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch (error) { /* sin almacenamiento: no pasa nada */ }
}

// Distancia en km entre dos puntos (fórmula de Haversine).
function haversineKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every((value) => Number.isFinite(Number(value)))) return null;
  const rad = (degrees) => (Number(degrees) * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatWhen(iso) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const now = new Date();
  if (sameDay(date, now)) return `hoy ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `ayer ${time}`;
  return `${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

// Teléfono argentino → formato de wa.me (549 + área + número). Es una aproximación:
// si el cliente escribió algo raro, el link abre WhatsApp igual para elegir el chat.
function waPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 8) digits = `11${digits}`;                         // sin código de área: se asume AMBA
  if (digits.length === 10 && digits.startsWith('15')) digits = `11${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith('11') && digits.slice(2, 4) === '15') digits = `11${digits.slice(4)}`;
  return digits.length === 10 ? `549${digits}` : String(phone).replace(/\D/g, '');
}

function waLink(phone, text) {
  const number = waPhone(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function friendlyError(error) {
  const message = String(error?.message || error || '');
  if (/failed to fetch|network|timeout|load failed/i.test(message)) return 'Sin conexión. Revisá internet e intentá de nuevo.';
  if (error?.code === '42501' || /permission denied|row-level security/i.test(message)) return 'No tenés permiso para hacer esto.';
  if (error?.code === '23505') return 'Ya existe un registro con ese nombre.';
  if (error?.code === '23503') return 'Está en uso por otros datos y no se puede borrar.';
  if (error?.code === '23514') return 'Algún dato no es válido. Revisá el formulario.';
  if (/JWT|session/i.test(message)) return 'La sesión venció. Volvé a entrar.';
  return message || 'Ocurrió un error inesperado.';
}

function toast(message, type = 'info', ms = 4500) {
  const box = document.createElement('div');
  box.className = `toast toast-${type}`;
  box.setAttribute('role', type === 'error' ? 'alert' : 'status');
  box.textContent = message;
  $('#toasts').append(box);
  window.setTimeout(() => {
    box.classList.add('leaving');
    window.setTimeout(() => box.remove(), 300);
  }, ms);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label || 'Guardando…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

// Diálogo de confirmación reutilizable. Devuelve 'confirm', 'extra' o null.
function confirmDialog({ title, message, confirmLabel = 'Confirmar', extraLabel = '', danger = false, requireText = '' }) {
  const dialog = $('#confirmDialog');
  const okButton = $('#confirmOk');
  const extraButton = $('#confirmExtra');
  const textField = $('#confirmTextField');
  const textInput = $('#confirmText');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  okButton.textContent = confirmLabel;
  okButton.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  extraButton.hidden = !extraLabel;
  extraButton.textContent = extraLabel;
  textField.hidden = !requireText;
  textInput.value = '';
  $('#confirmTextLabel').textContent = requireText ? `Para confirmar, escribí: ${requireText}` : '';
  okButton.disabled = Boolean(requireText);

  const matches = () => textInput.value.trim().toLocaleLowerCase('es-AR') === requireText.trim().toLocaleLowerCase('es-AR');
  textInput.oninput = () => { okButton.disabled = !matches(); };
  textInput.onkeydown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault(); // evita que Enter active "Cancelar"
    if (matches()) dialog.close('confirm');
  };

  return new Promise((resolve) => {
    dialog.returnValue = '';
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm' || dialog.returnValue === 'extra' ? dialog.returnValue : null);
    }, { once: true });
    dialog.showModal();
    (requireText ? textInput : okButton).focus();
  });
}

// ---------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------
function showLogin(message = '') {
  $('#panelView').hidden = true;
  $('#loginView').hidden = false;
  const error = $('#loginError');
  error.textContent = message;
  error.hidden = !message;
  document.title = BASE_TITLE;
}

async function isAdmin(user) {
  const { data, error } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return !error && Boolean(data);
}

async function enterPanel(user) {
  if (!(await isAdmin(user))) {
    await sb.auth.signOut();
    showLogin('Esta cuenta no tiene permiso para entrar al panel.');
    return;
  }
  state.user = user;
  $('#loginView').hidden = true;
  $('#panelView').hidden = false;
  await loadBaseData();
  await loadOrders(false);
  subscribeOrders();
  loadReviews();
  const initialTab = (window.location.hash || '#pedidos').slice(1);
  showTab($(`[data-tab="${initialTab}"]`) ? initialTab : 'pedidos');
}

function teardown() {
  if (state.channel) sb.removeChannel(state.channel);
  state.channel = null;
  state.user = null;
  state.orders.clear();
  state.productsLoaded = false;
}

function initAuth() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    if (!email || !password) {
      showLogin('Completá el email y la contraseña.');
      return;
    }
    const button = $('#loginSubmit');
    setBusy(button, true, 'Entrando…');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(button, false);
    if (error) {
      showLogin(/invalid login/i.test(error.message) ? 'Email o contraseña incorrectos.' : friendlyError(error));
      return;
    }
    $('#loginPassword').value = '';
    await enterPanel(data.user);
  });

  $('#logoutButton').addEventListener('click', async () => {
    await sb.auth.signOut();
  });

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      teardown();
      showLogin();
    }
  });
}

// ---------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------
function showTab(name) {
  state.activeTab = name;
  $$('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $$('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== `tab-${name}`; });
  if (window.location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  if (name === 'pedidos') clearUnseen();
  if (name === 'estadisticas') renderStats();
  if (name === 'resenas') loadReviews();
  if (name === 'productos') ensureProducts();
  if (name === 'ajustes') renderSettings();
}

function initTabs() {
  const buttons = $$('[data-tab]');
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
      showTab(next.dataset.tab);
    });
  });
}

// ---------------------------------------------------------------------
// Datos base: ajustes y zonas
// ---------------------------------------------------------------------
async function loadBaseData() {
  const [settingsResult, zonesResult] = await Promise.all([
    sb.from('settings').select('key, value'),
    sb.from('zones').select('*').order('sort_order').order('name'),
  ]);
  if (settingsResult.error) toast(friendlyError(settingsResult.error), 'error');
  (settingsResult.data || []).forEach(({ key, value }) => {
    if (key === 'campo' && value) state.campo = { ...state.campo, ...value };
    if (key === 'whatsapp_number') state.whatsapp = String(value || '');
    if (key === 'business_name') state.businessName = String(value || 'La Pastoril');
  });
  if (zonesResult.error) toast(friendlyError(zonesResult.error), 'error');
  setZones(zonesResult.data || []);
}

function setZones(zones) {
  state.zones = zones;
  state.zoneMap = new Map(zones.map((zone) => [zone.name, zone]));
}

function zoneDistance(zoneName) {
  const zone = state.zoneMap.get(zoneName);
  if (!zone || zone.lat === null || zone.lng === null) return null;
  return haversineKm(state.campo, zone);
}

// ---------------------------------------------------------------------
// PEDIDOS
// ---------------------------------------------------------------------
function isStale(order) {
  return order.status === 'nuevo' && Date.now() - new Date(order.created_at).getTime() > STALE_HOURS * 3600 * 1000;
}

function isPreferredToday(order) {
  const day = normalizeText(order.preferred_day);
  return day === 'hoy' || day === normalizeText(DAYS[new Date().getDay()]);
}

function filterOrders(orders, filter) {
  const today = new Date();
  switch (filter) {
    case 'hoy':
      return orders.filter((order) => (sameDay(order.created_at, today) && order.status !== 'cancelado')
        || (order.status === 'confirmado' && isPreferredToday(order)));
    case 'nuevos':
      return orders.filter((order) => order.status === 'nuevo' && !isStale(order));
    case 'confirmados':
      return orders.filter((order) => order.status === 'confirmado');
    case 'revisar':
      return orders.filter(isStale);
    default:
      return orders;
  }
}

// Más cerca de la granja primero; sin coordenadas ("Otra") al final; empate → más reciente primero.
function sortByProximity(orders) {
  return [...orders].sort((a, b) => {
    const da = zoneDistance(a.zone);
    const db = zoneDistance(b.zone);
    if (da === null && db !== null) return 1;
    if (db === null && da !== null) return -1;
    if (da !== null && db !== null && Math.abs(da - db) > 0.05) return da - db;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

async function loadOrders(notifyMissing) {
  const since = new Date(Date.now() - ORDERS_DAYS_LOADED * 86400000).toISOString();
  const { data, error } = await sb.from('orders').select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3000);
  if (error) {
    toast(friendlyError(error), 'error');
    return;
  }
  const previous = state.orders;
  state.orders = new Map(data.map((order) => [order.id, order]));
  if (notifyMissing) {
    // Pedidos que entraron mientras el panel estaba dormido o sin conexión.
    data.filter((order) => !previous.has(order.id) && order.status === 'nuevo').forEach(notifyNewOrder);
  }
  refreshOrderViews();
}

function refreshOrderViews() {
  renderOrders();
  if (state.activeTab === 'estadisticas') renderStats();
  const newCount = [...state.orders.values()].filter((order) => order.status === 'nuevo' && !isStale(order)).length;
  const badge = $('#countNew');
  badge.textContent = String(newCount);
  badge.hidden = newCount === 0;
}

// Busca por nombre, número de pedido, referencia temporal, teléfono o zona.
function orderMatches(order, query) {
  return normalizeText([order.customer_name, order.id, order.client_ref, order.phone, order.zone].filter(Boolean).join(' ')).includes(query);
}

function renderOrders() {
  const all = [...state.orders.values()];
  $$('[data-count]').forEach((span) => {
    const count = filterOrders(all, span.dataset.count).length;
    span.textContent = count ? `(${count})` : '';
  });
  $$('#orderFilters .chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filter === state.orderFilter)));
  $('#orderFilterHint').textContent = FILTER_HINTS[state.orderFilter];

  const query = normalizeText($('#orderSearch').value);
  const matches = query ? all.filter((order) => orderMatches(order, query)) : filterOrders(all, state.orderFilter);
  if (query) $('#orderFilterHint').textContent = `${matches.length} ${matches.length === 1 ? 'resultado' : 'resultados'} en todos los pedidos.`;
  const list = sortByProximity(matches);
  $('#orderList').innerHTML = list.length
    ? list.map(orderCard).join('')
    : `<p class="empty">${query ? 'No encontramos pedidos con esa búsqueda.' : 'No hay pedidos en esta lista.'}</p>`;
}

function orderCard(order) {
  const distance = zoneDistance(order.zone);
  const stale = isStale(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const actions = [];
  if (order.status === 'nuevo') actions.push(`<button class="btn btn-primary" data-action="confirmado" data-id="${esc(order.id)}">${icon('check')} Confirmar</button>`);
  if (order.status === 'nuevo' || order.status === 'confirmado') actions.push(`<button class="btn btn-secondary" data-action="entregado" data-id="${esc(order.id)}">${icon('box')} Entregado</button>`);
  if (order.status === 'nuevo' || order.status === 'confirmado') actions.push(`<button class="btn btn-ghost" data-action="cancelado" data-id="${esc(order.id)}">${icon('close')} Cancelar</button>`);
  if (order.status === 'cancelado') actions.push(`<button class="btn btn-ghost" data-action="nuevo" data-id="${esc(order.id)}">${icon('undo')} Volver a nuevo</button>`);
  actions.push(`<button class="btn btn-whatsapp" data-action="reply" data-id="${esc(order.id)}">${icon('chat')} Responder por WhatsApp</button>`);
  if (order.status !== 'cancelado' && !order.customer_confirmed_at) {
    actions.push(`<button class="btn btn-ghost" data-action="ask-confirm" data-id="${esc(order.id)}">${icon('link')} Pedir confirmación de entrega</button>`);
  }

  return `
    <article class="order-card status-${esc(order.status)}${stale ? ' is-stale' : ''}">
      <header class="order-head">
        <strong class="order-id">${esc(order.id)}</strong>
        <span class="status-badge status-${esc(order.status)}">${stale ? 'Sin respuesta' : esc(STATUS_LABELS[order.status] || order.status)}</span>
        <time datetime="${esc(order.created_at)}">${esc(formatWhen(order.created_at))}</time>
      </header>
      <h3 class="order-name">${esc(order.customer_name)}</h3>
      <p class="order-zone">${icon('pin')} ${esc(order.zone || 'Sin zona')}${distance !== null ? ` · <strong>${numberFormat.format(distance)} km</strong> de la granja` : ''}</p>
      <ul class="order-items">
        ${items.map((item) => `<li><span>${esc(item.cantidad)} × ${esc(item.nombre)}</span><span>${money(item.precio * item.cantidad)}</span></li>`).join('')}
      </ul>
      <p class="order-total"><span>Total</span><strong>${money(order.total)}</strong></p>
      <dl class="order-meta">
        ${order.preferred_day ? `<div><dt>Día preferido</dt><dd>${esc(order.preferred_day)}${isPreferredToday(order) ? ' <span class="pill">hoy</span>' : ''}</dd></div>` : ''}
        ${order.phone ? `<div><dt>Teléfono</dt><dd><a href="tel:${esc(order.phone)}">${esc(order.phone)}</a></dd></div>` : ''}
        ${order.notes ? `<div class="wide"><dt>Aclaraciones</dt><dd>${esc(order.notes)}</dd></div>` : ''}
        ${order.source ? `<div><dt>Origen</dt><dd>${esc(order.source)}</dd></div>` : ''}
        ${order.client_ref ? `<div><dt>Ref. temporal</dt><dd>${esc(order.client_ref)}</dd></div>` : ''}
        ${order.rating ? `<div><dt>Calificación</dt><dd>${'★'.repeat(order.rating)}${'☆'.repeat(5 - order.rating)}</dd></div>` : ''}
        ${order.customer_confirmed_at ? '<div><dt>Cliente</dt><dd>Confirmó la recepción</dd></div>' : ''}
      </dl>
      ${stale ? '<p class="stale-note">Más de 48 h sin respuesta: no cuenta como venta. Confirmalo o cancelalo.</p>' : ''}
      <div class="order-actions">${actions.join('')}</div>
    </article>`;
}

async function setOrderStatus(id, status, button) {
  setBusy(button, true, 'Guardando…');
  const { data, error } = await sb.rpc('admin_set_status', { p_id: id, p_status: status });
  setBusy(button, false);
  if (error) {
    toast(friendlyError(error), 'error');
    return;
  }
  if (data?.id) state.orders.set(data.id, data);
  refreshOrderViews();
  toast(`${id}: ${STATUS_LABELS[status].toLowerCase()}.`, 'success', 2500);
}

function replyText(order) {
  const items = (order.items || []).map((item) => `${item.cantidad} × ${item.nombre}`).join(', ');
  const day = order.preferred_day ? ` ¿Te queda bien que lo entreguemos el ${order.preferred_day.toLowerCase()}?` : ' ¿Qué día te queda bien para la entrega?';
  return `Hola ${firstName(order.customer_name)}, te escribimos de ${state.businessName} por tu pedido ${order.id} (${items}, total ${money(order.total)}).${day}`;
}

function confirmationUrl(order) {
  return new URL(`pedido/?id=${encodeURIComponent(order.id)}&t=${encodeURIComponent(order.confirm_token)}`, SITE_URL).href;
}

async function askDeliveryConfirmation(order) {
  const message = `Hola ${firstName(order.customer_name)}, cuando recibas tu pedido ${order.id} confirmanos acá: ${confirmationUrl(order)}`;
  if (order.phone) {
    window.open(waLink(order.phone, message), '_blank');
    return;
  }
  const copied = await copyText(message);
  toast(copied
    ? 'No dejó teléfono: copiamos el mensaje. Pegalo en el chat de WhatsApp del cliente.'
    : 'No se pudo copiar. Mensaje: ' + message, copied ? 'success' : 'error', 7000);
}

function initOrders() {
  $('#orderFilters').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.orderFilter = chip.dataset.filter;
    writePref('lp-admin-order-filter', state.orderFilter);
    $('#orderSearch').value = '';
    renderOrders();
  });

  // Filtro recordado y buscador (con una pequeña espera para no repintar en cada tecla).
  const savedFilter = readPref('lp-admin-order-filter');
  if (savedFilter && FILTER_HINTS[savedFilter]) state.orderFilter = savedFilter;
  let searchTimer = 0;
  $('#orderSearch').addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderOrders, 180);
  });

  $('#orderList').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const order = state.orders.get(button.dataset.id);
    if (!order) return;
    const action = button.dataset.action;
    if (action === 'reply') {
      window.open(order.phone ? waLink(order.phone, replyText(order)) : `https://wa.me/?text=${encodeURIComponent(replyText(order))}`, '_blank');
      return;
    }
    if (action === 'ask-confirm') {
      askDeliveryConfirmation(order);
      return;
    }
    if (action === 'cancelado') {
      const answer = await confirmDialog({
        title: `¿Cancelar ${order.id}?`,
        message: `El pedido de ${order.customer_name} deja de contar como venta. Podés volverlo a "nuevo" después.`,
        confirmLabel: 'Sí, cancelar',
        danger: true,
      });
      if (answer !== 'confirm') return;
    }
    if (action === 'entregado') {
      const answer = await confirmDialog({
        title: `¿Marcar ${order.id} como entregado?`,
        message: `El pedido de ${order.customer_name} pasa a "entregado" y cuenta como venta. Después no se puede volver atrás desde el panel.`,
        confirmLabel: 'Sí, entregado',
      });
      if (answer !== 'confirm') return;
    }
    setOrderStatus(order.id, action, button);
  });

  $('#routeButton').addEventListener('click', openTodayRoute);
}

// Recorrido de hoy en Google Maps: pedidos confirmados con día preferido = hoy.
function openTodayRoute() {
  const todays = [...state.orders.values()].filter((order) => order.status === 'confirmado' && isPreferredToday(order));
  const zones = [...new Set(todays.map((order) => order.zone).filter((zone) => zone && zone !== 'Otra'))];
  if (!zones.length) {
    toast(`No hay pedidos confirmados para hoy (${DAYS[new Date().getDay()]}).`, 'info');
    return;
  }
  const stops = zones
    .map((zone) => ({ zone, distance: zoneDistance(zone) }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    .slice(0, MAX_ROUTE_STOPS)
    .map(({ zone }) => (zone === 'CABA' ? 'Ciudad Autónoma de Buenos Aires, Argentina' : `${zone}, Buenos Aires, Argentina`));
  const destination = stops.pop();
  const params = new URLSearchParams({
    api: '1',
    origin: `${state.campo.lat},${state.campo.lng}`,
    destination,
    travelmode: 'driving',
  });
  if (stops.length) params.set('waypoints', stops.join('|'));
  if (zones.length > MAX_ROUTE_STOPS) toast(`Google Maps admite ${MAX_ROUTE_STOPS} paradas: quedaron afuera las más lejanas.`, 'info', 6000);
  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank');
}

// ---------------------------------------------------------------------
// Realtime y avisos de pedidos nuevos
// ---------------------------------------------------------------------
function setLiveIndicator(status) {
  const indicator = $('#liveIndicator');
  const live = status === 'SUBSCRIBED';
  indicator.dataset.state = live ? 'on' : 'off';
  indicator.textContent = live ? 'En vivo' : 'Reconectando…';
}

function subscribeOrders() {
  if (state.channel) sb.removeChannel(state.channel);
  state.channel = sb
    .channel('pedidos-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        state.orders.delete(payload.old?.id);
      } else if (payload.new?.id) {
        const isNew = payload.eventType === 'INSERT' && !state.orders.has(payload.new.id);
        state.orders.set(payload.new.id, payload.new);
        if (isNew) notifyNewOrder(payload.new);
      }
      refreshOrderViews();
    })
    .subscribe((status) => {
      setLiveIndicator(status);
      if (status === 'SUBSCRIBED' && state.needsResync) {
        state.needsResync = false;
        loadOrders(true);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') state.needsResync = true;
    });
}

let audioContext = null;
function ensureAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) audioContext = new AudioCtor();
  }
  if (audioContext?.state === 'suspended') audioContext.resume();
}

// Sonido corto de dos notas, generado en el navegador (sin archivos).
function beep() {
  if (!audioContext) return;
  const start = audioContext.currentTime;
  [[0, 660], [0.18, 880]].forEach(([delay, frequency]) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + delay);
    gain.gain.exponentialRampToValueAtTime(0.3, start + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.16);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start + delay);
    oscillator.stop(start + delay + 0.18);
  });
}

function updateSoundButton() {
  const button = $('#soundToggle');
  button.setAttribute('aria-pressed', String(state.soundOn));
  button.querySelector('span[aria-hidden]').innerHTML = icon(state.soundOn ? 'sound' : 'mute');
  button.querySelector('.sr-only').textContent = state.soundOn ? 'Desactivar sonido de pedidos nuevos' : 'Activar sonido de pedidos nuevos';
  button.title = state.soundOn ? 'Sonido activado' : 'Sonido desactivado';
}

function updateNotifyButton() {
  const button = $('#notifyToggle');
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  button.dataset.state = permission;
  button.title = {
    granted: 'Notificaciones activadas',
    denied: 'Notificaciones bloqueadas en este navegador',
    default: 'Activar notificaciones del navegador',
    unsupported: 'Este navegador no admite notificaciones',
  }[permission];
  button.querySelector('.sr-only').textContent = button.title;
  button.querySelector('span[aria-hidden]').innerHTML = icon(permission === 'granted' ? 'bell-on' : 'bell');
}

function initAlerts() {
  state.soundOn = readPref('lp-admin-sound') === 'on';
  updateSoundButton();
  updateNotifyButton();
  // El navegador solo deja reproducir sonido después de un toque del usuario.
  document.addEventListener('pointerdown', () => { if (state.soundOn) ensureAudio(); }, { once: true });

  $('#soundToggle').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    writePref('lp-admin-sound', state.soundOn ? 'on' : 'off');
    if (state.soundOn) {
      ensureAudio();
      beep();
    }
    updateSoundButton();
  });

  $('#notifyToggle').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      toast('Este navegador no admite notificaciones. Instalá el panel en el celular (ver README).', 'info');
      return;
    }
    if (Notification.permission === 'granted') {
      toast('Las notificaciones ya están activadas.', 'success');
    } else if (Notification.permission === 'denied') {
      toast('Las notificaciones están bloqueadas. Habilitalas desde la configuración del navegador para este sitio.', 'error', 7000);
    } else {
      const result = await Notification.requestPermission();
      toast(result === 'granted' ? 'Listo: vas a recibir avisos de pedidos nuevos.' : 'No se activaron las notificaciones.', result === 'granted' ? 'success' : 'info');
    }
    updateNotifyButton();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.hiddenSince = Date.now();
      return;
    }
    if (state.activeTab === 'pedidos') clearUnseen();
    // En el celular el panel "duerme": al volver, se traen los pedidos que falten.
    if (state.user && state.hiddenSince && Date.now() - state.hiddenSince > 30000) loadOrders(true);
    state.hiddenSince = 0;
  });
}

function updateTitle() {
  document.title = state.unseen ? `(${state.unseen}) ${BASE_TITLE}` : BASE_TITLE;
}

function clearUnseen() {
  if (document.hidden) return;
  state.unseen = 0;
  updateTitle();
}

async function showSystemNotification(order) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = `Nuevo pedido ${order.id}`;
  const options = {
    body: `${order.customer_name} · ${order.zone || 'sin zona'} · ${money(order.total)}`,
    icon: '../imagenes/icon-192.png',
    badge: '../imagenes/icon-192.png',
    tag: order.id,
    data: { url: './#pedidos' },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  } catch (error) { /* se intenta la forma simple */ }
  try { new Notification(title, options); } catch (error) { /* Android exige service worker */ }
}

function notifyNewOrder(order) {
  if (document.hidden || state.activeTab !== 'pedidos') state.unseen += 1;
  updateTitle();
  toast(`Nuevo pedido ${order.id} · ${order.customer_name} · ${money(order.total)}`, 'success', 8000);
  if (state.soundOn) {
    ensureAudio();
    beep();
  }
  if (document.hidden || !document.hasFocus()) showSystemNotification(order);
}

// ---------------------------------------------------------------------
// ESTADÍSTICAS
// ---------------------------------------------------------------------
const isSale = (order) => order.status === 'confirmado' || order.status === 'entregado';

function sumSales(orders) {
  const sales = orders.filter(isSale);
  return { total: sales.reduce((sum, order) => sum + order.total, 0), count: sales.length };
}

function rangeOrders(days) {
  const since = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  return [...state.orders.values()].filter((order) => new Date(order.created_at) >= since);
}

function kpi(label, value, detail = '') {
  return `<div class="kpi"><span class="kpi-label">${esc(label)}</span><strong class="kpi-value">${value}</strong>${detail ? `<span class="kpi-detail">${detail}</span>` : ''}</div>`;
}

function percent(part, total) {
  return total ? `${Math.round((part / total) * 100)} %` : '—';
}

function renderStats() {
  const all = [...state.orders.values()];
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfDay(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // lunes
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const since = (start) => all.filter((order) => new Date(order.created_at) >= start);

  const today = sumSales(since(todayStart));
  const week = sumSales(since(weekStart));
  const month = sumSales(since(monthStart));
  $('#kpiSales').innerHTML = [
    kpi('Ventas de hoy', money(today.total), `${today.count} pedido${today.count === 1 ? '' : 's'}`),
    kpi('Esta semana', money(week.total), `${week.count} pedido${week.count === 1 ? '' : 's'}`),
    kpi('Este mes', money(month.total), `${month.count} pedido${month.count === 1 ? '' : 's'}`),
  ].join('');

  const days = Number($('#statsRange').value) || 30;
  const inRange = rangeOrders(days);
  const sales = inRange.filter(isSale);
  const salesTotal = sales.reduce((sum, order) => sum + order.total, 0);
  const delivered = sales.filter((order) => order.status === 'entregado').length;
  const stale = all.filter(isStale).length;
  const rated = inRange.filter((order) => order.rating);
  const avgStars = rated.length ? rated.reduce((sum, order) => sum + order.rating, 0) / rated.length : null;
  $('#kpiRates').innerHTML = [
    kpi('Ticket promedio', sales.length ? money(salesTotal / sales.length) : '—', `${days} días`),
    kpi('Conversión', percent(sales.length, inRange.length), `${sales.length} de ${inRange.length} iniciados`),
    kpi('Tasa de entrega', percent(delivered, sales.length), `${delivered} entregados`),
    kpi('Sin respuesta', String(stale), 'más de 48 h'),
    kpi('Estrellas', avgStars ? `${numberFormat.format(avgStars)} ★` : '—', `${rated.length} calificación${rated.length === 1 ? '' : 'es'}`),
  ].join('');

  // Ventas por día (o por semana si el período es de 90 días).
  const points = [];
  if (days <= 30) {
    for (let index = days - 1; index >= 0; index -= 1) {
      const day = startOfDay(new Date(Date.now() - index * 86400000));
      const value = sales.filter((order) => sameDay(order.created_at, day)).reduce((sum, order) => sum + order.total, 0);
      points.push({ label: day.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), value });
    }
  } else {
    for (let index = Math.ceil(days / 7) - 1; index >= 0; index -= 1) {
      const end = new Date(Date.now() - index * 7 * 86400000);
      const start = startOfDay(new Date(end.getTime() - 6 * 86400000));
      const value = sales.filter((order) => {
        const created = new Date(order.created_at);
        return created >= start && created <= end;
      }).reduce((sum, order) => sum + order.total, 0);
      points.push({ label: `sem. ${start.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`, value });
    }
  }
  $('#salesChart').innerHTML = barChart(points);

  // Ranking por zona.
  const byZone = new Map();
  sales.forEach((order) => {
    const key = order.zone || 'Sin zona';
    const entry = byZone.get(key) || { total: 0, count: 0 };
    entry.total += order.total;
    entry.count += 1;
    byZone.set(key, entry);
  });
  $('#zoneRanking').innerHTML = rankingBars([...byZone.entries()].map(([label, entry]) => ({
    label, value: entry.total, detail: `${entry.count} pedido${entry.count === 1 ? '' : 's'}`,
  })));

  // Por producto (con el nombre y precio guardados en cada pedido).
  const byProduct = new Map();
  sales.forEach((order) => (order.items || []).forEach((item) => {
    const key = item.nombre || item.id;
    const entry = byProduct.get(key) || { total: 0, units: 0 };
    entry.total += item.precio * item.cantidad;
    entry.units += item.cantidad;
    byProduct.set(key, entry);
  }));
  $('#productRanking').innerHTML = rankingBars([...byProduct.entries()].map(([label, entry]) => ({
    label, value: entry.total, detail: `${entry.units} u.`,
  })));
}

// Gráfico de barras en SVG puro.
function barChart(points) {
  const height = 180;
  const top = 18;
  const bottom = 26;
  const plot = height - top - bottom;
  const max = Math.max(1, ...points.map((point) => point.value));
  const width = 100 / points.length;
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const bars = points.map((point, index) => {
    const barHeight = (point.value / max) * plot;
    const x = index * width + width * 0.15;
    return `
      <rect x="${x}%" y="${top + plot - barHeight}" width="${width * 0.7}%" height="${Math.max(barHeight, point.value ? 2 : 0)}" rx="3" class="bar">
        <title>${esc(point.label)}: ${esc(money(point.value))}</title>
      </rect>
      ${index % labelEvery === 0 ? `<text x="${index * width + width / 2}%" y="${height - 8}" text-anchor="middle" class="axis-label">${esc(point.label)}</text>` : ''}`;
  }).join('');
  return `
    <svg class="bar-chart" width="100%" height="${height}" role="img" aria-label="Ventas del período: ${esc(money(total))} en total. Máximo diario ${esc(money(max))}.">
      <text x="0" y="12" class="axis-label">máx. ${esc(money(max))}</text>
      <line x1="0" x2="100%" y1="${top + plot}" y2="${top + plot}" class="axis" />
      ${bars}
    </svg>`;
}

function rankingBars(entries) {
  if (!entries.length) return '<p class="empty">Todavía no hay ventas en este período.</p>';
  const sorted = entries.sort((a, b) => b.value - a.value).slice(0, 12);
  const max = Math.max(1, sorted[0].value);
  return `<ol class="ranking">${sorted.map((entry) => `
    <li>
      <div class="ranking-text"><span>${esc(entry.label)}</span><strong>${money(entry.value)}</strong></div>
      <div class="ranking-bar" aria-hidden="true"><span style="width:${Math.max(2, (entry.value / max) * 100)}%"></span></div>
      <small class="muted">${esc(entry.detail)}</small>
    </li>`).join('')}</ol>`;
}

function exportCsv() {
  const days = Number($('#statsRange').value) || 30;
  const orders = rangeOrders(days).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const header = ['ID', 'Fecha', 'Estado', 'Cuenta como venta', 'Nombre', 'Teléfono', 'Zona', 'Distancia km', 'Día preferido', 'Productos', 'Total', 'Aclaraciones', 'Origen', 'Estrellas'];
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const rows = orders.map((order) => {
    const distance = zoneDistance(order.zone);
    return [
      order.id,
      new Date(order.created_at).toLocaleString('es-AR'),
      isStale(order) ? 'sin respuesta' : order.status,
      isSale(order) ? 'sí' : 'no',
      order.customer_name,
      order.phone,
      order.zone,
      distance === null ? '' : distance.toFixed(1).replace('.', ','),
      order.preferred_day,
      (order.items || []).map((item) => `${item.cantidad} x ${item.nombre}`).join(' | '),
      order.total,
      order.notes,
      order.source,
      order.rating,
    ].map(cell).join(';');
  });
  // Punto y coma + BOM: Excel en español lo abre bien sin configurar nada.
  const csv = `﻿${header.map(cell).join(';')}\r\n${rows.join('\r\n')}`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `pedidos-lapastoril-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

function initStats() {
  const savedRange = readPref('lp-admin-stats-range');
  if (['7', '30', '90'].includes(savedRange)) $('#statsRange').value = savedRange;
  $('#statsRange').addEventListener('change', () => {
    writePref('lp-admin-stats-range', $('#statsRange').value);
    renderStats();
  });
  $('#exportCsv').addEventListener('click', exportCsv);
}

// ---------------------------------------------------------------------
// RESEÑAS
// ---------------------------------------------------------------------
async function loadReviews() {
  const { data, error } = await sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) {
    toast(friendlyError(error), 'error');
    return;
  }
  state.reviews = data;
  renderReviews();
}

function reviewCard(review, actions) {
  return `
    <article class="review-card">
      <div class="review-head">
        <span class="stars" aria-label="${review.stars} de 5 estrellas">${'★'.repeat(review.stars)}${'☆'.repeat(5 - review.stars)}</span>
        <small class="muted">${esc(formatWhen(review.created_at))} · ${esc(review.order_id || '')}</small>
      </div>
      <p>${review.comment ? `“${esc(review.comment)}”` : '<em class="muted">Sin comentario</em>'}</p>
      <p class="review-author">— ${esc(review.display_name || 'Cliente')}${review.neighborhood ? `, ${esc(review.neighborhood)}` : ''}</p>
      <div class="order-actions">${actions}</div>
    </article>`;
}

function renderReviews() {
  const pending = state.reviews.filter((review) => review.status === 'pendiente');
  const approved = state.reviews.filter((review) => review.status === 'aprobada');
  $('#pendingReviews').innerHTML = pending.length
    ? pending.map((review) => reviewCard(review, `
        <button class="btn btn-primary" data-review="${review.id}" data-status="aprobada">${icon('check')} Aprobar</button>
        <button class="btn btn-ghost" data-review="${review.id}" data-status="rechazada">${icon('close')} Rechazar</button>`)).join('')
    : '<p class="empty">No hay reseñas pendientes.</p>';
  $('#approvedReviews').innerHTML = approved.length
    ? approved.map((review) => reviewCard(review, `<button class="btn btn-ghost" data-review="${review.id}" data-status="rechazada">Quitar de la web</button>`)).join('')
    : '<p class="empty">Todavía no hay reseñas publicadas.</p>';
  const badge = $('#countReviews');
  badge.textContent = String(pending.length);
  badge.hidden = pending.length === 0;
}

function initReviews() {
  $('#tab-resenas').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-review]');
    if (!button) return;
    if (button.dataset.status === 'rechazada') {
      const answer = await confirmDialog({
        title: '¿Sacar esta reseña?',
        message: 'La reseña no se va a mostrar en la tienda. No se puede volver a publicar desde el panel.',
        confirmLabel: 'Sí, sacarla',
        danger: true,
      });
      if (answer !== 'confirm') return;
    }
    setBusy(button, true, '…');
    const { error } = await sb.from('reviews').update({ status: button.dataset.status }).eq('id', Number(button.dataset.review));
    setBusy(button, false);
    if (error) {
      toast(friendlyError(error), 'error');
      return;
    }
    toast(button.dataset.status === 'aprobada' ? 'Reseña publicada en la tienda.' : 'Reseña rechazada.', 'success', 2500);
    loadReviews();
  });
}

// ---------------------------------------------------------------------
// PRODUCTOS
// ---------------------------------------------------------------------
function isBucketUrl(url) {
  return typeof url === 'string' && url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

function bucketPath(url) {
  return decodeURIComponent(url.split(`/storage/v1/object/public/${BUCKET}/`)[1] || '').split('?')[0];
}

// Las fotos locales de la tienda (imagenes/…) se resuelven desde la raíz del sitio.
function imageSrc(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : new URL(imageUrl(url, 160), SITE_URL).href;
}

async function ensureProducts() {
  if (!state.productsLoaded) await loadProducts();
  else renderProducts();
}

async function loadProducts() {
  const { data, error } = await sb.from('products').select('*').order('sort_order').order('name');
  if (error) {
    toast(friendlyError(error), 'error');
    return;
  }
  state.products = data.filter((product) => !product.deleted_at);
  state.trash = data.filter((product) => product.deleted_at);
  state.productsLoaded = true;
  renderProducts();
  purgeOldTrash();
}

function productFilters() {
  return {
    query: normalizeText($('#productSearch').value),
    category: $('#productCategoryFilter').value,
    status: $('#productStatusFilter').value,
  };
}

function isFiltered() {
  const filters = productFilters();
  return Boolean(filters.query || filters.category || filters.status);
}

function renderProducts() {
  const { query, category, status } = productFilters();
  const list = state.products.filter((product) => {
    if (query && !normalizeText(product.name).includes(query)) return false;
    if (category && product.category !== category) return false;
    if (status === 'visible' && !product.active) return false;
    if (status === 'oculto' && product.active) return false;
    if (status === 'agotado' && product.stock_status !== 'agotado') return false;
    return true;
  });
  const reorderDisabled = isFiltered();
  $('#reorderHint').textContent = reorderDisabled
    ? 'Para reordenar, quitá la búsqueda y los filtros.'
    : 'Para cambiar el orden de la tienda, arrastrá desde los puntitos o usá las flechas ▲▼.';

  $('#productList').innerHTML = list.length ? list.map((product, index) => `
    <li class="product-row${product.active ? '' : ' is-hidden'}${product.stock_status === 'agotado' ? ' is-soldout' : ''}" data-id="${esc(product.id)}">
      <button class="drag-handle" type="button" aria-label="Arrastrar para reordenar ${esc(product.name)}" ${reorderDisabled ? 'disabled' : ''}>${icon('grip')}</button>
      <div class="thumb">${product.image_url ? `<img src="${esc(imageSrc(product.image_url))}" alt="" loading="lazy" />` : icon('egg')}</div>
      <div class="cell-name">
        <strong>${esc(product.name)}</strong>
        ${product.badge ? `<span class="pill">${esc(product.badge)}</span>` : ''}
        ${product.active ? '' : '<span class="pill pill-muted">Oculto</span>'}
      </div>
      <div class="cell-cat" data-label="Categoría">${esc(CATEGORY_LABELS[product.category] || product.category)}</div>
      <div class="cell-price" data-label="Precio">${product.whatsapp_only ? '<span class="muted">Solo consulta</span>' : `<strong>${money(product.price)}</strong>`}</div>
      <label class="cell-stock" data-label="Stock">
        <span class="sr-only">Stock de ${esc(product.name)}</span>
        <select data-stock="${esc(product.id)}">
          ${Object.entries(STOCK_LABELS).map(([value, label]) => `<option value="${value}"${product.stock_status === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
      <label class="switch cell-visible" data-label="Visible">
        <input type="checkbox" role="switch" data-visible="${esc(product.id)}" ${product.active ? 'checked' : ''} />
        <span class="switch-track" aria-hidden="true"></span>
        <span class="sr-only">Visible en la tienda: ${esc(product.name)}</span>
      </label>
      <div class="cell-actions">
        <button class="icon-btn small" type="button" data-move="-1" aria-label="Subir ${esc(product.name)}" ${reorderDisabled || index === 0 ? 'disabled' : ''}>▲</button>
        <button class="icon-btn small" type="button" data-move="1" aria-label="Bajar ${esc(product.name)}" ${reorderDisabled || index === list.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn btn-ghost btn-small" type="button" data-edit>Editar</button>
        <button class="btn btn-ghost btn-small" type="button" data-duplicate>Duplicar</button>
        <button class="btn btn-danger-ghost btn-small" type="button" data-delete>Eliminar</button>
      </div>
    </li>`).join('') : '<li class="empty">No hay productos con esos filtros.</li>';

  renderTrash();
}

function renderTrash() {
  $('#trashCount').textContent = state.trash.length ? `(${state.trash.length})` : '';
  $('#trashList').innerHTML = state.trash.length ? state.trash.map((product) => {
    const daysLeft = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(product.deleted_at)) / 86400000));
    return `
      <li data-id="${esc(product.id)}">
        <span><strong>${esc(product.name)}</strong> <small class="muted">se borra en ${daysLeft} día${daysLeft === 1 ? '' : 's'}</small></span>
        <span class="inline-actions">
          <button class="btn btn-secondary btn-small" type="button" data-restore>Restaurar</button>
          <button class="btn btn-danger-ghost btn-small" type="button" data-purge>Eliminar definitivamente</button>
        </span>
      </li>`;
  }).join('') : '<li class="empty">La papelera está vacía.</li>';
}

async function updateProduct(id, changes) {
  const { data, error } = await sb.from('products').update(changes).eq('id', id).select().single();
  if (error) throw error;
  const replace = (list) => list.map((product) => (product.id === id ? data : product));
  state.products = replace(state.products);
  state.trash = replace(state.trash);
  return data;
}

async function saveOrder(ids) {
  const { error } = await sb.rpc('admin_reorder_products', { p_ids: ids });
  if (error) {
    toast(friendlyError(error), 'error');
    await loadProducts();
    return;
  }
  const position = new Map(ids.map((id, index) => [id, (index + 1) * 10]));
  state.products = state.products
    .map((product) => ({ ...product, sort_order: position.get(product.id) ?? product.sort_order }))
    .sort((a, b) => a.sort_order - b.sort_order);
  renderProducts();
  toast('Orden guardado.', 'success', 1800);
}

// Arrastrar y soltar con eventos de puntero: funciona con mouse y con el dedo.
function initDragAndDrop() {
  const list = $('#productList');
  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.drag-handle');
    if (!handle || handle.disabled) return;
    const row = handle.closest('.product-row');
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    row.classList.add('dragging');
    const startOrder = $$('.product-row', list).map((item) => item.dataset.id).join(',');

    const onMove = (moveEvent) => {
      const y = moveEvent.clientY;
      const rows = $$('.product-row', list);
      const others = rows.filter((item) => item !== row);
      let target = others.findIndex((item) => {
        const rect = item.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
      });
      if (target === -1) target = others.length;
      // Se mueven las filas VECINAS, nunca la que se arrastra: si el navegador la
      // saca del documento aunque sea un instante, suelta el puntero y corta el arrastre.
      let current = rows.indexOf(row);
      for (; current > target; current -= 1) list.insertBefore(row.previousElementSibling, row.nextSibling);
      for (; current < target; current += 1) list.insertBefore(row.nextElementSibling, row);
      if (y < 70) window.scrollBy(0, -12);
      else if (y > window.innerHeight - 70) window.scrollBy(0, 12);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      row.classList.remove('dragging');
      const ids = $$('.product-row', list).map((item) => item.dataset.id);
      if (ids.join(',') !== startOrder) saveOrder(ids);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  });
}

async function countOrdersWithProduct(id) {
  const { count, error } = await sb.from('orders')
    .select('id', { count: 'exact', head: true })
    .filter('items', 'cs', JSON.stringify([{ id }]));
  if (error) throw error;
  return count || 0;
}

// Borra la foto del bucket si ningún producto (ni de la papelera) la usa.
async function deleteImageIfUnused(url) {
  if (!isBucketUrl(url)) return;
  const { count, error } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('image_url', url);
  if (error || count > 0) return;
  const { error: removeError } = await sb.storage.from(BUCKET).remove([bucketPath(url)]);
  if (removeError) console.warn('No se pudo borrar la foto:', removeError);
}

async function deleteProduct(product) {
  try {
    const count = await countOrdersWithProduct(product.id);
    if (count > 0) {
      const choice = await confirmDialog({
        title: 'Este producto tiene pedidos',
        message: `"${product.name}" aparece en ${count} pedido${count === 1 ? '' : 's'}. Te conviene ocultarlo: deja de verse en la tienda y lo podés volver a mostrar cuando quieras. Si lo eliminás igual, los pedidos viejos conservan sus datos (copia del nombre y del precio del momento).`,
        confirmLabel: 'Ocultar de la tienda',
        extraLabel: 'Eliminar igual',
      });
      if (choice === 'confirm') {
        await updateProduct(product.id, { active: false });
        renderProducts();
        toast('Producto oculto.', 'success');
        return;
      }
      if (choice !== 'extra') return;
    }
    const answer = await confirmDialog({
      title: 'Eliminar producto',
      message: `"${product.name}" va a la papelera. Durante ${TRASH_DAYS} días lo podés restaurar.`,
      confirmLabel: 'Mover a la papelera',
      danger: true,
      requireText: product.name,
    });
    if (answer !== 'confirm') return;
    await updateProduct(product.id, { deleted_at: new Date().toISOString() });
    state.trash = [...state.trash, ...state.products.filter((item) => item.id === product.id)];
    state.products = state.products.filter((item) => item.id !== product.id);
    renderProducts();
    toast('Producto en la papelera.', 'success');
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

async function purgeProduct(product) {
  const { error } = await sb.from('products').delete().eq('id', product.id);
  if (error) throw error;
  state.trash = state.trash.filter((item) => item.id !== product.id);
  await deleteImageIfUnused(product.image_url);
}

// La papelera se vacía sola: los productos con más de 30 días se borran al abrir el panel.
async function purgeOldTrash() {
  const old = state.trash.filter((product) => Date.now() - new Date(product.deleted_at) > TRASH_DAYS * 86400000);
  for (const product of old) {
    try { await purgeProduct(product); } catch (error) { console.warn('No se pudo vaciar la papelera:', error); }
  }
  if (old.length) renderTrash();
}

function initProducts() {
  try {
    const saved = JSON.parse(readPref('lp-admin-product-filters') || '{}');
    $('#productSearch').value = String(saved.query || '');
    $('#productCategoryFilter').value = saved.category || '';
    $('#productStatusFilter').value = saved.status || '';
  } catch (error) { /* preferencia dañada: se ignora */ }
  let productFilterTimer = 0;
  ['#productSearch', '#productCategoryFilter', '#productStatusFilter'].forEach((selector) => {
    $(selector).addEventListener('input', () => {
      writePref('lp-admin-product-filters', JSON.stringify({
        query: $('#productSearch').value,
        category: $('#productCategoryFilter').value,
        status: $('#productStatusFilter').value,
      }));
      window.clearTimeout(productFilterTimer);
      productFilterTimer = window.setTimeout(renderProducts, 150);
    });
  });
  $('#addProduct').addEventListener('click', () => openProductForm(null));
  $('#openPrices').addEventListener('click', openPriceDialog);
  initDragAndDrop();

  $('#productList').addEventListener('change', async (event) => {
    const visible = event.target.closest('[data-visible]');
    const stock = event.target.closest('[data-stock]');
    try {
      if (visible) {
        await updateProduct(visible.dataset.visible, { active: visible.checked });
        toast(visible.checked ? 'Ahora se ve en la tienda.' : 'Oculto en la tienda.', 'success', 2000);
        renderProducts();
      }
      if (stock) {
        await updateProduct(stock.dataset.stock, { stock_status: stock.value });
        toast(`Stock: ${STOCK_LABELS[stock.value]}.`, 'success', 2000);
        renderProducts();
      }
    } catch (error) {
      toast(friendlyError(error), 'error');
      renderProducts();
    }
  });

  $('#productList').addEventListener('click', (event) => {
    const row = event.target.closest('.product-row');
    if (!row) return;
    const product = state.products.find((item) => item.id === row.dataset.id);
    if (!product) return;
    const move = event.target.closest('[data-move]');
    if (move) {
      const ids = state.products.map((item) => item.id);
      const from = ids.indexOf(product.id);
      const to = from + Number(move.dataset.move);
      if (to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      saveOrder(ids);
      return;
    }
    if (event.target.closest('[data-edit]')) openProductForm(product);
    if (event.target.closest('[data-duplicate]')) openProductForm(product, { duplicate: true });
    if (event.target.closest('[data-delete]')) deleteProduct(product);
  });

  $('#trashList').addEventListener('click', async (event) => {
    const item = event.target.closest('li[data-id]');
    if (!item) return;
    const product = state.trash.find((entry) => entry.id === item.dataset.id);
    if (!product) return;
    try {
      if (event.target.closest('[data-restore]')) {
        const restored = await updateProduct(product.id, { deleted_at: null });
        state.trash = state.trash.filter((entry) => entry.id !== product.id);
        state.products = [...state.products, restored].sort((a, b) => a.sort_order - b.sort_order);
        renderProducts();
        toast('Producto restaurado.', 'success');
      }
      if (event.target.closest('[data-purge]')) {
        const answer = await confirmDialog({
          title: 'Eliminar definitivamente',
          message: `"${product.name}" se borra para siempre (los pedidos viejos conservan su copia). No se puede deshacer.`,
          confirmLabel: 'Eliminar para siempre',
          danger: true,
          requireText: product.name,
        });
        if (answer !== 'confirm') return;
        await purgeProduct(product);
        renderTrash();
        toast('Producto eliminado definitivamente.', 'success');
      }
    } catch (error) {
      toast(friendlyError(error), 'error');
    }
  });

  initProductForm();
  initPriceDialog();
}

// ---------- Formulario de producto (agregar / editar / duplicar) ----------
function slugify(text) {
  return normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'producto';
}

function uniqueProductId(name) {
  const taken = new Set([...state.products, ...state.trash].map((product) => product.id));
  const base = slugify(name);
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}

function setPhotoPreview(src) {
  $('#pPhotoPreview').innerHTML = src ? `<img src="${esc(src)}" alt="Vista previa de la foto" />` : '<span class="muted">Sin foto</span>';
  $('#pPhotoRemove').hidden = !src;
}

function updatePriceVisibility() {
  const whatsappOnly = $('#pWhatsappOnly').checked;
  $('#pPriceField').hidden = whatsappOnly;
}

function openProductForm(product, { duplicate = false } = {}) {
  const editing = Boolean(product) && !duplicate;
  state.form = {
    id: editing ? product.id : null,
    original: editing ? product : null,
    imageUrl: product?.image_url || '',
    blob: null,
    previewUrl: '',
  };
  $('#productDialogTitle').textContent = editing ? 'Editar producto' : duplicate ? 'Duplicar producto' : 'Agregar producto';
  $('#pName').value = product ? (duplicate ? `${product.name} (copia)` : product.name) : '';
  $('#pDescription').value = product?.description || '';
  $('#pCategory').value = product?.category || 'gallina';
  $('#pStock').value = product?.stock_status || 'disponible';
  $('#pWhatsappOnly').checked = Boolean(product?.whatsapp_only);
  $('#pPrice').value = product && !product.whatsapp_only ? product.price : '';
  $('#pBadge').value = product?.badge || '';
  // Una copia arranca oculta para revisarla antes de mostrarla.
  $('#pActive').checked = product ? (duplicate ? false : product.active) : true;
  $('#pPhotoUrl').value = state.form.imageUrl && !isBucketUrl(state.form.imageUrl) ? state.form.imageUrl : '';
  $('#pPhotoFile').value = '';
  $('#pPriceNote').hidden = !editing;
  $('#productFormError').hidden = true;
  setPhotoPreview(state.form.imageUrl ? imageSrc(state.form.imageUrl) : '');
  updatePriceVisibility();
  $('#productDialog').showModal();
  $('#pName').focus();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen. Probá con una foto JPG o PNG.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Achica la foto a 1200 px de lado como máximo y la comprime (WebP, o JPG si no hay WebP).
async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo elegido no es una imagen.');
  if (file.size > 20 * 1024 * 1024) throw new Error('La foto es demasiado pesada. Elegí una de menos de 20 MB.');
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    source = await loadImage(file);
  }
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const scale = Math.min(1, 1200 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  if (!blob) throw new Error('No se pudo procesar la foto.');
  if (blob.size > 5 * 1024 * 1024) throw new Error('La imagen supera los 5 MB incluso comprimida. Probá con otra.');
  return blob;
}

async function uploadImage(blob, productId) {
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `productos/${productId}-${Date.now()}.${extension}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function productFormError(message) {
  const box = $('#productFormError');
  box.textContent = message;
  box.hidden = !message;
  if (message) box.scrollIntoView({ block: 'nearest' });
}

function initProductForm() {
  const dialog = $('#productDialog');
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  dialog.addEventListener('close', () => {
    if (state.form?.previewUrl) URL.revokeObjectURL(state.form.previewUrl);
  });
  $('#pWhatsappOnly').addEventListener('change', updatePriceVisibility);

  $('#pPhotoFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    productFormError('');
    $('#pPhotoPreview').innerHTML = '<span class="muted">Procesando foto…</span>';
    try {
      const blob = await compressImage(file);
      if (state.form.previewUrl) URL.revokeObjectURL(state.form.previewUrl);
      state.form.blob = blob;
      state.form.previewUrl = URL.createObjectURL(blob);
      $('#pPhotoUrl').value = '';
      setPhotoPreview(state.form.previewUrl);
    } catch (error) {
      productFormError(error.message);
      setPhotoPreview(state.form.imageUrl ? imageSrc(state.form.imageUrl) : '');
      event.target.value = '';
    }
  });

  $('#pPhotoUrl').addEventListener('change', () => {
    const url = $('#pPhotoUrl').value.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) {
      productFormError('La dirección de la imagen tiene que empezar con https://');
      return;
    }
    productFormError('');
    state.form.blob = null;
    state.form.imageUrl = url;
    setPhotoPreview(url);
  });

  $('#pPhotoRemove').addEventListener('click', () => {
    state.form.blob = null;
    state.form.imageUrl = '';
    $('#pPhotoUrl').value = '';
    $('#pPhotoFile').value = '';
    setPhotoPreview('');
  });

  $('#productForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = state.form;
    const name = $('#pName').value.trim();
    const whatsappOnly = $('#pWhatsappOnly').checked;
    const priceText = $('#pPrice').value.trim();
    const price = Number(priceText);

    if (!name) {
      productFormError('El nombre es obligatorio.');
      $('#pName').focus();
      return;
    }
    if (!whatsappOnly && (!/^\d+$/.test(priceText) || price <= 0)) {
      productFormError('El precio tiene que ser un número entero mayor a 0 (sin puntos ni centavos).');
      $('#pPrice').focus();
      return;
    }

    const saveButton = $('#productSave');
    setBusy(saveButton, true, 'Guardando…');
    productFormError('');
    const previousImage = form.original?.image_url || '';
    try {
      const id = form.id || uniqueProductId(name);
      let imageUrl = form.imageUrl || null;
      if (form.blob) imageUrl = await uploadImage(form.blob, id);

      const fields = {
        name,
        description: $('#pDescription').value.trim(),
        category: $('#pCategory').value,
        stock_status: $('#pStock').value,
        whatsapp_only: whatsappOnly,
        badge: $('#pBadge').value.trim() || null,
        active: $('#pActive').checked,
        image_url: imageUrl,
      };

      if (!form.id) {
        // Nuevo producto (o copia): va al final de la lista.
        const maxOrder = Math.max(0, ...[...state.products, ...state.trash].map((product) => product.sort_order || 0));
        const { error } = await sb.from('products').insert({
          id, ...fields, price: whatsappOnly ? 0 : price, sort_order: maxOrder + 10,
        });
        if (error) throw error;
        toast('Producto creado.', 'success');
      } else {
        await updateProduct(id, fields);
        // El precio SIEMPRE pasa por admin_update_prices (queda en el historial).
        if (!whatsappOnly && price !== form.original.price) {
          const { error } = await sb.rpc('admin_update_prices', {
            p_product_ids: [id], p_mode: 'monto', p_value: price - form.original.price, p_rounding: 0,
          });
          if (error) throw error;
        }
        toast('Cambios guardados.', 'success');
        if (previousImage && previousImage !== imageUrl) await deleteImageIfUnused(previousImage);
      }
      $('#productDialog').close();
      await loadProducts();
    } catch (error) {
      productFormError(friendlyError(error));
    } finally {
      setBusy(saveButton, false);
    }
  });
}

// ---------- Precios en lote ----------
function priceCandidates() {
  const scope = $('#priceScope').value;
  return state.products.filter((product) => !product.whatsapp_only && product.price > 0 && (!scope || product.category === scope));
}

// Misma cuenta que hace admin_update_prices en la base (para la vista previa).
function computeNewPrice(oldPrice, mode, value, rounding) {
  let next = mode === 'porcentaje' ? (oldPrice * (100 + value)) / 100 : oldPrice + value;
  next = rounding > 0 ? Math.round(next / rounding) * rounding : Math.round(next);
  return next;
}

function readPriceForm() {
  const raw = Number(String($('#priceValue').value).replace(',', '.'));
  return {
    mode: $('#priceMode').value,
    value: Number.isFinite(raw) ? raw * Number($('#priceDirection').value) : NaN,
    rounding: Number($('#priceRounding').value),
  };
}

function renderPricePreview() {
  const { mode, value, rounding } = readPriceForm();
  const products = priceCandidates();
  const box = $('#pricePreview');
  if (!products.length) {
    box.innerHTML = '<p class="empty">No hay productos con precio en esa categoría.</p>';
    return;
  }
  if (!value) {
    box.innerHTML = `<p class="muted">${products.length} producto${products.length === 1 ? '' : 's'}. Escribí un valor para ver la vista previa.</p>`;
    return;
  }
  box.innerHTML = `
    <table class="preview-table">
      <thead><tr><th>Producto</th><th>Actual</th><th>Nuevo</th></tr></thead>
      <tbody>${products.map((product) => {
        const next = computeNewPrice(product.price, mode, value, rounding);
        return `<tr class="${next < 1 ? 'is-invalid' : ''}"><td>${esc(product.name)}</td><td>${money(product.price)}</td><td><strong>${next < 1 ? 'inválido' : money(next)}</strong></td></tr>`;
      }).join('')}</tbody>
    </table>`;
}

async function loadPriceHistory() {
  const { data, error } = await sb.from('price_history')
    .select('batch_id, product_id, old_price, new_price, changed_at, undone_at, products(name)')
    .order('changed_at', { ascending: false })
    .limit(150);
  if (error) {
    $('#priceHistory').innerHTML = `<p class="form-error">${esc(friendlyError(error))}</p>`;
    return;
  }
  const batches = [];
  data.forEach((row) => {
    let batch = batches.find((entry) => entry.id === row.batch_id);
    if (!batch) {
      batch = { id: row.batch_id, at: row.changed_at, undone: Boolean(row.undone_at), rows: [] };
      batches.push(batch);
    }
    batch.rows.push(row);
  });
  const last = batches.find((batch) => !batch.undone);
  state.lastBatchId = last?.id || null;
  $('#undoPrices').hidden = !last;
  $('#priceHistory').innerHTML = batches.length ? batches.slice(0, 15).map((batch) => `
    <div class="history-batch${batch.undone ? ' is-undone' : ''}">
      <strong>${esc(new Date(batch.at).toLocaleString('es-AR'))}</strong> ${batch.undone ? '<span class="pill pill-muted">deshecha</span>' : ''}
      <ul>${batch.rows.map((row) => `<li>${esc(row.products?.name || row.product_id)}: ${money(row.old_price)} → ${money(row.new_price)}</li>`).join('')}</ul>
    </div>`).join('') : '<p class="muted">Todavía no hubo cambios de precio.</p>';
}

function openPriceDialog() {
  $('#priceValue').value = '';
  $('#priceFormError').hidden = true;
  renderPricePreview();
  loadPriceHistory();
  $('#priceDialog').showModal();
}

function initPriceDialog() {
  ['#priceScope', '#priceDirection', '#priceMode', '#priceValue', '#priceRounding'].forEach((selector) => {
    $(selector).addEventListener('input', renderPricePreview);
  });

  $('#priceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const { mode, value, rounding } = readPriceForm();
    const products = priceCandidates();
    const errorBox = $('#priceFormError');
    const fail = (message) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
    };
    if (!products.length) return fail('No hay productos para actualizar.');
    if (!value || !Number.isFinite(value)) return fail('Escribí un valor mayor a 0.');
    if (mode === 'porcentaje' && value <= -100) return fail('El descuento no puede ser del 100 % o más.');
    if (products.some((product) => computeNewPrice(product.price, mode, value, rounding) < 1)) {
      return fail('Algún precio quedaría en $0 o menos. Revisá el valor.');
    }
    errorBox.hidden = true;

    const answer = await confirmDialog({
      title: 'Confirmar actualización',
      message: `Se van a cambiar ${products.length} precio${products.length === 1 ? '' : 's'}. Después lo podés deshacer.`,
      confirmLabel: 'Aplicar',
    });
    if (answer !== 'confirm') return;

    const button = $('#priceApply');
    setBusy(button, true, 'Aplicando…');
    const { data, error } = await sb.rpc('admin_update_prices', {
      p_product_ids: products.map((product) => product.id),
      p_mode: mode,
      p_value: value,
      p_rounding: rounding,
    });
    setBusy(button, false);
    if (error) return fail(friendlyError(error));
    toast(`Listo: ${data?.cambios?.length || 0} precio(s) actualizados.`, 'success');
    $('#priceValue').value = '';
    await loadProducts();
    renderPricePreview();
    loadPriceHistory();
  });

  $('#undoPrices').addEventListener('click', async () => {
    if (!state.lastBatchId) return;
    const answer = await confirmDialog({
      title: 'Deshacer última actualización',
      message: 'Los productos vuelven al precio que tenían antes del último cambio.',
      confirmLabel: 'Deshacer',
      danger: true,
    });
    if (answer !== 'confirm') return;
    const { data, error } = await sb.rpc('admin_undo_price_batch', { p_batch_id: state.lastBatchId });
    if (error) {
      toast(friendlyError(error), 'error');
      return;
    }
    toast(`Se restauraron ${data?.revertidos?.length || 0} precio(s).`, 'success');
    await loadProducts();
    renderPricePreview();
    loadPriceHistory();
  });
}

// ---------------------------------------------------------------------
// AJUSTES
// ---------------------------------------------------------------------
function renderSettings() {
  $('#farmName').value = state.campo.nombre || '';
  $('#farmLat').value = state.campo.lat ?? '';
  $('#farmLng').value = state.campo.lng ?? '';
  $('#businessName').value = state.businessName;
  $('#whatsappNumber').value = state.whatsapp;
  renderZones();
}

function renderZones() {
  $('#zoneTable').innerHTML = `
    <div class="zone-row zone-head" aria-hidden="true"><span>Zona</span><span>Grupo</span><span>Latitud</span><span>Longitud</span><span></span></div>
    ${state.zones.map((zone) => `
      <form class="zone-row" data-zone="${esc(zone.name)}" novalidate>
        <input type="text" name="name" value="${esc(zone.name)}" maxlength="60" aria-label="Nombre de la zona" required />
        <input type="text" name="group" value="${esc(zone.group_name)}" list="zoneGroups" maxlength="60" aria-label="Grupo de ${esc(zone.name)}" />
        <input type="number" name="lat" value="${zone.lat ?? ''}" step="any" aria-label="Latitud de ${esc(zone.name)}" />
        <input type="number" name="lng" value="${zone.lng ?? ''}" step="any" aria-label="Longitud de ${esc(zone.name)}" />
        <span class="inline-actions">
          <button class="btn btn-secondary btn-small" type="submit">Guardar</button>
          <button class="btn btn-danger-ghost btn-small" type="button" data-remove-zone>Quitar</button>
        </span>
      </form>`).join('')}`;
}

function parseCoordinate(value, limit) {
  if (String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || Math.abs(number) > limit) throw new Error('Coordenada inválida.');
  return number;
}

async function upsertSetting(key, value) {
  const { error } = await sb.from('settings').upsert({ key, value });
  if (error) throw error;
}

function initSettings() {
  $('#farmForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const campo = {
        nombre: $('#farmName').value.trim() || 'Granja',
        lat: parseCoordinate($('#farmLat').value, 90),
        lng: parseCoordinate($('#farmLng').value, 180),
      };
      if (campo.lat === null || campo.lng === null) throw new Error('Completá latitud y longitud.');
      await upsertSetting('campo', campo);
      state.campo = campo;
      refreshOrderViews();
      toast('Ubicación guardada.', 'success');
    } catch (error) {
      toast(friendlyError(error), 'error');
    }
  });

  $('#useMyLocation').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast('Este dispositivo no permite leer la ubicación.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      $('#farmLat').value = position.coords.latitude.toFixed(5);
      $('#farmLng').value = position.coords.longitude.toFixed(5);
      toast('Ubicación cargada. Tocá "Guardar ubicación".', 'info');
    }, () => toast('No se pudo obtener la ubicación (¿permiso denegado?).', 'error'), { enableHighAccuracy: true, timeout: 15000 });
  });

  $('#businessForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const number = $('#whatsappNumber').value.replace(/\D/g, '');
    const name = $('#businessName').value.trim();
    if (number.length < 10 || number.length > 15) {
      toast('El WhatsApp tiene que tener código de país y área, por ejemplo 5491176254150.', 'error', 6000);
      return;
    }
    try {
      await upsertSetting('whatsapp_number', number);
      await upsertSetting('business_name', name || 'La Pastoril');
      state.whatsapp = number;
      state.businessName = name || 'La Pastoril';
      toast('Datos guardados. La tienda usa el nuevo número desde la próxima visita.', 'success');
    } catch (error) {
      toast(friendlyError(error), 'error');
    }
  });

  $('#passwordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#newPassword').value;
    if (password.length < 8) {
      toast('La contraseña tiene que tener al menos 8 caracteres.', 'error');
      return;
    }
    if (password !== $('#repeatPassword').value) {
      toast('Las contraseñas no coinciden.', 'error');
      return;
    }
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      toast(friendlyError(error), 'error');
      return;
    }
    event.target.reset();
    toast('Contraseña cambiada.', 'success');
  });

  $('#zoneTable').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target.closest('form[data-zone]');
    if (!form) return;
    try {
      const name = form.elements.name.value.trim();
      if (!name) throw new Error('La zona necesita un nombre.');
      const changes = {
        name,
        group_name: form.elements.group.value.trim() || 'Otras',
        lat: parseCoordinate(form.elements.lat.value, 90),
        lng: parseCoordinate(form.elements.lng.value, 180),
      };
      // Si cambia el nombre, los pedidos viejos se actualizan solos (on update cascade).
      const { data, error } = await sb.from('zones').update(changes).eq('name', form.dataset.zone).select().single();
      if (error) throw error;
      setZones(state.zones.map((zone) => (zone.name === form.dataset.zone ? data : zone)));
      renderZones();
      refreshOrderViews();
      toast('Zona guardada.', 'success', 2000);
    } catch (error) {
      toast(friendlyError(error), 'error');
    }
  });

  $('#zoneTable').addEventListener('click', async (event) => {
    if (!event.target.closest('[data-remove-zone]')) return;
    const name = event.target.closest('form[data-zone]').dataset.zone;
    const answer = await confirmDialog({
      title: `Quitar "${name}"`,
      message: 'Deja de aparecer en el carrito. Los pedidos viejos de esta zona quedan "sin zona".',
      confirmLabel: 'Quitar zona',
      danger: true,
    });
    if (answer !== 'confirm') return;
    const { error } = await sb.from('zones').delete().eq('name', name);
    if (error) {
      toast(friendlyError(error), 'error');
      return;
    }
    setZones(state.zones.filter((zone) => zone.name !== name));
    renderZones();
    loadOrders(false);
    toast('Zona quitada.', 'success', 2000);
  });

  $('#zoneAddForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const name = $('#zoneNewName').value.trim();
      if (!name) throw new Error('Escribí el nombre de la zona.');
      const row = {
        name,
        group_name: $('#zoneNewGroup').value.trim() || 'Otras',
        lat: parseCoordinate($('#zoneNewLat').value, 90),
        lng: parseCoordinate($('#zoneNewLng').value, 180),
        sort_order: Math.max(0, ...state.zones.filter((zone) => zone.name !== 'Otra').map((zone) => zone.sort_order || 0)) + 1,
      };
      const { data, error } = await sb.from('zones').insert(row).select().single();
      if (error) throw error;
      setZones([...state.zones, data].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es')));
      event.target.reset();
      renderZones();
      toast('Zona agregada.', 'success', 2000);
    } catch (error) {
      toast(friendlyError(error), 'error');
    }
  });
}

// ---------------------------------------------------------------------
// PWA: service worker (instalación y notificaciones)
// ---------------------------------------------------------------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch((error) => {
    console.warn('No se pudo registrar el service worker:', error);
  });
}

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Tema (automático, claro u oscuro) y atajos de teclado
// ---------------------------------------------------------------------
const THEMES = ['auto', 'dark', 'light'];
const THEME_LABELS = { auto: 'Tema automático (según el dispositivo)', dark: 'Tema oscuro', light: 'Tema claro' };

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const button = $('#themeToggle');
  button.querySelector('span[aria-hidden]').innerHTML = icon({ auto: 'theme-auto', dark: 'moon', light: 'sun' }[theme]);
  button.querySelector('.sr-only').textContent = `${THEME_LABELS[theme]}. Tocá para cambiar.`;
  button.title = THEME_LABELS[theme];
}

function currentThemeChoice() {
  const saved = readPref('lp-admin-theme');
  return THEMES.includes(saved) ? saved : 'auto';
}

function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentThemeChoice()) + 1) % THEMES.length];
  writePref('lp-admin-theme', next);
  applyTheme(next);
  toast(THEME_LABELS[next], 'info', 1800);
}

function initShortcuts() {
  const tabs = ['pedidos', 'estadisticas', 'resenas', 'productos', 'ajustes'];
  const dialog = $('#shortcutsDialog');
  $('#shortcutsButton').addEventListener('click', () => dialog.showModal());
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if ($('#panelView').hidden || document.querySelector('dialog[open]')) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) {
      if (event.key === 'Escape') target.blur();
      return;
    }
    const key = event.key.toLowerCase();
    if (/^[1-5]$/.test(key)) {
      showTab(tabs[Number(key) - 1]);
    } else if (key === '/') {
      event.preventDefault();
      if (state.activeTab === 'productos') {
        $('#productSearch').focus();
      } else {
        showTab('pedidos');
        $('#orderSearch').focus();
      }
    } else if (key === 'n') {
      showTab('productos');
      ensureProducts().then(() => openProductForm(null));
    } else if (key === 'r') {
      showTab('pedidos');
      openTodayRoute();
    } else if (key === 't') {
      cycleTheme();
    } else if (key === '?') {
      dialog.showModal();
    }
  });
}

async function boot() {
  applyTheme(currentThemeChoice());
  $('#themeToggle').addEventListener('click', cycleTheme);
  initShortcuts();
  registerServiceWorker();
  if (!sb) {
    showLogin('Falta configurar Supabase: completá SUPABASE_URL y SUPABASE_ANON_KEY en config.js (ver README).');
    $('#loginSubmit').disabled = true;
    return;
  }
  initAuth();
  initTabs();
  initOrders();
  initAlerts();
  initStats();
  initReviews();
  initProducts();
  initSettings();

  const { data } = await sb.auth.getSession();
  if (data.session?.user) await enterPanel(data.session.user);
  else showLogin();
}

boot();
