/* ============================================================
   YoucanSmile — каталог: фильтры, сортировка, поиск
   ============================================================ */
(async function initCatalog() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const [s, , cats, allProducts] = await Promise.all([
    Api.getSettings(),
    Promise.all([UI.renderHeader('catalog'), UI.renderFooter()]),
    Api.getCategories(),
    Api.getProducts(),
  ]);

  const products = Array.isArray(allProducts) ? allProducts : [];
  const params = new URLSearchParams(location.search);

  let state = {
    cat: params.get('cat') || 'all',
    priceFrom: '',
    priceTo: '',
    onlyDiscount: params.get('discount') === '1',
    onlyStock: false,
    sort: params.get('sort') || 'popular',
    q: (params.get('q') || '').toLowerCase(),
  };

  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('catalogEmpty');
  const countLabel = document.getElementById('countLabel');
  const sortSelect = document.getElementById('sortSelect');

  /* категории */
  const catChips = document.getElementById('catChips');
  catChips.innerHTML =
    `<button class="chip ${state.cat === 'all' ? 'active' : ''}" data-cat="all">${I18n.t('cat_all')}</button>` +
    (Array.isArray(cats) ? cats : [])
      .map(
        (c) =>
          `<button class="chip ${state.cat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon || ''} ${I18n.txt(c.name)}</button>`
      )
      .join('');
  catChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.cat = chip.dataset.cat;
    document.querySelectorAll('#catChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    applyFilters();
  });
  if (typeof UI !== 'undefined' && UI.bindHScroll) {
    UI.bindHScroll(document.getElementById('catChipsRow'));
  }

  /* элементы фильтров */
  const priceFrom = document.getElementById('priceFrom');
  const priceTo = document.getElementById('priceTo');
  const onlyDiscount = document.getElementById('onlyDiscount');
  const onlyStock = document.getElementById('onlyStock');
  const resetBtn = document.getElementById('resetFilters');

  onlyDiscount.checked = state.onlyDiscount;
  onlyStock.checked = state.onlyStock;
  sortSelect.value = state.sort;

  function titleMatch(p, q) {
    const t = p && p.title;
    if (!t) return false;
    if (typeof t === 'string') return t.toLowerCase().includes(q);
    return (
      String(t.ru || '').toLowerCase().includes(q) ||
      String(t.en || '').toLowerCase().includes(q) ||
      String(t.uz || '').toLowerCase().includes(q)
    );
  }

  async function applyFilters() {
    let list = state.q
      ? products.filter(
          (p) => titleMatch(p, state.q) || (p.tags || []).join(' ').toLowerCase().includes(state.q)
        )
      : products.slice();

    if (state.cat !== 'all') list = list.filter((p) => p.categoryId === state.cat);
    if (state.priceFrom) list = list.filter((p) => p.price >= Number(state.priceFrom));
    if (state.priceTo) list = list.filter((p) => p.price <= Number(state.priceTo));
    if (state.onlyDiscount) list = list.filter((p) => p.oldPrice && p.oldPrice > p.price);
    if (state.onlyStock) list = list.filter((p) => p.inStock);

    switch (state.sort) {
      case 'price_asc': list.sort((a, b) => a.price - b.price); break;
      case 'price_desc': list.sort((a, b) => b.price - a.price); break;
      case 'new': list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); break;
      default: list.sort((a, b) => Number(b.featured) - Number(a.featured));
    }

    countLabel.textContent = `${list.length} ${I18n.t('results')}`;
    empty.classList.toggle('hidden', list.length > 0);
    if (!grid) return;
    try {
      await UI.renderGrid(grid, list, s && s.currency);
    } catch (err) {
      console.error('catalog renderGrid', err);
      grid.innerHTML = list
        .map((p) => {
          const title = I18n.txt(p.title) || p.id;
          const img = (p.images && p.images[0]) || 'img/logo-ycs.png';
          return `<article class="card">
            <a class="card-img" href="product.html?id=${encodeURIComponent(p.id)}">
              <img src="${img}" alt="" loading="lazy"/>
            </a>
            <div class="card-body">
              <a class="card-title" href="product.html?id=${encodeURIComponent(p.id)}">${UI.escapeHtml(title)}</a>
              <div class="card-price"><b>${Store.formatPrice(p.price, s || {})}</b></div>
            </div>
          </article>`;
        })
        .join('');
    }
  }

  priceFrom.addEventListener('input', () => { state.priceFrom = priceFrom.value; applyFilters(); });
  priceTo.addEventListener('input', () => { state.priceTo = priceTo.value; applyFilters(); });
  onlyDiscount.addEventListener('change', () => { state.onlyDiscount = onlyDiscount.checked; applyFilters(); });
  onlyStock.addEventListener('change', () => { state.onlyStock = onlyStock.checked; applyFilters(); });
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; applyFilters(); });
  resetBtn.addEventListener('click', () => {
    state = { cat: 'all', priceFrom: '', priceTo: '', onlyDiscount: false, onlyStock: false, sort: 'popular', q: '' };
    document.querySelectorAll('#catChips .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === 'all'));
    priceFrom.value = ''; priceTo.value = ''; onlyDiscount.checked = false; onlyStock.checked = false; sortSelect.value = 'popular';
    applyFilters();
  });

  const filtersEl = document.getElementById('filters');
  const filtersToggle = document.getElementById('filtersToggle');
  if (filtersEl && filtersToggle) {
    filtersToggle.addEventListener('click', () => {
      const open = filtersEl.classList.toggle('is-open');
      filtersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  document.addEventListener('ycs:i18n-ready', () => {
    applyFilters();
  });

  await applyFilters();
})();
