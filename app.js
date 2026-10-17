import { CART_THRESHOLD, fallbackZones, filterDefinitions, products as localProducts, STORAGE_KEYS } from './data/products.js';
import { initCooking } from './cooking.js';
import { persistCart, readStoredCart, reconcileCart } from './cart.js';
import { getFilteredProducts } from './catalog.js';
import { buildOrderMessage, createWhatsAppUrl, getWhatsAppNumber, goToWhatsApp, openWhatsApp, setWhatsAppNumber } from './whatsapp.js';
import { focusableWithin, initNavigation, initTabs, setActiveHash } from './nav.js';
import { restoreThemePreference } from './theme.js';
import { DEFAULT_IMAGE, escapeHtml, imageUrl, pictureMarkup } from './images.js';
import * as backend from './store-backend.js';

const STOCK_LABELS = { disponible: 'Disponible', pocos: 'Quedan pocos', agotado: 'Agotado' };
const ZONE_GROUP_ORDER = ['Cerca de la granja', 'Zona Sur', 'La Plata y alrededores', 'Otras'];
const MAX_QUANTITY = 50;
const CARD_SIZES = '(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw';

// Catálogo vigente: arranca vacío y se completa desde Supabase (o el respaldo local).
let products = [];
let catalogSource = 'none';

const state = {
  currentFilter: 'all',
  cart: readStoredCart(STORAGE_KEYS.cart),
  step: 1,
};
let cartOpenedAt = null;
let checkoutInFlight = false;
const trafficSource = detectTrafficSource();

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const $ = (id) => document.getElementById(id);
const catalogGrid = $('catalogGrid');
const catalogStatus = $('catalogStatus');
const filterChips = $('filterChips');
const cartDrawer = $('cartDrawer');
const cartOverlay = $('cartOverlay');
const cartItems = $('cartItems');
const cartCountMini = $('cartCountMini');
const cartTotalMini = $('cartTotalMini');
const cartNext = $('cartNext');
const cartBack = $('cartBack');
const cartFooterHint = $('cartFooterHint');
const checkoutButton = $('checkoutButton');
const customerName = $('customerName');
const customerZone = $('customerZone');
const deliveryDay = $('deliveryDay');
const customerNotes = $('customerNotes');
const customerPhone = $('customerPhone');
const customerConsent = $('customerConsent');
const customerWebsite = $('customerWebsite');
const rememberData = $('rememberData');
const zoneOtherHint = $('zoneOtherHint');
const checkoutError = $('checkoutError');
const storeNotice = $('storeNotice');
const promoText = $('promoText');
const promoProgress = $('promoProgress');
const subtotalValue = $('subtotalValue');
const totalValue = $('totalValue');
const miniCart = $('miniCart');
const repeatOrder = $('repeatOrder');
const loader = $('loader');
const timeGreeting = $('timeGreeting');
const cartToggle = $('cartToggle');
const lightbox = $('lightbox');
const peopleRange = $('peopleRange');
const daysRange = $('daysRange');
const catalogSearch = $('catalogSearch');
const catalogSort = $('catalogSort');
const zoneSelect = $('zoneSelect');
const zoneResult = $('zoneResult');
const nightToggle = $('nightToggle');
const productModal = $('productModal');
const eggMeter = document.querySelector('#eggMeter span');
const reviewsCarousel = $('reviewsCarousel');
let recommendedDozens = 1;
let bonusWasUnlocked = false;
let currentTheme = 'day';
let manualTheme = null;
let lastCartTrigger = null;
let lastProductTrigger = null;
let openProductId = null;

// ---------- Utilidades ----------
function formatMoney(value) {
  return currency.format(value);
}

function icon(name, extraClass = '') {
  return `<svg class="ico ${extraClass}" aria-hidden="true" focusable="false"><use href="#i-${name}" /></svg>`;
}

function debounce(callback, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), wait);
  };
}

function whenIdle(callback) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 3000 });
  else window.setTimeout(callback, 1200);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch (error) { /* sin almacenamiento: la tienda funciona igual */ }
}

function safeStorageRead(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeStorageWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) { /* sin almacenamiento */ }
}

function announce(message) {
  $('cartAnnouncement').textContent = message;
}

// Efectos decorativos (partículas, confeti): se cargan solo cuando hacen falta.
let effectsModule = null;
function loadEffects() {
  if (!effectsModule) effectsModule = import('./effects.js');
  return effectsModule;
}

// ---------- Avisos (con acción opcional, por ejemplo "Deshacer") ----------
let storeNoticeTimer = 0;
function showStoreNotice(message, { actionLabel = '', onAction = null, duration = 6000 } = {}) {
  window.clearTimeout(storeNoticeTimer);
  storeNotice.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  storeNotice.append(text);
  if (actionLabel && onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notice-action';
    button.textContent = actionLabel;
    button.addEventListener('click', () => {
      storeNotice.hidden = true;
      onAction();
    });
    storeNotice.append(button);
  }
  storeNotice.hidden = true;
  void storeNotice.offsetWidth; // reinicia la animación de entrada
  storeNotice.hidden = false;
  storeNoticeTimer = window.setTimeout(() => { storeNotice.hidden = true; }, duration);
}

// ---------- Catálogo ----------
function isSoldOut(product) {
  return product.stockStatus === 'agotado';
}

// "Quedan pocos" y "Agotado" salen del estado de stock que carga el dueño en el panel.
function stockInfo(product) {
  if (isSoldOut(product)) return { label: STOCK_LABELS.agotado, className: 'stock-agotado' };
  if (product.whatsappOnly) return { label: product.category === 'mayor' ? 'Por mayor' : 'Consultá', className: 'stock-info' };
  if (product.stockStatus === 'pocos') return { label: STOCK_LABELS.pocos, className: 'stock-pocos' };
  return null;
}

// Convierte una fila de Supabase al formato que usa la tienda.
function productFromRow(row) {
  const status = STOCK_LABELS[row.stock_status] ? row.stock_status : 'disponible';
  const whatsappOnly = Boolean(row.whatsapp_only);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || '',
    price: whatsappOnly ? 0 : Number(row.price) || 0,
    image: row.image_url || DEFAULT_IMAGE,
    badge: row.badge || '',
    stockStatus: status,
    whatsappOnly,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function findProduct(productId) {
  return products.find((entry) => entry.id === productId);
}

function useLocalCatalog() {
  products = localProducts.map((product) => ({ ...product }));
  catalogSource = 'local';
}

// La copia guardada del catálogo se muestra al instante (sin esperar a la red).
function showCachedCatalog() {
  const cached = backend.readCachedCatalog();
  if (!cached?.length) return;
  products = cached.map(productFromRow);
  catalogSource = 'cache';
  renderCatalog();
  syncCartWithCatalog(false);
}

// Después llega la versión al día desde Supabase (o el respaldo local si no responde).
async function loadCatalog() {
  let failed = false;
  try {
    const rows = await backend.fetchProducts();
    products = rows.map(productFromRow);
    catalogSource = 'remote';
  } catch (error) {
    failed = backend.isConfigured();
    if (catalogSource !== 'cache') useLocalCatalog();
  }
  renderCatalog();
  // Aviso simple si no se pudo actualizar: se sigue comprando con la última copia.
  catalogStatus.classList.toggle('sr-only', !failed);
  catalogStatus.classList.toggle('catalog-status-visible', failed);
  catalogStatus.textContent = failed
    ? 'No pudimos actualizar el catálogo. Te mostramos la última versión guardada; los precios se confirman por WhatsApp.'
    : '';
  updateProductStructuredData();
  syncCartWithCatalog(catalogSource === 'remote');
  openProductFromUrl();
}

function syncCartWithCatalog(authoritative) {
  const { cart, removed } = reconcileCart(state.cart, products, authoritative);
  state.cart = cart;
  persistCart(state.cart, STORAGE_KEYS.cart);
  bonusWasUnlocked = cartSubtotal() >= CART_THRESHOLD;
  renderCart();
  refreshAllCardControls();
  if (removed.length === 1) {
    showStoreNotice(`“${removed[0]}” ya no está disponible. Lo sacamos de tu pedido.`, { duration: 8000 });
  } else if (removed.length > 1) {
    showStoreNotice(`Estos productos ya no están disponibles y los sacamos de tu pedido: ${removed.join(', ')}.`, { duration: 9000 });
  }
}

function cartSubtotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function cartQuantity(productId) {
  return state.cart.find((item) => item.id === productId)?.quantity || 0;
}

// Origen de la visita: utm_source/utm_medium o el sitio que la trajo (se guarda el primero de la sesión).
function detectTrafficSource() {
  try {
    const saved = sessionStorage.getItem('lapastoril-source');
    if (saved) return saved;
  } catch (error) { /* sin sessionStorage: se calcula igual */ }
  const params = new URLSearchParams(window.location.search);
  let source = [params.get('utm_source'), params.get('utm_medium')].filter(Boolean).join(' / ');
  if (!source && document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.host !== window.location.host) source = referrer.hostname;
    } catch (error) { /* referrer inválido */ }
  }
  source = (source || 'directo').slice(0, 120);
  try {
    sessionStorage.setItem('lapastoril-source', source);
  } catch (error) { /* no importa */ }
  return source;
}

