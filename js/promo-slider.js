/* ============================================================
   YouCanSmile — promo / news slider
   ============================================================ */
const PromoSlider = (() => {
  const INTERVAL = 5600;

  function init(root, slides) {
    if (!root || !slides || !slides.length) return null;

    const track = root.querySelector('#promoTrack') || root.querySelector('.promo-track');
    const dotsBox = root.querySelector('#promoDots') || root.querySelector('.promo-dots');
    const prevBtn = root.querySelector('#promoPrev') || root.querySelector('.promo-prev');
    const nextBtn = root.querySelector('#promoNext') || root.querySelector('.promo-next');
    const progress = root.querySelector('#promoProgress') || root.querySelector('.promo-progress span');
    if (!track || !dotsBox) return null;

    root.hidden = false;
    let index = 0;
    let timer = null;
    let paused = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    track.innerHTML = slides
      .map((slide, i) => {
        const tone = slide.tone || 'sage';
        return `
          <article class="promo-slide ${i === 0 ? 'is-active' : ''}" data-tone="${tone}" data-index="${i}" aria-hidden="${i === 0 ? 'false' : 'true'}">
            <div class="promo-slide-inner">
              <span class="promo-badge">${escape(I18n.txt(slide.badge))}</span>
              <h3 class="promo-slide-title">${escape(I18n.txt(slide.title))}</h3>
              <p class="promo-slide-text">${escape(I18n.txt(slide.text))}</p>
              ${
                slide.href
                  ? `<a class="btn btn-primary promo-cta" href="${escapeAttr(slide.href)}">${escape(I18n.txt(slide.cta) || I18n.t('sage_hero_cta'))}</a>`
                  : ''
              }
            </div>
          </article>`;
      })
      .join('');

    dotsBox.innerHTML = slides
      .map(
        (_, i) =>
          `<button type="button" class="promo-dot${i === 0 ? ' is-active' : ''}" data-go="${i}" role="tab" aria-label="Slide ${i + 1}" aria-selected="${i === 0 ? 'true' : 'false'}"></button>`
      )
      .join('');

    const items = [...track.querySelectorAll('.promo-slide')];
    const dots = [...dotsBox.querySelectorAll('.promo-dot')];

    function go(to, { manual } = {}) {
      const next = ((to % slides.length) + slides.length) % slides.length;
      if (next === index && !manual) return;
      const prev = index;
      index = next;

      items.forEach((el, i) => {
        el.classList.toggle('is-active', i === index);
        el.classList.toggle('is-leaving', i === prev && prev !== index);
        el.setAttribute('aria-hidden', i === index ? 'false' : 'true');
        if (i !== prev && i !== index) el.classList.remove('is-leaving');
      });
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', i === index);
        d.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
      restartProgress();
    }

    function restartProgress() {
      if (!progress) return;
      progress.classList.remove('is-running');
      void progress.offsetWidth;
      if (!paused && !reduce) progress.classList.add('is-running');
    }

    function next() {
      go(index + 1);
    }
    function prev() {
      go(index - 1, { manual: true });
    }

    function start() {
      stop();
      if (reduce || slides.length < 2) return;
      timer = setInterval(() => {
        if (!paused) next();
      }, INTERVAL);
      restartProgress();
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    prevBtn?.addEventListener('click', () => {
      prev();
      start();
    });
    nextBtn?.addEventListener('click', () => {
      next();
      start();
    });
    dots.forEach((d) =>
      d.addEventListener('click', () => {
        go(Number(d.dataset.go), { manual: true });
        start();
      })
    );

    root.addEventListener('mouseenter', () => {
      paused = true;
      if (progress) progress.classList.remove('is-running');
    });
    root.addEventListener('mouseleave', () => {
      paused = false;
      restartProgress();
    });
    root.addEventListener('focusin', () => {
      paused = true;
      if (progress) progress.classList.remove('is-running');
    });
    root.addEventListener('focusout', (e) => {
      if (!root.contains(e.relatedTarget)) {
        paused = false;
        restartProgress();
      }
    });

    let touchX = null;
    root.addEventListener(
      'touchstart',
      (e) => {
        touchX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );
    root.addEventListener(
      'touchend',
      (e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) < 40) return;
        if (dx < 0) next();
        else prev();
        start();
      },
      { passive: true }
    );

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        paused = true;
        if (progress) progress.classList.remove('is-running');
      } else {
        paused = false;
        start();
      }
    });

    start();
    return { go, next, prev, destroy: stop };
  }

  function escape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(str) {
    return escape(str).replace(/'/g, '&#39;');
  }

  return { init };
})();
