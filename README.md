# La Pastoril

Sitio estático en español para el catálogo y los pedidos por WhatsApp. No requiere build ni dependencias: publicar la carpeta raíz tal cual, conservando las carpetas `data/` e `imagenes/`.

## Editar productos y precios

El catálogo, los precios, el número de WhatsApp, el umbral del bonus y las dimensiones de las imágenes están centralizados en [`data/products.js`](./data/products.js).

- Editá `products` para agregar o modificar nombre, descripción, categoría, precio, imagen y disponibilidad.
- Usá `whatsappOnly: true` para productos de consulta por WhatsApp; no se agregan al carrito.
- `imageDimensions` guarda las dimensiones originales de cada JPEG y se usa para reservar el espacio de las imágenes.
- Los productos del carrito toman el precio vigente del catálogo al cargar el sitio.
- No agregues reseñas, métricas, descuentos ni afirmaciones de disponibilidad sin verificarlos antes de publicar.

## Reemplazar imágenes

Guardá la imagen fuente en `imagenes/` con un nombre simple, sin espacios ni apóstrofes. Para servir una imagen responsive:

1. Agregá un JPEG de respaldo, dos WebP con sufijos `-800.webp` y `-1600.webp`, y sus dimensiones reales a `imageDimensions` en `data/products.js`.
2. Actualizá la ruta `image` del producto o el `src` del elemento HTML.
3. Las imágenes JPEG se enriquecen con `srcset` WebP en el navegador, conservando el JPEG como respaldo. El hero carga con prioridad alta; el resto usa carga diferida.
4. Para regenerar los tamaños existentes, usá una herramienta de imágenes que respete la orientación EXIF y verifique el resultado antes de reemplazar archivos.

## Publicar

### GitHub Pages

Publicá la raíz del repositorio (o la carpeta raíz elegida por Pages). Como el sitio usa módulos ES, servilo por HTTP(S), no abriendo `index.html` con `file://`.

### Netlify

Arrastrá la carpeta del sitio o conectá el repositorio. No configures comando de build; el directorio de publicación es la raíz del proyecto.

## Checklist antes de publicar

- [ ] Confirmar precios, stock, área de entrega, número de WhatsApp y todos los datos comerciales.
- [ ] Sustituir o quitar las reseñas, métricas, promociones y afirmaciones que no estén verificadas.
- [ ] Confirmar el hostname de producción y generar `sitemap.xml` con URLs absolutas. Canonical y Open Graph/Twitter toman el origen real al inicializar el sitio.
- [ ] Comprobar enlaces, imágenes, módulos, vista móvil y escritorio, modo noche, teclado y movimiento reducido.
- [ ] Probar un pedido completo y la sincronización del carrito después de cambiar un precio.
- [ ] Validar HTTPS, metadatos y datos estructurados tras publicar.
