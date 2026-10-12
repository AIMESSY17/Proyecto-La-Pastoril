import { WHATSAPP_NUMBER } from './data/products.js';

// El número puede actualizarse desde el panel (Ajustes); si no carga, queda el local.
let whatsappNumber = WHATSAPP_NUMBER;

export function setWhatsAppNumber(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length >= 8) whatsappNumber = digits;
}

export function getWhatsAppNumber() {
  return whatsappNumber;
}

export function createWhatsAppUrl(message) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

// Consultas: intenta una pestaña nueva y, si el navegador la bloquea, navega en la misma.
export function openWhatsApp(message) {
  const url = createWhatsAppUrl(message);
  // Sin la opción "noopener": con ella window.open siempre devuelve null.
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  else window.location.href = url;
}

// Pedido: siempre en la misma pestaña (Safari y el navegador de Instagram
// bloquean window.open después de una espera asíncrona).
export function goToWhatsApp(message) {
  window.location.href = createWhatsAppUrl(message);
}

export function buildOrderMessage({ items, subtotal, name, zone, day, notes, period, formatMoney, orderId }) {
  const opening = {
    day: 'Hola, La Pastoril. Quiero hacer un pedido:',
    sunset: 'Buenas tardes, La Pastoril. Quiero coordinar un pedido para mañana:',
    night: 'Buenas noches, La Pastoril. Quiero dejar mi pedido para mañana:',
  }[period];
  const orderLine = orderId ? `\nPedido N° ${orderId}` : '';
  const noteText = notes ? `\nAclaraciones: ${notes}` : '';
  return `${opening}${orderLine}\n${items.map((item) => `• ${item.quantity}x ${item.name}`).join('\n')}\nTotal: ${formatMoney(subtotal)}\nNombre: ${name}\nZona: ${zone}\nDía preferido: ${day}${noteText}`;
}