function trackEvent(name, props = {}) {
  if (typeof window.plausible === 'function') window.plausible(name, { props });
}

function storeUrl() {
  return new URL(window.location.pathname.replace(/index\.html$/i, ''), window.location.origin);
}

function updateProductStructuredData() {
  const canonicalUrl = storeUrl();
  $('canonicalUrl').href = canonicalUrl.href;
  $('openGraphUrl').content = canonicalUrl.href;
  const socialImage = new URL('imagenes/og-la-pastoril.jpg', canonicalUrl).href;
  $('openGraphImage').content = socialImage;
  $('twitterImage').content = socialImage;

  const schemaElement = $('businessSchema');
  const schema = JSON.parse(schemaElement.textContent);
  schema.url = canonicalUrl.href;
  schema.image = socialImage;
  schema.telephone = `+${getWhatsAppNumber()}`;
  schema.hasOfferCatalog = {
    '@type': 'OfferCatalog',
    name: 'Huevos de campo',
    itemListElement: products
      .filter((product) => !product.whatsappOnly && product.price > 0)
      .map((product) => ({
        '@type': 'Offer',
        price: product.price,
        priceCurrency: 'ARS',
        availability: isSoldOut(product) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        itemOffered: {
          '@type': 'Product',
          name: product.name,
          description: product.description,
          image: new URL(imageUrl(product.image, 960), document.baseURI).href,
        },
      })),
  };
  schemaElement.textContent = JSON.stringify(schema);
}

function timePeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 7 && hour < 18) return 'day';
  if (hour >= 18 && hour < 20) return 'sunset';
  return 'night';
}

function updateTimeAwareCopy(period = timePeriod()) {
  const greetings = {
    day: 'Buen día. Huevos recién puestos, del campo a tu mesa.',
    sunset: 'Buenas tardes. Todavía llegás a pedir para mañana.',
    night: 'Buenas noches. El gallinero duerme: pedí ahora y mañana te lo llevamos.',
  };
  const checkoutLabels = {
    day: 'Enviar pedido por WhatsApp',
    sunset: 'Coordinar entrega por WhatsApp',
    night: 'Pedir para mañana por WhatsApp',
  };
  if (timeGreeting) timeGreeting.textContent = greetings[period];
  if (!checkoutInFlight) checkoutButton.textContent = checkoutLabels[period];
  $('whatsAppFab').setAttribute('aria-label', period === 'night' ? 'Pedir para mañana por WhatsApp' : 'Enviar pedido por WhatsApp');

  const emptyTitle = cartItems.querySelector('.empty-cart p');
  const emptyHint = cartItems.querySelector('.empty-cart small');
  if (emptyTitle && emptyHint) {
    emptyTitle.textContent = period === 'night'
      ? 'Dejá tu pedido para mañana.'
      : period === 'sunset'
        ? 'Todavía llegás para mañana.'
        : 'Tu pedido está vacío.';
    emptyHint.textContent = 'Elegí tus huevos y coordinamos la entrega por WhatsApp.';
  }

  const subtotal = cartSubtotal();
  if (subtotal >= CART_THRESHOLD) {
    promoText.textContent = period === 'day'
      ? '¡Regalo desbloqueado! Te sumamos 6 huevitos de codorniz.'
      : '¡Regalo desbloqueado! Mañana te sumamos 6 huevitos de codorniz.';
  } else {
    promoText.textContent = `Sumá ${formatMoney(CART_THRESHOLD - subtotal)} más y te regalamos 6 huevitos de codorniz.`;
  }
}

function renderFilters() {
  filterChips.innerHTML = filterDefinitions
    .map((item) => `<button class="chip ${state.currentFilter === item.value ? 'active' : ''}" data-filter="${item.value}" type="button" aria-pressed="${state.currentFilter === item.value}">${item.label}</button>`)
    .join('');
}

// Botón "Agregar" o, si ya está en el pedido, el selector de cantidad.
function cardControlsMarkup(product) {
  const name = escapeHtml(product.name);
  if (isSoldOut(product)) return '<button class="add-button" type="button" disabled>Agotado</button>';
  if (product.whatsappOnly) return `<button class="add-button" type="button" data-add-product="${escapeHtml(product.id)}">Consultar</button>`;
  const quantity = cartQuantity(product.id);
  if (!quantity) return `<button class="add-button" type="button" data-add-product="${escapeHtml(product.id)}" aria-label="Agregar ${name} al pedido">Agregar</button>`;
  return `
    <div class="qty-box" role="group" aria-label="Cantidad de ${name}">
      <button class="minus-button" type="button" aria-label="Quitar uno">−</button>
      <span class="product-qty" aria-live="polite">${quantity}</span>
      <button class="plus-button" type="button" aria-label="Sumar uno"${quantity >= MAX_QUANTITY ? ' disabled' : ''}>+</button>
    </div>`;
}

function productCardMarkup(product) {
  const soldOut = isSoldOut(product);
  const stock = stockInfo(product);
  // El pack destacado ocupa dos columnas solo en el orden recomendado (ordenado por precio dejaría huecos).
  const featured = product.id === 'pack-familiar' && catalogSort.value === 'default';
  return `
    <article class="product-card ${featured ? 'product-card-featured' : ''} ${soldOut ? 'is-soldout' : ''}" data-id="${escapeHtml(product.id)}">
      <div class="product-card-inner">
        <button class="product-open" type="button" aria-label="Ver detalle de ${escapeHtml(product.name)}${soldOut ? ' (agotado)' : ''}">
          <span class="product-image">
            ${pictureMarkup(product.image, '', { sizes: featured ? '(min-width: 768px) 320px, 45vw' : CARD_SIZES })}
            ${product.badge ? `<span class="sticker">${escapeHtml(product.badge)}</span>` : ''}
            ${stock ? `<span class="stock-badge ${stock.className}">${escapeHtml(stock.label)}</span>` : ''}
          </span>
        </button>
        <div class="product-body">
          <div class="product-head">
            <h3>${escapeHtml(product.name)}</h3>
            <span class="price">${product.price ? formatMoney(product.price) : 'Consultá precio'}</span>
          </div>
          <p class="product-description">${escapeHtml(product.description)}</p>
          <div class="quantity-row" data-product-id="${escapeHtml(product.id)}">${cardControlsMarkup(product)}</div>
        </div>
      </div>
    </article>`;
}

