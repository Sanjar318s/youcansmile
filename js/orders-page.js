/* ============================================================
   YouCanSmile — история заказов (live status + archive folders)
   ============================================================ */
(async function initOrdersPage() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();

  const guest = document.getElementById('ordersGuest');
  const userBox = document.getElementById('ordersUser');
  const ordersBoot = document.getElementById('ordersBoot');
  const ordersList = document.getElementById('ordersList');
  const ordersEmpty = document.getElementById('ordersEmpty');
  let settings = {};
  let orders = [];
  let pollTimer = null;
  let rendering = false;
  /** @type {Record<string, boolean>} preserved accordion open state */
  const folderOpen = { done: false, cancelled: false };

  const ACTIVE = ['new', 'processing', 'contacting', 'in_progress'];
  const ARCHIVE = ['done', 'cancelled'];
  const POLL_MS = 8000;

  function hideBoot() {
    if (!ordersBoot) return;
    ordersBoot.classList.add('hidden');
    ordersBoot.classList.remove('is-skeleton');
    ordersBoot.innerHTML = '';
    ordersBoot.removeAttribute('aria-busy');
  }

  function normalizeStatus(status) {
    if (ARCHIVE.includes(status) || ACTIVE.includes(status)) return status;
    return 'new';
  }

  function statusLabel(status) {
    const key = {
      new: 'admin_order_new',
      processing: 'admin_order_processing',
      contacting: 'admin_order_contacting',
      in_progress: 'admin_order_in_progress',
      done: 'admin_order_done',
      cancelled: 'admin_order_cancel',
    }[normalizeStatus(status)];
    return key ? I18n.t(key) : status;
  }

  function ordersFingerprint(list) {
    return (list || [])
      .map((o) => `${o.id}:${normalizeStatus(o.status)}:${o.updatedAt || o.createdAt || 0}:${o.total || 0}`)
      .sort()
      .join('|');
  }

  function reviewLinks(order) {
    if (!order.items || !order.items.length || order.type === 'custom') return '';
    if (normalizeStatus(order.status) === 'cancelled') return '';
    const uniq = [];
    order.items.forEach((it) => {
      if (it.productId && !uniq.includes(it.productId)) uniq.push(it.productId);
    });
    return uniq
      .map(
        (pid) =>
          `<a class="btn btn-sm btn-secondary" href="product.html?id=${encodeURIComponent(pid)}&reviewOrder=${encodeURIComponent(order.id)}">${I18n.t('review_leave')}</a>`
      )
      .join('');
  }

  function helpMessage(order) {
    return I18n.t('account_order_help_msg').replace('{order}', Store.orderNumberLabel(order));
  }

  function formatOrderDate(ts) {
    return new Date(ts || Date.now()).toLocaleString(I18n.lang === 'en' ? 'en-GB' : 'ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function orderCardHTML(o) {
    const status = normalizeStatus(o.status);
    const items =
      o.type === 'custom'
        ? I18n.t('custom_title')
        : (o.items || []).map((i) => `${i.title || i.productId} × ${i.qty || 1}`).join(', ');
    return `
      <article class="account-order card" data-order-id="${UI.escapeHtml(o.id || '')}" data-status="${UI.escapeHtml(status)}">
        <div class="account-order-top">
          <b class="account-order-num">${UI.escapeHtml(Store.orderNumberLabel(o))}</b>
          <span class="order-status ${UI.escapeHtml(status)}">${statusLabel(status)}</span>
        </div>
        <p class="account-order-date muted"><span data-i18n="account_order_date">${I18n.t('account_order_date')}</span>: ${UI.escapeHtml(formatOrderDate(o.createdAt))}</p>
        <p class="account-order-items">${UI.escapeHtml(items || '—')}</p>
        <p class="account-order-total"><span data-i18n="account_order_total">${I18n.t('account_order_total')}</span>: ${Store.formatPrice(o.total || 0, settings)}</p>
        <div class="account-order-actions">
          <a class="btn btn-sm btn-primary" href="order-status.html?id=${encodeURIComponent(o.id)}">${I18n.t('account_order_details')}</a>
          <button type="button" class="btn btn-sm btn-secondary js-order-help" data-order-id="${UI.escapeHtml(o.id || '')}">${I18n.t('account_order_help')}</button>
          ${reviewLinks(o)}
        </div>
      </article>`;
  }

  function archiveFolderHTML(status, list) {
    const open = !!folderOpen[status];
    const count = list.length;
    const body = count
      ? list.map(orderCardHTML).join('')
      : `<p class="account-orders-folder-empty muted">${I18n.t('account_orders_folder_empty')}</p>`;
    return `
      <section class="account-orders-folder${open ? ' is-open' : ''}${count ? '' : ' is-empty'}" data-folder="${status}">
        <button type="button" class="account-orders-folder-toggle js-orders-folder" aria-expanded="${open ? 'true' : 'false'}">
          <span class="account-orders-folder-chevron" aria-hidden="true"></span>
          <span class="order-status ${status}">${statusLabel(status)}</span>
          <span class="account-orders-folder-count">${count}</span>
        </button>
        <div class="account-orders-folder-body"${open ? '' : ' hidden'}>${body}</div>
      </section>`;
  }

  function bindHelpButtons(root) {
    root.querySelectorAll('.js-order-help').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.orderId;
        const order = orders.find((x) => x.id === id) || { id };
        const chat =
          typeof ChatLazy !== 'undefined' && ChatLazy.ensure
            ? await ChatLazy.ensure().catch(() => null)
            : typeof Chat !== 'undefined'
              ? Chat
              : null;
        if (!chat || !chat.open) {
          UI.toast(I18n.t('chat_login_hint'));
          return;
        }
        await chat.open({ message: helpMessage(order), send: true, orderId: order.id });
      });
    });
  }

  function bindFolderToggles(root) {
    root.querySelectorAll('.js-orders-folder').forEach((btn) => {
      btn.addEventListener('click', () => {
        const folder = btn.closest('.account-orders-folder');
        const body = folder?.querySelector('.account-orders-folder-body');
        const key = folder?.dataset.folder;
        if (!folder || !body || !key) return;
        const open = !folder.classList.contains('is-open');
        folder.classList.toggle('is-open', open);
        body.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        folderOpen[key] = open;
      });
    });
  }

  function renderOrders(list) {
    if (!ordersList || rendering) return;
    rendering = true;
    try {
      orders = (list || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const active = [];
      const byArchive = { done: [], cancelled: [] };
      orders.forEach((o) => {
        const st = normalizeStatus(o.status);
        if (st === 'done' || st === 'cancelled') byArchive[st].push(o);
        else active.push(o);
      });

      const hasAny = orders.length > 0;
      ordersEmpty.classList.toggle('hidden', hasAny);

      if (!hasAny) {
        ordersList.innerHTML = '';
        return;
      }

      const activeBlock = active.length
        ? `<div class="account-orders-active" data-folder="active">${active.map(orderCardHTML).join('')}</div>`
        : `<p class="account-orders-active-empty muted">${I18n.t('account_orders_active_empty')}</p>`;

      ordersList.innerHTML = `
        ${activeBlock}
        <div class="account-orders-archive">
          ${archiveFolderHTML('done', byArchive.done)}
          ${archiveFolderHTML('cancelled', byArchive.cancelled)}
        </div>`;

      applyI18n(ordersList);
      bindHelpButtons(ordersList);
      bindFolderToggles(ordersList);
    } finally {
      rendering = false;
    }
  }

  async function fetchOrders() {
    let next = [];
    try {
      next = await Api.getMyOrders();
    } catch (_) {
      next = [];
    }
    if (!Array.isArray(next)) next = [];
    return next;
  }

  async function refreshOrders(force) {
    const next = await fetchOrders();
    if (!force && ordersFingerprint(next) === ordersFingerprint(orders)) return;
    renderOrders(next);
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      refreshOrders(false).catch(() => {});
    }, POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener('visibilitychange', onVisibility);
  }

  function onVisibility() {
    if (!document.hidden) refreshOrders(false).catch(() => {});
  }

  await Promise.all([UI.renderHeader('orders'), UI.renderFooter()]);
  if (typeof Chat !== 'undefined') Chat.init();

  const me = await Api.getMe().catch(() => null);
  settings = (await Api.getSettings().catch(() => ({}))) || {};

  if (!me || me.role !== 'customer') {
    hideBoot();
    if (guest) guest.classList.remove('hidden');
    if (userBox) userBox.classList.add('hidden');
    return;
  }
  if (guest) guest.classList.add('hidden');
  if (userBox) userBox.classList.remove('hidden');
  if (ordersList && UI.showSkeleton) UI.showSkeleton(ordersList, 'orders', 3);

  const initial = await fetchOrders();
  if (UI.clearSkeleton) UI.clearSkeleton(ordersList);
  hideBoot();
  renderOrders(initial);
  startPolling();

  window.addEventListener('beforeunload', stopPolling, { once: true });
})();
