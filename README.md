# La Pastoril

Tienda de huevos de campo con pedidos por WhatsApp y un **panel para el dueño** donde se ven los pedidos, las ventas, las reseñas y se administran productos y precios. Todo vive en la propia página: no hay planillas de Google ni mails.

- **Tienda** (`/`): catálogo, carrito y envío del pedido por WhatsApp.
- **Panel** (`/admin/`): pedidos en vivo, estadísticas, reseñas, productos y ajustes.
- **Confirmación** (`/pedido/`): el cliente avisa que recibió el pedido y deja su opinión.
- **Privacidad** (`/privacidad.html`): política de privacidad.

Los datos se guardan en **Supabase** (un servicio de base de datos con plan gratuito). El sitio es HTML, CSS y JavaScript puros: no hay que instalar ni compilar nada.

---

## Puesta en marcha, paso a paso

Tiempo estimado: 30 a 40 minutos. Hacelo desde una computadora.

### 1. Crear el proyecto en Supabase

1. Entrá a <https://supabase.com> y creá una cuenta (gratis).
2. Tocá **New project**. Ponele de nombre `la-pastoril`.
3. Elegí una **Database password** y guardala en un lugar seguro (no la vas a usar todos los días).
4. En **Region** elegí **South America (São Paulo)**, que es la más cercana.
5. Tocá **Create new project** y esperá un par de minutos a que termine de armarse.

### 2. Crear las tablas (ejecutar `schema.sql`)

1. En el menú de la izquierda entrá a **SQL Editor** → **New query**.
2. Abrí el archivo [`supabase/schema.sql`](./supabase/schema.sql) de este proyecto, copiá **todo** su contenido y pegalo en el editor.
3. Tocá **Run**. Tiene que decir *Success. No rows returned*.

Con eso quedan creadas las tablas, las reglas de seguridad, las zonas, los productos iniciales y el espacio para las fotos. Si alguna vez dudás, podés volver a ejecutarlo: no borra nada.

### 3. Crear el usuario del dueño

1. Menú **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribí el email del dueño y una contraseña. Dejá marcado **Auto Confirm User**.
3. Volvé a **SQL Editor** → **New query**, pegá esto **cambiando el email** por el que acabás de usar, y tocá **Run**:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'TODO-email-del-dueño@ejemplo.com'
on conflict do nothing;
```

Tiene que decir *Success*. Para comprobarlo, ejecutá `select * from public.admins;` y debería aparecer una fila. Solo las cuentas que estén en esa lista pueden entrar al panel.

> Recomendado: en **Authentication** → **Sign In / Providers** → **Email**, desactivá **Allow new users to sign up**. No hace falta que nadie se registre: los clientes no tienen cuenta.

### 4. Revisar el espacio de las fotos (Storage)

El paso 2 ya lo crea. Para verificarlo, entrá a **Storage**: tiene que aparecer un bucket llamado **`product-images`** con la etiqueta **Public**.

Si no aparece, crealo a mano: **New bucket** → nombre `product-images` → activá **Public bucket** → **Save**. Después volvé a ejecutar `schema.sql` para que se apliquen los permisos.

### 5. Copiar la URL y la clave en `config.js`

1. En Supabase, entrá a **Project Settings** (el engranaje) → **API** (o **Data API** / **API Keys**, según la versión).
2. Copiá la **Project URL** (algo como `https://abcdefghijkl.supabase.co`).
3. Copiá la clave **anon public** (también puede llamarse *publishable key*).
4. Abrí [`config.js`](./config.js) con el Bloc de notas y reemplazá los dos textos `TODO_…`:

```js
window.LP_CONFIG = {
  SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi…',
};
```

**Importante:** nunca copies la clave `service_role` / *secret*. Esa da acceso total y no va en ningún archivo del sitio.

### 6. Subir el sitio

**Opción A · Netlify (la más fácil)**

1. Entrá a <https://app.netlify.com> y creá una cuenta.
2. **Add new site** → **Deploy manually** y arrastrá la carpeta completa del proyecto.
3. Listo: te da una dirección tipo `https://algo.netlify.app`. Cada vez que cambies un archivo, volvé a arrastrar la carpeta (o conectá el repositorio de GitHub para que se actualice solo).

**Opción B · Cloudflare Pages**

1. Entrá a <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages**.
2. Conectá el repositorio de GitHub, o elegí **Upload assets** y subí la carpeta.
3. No pongas comando de build. El directorio de salida es la raíz (`/`).

