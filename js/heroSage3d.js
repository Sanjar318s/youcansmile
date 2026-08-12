/* ============================================================
   YouCanSmile — Sage theme 3D: parallax props + card tilt
   ============================================================ */
const HeroSage3D = (() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hero = null;
  let bg = null;
  let props = [];
  let rafId = null;
  let target = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let cardCleanups = [];

  function onMove(e) {
    if (!hero) return;
    const r = hero.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    const ny = ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
    target.x = Math.max(-1, Math.min(1, nx));
    target.y = Math.max(-1, Math.min(1, ny));
  }

  function tick() {
    current.x += (target.x - current.x) * 0.08;
    current.y += (target.y - current.y) * 0.08;

    if (bg) {
      const d = parseFloat(bg.dataset.depth || '0.08');
      bg.style.transform = `translate3d(${current.x * -28 * d}px, ${current.y * -20 * d}px, 0)`;
    }

    props.forEach((el) => {
      const d = parseFloat(el.dataset.depth || '0.2');
      const baseRotate = el.classList.contains('sage-prop-journal1')
        ? -12
        : el.classList.contains('sage-prop-journal2')
          ? 14
          : 0;
      const x = current.x * 42 * d;
      const y = current.y * 30 * d;
      const ry = current.x * 10 * d;
      const rx = current.y * -8 * d;
      el.style.transform = `translate3d(${x}px, ${y}px, ${d * 40}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${baseRotate}deg)`;
    });

    rafId = requestAnimationFrame(tick);
  }

  function runIntro() {
    if (typeof gsap === 'undefined' || reduced) {
      props.forEach((p) => {
        p.style.opacity = '1';
      });
      return;
    }

    gsap.to(props, {
      opacity: 1,
      duration: 1.1,
      stagger: 0.1,
      ease: 'power2.out',
      delay: 0.15,
    });

    props.forEach((p, i) => {
      gsap.to(p, {
        y: `+=${8 + (i % 3) * 4}`,
        duration: 2.6 + i * 0.25,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
        delay: 0.4 + i * 0.08,
      });
    });

    const title = hero.querySelector('.hero-sage-content h1');
    const actions = hero.querySelector('.hero-sage-actions');
    if (title) {
      gsap.fromTo(title, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', delay: 0.2 });
    }
    if (actions) {
      gsap.fromTo(actions, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', delay: 0.45 });
    }
  }

  function bindCardTilt(root) {
    const cards = (root || document).querySelectorAll('.card');
    cards.forEach((card) => {
      const onCardMove = (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rx = (0.5 - y) * 10;
        const ry = (x - 0.5) * 12;
        card.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
      };
      const onLeave = () => {
        card.style.transform = '';
      };
      card.addEventListener('mousemove', onCardMove);
      card.addEventListener('mouseleave', onLeave);
      cardCleanups.push(() => {
        card.removeEventListener('mousemove', onCardMove);
        card.removeEventListener('mouseleave', onLeave);
        card.style.transform = '';
      });
    });
  }

  function init(opts = {}) {
    destroy();
    hero = opts.hero || document.getElementById('heroSage');
    if (!hero) return;

    bg = document.getElementById('sageBg');
    props = Array.from(hero.querySelectorAll('.sage-prop'));

    if (!reduced) {
      hero.addEventListener('mousemove', onMove);
      hero._sageMove = onMove;
      rafId = requestAnimationFrame(tick);
      runIntro();
      bindCardTilt(document);
    } else {
      props.forEach((p) => {
        p.style.opacity = '1';
      });
    }
  }

  function refreshCards(root) {
    if (reduced) return;
    cardCleanups.forEach((fn) => fn());
    cardCleanups = [];
    bindCardTilt(root || document);
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (hero && hero._sageMove) hero.removeEventListener('mousemove', hero._sageMove);
    cardCleanups.forEach((fn) => fn());
    cardCleanups = [];
    props = [];
    bg = null;
    hero = null;
  }

  return { init, destroy, refreshCards };
})();
