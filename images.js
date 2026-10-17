import { images, legacyImages } from './data/products.js';

export const DEFAULT_IMAGE = 'imagenes/huevos-canasta-452.webp';

// Escapa texto que viene de la base de datos antes de insertarlo como HTML.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

// Devuelve el nombre de una foto local ("huevos-paja") o null si es una foto
// subida desde el panel (Supabase Storage) o una dirección externa.
export function imageName(path) {
  if (!path) return null;
  if (legacyImages[path]) return legacyImages[path];
  const match = /^imagenes\/([a-z0-9-]+?)-\d+\.(?:webp|avif)$/.exec(path);
  return match && images[match[1]] ? match[1] : null;
}

function closestWidth(widths, wanted) {
  return widths.find((width) => width >= wanted) || widths[widths.length - 1];
}

// Dirección de una sola imagen (para miniaturas, datos estructurados, etc.).
export function imageUrl(path, width = 960) {
  const name = imageName(path);
  if (!name) return path || DEFAULT_IMAGE;
  return `imagenes/${name}-${closestWidth(images[name].widths, width)}.webp`;
}

export function imageSrcset(name, format = 'webp') {
  return images[name].widths.map((width) => `imagenes/${name}-${width}.${format} ${width}w`).join(', ');
}

// <picture> con AVIF + WebP en varios tamaños, medidas fijas y carga diferida.
export function pictureMarkup(path, alt, { sizes = '100vw', className = '', eager = false } = {}) {
  const source = path || DEFAULT_IMAGE;
  const name = imageName(source);
  const loading = eager ? 'eager' : 'lazy';
  if (!name) {
    // Fotos subidas desde el panel: ya vienen achicadas y comprimidas.
    return `<img class="${className}" src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" loading="${loading}" decoding="async" />`;
  }
  const { width, height, widths } = images[name];
  const fallbackWidth = closestWidth(widths, 960);
  const fallbackHeight = Math.round((fallbackWidth * height) / width);
  return `<picture><source type="image/avif" srcset="${imageSrcset(name, 'avif')}" sizes="${sizes}" /><source type="image/webp" srcset="${imageSrcset(name, 'webp')}" sizes="${sizes}" /><img class="ph-${name} ${className}" src="imagenes/${name}-${fallbackWidth}.webp" alt="${escapeHtml(alt)}" width="${fallbackWidth}" height="${fallbackHeight}" loading="${loading}" decoding="async" /></picture>`;
}
