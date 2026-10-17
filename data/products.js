export const WHATSAPP_NUMBER = '5491176254150';
export const CART_THRESHOLD = 20000;
export const STORAGE_KEYS = Object.freeze({
  cart: 'lapastoril-cart',
  theme: 'lapastoril-theme',
  legacyNight: 'lapastoril-night',
  customer: 'lapastoril-customer',
  lastOrder: 'lapastoril-last-order',
  catalogView: 'lapastoril-catalog-view',
  orderDone: 'lapastoril-order-done',
});

// Fotos de la tienda. Cada una existe en WebP y AVIF, en los anchos indicados:
// imagenes/<nombre>-<ancho>.webp / .avif. El recorte (object-position) y el
// color de fondo mientras cargan están en styles.css (.ph-<nombre>).
export const images = Object.freeze({
  'huevos-mesa-madera': { width: 4153, height: 6240, widths: [480, 960, 1600] },
  'gallinas-aire-libre': { width: 3072, height: 4096, widths: [480, 960, 1600] },
  'quien-esta-detras': { width: 1536, height: 2048, widths: [480, 960, 1536] },
  'codorniz-puesto': { width: 3072, height: 4096, widths: [480, 960, 1600] },
  'granjero-gallinas': { width: 1536, height: 2048, widths: [480, 960, 1536] },
  'codorniz-packs': { width: 1206, height: 1608, widths: [480, 960, 1206] },
  'huevos-paja': { width: 740, height: 740, widths: [480, 740] },
  'huevos-canasta': { width: 452, height: 679, widths: [452] },
  'canasta-granero': { width: 360, height: 360, widths: [360] },
});

// Nombres viejos de las fotos (los que quedaron guardados en la base o en
// carritos anteriores) → nombre nuevo. Así ningún producto se queda sin foto.
export const legacyImages = Object.freeze({
  'imagenes/granja-campo.jpg': 'huevos-mesa-madera',
  'imagenes/huevos-maple.jpg': 'huevos-mesa-madera',
  'imagenes/pedido-listo.jpg': 'gallinas-aire-libre',
  'imagenes/packaging-campo.jpg': 'gallinas-aire-libre',
  'imagenes/maples-granja.jpg': 'gallinas-aire-libre',
  'imagenes/huevos-envase.jpg': 'gallinas-aire-libre',
  'imagenes/gallinas-cuidado.jpg': 'quien-esta-detras',
  'imagenes/maples-preparados.jpg': 'codorniz-puesto',
  'imagenes/codornices.jpg': 'granjero-gallinas',
  'imagenes/gallinas-campo.jpg': 'codorniz-packs',
  'imagenes/huevos-campo.jpg': 'codorniz-packs',
  'imagenes/huevos-vista-superior.jpg': 'huevos-paja',
  'imagenes/huevos-gallina.jpg': 'huevos-canasta',
  'imagenes/huevos-codorniz.jpg': 'canasta-granero',
});

