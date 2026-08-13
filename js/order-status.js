/* ============================================================
   YouCanSmile — public order status page
   ============================================================ */
(async function initOrderStatus() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  await UI.renderHeader('');
  await UI.renderFooter();

  const STATUSES = ['new', 'processing', 'contacting', 'in_progress', 'done', 'cancelled'];
  const labelKey = {
    new: 'admin_order_new',
    processing: 'admin_order_processing',
    contacting: 'admin_order_contacting',
    in_progress: 'admin_order_in_progress',
    done: 'admin_order_done',
    cancelled: 'admin_order_cancel',
  };

  function normalizeStatus(status) {
    return STATUSES.includes(status) ? status : 'new';
  }

  function statusLabel(status) {
    return I18n.t(labelKey[normalizeStatus(status)]);
  }

  const params = new URLSearchParams(location.search);
  const id = (params.get('id') || '').trim();
  const card = document.getElementById('orderStatusCard');
  if (!card) return;

  if (!id) {
    card.innerHTML = `<h1>${I18n.t('order_status_title')}</h1><p class="os-empty">${I18n.t('order_status_missing')}</p>`;
    applyI18n(card);
    return;
  }

  const order = await Api.getOrder(id);
  if (!order) {
    card.innerHTML = `<h1>${I18n.t('order_status_title')}</h1><p class="os-empty">${I18n.t('order_status_not_found')}</p>`;
    return;
  }

  const status = normalizeStatus(order.status);
  const created = order.createdAt ? new Date(order.createdAt) : null;
  const typeLabel =
    order.type === 'custom'
      ? I18n.t('admin_order_custom')
      : (order.items && order.items[0] && order.items[0].title) || I18n.t('admin_order_cart');

  const reviewable = (order.status !== 'cancelled' && order.type !== 'custom' ? (order.items || []) : [])
    .filter((i) => i.productId)
    .map(
      (i) =>
        `<a class="btn btn-primary btn-sm" href="product.html?id=${encodeURIComponent(i.productId)}&order=${encodeURIComponent(order.id)}">${I18n.t('review_leave')}: ${UI.escapeHtml(i.title || '')}</a>`
    )
    .join('');
  const reviewLinks = reviewable
    ? `<div class="os-reviews"><p>${I18n.t('review_form_title')}</p><div class="order-links">${reviewable}</div></div>`
    : '';

  const itemsFull =
    order.type === 'custom'
      ? I18n.t('custom_title')
      : (order.items || []).map((i) => `${i.title || i.productId} × ${i.qty || 1}`).join(', ') || typeLabel;

  card.innerHTML = `
    <p class="os-kicker">${I18n.t('order_status_title')}</p>
    <h1>${UI.escapeHtml(Store.orderNumberLabel(order))}</h1>
    <div class="os-status-wrap">
      <span class="order-status ${status}">${statusLabel(status)}</span>
    </div>
    <div class="os-meta">
      <div><b>${I18n.t('admin_order_items')}:</b> ${UI.escapeHtml(itemsFull)}</div>
      ${created ? `<div><b>${I18n.t('order_status_created')}:</b> ${UI.escapeHtml(created.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }))}</div>` : ''}
      ${order.total != null ? `<div><b>${I18n.t('cart_total')}:</b> ${Store.formatPrice(order.total, await Api.getSettings())}</div>` : ''}
    </div>
    <p class="os-hint">${I18n.t('order_status_hint')}</p>
    ${reviewLinks}
    <div class="os-actions">
      <button type="button" class="btn btn-primary" id="osHelpBtn">${I18n.t('account_order_help')}</button>
      <a class="btn btn-secondary" href="orders.html">${I18n.t('account_orders')}</a>
      <a class="btn btn-secondary" href="index.html">${I18n.t('order_status_home')}</a>
    </div>
  `;

  if (typeof Chat !== 'undefined') Chat.init();
  document.getElementById('osHelpBtn')?.addEventListener('click', async () => {
    if (typeof Chat === 'undefined' || !Chat.open) return;
    const msg = I18n.t('account_order_help_msg').replace('{order}', Store.orderNumberLabel(order));
    await Chat.open({ message: msg, send: true, orderId: order.id });
  });
})();
