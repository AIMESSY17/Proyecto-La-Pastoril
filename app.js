import { CART_THRESHOLD, filterDefinitions, imageDimensions, products, STORAGE_KEYS, WHATSAPP_NUMBER } from './data/products.js';
import { initCooking } from './cooking.js';
import { persistCart, restoreCart } from './cart.js';
import { getFilteredProducts } from './catalog.js';
import { buildOrderMessage, createWhatsAppUrl, openWhatsApp } from './whatsapp.js';
import { focusableWithin, initNavigation, initTabs, setActiveHash } from './nav.js';
import { restoreThemePreference } from './theme.js';

const state = {
  currentFilter: 'all',
  cart: restoreCart(products, STORAGE_KEYS.cart),
  activeHash: window.location.hash || '#comprar',
  justAddedProductId: null,
};
persistCart(state.cart, STORAGE_KEYS.cart);

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const catalogGrid = document.getElementById('catalogGrid');
const filterChips = document.getElementById('filterChips');
const cartDrawer = document.getElementById('cartDrawer');
const cartOverlay = document.getElementById('cartOverlay');
const cartItems = document.getElementById('cartItems');
const cartCountMini = document.getElementById('cartCountMini');
const checkoutButton = document.getElementById('checkoutButton');
const customerName = document.getElementById('customerName');
const customerZone = document.getElementById('customerZone');
const deliveryDay = document.getElementById('deliveryDay');
const customerNotes = document.getElementById('customerNotes');
const promoText = document.getElementById('promoText');
const promoProgress = document.getElementById('promoProgress');
const subtotalValue = document.getElementById('subtotalValue');
const totalValue = document.getElementById('totalValue');
const loader = document.getElementById('loader');
const loaderPercent = document.getElementById('loaderPercent');
const loaderPhrases = [...document.querySelectorAll('.phrase')];
const timeGreeting = document.getElementById('timeGreeting');
const cartToggle = document.getElementById('cartToggle');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const galleryImages = [...document.querySelectorAll('.gallery-item img')];
const faqItems = [...document.querySelectorAll('.accordion-item')];
const peopleRange = document.getElementById('peopleRange');
const daysRange = document.getElementById('daysRange');
const peopleValue = document.getElementById('peopleValue');
const daysValue = document.getElementById('daysValue');
const packRecommendation = document.getElementById('packRecommendation');
const addRecommendedPack = document.getElementById('addRecommendedPack');
const catalogSearch = document.getElementById('catalogSearch');
const catalogSort = document.getElementById('catalogSort');
const zoneSelect = document.getElementById('zoneSelect');
const zoneResult = document.getElementById('zoneResult');
const tabWave = document.getElementById('tabWave');
const nightToggle = document.getElementById('nightToggle');
const fieldParticles = document.getElementById('fieldParticles');
const productModal = document.getElementById('productModal');
const eggCursor = document.getElementById('eggCursor');
const eggMeter = document.querySelector('#eggMeter span');
const eggRain = document.getElementById('eggRain');
const featherConfetti = document.getElementById('featherConfetti');
const reviewsCarousel = document.getElementById('reviewsCarousel');
let galleryIndex = 0;
let recommendedDozens = 1;
let bonusWasUnlocked = false;
let logoClickCount = 0;
let lastLogoClick = 0;
let currentTheme = 'day';
let particleContext = null;
let particles = [];
let particleFrame = 0;
let particleFrameTime = 0;
let flyer = null;
let nextFlyerAt = 0;
let pointerPosition = null;
let particleBurst = [];
let manualTheme = null;
let lastCartTrigger = null;
let lastProductTrigger = null;
let lastLightboxTrigger = null;

function formatMoney(value) {
  return currency.format(value);
}

function responsivePicture(imagePath, alt, className = '') {
  const dimensions = imageDimensions[imagePath];
  const webpPath = imagePath.replace(/\.jpg$/i, '');
  const dimensionAttributes = dimensions ? ` width="${dimensions.width}" height="${dimensions.height}"` : '';
  const classAttribute = className ? ` class="${className}"` : '';
  return `
    <picture class="responsive-picture">
      <source type="image/webp" srcset="${webpPath}-800.webp 800w, ${webpPath}-1600.webp 1600w" sizes="(max-width: 640px) 100vw, (max-width: 1023px) 50vw, 33vw" />
      <img src="${imagePath}" alt="${alt}"${classAttribute} loading="lazy" decoding="async"${dimensionAttributes} />
    </picture>`;
}

function trackEvent(name, props = {}) {
  if (typeof window.plausible === 'function') window.plausible(name, { props });
}

function updateProductStructuredData() {
  const canonicalPath = window.location.pathname.replace(/index\.html$/i, '');
  const canonicalUrl = new URL(canonicalPath, window.location.origin);
  const canonicalHref = canonicalUrl.href;
  document.getElementById('canonicalUrl').href = canonicalHref;
  document.getElementById('openGraphUrl').content = canonicalHref;
  const socialImage = new URL('imagenes/granja-campo.jpg', canonicalUrl).href;
  document.getElementById('openGraphImage').content = socialImage;
  document.getElementById('twitterImage').content = socialImage;

  const schemaElement = document.getElementById('businessSchema');
  const schema = JSON.parse(schemaElement.textContent);
  schema.telephone = `+${WHATSAPP_NUMBER}`;
  schema.hasOfferCatalog = {
    '@type': 'OfferCatalog',
    name: 'Huevos de campo',
    itemListElement: products
      .filter((product) => !product.whatsappOnly && product.price > 0)
      .map((product) => ({
        '@type': 'Offer',
        price: product.price,
        priceCurrency: 'ARS',
        itemOffered: {
          '@type': 'Product',
          name: product.name,
          description: product.description,
          image: new URL(product.image, document.baseURI).href,
        },
      })),
  };
  schemaElement.textContent = JSON.stringify(schema);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function safeStorageRead(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`No se pudo leer la preferencia "${key}":`, error);
    return null;
  }
}

function safeStorageWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`No se pudo guardar la preferencia "${key}":`, error);
  }
}

function timePeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 7 && hour < 18) return 'day';
  if (hour >= 18 && hour < 20) return 'sunset';
  return 'night';
}

function automaticThemeForTime(date = new Date()) {
  return timePeriod(date);
}

function updateTimeAwareCopy(period = timePeriod()) {
  const greetings = {
    day: 'Buen día. Huevos recién puestos, del campo a tu mesa.',
    sunset: 'Buenas tardes. Todavía llegás a pedir para mañana.',
    night: 'Buenas noches. El gallinero duerme, pedí y mañana te lo llevamos.',
  };
  const checkoutLabels = {
    day: 'Enviar pedido por WhatsApp',
    sunset: 'Coordinar entrega por WhatsApp',
    night: 'Pedir para mañana por WhatsApp',
  };
  if (timeGreeting) timeGreeting.textContent = greetings[period];
  checkoutButton.textContent = checkoutLabels[period];
  document.getElementById('whatsAppFab').setAttribute('aria-label', period === 'night' ? 'Pedir para mañana por WhatsApp' : 'Enviar pedido por WhatsApp');

  const emptyTitle = document.querySelector('.empty-cart p');
  const emptyHint = document.querySelector('.empty-cart small');
  if (emptyTitle && emptyHint) {
    emptyTitle.textContent = period === 'night'
      ? 'Dejá tu pedido para mañana.'
      : period === 'sunset'
        ? 'Todavía llegás para mañana.'
        : 'Elegí tus huevos para esta semana.';
    emptyHint.textContent = period === 'day'
      ? 'Armá el carrito y coordinamos la entrega por WhatsApp.'
      : 'Armá el pedido y coordinamos por WhatsApp.';
  }

  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const threshold = CART_THRESHOLD;
  if (subtotal >= threshold) {
    promoText.textContent = period === 'night'
      ? 'Bonus desbloqueado. Mañana te preparamos 6 huevitos de codorniz.'
      : period === 'sunset'
        ? 'Bonus desbloqueado. Coordinamos la entrega para mañana.'
        : 'Bonus desbloqueado. Te regalamos 6 huevitos de codorniz.';
  } else {
    const remaining = formatMoney(threshold - subtotal);
    promoText.textContent = period === 'night'
      ? `Sumá ${remaining} y te lo preparamos para mañana.`
      : period === 'sunset'
        ? `Sumá ${remaining} y coordinamos para mañana.`
        : `Sumá ${remaining} más y te regalamos 6 huevitos de codorniz.`;
  }
}

function renderFilters() {
  filterChips.innerHTML = filterDefinitions
    .map(
      (item) => `
        <button class="chip ${state.currentFilter === item.value ? 'active' : ''}" data-filter="${item.value}" type="button">
          ${item.label}
        </button>
      `,
    )
    .join('');

}

function renderCatalog() {
  const filteredProducts = getFilteredProducts(products, state.currentFilter, catalogSearch.value, catalogSort.value);

  catalogGrid.innerHTML = filteredProducts
    .map(
      (product) => `
        <article class="product-card ${product.id === 'pack-familiar' ? 'product-card-featured' : ''}" data-id="${product.id}" tabindex="0" aria-label="Ver detalles de ${product.name}">
          <div class="product-image">
            ${responsivePicture(product.image, product.name)}
            <span class="sticker">${product.badge}</span>
            ${product.stock ? `<span class="stock-badge">${product.stock}</span>` : ''}
          </div>
          <div class="product-body">
            <div class="product-head">
              <h3>${product.name}</h3>
              <span class="price">${product.price ? formatMoney(product.price) : 'Consultá precio'}</span>
            </div>
            <p class="product-description">${product.description}</p>
            <div class="quantity-row">
              <div class="qty-box" data-product-id="${product.id}">
                <button class="minus-button" type="button" aria-label="Restar unidad">−</button>
                <span class="product-qty">${product.qty}</span>
                <button class="plus-button" type="button" aria-label="Sumar unidad">+</button>
              </div>
              <button class="add-button" type="button" data-add-product="${product.id}">${state.justAddedProductId === product.id ? 'Agregado' : product.whatsappOnly ? 'Consultar' : 'Agregar'}</button>
            </div>
          </div>
        </article>
      `,
    )
    .join('');

  addProductCardEffects();
  initRevealEffects();
}

function initCatalogInteractions() {
  catalogSearch.addEventListener('input', renderCatalog);
  catalogSort.addEventListener('change', renderCatalog);
  filterChips.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.currentFilter = chip.dataset.filter;
    renderFilters();
    renderCatalog();
  });

  catalogGrid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (button?.matches('.minus-button, .plus-button')) {
      updateQty(button.closest('.qty-box'), button.matches('.plus-button') ? 1 : -1);
      return;
    }
    if (button?.matches('.add-button')) {
      addProductToCart(button.dataset.addProduct);
      return;
    }
    const card = event.target.closest('.product-card');
    if (!card || event.target.closest('button, input, select, a')) return;
    const product = products.find((entry) => entry.id === card.dataset.id);
    if (product) openProductModal(product);
  });

  catalogGrid.addEventListener('keydown', (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('.product-card')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const product = products.find((entry) => entry.id === event.target.dataset.id);
    if (product) openProductModal(product);
  });
}

