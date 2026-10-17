-- =====================================================================
-- La Pastoril · Esquema completo de Supabase
-- ---------------------------------------------------------------------
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO este
-- archivo → Run. Se puede volver a ejecutar sin perder datos (usa
-- "if not exists", "on conflict do nothing" y "create or replace").
--
-- Resumen de seguridad (ver también README.md):
--   * La clave "anon" es pública: la protección real está acá, en las
--     políticas RLS y en las funciones RPC.
--   * El público solo puede: leer productos visibles, zonas, reseñas
--     aprobadas (vista public_reviews) y el número de WhatsApp
--     (vista public_settings); crear pedidos con create_order y
--     confirmar la entrega con su enlace secreto.
--   * Todo lo demás requiere un usuario que esté en la tabla admins.
-- =====================================================================

create extension if not exists pgcrypto; -- gen_random_uuid() (ya viene activada en Supabase)


-- =====================================================================
-- 1. ADMINISTRADORES
-- =====================================================================
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ¿El usuario que hace la consulta es administrador?
-- security definer: puede leer admins aunque RLS lo impida al usuario.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


-- =====================================================================
-- 2. PRODUCTOS
-- =====================================================================
create table if not exists public.products (
  id            text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 600),
  category      text not null default 'gallina'
                check (category in ('gallina', 'codorniz', 'pack', 'mayor')),
  price         integer not null default 0 check (price between 0 and 10000000), -- en pesos, sin centavos
  image_url     text check (image_url is null or char_length(image_url) <= 1000),
  badge         text check (badge is null or char_length(badge) <= 40),          -- insignia: "Más pedido", etc.
  active        boolean not null default true,                                   -- visible en la tienda
  stock_status  text not null default 'disponible'
                check (stock_status in ('disponible', 'pocos', 'agotado')),
  whatsapp_only boolean not null default false,                                  -- solo consulta: sin precio ni carrito
  sort_order    integer not null default 0,
  deleted_at    timestamptz,                                                     -- papelera (30 días)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_sort_idx on public.products (sort_order, name);

-- Antes de cada UPDATE: actualiza updated_at y BLOQUEA cambios de precio
-- que no vengan de admin_update_prices / admin_undo_price_batch, para que
-- todo cambio de precio quede en el historial.
create or replace function public.products_before_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if new.price is distinct from old.price
     and coalesce(current_setting('lp.cambio_precio', true), '') <> 'on' then
    raise exception 'Los precios se cambian con admin_update_prices (así queda registrado en el historial).';
  end if;
  return new;
end;
$$;

drop trigger if exists products_before_update on public.products;
create trigger products_before_update
  before update on public.products
  for each row execute function public.products_before_update();


-- =====================================================================
-- 3. HISTORIAL DE PRECIOS
-- =====================================================================
create table if not exists public.price_history (
  id         bigint generated always as identity primary key,
  product_id text not null references public.products (id) on delete cascade,
  old_price  integer not null,
  new_price  integer not null,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid(),
  batch_id   uuid not null,          -- agrupa los cambios de una misma actualización (para deshacerla)
  undone_at  timestamptz             -- se completa si la actualización se deshizo
);

create index if not exists price_history_batch_idx on public.price_history (batch_id);
create index if not exists price_history_changed_idx on public.price_history (changed_at desc);


-- =====================================================================
-- 4. ZONAS DE ENTREGA
-- =====================================================================
create table if not exists public.zones (
  name       text primary key check (char_length(btrim(name)) between 1 and 60),
  group_name text not null default 'Otras' check (char_length(group_name) <= 60),
  lat        double precision check (lat between -90 and 90),
  lng        double precision check (lng between -180 and 180),
  sort_order integer not null default 0
);