En ambos casos el sitio tiene que servirse por **https** (lo hacen solos). No funciona abriendo `index.html` con doble clic.

### 7. Probar un pedido de punta a punta

1. **Tienda:** abrí el sitio, agregá un producto, completá nombre y zona, aceptá la política de privacidad y tocá **Enviar pedido por WhatsApp**. Se abre WhatsApp con un mensaje que dice `Pedido N° LP-0001`. (Esperá al menos 3 segundos con el carrito abierto: es una protección contra robots.)
2. **Panel:** abrí `tu-sitio/admin/`, entrá con el email y la contraseña del paso 3. El pedido aparece en **Pedidos → Hoy**. Tocá **Confirmar**.
3. **Confirmación del cliente:** en la tarjeta del pedido tocá **Pedir confirmación de entrega**. Abrí el enlace que se genera, elegí estrellas, escribí un comentario, marcá la autorización y tocá **Ya recibí mi pedido**.
4. **Reseña:** volvé al panel → **Reseñas** → **Aprobar**. La opinión aparece en la sección *Clientes* de la tienda.
5. **Estadísticas:** el pedido ya cuenta como venta del día.

### 8. Instalar el panel en el celular del dueño

- **Android (Chrome):** abrí `tu-sitio/admin/`, tocá los tres puntitos → **Agregar a la pantalla principal** / **Instalar app**.
- **iPhone (Safari):** abrí `tu-sitio/admin/`, tocá **Compartir** → **Agregar a inicio**.

Después, dentro del panel:

- Tocá 🔕 para **activar el sonido** de pedidos nuevos.
- Tocá 🔔 y aceptá para **activar las notificaciones**.

> **Cómo funcionan los avisos.** Este sistema no usa mails ni servicios externos de notificaciones. Por eso los avisos de pedidos nuevos (sonido, contador en la pestaña, cartel y notificación) funcionan **mientras el panel está abierto o instalado y en uso**. Si el celular cierra la app por completo, no llega nada hasta volver a abrirla; al abrirla se traen solos todos los pedidos que entraron mientras tanto. Igual vas a enterarte siempre, porque cada pedido llega también como mensaje de WhatsApp.

### 9. Cargar y editar productos

En el panel → **Productos**:

- **Agregar producto:** nombre, descripción, categoría, precio, stock, insignia y foto. La foto se puede sacar con el celular: se achica y comprime sola.
- **Editar / Duplicar / Eliminar** en cada producto. Lo eliminado va a la **Papelera** por 30 días.
- El interruptor **Visible** lo muestra u oculta en la tienda al instante.
- El selector de **Stock** permite marcar *Agotado* (se ve en gris y no se puede pedir).
- Para **cambiar el orden**, arrastrá ⠿ o usá las flechas.
- **Actualizar precios:** aumentos o descuentos por porcentaje o monto, para todos o por categoría, con vista previa, historial y botón para deshacer.

Los precios iniciales son de ejemplo: revisalos antes de publicar.

En **Ajustes** corregí la **ubicación de la granja** (podés usar el botón *Usar mi ubicación actual* estando ahí) y revisá las **coordenadas de las zonas**: son aproximadas.

### 10. Borrar los datos de prueba

Cuando termines de probar, en **SQL Editor** ejecutá:

```sql
delete from public.orders;                               -- borra pedidos y reseñas de prueba
alter sequence public.order_number_seq restart with 1;   -- vuelve a empezar en LP-0001
```

---

## Plan gratuito de Supabase: el proyecto se pausa

Los proyectos gratuitos se **pausan después de 7 días sin actividad**. Mientras está pausado, la tienda sigue mostrando los productos de respaldo y los pedidos igual llegan por WhatsApp (con un número temporal `LP-T-…`), pero el panel no funciona.

- **Reactivarlo:** entrá a <https://supabase.com/dashboard>, abrí el proyecto y tocá **Restore project**. Tarda unos minutos. No se pierde nada. Ojo: hay 90 días para reactivarlo desde ahí; pasado ese plazo solo se puede descargar una copia de los datos.
- **Evitarlo:** alcanza con que haya actividad. En general las visitas a la tienda y al panel cuentan, porque consultan la base, así que con movimiento todas las semanas no debería pausarse. Si un día el panel no carga, lo primero es revisar si el proyecto quedó pausado. Si querés olvidarte del tema, el plan **Pro** no se pausa nunca.

---

## Seguridad: cómo está protegido