function updateQty(qtyBox, delta) {
  const productId = qtyBox.dataset.productId;
  const product = products.find((item) => item.id === productId);
  if (!product) return;

  product.qty = Math.max(1, product.qty + delta);
  qtyBox.querySelector('.product-qty').textContent = product.qty;
}

function addProductToCart(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;

  if (product.whatsappOnly) {
    const opening = timePeriod() === 'night'
      ? 'Buenas noches, La Pastoril. Quiero consultar por el pedido por mayor para mañana.'
      : timePeriod() === 'sunset'
        ? 'Buenas tardes, La Pastoril. Quiero consultar por el pedido por mayor para mañana.'
        : 'Hola, La Pastoril. Quiero consultar por el pedido por mayor.';
    trackEvent('click_whatsapp', { intent: 'wholesale' });
    openWhatsApp(opening);
    return;
  }

  const quantityAdded = product.qty;
  animateEggToCart(productId);
  const existing = state.cart.find((item) => item.id === product.id);
  if (existing) {
    existing.quantity += product.qty;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: product.qty,
      image: product.image,
    });
  }

  product.qty = 1;
  state.justAddedProductId = product.id;
  document.getElementById('cartAnnouncement').textContent = `${product.name} agregado al carrito.`;
  trackEvent('add_to_cart', { product_id: product.id, quantity: quantityAdded });
  renderCatalog();
  renderCart();
  openCart();
  persistCart(state.cart, STORAGE_KEYS.cart);
  window.setTimeout(() => {
    if (state.justAddedProductId !== product.id) return;
    state.justAddedProductId = null;
    renderCatalog();
  }, 1400);
}

function renderCart() {
  const art = state.cart;
  cartItems.innerHTML = '';

  if (!art.length) {
    cartItems.innerHTML = '<div class="empty-cart"><span aria-hidden="true">🥚</span><p></p><small></small></div>';
  } else {
    art.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'cart-item';
      card.innerHTML = `
        ${responsivePicture(item.image, item.name)}
        <div>
          <h4>${item.name}</h4>
          <small>${item.quantity} unidad/es</small>
          <div class="cart-item-actions">
            <div class="qty-box">
              <button class="minus-cart" type="button">−</button>
              <span>${item.quantity}</span>
              <button class="plus-cart" type="button">+</button>
            </div>
            <span class="cart-item-price">${formatMoney(item.price * item.quantity)}</span>
          </div>
        </div>
      `;

      card.querySelector('.minus-cart').addEventListener('click', () => updateCartItem(item.id, -1));
      card.querySelector('.plus-cart').addEventListener('click', () => updateCartItem(item.id, 1));
      cartItems.appendChild(card);
    });
  }

  const subtotal = art.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal;
  const threshold = CART_THRESHOLD;
  const progress = Math.min(100, (subtotal / threshold) * 100);

  promoProgress.style.width = `${progress}%`;
  subtotalValue.textContent = formatMoney(subtotal);
  totalValue.textContent = formatMoney(total);
  cartCountMini.textContent = art.reduce((acc, item) => acc + item.quantity, 0).toString();
  updateTimeAwareCopy();

  if (subtotal >= threshold) {
    document.body.classList.add('bonus-unlocked');
    if (!bonusWasUnlocked) celebrate();
  } else {
    document.body.classList.remove('bonus-unlocked');
  }
  bonusWasUnlocked = subtotal >= threshold;
}

function updateCartItem(productId, delta) {
  const item = state.cart.find((entry) => entry.id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((entry) => entry.id !== productId);
  }

  persistCart(state.cart, STORAGE_KEYS.cart);
  renderCart();
}

function openCart() {
  if (!cartDrawer.classList.contains('open')) {
    lastCartTrigger = document.activeElement;
    trackEvent('open_cart');
  }
  cartDrawer.classList.add('open');
  cartOverlay.classList.add('visible');
  cartOverlay.setAttribute('aria-hidden', 'false');
  cartDrawer.removeAttribute('inert');
  cartDrawer.setAttribute('aria-hidden', 'false');
  cartToggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('cart-open');
  document.getElementById('closeCart').focus();
}

function closeCart() {
  if (!cartDrawer.classList.contains('open')) return;
  cartDrawer.classList.remove('open');
  cartOverlay.classList.remove('visible');
  cartOverlay.setAttribute('aria-hidden', 'true');
  cartDrawer.setAttribute('aria-hidden', 'true');
  cartDrawer.setAttribute('inert', '');
  cartToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('cart-open');
  if (lastCartTrigger instanceof HTMLElement) lastCartTrigger.focus();
}

function buildWhatsAppMessage() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return buildOrderMessage({
    items: state.cart,
    subtotal,
    name: customerName.value.trim() || 'Sin nombre',
    zone: customerZone.value.trim() || 'Sin zona',
    day: deliveryDay.value || 'A confirmar',
    notes: customerNotes.value.trim(),
    period: timePeriod(),
    formatMoney,
  });
}

function handleCheckout() {
  const message = buildWhatsAppMessage();
  trackEvent('click_whatsapp', { intent: 'checkout' });
  openWhatsApp(message);
  celebrate();
}

