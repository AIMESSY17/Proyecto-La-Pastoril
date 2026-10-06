const aboutToggle = document.getElementById('aboutToggle');
const aboutMenu = document.getElementById('aboutMenu');
const mobileMore = document.getElementById('mobileMore');
const moreSheet = document.getElementById('moreSheet');
const moreSheetClose = document.getElementById('moreSheetClose');
const mobileNavBackdrop = document.getElementById('mobileNavBackdrop');

export function focusableWithin(element) {
  return [...element.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((item) => !item.hasAttribute('hidden'));
}

function syncHash() {
  const hash = window.location.hash || '#comprar';
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', `#${panel.id}` === hash);
  });

  document.querySelectorAll('.nav-links a.nav-link').forEach((link) => {
    const match = link.getAttribute('href') === hash;
    link.classList.toggle('active', match);
    if (match) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const aboutActive = ['#bienestar', '#campo', '#historia'].includes(hash);
  aboutToggle.classList.toggle('active', aboutActive);
  if (aboutActive) aboutToggle.setAttribute('aria-current', 'page');
  else aboutToggle.removeAttribute('aria-current');

  document.querySelectorAll('.mobile-bottom-nav a').forEach((link) => {
    const match = link.getAttribute('href') === hash;
    link.classList.toggle('active', match);
    if (match) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  mobileMore.classList.toggle('active', ['#bienestar', '#historia', '#clientes', '#faq'].includes(hash));
}

export function setActiveHash(hash, onSectionChange) {
  if (window.location.hash !== hash) window.location.hash = hash;
  syncHash();
  const target = document.querySelector(hash);
  if (target) target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (onSectionChange) onSectionChange();
}

export function initTabs(onSectionChange) {
  document.querySelectorAll('.nav-links a.nav-link, .more-sheet a, .mobile-bottom-nav a').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setActiveHash(link.getAttribute('href'), onSectionChange);
      closeAboutMenu(aboutMenu.contains(link));
      closeMoreSheet();
    });
  });

  document.querySelectorAll('[data-scroll-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.scrollTarget);
      if (target) target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  });

  window.addEventListener('hashchange', syncHash);
  syncHash();
}

function closeAboutMenu(returnFocus = true) {
  aboutMenu.hidden = true;
  aboutToggle.setAttribute('aria-expanded', 'false');
  if (returnFocus) aboutToggle.focus();
}

function closeMoreSheet() {
  if (moreSheet.hasAttribute('inert')) return;
  mobileNavBackdrop.classList.remove('visible');
  mobileNavBackdrop.setAttribute('aria-hidden', 'true');
  moreSheet.setAttribute('aria-hidden', 'true');
  moreSheet.setAttribute('inert', '');
  mobileMore.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('more-sheet-open');
  document.querySelectorAll('.topbar, .page-shell, .site-footer, .mobile-bottom-nav').forEach((element) => element.removeAttribute('inert'));
  mobileMore.focus();
}

function openMoreSheet() {
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  mobileNavBackdrop.classList.add('visible');
  mobileNavBackdrop.setAttribute('aria-hidden', 'false');
  moreSheet.removeAttribute('inert');
  moreSheet.setAttribute('aria-hidden', 'false');
  mobileMore.setAttribute('aria-expanded', 'true');
  document.body.classList.add('more-sheet-open');
  document.querySelectorAll('.topbar, .page-shell, .site-footer, .mobile-bottom-nav').forEach((element) => element.setAttribute('inert', ''));
  moreSheetClose.focus();
}

export function initNavigation(nightToggle) {
  const navActions = document.getElementById('navActions');
  const brand = document.querySelector('.brand');
  const dropdownLinks = [...aboutMenu.querySelectorAll('a')];
  navActions.prepend(nightToggle);

  const updateBrandTagline = () => brand.classList.toggle('show-tagline', window.matchMedia('(min-width: 1200px)').matches);
  updateBrandTagline();
  window.addEventListener('resize', updateBrandTagline, { passive: true });

  const toggleAboutMenu = (open) => {
    aboutMenu.hidden = !open;
    aboutToggle.setAttribute('aria-expanded', String(open));
    if (open && dropdownLinks.length) dropdownLinks[0].focus();
  };
  aboutToggle.addEventListener('click', () => toggleAboutMenu(aboutMenu.hidden));
  aboutToggle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      toggleAboutMenu(true);
      if (event.key === 'ArrowUp') dropdownLinks[dropdownLinks.length - 1].focus();
    }
  });
  aboutMenu.addEventListener('keydown', (event) => {
    const currentIndex = dropdownLinks.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAboutMenu();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      dropdownLinks[(currentIndex + step + dropdownLinks.length) % dropdownLinks.length].focus();
    } else if (event.key === 'Tab' && !event.shiftKey && currentIndex === dropdownLinks.length - 1) {
      closeAboutMenu(false);
    } else if (event.key === 'Tab' && event.shiftKey && currentIndex === 0) {
      closeAboutMenu(false);
      aboutToggle.focus();
      event.preventDefault();
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && !event.target.closest('#aboutDropdown') && !aboutMenu.hidden) closeAboutMenu(false);
  });

  mobileMore.addEventListener('click', openMoreSheet);
  moreSheetClose.addEventListener('click', closeMoreSheet);
  mobileNavBackdrop.addEventListener('click', closeMoreSheet);
  moreSheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMoreSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableWithin(moreSheet);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const topbar = document.querySelector('.topbar');
  const updateScrollState = () => topbar.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', updateScrollState, { passive: true });
  updateScrollState();
}
