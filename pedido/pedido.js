// Confirmación de entrega del cliente.
// Llega con un enlace del tipo /pedido/?id=LP-0001&t=<token secreto>.
// Solo puede ver los datos mínimos de SU pedido y confirmarlo una vez.

const config = window.LP_CONFIG || {};
const configured = Boolean(
  window.supabase?.createClient
  && config.SUPABASE_URL
  && config.SUPABASE_ANON_KEY
  && !/TODO/i.test(`${config.SUPABASE_URL}${config.SUPABASE_ANON_KEY}`),
);
const sb = configured
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  : null;

const params = new URLSearchParams(window.location.search);
const orderId = (params.get('id') || '').trim();
const token = (params.get('t') || '').trim();
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);

function showView(id) {
  ['viewLoading', 'viewMessage', 'viewOrder', 'viewThanks'].forEach((view) => { $(view).hidden = view !== id; });
}

function showMessage(title, text, icon = '🥚') {
  $('messageTitle').textContent = title;
  $('messageText').textContent = text;
  $('messageIcon').textContent = icon;
  showView('viewMessage');
}

function showFormError(message) {
  $('formError').textContent = message;
  $('formError').hidden = !message;
}

async function loadOrder() {
  if (!sb || !orderId || !token) {
    showMessage('Enlace incompleto', 'Abrí el enlace completo que te mandamos por WhatsApp. Si no funciona, escribinos y lo resolvemos.');
    return;
  }
  const { data, error } = await sb.rpc('get_order_for_customer', { p_id: orderId, p_token: token });
  if (error) {
    showMessage('No pudimos cargar tu pedido', 'Revisá tu conexión y volvé a abrir el enlace en un ratito.', '📡');
    return;
  }
  if (!data) {
    showMessage('Este enlace no es válido', 'No encontramos un pedido con ese enlace. Fijate que esté completo o pedinos uno nuevo por WhatsApp.');
    return;
  }
  if (data.estado === 'cancelado') {
    showMessage('Este pedido figura como cancelado', 'Si es un error, escribinos por WhatsApp y lo revisamos.');
    return;
  }
  if (data.ya_confirmado) {
    showMessage('¡Ya está confirmado!', `Ya nos avisaste que recibiste el pedido ${data.id}. ¡Gracias por elegirnos!`, '🐔');
    return;
  }

  // textContent en todo: nunca se inserta HTML que venga de la base.
  $('orderGreeting').textContent = data.nombre ? `Hola, ${data.nombre}` : 'Tu pedido';
  $('orderNumber').textContent = `Pedido N° ${data.id}`;
  $('orderTotal').textContent = money.format(data.total || 0);
  const list = $('orderItems');
  list.replaceChildren(...(data.items || []).map((item) => {
    const row = document.createElement('li');
    const name = document.createElement('span');
    const price = document.createElement('span');
    name.textContent = `${item.cantidad} × ${item.nombre}`;
    price.textContent = money.format((item.precio || 0) * (item.cantidad || 0));
    row.append(name, price);
    return row;
  }));
  showView('viewOrder');
}

$('confirmForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const starsInput = document.querySelector('input[name="stars"]:checked');
  const stars = starsInput ? Number(starsInput.value) : null;
  const authorize = $('authorize').checked;
  if (authorize && !stars) {
    showFormError('Para publicar tu comentario, elegí cuántas estrellas le ponés.');
    return;
  }
  showFormError('');
  const button = $('confirmButton');
  button.disabled = true;
  button.textContent = 'Enviando…';

  const { data, error } = await sb.rpc('confirm_delivery', {
    p_id: orderId,
    p_token: token,
    p_stars: stars,
    p_comment: $('comment').value.trim() || null,
    p_authorize: authorize,
    p_neighborhood: $('neighborhood').value.trim() || null,
  });

  if (error) {
    button.disabled = false;
    button.textContent = 'Ya recibí mi pedido';
    // Los mensajes del servidor ya vienen en español ("ya fue confirmado", etc.).
    showFormError(error.code ? error.message : 'No pudimos enviar la confirmación. Revisá tu conexión e intentá de nuevo.');
    return;
  }
  $('thanksText').textContent = data?.resena
    ? 'Registramos que recibiste tu pedido. Tu comentario se va a publicar cuando lo revisemos. ¡Gracias por tomarte el tiempo!'
    : 'Registramos que recibiste tu pedido. ¡Que lo disfrutes!';
  showView('viewThanks');
});

loadOrder();
