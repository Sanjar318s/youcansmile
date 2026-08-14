/* Scroll reveal: whole blocks/cards fade in once (with their content). No nested text/image delays. */
(function initScrollReveal() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Only outer units — never separate text/images inside a card/block
  const SELECTORS = [
    '.section-head',
    '.promo-slider',
    '.category-filters',
    '.products-grid > .card',
    '.cats-grid > *',
    '.info-cards > .info-card',
    '.about-sage',
    '.contact-strip',
    '.why-grid > .why-item',
    '.filters',
    '.cart-layout > *',
    '.account-layout > *',
    '.order-card',
    '.product-layout > *',
    '.custom-form',
  ].join(',');

  const SKIP_CLOSEST =
    '.hero-luxury, #header-root, .site-header, .chat-widget, .chat-panel, [data-reveal="off"], .no-reveal';

  let observer = null;
  const watched = new WeakSet();

  function shouldSkip(el) {
    return !el || el.closest(SKIP_CLOSEST) || el.classList.contains('reveal-skip');
  }

  function isNearViewport(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    return r.top < vh * 0.96 && r.bottom > -40;
  }

  function siblingIndex(el) {
    const parent = el.parentElement;
    if (!parent) return 0;
    return Array.prototype.indexOf.call(parent.children, el);
  }

  function mark(el) {
    if (shouldSkip(el) || watched.has(el)) return;
    watched.add(el);
    el.classList.add('reveal');
    // Light cascade only among siblings in the same row/group
    const i = siblingIndex(el);
    el.style.setProperty('--reveal-delay', `${Math.min(Math.max(i, 0), 5) * 40}ms`);
    if (observer) observer.observe(el);
    // Already on screen (fast scroll / first paint) — show with the whole block now
    if (isNearViewport(el)) {
      requestAnimationFrame(() => el.classList.add('is-inview'));
    }
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = scope.querySelectorAll ? scope.querySelectorAll(SELECTORS) : [];
    nodes.forEach((el) => mark(el));
    if (root && root.matches && root.matches(SELECTORS)) mark(root);
  }

  function boot() {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // One-shot: appear once, keep content visible (no slow re-fade after fast scroll)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-inview');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        // Start a bit early so fast scroll still catches the animation
        rootMargin: '12% 0px 8% 0px',
        threshold: 0.01,
      }
    );

    scan(document);

    const mo = new MutationObserver((mutations) => {
      let need = false;
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          scan(node);
          need = true;
        });
      });
      if (need) {
        // Newly injected cards already in view
        requestAnimationFrame(() => {
          document.querySelectorAll('.reveal:not(.is-inview)').forEach((el) => {
            if (isNearViewport(el)) el.classList.add('is-inview');
          });
        });
      }
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
