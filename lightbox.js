// Visor de fotos de la galería. Se carga recién cuando alguien toca una foto.
// Flechas, ESC, deslizar con el dedo, pellizcar para ampliar y precarga de la siguiente.
import { imageName, imageSrcset } from './images.js';

const lightbox = document.getElementById('lightbox');
const stage = document.getElementById('lightboxStage');
const image = document.getElementById('lightboxImage');
const caption = document.getElementById('lightboxCaption');
const closeButton = document.getElementById('lightboxClose');
const MAX_SCALE = 4;

let items = [];
let index = 0;
let trigger = null;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
const pointers = new Map();
let gesture = null; // datos del gesto en curso (arrastre o pellizco)
let lastTap = 0;

function readItems() {
  return [...document.querySelectorAll('#galleryGrid .gallery-open img')].map((thumbnail) => ({
    name: imageName(thumbnail.getAttribute('src')),
    src: thumbnail.currentSrc || thumbnail.src,
    alt: thumbnail.alt,
  }));
}

function setSource(element, item) {
  if (item.name) {
    element.sizes = '100vw';
    element.srcset = imageSrcset(item.name, 'webp');
  } else {
    element.removeAttribute('srcset');
  }
  element.src = item.src;
}

function applyTransform(animated = false) {
  image.classList.toggle('is-settling', animated);
  image.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
  stage.style.cursor = scale > 1 ? 'grab' : '';
}

function resetZoom(animated = false) {
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  applyTransform(animated);
}

// Mantiene la foto ampliada dentro de la pantalla.
function clampOffsets() {
  const maxX = Math.max(0, (image.offsetWidth * scale - stage.clientWidth) / 2);
  const maxY = Math.max(0, (image.offsetHeight * scale - stage.clientHeight) / 2);
  offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
  offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
}

function show(nextIndex) {
  index = (nextIndex + items.length) % items.length;
  const item = items[index];
  resetZoom();
  setSource(image, item);
  image.alt = item.alt || 'Foto de La Pastoril';
  caption.textContent = `${item.alt} · ${index + 1} de ${items.length}`;
  // Precarga de la foto siguiente para que el cambio sea instantáneo.
  setSource(new Image(), items[(index + 1) % items.length]);
}

export function openLightbox(startIndex, openedBy) {
  items = readItems();
  if (!items.length) return;
  trigger = openedBy || document.activeElement;
  show(startIndex);
  lightbox.removeAttribute('inert');
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => closeButton.focus());
}

function closeLightbox() {
  if (!lightbox.classList.contains('open')) return;
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  lightbox.setAttribute('inert', '');
  document.body.classList.remove('modal-open');
  pointers.clear();
  gesture = null;
  if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
}

function pointerDistance() {
  const [first, second] = [...pointers.values()];
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function toggleZoom() {
  if (scale > 1) {
    resetZoom(true);
  } else {
    scale = 2.5;
    applyTransform(true);
  }
}

stage.addEventListener('pointerdown', (event) => {
  stage.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  image.classList.remove('is-settling');
  if (pointers.size === 2) {
    gesture = { type: 'pinch', distance: pointerDistance(), scale };
  } else if (pointers.size === 1) {
    gesture = { type: 'drag', startX: event.clientX, startY: event.clientY, offsetX, offsetY, moved: false };
  }
});

stage.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId) || !gesture) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (gesture.type === 'pinch' && pointers.size === 2) {
    scale = Math.min(MAX_SCALE, Math.max(1, gesture.scale * (pointerDistance() / gesture.distance)));
    clampOffsets();
    applyTransform();
    return;
  }
  if (gesture.type !== 'drag') return;
  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) gesture.moved = true;
  if (scale > 1) {
    // Con zoom: se mueve la foto.
    offsetX = gesture.offsetX + deltaX;
    offsetY = gesture.offsetY + deltaY;
    clampOffsets();
  } else {
    // Sin zoom: la foto acompaña al dedo para pasar a la siguiente.
    offsetX = deltaX;
  }
  applyTransform();
});

function endPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  const finished = gesture;
  if (pointers.size === 1 && finished?.type === 'pinch') {
    // Quedó un dedo: sigue como arrastre desde donde está.
    const [remaining] = [...pointers.values()];
    gesture = { type: 'drag', startX: remaining.x, startY: remaining.y, offsetX, offsetY, moved: true };
    return;
  }
  if (pointers.size > 0) return;
  gesture = null;
  if (!finished) return;
  if (finished.type === 'pinch') {
    if (scale < 1.05) resetZoom(true);
    return;
  }
  if (scale === 1) {
    const deltaX = event.clientX - finished.startX;
    if (Math.abs(deltaX) > 60) {
      show(index + (deltaX < 0 ? 1 : -1));
      return;
    }
    offsetX = 0;
    applyTransform(true);
  }
  if (!finished.moved) {
    // Doble toque (o doble clic) para ampliar; un toque afuera de la foto cierra.
    // (Con el puntero capturado, event.target siempre es el contenedor: se mira qué hay bajo el dedo.)
    const now = Date.now();
    const onImage = document.elementFromPoint(event.clientX, event.clientY) === image;
    if (onImage && now - lastTap < 320) toggleZoom();
    else if (!onImage && scale === 1) closeLightbox();
    lastTap = now;
  }
}

stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
// Rueda del mouse para ampliar en computadora.
stage.addEventListener('wheel', (event) => {
  event.preventDefault();
  scale = Math.min(MAX_SCALE, Math.max(1, scale * (event.deltaY < 0 ? 1.15 : 0.87)));
  if (scale === 1) {
    offsetX = 0;
    offsetY = 0;
  }
  clampOffsets();
  applyTransform();
}, { passive: false });

closeButton.addEventListener('click', closeLightbox);
document.getElementById('lightboxPrev').addEventListener('click', () => show(index - 1));
document.getElementById('lightboxNext').addEventListener('click', () => show(index + 1));
document.addEventListener('keydown', (event) => {
  if (!lightbox.classList.contains('open')) return;
  if (event.key === 'Escape') closeLightbox();
  else if (event.key === 'ArrowRight') show(index + 1);
  else if (event.key === 'ArrowLeft') show(index - 1);
});
