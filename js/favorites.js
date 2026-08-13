/* ============================================================
   YouCanSmile — избранное (отдельная страница)
   ============================================================ */
(async function initFavorites() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const [s] = await Promise.all([
    Api.getSettings().catch(() => ({})),
    UI.renderHeader('favorites'),
    UI.renderFooter(),
  ]);
  if (typeof Chat !== 'undefined') Chat.init();

  const prods = await Api.getProducts();
  const favIds = Store.getFavorites();
  const favProds = (prods || []).filter((p) => favIds.includes(p.id));
  const favGrid = document.getElementById('favGrid');
  const favEmpty = document.getElementById('favEmpty');
  if (favProds.length) {
    favEmpty.classList.add('hidden');
    favGrid.classList.remove('hidden');
    await UI.renderGrid(favGrid, favProds, s || {});
  } else {
    favGrid.classList.add('hidden');
    favEmpty.classList.remove('hidden');
  }
})();