-- TODO: VERIFICAR coordenadas. Son el centro APROXIMADO de cada localidad,
-- alcanzan para ordenar pedidos por cercanía pero no son direcciones.
-- Se pueden corregir desde el panel → Ajustes → Zonas.
insert into public.zones (name, group_name, lat, lng, sort_order) values
  -- Cerca de la granja
  ('Guernica',           'Cerca de la granja', -34.9170, -58.3830, 10),
  ('Presidente Perón',   'Cerca de la granja', -34.9300, -58.3700, 11),
  ('Alejandro Korn',     'Cerca de la granja', -34.9830, -58.3830, 12),
  ('San Vicente',        'Cerca de la granja', -35.0250, -58.4230, 13),
  ('Cañuelas',           'Cerca de la granja', -35.0520, -58.7600, 14),
  ('Brandsen',           'Cerca de la granja', -35.1680, -58.2340, 15),
  ('Ezeiza',             'Cerca de la granja', -34.8540, -58.5220, 16),
  ('Canning',            'Cerca de la granja', -34.8680, -58.5050, 17),
  ('Monte Grande',       'Cerca de la granja', -34.8160, -58.4690, 18),
  -- Zona Sur
  ('Longchamps',         'Zona Sur', -34.8610, -58.3920, 20),
  ('Glew',               'Zona Sur', -34.8890, -58.3840, 21),
  ('Claypole',           'Zona Sur', -34.8000, -58.3360, 22),
  ('Burzaco',            'Zona Sur', -34.8280, -58.3920, 23),
  ('Adrogué',            'Zona Sur', -34.8000, -58.3850, 24),
  ('Temperley',          'Zona Sur', -34.7740, -58.3960, 25),
  ('Banfield',           'Zona Sur', -34.7440, -58.3940, 26),
  ('Lomas de Zamora',    'Zona Sur', -34.7610, -58.4060, 27),
  ('Llavallol',          'Zona Sur', -34.7890, -58.4280, 28),
  ('Lanús',              'Zona Sur', -34.7060, -58.3910, 29),
  ('Avellaneda',         'Zona Sur', -34.6620, -58.3650, 30),
  ('Quilmes',            'Zona Sur', -34.7200, -58.2540, 31),
  ('Bernal',             'Zona Sur', -34.7090, -58.2800, 32),
  ('Berazategui',        'Zona Sur', -34.7630, -58.2120, 33),
  ('Florencio Varela',   'Zona Sur', -34.8090, -58.2760, 34),
  ('Almirante Brown',    'Zona Sur', -34.8300, -58.3700, 35),
  ('Esteban Echeverría', 'Zona Sur', -34.8350, -58.4700, 36),
  -- La Plata y alrededores
  ('La Plata',           'La Plata y alrededores', -34.9210, -57.9550, 40),
  ('Berisso',            'La Plata y alrededores', -34.8730, -57.8860, 41),
  ('Ensenada',           'La Plata y alrededores', -34.8610, -57.9100, 42),
  -- Otras (zonas amplias: sin coordenadas, la distancia queda vacía)
  ('CABA',               'Otras', -34.6037, -58.3816, 50),
  ('Zona Oeste',         'Otras', null, null, 51),
  ('Zona Norte',         'Otras', null, null, 52),
  ('Otra',               'Otras', null, null, 99)
on conflict (name) do nothing;


-- =====================================================================
-- 5. AJUSTES
-- =====================================================================
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

insert into public.settings (key, value) values
  -- TODO: ajustar a la ubicación EXACTA de la granja (se puede hacer desde el panel → Ajustes).
  ('campo',           '{"nombre": "Guernica, Presidente Perón", "lat": -34.917, "lng": -58.383}'),
  ('whatsapp_number', '"5491176254150"'),
  ('business_name',   '"La Pastoril"')
on conflict (key) do nothing;


-- =====================================================================
-- 6. PEDIDOS
-- =====================================================================
create sequence if not exists public.order_number_seq start 1;

-- Genera IDs tipo LP-0001, LP-0002… (a partir de LP-10000 crece sin cortarse).
create or replace function public.next_order_id()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n bigint := nextval('public.order_number_seq');
begin
  return 'LP-' || lpad(n::text, greatest(4, char_length(n::text)), '0');
end;
$$;

