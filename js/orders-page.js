/* ============================================================
   YouCanSmile — история заказов (отдельная страница)
   ============================================================ */
(async function initOrdersPage() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();

  const guest = document.getElementById('ordersGuest');
  const userBox = document.getElementById('ordersUser');
  const ordersList = document.getElementById('ordersList');
  const ordersEmpty = document.getElementById('ordersEmpty');
  let settings = {};

  await Promise.all([UI.renderHeader('orders'), UI.renderFooter()]);
  if (typeof Chat !== 'undefined') Chat.init();

  const me = await Api.getMe().catch(() => null);
  settings = (await Api.getSettings().catch(() => ({}))) || {};

  if (!me || me.role !== 'customer') {
    if (guest) guest.classList.remove('hidden');
    if (userBox) userBox.classList.add('hidden');
    return;
  }
  if (guest) guest.classList.add('hidden');
  if (userBox) userBox.classList.remove('hidden');

  function statusLabel(status) {
    const key = {
      new: 'admin_order_new',
      processing: 'admin_order_processing',
      contacting: 'admin_order_contacting',
      in_progress: 'admin_order_in_progress',
      done: 'admin_order_done',
      cancelled: 'admin_order_cancel',
    }[status];
    return key ? I18n.t(key) : status;
  }

  function reviewLinks(order) {
    if (!order.items || !order.items.length || order.type === 'custom') return '';
    if (order.status === 'cancelled') return '';
    const uniq = [];
    order.items.forEach((it) => {
      if (it.productId && !uniq.includes(it.productId)) uniq.push(it.productId);
    });
    return uniq
      .map(
        (pid) =>
          `<a class="btn btn-sm btn-secondary" href="product.html?id=${encodeURIComponent(pid)}&reviewOrder=${encodeURIComponent(order.id)}">${I18n.t('review_leave')}</a>`
      )
      .join(' ');
  }

  function helpMessage(order) {
    return I18n.t('account_order_help_msg').replace('{order}', Store.orderNumberLabel(order));
  }

  let orders = [];
  try {
    orders = await Api.getMyOrders();
  } catch (_) {
    orders = [];
  }
  if (!Array.isArray(orders)) orders = [];
  orders = orders.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  ordersList.innerHTML = '';
  ordersEmpty.classList.toggle('hidden', orders.length > 0);
  orders.forEach((o) => {
    const card = document.createElement('article');
    card.className = 'account-order card';
    const dt = new Date(o.createdAt || Date.now()).toLocaleString(I18n.lang === 'en' ? 'en-GB' : 'ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const items =
      o.type === 'custom'
        ? I18n.t('custom_title')
        : (o.items || []).map((i) => `${i.title || i.productId} × ${i.qty || 1}`).join(', ');
    const status = o.status || 'new';
    card.innerHTML = `
      <div class="account-order-top">
        <b class="account-order-num">${UI.escapeHtml(Store.orderNumberLabel(o))}</b>
        <span class="order-status ${UI.escapeHtml(status)}">${statusLabel(status)}</span>
      </div>
      <p class="account-order-date muted"><span data-i18n="account_order_date">${I18n.t('account_order_date')}</span>: ${UI.escapeHtml(dt)}</p>
      <p class="account-order-items">${UI.escapeHtml(items || '—')}</p>
      <p class="account-order-total"><span data-i18n="account_order_total">${I18n.t('account_order_total')}</span>: ${Store.formatPrice(o.total || 0, settings)}</p>
      <div class="account-order-actions">
        <a class="btn btn-sm btn-primary" href="order-status.html?id=${encodeURIComponent(o.id)}">${I18n.t('account_order_details')}</a>
        <button type="button" class="btn btn-sm btn-secondary js-order-help" data-order-id="${UI.escapeHtml(o.id || '')}">${I18n.t('account_order_help')}</button>
        ${reviewLinks(o)}
      </div>`;
    ordersList.appendChild(card);
  });
  applyI18n(ordersList);
  ordersList.querySelectorAll('.js-order-help').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.orderId;
      const order = orders.find((x) => x.id === id) || { id };
      if (typeof Chat === 'undefined' || !Chat.open) {
        UI.toast(I18n.t('chat_login_hint'));
        return;
      }
      await Chat.open({ message: helpMessage(order), send: true, orderId: order.id });
    });
  });
})();
