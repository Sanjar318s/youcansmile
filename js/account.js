/* ============================================================
   YouCanSmile — личный кабинет покупателя
   ============================================================ */
(async function initAccount() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const s = await Api.getSettings();
  await UI.renderHeader('account');
  await UI.renderFooter();
  if (typeof Chat !== 'undefined') Chat.init();

  const guest = document.getElementById('accountGuest');
  const userBox = document.getElementById('accountUser');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const ordersList = document.getElementById('ordersList');
  const ordersEmpty = document.getElementById('ordersEmpty');

  const params = new URLSearchParams(location.search);
  if (params.get('err') === 'google') UI.toast(I18n.t('account_err_google'));

  document.querySelectorAll('.account-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.account-tab').forEach((b) => b.classList.toggle('active', b === btn));
      const tab = btn.dataset.tab;
      loginForm.classList.toggle('hidden', tab !== 'login');
      registerForm.classList.toggle('hidden', tab !== 'register');
    });
  });

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

  async function renderOrders() {
    const orders = await Api.getMyOrders();
    ordersList.innerHTML = '';
    ordersEmpty.classList.toggle('hidden', orders.length > 0);
    orders.forEach((o) => {
      const card = document.createElement('div');
      card.className = 'account-order card';
      const dt = new Date(o.createdAt || Date.now()).toLocaleString();
      const items =
        o.type === 'custom'
          ? I18n.t('custom_title')
          : (o.items || []).map((i) => `${i.title || i.productId} × ${i.qty || 1}`).join(', ');
      card.innerHTML = `
        <div class="account-order-top">
          <b>#${UI.escapeHtml(o.id)}</b>
          <span class="order-status ${UI.escapeHtml(o.status || 'new')}">${statusLabel(o.status)}</span>
        </div>
        <p class="muted">${UI.escapeHtml(dt)}</p>
        <p>${UI.escapeHtml(items || '')}</p>
        <p><span data-i18n="account_order_total">${I18n.t('account_order_total')}</span>: ${Store.formatPrice(o.total || 0, s)}</p>
        <div class="account-order-actions">
          <a class="btn btn-sm" href="order-status.html?id=${encodeURIComponent(o.id)}">${I18n.t('order_status_title')}</a>
          ${reviewLinks(o)}
        </div>`;
      ordersList.appendChild(card);
    });
    applyI18n(ordersList);
  }

  async function showUser(me) {
    guest.classList.add('hidden');
    userBox.classList.remove('hidden');
    document.getElementById('accountName').textContent = me.name || '';
    document.getElementById('accountPhone').textContent = me.phone || me.email || '';
    await renderOrders();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;
    const res = await Api.login(phone, password);
    if (!res.ok) {
      UI.toast(I18n.t('account_err_credentials'));
      return;
    }
    await showUser(res.user);
    if (typeof Chat !== 'undefined') Chat.onLogin();
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const res = await Api.register({ name, phone, password });
    if (!res.ok) {
      UI.toast(res.error === 'phone_exists' ? I18n.t('account_err_phone_exists') : I18n.t('account_err_credentials'));
      return;
    }
    await showUser(res.user);
    if (typeof Chat !== 'undefined') Chat.onLogin();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await Api.logout();
    userBox.classList.add('hidden');
    guest.classList.remove('hidden');
    if (typeof Chat !== 'undefined') Chat.onLogout();
  });

  const me = await Api.getMe();
  if (me && me.role === 'customer') await showUser(me);
})();