function renderCatalog() {
  if (catalogSource === 'none') return; // siguen los esqueletos de carga
  const filteredProducts = getFilteredProducts(products, state.currentFilter, catalogSearch.value, catalogSort.value);
  catalogGrid.setAttribute('aria-busy', 'false');

  if (!filteredProducts.length) {
    const search = catalogSearch.value.trim();
    catalogGrid.innerHTML = `
      <div class="catalog-empty">
        <svg viewBox="0 0 100 130" aria-hidden="true" focusable="false"><use href="#egg-art" /></svg>
        <p>${search ? `No encontramos nada con “${escapeHtml(search)}”.` : 'No hay productos en esta categoría por ahora.'}</p>
        <small>Probá con otra palabra o mirá todo el catálogo.</small>
        <button class="secondary-button" type="button" data-clear-filters>Ver todos los productos</button>
      </div>`;
    return;
  }
  catalogGrid.innerHTML = filteredProducts.map(productCardMarkup).join('');
}

// Actualiza solo los botones de una tarjeta (no se repinta el catálogo entero).
function refreshCardControls(productId, justAdded = false) {
  const product = findProduct(productId);
  if (!product) return;
  catalogGrid.querySelectorAll('.quantity-row').forEach((row) => {
    if (row.dataset.productId !== productId) return;
    row.innerHTML = cardControlsMarkup(product);
    row.classList.toggle('is-added', justAdded);
  });
}

function refreshAllCardControls() {
  catalogGrid.querySelectorAll('.quantity-row').forEach((row) => {
    const product = findProduct(row.dataset.productId);
    if (product) row.innerHTML = cardControlsMarkup(product);
  });
}

// Búsqueda, orden y filtro se recuerdan al volver (durante la visita).
function saveCatalogView() {
  writeJson(sessionStorage, STORAGE_KEYS.catalogView, {
    filter: state.currentFilter,
    search: catalogSearch.value,
    sort: catalogSort.value,
  });
}

function restoreCatalogView() {
  const view = readJson(sessionStorage, STORAGE_KEYS.catalogView);
  if (!view) return;
  if (filterDefinitions.some((item) => item.value === view.filter)) state.currentFilter = view.filter;
  if (typeof view.search === 'string') catalogSearch.value = view.search.slice(0, 80);
  if (['default', 'asc', 'desc'].includes(view.sort)) catalogSort.value = view.sort;
}

function setFilter(value) {
  state.currentFilter = value;
  renderFilters();
  renderCatalog();
  saveCatalogView();
}

function initCatalogInteractions() {
  const onViewChange = () => {
    renderCatalog();
    saveCatalogView();
  };
  catalogSearch.addEventListener('input', debounce(onViewChange, 180));
  catalogSort.addEventListener('change', onViewChange);
  filterChips.addEventListener('click', (event) => {
    const chip = event.target instanceof Element ? event.target.closest('.chip') : null;
    if (chip) setFilter(chip.dataset.filter);
  });

  // Un solo listener para todo el catálogo.
  catalogGrid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-clear-filters]')) {
      catalogSearch.value = '';
      catalogSort.value = 'default';
      setFilter('all');
      return;
    }
    const card = event.target.closest('.product-card');
    if (!card || card.classList.contains('is-skeleton')) return;
    const productId = card.dataset.id;
    const button = event.target.closest('button');
    if (button?.matches('.minus-button, .plus-button')) {
      changeCartQuantity(productId, button.matches('.plus-button') ? 1 : -1);
      return;
    }
    if (button?.matches('.add-button')) {
      addProductToCart(productId, 1, card.querySelector('.product-image'));
      return;
    }
    if (event.target.closest('a, input, select')) return;
    const product = findProduct(productId);
    if (product) openProductModal(product);
  });

  document.addEventListener('click', (event) => {
    const jump = event.target instanceof Element ? event.target.closest('[data-filter-jump]') : null;
    if (!jump) return;
    setFilter(jump.dataset.filterJump);
    setActiveHash('#comprar');
    $('catalogSection').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

// ---------- Carrito ----------
function contactAboutProduct(product) {
  const greeting = { night: 'Buenas noches', sunset: 'Buenas tardes', day: 'Hola' }[timePeriod()];
  const opening = product.category === 'mayor'
    ? `${greeting}, La Pastoril. Quiero consultar por el pedido por mayor.`
    : `${greeting}, La Pastoril. Quiero consultar por: ${product.name}.`;
  trackEvent('click_whatsapp', { intent: product.category === 'mayor' ? 'wholesale' : 'inquiry' });
  openWhatsApp(opening);
}

function addProductToCart(productId, quantity = 1, sourceElement = null) {
  const product = findProduct(productId);
  if (!product) return;
  if (isSoldOut(product)) {
    announce(`${product.name} está agotado.`);
    return;
  }
  if (product.whatsappOnly) {
    contactAboutProduct(product);
    return;
  }

  const existing = state.cart.find((item) => item.id === product.id);
  if (existing) {
    existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity);
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: Math.min(MAX_QUANTITY, quantity),
      image: product.image,
    });
  }
  commitCart(product.id, true);
  animateEggToCart(sourceElement);
  announce(`Agregado: ${product.name}. Llevás ${cartCount()} en el pedido.`);
  if (!cartDrawer.classList.contains('open')) {
    showStoreNotice(`Agregado: ${product.name}`, { actionLabel: 'Ver pedido', onAction: () => openCart(), duration: 3200 });
  }
  trackEvent('add_to_cart', { product_id: product.id, quantity });
}

function changeCartQuantity(productId, delta) {
  const item = state.cart.find((entry) => entry.id === productId);
  if (!item) return;
  if (item.quantity + delta <= 0) {
    removeFromCart(productId);
    return;
  }
  item.quantity = Math.min(MAX_QUANTITY, item.quantity + delta);
  commitCart(productId);
}

// Quitar con posibilidad de deshacer.
function removeFromCart(productId) {
  const index = state.cart.findIndex((entry) => entry.id === productId);
  if (index === -1) return;
  const [removed] = state.cart.splice(index, 1);
  commitCart(productId);
  announce(`Quitaste ${removed.name} del pedido.`);
  showStoreNotice(`Quitaste ${removed.name}`, {
    actionLabel: 'Deshacer',
    duration: 7000,
    onAction: () => {
      if (state.cart.some((entry) => entry.id === removed.id)) return;
      state.cart.splice(Math.min(index, state.cart.length), 0, removed);
      commitCart(removed.id);
      announce(`${removed.name} volvió al pedido.`);
    },
  });
}

function commitCart(changedProductId, justAdded = false) {
  persistCart(state.cart, STORAGE_KEYS.cart);
  renderCart();
  if (changedProductId) refreshCardControls(changedProductId, justAdded);
}

function cartItemMarkup(item) {
  const name = escapeHtml(item.name);
  return `
    <div class="cart-item" data-id="${escapeHtml(item.id)}">
      <img class="cart-item-thumb" src="${escapeHtml(imageUrl(item.image, 160))}" alt="" width="64" height="64" loading="lazy" decoding="async" />
      <div class="cart-item-body">
        <h4>${name}</h4>
        <small>${formatMoney(item.price)} c/u</small>
        <div class="cart-item-actions">
          <div class="qty-box" role="group" aria-label="Cantidad de ${name}">
            <button class="minus-cart" type="button" aria-label="Quitar uno">−</button>
            <span aria-live="polite">${item.quantity}</span>
            <button class="plus-cart" type="button" aria-label="Sumar uno"${item.quantity >= MAX_QUANTITY ? ' disabled' : ''}>+</button>
          </div>
          <span class="cart-item-price">${formatMoney(item.price * item.quantity)}</span>
        </div>
      </div>
      <button class="cart-remove" type="button" aria-label="Quitar ${name} del pedido">${icon('trash')}</button>
    </div>`;
}