create table if not exists public.orders (
  id                    text primary key default public.next_order_id(),
  created_at            timestamptz not null default now(),
  status                text not null default 'nuevo'
                        check (status in ('nuevo', 'confirmado', 'entregado', 'cancelado')),
  customer_name         text not null check (char_length(customer_name) between 1 and 80),
  phone                 text check (phone is null or char_length(phone) <= 30),
  zone                  text references public.zones (name) on update cascade on delete set null,
  preferred_day         text check (preferred_day is null or char_length(preferred_day) <= 30),
  notes                 text check (notes is null or char_length(notes) <= 600),
  items                 jsonb not null default '[]'::jsonb, -- copia de id, nombre, precio y cantidad del momento
  total                 integer not null default 0 check (total >= 0),
  source                text check (source is null or char_length(source) <= 160),
  confirm_token         uuid not null default gen_random_uuid(), -- secreto del enlace /pedido/
  confirmed_at          timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  consent               boolean not null default false,
  -- Extras (no estaban en el pedido original, se agregan por robustez):
  client_ref            text unique check (client_ref is null or char_length(client_ref) <= 64), -- evita duplicados al reintentar
  customer_confirmed_at timestamptz,                         -- el cliente confirmó la recepción (una sola vez)
  rating                smallint check (rating between 1 and 5) -- estrellas que dejó el cliente (para estadísticas)
);

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_phone_idx   on public.orders (phone, created_at desc);
create index if not exists orders_status_idx  on public.orders (status);


-- =====================================================================
-- 7. RESEÑAS
-- =====================================================================
create table if not exists public.reviews (
  id           bigint generated always as identity primary key,
  order_id     text unique references public.orders (id) on delete cascade,
  stars        smallint not null check (stars between 1 and 5),
  comment      text not null default '' check (char_length(comment) <= 500),
  display_name text not null default '' check (char_length(display_name) <= 40), -- solo nombre de pila
  neighborhood text not null default '' check (char_length(neighborhood) <= 60),
  authorized   boolean not null default false,
  status       text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_at   timestamptz not null default now()
);

-- Vista pública: SOLO reseñas aprobadas y autorizadas, y SOLO 4 columnas.
-- (Las vistas se ejecutan con permisos de su dueño: el público lee la
--  vista, pero nunca la tabla reviews.)
create or replace view public.public_reviews as
  select display_name, neighborhood, stars, comment, created_at
  from public.reviews
  where status = 'aprobada' and authorized;

-- Vista pública con los únicos ajustes que la tienda necesita.
create or replace view public.public_settings as
  select key, value
  from public.settings
  where key in ('whatsapp_number', 'business_name');


-- =====================================================================
-- 8. SEGURIDAD: RLS EN TODAS LAS TABLAS
-- =====================================================================
alter table public.admins        enable row level security;
alter table public.products      enable row level security;
alter table public.price_history enable row level security;
alter table public.zones         enable row level security;
alter table public.settings      enable row level security;
alter table public.orders        enable row level security;
alter table public.reviews       enable row level security;

-- admins: cada usuario solo puede ver si ÉL está en la lista. Nadie se agrega por la API.
drop policy if exists "admins: ver la propia fila" on public.admins;
create policy "admins: ver la propia fila" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- products: el público ve solo activos y no eliminados; los admins ven y modifican todo.
drop policy if exists "productos: lectura pública de visibles" on public.products;
create policy "productos: lectura pública de visibles" on public.products
  for select to anon, authenticated using (active and deleted_at is null);
drop policy if exists "productos: admins gestionan" on public.products;
create policy "productos: admins gestionan" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- price_history: solo admins leen. Se escribe únicamente desde las funciones de precios.
drop policy if exists "historial: admins leen" on public.price_history;
create policy "historial: admins leen" on public.price_history
  for select to authenticated using (public.is_admin());

-- zones: lectura pública; solo admins modifican.
drop policy if exists "zonas: lectura pública" on public.zones;
create policy "zonas: lectura pública" on public.zones
  for select to anon, authenticated using (true);
