/* ============================================================
   YouCanSmile — scroll / pointer parallax
   ============================================================ */
(function initYCSParallax() {
  const reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const layers = [];
  let ticking = false;
  let pointer = { x: 0, y: 0 };
  let scrollY = window.pageYOffset || 0;

  function collect(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-parallax]').forEach((el) => {
      if (el.dataset.parallaxBound === '1') return;
      el.dataset.parallaxBound = '1';
      const speed = parseFloat(el.getAttribute('data-parallax') || '0.12');
      const axis = (el.getAttribute('data-parallax-axis') || 'y').toLowerCase();
      const hero = el.hasAttribute('data-parallax-hero') || !!el.closest('#hero');
      layers.push({ el, speed, axis, hero });
    });

    // Hero jewels are animated by GSAP (Hero3D) — do not overwrite their transform here
    const hero = document.getElementById('hero');
    if (hero) hero.dataset.parallaxHero = '1';
  }

  function apply() {
    ticking = false;
    const vh = window.innerHeight || 800;
    layers.forEach(({ el, speed, axis, hero }) => {
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      if (!hero && (rect.bottom < -80 || rect.top > vh + 80)) return;

      let y = 0;
      let x = 0;
      if (hero) {
        const progress = Math.min(1.2, Math.max(0, scrollY / Math.max(1, vh)));
        y = progress * speed * 120;
        if (axis.includes('x')) {
          x = pointer.x * speed * 24;
          y += pointer.y * speed * 12;
        }
      } else {
        const mid = rect.top + rect.height / 2;
        const fromCenter = (mid - vh / 2) / vh;
        y = fromCenter * speed * -70;
        if (axis.includes('x')) x = pointer.x * speed * 18;
      }

      if (axis === 'x') {
        el.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      } else if (axis === 'xy' || axis === 'both') {
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      } else {
        el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      }
    });
  }

  function requestTick() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }

  function onScroll() {
    scrollY = window.pageYOffset || 0;
    requestTick();
  }

  function onPointer(e) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    pointer.x = (e.clientX / w) * 2 - 1;
    pointer.y = (e.clientY / h) * 2 - 1;
    requestTick();
  }

  function boot() {
    collect(document);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', requestTick, { passive: true });
    if (window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', onPointer, { passive: true });
    }
    requestTick();
  }

  window.YCSParallax = {
    scan: collect,
    refresh() {
      collect(document);
      requestTick();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