**La clave `anon` es pública por diseño.** Está en `config.js` y cualquiera puede verla desde el navegador. Eso es normal en Supabase: esa clave por sí sola no da acceso a nada privado. Toda la protección está en la base de datos, en dos mecanismos definidos en `schema.sql`:

1. **Políticas RLS** (*Row Level Security*): reglas que dicen quién puede ver o tocar cada fila.
2. **Funciones RPC**: las únicas “puertas” por las que el público puede escribir, y validan todo del lado del servidor.

### Políticas RLS (activadas en todas las tablas)

| Tabla | Público (sin iniciar sesión) | Admin (usuario en `admins`) |
|---|---|---|
| `products` | Lee solo los **visibles y no eliminados** | Lee, crea, edita y borra |
| `zones` | Lee | Lee, crea, edita y borra |
| `orders` | **Nada** (ni leer ni escribir) | Lee, edita y borra |
| `reviews` | **Nada** (solo la vista `public_reviews`) | Lee, edita y borra |
| `settings` | **Nada** (solo la vista `public_settings`) | Lee y edita |
| `price_history` | **Nada** | Solo lee (lo escriben las funciones de precios) |
| `admins` | **Nada** | Cada usuario ve solo su propia fila |
| Storage `product-images` | Ve las fotos | Sube, reemplaza y borra |

Vistas públicas:

- `public_reviews`: solo reseñas **aprobadas y autorizadas**, y solo `display_name` (nombre de pila), `neighborhood`, `stars` y `comment`.
- `public_settings`: solo el número de WhatsApp y el nombre del negocio (para que la tienda use el número que cargues en Ajustes).

### Funciones RPC

| Función | Quién | Qué hace |
|---|---|---|
| `create_order` | Público | Crea el pedido. Rechaza robots (campo trampa y menos de 3 s), exige consentimiento, valida zona y productos, **recalcula el total con los precios de la base**, limita cantidades (1–50) y textos, y frena a 3 pedidos “nuevo” por teléfono por hora. Devuelve solo el número de pedido. |
| `get_order_for_customer` | Público con enlace secreto | Devuelve nombre de pila, productos, total y estado. |
| `confirm_delivery` | Público con enlace secreto | Marca entregado **una sola vez** y, si el cliente autoriza, crea una reseña pendiente. |
| `admin_set_status` | Admin | Cambia el estado y registra la fecha. |
| `admin_update_prices` | Admin | Cambia precios y guarda el historial. Es el **único** camino para cambiar un precio (un control en la base bloquea cualquier otro). |
| `admin_undo_price_batch` | Admin | Deshace la última actualización de precios. |
| `admin_reorder_products` | Admin | Guarda el orden de los productos. |

Además:

- **Realtime** está activado solo en `orders` y respeta RLS: únicamente los admins reciben los pedidos en vivo.
- El panel y `/pedido/` tienen `noindex` y están excluidos en `robots.txt`.
- **Ningún dato personal aparece en páginas públicas.** Las reseñas muestran nombre de pila y barrio, y solo si el cliente lo autorizó.
- Cada pedido guarda una **copia** del nombre y precio de cada producto: aunque después cambies precios o borres productos, los pedidos viejos no se alteran.

Tres cosas que se agregaron sobre el pedido original, por robustez: la vista `public_settings`, el parámetro opcional `p_client_ref` de `create_order` (evita pedidos duplicados cuando se reintenta) y las columnas `customer_confirmed_at` y `rating` en `orders`.

### Si aparece spam: sumar Cloudflare Turnstile

Las protecciones incluidas (campo trampa, tiempo mínimo y límite por teléfono) frenan a los robots comunes. Si igual entra spam, se puede agregar [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) (un captcha gratuito y casi invisible):

1. En el panel de Cloudflare → **Turnstile** → **Add widget**, cargá el dominio del sitio. Te da una *site key* (pública) y una *secret key* (privada).
2. En `index.html`, agregá el script `https://challenges.cloudflare.com/turnstile/v0/api.js` y un `<div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>` dentro del formulario del carrito.
3. La verificación del token **no puede hacerse desde el navegador** (necesita la clave secreta). Creá una **Edge Function** en Supabase (menú *Edge Functions*) que reciba el pedido y el token, lo valide contra `https://challenges.cloudflare.com/turnstile/v0/siteverify` y recién entonces llame a `create_order` con la clave `service_role`. Guardá la clave secreta con `supabase secrets set TURNSTILE_SECRET=…`.
4. En `store-backend.js`, cambiá `sb.rpc('create_order', …)` por `sb.functions.invoke('crear-pedido', { body: … })`, y en `schema.sql` quitá el permiso público: `revoke execute on function public.create_order(text, text, text, text, text, jsonb, text, boolean, text, integer, text) from anon;`.

