// Efectos decorativos de la tienda: partículas del fondo, confeti y lluvia de huevos.
// Este módulo se carga recién cuando el navegador está libre (o cuando hace falta),
// y las partículas se detienen cuando la pestaña no está a la vista.

const EGG_SVG = '<svg viewBox="0 0 100 130" aria-hidden="true" focusable="false"><use href="#egg-art" /></svg>';
const FRAME_MS = 1000 / 30; // 30 cuadros por segundo alcanzan para un fondo sutil

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const currentTheme = () => document.documentElement.dataset.theme || 'day';

let context = null;
let particles = [];
let frame = 0;
let lastFrameTime = 0;
let started = false;

function resize() {
  const canvas = document.getElementById('fieldParticles');
  if (!canvas) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const night = currentTheme() === 'night';
  const mobile = width < 768;
  const count = night ? (mobile ? 12 : 28) : (mobile ? 8 : 18);
  particles = Array.from({ length: count }, () => {
    const layer = Math.floor(Math.random() * 3);
    return {
      x: Math.random() * width,
      y: night ? height * (0.45 + Math.random() * 0.55) : Math.random() * height,
      phase: Math.random() * Math.PI * 2,
      blinkSpeed: 0.6 + Math.random() * 2,
      size: [2.2, 1.5, 0.9][layer],
      drift: 0.25 + Math.random() * 0.5,
      opacity: 0.3 + Math.random() * 0.5,
    };
  });
  draw(performance.now());
}

function draw(time) {
  if (!context) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const night = currentTheme() === 'night';
  const still = reducedMotion();
  context.clearRect(0, 0, width, height);
  context.fillStyle = night ? '#f2e86d' : '#fffdf7';
  particles.forEach((particle) => {
    if (!night && !still) {
      particle.y -= particle.drift * 0.8;
      if (particle.y < -5) {
        particle.y = height + 5;
        particle.x = Math.random() * width;
      }
    }
    const sway = still ? 0 : Math.sin(time * 0.00025 * particle.drift + particle.phase) * (night ? 9 : 16);
    const blink = still ? 0.6 : 0.2 + 0.8 * Math.max(0, Math.sin(time * 0.001 * particle.blinkSpeed + particle.phase));
    context.globalAlpha = particle.opacity * blink;
    context.beginPath();
    context.arc(particle.x + sway, particle.y, particle.size, 0, Math.PI * 2);
    context.fill();
  });
  context.globalAlpha = 1;
}

function loop(time) {
  frame = 0;
  if (document.hidden) return;
  if (time - lastFrameTime >= FRAME_MS) {
    lastFrameTime = time;
    draw(time);
  }
  frame = window.requestAnimationFrame(loop);
}

function start() {
  if (frame || document.hidden || reducedMotion() || !context) return;
  frame = window.requestAnimationFrame(loop);
}

function stop() {
  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
}

export function initFieldParticles() {
  if (started) return;
  started = true;
  resize();
  start();
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 200);
  }, { passive: true });
  document.addEventListener('lp:theme', resize);
  // Pestaña oculta: no se dibuja nada.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
}

// Festejo cuando se desbloquea el regalo del carrito.
export function celebrate() {
  const layer = document.getElementById('featherConfetti');
  if (!layer || reducedMotion()) return;
  for (let index = 0; index < 24; index += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.innerHTML = EGG_SVG;
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty('--fall-duration', `${1.6 + Math.random() * 1.6}s`);
    piece.style.setProperty('--fall-delay', `${Math.random() * 0.5}s`);
    layer.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove(), { once: true });
  }
}

// Sorpresa escondida: lluvia de huevos que rebotan.
export function launchEggRain() {
  const layer = document.getElementById('eggRain');
  if (!layer || reducedMotion()) return;
  for (let index = 0; index < 30; index += 1) {
    const egg = document.createElement('span');
    egg.className = 'rain-egg';
    egg.innerHTML = EGG_SVG;
    egg.style.left = `${Math.random() * 100}%`;
    layer.appendChild(egg);
    let velocity = 0;
    let y = -60 - Math.random() * 400;
    let previous = performance.now();
    const fall = (now) => {
      const elapsed = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      velocity += 1400 * elapsed;
      y += velocity * elapsed;
      const floor = window.innerHeight - 45;
      if (y > floor) {
        y = floor;
        velocity *= -0.48;
        if (Math.abs(velocity) < 90) {
          egg.remove();
          return;
        }
      }
      egg.style.transform = `translateY(${y}px) rotate(${Math.sin(now / 160) * 6}deg)`;
      requestAnimationFrame(fall);
    };
    requestAnimationFrame(fall);
  }
}
