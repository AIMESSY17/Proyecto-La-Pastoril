import { WHATSAPP_NUMBER } from './data/products.js';

export function createWhatsAppUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(message) {
  window.open(createWhatsAppUrl(message), '_blank');
}

export function buildOrderMessage({ items, subtotal, name, zone, day, notes, period, formatMoney }) {
  const opening = {
    day: 'Hola, La Pastoril. Quiero hacer un pedido:',
    sunset: 'Buenas tardes, La Pastoril. Quiero coordinar un pedido para mañana:',
    night: 'Buenas noches, La Pastoril. Quiero dejar mi pedido para mañana:',
  }[period];
  const noteText = notes ? `\nAclaraciones: ${notes}` : '';
  return `${opening}\n${items.map((item) => `• ${item.quantity}x ${item.name}`).join('\n')}\nTotal estimado: ${formatMoney(subtotal)}\nNombre: ${name}\nZona: ${zone}\nDía preferido: ${day}${noteText}`;
}