function initLoader() {
  let seen = false;
  try {
    seen = sessionStorage.getItem('lapastoril-loader-seen') === 'true';
  } catch (error) {
    console.warn('No se pudo leer el estado de carga:', error);
  }
  if (seen) {
    loader.classList.add('hidden');
    return;
  }

  let progress = 0;
  let phraseIndex = 0;
  const interval = setInterval(() => {
    progress += 6;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      const finish = () => {
        loader.classList.add('hidden');
        document.body.classList.add('revealed');
        try {
          sessionStorage.setItem('lapastoril-loader-seen', 'true');
        } catch (error) {
          console.warn('No se pudo guardar el estado de carga:', error);
        }
      };
      if (prefersReducedMotion()) {
        finish();
      } else {
        loader.classList.add('broken');
        setTimeout(() => {
          loader.querySelector('.loader-chick').classList.add('visible');
        }, 280);
        setTimeout(finish, 1450);
      }
    }

    const yolk = document.querySelector('.yolk');
    if (yolk) {
      yolk.style.height = `${(progress / 100) * 78}%`;
    }

    loaderPercent.textContent = `${Math.round(progress)}%`;
    const progressBar = document.querySelector('.loader-progress-fill');
    if (progressBar) progressBar.style.width = `${progress}%`;

    if (progress >= 19 && progress <= 45) {
      phraseIndex = 0;
    } else if (progress > 45 && progress <= 70) {
      phraseIndex = 1;
    } else if (progress > 70 && progress <= 85) {
      phraseIndex = 2;
    } else if (progress > 85 && progress <= 98) {
      phraseIndex = 3;
    } else if (progress >= 100) {
      phraseIndex = 4;
    }

    loaderPhrases.forEach((phrase, index) => {
      phrase.classList.toggle('active', index === phraseIndex);
    });
  }, 48);
}

function initGallery() {
  galleryImages.forEach((image, index) => {
    image.addEventListener('click', () => {
      galleryIndex = index;
      openLightbox(index);
    });
  });

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => navigateGallery(-1));
  lightboxNext.addEventListener('click', () => navigateGallery(1));
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowRight') navigateGallery(1);
    if (event.key === 'ArrowLeft') navigateGallery(-1);
  });
}

function openLightbox(index) {
  const images = galleryImages;
  if (!images.length) return;
  lightboxImage.src = images[index].src;
  lightboxImage.alt = images[index].alt || 'Imagen de La Pastoril';
  lastLightboxTrigger = document.activeElement;
  lightbox.removeAttribute('inert');
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    if (lightbox.classList.contains('open')) document.getElementById('lightboxClose').focus();
  });
}

function closeLightbox() {
  if (!lightbox.classList.contains('open')) return;
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  lightbox.setAttribute('inert', '');
  if (lastLightboxTrigger instanceof HTMLElement) lastLightboxTrigger.focus();
}

function navigateGallery(step) {
  const images = galleryImages;
  galleryIndex = (galleryIndex + step + images.length) % images.length;
  lightboxImage.src = images[galleryIndex].src;
  lightboxImage.alt = images[galleryIndex].alt || 'Imagen de La Pastoril';
}

function initAccordions() {
  document.querySelectorAll('.accordion-item').forEach((item, index) => {
    const trigger = item.querySelector('.accordion-trigger');
    const content = item.querySelector('.accordion-content');
    if (!trigger || !content) return;
    if (!trigger.id) trigger.id = `accordion-trigger-${index + 1}`;
    if (!content.id) content.id = `accordion-content-${index + 1}`;
    trigger.setAttribute('aria-controls', content.id);
    content.setAttribute('role', 'region');
    content.setAttribute('aria-labelledby', trigger.id);
    const initiallyOpen = item.classList.contains('open');
    trigger.setAttribute('aria-expanded', String(initiallyOpen));
    content.toggleAttribute('inert', !initiallyOpen);
    const indicator = trigger.querySelector('span');
    if (indicator) indicator.textContent = initiallyOpen ? '−' : '+';

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.accordion-item').forEach((section) => {
        section.classList.remove('open');
        const sectionTrigger = section.querySelector('.accordion-trigger');
        const sectionContent = section.querySelector('.accordion-content');
        if (sectionTrigger) {
          sectionTrigger.setAttribute('aria-expanded', 'false');
          const indicator = sectionTrigger.querySelector('span');
          if (indicator) indicator.textContent = '+';
        }
        if (sectionContent) sectionContent.setAttribute('inert', '');
      });
      if (!isOpen) {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        content.removeAttribute('inert');
        const indicator = trigger.querySelector('span');
        if (indicator) indicator.textContent = '−';
      }
    });
  });
}

function initRecommendations() {
  const updateRecommendation = () => {
    const people = Number(peopleRange.value);
    const days = Number(daysRange.value);
    const totalEggs = people * days * 1.5;
    recommendedDozens = Math.ceil(totalEggs / 12);
    peopleValue.textContent = `${people} personas`;
    daysValue.textContent = `${days} días por semana`;
    packRecommendation.textContent = `Te conviene ${recommendedDozens} ${recommendedDozens === 1 ? 'docena' : 'docenas'} por semana.`;
  };

  peopleRange.addEventListener('input', updateRecommendation);
  daysRange.addEventListener('input', updateRecommendation);
  updateRecommendation();

  addRecommendedPack.addEventListener('click', () => {
    const product = products.find((entry) => entry.id === 'docena-gallina');
    if (!product) return;
    product.qty = recommendedDozens;
    addProductToCart(product.id);
  });

}