drop policy if exists "zonas: admins gestionan" on public.zones;
create policy "zonas: admins gestionan" on public.zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- settings: solo admins (el público usa la vista public_settings).
drop policy if exists "ajustes: admins gestionan" on public.settings;
create policy "ajustes: admins gestionan" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders: solo admins leen, modifican y borran. NADIE inserta directo:
-- los pedidos entran únicamente por create_order().
drop policy if exists "pedidos: admins leen" on public.orders;
create policy "pedidos: admins leen" on public.orders
  for select to authenticated using (public.is_admin());
drop policy if exists "pedidos: admins modifican" on public.orders;
create policy "pedidos: admins modifican" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pedidos: admins borran" on public.orders;
create policy "pedidos: admins borran" on public.orders
  for delete to authenticated using (public.is_admin());

-- reviews: solo admins (el público usa la vista public_reviews).
drop policy if exists "reseñas: admins gestionan" on public.reviews;
create policy "reseñas: admins gestionan" on public.reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cinturón y tiradores: el rol anónimo no tiene permisos sobre tablas privadas.
revoke all on public.orders, public.reviews, public.settings, public.price_history, public.admins from anon;
revoke insert, update, delete, truncate on public.products, public.zones from anon;
grant select on public.public_reviews, public.public_settings to anon, authenticated;


-- =====================================================================
-- 9. FUNCIONES RPC
-- Todas son "security definer" (corren con permisos del dueño de la base)
-- y tienen search_path fijo para que nadie pueda "colar" objetos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_order: la tienda registra un pedido. Valida TODO del lado del
-- servidor y recalcula el total con los precios de la tabla products.
-- p_client_ref es opcional: si el mismo pedido llega dos veces (reintento),
-- devuelve el ID original en lugar de duplicarlo.
-- ---------------------------------------------------------------------
create or replace function public.create_order(
  p_name       text,
  p_phone      text,
  p_zone       text,
  p_day        text,
  p_notes      text,
  p_items      jsonb,
  p_source     text,
  p_consent    boolean,
  p_hp         text,
  p_elapsed_ms integer,
  p_client_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name    text := left(btrim(coalesce(p_name, '')), 80);
  v_phone   text := nullif(left(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), 30), '');
  v_day     text := nullif(left(btrim(coalesce(p_day, '')), 30), '');
  v_notes   text := nullif(left(btrim(coalesce(p_notes, '')), 600), '');
  v_source  text := nullif(left(btrim(coalesce(p_source, '')), 160), '');
  v_ref     text := nullif(left(btrim(coalesce(p_client_ref, '')), 64), '');
  v_items   jsonb := '[]'::jsonb;
  v_total   integer := 0;
  v_qty     integer;
  v_id      text;
  v_elem    jsonb;
  v_pid     text;
  v_qty_txt text;
  v_product public.products%rowtype;
