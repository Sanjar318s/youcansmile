/* ============================================================
   YouCanSmile — главная страница
   ============================================================ */
(async function initHome() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const [s] = await Promise.all([
    Api.getSettings(),
    UI.renderHeader('index'),
    UI.renderFooter(),
  ]);

  const theme = (document.documentElement.getAttribute('data-theme') || 'sage').toLowerCase();
  const isPurple = theme === 'purple';
  const purpleLogo = document.querySelector('.about-logo-purple[data-src]');
  if (purpleLogo && isPurple) {
    purpleLogo.loading = 'lazy';
    purpleLogo.decoding = 'async';
    purpleLogo.src = purpleLogo.getAttribute('data-src');
    purpleLogo.removeAttribute('data-src');
  }

  const titleEl = document.getElementById('heroTitle');
  if (titleEl) titleEl.textContent = I18n.txt(s.heroTitle) || s.siteName || 'YouCanSmile';
  const heroSub = document.getElementById('heroSub');
  if (heroSub) heroSub.textContent = I18n.txt(s.heroSubtitle);
  const aboutP = document.querySelector('#about [data-i18n="sage_philosophy_text"]');
  if (aboutP && I18n.txt(s.about)) aboutP.textContent = I18n.txt(s.about);

  /* contacts: hide a card when the admin field is empty */
  const strip = document.getElementById('contactStrip');
  if (strip) {
    const tgRaw = UI.pickContact(s, 'telegram');
    const igRaw = UI.pickContact(s, 'instagram');
    const em = UI.pickContact(s, 'email');
    const waRaw = UI.pickContact(s, 'whatsapp');
    const tg = UI.normalizeContactHref('telegram', tgRaw);
    const ig = UI.normalizeContactHref('instagram', igRaw);
    const wa = UI.normalizeContactHref('whatsapp', waRaw);
    const esc = UI.escapeHtml;
    const cards = [];
    if (tg) {
      cards.push(`<a class="contact-card" href="${esc(tg)}" target="_blank" rel="noopener">
        <div class="cc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg></div>
        <div><b>Telegram</b><span>${esc(UI.contactLabel(tgRaw || tg))}</span></div>
      </a>`);
    }
    if (ig) {
      cards.push(`<a class="contact-card" href="${esc(ig)}" target="_blank" rel="noopener">
        <div class="cc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></div>
        <div><b>Instagram</b><span>${esc(UI.contactLabel(igRaw || ig))}</span></div>
      </a>`);
    }
    if (em) {
      cards.push(`<a class="contact-card" href="mailto:${esc(em)}">
        <div class="cc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg></div>
        <div><b>Email</b><span>${esc(em)}</span></div>
      </a>`);
    }
    if (wa) {
      cards.push(`<a class="contact-card" href="${esc(wa)}" target="_blank" rel="noopener">
        <div class="cc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.5 8.5 0 1 1-3.1-6.6L21 5v6.5z"/><path d="M8.5 10.5c1.5 3 3.5 4.5 5.5 5l1.5-1.5 2 1v2.5a1.5 1.5 0 0 1-1.7 1.5C10 17.5 6 13 5.5 7.7A1.5 1.5 0 0 1 7 6h2.5l1 2-2 1.5z"/></svg></div>
        <div><b>WhatsApp</b><span>${esc(UI.contactLabel(waRaw || wa))}</span></div>
      </a>`);
    }
    strip.innerHTML = cards.join('');
    const section = document.getElementById('contacts');
    if (section) section.hidden = cards.length === 0;
  }

  /* categories */
  const [cats, prods] = await Promise.all([Api.getCategories(), Api.getProducts()]);
  const catsGrid = document.getElementById('catsGrid');
  if (catsGrid) {
    catsGrid.innerHTML = cats
      .map((c) => {
        const count = prods.filter((p) => p.categoryId === c.id).length;
        return `
        <a class="cat-card" href="catalog.html?cat=${c.id}">
          <div class="cat-ico">${c.icon || '🎁'}</div>
          <b>${I18n.txt(c.name)}</b>
          <span>${count} шт.</span>
        </a>`;
      })
      .join('');
  }

  /* promo / news slider */
  const promoRoot = document.getElementById('promoSlider');
  if (promoRoot && Array.isArray(s.promos) && s.promos.length && typeof PromoSlider !== 'undefined') {
    PromoSlider.init(promoRoot, s.promos, s.promoSlider);
  } else {
    document.getElementById('promos')?.setAttribute('hidden', '');
  }

  /* featured + category filters */
  const featuredAll = prods.filter((p) => p.featured);
  const featuredGrid = document.getElementById('featuredGrid');
  const categoryFilters = document.getElementById('categoryFilters');
  let categoryFilter = 'all';

  if (categoryFilters) {
    const parent = categoryFilters.parentElement;
    const wrap = document.createElement('div');
    wrap.className = 'h-scroll-row category-filters-row';
    wrap.innerHTML = `
      <button type="button" class="h-scroll-nav prev" aria-label="Назад">‹</button>
      <div class="category-filters h-scroll-track" id="categoryFiltersInner" role="tablist"></div>
      <button type="button" class="h-scroll-nav next" aria-label="Вперёд">›</button>`;
    parent.replaceChild(wrap, categoryFilters);
    const track = wrap.querySelector('#categoryFiltersInner');
    const chips = [
      `<button type="button" class="category-chip active" data-cat="all">${I18n.t('sage_filter_all')}</button>`,
      ...cats.map(
        (c) =>
          `<button type="button" class="category-chip" data-cat="${UI.escapeHtml(c.id)}">${UI.escapeHtml(I18n.txt(c.name))}</button>`
      ),
    ];
    track.innerHTML = chips.join('');
    if (UI.bindHScroll) UI.bindHScroll(wrap);
  }

  async function renderFeatured() {
    if (!featuredGrid) return;
    let list = featuredAll.length ? featuredAll.slice() : prods.slice();
    if (categoryFilter !== 'all') {
      list = list.filter((p) => p.categoryId === categoryFilter);
    }
    list = list.slice(0, 4);
    if (!list.length) {
      const fallback = featuredAll.length ? featuredAll : prods;
      list = (categoryFilter === 'all' ? fallback : fallback.filter((p) => p.categoryId === categoryFilter)).slice(0, 4);
      if (!list.length) list = fallback.slice(0, 4);
    }
    await UI.renderGrid(featuredGrid, list, s);
    if (!isPurple && typeof HeroSage3D !== 'undefined') {
      HeroSage3D.refreshCards(featuredGrid);
    }
  }

  await renderFeatured();

  const categoryTrack = document.getElementById('categoryFiltersInner') || document.getElementById('categoryFilters');
  categoryTrack?.querySelectorAll('.category-chip').forEach((btn) => {
    btn.addEventListener('click', async () => {
      categoryFilter = btn.dataset.cat || 'all';
      categoryTrack.querySelectorAll('.category-chip').forEach((b) => b.classList.toggle('active', b === btn));
      await renderFeatured();
    });
  });

  /* newsletter */
  const form = document.getElementById('newsletterForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.hidden = true;
      const ok = document.getElementById('newsletterOk');
      if (ok) {
        ok.hidden = false;
        ok.textContent = I18n.t('newsletter_ok');
      }
    });
  }

  applyI18n();

  const bootHero = () => Hero3D.init({ title: document.getElementById('heroTitle') });
  if (typeof gsap !== 'undefined') bootHero();
  else window.addEventListener('load', bootHero);

  document.getElementById('heroScrollHint')?.addEventListener('click', () => {
    document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' });
  });

  if (!isPurple && typeof HeroSage3D !== 'undefined') {
    HeroSage3D.refreshCards(document.getElementById('featuredGrid'));
  }
})();
