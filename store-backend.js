// Conexión de la tienda con Supabase: productos, zonas, reseñas aprobadas y pedidos.
// Si Supabase no está configurado o no responde, la tienda sigue funcionando
// con los datos locales de data/products.js y los pedidos quedan pendientes
// en el navegador para reintentarlos en la próxima visita.

const config = window.LP_CONFIG || {};
const PENDING_KEY = 'lapastoril-pending-orders';
const CATALOG_CACHE_KEY = 'lapastoril-catalog-cache';
const ZONES_CACHE_KEY = 'lapastoril-zones-cache';
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let client = null;

export function isConfigured() {
  return Boolean(
    window.supabase?.createClient
    && config.SUPABASE_URL
    && config.SUPABASE_ANON_KEY
    && !/TODO/i.test(`${config.SUPABASE_URL}${config.SUPABASE_ANON_KEY}`),
  );
}

function getClient() {
  if (client || !isConfigured()) return client;
  try {
    // La tienda no usa sesión: así nunca comparte la sesión del panel del dueño.
    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch (error) {
    console.warn('No se pudo iniciar Supabase:', error);
  }
  return client;
}

// Corta una consulta que tarda demasiado (las consultas de supabase-js son "thenables").
function withTimeout(query, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([Promise.resolve(query), timeout]).finally(() => window.clearTimeout(timer));
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`No se pudo guardar "${key}":`, error);
  }
}

async function select(query, ms) {
  const { data, error } = await withTimeout(query, ms);
  if (error) throw error;
  return data;
}

// ---------- Productos ----------
export function readCachedCatalog() {
  const cached = readJson(CATALOG_CACHE_KEY, null);
  return Array.isArray(cached) ? cached : null;
}

export async function fetchProducts(ms = 4000) {
  const sb = getClient();
  if (!sb) throw new Error('Supabase sin configurar');
  const rows = await select(
    sb.from('products')
      .select('id, name, description, category, price, image_url, badge, stock_status, whatsapp_only, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    ms,
  );
  writeJson(CATALOG_CACHE_KEY, rows);
  return rows;
}

// ---------- Zonas ----------
export function readCachedZones() {
  const cached = readJson(ZONES_CACHE_KEY, null);
  return Array.isArray(cached) ? cached : null;
}

export async function fetchZones(ms = 4000) {
  const sb = getClient();
  if (!sb) throw new Error('Supabase sin configurar');
  const rows = await select(
    sb.from('zones').select('name, group_name, sort_order').order('sort_order').order('name'),
    ms,
  );
  writeJson(ZONES_CACHE_KEY, rows);
  return rows;
}

// ---------- Reseñas aprobadas (vista pública: sin datos personales) ----------
export async function fetchApprovedReviews(limit = 12) {
  const sb = getClient();
  if (!sb) return [];
  return select(
    sb.from('public_reviews')
      .select('display_name, neighborhood, stars, comment')
      .order('created_at', { ascending: false })
      .limit(limit),
    6000,
  );
}

// ---------- Número de WhatsApp configurado en el panel ----------
export async function fetchWhatsAppNumber() {
  const sb = getClient();
  if (!sb) return null;
  const row = await select(sb.from('public_settings').select('value').eq('key', 'whatsapp_number').maybeSingle(), 4000);
  const value = String(row?.value ?? '').replace(/\D/g, '');
  return value.length >= 8 ? value : null;
}

// ---------- Pedidos ----------
// Devuelve { id } o lanza un error. error.permanent = true si el servidor
// rechazó el pedido (no tiene sentido reintentarlo).
export async function createOrder(payload, ms = 2500) {
  const sb = getClient();
  if (!sb) throw new Error('Supabase sin configurar');
  const { data, error } = await withTimeout(sb.rpc('create_order', payload), ms);
  if (error) {
    const failure = new Error(error.message || 'Error al registrar el pedido');
    failure.permanent = Boolean(error.code);
    throw failure;
  }
  if (!data?.id) throw new Error('Respuesta inesperada');
  return data;
}

function readPending() {
  const list = readJson(PENDING_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function savePendingOrder(entry) {
  const list = readPending().filter((item) => item.ref !== entry.ref);
  list.push(entry);
  writeJson(PENDING_KEY, list.slice(-10));
}

export function removePendingOrder(ref) {
  writeJson(PENDING_KEY, readPending().filter((item) => item.ref !== ref));
}

// Reintenta los pedidos que no se pudieron guardar en visitas anteriores.
// p_client_ref evita duplicados si el primer intento sí había llegado.
export async function retryPendingOrders() {
  if (!getClient()) return;
  const now = Date.now();
  for (const entry of readPending()) {
    if (!entry?.ref || !entry.payload || now - (entry.savedAt || 0) > PENDING_MAX_AGE_MS) {
      removePendingOrder(entry?.ref);
      continue;
    }
    try {
      const source = String(entry.payload.p_source || '');
      await createOrder({
        ...entry.payload,
        p_source: source.includes('reintento') ? source : `${source} (reintento)`.trim().slice(0, 160),
      }, 8000);
      removePendingOrder(entry.ref);
    } catch (error) {
      if (error.permanent) removePendingOrder(entry.ref);
      else break; // sin conexión: se intenta en la próxima visita
    }
  }
}