// Catálogo de RESPALDO: se usa solo si Supabase no responde.
// Los productos reales se administran desde el panel (/admin → Productos).
export const products = [
  {
    id: 'maple-30',
    name: 'Huevos de campo – Maple 30',
    category: 'gallina',
    description: '30 huevos frescos del campo, ideales para familias que viven el desayuno en grande.',
    price: 9500,
    image: 'imagenes/huevos-mesa-madera-960.webp',
    badge: 'Recién puestos',
    qty: 1,
    stockStatus: 'pocos',
    sortOrder: 20,
  },
  {
    id: 'docena-gallina',
    name: 'Huevos de campo – Docena',
    category: 'gallina',
    description: 'La clásica docena para empezar bien el día con huevos de campo y sabor intenso.',
    price: 3800,
    image: 'imagenes/huevos-canasta-452.webp',
    badge: 'Frescos de hoy',
    qty: 1,
    stockStatus: 'disponible',
    sortOrder: 30,
  },
  {
    id: 'media-docena',
    name: 'Huevos de campo – Media docena',
    category: 'gallina',
    description: 'Perfecta para dos o para un desayuno con un toque de campo en la mesa.',
    price: 2000,
    image: 'imagenes/huevos-canasta-452.webp',
    badge: 'Edición campo',
    qty: 1,
    stockStatus: 'disponible',
    sortOrder: 40,
  },
  {
    id: 'codorniz-24',
    name: 'Huevos de codorniz – Pack x24',
    category: 'codorniz',
    description: 'Chiquitos, manchados y con un sabor único para picadas y desayunos de lujo.',
    price: 4200,
    image: 'imagenes/granjero-gallinas-960.webp',
    badge: 'Frescos del día',
    qty: 1,
    stockStatus: 'pocos',
    sortOrder: 50,
  },
  {
    id: 'codorniz-12',
    name: 'Huevos de codorniz – Pack x12',
    category: 'codorniz',
    description: 'Un pack perfecto para probar la intensidad de los huevos de codorniz.',
    price: 2300,
    image: 'imagenes/gallinas-aire-libre-960.webp',
    badge: 'Probalo',
    qty: 1,
    stockStatus: 'disponible',
    sortOrder: 60,
  },
  {
    id: 'pack-familiar',
    name: 'Pack Familiar: 2 maples + 1 pack codorniz',
    category: 'pack',
    description: 'La elección del día para familias que quieren variedad, sabor y buen momento.',
    price: 22000,
    image: 'imagenes/huevos-mesa-madera-960.webp',
    badge: 'Más pedido',
    qty: 1,
    stockStatus: 'disponible',
    sortOrder: 10,
  },
  {
    id: 'mayor',
    name: 'Pedido por mayor (cajones de 12 maples)',
    category: 'mayor',
    description: 'Pedilo por mayor y consultá el precio de la semana por WhatsApp.',
    price: 0,
    image: 'imagenes/codorniz-packs-960.webp',
    badge: 'Consultá precio',
    qty: 1,
    stockStatus: 'disponible',
    sortOrder: 80,
    whatsappOnly: true,
  },
  {
    id: 'degustacion',
    name: 'Pack Degustación: 6 gallina + 12 codorniz',
    category: 'pack',
    description: 'Un combo ideal para probar ambos tipos de huevo y armar una mesa distinta.',
    price: 4900,
    image: 'imagenes/codorniz-puesto-960.webp',
    badge: 'Probalo',
    qty: 1,
    stockStatus: 'disponible',
    sortOrder: 70,
  },
];

export const filterDefinitions = [
  { value: 'all', label: 'Todos' },
  { value: 'gallina', label: 'Gallina' },
  { value: 'codorniz', label: 'Codorniz' },
  { value: 'mayor', label: 'Por mayor' },
];

// Zonas de RESPALDO para el carrito (las reales vienen de la tabla zones).
export const fallbackZones = [
  ...['Guernica', 'Presidente Perón', 'Alejandro Korn', 'San Vicente', 'Cañuelas', 'Brandsen', 'Ezeiza', 'Canning', 'Monte Grande']
    .map((name) => ({ name, group_name: 'Cerca de la granja' })),
  ...['Longchamps', 'Glew', 'Claypole', 'Burzaco', 'Adrogué', 'Temperley', 'Banfield', 'Lomas de Zamora', 'Llavallol', 'Lanús', 'Avellaneda', 'Quilmes', 'Bernal', 'Berazategui', 'Florencio Varela', 'Almirante Brown', 'Esteban Echeverría']
    .map((name) => ({ name, group_name: 'Zona Sur' })),
  ...['La Plata', 'Berisso', 'Ensenada'].map((name) => ({ name, group_name: 'La Plata y alrededores' })),
  ...['CABA', 'Zona Oeste', 'Zona Norte', 'Otra'].map((name) => ({ name, group_name: 'Otras' })),
];
