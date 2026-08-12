/* ============================================================
   YouCanSmile — главная страница
   ============================================================ */
(async function initHome() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const s = await Api.getSettings();

  await UI.renderHeader('index');
  await UI.renderFooter();

  const theme = (document.documentElement.getAttribute('data-theme') || 'sage').toLowerCase();
  const isPurple = theme === 'purple';

  const titleEl = document.getElementById('heroTitle');
  if (titleEl) titleEl.textContent = I18n.txt(s.heroTitle) || s.siteName || 'YouCanSmile';
  const heroSub = document.getElementById('heroSub');
  if (heroSub) heroSub.textContent = I18n.txt(s.heroSubtitle);
  const aboutP = document.querySelector('#about [data-i18n="sage_philosophy_text"]');
  if (aboutP && I18n.txt(s.about)) aboutP.textContent = I18n.txt(s.about);

  /* contacts: hide a card when the admin field is empty */
  const strip = document.getElementById('contactStrip');
  if (strip) {
    const tg = UI.pickContact(s, 'telegram');
    const ig = UI.pickContact(s, 'instagram');
    const em = UI.pickContact(s, 'email');
    const wa = UI.pickContact(s, 'whatsapp');
    const esc = UI.escapeHtml;
    const cards = [];
    if (tg) {
      cards.push(`<a class="contact-card" href="${esc(tg)}" target="_blank" rel="noopener">
        <div class="cc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg></div>
        <div><b>Telegram</b><span>${esc(UI.contactLabel(tg))}</span></div>
      </a>`);
    }
    if (ig) {
      cards.push(`<a class="contact-card" href="${esc(ig)}" target="_blank" rel="noopener">
        <div class="cc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></div>
        <div><b>Instagram</b><span>${esc(UI.contactLabel(ig))}</span></div>
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
        <div><b>WhatsApp</b><span>${esc(UI.contactLabel(wa))}</span></div>
      </a>`);
    }
    strip.innerHTML = cards.join('');
    const section = document.getElementById('contacts');
    if (section) section.hidden = cards.length === 0;
  }

  /* categories */
  const cats = await Api.getCategories();
  const catsGrid = document.getElementById('catsGrid');
  const prods = await Api.getProducts();
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
    PromoSlider.init(promoRoot, s.promos);
  } else {
    document.getElementById('promos')?.setAttribute('hidden', '');
  }

  /* featured + gender filters */
  const featuredAll = prods.filter((p) => p.featured);
  const featuredGrid = document.getElementById('featuredGrid');
  let genderFilter = 'all';

  async function renderFeatured() {
    if (!featuredGrid) return;
    let list = featuredAll.length ? featuredAll.slice() : prods.slice();
    if (genderFilter === 'male') list = list.filter((p) => p.gender === 'male');
    if (genderFilter === 'female') list = list.filter((p) => p.gender === 'female');
    list = list.slice(0, 4);
    if (!list.length) list = (featuredAll.length ? featuredAll : prods).slice(0, 4);
    await UI.renderGrid(featuredGrid, list, s);
    if (!isPurple && typeof HeroSage3D !== 'undefined') {
      HeroSage3D.refreshCards(featuredGrid);
    }
  }

  await renderFeatured();

  document.getElementById('genderFilters')?.querySelectorAll('.gender-chip').forEach((btn) => {
    btn.addEventListener('click', async () => {
      genderFilter = btn.dataset.gender || 'all';
      document.querySelectorAll('#genderFilters .gender-chip').forEach((b) => b.classList.toggle('active', b === btn));
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