function renderCart() {
  const count = cartCount();
  const subtotal = cartSubtotal();

  cartItems.innerHTML = state.cart.length
    ? state.cart.map(cartItemMarkup).join('')
    : `<div class="empty-cart">
        <svg viewBox="0 0 100 130" aria-hidden="true" focusable="false"><use href="#egg-art" /></svg>
        <p></p><small></small>
        <button class="secondary-button" type="button" data-close-cart>Ver productos</button>
      </div>`;

  promoProgress.style.transform = `scaleX(${Math.min(1, subtotal / CART_THRESHOLD)})`;
  $('promoMeter').hidden = !state.cart.length;
  subtotalValue.textContent = formatMoney(subtotal);
  totalValue.textContent = formatMoney(subtotal);

  // Cantidad y total siempre a la vista: ícono de arriba y mini-carrito.
  if (cartCountMini.textContent !== String(count)) {
    cartCountMini.textContent = String(count);
    cartCountMini.classList.remove('is-bump');
    void cartCountMini.offsetWidth;
    cartCountMini.classList.add('is-bump');
  }
  cartToggle.setAttribute('aria-label', count ? `Abrir pedido: ${count} ${count === 1 ? 'producto' : 'productos'}, ${formatMoney(subtotal)}` : 'Abrir pedido (vacío)');
  cartToggle.classList.toggle('has-items', count > 0);
  cartTotalMini.hidden = count === 0;
  cartTotalMini.textContent = formatMoney(subtotal);
  $('miniCartCount').textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
  $('miniCartTotal').textContent = formatMoney(subtotal);
  miniCart.hidden = count === 0;
  document.body.classList.toggle('has-cart', count > 0);

  updateRepeatOrder();
  updateTimeAwareCopy();
  if (!state.cart.length && (state.step === 2 || state.step === 3)) goToStep(1, { focus: false });
  else updateStepUi();
  if (state.step === 3) renderOrderReview();

  if (subtotal >= CART_THRESHOLD && !bonusWasUnlocked) loadEffects().then((effects) => effects.celebrate());
  bonusWasUnlocked = subtotal >= CART_THRESHOLD;
}

function openCart() {
  if (!cartDrawer.classList.contains('open')) {
    lastCartTrigger = document.activeElement;
    trackEvent('open_cart');
  }
  // Se mide desde la primera apertura del carrito (antispam: un humano tarda más de 3 s).
  if (cartOpenedAt === null) cartOpenedAt = Date.now();
  storeNotice.hidden = true;
  cartDrawer.classList.add('open');
  cartOverlay.classList.add('visible');
  cartOverlay.setAttribute('aria-hidden', 'false');
  cartDrawer.removeAttribute('inert');
  cartDrawer.setAttribute('aria-hidden', 'false');
  cartToggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('cart-open');
  $('closeCart').focus();
}

function closeCart() {
  if (!cartDrawer.classList.contains('open')) return;
  cartDrawer.classList.remove('open');
  cartOverlay.classList.remove('visible');
  cartOverlay.setAttribute('aria-hidden', 'true');
  cartDrawer.setAttribute('aria-hidden', 'true');
  cartDrawer.setAttribute('inert', '');
  cartToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('cart-open');
  if (state.step === 'done') finishOrderDone();
  if (lastCartTrigger instanceof HTMLElement && lastCartTrigger.isConnected) lastCartTrigger.focus();
}

