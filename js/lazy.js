/* ============================================================
   YouCanSmile — lazy images (IO + fade-in)
   ============================================================ */
(function initYCSLazy() {
  const PLACEHOLDER =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  let observer = null;
  const watched = new WeakSet();

  function markLoaded(img) {
    img.classList.add('is-loaded');
    img.classList.remove('is-loading');
    const wrap = img.closest('.card-img, .lazy-frame, .pd-main, .pd-thumb');
    if (wrap) {
      wrap.classList.add('img-loaded');
      wrap.classList.remove('img-loading');
    }
  }

  function hydrate(img) {
    if (!img || img.dataset.lazyDone === '1') return;
    const src = img.dataset.src || img.getAttribute('data-src');
    if (!src) {
      img.dataset.lazyDone = '1';
      markLoaded(img);
      return;
    }
    img.classList.add('is-loading');
    const wrap = img.closest('.card-img, .lazy-frame, .pd-main, .pd-thumb');
    if (wrap) wrap.classList.add('img-loading');

    const onDone = () => {
      img.dataset.lazyDone = '1';
      markLoaded(img);
      img.removeEventListener('load', onDone);
      img.removeEventListener('error', onDone);
    };
    img.addEventListener('load', onDone);
    img.addEventListener('error', onDone);

    if (img.src !== src) img.src = src;
    else if (img.complete) onDone();

    img.removeAttribute('data-src');
    delete img.dataset.src;
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver === 'undefined') return observer;
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const img = entry.target;
          observer.unobserve(img);
          hydrate(img);
        });
      },
      { rootMargin: '180px 0px', threshold: 0.01 }
    );
    return observer;
  }

  function watch(img) {
    if (!img || watched.has(img)) return;
    watched.add(img);
    if (!img.getAttribute('decoding')) img.decoding = 'async';

    const src = img.dataset.src || img.getAttribute('data-src');
    if (!src) {
      if (img.complete) markLoaded(img);
      else img.addEventListener('load', () => markLoaded(img), { once: true });
      return;
    }

    if (!img.getAttribute('src') || img.getAttribute('src') === '') {
      img.src = PLACEHOLDER;
    }

    const io = ensureObserver();
    if (!io) {
      hydrate(img);
      return;
    }

    // Already near viewport — load now
    const r = img.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.top < vh + 120 && r.bottom > -80) {
      hydrate(img);
      return;
    }
    io.observe(img);
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img[data-src], img.js-lazy').forEach(watch);
  }

  function boot() {
    scan(document);
  }

  window.YCSLazy = { scan, watch, hydrate };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