begin
  -- Antispam: el campo trampa (honeypot) tiene que venir vacío…
  if coalesce(p_hp, '') <> '' then
    raise exception 'Pedido rechazado.';
  end if;
  -- …y un humano tarda al menos 3 segundos en completar el carrito.
  if p_elapsed_ms is null or p_elapsed_ms < 3000 then
    raise exception 'Pedido rechazado: se envió demasiado rápido.';
  end if;
  if p_consent is not true then
    raise exception 'Falta aceptar la política de privacidad.';
  end if;
  if v_name = '' then
    raise exception 'Falta el nombre.';
  end if;
  if not exists (select 1 from public.zones where name = p_zone) then
    raise exception 'La zona elegida no existe.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'El carrito está vacío o es inválido.';
  end if;

  -- Reintento del mismo pedido: devolver el ID ya creado.
  if v_ref is not null then
    select id into v_id from public.orders where client_ref = v_ref;
    if found then
      return jsonb_build_object('id', v_id);
    end if;
  end if;

  -- Límite: máximo 3 pedidos "nuevo" por teléfono en la última hora.
  if v_phone is not null and (
       select count(*) from public.orders
       where phone = v_phone and status = 'nuevo' and created_at > now() - interval '1 hour'
     ) >= 3 then
    raise exception 'Ya recibimos varios pedidos de este teléfono. Escribinos por WhatsApp.';
  end if;

  -- Recorrer los productos: validar y copiar nombre y precio ACTUALES.
  for v_elem in select value from jsonb_array_elements(p_items) loop
    v_pid     := v_elem ->> 'id';
    v_qty_txt := coalesce(v_elem ->> 'quantity', v_elem ->> 'cantidad');
    if v_qty_txt is null or v_qty_txt !~ '^[0-9]{1,3}$' then
      raise exception 'Cantidad inválida.';
    end if;
    v_qty := v_qty_txt::integer;
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Cada producto admite entre 1 y 50 unidades.';
    end if;
    if v_items @> jsonb_build_array(jsonb_build_object('id', v_pid)) then
      raise exception 'Producto repetido en el carrito.';
    end if;

    select * into v_product from public.products where id = v_pid;
    if not found
       or not v_product.active
       or v_product.deleted_at is not null
       or v_product.stock_status = 'agotado'
       or v_product.whatsapp_only
       or v_product.price <= 0 then
      raise exception 'Producto no disponible: %', coalesce(v_product.name, v_pid);
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_product.id,
      'nombre', v_product.name,
      'precio', v_product.price,
      'cantidad', v_qty
    ));
    v_total := v_total + v_product.price * v_qty;
  end loop;

  insert into public.orders (customer_name, phone, zone, preferred_day, notes, items, total, source, consent, client_ref)
  values (v_name, v_phone, p_zone, v_day, v_notes, v_items, v_total, v_source, true, v_ref)
  returning id into v_id;

  return jsonb_build_object('id', v_id); -- solo el ID: nada de datos privados
end;
$$;

-- ---------------------------------------------------------------------
-- get_order_for_customer: lo usa /pedido/ con el enlace secreto.
-- Devuelve datos mínimos (nombre de pila, productos, total, estado).
-- ---------------------------------------------------------------------
create or replace function public.get_order_for_customer(p_id text, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', o.id,
    'nombre', split_part(btrim(o.customer_name), ' ', 1),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', e ->> 'nombre',
        'cantidad', (e ->> 'cantidad')::integer,
        'precio', (e ->> 'precio')::integer))
      from jsonb_array_elements(o.items) e), '[]'::jsonb),
    'total', o.total,
    'estado', o.status,
    'ya_confirmado', o.customer_confirmed_at is not null
  )
  from public.orders o
  where o.id = p_id
    and o.confirm_token::text = lower(btrim(coalesce(p_token, '')));
$$;