// ---------- Pasos del pedido: 1. Tu pedido · 2. Tus datos · 3. Enviar ----------
function updateStepUi() {
  const step = state.step;
  cartDrawer.classList.toggle('is-done', step === 'done');
  cartDrawer.querySelectorAll('.cart-step').forEach((section) => {
    section.hidden = section.dataset.step !== String(step);
  });
  cartDrawer.querySelectorAll('.cart-steps [data-step-go]').forEach((button) => {
    const number = Number(button.dataset.stepGo);
    if (number === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    button.classList.toggle('is-done', typeof step === 'number' && number < step);
    button.disabled = !state.cart.length && number > 1;
  });
  cartBack.hidden = step === 1 || step === 'done';
  cartNext.hidden = step === 3 || step === 'done';
  checkoutButton.hidden = step !== 3;
  cartNext.disabled = !state.cart.length;
  cartNext.textContent = step === 1 ? 'Continuar con mis datos' : 'Revisar y enviar';
  $('cartTitle').textContent = step === 'done' ? 'Pedido enviado' : 'Tu pedido';
  if (step !== 3) cartFooterHint.hidden = true;
}

function goToStep(step, { focus = true } = {}) {
  if (step !== 1 && step !== 'done' && !state.cart.length) return false;
  if (step === 3 && !validateCustomerData()) {
    state.step = 2;
    updateStepUi();
    return false;
  }
  state.step = step;
  if (step === 3) renderOrderReview();
  updateStepUi();
  $('cartBody').scrollTop = 0;
  if (focus && cartDrawer.classList.contains('open')) {
    if (step === 2 && !customerName.value) customerName.focus();
    else $('cartTitle').focus();
  }
  return true;
}

function renderOrderReview() {
  const notes = customerNotes.value.trim();
  $('orderReview').innerHTML = `
    <h3>Revisá tu pedido</h3>
    <ul class="review-items">
      ${state.cart.map((item) => `<li><span>${item.quantity} × ${escapeHtml(item.name)}</span><span>${formatMoney(item.price * item.quantity)}</span></li>`).join('')}
    </ul>
    <dl class="review-data">
      <div><dt>Nombre</dt><dd>${escapeHtml(customerName.value.trim())}</dd></div>
      <div><dt>Zona</dt><dd>${escapeHtml(customerZone.value)}</dd></div>
      <div><dt>Día</dt><dd>${escapeHtml(deliveryDay.value || 'A coordinar')}</dd></div>
      ${customerPhone.value.trim() ? `<div><dt>Teléfono</dt><dd>${escapeHtml(customerPhone.value.trim())}</dd></div>` : ''}
      ${notes ? `<div><dt>Aclaraciones</dt><dd>${escapeHtml(notes)}</dd></div>` : ''}
    </dl>
    <button class="link-button" type="button" data-step-go="2">Cambiar mis datos</button>`;
}

function buildWhatsAppMessage(orderId) {
  return buildOrderMessage({
    items: state.cart,
    subtotal: cartSubtotal(), // sin costo de envío: el total es la suma de productos
    name: customerName.value.trim() || 'Sin nombre',
    zone: customerZone.value.trim() || 'Sin zona',
    day: deliveryDay.value || 'A confirmar',
    notes: customerNotes.value.trim(),
    period: timePeriod(),
    formatMoney,
    orderId,
  });
}

// ---------- Zonas del carrito (select agrupado) ----------
function renderZoneOptions(zones) {
  const selected = customerZone.value || customerZone.dataset.pending || '';
  const groups = new Map();
  zones.forEach((zone) => {
    const group = zone.group_name || 'Otras';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(zone.name);
  });
  const orderedGroups = [...groups.keys()].sort((first, second) => {
    const a = ZONE_GROUP_ORDER.indexOf(first);
    const b = ZONE_GROUP_ORDER.indexOf(second);
    return (a === -1 ? 50 : a) - (b === -1 ? 50 : b);
  });
  customerZone.innerHTML = '<option value="">Elegí tu zona</option>' + orderedGroups
    .map((group) => `<optgroup label="${escapeHtml(group)}">${groups.get(group)
      .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}</optgroup>`)
    .join('');
  if (selected && zones.some((zone) => zone.name === selected)) customerZone.value = selected;
  updateZoneHint();
}

function updateZoneHint() {
  zoneOtherHint.hidden = customerZone.value !== 'Otra';
}

async function loadZones() {
  try {
    renderZoneOptions(await backend.fetchZones());
  } catch (error) { /* quedan las zonas guardadas o las de respaldo */ }
}

// ---------- Validación en línea ----------
const FIELD_RULES = [
  [customerName, (field) => (field.value.trim() ? '' : 'Decinos tu nombre, así sabemos a quién llevarle el pedido.')],
  [customerZone, (field) => (field.value ? '' : 'Elegí tu zona para coordinar la entrega.')],
  [customerPhone, (field) => {
    const digits = field.value.replace(/\D/g, '');
    return field.value.trim() === '' || (digits.length >= 8 && digits.length <= 15) ? '' : 'Revisá el teléfono: con código de área, entre 8 y 15 números.';
  }],
];

function showFieldError(field, message) {
  const error = $(`${field.id}Error`);
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
}

function validateField(field) {
  const rule = FIELD_RULES.find(([ruleField]) => ruleField === field);
  const message = rule ? rule[1](field) : '';
  showFieldError(field, message);
  return message;
}

function validateCustomerData() {
  let firstInvalid = null;
  FIELD_RULES.forEach(([field]) => {
    if (validateField(field) && !firstInvalid) firstInvalid = field;
  });
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

// Aviso discreto de lo que falta antes de enviar.
function validateCheckout() {
  checkoutError.hidden = true;
  if (!state.cart.length) {
    goToStep(1);
    return false;
  }
  if (!validateCustomerData()) {
    state.step = 2;
    updateStepUi();
    return false;
  }
  if (!customerConsent.checked) {
    customerConsent.setAttribute('aria-invalid', 'true');
    cartFooterHint.textContent = 'Falta un paso: tildá que aceptás la política de privacidad.';
    cartFooterHint.hidden = false;
    customerConsent.focus();
    return false;
  }
  cartFooterHint.hidden = true;
  return true;
}

function setCheckoutBusy(busy) {
  checkoutButton.disabled = busy;
  checkoutButton.setAttribute('aria-busy', String(busy));
  if (busy) checkoutButton.textContent = 'Registrando tu pedido…';
  else updateTimeAwareCopy();
}

// ---------- Datos recordados y último pedido (solo en este dispositivo) ----------
function restoreCustomerData() {
  const saved = readJson(localStorage, STORAGE_KEYS.customer);
  if (!saved) return;
  customerName.value = String(saved.name || '').slice(0, 80);
  customerPhone.value = String(saved.phone || '').slice(0, 30);
  if (saved.day) deliveryDay.value = saved.day;
  customerZone.dataset.pending = String(saved.zone || ''); // se aplica cuando cargan las zonas
  rememberData.checked = true;
}

function saveCustomerData() {
  writeJson(localStorage, STORAGE_KEYS.customer, rememberData.checked
    ? { name: customerName.value.trim(), zone: customerZone.value, phone: customerPhone.value.trim(), day: deliveryDay.value }
    : null);
}

function updateRepeatOrder() {
  const last = readJson(localStorage, STORAGE_KEYS.lastOrder);
  const usable = Array.isArray(last?.items) && last.items.length > 0 && !state.cart.length && state.step !== 'done';
  repeatOrder.hidden = !usable;
  if (!usable) return;
  $('repeatOrderDetail').textContent = last.items.map((item) => `${item.quantity} × ${item.name}`).join(', ');
}

function repeatLastOrder() {
  const last = readJson(localStorage, STORAGE_KEYS.lastOrder);
  if (!Array.isArray(last?.items)) return;
  const missing = [];
  last.items.forEach((item) => {
    const product = findProduct(item.id);
    if (!product || isSoldOut(product) || product.whatsappOnly) {
      missing.push(item.name);
      return;
    }
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: Math.min(MAX_QUANTITY, Math.max(1, Number(item.quantity) || 1)),
      image: product.image,
    });
  });
  commitCart();
  refreshAllCardControls();
  if (missing.length) {
    showStoreNotice(`Hoy no tenemos: ${missing.join(', ')}. Armamos el pedido con el resto.`, { duration: 8000 });
  } else {
    announce('Listo: cargamos tu último pedido con los precios de hoy.');
  }
}

// ---------- Envío ----------
// Registra el pedido en Supabase (máximo 2,5 s) y abre WhatsApp con el número de pedido.
async function handleCheckout() {
  if (checkoutInFlight || !validateCheckout()) return;
  checkoutInFlight = true;
  setCheckoutBusy(true);

  const clientRef = `LP-T-${Date.now()}`;
  const payload = {
    p_name: customerName.value.trim().slice(0, 80),
    p_phone: customerPhone.value.trim().slice(0, 30) || null,
    p_zone: customerZone.value,
    p_day: deliveryDay.value || null,
    p_notes: customerNotes.value.trim().slice(0, 500) || null,
    p_items: state.cart.map((item) => ({ id: item.id, quantity: item.quantity })),
    p_source: trafficSource,
    p_consent: customerConsent.checked,
    p_hp: customerWebsite.value,
    p_elapsed_ms: cartOpenedAt === null ? 0 : Math.min(Date.now() - cartOpenedAt, 2147483647),
    p_client_ref: clientRef,
  };

  // Primero queda guardado en el navegador; si el registro funciona, se borra.
  backend.savePendingOrder({ ref: clientRef, payload, savedAt: Date.now() });
  let orderId = clientRef;
  try {
    const result = await backend.createOrder(payload, 2500);
    orderId = result.id;
    backend.removePendingOrder(clientRef);
  } catch (error) {
    // El pedido sale igual por WhatsApp con un número temporal.
    if (error.permanent) backend.removePendingOrder(clientRef);
  }

  const message = buildWhatsAppMessage(orderId);
  trackEvent('click_whatsapp', { intent: 'checkout' });
  saveCustomerData();
  writeJson(localStorage, STORAGE_KEYS.lastOrder, {
    id: orderId,
    date: Date.now(),
    items: state.cart.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity })),
  });
  // Al volver de WhatsApp (o si no se abrió) se ve la confirmación con el número.
  writeJson(sessionStorage, STORAGE_KEYS.orderDone, { id: orderId, message });

  // El pedido ya salió: vaciamos el carrito para no mandarlo dos veces.
  state.cart = [];
  persistCart(state.cart, STORAGE_KEYS.cart);
  customerNotes.value = '';
  customerConsent.checked = false;
  showOrderDone();
  refreshAllCardControls();
  goToWhatsApp(message);

  window.setTimeout(() => {
    checkoutInFlight = false;
    setCheckoutBusy(false);
  }, 1500);
}

function showOrderDone() {
  const done = readJson(sessionStorage, STORAGE_KEYS.orderDone);
  if (!done?.id) return false;
  const temporary = String(done.id).startsWith('LP-T-');
  $('doneOrderLabel').textContent = temporary
    ? 'Tu pedido quedó armado. El número te lo confirmamos por WhatsApp.'
    : 'Tu número de pedido es';
  $('doneOrderId').textContent = temporary ? '' : done.id;
  state.step = 'done';
  renderCart();
  return true;
}

function finishOrderDone() {
  writeJson(sessionStorage, STORAGE_KEYS.orderDone, null);
  state.step = 1;
  renderCart();
}

// ---------- Reseñas aprobadas en "Clientes" ----------
function starsMarkup(count) {
  return `<span class="stars" role="img" aria-label="${count} ${count === 1 ? 'estrella' : 'estrellas'}">${'<svg class="ico"><use href="#i-star" /></svg>'.repeat(count)}</span>`;
}

