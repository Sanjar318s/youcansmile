/* Scroll reveal: fade/slide in when entering viewport, fade out when leaving */
(function initScrollReveal() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const SELECTORS = [
    '.section-head',
    '.promo-slider',
    '.promo-section .section-head',
    '.category-filters',
    '.products-grid > .card',
    '.cats-grid > *',
    '.info-card',
    '.about-sage-visual',
    '.about-sage-text',
    '.contact-strip > *',
    '.why-item',
    '.catalog-hero .section-head',
    '.filters',
    '.cart-layout > *',
    '.account-layout > *',
    '.order-card',
    '.product-gallery',
    '.product-info',
    '.custom-form > *',
  ].join(',');

  const SKIP_CLOSEST =
    '.hero-luxury, #header-root, .site-header, .chat-widget, .chat-panel, [data-reveal="off"], .no-reveal';

  let observer = null;
  const watched = new WeakSet();

  function shouldSkip(el) {
    return !el || el.closest(SKIP_CLOSEST) || el.classList.contains('reveal-skip');
  }

  function mark(el, index) {
    if (shouldSkip(el) || watched.has(el)) return;
    watched.add(el);
    el.classList.add('reveal');
    if (typeof index === 'number') {
      el.style.setProperty('--reveal-delay', `${Math.min(index, 10) * 55}ms`);
    }
    if (observer) observer.observe(el);
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = scope.querySelectorAll ? scope.querySelectorAll(SELECTORS) : [];
    nodes.forEach((el, i) => mark(el, i % 12));
    if (root && root.matches && root.matches(SELECTORS)) mark(root, 0);
  }

  function boot() {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-inview', entry.isIntersecting);
        });
      },
      {
        root: null,
        rootMargin: '0px 0px -8% 0px',
        threshold: [0.12, 0.2],
      }
    );

    scan(document);

    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          scan(node);
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    window.YCSReveal = { scan, refresh: () => scan(document) };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
