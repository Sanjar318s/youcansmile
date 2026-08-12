/* ============================================================
   YouCanSmile — Luxury Purple hero (GSAP + canvas particles)
   ============================================================ */
const Hero3D = (() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rafId = null;
  let running = false;
  let particles = [];
  let canvas = null;
  let ctx = null;
  let mouse = { x: 0.5, y: 0.5 };
  let io = null;

  function resizeCanvas() {
    if (!canvas) return;
    const hero = document.getElementById('hero');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = hero ? hero.offsetWidth : window.innerWidth;
    const h = hero ? hero.offsetHeight : window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initParticles() {
    canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    const n = reduced ? 18 : 70;
    particles = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 2.2,
      a: 0.12 + Math.random() * 0.55,
      sp: 0.00006 + Math.random() * 0.00022,
      ph: Math.random() * Math.PI * 2,
    }));
  }

  function particleStops() {
    const purple = (document.documentElement.getAttribute('data-theme') || '') === 'purple';
    return purple
      ? { hi: (a) => `rgba(216,180,254,${a})`, mid: (a) => `rgba(168,85,247,${a})`, lo: 'rgba(139,92,246,0)' }
      : { hi: (a) => `rgba(125,147,106,${a})`, mid: (a) => `rgba(92,111,74,${a})`, lo: 'rgba(125,147,106,0)' };
  }

  function drawParticles(t) {
    if (!ctx || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const col = particleStops();
    ctx.clearRect(0, 0, w, h);
    particles.forEach((p) => {
      const tw = 0.4 + 0.6 * Math.sin(t * 0.0016 + p.ph);
      const px = p.x * w + (mouse.x - 0.5) * 22 * p.r;
      const py = ((p.y + t * p.sp) % 1) * h + (mouse.y - 0.5) * 14 * p.r;
      const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * 3.2);
      g.addColorStop(0, col.hi(p.a * tw));
      g.addColorStop(0.5, col.mid(p.a * tw * 0.4));
      g.addColorStop(1, col.lo);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, p.r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function frame(now) {
    if (!running) return;
    if (document.hidden) {
      rafId = null;
      return;
    }
    drawParticles(now);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (running || reduced) return;
    running = true;
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function syncReflection(titleEl) {
    const reflection = document.getElementById('heroReflection');
    if (reflection && titleEl) reflection.textContent = titleEl.textContent;
  }

  function runIntro() {
    const title = document.getElementById('heroTitle');
    const reflection = document.getElementById('heroReflection');
    const inner = document.getElementById('heroInner');
    const features = document.getElementById('heroFeatures');
    const jewels = document.querySelectorAll('.hero-jewel');

    if (typeof gsap === 'undefined' || reduced) {
      if (title) title.style.opacity = '1';
      if (title) title.style.transform = 'none';
      if (reflection) reflection.style.opacity = '0.45';
      if (inner) { inner.style.opacity = '1'; inner.style.transform = 'none'; }
      if (features) features.style.opacity = '1';
      jewels.forEach((j) => { j.style.opacity = '1'; });
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.to(jewels, {
      opacity: 1,
      duration: 1.2,
      stagger: 0.12,
      y: 0,
    }, 0.1);

    jewels.forEach((j, i) => {
      gsap.to(j, {
        y: `+=${10 + i * 4}`,
        x: `+=${(i % 2 === 0 ? -1 : 1) * (6 + i)}`,
        rotation: (i % 2 === 0 ? -1 : 1) * (4 + i),
        duration: 3.2 + i * 0.35,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
        delay: 0.8 + i * 0.1,
      });
    });

    tl.to(title, { opacity: 1, y: 0, duration: 1.25 }, 0.25);
    tl.to(reflection, { opacity: 0.4, duration: 1 }, 0.55);
    tl.to(inner, { opacity: 1, y: 0, duration: 0.9 }, 0.7);
    if (features) tl.to(features, { opacity: 1, duration: 0.9 }, 0.95);
  }

  function init(opts = {}) {
    destroy();
    const titleEl = opts.title || document.getElementById('heroTitle');
    syncReflection(titleEl);
    initParticles();
    runIntro();

    const hero = document.getElementById('hero');
    if (!hero) return;

    const onMove = (e) => {
      const r = hero.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / Math.max(1, r.width);
      mouse.y = (e.clientY - r.top) / Math.max(1, r.height);
      if (typeof gsap !== 'undefined' && !reduced) {
        gsap.to('#heroJewels', {
          x: (mouse.x - 0.5) * 18,
          y: (mouse.y - 0.5) * 12,
          duration: 0.8,
          ease: 'power2.out',
        });
      }
    };
    hero.addEventListener('mousemove', onMove);
    hero._heroMove = onMove;

    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    hero._heroResize = onResize;

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else if (hero._heroVisible) startLoop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    hero._heroVisibility = onVisibility;

    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((e) => e.isIntersecting);
          hero._heroVisible = visible;
          if (visible && !document.hidden) startLoop();
          else stopLoop();
        },
        { threshold: 0.05 }
      );
      io.observe(hero);
    } else {
      hero._heroVisible = true;
      startLoop();
    }
  }

  function setTitle(text) {
    const titleEl = document.getElementById('heroTitle');
    if (titleEl) titleEl.textContent = text;
    syncReflection(titleEl);
  }

  function destroy() {
    stopLoop();
    if (io) {
      io.disconnect();
      io = null;
    }
    const hero = document.getElementById('hero');
    if (hero) {
      if (hero._heroMove) hero.removeEventListener('mousemove', hero._heroMove);
      if (hero._heroResize) window.removeEventListener('resize', hero._heroResize);
      if (hero._heroVisibility) document.removeEventListener('visibilitychange', hero._heroVisibility);
    }
  }

  return { init, setTitle, destroy, syncReflection };
})();