async function loadApprovedReviews() {
  try {
    const reviews = await backend.fetchApprovedReviews();
    if (!reviews?.length) return; // sin reseñas reales: quedan las de respaldo
    reviewsCarousel.innerHTML = reviews.map((review) => {
      const stars = Math.min(5, Math.max(1, Number(review.stars) || 5));
      const author = [review.display_name, review.neighborhood].filter(Boolean).map(escapeHtml).join(', ');
      return `
            <article class="review-card">
              ${starsMarkup(stars)}
              ${review.comment ? `<p>“${escapeHtml(review.comment)}”</p>` : ''}
              <strong>— ${author || 'Cliente de La Pastoril'}</strong>
            </article>`;
    }).join('');
    document.querySelectorAll('#clientes .review-disclaimer').forEach((note, index) => {
      if (index > 0) note.hidden = true; // ya no son ilustrativas
    });
  } catch (error) { /* quedan las reseñas de respaldo */ }
}

async function loadWhatsAppNumber() {
  try {
    const number = await backend.fetchWhatsAppNumber();
    if (number) {
      setWhatsAppNumber(number);
      updateProductStructuredData();
    }
  } catch (error) { /* queda el número local */ }
}

// Supabase se carga aparte (main.js) para no demorar la página. Los datos remotos
// lo esperan hasta 6 segundos; si llega más tarde, se actualizan en ese momento.
async function loadRemoteData() {
  const fetchAll = () => {
    loadCatalog();
    loadZones();
    loadApprovedReviews();
    loadWhatsAppNumber();
    // Pedidos que no se pudieron registrar en visitas anteriores.
    window.setTimeout(() => backend.retryPendingOrders().catch(() => {}), 3000);
  };
  const ready = Promise.resolve(window.lpBackendReady);
  const result = await Promise.race([ready, new Promise((resolve) => { window.setTimeout(() => resolve('timeout'), 6000); })]);
  fetchAll();
  if (result === 'timeout') ready.then((loaded) => { if (loaded) fetchAll(); });
}

function initCheckoutForm() {
  customerZone.addEventListener('change', () => {
    updateZoneHint();
    validateField(customerZone);
  });
  [customerName, customerPhone].forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.hasAttribute('aria-invalid')) validateField(field);
    });
  });
  customerConsent.addEventListener('change', () => {
    customerConsent.removeAttribute('aria-invalid');
    cartFooterHint.hidden = true;
  });
  rememberData.addEventListener('change', () => {
    if (!rememberData.checked) writeJson(localStorage, STORAGE_KEYS.customer, null);
  });
}

function initLoader() {
  if (!loader) return; // ya se vio en esta sesión
  const finish = () => {
    loader.remove();
    try {
      sessionStorage.setItem('lapastoril-loader-seen', 'true');
    } catch (error) { /* sin sessionStorage: se vuelve a mostrar en la próxima carga */ }
  };
  // La secuencia entera es CSS; cuando termina la revelación circular se saca del DOM.
  loader.addEventListener('animationend', (event) => {
    if (event.target === loader) finish();
  });
  window.setTimeout(finish, 2700);
}

// ---------- Galería: el visor se carga recién cuando se usa ----------
function initGallery() {
  const grid = $('galleryGrid');
  let lightboxModule = null;
  const load = () => {
    if (!lightboxModule) lightboxModule = import('./lightbox.js');
    return lightboxModule;
  };
  grid.addEventListener('pointerenter', load, { once: true, capture: true });
  grid.addEventListener('focusin', load, { once: true });
  grid.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('.gallery-open') : null;
    if (!trigger) return;
    load().then((module) => module.openLightbox(Number(trigger.dataset.galleryIndex) || 0, trigger));
  });
}

function initAccordions() {
  const setOpen = (item, open) => {
    const trigger = item.querySelector('.accordion-trigger');
    const content = item.querySelector('.accordion-content');
    item.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    content.toggleAttribute('inert', !open);
    const indicator = trigger.querySelector('span');
    if (indicator) indicator.textContent = open ? '−' : '+';
  };
  document.querySelectorAll('.accordion-item').forEach((item, index) => {
    const trigger = item.querySelector('.accordion-trigger');
    const content = item.querySelector('.accordion-content');
    if (!trigger || !content) return;
    trigger.id = `accordion-trigger-${index + 1}`;
    content.id = `accordion-content-${index + 1}`;
    trigger.setAttribute('aria-controls', content.id);
    content.setAttribute('role', 'region');
    content.setAttribute('aria-labelledby', trigger.id);
    setOpen(item, item.classList.contains('open'));
  });
  // Un listener para todos los acordeones: abrir uno cierra los demás de su grupo.
  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('.accordion-trigger') : null;
    if (!trigger) return;
    const item = trigger.closest('.accordion-item');
    const wasOpen = item.classList.contains('open');
    [...item.parentElement.children].forEach((sibling) => {
      if (sibling.classList.contains('accordion-item')) setOpen(sibling, false);
    });
    if (!wasOpen) setOpen(item, true);
  });
}

function initRecommendations() {
  const updateRecommendation = () => {
    const people = Number(peopleRange.value);
    const days = Number(daysRange.value);
    recommendedDozens = Math.ceil((people * days * 1.5) / 12);
    $('peopleValue').textContent = `${people} ${people === 1 ? 'persona' : 'personas'}`;
    $('daysValue').textContent = `${days} ${days === 1 ? 'día' : 'días'} por semana`;
    $('packRecommendation').textContent = `Te conviene ${recommendedDozens} ${recommendedDozens === 1 ? 'docena' : 'docenas'} por semana.`;
  };
  peopleRange.addEventListener('input', updateRecommendation);
  daysRange.addEventListener('input', updateRecommendation);
  updateRecommendation();

  $('addRecommendedPack').addEventListener('click', () => {
    const product = findProduct('docena-gallina');
    if (!product || isSoldOut(product)) {
      showStoreNotice('La docena no está disponible ahora. Mirá las otras opciones en el catálogo.');
      return;
    }
    addProductToCart(product.id, recommendedDozens);
  });
}

function contactWhatsApp() {
  const emptyMessages = {
    day: 'Hola, La Pastoril. Quiero consultar por los huevos disponibles.',
    sunset: 'Buenas tardes, La Pastoril. Quiero coordinar un pedido para mañana.',
    night: 'Buenas noches, La Pastoril. Quiero dejar un pedido para mañana.',
  };
  // Con productos elegidos conviene terminar el pedido (así queda registrado con número).
  if (state.cart.length) {
    openCart();
    return;
  }
  trackEvent('click_whatsapp', { intent: 'inquiry' });
  openWhatsApp(emptyMessages[timePeriod()]);
}