-- ---------------------------------------------------------------------
-- confirm_delivery: el cliente confirma que recibió el pedido (una sola
-- vez). Si autoriza, crea una reseña "pendiente" para que el dueño la apruebe.
-- ---------------------------------------------------------------------
create or replace function public.confirm_delivery(
  p_id           text,
  p_token        text,
  p_stars        integer,
  p_comment      text,
  p_authorize    boolean,
  p_neighborhood text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   public.orders%rowtype;
  v_first   text;
  v_review  boolean := false;
begin
  select * into v_order from public.orders
  where id = p_id and confirm_token::text = lower(btrim(coalesce(p_token, '')))
  for update;

  if not found then
    raise exception 'El enlace no es válido.';
  end if;
  if v_order.customer_confirmed_at is not null then
    raise exception 'Este pedido ya fue confirmado. ¡Gracias!';
  end if;
  if v_order.status = 'cancelado' then
    raise exception 'Este pedido figura como cancelado.';
  end if;
  if p_stars is not null and (p_stars < 1 or p_stars > 5) then
    raise exception 'Las estrellas van de 1 a 5.';
  end if;

  update public.orders set
    status                = 'entregado',
    confirmed_at          = coalesce(confirmed_at, now()),
    delivered_at          = coalesce(delivered_at, now()),
    customer_confirmed_at = now(),
    rating                = p_stars
  where id = v_order.id;

  if coalesce(p_authorize, false) and p_stars is not null then
    v_first := left(initcap(split_part(btrim(v_order.customer_name), ' ', 1)), 40);
    insert into public.reviews (order_id, stars, comment, display_name, neighborhood, authorized, status)
    values (
      v_order.id,
      p_stars,
      left(btrim(coalesce(p_comment, '')), 500),
      v_first,
      left(coalesce(nullif(btrim(coalesce(p_neighborhood, '')), ''), v_order.zone, ''), 60),
      true,
      'pendiente'
    )
    on conflict (order_id) do nothing;
    v_review := true;
  end if;

  return jsonb_build_object('ok', true, 'resena', v_review);
end;
$$;

-- ---------------------------------------------------------------------
-- admin_set_status: cambia el estado de un pedido y su fecha.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_status(p_id text, p_status text)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_status not in ('nuevo', 'confirmado', 'entregado', 'cancelado') then
    raise exception 'Estado inválido.';
  end if;

  update public.orders set
    status       = p_status,
    confirmed_at = case
                     when p_status in ('confirmado', 'entregado') then coalesce(confirmed_at, now())
                     when p_status = 'nuevo' then null
                     else confirmed_at end,
    delivered_at = case
                     when p_status = 'entregado' then coalesce(delivered_at, now())
                     when p_status in ('nuevo', 'confirmado') then null
                     else delivered_at end,
    cancelled_at = case when p_status = 'cancelado' then now() else null end
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Pedido inexistente.';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_update_prices: aumenta o descuenta precios en lote.
--   p_mode 'porcentaje': p_value = 10 → +10 %, -5 → -5 %
--   p_mode 'monto':      p_value = 500 → +$500, -200 → -$200
--   p_rounding: 0 (sin redondeo), 10, 50 o 100
-- Registra cada cambio en price_history con el mismo batch_id.
-- ---------------------------------------------------------------------
create or replace function public.admin_update_prices(
  p_product_ids text[],
  p_mode        text,
  p_value       numeric,
  p_rounding    integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch  uuid := gen_random_uuid();
  v_round  integer := coalesce(p_rounding, 0);
  v_result jsonb := '[]'::jsonb;
  v_new    numeric;
  r        record;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_mode not in ('porcentaje', 'monto') then
    raise exception 'Modo inválido: usá porcentaje o monto.';
  end if;
  if p_value is null or p_value = 0 then
    raise exception 'Indicá un valor distinto de cero.';
  end if;
  if p_mode = 'porcentaje' and (p_value <= -100 or p_value > 500) then
    raise exception 'El porcentaje tiene que estar entre -99 y 500.';
  end if;
  if v_round not in (0, 10, 50, 100) then
    raise exception 'Redondeo inválido.';
  end if;
  if coalesce(array_length(p_product_ids, 1), 0) = 0 then
    raise exception 'Elegí al menos un producto.';
  end if;

  perform set_config('lp.cambio_precio', 'on', true); -- habilita el cambio (solo en esta transacción)

  for r in
    select id, name, price from public.products
    where id = any (p_product_ids) and deleted_at is null
    order by sort_order, name
    for update
  loop
    if p_mode = 'porcentaje' and r.price = 0 then
      continue; -- no se puede aplicar un porcentaje a un producto sin precio
    end if;
    v_new := case when p_mode = 'porcentaje'
                  then r.price * (100 + p_value) / 100
                  else r.price + p_value end;
    v_new := case when v_round > 0 then round(v_new / v_round) * v_round else round(v_new) end;
    if v_new < 1 then
      raise exception 'El precio de "%" quedaría en $0 o menos.', r.name;
    end if;
    if v_new::integer <> r.price then
      update public.products set price = v_new::integer where id = r.id;
      insert into public.price_history (product_id, old_price, new_price, batch_id, changed_by)
      values (r.id, r.price, v_new::integer, v_batch, auth.uid());
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'name', r.name, 'old_price', r.price, 'new_price', v_new::integer));
    end if;
  end loop;

  perform set_config('lp.cambio_precio', 'off', true);

  return jsonb_build_object(
    'batch_id', case when jsonb_array_length(v_result) > 0 then v_batch end,
    'cambios', v_result
  );
end;
$$;