function initCartActions() {
  document.getElementById('closeCart').addEventListener('click', closeCart);
  cartToggle.addEventListener('click', openCart);
  checkoutButton.addEventListener('click', handleCheckout);
  const contactWhatsApp = () => {
    const period = timePeriod();
    const emptyMessages = {
      day: 'Hola, La Pastoril. Quiero consultar por los huevos disponibles.',
      sunset: 'Buenas tardes, La Pastoril. Quiero coordinar un pedido para mañana.',
      night: 'Buenas noches, La Pastoril. Quiero dejar un pedido para mañana.',
    };
    const text = state.cart.length ? buildWhatsAppMessage() : emptyMessages[period];
    trackEvent('click_whatsapp', { intent: state.cart.length ? 'cart' : 'inquiry' });
    openWhatsApp(text);
  };
  document.getElementById('whatsAppFab').addEventListener('click', contactWhatsApp);
  document.getElementById('whatsAppDesktop').addEventListener('click', contactWhatsApp);

  cartOverlay.addEventListener('click', closeCart);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCart();
      closeProductModal();
    }
    if (event.key !== 'Tab') return;
    const activeDialog = [cartDrawer, productModal, lightbox]
      .find((dialog) => dialog.classList.contains('open'));
    if (!activeDialog) return;
    const focusable = focusableWithin(activeDialog);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (!activeDialog.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function initZones() {
  zoneSelect.addEventListener('change', () => {
    const zone = zoneSelect.value;
    const other = zone === 'Otro';
    const text = other ? 'Consultanos igual, capaz llegamos' : `¡Sí! Llegamos a ${zone}, coordinamos día por WhatsApp`;
    const message = other
      ? '¡Hola La Pastoril! Quería consultar si llegan a mi barrio.'
      : `¡Hola La Pastoril! ¿Llegan a ${zone}? Quisiera coordinar un día de entrega.`;
    const link = createWhatsAppUrl(message);
    trackEvent('zone_check', { zone });
    zoneResult.innerHTML = `<p>${text}</p><a class="zone-whatsapp" href="${link}" target="_blank" rel="noopener noreferrer">Coordinar por WhatsApp</a>`;
    zoneResult.classList.remove('visible');
    requestAnimationFrame(() => zoneResult.classList.add('visible'));
  });
}

function initCounterAnimations() {
  const stats = document.querySelectorAll('[data-counter]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const counter = entry.target;
      const target = Number(counter.dataset.counter);
      let current = 0;
      const step = target / 36;
      const tick = () => {
        current += step;
        if (current >= target) {
          counter.textContent = target;
          return;
        }
        counter.textContent = Math.round(current);
        requestAnimationFrame(tick);
      };
      tick();
      observer.unobserve(counter);
    });
  }, { threshold: 0.35 });

  stats.forEach((stat) => observer.observe(stat));
  document.querySelectorAll('[data-rating]').forEach((rating) => {
    const target = Number(rating.dataset.rating);
    const ratingObserver = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      const start = performance.now();
      const animateRating = (now) => {
        const progress = Math.min(1, (now - start) / 900);
        rating.textContent = (target * progress).toFixed(1);
        if (progress < 1) requestAnimationFrame(animateRating);
      };
      requestAnimationFrame(animateRating);
      ratingObserver.disconnect();
    }, { threshold: 0.35 });
    ratingObserver.observe(rating);
  });
}