function trapFocus(event) {
  const activeDialog = [lightbox, productModal, cartDrawer].find((dialog) => dialog.classList.contains('open'));
  if (!activeDialog) return;
  const focusable = focusableWithin(activeDialog);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (!activeDialog.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function initCartActions() {
  $('closeCart').addEventListener('click', closeCart);
  cartToggle.addEventListener('click', openCart);
  miniCart.addEventListener('click', openCart);
  cartOverlay.addEventListener('click', closeCart);
  checkoutButton.addEventListener('click', handleCheckout);
  cartNext.addEventListener('click', () => goToStep(state.step === 1 ? 2 : 3));
  cartBack.addEventListener('click', () => goToStep(state.step === 3 ? 2 : 1));
  repeatOrder.addEventListener('click', repeatLastOrder);
  $('doneClose').addEventListener('click', closeCart);
  $('doneWhatsApp').addEventListener('click', () => {
    const done = readJson(sessionStorage, STORAGE_KEYS.orderDone);
    if (done?.message) goToWhatsApp(done.message);
  });
  $('whatsAppFab').addEventListener('click', contactWhatsApp);
  $('whatsAppDesktop').addEventListener('click', contactWhatsApp);

  // Un solo listener para todo el carrito.
  cartDrawer.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const stepButton = event.target.closest('[data-step-go]');
    if (stepButton) {
      goToStep(Number(stepButton.dataset.stepGo));
      return;
    }
    if (event.target.closest('[data-close-cart]')) {
      closeCart();
      return;
    }
    const row = event.target.closest('.cart-item');
    if (!row) return;
    if (event.target.closest('.cart-remove')) removeFromCart(row.dataset.id);
    else if (event.target.closest('.plus-cart')) changeCartQuantity(row.dataset.id, 1);
    else if (event.target.closest('.minus-cart')) changeCartQuantity(row.dataset.id, -1);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.classList.contains('open')) {
      if (productModal.classList.contains('open')) closeProductModal();
      else closeCart();
    }
    if (event.key === 'Tab') trapFocus(event);
  });

  // Al volver de WhatsApp con el botón Atrás, se muestra la confirmación.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && showOrderDone()) openCart();
  });
}

function initZones() {
  zoneSelect.addEventListener('change', () => {
    const zone = zoneSelect.value;
    if (!zone) return;
    const other = zone === 'Otro';
    const text = other ? 'Consultanos igual, capaz llegamos.' : `¡Sí! Llegamos a ${zone}. Coordinamos el día por WhatsApp.`;
    const message = other
      ? '¡Hola La Pastoril! Quería consultar si llegan a mi barrio.'
      : `¡Hola La Pastoril! ¿Llegan a ${zone}? Quisiera coordinar un día de entrega.`;
    trackEvent('zone_check', { zone });
    zoneResult.innerHTML = `<p>${escapeHtml(text)}</p><a class="zone-whatsapp" href="${escapeHtml(createWhatsAppUrl(message))}" target="_blank" rel="noopener noreferrer">${icon('chat')} Coordinar por WhatsApp</a>`;
  });
}

function initCounterAnimations() {
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const element = entry.target;
      const isRating = element.hasAttribute('data-rating');
      const target = Number(isRating ? element.dataset.rating : element.dataset.counter);
      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - start) / 800);
        const value = target * progress;
        element.textContent = isRating ? value.toFixed(1) : String(Math.round(value));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.35 });
  document.querySelectorAll('[data-counter], [data-rating]').forEach((element) => observer.observe(element));
}

// ---------- Detalle de producto (con enlace directo y compartir) ----------
function productUrl(product) {
  const url = storeUrl();
  url.searchParams.set('producto', product.id);
  return url.href;
}

function setProductInUrl(productId) {
  const url = new URL(window.location.href);
  if (productId) url.searchParams.set('producto', productId);
  else url.searchParams.delete('producto');
  window.history.replaceState(null, '', url);
}

function openProductFromUrl() {
  const productId = new URLSearchParams(window.location.search).get('producto');
  if (!productId || productModal.classList.contains('open')) return;
  const product = findProduct(productId);
  if (product) {
    if (window.location.hash && window.location.hash !== '#comprar') setActiveHash('#comprar');
    openProductModal(product);
  } else if (catalogSource === 'remote') {
    setProductInUrl(null);
    showStoreNotice('Ese producto ya no está en el catálogo. Mirá lo que tenemos hoy.');
  }
}

async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      trackEvent('share', { method: 'native' });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return; // la persona cerró el menú de compartir
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showStoreNotice('Link copiado. Pegalo donde quieras compartirlo.');
  } catch (error) {
    window.prompt('Copiá este link para compartir:', url);
  }
  trackEvent('share', { method: 'copy' });
}

function openProductModal(product, imageIndex = 0) {
  const gallery = [...new Set([product.image, ...products.filter((entry) => entry.category === product.category && entry.image !== product.image).map((entry) => entry.image)])].slice(0, 3);
  const currentImage = gallery[imageIndex] || product.image;
  const soldOut = isSoldOut(product);
  const stock = stockInfo(product);
  const inCart = cartQuantity(product.id);
  const addLabel = soldOut ? 'Agotado por ahora' : product.whatsappOnly ? 'Consultar por WhatsApp' : inCart ? `Agregar otro (llevás ${inCart})` : 'Agregar al pedido';
  productModal.innerHTML = `
    <article class="product-detail" role="dialog" aria-modal="true" aria-labelledby="productDetailTitle">
      <button class="product-detail-close" type="button" aria-label="Cerrar detalle">${icon('close')}</button>
      <div class="product-detail-gallery">
        ${pictureMarkup(currentImage, product.name, { sizes: '(min-width: 768px) 440px, 100vw', className: 'product-detail-main', eager: true })}
        ${gallery.length > 1 ? `<div class="product-thumbnails">${gallery.map((image, index) => `<button type="button" class="${image === currentImage ? 'active' : ''}" data-image-index="${index}" aria-label="Ver foto ${index + 1}"><img src="${escapeHtml(imageUrl(image, 160))}" alt="" width="56" height="56" loading="lazy" decoding="async" /></button>`).join('')}</div>` : ''}
      </div>
      <div class="product-detail-copy">
        ${product.badge ? `<span class="section-kicker">${escapeHtml(product.badge)}</span>` : ''}
        <h2 id="productDetailTitle" tabindex="-1">${escapeHtml(product.name)}</h2>
        <p class="product-detail-price"><strong class="price">${product.price ? formatMoney(product.price) : 'Consultá precio'}</strong>${stock ? `<span class="stock-badge ${stock.className}">${escapeHtml(stock.label)}</span>` : ''}</p>
        <p>${escapeHtml(product.description)}</p>
        <p>Cada lote se junta a mano, de gallinas criadas a campo abierto. La entrega se coordina por WhatsApp.</p>
        <div class="product-detail-actions">
          <button class="primary-button product-detail-add" type="button"${soldOut ? ' disabled' : ''}>${addLabel}</button>
          <button class="ghost-button product-detail-share" type="button" aria-label="Compartir ${escapeHtml(product.name)}">${icon('share')} Compartir</button>
        </div>
      </div>
    </article>`;
  if (!productModal.classList.contains('open')) lastProductTrigger = document.activeElement;
  openProductId = product.id;
  storeNotice.hidden = true;
  productModal.removeAttribute('inert');
  productModal.classList.add('open');
  productModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setProductInUrl(product.id);
  requestAnimationFrame(() => {
    if (productModal.classList.contains('open')) productModal.querySelector('.product-detail-close').focus();
  });
}

function closeProductModal() {
  if (!productModal.classList.contains('open')) return;
  productModal.classList.remove('open');
  productModal.setAttribute('aria-hidden', 'true');
  productModal.setAttribute('inert', '');
  document.body.classList.remove('modal-open');
  openProductId = null;
  setProductInUrl(null);
  if (lastProductTrigger instanceof HTMLElement && lastProductTrigger.isConnected) lastProductTrigger.focus();
}

function initProductModal() {
  productModal.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const product = findProduct(openProductId);
    if (event.target === productModal || event.target.closest('.product-detail-close')) {
      closeProductModal();
      return;
    }
    if (!product) return;
    const thumbnail = event.target.closest('[data-image-index]');
    if (thumbnail) {
      openProductModal(product, Number(thumbnail.dataset.imageIndex));
    } else if (event.target.closest('.product-detail-add')) {
      const source = productModal.querySelector('.product-detail-main');
      addProductToCart(product.id, 1, source);
      closeProductModal();
    } else if (event.target.closest('.product-detail-share')) {
      shareLink({
        title: `${product.name} · La Pastoril`,
        text: `Mirá esto de La Pastoril: ${product.name}`,
        url: productUrl(product),
      });
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-share-store]')) {
      shareLink({
        title: 'La Pastoril – Huevos de campo',
        text: 'Huevos de campo de gallina y codorniz en Zona Sur. Se piden por WhatsApp.',
        url: storeUrl().href,
      });
    }
  });
}

