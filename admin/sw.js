// Service worker del panel de La Pastoril.
// Sirve para dos cosas: que el panel se pueda instalar como app (PWA) y
// mostrar notificaciones de pedidos nuevos mientras el panel está abierto.
// NO guarda datos de pedidos: solo los archivos de la interfaz.

const CACHE = 'lp-admin-v1'; // cambiar el número si hace falta forzar una actualización
const SHELL = [
  './',
  './index.html',
  './admin.css',
  './admin.js',
  './manifest.json',
  '../config.js',
  '../favicon.svg',
  '../imagenes/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // si algún archivo falla, el panel funciona igual con conexión
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Red primero (siempre la última versión); la copia guardada solo si no hay conexión.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase y fuentes: sin intermediarios

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || Response.error())),
  );
});

// Al tocar la notificación: abrir (o traer al frente) el panel en Pedidos.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('./#pedidos', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => client.url.startsWith(self.registration.scope));
      if (open) return open.focus();
      return self.clients.openWindow(target);
    }),
  );
});
