// Service worker de la tienda de La Pastoril.
// Guarda los archivos estáticos para que la tienda abra rápido y funcione sin conexión.
// No toca los pedidos ni las consultas a Supabase: eso siempre va directo a la red.

const VERSION = 'lp-tienda-v1'; // cambiar el número para forzar una limpieza completa
const SHELL = [
  './',
  'offline.html',
  'styles.css',
  'main.js',
  'app.js',
  'images.js',
  'cart.js',
  'catalog.js',
  'whatsapp.js',
  'nav.js',
  'theme.js',
  'cooking.js',
  'store-backend.js',
  'config.js',
  'data/products.js',
  'fuentes/karla-variable.woff2',
  'fuentes/arbutus-slab-400.woff2',
  'fuentes/zilla-slab-700.woff2',
  'favicon.svg',
  'imagenes/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // si algún archivo falla, la tienda funciona igual con conexión
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('lp-tienda-') && key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function save(request, response) {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, mapas, etc.: sin intermediarios
  // El panel tiene su propio service worker; la confirmación del cliente siempre va a la red.
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.slice(scopePath.length);
  if (/^(admin|pedido)\//.test(relativePath) || relativePath === 'sw.js') return;

  // Páginas: primero la red (siempre lo último); sin conexión, la copia guardada o la página offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => save(request, response))
        .catch(() => caches.match(request, { ignoreSearch: true })
          .then((cached) => cached || caches.match('offline.html'))),
    );
    return;
  }

  // Fotos y fuentes (nombre fijo, no cambian): primero la copia guardada.
  if (/\.(?:avif|webp|png|jpg|svg|woff2)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => save(request, response))),
    );
    return;
  }

  // Código y estilos: se responde con la copia y se actualiza por detrás para la próxima visita.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request, { cache: 'no-cache' }).then((response) => save(request, response));
      if (!cached) return fresh;
      fresh.catch(() => {});
      return cached;
    }),
  );
});