// Un huevito vuela desde la foto hasta el carrito (solo transform y opacity, 300 ms).
function animateEggToCart(source) {
  if (!(source instanceof Element) || prefersReducedMotion() || typeof source.animate !== 'function') return;
  const miniCartIcon = miniCart.querySelector('.mini-cart-icon');
  const destination = miniCartIcon.getClientRects().length ? miniCartIcon : cartToggle;
  const start = source.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  const fromX = start.left + start.width / 2;
  const fromY = start.top + start.height / 2;
  const egg = document.createElement('span');
  egg.className = 'flying-egg';
  egg.innerHTML = '<svg viewBox="0 0 100 130" aria-hidden="true" focusable="false"><use href="#egg-art" /></svg>';
  egg.style.left = `${fromX}px`;
  egg.style.top = `${fromY}px`;
  document.body.appendChild(egg);
  const deltaX = end.left + end.width / 2 - fromX;
  const deltaY = end.top + end.height / 2 - fromY;
  egg.animate([
    { transform: 'translate(0, 0) scale(1.2)', opacity: 1 },
    { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.5 - 40}px) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${deltaX}px, ${deltaY}px) scale(.4)`, opacity: 0.2 },
  ], { duration: 300, easing: 'cubic-bezier(.3, 0, .6, 1)' }).finished.finally(() => egg.remove());
}

// ---------- Tema (día, atardecer, noche) ----------
function setFieldTheme(theme) {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  nightToggle.setAttribute('aria-pressed', String(theme === 'night'));
  nightToggle.setAttribute('aria-label', theme === 'night' ? 'Activar modo día' : 'Activar modo noche');
  document.querySelector('meta[name="theme-color"]').content = theme === 'night' ? '#0a1410' : '#f4ebd6';
  updateTimeAwareCopy();
  document.dispatchEvent(new CustomEvent('lp:theme', { detail: theme }));
}

function initNightMode() {
  const theme = restoreThemePreference(safeStorageRead, STORAGE_KEYS, timePeriod);
  manualTheme = theme.manualTheme;
  setFieldTheme(theme.initialTheme);
  nightToggle.addEventListener('click', () => {
    manualTheme = currentTheme === 'night' ? 'day' : 'night';
    safeStorageWrite(STORAGE_KEYS.theme, manualTheme);
    safeStorageWrite(STORAGE_KEYS.legacyNight, String(manualTheme === 'night'));
    setFieldTheme(manualTheme);
  });
  window.setInterval(() => {
    if (document.hidden) return;
    updateTimeAwareCopy();
    if (!manualTheme && timePeriod() !== currentTheme) setFieldTheme(timePeriod());
  }, 60000);
}

function initScrollMeter() {
  let scheduled = false;
  const update = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    eggMeter.style.transform = `scaleY(${maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0})`;
    scheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function initEasterEggs() {
  let logoClickCount = 0;
  let lastLogoClick = 0;
  document.querySelector('.brand').addEventListener('click', () => {
    const now = Date.now();
    logoClickCount = now - lastLogoClick > 1800 ? 1 : logoClickCount + 1;
    lastLogoClick = now;
    if (logoClickCount >= 7) {
      logoClickCount = 0;
      loadEffects().then((effects) => effects.launchEggRain());
    }
  });
  const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let position = 0;
  document.addEventListener('keydown', (event) => {
    if (event.key === sequence[position]) position += 1;
    else position = event.key === sequence[0] ? 1 : 0;
    if (position === sequence.length) {
      position = 0;
      document.body.classList.toggle('yolk-mode');
    }
  });
}

let revealObserver = null;
function initRevealEffects() {
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) return;
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('revealed-item');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.1 });
  }
  document.querySelectorAll('.tab-panel.active :is(.chicken-card, .review-card, .story-card, .info-card, .tool-card, .gallery-item, .commitment-item, .timeline-item, .stat-item)').forEach((item, index) => {
    if (item.dataset.revealReady) return;
    item.dataset.revealReady = 'true';
    item.classList.add('reveal-item');
    item.style.setProperty('--reveal-delay', `${(index % 3) * 60}ms`);
    revealObserver.observe(item);
  });
}

// Las opiniones avanzan solas, pero solo si la sección está a la vista y nadie la está usando.
function initReviewsCarousel() {
  if (prefersReducedMotion()) return;
  let paused = false;
  ['pointerenter', 'focusin', 'touchstart'].forEach((type) => reviewsCarousel.addEventListener(type, () => { paused = true; }, { passive: true }));
  ['pointerleave', 'focusout'].forEach((type) => reviewsCarousel.addEventListener(type, () => { paused = false; }));
  window.setInterval(() => {
    if (paused || document.hidden || !$('clientes').classList.contains('active')) return;
    const card = reviewsCarousel.querySelector('.review-card');
    if (!card) return;
    const next = reviewsCarousel.scrollLeft + card.getBoundingClientRect().width + 16;
    const atEnd = next >= reviewsCarousel.scrollWidth - reviewsCarousel.clientWidth + 8;
    reviewsCarousel.scrollTo({ left: atEnd ? 0 : next, behavior: 'smooth' });
  }, 5000);
}

// Al cambiar de sección: animación de entrada suave y aparición de las tarjetas.
function onSectionChange() {
  const panel = document.querySelector('.tab-panel.active');
  if (panel) {
    panel.classList.remove('is-entering');
    void panel.offsetWidth;
    panel.classList.add('is-entering');
  }
  initRevealEffects();
}

function initCareAnimations() {
  const eggDemo = $('eggFloatDemo');
  const toggleFloat = () => {
    const floating = eggDemo.classList.toggle('float');
    eggDemo.setAttribute('aria-pressed', String(floating));
  };
  eggDemo.addEventListener('click', toggleFloat);
  eggDemo.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleFloat();
    }
  });
}

function initFooter() {
  $('footerYear').textContent = String(new Date().getFullYear());
  $('backToTop').addEventListener('click', (event) => {
    event.preventDefault();
    setActiveHash('#comprar');
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const register = () => navigator.serviceWorker.register('sw.js').catch(() => { /* la tienda funciona igual sin modo offline */ });
  // Este código arranca después de pintar la portada: la página puede haber terminado de cargar.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function init() {
  initNavigation(nightToggle);
  initNightMode();
  restoreCatalogView();
  restoreCustomerData();
  updateProductStructuredData();
  bonusWasUnlocked = cartSubtotal() >= CART_THRESHOLD;
  renderFilters();
  initCatalogInteractions();
  renderCart();
  initCheckoutForm();
  initCartActions();
  initProductModal();
  showCachedCatalog();
  renderZoneOptions(backend.readCachedZones() || fallbackZones);
  loadRemoteData();
  initTabs(onSectionChange);
  initLoader();
  initGallery();
  initAccordions();
  initCareAnimations();
  initCooking();
  initRecommendations();
  initZones();
  initCounterAnimations();
  initFooter();
  initScrollMeter();
  initEasterEggs();
  initReviewsCarousel();
  initRevealEffects();
  registerServiceWorker();
  if (showOrderDone()) openCart();
  // Partículas del fondo: decorativas, se cargan cuando el navegador está libre.
  whenIdle(() => loadEffects().then((effects) => effects.initFieldParticles()));
}

init();