-- ---------------------------------------------------------------------
-- admin_undo_price_batch: deshace la ÚLTIMA actualización de precios.
-- ---------------------------------------------------------------------
create or replace function public.admin_undo_price_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last   uuid;
  v_result jsonb := '[]'::jsonb;
  r        record;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select batch_id into v_last
  from public.price_history
  where undone_at is null
  order by changed_at desc, id desc
  limit 1;

  if v_last is null then
    raise exception 'No hay actualizaciones de precios para deshacer.';
  end if;
  if p_batch_id is not null and p_batch_id <> v_last then
    raise exception 'Solo se puede deshacer la última actualización de precios.';
  end if;

  perform set_config('lp.cambio_precio', 'on', true);

  for r in
    select h.product_id, h.old_price, h.new_price, p.name
    from public.price_history h
    join public.products p on p.id = h.product_id
    where h.batch_id = v_last
  loop
    update public.products set price = r.old_price where id = r.product_id;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', r.product_id, 'name', r.name, 'price', r.old_price));
  end loop;

  update public.price_history set undone_at = now() where batch_id = v_last;
  perform set_config('lp.cambio_precio', 'off', true);

  return jsonb_build_object('batch_id', v_last, 'revertidos', v_result);
end;
$$;

-- ---------------------------------------------------------------------
-- admin_reorder_products (extra): guarda el orden de la tienda en un solo paso.
-- ---------------------------------------------------------------------
create or replace function public.admin_reorder_products(p_ids text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  update public.products p
  set sort_order = x.ord * 10
  from unnest(p_ids) with ordinality as x(id, ord)
  where p.id = x.id and p.sort_order is distinct from x.ord * 10;
end;
$$;

-- Permisos de ejecución: nadie por defecto, después cada uno lo suyo.
revoke all on function public.is_admin() from public;
revoke all on function public.next_order_id() from public;
revoke all on function public.create_order(text, text, text, text, text, jsonb, text, boolean, text, integer, text) from public;
revoke all on function public.get_order_for_customer(text, text) from public;
revoke all on function public.confirm_delivery(text, text, integer, text, boolean, text) from public;
revoke all on function public.admin_set_status(text, text) from public;
revoke all on function public.admin_update_prices(text[], text, numeric, integer) from public;
revoke all on function public.admin_undo_price_batch(uuid) from public;
revoke all on function public.admin_reorder_products(text[]) from public;

-- Supabase le da permiso de ejecución al rol anónimo por defecto: se lo quitamos a las de admin.
-- (Igual cada una verifica is_admin() por dentro.)
revoke all on function public.admin_set_status(text, text) from anon;
revoke all on function public.admin_update_prices(text[], text, numeric, integer) from anon;
revoke all on function public.admin_undo_price_batch(uuid) from anon;
revoke all on function public.admin_reorder_products(text[]) from anon;
revoke all on function public.next_order_id() from anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.create_order(text, text, text, text, text, jsonb, text, boolean, text, integer, text) to anon, authenticated;
grant execute on function public.get_order_for_customer(text, text) to anon, authenticated;
grant execute on function public.confirm_delivery(text, text, integer, text, boolean, text) to anon, authenticated;
grant execute on function public.admin_set_status(text, text) to authenticated;
grant execute on function public.admin_update_prices(text[], text, numeric, integer) to authenticated;
grant execute on function public.admin_undo_price_batch(uuid) to authenticated;
grant execute on function public.admin_reorder_products(text[]) to authenticated;


-- =====================================================================
-- 10. STORAGE: fotos de productos
-- Bucket público (cualquiera puede VER las fotos); solo admins suben,
-- reemplazan o borran. Límite de 5 MB por archivo.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos: lectura pública" on storage.objects;
create policy "fotos: lectura pública" on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');

drop policy if exists "fotos: admins suben" on storage.objects;
create policy "fotos: admins suben" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "fotos: admins actualizan" on storage.objects;
create policy "fotos: admins actualizan" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "fotos: admins borran" on storage.objects;
create policy "fotos: admins borran" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());