function addProductCardEffects() {
  const cards = document.querySelectorAll('.product-card');

  cards.forEach((card) => {
    card.addEventListener('mousemove', (event) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const rotateY = (0.5 - px) * 10;
      const rotateX = (py - 0.5) * 10;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

function openProductModal(product, imageIndex = 0) {
  const gallery = [...new Set([product.image, ...products.filter((entry) => entry.category === product.category && entry.image !== product.image).map((entry) => entry.image)])].slice(0, 3);
  const currentImage = gallery[imageIndex] || product.image;
  productModal.innerHTML = `
    <article class="product-detail" role="dialog" aria-modal="true" aria-labelledby="productDetailTitle">
      <button class="product-detail-close" type="button" aria-label="Cerrar detalle">×</button>
      <div class="product-detail-gallery">
        ${responsivePicture(currentImage, product.name, 'product-detail-main')}
        <div class="product-thumbnails">${gallery.map((image, index) => `<button type="button" class="${image === currentImage ? 'active' : ''}" data-image-index="${index}" aria-label="Ver imagen ${index + 1}">${responsivePicture(image, '', '')}</button>`).join('')}</div>
      </div>
      <div class="product-detail-copy">
        <span class="section-kicker">${product.badge}</span>
        <h2 id="productDetailTitle">${product.name}</h2>
        <strong class="price">${product.price ? formatMoney(product.price) : 'Consultá precio'}</strong>
        <p>${product.description} Cada lote se recolecta con cuidado para que disfrutes un producto fresco, de origen conocido y con auténtico sabor de campo.</p>
        <h3>Qué incluye</h3><p>${product.name}. Entrega a coordinar por WhatsApp.</p>
        <button class="primary-button product-detail-add" type="button">${product.whatsappOnly ? 'Consultar por WhatsApp' : 'Agregar al carrito'}</button>
      </div>
    </article>`;
  lastProductTrigger = document.activeElement;
  productModal.removeAttribute('inert');
  productModal.classList.add('open');
  productModal.setAttribute('aria-hidden', 'false');
  productModal.querySelector('.product-detail-close').addEventListener('click', closeProductModal);
  productModal.onclick = (event) => {
    if (event.target === productModal) closeProductModal();
  };
  productModal.querySelectorAll('[data-image-index]').forEach((button) => {
    button.addEventListener('click', () => openProductModal(product, Number(button.dataset.imageIndex)));
  });
  productModal.querySelector('.product-detail-add').addEventListener('click', () => {
    closeProductModal();
    addProductToCart(product.id);
  });
  requestAnimationFrame(() => {
    if (productModal.classList.contains('open')) productModal.querySelector('.product-detail-close').focus();
  });
}

function closeProductModal() {
  if (!productModal.classList.contains('open')) return;
  productModal.classList.remove('open');
  productModal.setAttribute('aria-hidden', 'true');
  productModal.setAttribute('inert', '');
  if (lastProductTrigger instanceof HTMLElement) lastProductTrigger.focus();
}

function animateEggToCart(productId) {
  const source = catalogGrid.querySelector(`.product-card[data-id="${productId}"] .product-image`);
  const destination = cartToggle;
  if (!source || !destination || prefersReducedMotion()) return;
  const start = source.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  const egg = document.createElement('span');
  egg.className = 'flying-egg';
  egg.textContent = '🥚';
  egg.style.left = `${start.left + start.width / 2}px`;
  egg.style.top = `${start.top + start.height / 2}px`;
  document.body.appendChild(egg);
  requestAnimationFrame(() => {
    egg.style.setProperty('--fly-x', `${end.left + end.width / 2 - (start.left + start.width / 2)}px`);
    egg.style.setProperty('--fly-y', `${end.top + end.height / 2 - (start.top + start.height / 2)}px`);
    egg.classList.add('fly');
    egg.addEventListener('transitionend', () => egg.remove(), { once: true });
  });
}

function resizeFieldParticles() {
  if (!fieldParticles) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  fieldParticles.width = Math.round(width * ratio);
  fieldParticles.height = Math.round(height * ratio);
  particleContext = fieldParticles.getContext('2d');
  if (!particleContext) return;
  particleContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  const mobile = window.matchMedia('(max-width: 640px)').matches;
  const count = currentTheme === 'night' ? (mobile ? 14 : 34) : (mobile ? 10 : 24);
  particles = Array.from({ length: count }, () => {
    const layer = Math.floor(Math.random() * 3);
    return {
      x: Math.random() * width,
      y: currentTheme === 'night'
        ? height * (0.5 + Math.pow(Math.random(), 0.7) * 0.5)
        : Math.random() * height,
      layer,
      phase: Math.random() * Math.PI * 2,
      blink: Math.random() * Math.PI * 2,
      blinkSpeed: 0.6 + Math.random() * 2.1,
      size: [2.2, 1.45, .8][layer],
      drift: .25 + Math.random() * .55,
      opacity: .3 + Math.random() * .55,
    };
  });
  nextFlyerAt = performance.now() + 25000 + Math.random() * 15000;
  drawFieldParticles(performance.now());
  startFieldParticleLoop();
}

function drawFieldFlyer(time) {
  if (!flyer && time >= nextFlyerAt) {
    flyer = {
      x: -24,
      y: window.innerHeight * (.16 + Math.random() * .3),
      speed: 38 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2,
    };
  }
  if (!flyer) return;
  flyer.x += flyer.speed / 60;
  flyer.y += Math.sin(time * .002 + flyer.phase) * .12;
  if (flyer.x > window.innerWidth + 30) {
    flyer = null;
    nextFlyerAt = time + 25000 + Math.random() * 15000;
    return;
  }
  const ctx = particleContext;
  const flap = Math.sin(time * .018 + flyer.phase) * 4;
  ctx.save();
  ctx.translate(flyer.x, flyer.y);
  ctx.strokeStyle = 'rgba(255, 253, 247, .74)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8, flap);
  ctx.quadraticCurveTo(-4, -4 - flap, 0, 0);
  ctx.quadraticCurveTo(4, -4 + flap, 8, flap);
  ctx.stroke();
  ctx.restore();
}

function drawFieldParticles(time) {
  if (!particleContext) return;
  const ctx = particleContext;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const night = currentTheme === 'night';
  const reduced = prefersReducedMotion();
  const motionTime = reduced ? 0 : time;
  ctx.clearRect(0, 0, width, height);

  particles.forEach((particle) => {
    let x = particle.x + Math.sin(motionTime * .00025 * particle.drift + particle.phase) * (night ? 9 : 18);
    let y = particle.y;
    if (night) {
      y += Math.sin(motionTime * .00022 * particle.drift + particle.phase) * 7;
      if (!reduced && pointerPosition) {
        const dx = x - pointerPosition.x;
        const dy = y - pointerPosition.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 125) {
          const force = (1 - distance / 125) * 12;
          x += (dx / distance) * force;
          y += (dy / distance) * force;
        }
      }
    } else if (!reduced) {
      particle.y -= particle.drift * (particle.layer === 0 ? 1 : .6);
      particle.x += Math.sin(time * .0003 + particle.phase) * .22;
      if (particle.y < -5) {
        particle.y = height + 5;
        particle.x = Math.random() * width;
      }
      x = particle.x;
      y = particle.y;
    }

    const underCopy = x < width * .68 && y < height * .68;
    const blink = reduced ? .65 : .18 + .82 * Math.max(0, Math.sin(motionTime * .001 * particle.blinkSpeed + particle.blink));
    const alpha = particle.opacity * blink * (night && underCopy ? .3 : 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = night ? [12, 7, 2][particle.layer] : 2;
    ctx.shadowColor = night ? '#F2E86D' : '#FFFDF7';
    ctx.fillStyle = night ? '#F2E86D' : (particle.layer === 0 ? '#FFFDF7' : '#F4EBD6');
    ctx.beginPath();
    ctx.arc(x, y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  if (night && !reduced) {
    const now = performance.now();
    particleBurst = particleBurst.filter((particle) => now - particle.startedAt < 900);
    particleBurst.forEach((particle) => {
      const age = (now - particle.startedAt) / 1000;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#F2E86D';
      ctx.fillStyle = '#F2E86D';
      ctx.beginPath();
      ctx.arc(particle.x + particle.vx * age, particle.y + particle.vy * age, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  if (!night && !reduced) drawFieldFlyer(time);
}

function startFieldParticleLoop() {
  if (prefersReducedMotion() || document.hidden || particleFrame || !particleContext) return;
  const tick = (time) => {
    particleFrame = 0;
    if (document.hidden) return;
    if (time - particleFrameTime >= 1000 / 60) {
      particleFrameTime = time;
      drawFieldParticles(time);
    }
    particleFrame = window.requestAnimationFrame(tick);
  };
  particleFrame = window.requestAnimationFrame(tick);
}

function setFieldTheme(theme) {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  nightToggle.setAttribute('aria-pressed', String(theme === 'night'));
  nightToggle.setAttribute('aria-label', theme === 'night' ? 'Activar modo día' : 'Activar modo noche');
  updateTimeAwareCopy();
  resizeFieldParticles();
}

function initFieldParticles() {
  window.addEventListener('resize', resizeFieldParticles);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (particleFrame) window.cancelAnimationFrame(particleFrame);
      particleFrame = 0;
    } else {
      particleFrameTime = 0;
      startFieldParticleLoop();
    }
  });
  document.addEventListener('pointermove', (event) => {
    pointerPosition = { x: event.clientX, y: event.clientY };
    document.documentElement.style.setProperty('--lantern-x', `${(event.clientX / window.innerWidth) * 100}%`);
    document.documentElement.style.setProperty('--lantern-y', `${(event.clientY / window.innerHeight) * 100}%`);
    if (event.pointerType === 'mouse') document.body.classList.add('has-lantern');
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    pointerPosition = null;
    document.body.classList.remove('has-lantern');
  });
  document.addEventListener('pointerdown', (event) => {
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (currentTheme !== 'night' || prefersReducedMotion()) return;
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const speed = 18 + Math.random() * 28;
      particleBurst.push({
        x: event.clientX,
        y: event.clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 1.5,
        startedAt: performance.now(),
      });
    }
    startFieldParticleLoop();
  }, { passive: true });
  nightToggle.addEventListener('click', () => {
    manualTheme = currentTheme === 'night' ? 'day' : 'night';
    safeStorageWrite(STORAGE_KEYS.theme, manualTheme);
    safeStorageWrite(STORAGE_KEYS.legacyNight, String(manualTheme === 'night'));
    setFieldTheme(manualTheme);
  });
}

function initNightMode() {
  const theme = restoreThemePreference(safeStorageRead, STORAGE_KEYS, automaticThemeForTime);
  manualTheme = theme.manualTheme;
  setFieldTheme(theme.initialTheme);
  initFieldParticles();
  window.setInterval(() => {
    updateTimeAwareCopy();
    if (!manualTheme) {
      const automaticTheme = automaticThemeForTime();
      if (automaticTheme !== currentTheme) setFieldTheme(automaticTheme);
    }
  }, 60000);
}

function initEggCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || prefersReducedMotion()) return;
  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;
  document.addEventListener('mousemove', (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    eggCursor.classList.add('visible');
  });
  document.addEventListener('mouseleave', () => eggCursor.classList.remove('visible'));
  const follow = () => {
    x += (targetX - x) * 0.18;
    y += (targetY - y) * 0.18;
    eggCursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  document.addEventListener('click', (event) => {
    const splash = document.createElement('span');
    splash.className = 'egg-splash';
    splash.textContent = '✦';
    splash.style.left = `${event.clientX}px`;
    splash.style.top = `${event.clientY}px`;
    document.body.appendChild(splash);
    splash.addEventListener('animationend', () => splash.remove(), { once: true });
  });
}

function initEggMeter() {
  let scheduled = false;
  const update = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
    eggMeter.style.transform = `scaleY(${progress})`;
    scheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function initEasterEggs() {
  const logo = document.querySelector('.brand');
  logo.addEventListener('click', () => {
    const now = Date.now();
    logoClickCount = now - lastLogoClick > 1800 ? 1 : logoClickCount + 1;
    lastLogoClick = now;
    if (logoClickCount >= 7) {
      logoClickCount = 0;
      launchEggRain();
    }
  });
  const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let position = 0;
  document.addEventListener('keydown', (event) => {
    if (event.key === sequence[position]) position += 1;
    else position = event.key === sequence[0] ? 1 : 0;
    if (position === sequence.length) {
      position = 0;
      document.body.classList.toggle('yolk-mode');
    }
  });
}

function launchEggRain() {
  if (prefersReducedMotion()) return;
  for (let index = 0; index < 36; index += 1) {
    const egg = document.createElement('span');
    egg.className = 'rain-egg';
    egg.textContent = '🥚';
    egg.style.left = `${Math.random() * 100}%`;
    egg.style.setProperty('--duration', `${1.6 + Math.random() * 1.8}s`);
    egg.style.setProperty('--delay', `${Math.random() * 1.3}s`);
    eggRain.appendChild(egg);
    const start = performance.now();
    let velocity = 0;
    let y = -60;
    const fall = (now) => {
      const elapsed = Math.min(0.05, (now - start) / 1000);
      velocity += 900 * elapsed;
      y += velocity * elapsed;
      const floor = window.innerHeight - 45;
      if (y > floor) {
        y = floor;
        velocity *= -0.48;
        if (Math.abs(velocity) < 65) {
          egg.remove();
          return;
        }
      }
      egg.style.transform = `translateY(${y}px) rotate(${Math.sin(now / 120) * 18}deg)`;
      requestAnimationFrame(fall);
    };
    requestAnimationFrame(fall);
  }
}

function celebrate() {
  if (prefersReducedMotion()) return;
  for (let index = 0; index < 32; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'confetti-piece';
    particle.textContent = index % 4 === 0 ? '🥚' : '✦';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.setProperty('--fall-duration', `${1.6 + Math.random() * 1.8}s`);
    particle.style.setProperty('--fall-delay', `${Math.random() * 0.6}s`);
    featherConfetti.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
  }
}

function initRevealEffects() {
  const revealItems = document.querySelectorAll('.product-card, .section-header, h2, h3, .chicken-card, .review-card, .story-card, .info-card, .tool-card, .gallery-item');
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    revealItems.forEach((item) => item.classList.add('revealed-item'));
    return;
  }
  revealItems.forEach((item, index) => {
    if (item.dataset.revealReady) return;
    item.dataset.revealReady = 'true';
    item.classList.add('reveal-item');
    item.style.setProperty('--reveal-delay', `${(index % 4) * 70}ms`);
  });
  if (!window.revealObserver) {
    window.revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('revealed-item');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
  }
  revealItems.forEach((item) => window.revealObserver.observe(item));
}

function initReviewsCarousel() {
  if (prefersReducedMotion()) return;
  let interval;
  let touchStartX = 0;
  const start = () => {
    clearInterval(interval);
    interval = setInterval(() => {
      if (reviewsCarousel.matches(':hover')) return;
      const card = reviewsCarousel.querySelector('.review-card');
      if (!card) return;
      const next = reviewsCarousel.scrollLeft + card.getBoundingClientRect().width + 16;
      if (next >= reviewsCarousel.scrollWidth - reviewsCarousel.clientWidth - 8) reviewsCarousel.scrollTo({ left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      else reviewsCarousel.scrollTo({ left: next, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, 4500);
  };
  reviewsCarousel.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
  reviewsCarousel.addEventListener('touchend', (event) => {
    const distance = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(distance) > 30) reviewsCarousel.scrollBy({ left: distance > 0 ? 250 : -250, behavior: 'smooth' });
  }, { passive: true });
  reviewsCarousel.addEventListener('mouseenter', () => clearInterval(interval));
  reviewsCarousel.addEventListener('mouseleave', start);
  start();
}

function initCareAnimations() {
  const eggDemo = document.getElementById('eggFloatDemo');
  const toggleFloat = () => eggDemo.classList.toggle('float');
  eggDemo.addEventListener('click', toggleFloat);
  eggDemo.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleFloat();
    }
  });
}

function initImageLoading() {
  document.querySelectorAll('img').forEach((image) => {
    image.decoding = 'async';
    const imagePath = image.getAttribute('src');
    const dimensions = imageDimensions[imagePath];
    if (dimensions) {
      image.width = dimensions.width;
      image.height = dimensions.height;
    }
    if (image.closest('.hero-photo')) {
      image.loading = 'eager';
      image.fetchPriority = 'high';
    } else if (!image.closest('#loader')) {
      image.loading = 'lazy';
    }
    if (!/\.jpe?g$/i.test(imagePath || '') || image.closest('picture')) return;

    const webpPath = imagePath.replace(/\.jpg$/i, '');
    const source = document.createElement('source');
    source.type = 'image/webp';
    source.srcset = `${webpPath}-800.webp 800w, ${webpPath}-1600.webp 1600w`;
    source.sizes = '(max-width: 640px) 100vw, (max-width: 1023px) 50vw, 33vw';
    const picture = document.createElement('picture');
    picture.className = 'responsive-picture';
    image.before(picture);
    picture.append(source, image);
  });
}

function initScrollProgress() {
  const line = document.querySelector('.progress-line span');
  let scheduled = false;
  const update = () => {
    if (line) {
      const banner = document.querySelector('.order-banner');
      if (banner) {
        const rect = banner.getBoundingClientRect();
        line.style.width = `${Math.min(100, Math.max(0, ((window.innerHeight - rect.top) / (rect.height + window.innerHeight)) * 100))}%`;
      }
    }
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? window.scrollY / max : 0;
    document.documentElement.style.setProperty('--page-progress', String(progress));
    scheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function initFooter() {
  const year = document.getElementById('footerYear');
  const backToTop = document.getElementById('backToTop');
  year.textContent = String(new Date().getFullYear());

  backToTop.addEventListener('click', (event) => {
    event.preventDefault();
    setActiveHash('#comprar');
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

function init() {
  initNavigation(nightToggle);
  initNightMode();
  updateProductStructuredData();
  bonusWasUnlocked = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0) >= CART_THRESHOLD;
  renderFilters();
  initCatalogInteractions();
  renderCatalog();
  renderCart();
  initTabs(initRevealEffects);
  initLoader();
  initGallery();
  initAccordions();
  initCareAnimations();
  initCooking();
  initRecommendations();
  initCartActions();
  initZones();
  initCounterAnimations();
  initScrollProgress();
  initFooter();
  initEggMeter();
  initEggCursor();
  initEasterEggs();
  initReviewsCarousel();
  initRevealEffects();
  initImageLoading();
}

init();
