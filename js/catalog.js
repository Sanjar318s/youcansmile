/* ============================================================
   YoucanSmile — каталог: фильтры, сортировка, поиск
   ============================================================ */
(async function initCatalog() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const s = await Api.getSettings();
  await UI.renderHeader('catalog');
  await UI.renderFooter();

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
  const cats = await Api.getCategories();
  const catChips = document.getElementById('catChips');
  catChips.innerHTML =
    `<button class="chip ${state.cat === 'all' ? 'active' : ''}" data-cat="all">${I18n.t('cat_all')}</button>` +
    cats
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

  /* элементы фильтров */
  const priceFrom = document.getElementById('priceFrom');
  const priceTo = document.getElementById('priceTo');
  const onlyDiscount = document.getElementById('onlyDiscount');
  const onlyStock = document.getElementById('onlyStock');
  const resetBtn = document.getElementById('resetFilters');

  onlyDiscount.checked = state.onlyDiscount;
  onlyStock.checked = state.onlyStock;
  sortSelect.value = state.sort;

  function applyFilters() {
    let list = state.q
      ? allProducts.filter(
          (p) =>
            p.title.ru.toLowerCase().includes(state.q) ||
            p.title.en.toLowerCase().includes(state.q) ||
            (p.tags || []).join(' ').toLowerCase().includes(state.q)
        )
      : [...allProducts];

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
    UI.renderGrid(grid, list, s.currency);
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

  const allProducts = await Api.getProducts();
  applyFilters();
})();