-- =====================================================================
-- 11. REALTIME: el panel recibe los pedidos en vivo.
-- Realtime respeta RLS: solo los admins reciben los cambios de orders.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
     ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;


-- =====================================================================
-- 12. PRODUCTOS INICIALES (los mismos de la tienda actual)
-- TODO: precios de ejemplo. Ajustalos desde el panel → Productos.
-- =====================================================================
insert into public.products (id, name, description, category, price, image_url, badge, active, stock_status, whatsapp_only, sort_order) values
  ('pack-familiar',   'Pack Familiar: 2 maples + 1 pack codorniz', 'La elección del día para familias que quieren variedad, sabor y buen momento.', 'pack', 22000, 'imagenes/huevos-mesa-madera-960.webp', 'Más pedido', true, 'disponible', false, 10),
  ('maple-30',        'Huevos de campo – Maple 30', '30 huevos frescos del campo, ideales para familias que viven el desayuno en grande.', 'gallina', 9500, 'imagenes/huevos-mesa-madera-960.webp', 'Recién puestos', true, 'pocos', false, 20),
  ('docena-gallina',  'Huevos de campo – Docena', 'La clásica docena para empezar bien el día con huevos de campo y sabor intenso.', 'gallina', 3800, 'imagenes/huevos-canasta-452.webp', 'Frescos de hoy', true, 'disponible', false, 30),
  ('media-docena',    'Huevos de campo – Media docena', 'Perfecta para dos o para un desayuno con un toque de campo en la mesa.', 'gallina', 2000, 'imagenes/huevos-canasta-452.webp', 'Edición campo', true, 'disponible', false, 40),
  ('codorniz-24',     'Huevos de codorniz – Pack x24', 'Chiquitos, manchados y con un sabor único para picadas y desayunos de lujo.', 'codorniz', 4200, 'imagenes/granjero-gallinas-960.webp', 'Frescos del día', true, 'pocos', false, 50),
  ('codorniz-12',     'Huevos de codorniz – Pack x12', 'Un pack perfecto para probar la intensidad de los huevos de codorniz.', 'codorniz', 2300, 'imagenes/gallinas-aire-libre-960.webp', 'Probalo', true, 'disponible', false, 60),
  ('degustacion',     'Pack Degustación: 6 gallina + 12 codorniz', 'Un combo ideal para probar ambos tipos de huevo y armar una mesa distinta.', 'pack', 4900, 'imagenes/codorniz-puesto-960.webp', 'Probalo', true, 'disponible', false, 70),
  ('mayor',           'Pedido por mayor (cajones de 12 maples)', 'Pedilo por mayor y consultá el precio de la semana por WhatsApp.', 'mayor', 0, 'imagenes/codorniz-packs-960.webp', 'Consultá precio', true, 'disponible', true, 80)
on conflict (id) do nothing;


-- =====================================================================
-- 13. CONSULTAS ÚTILES (no se ejecutan: están comentadas)
-- =====================================================================

-- a) Dar acceso al panel al dueño (primero crealo en Authentication → Users):
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'TODO-email-del-dueño@ejemplo.com'
-- on conflict do nothing;

-- b) Borrar los datos de un cliente que lo pida (Ley 25.326, derecho de supresión).
--    Reemplazá el teléfono y/o el nombre. Opción 1: anonimizar (conserva las ventas
--    para las estadísticas, sin datos personales):
-- delete from public.reviews where order_id in (
--   select id from public.orders where phone = '5491100000000' or customer_name ilike 'Nombre Apellido');
-- update public.orders
--   set customer_name = 'Cliente eliminado', phone = null, notes = null, source = null
--   where phone = '5491100000000' or customer_name ilike 'Nombre Apellido';
--    Opción 2: borrar los pedidos por completo (las reseñas se borran solas):
-- delete from public.orders where phone = '5491100000000' or customer_name ilike 'Nombre Apellido';

-- c) Borrar TODOS los pedidos de prueba y reiniciar la numeración en LP-0001:
-- delete from public.orders;
-- alter sequence public.order_number_seq restart with 1;