---

## Privacidad

- La política está en [`privacidad.html`](./privacidad.html). **Completá los textos marcados con `[TODO: …]`** (responsable de los datos y plazo de conservación) antes de publicar.
- En el carrito hay una casilla obligatoria de consentimiento con el enlace a la política.

### Borrar los datos de un cliente que lo pida

En **SQL Editor**, reemplazando el teléfono (solo números, como figura en el panel) y/o el nombre:

```sql
-- Opción 1 (recomendada): quita los datos personales pero conserva la venta para las estadísticas.
delete from public.reviews where order_id in (
  select id from public.orders
  where phone = '5491100000000' or customer_name ilike 'Nombre Apellido');

update public.orders
set customer_name = 'Cliente eliminado', phone = null, notes = null, source = null
where phone = '5491100000000' or customer_name ilike 'Nombre Apellido';

-- Opción 2: borra los pedidos por completo (sus reseñas se borran solas).
delete from public.orders
where phone = '5491100000000' or customer_name ilike 'Nombre Apellido';
```

Para ver antes qué se va a borrar: `select id, created_at, customer_name, phone from public.orders where phone = '5491100000000';`

---

## Pendientes marcados con TODO

| Dónde | Qué falta |
|---|---|
| `config.js` | URL y clave `anon` de Supabase |
| README, paso 3 | Email del dueño en el SQL de `admins` |
| Panel → Ajustes (o `schema.sql`) | Ubicación exacta de la granja (hoy: centro de Guernica, -34.917, -58.383) |
| Panel → Ajustes → Zonas | Verificar coordenadas de las localidades |
| Panel → Productos | Precios reales |
| `privacidad.html` | Responsable de los datos, plazo de conservación, región de Supabase |

---

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css`, `app.js` | La tienda |
| `store-backend.js` | Conexión de la tienda con Supabase (productos, zonas, reseñas, pedidos y reintentos) |
| `cart.js`, `catalog.js`, `whatsapp.js`, `nav.js`, `theme.js`, `cooking.js`, `easter-eggs.js` | Módulos de la tienda |
| `data/products.js` | **Catálogo y zonas de respaldo**: se usan solo si Supabase no responde |
| `config.js` | URL y clave pública de Supabase |
| `privacidad.html` | Política de privacidad |
| `admin/` | Panel del dueño (`index.html`, `admin.js`, `admin.css`, `manifest.json`, `sw.js`) |
| `pedido/` | Confirmación del cliente (`index.html`, `pedido.js`) |
| `supabase/schema.sql` | Todo el SQL: tablas, seguridad, funciones y datos iniciales |

### Cómo se comporta la tienda si Supabase falla

- **Productos:** muestra la última copia que cargó bien; si no hay, usa `data/products.js`.
- **Pedido:** espera como máximo 2,5 segundos. Si no pudo registrarlo, abre WhatsApp igual con un número temporal (`LP-T-…`), deja el pedido guardado en el navegador del cliente y lo vuelve a intentar en su próxima visita. En el panel, cada pedido muestra también su “Ref. temporal” para poder ubicarlo si en WhatsApp llegó con ese número.
- **Reseñas:** si no hay aprobadas, se ven las de ejemplo que ya estaban en la página. Reemplazalas o quitalas de `index.html` cuando tengas opiniones reales.

### Imágenes de la tienda

Las fotos de productos se suben desde el panel. Las imágenes fijas del sitio (portada, galería) están en `imagenes/`: cada JPG tiene dos versiones WebP con sufijos `-800.webp` y `-1600.webp`, y sus medidas reales se anotan en `imageDimensions` dentro de `data/products.js`.

## Checklist antes de publicar

- [ ] `config.js` completo y pedido de prueba hecho de punta a punta.
- [ ] Usuario del dueño creado y agregado a `admins`; registro público de usuarios desactivado.
- [ ] Precios, productos, zonas y ubicación de la granja revisados en el panel.
- [ ] `privacidad.html` sin textos `[TODO: …]`.
- [ ] Reseñas y contadores de ejemplo de `index.html` reemplazados o quitados.
- [ ] Datos de prueba borrados (paso 10).
- [ ] Panel instalado en el celular del dueño, con sonido y notificaciones activados.
