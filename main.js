// Arranque de la tienda. Primero se pinta la página (con la foto de portada); después se carga el código.
// Supabase (pedidos, productos, reseñas) se carga UNA sola vez y en paralelo: la
// interfaz no espera a que llegue, y los datos remotos aparecen apenas está listo.
const SUPABASE_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

function loadSupabase() {
  return new Promise((resolve) => {
    if (window.supabase?.createClient) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = SUPABASE_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.supabase?.createClient));
    script.onerror = () => resolve(false); // sin Supabase, la tienda usa los datos locales
    document.head.append(script);
  });
}

function start() {
  window.lpBackendReady = loadSupabase();
  import('./app.js');
  // El minijuego escondido se carga cuando el navegador está libre: no demora la tienda.
  const loadGame = () => import('./easter-eggs.js').then((module) => module.initEggGame());
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadGame, { timeout: 5000 });
  else window.setTimeout(loadGame, 2500);
}

// Prioridad a lo que se ve: el código arranca cuando la foto de portada ya se pintó
// (o a los 1,5 s como máximo, para que una conexión lenta no deje la tienda esperando).
function whenHeroIsPainted() {
  const hero = document.querySelector('.hero-photo img');
  const limit = new Promise((resolve) => { window.setTimeout(resolve, 1500); });
  const painted = new Promise((resolve) => {
    if (!hero) {
      resolve();
      return;
    }
    try {
      // El navegador avisa cuando la imagen principal quedó en pantalla.
      const observer = new PerformanceObserver((list) => {
        if (list.getEntries().some((entry) => entry.element === hero)) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (error) {
      // Navegadores sin esa medición: alcanza con que la foto esté decodificada.
      (typeof hero.decode === 'function' ? hero.decode() : Promise.resolve()).catch(() => {}).then(resolve);
    }
  });
  return Promise.race([painted, limit])
    .then(() => new Promise((resolve) => { requestAnimationFrame(() => window.setTimeout(resolve, 0)); }));
}

whenHeroIsPainted().then(start);
