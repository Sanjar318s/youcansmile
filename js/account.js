/* ============================================================
   YouCanSmile — личный кабинет покупателя
   ============================================================ */
(async function initAccount() {
  document.documentElement.lang = I18n.lang;
  applyI18n();

  const guest = document.getElementById('accountGuest');
  const userBox = document.getElementById('accountUser');
  const boot = document.getElementById('accountBoot');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const profileForm = document.getElementById('profileForm');
  const ordersList = document.getElementById('ordersList');
  const ordersEmpty = document.getElementById('ordersEmpty');
  let currentUser = null;
  let settings = {};

  function cacheMe(user) {
    try {
      if (user && user.role === 'customer') sessionStorage.setItem('ycs_me', JSON.stringify(user));
      else sessionStorage.removeItem('ycs_me');
    } catch (_) { /* ignore */ }
  }

  function readCachedMe() {
    try {
      const raw = sessionStorage.getItem('ycs_me');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setBoot(on) {
    if (boot) boot.classList.toggle('hidden', !on);
  }

  function fillProfileForm(user) {
    const nameEl = document.getElementById('profileName');
    const phoneEl = document.getElementById('profilePhone');
    const tgEl = document.getElementById('profileTelegram');
    const igEl = document.getElementById('profileInstagram');
    const addrEl = document.getElementById('profileAddress');
    if (!nameEl) return;
    nameEl.value = user.name || '';
    if (phoneEl) phoneEl.value = user.phone || '';
    if (tgEl) {
      tgEl.value = user.telegram
        ? user.telegram.startsWith('@')
          ? user.telegram
          : '@' + user.telegram
        : '';
    }
    if (igEl) {
      igEl.value = user.instagram
        ? user.instagram.startsWith('@')
          ? user.instagram
          : '@' + user.instagram
        : '';
    }
    if (addrEl) {
      addrEl.value = user.address || '';
      if (!addrEl.placeholder) addrEl.placeholder = I18n.t('account_address_ph');
    }
  }

  function paintUserShell(user) {
    if (!user || user.role !== 'customer') return;
    setBoot(false);
    if (guest) guest.classList.add('hidden');
    if (userBox) userBox.classList.remove('hidden');
    const nameEl = document.getElementById('accountName');
    const phoneEl = document.getElementById('accountPhone');
    if (nameEl) nameEl.textContent = user.name || '';
    if (phoneEl) phoneEl.textContent = user.phone || user.email || '';
    fillProfileForm(user);
  }

  function showGuest() {
    currentUser = null;
    cacheMe(null);
    setBoot(false);
    if (userBox) userBox.classList.add('hidden');
    if (guest) guest.classList.remove('hidden');
  }

  // Optimistic paint — avoid login form flash for logged-in users
  const cached = readCachedMe();
  if (cached && cached.role === 'customer') {
    paintUserShell(cached);
  } else {
    if (guest) guest.classList.add('hidden');
    if (userBox) userBox.classList.add('hidden');
    setBoot(true);
  }

  await Api.init();

  const mePromise = Api.getMe().catch(() => null);
  const settingsPromise = Api.getSettings().catch(() => ({}));
  const headerPromise = UI.renderHeader('account');
  const footerPromise = UI.renderFooter();

  const [me, s] = await Promise.all([mePromise, settingsPromise]);
  settings = s || {};

  if (me && me.role === 'customer') {
    currentUser = me;
    cacheMe(me);
    paintUserShell(me);
  } else {
    showGuest();
  }

  await Promise.all([headerPromise, footerPromise]);
  if (typeof Chat !== 'undefined') Chat.init();

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
    const label = Store.orderNumberLabel(order);
    const tpl = I18n.t('account_order_help_msg');
    return tpl.replace('{order}', label);
  }

  async function renderOrders() {
    if (!ordersList) return;
    let orders = [];
    try {
      orders = await Api.getMyOrders();
    } catch (_) {
      orders = [];
    }
    if (!Array.isArray(orders)) orders = [];
    // Newest first; keep cancelled and all other statuses
    orders = orders.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    ordersList.innerHTML = '';
    ordersEmpty.classList.toggle('hidden', orders.length > 0);
    orders.forEach((o) => {
      const card = document.createElement('article');
      card.className = 'account-order card';
      card.dataset.orderId = o.id || '';
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
        await Chat.open({ message: helpMessage(order), send: true });
      });
    });
  }

  function scrollToOrdersIfNeeded() {
    if (location.hash !== '#orders') return;
    const el = document.getElementById('orders');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function showUser(user) {
    if (!user || user.role !== 'customer') {
      showGuest();
      return;
    }
    currentUser = user;
    cacheMe(user);
    paintUserShell(user);
    applyI18n(userBox);
    await renderOrders();
    scrollToOrdersIfNeeded();
  }

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = profileForm.querySelector('button[type="submit"]');
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const telegram = document.getElementById('profileTelegram').value.trim();
    const instagram = document.getElementById('profileInstagram').value.trim();
    const address = document.getElementById('profileAddress').value.trim();
    if (!name) {
      UI.toast(I18n.t('account_profile_need_name'));
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const res = await Api.updateProfile({ name, phone, telegram, instagram, address });
      if (!res || res.ok === false) {
        UI.toast(res && res.error === 'phone_exists' ? I18n.t('account_err_phone_exists') : I18n.t('account_profile_err'));
        return;
      }
      const fresh = (await Api.getMe()) || res.user;
      if (!fresh || fresh.role !== 'customer') {
        UI.toast(I18n.t('account_profile_err'));
        return;
      }
      await showUser(fresh);
      UI.toast(I18n.t('account_profile_saved'));
    } catch (err) {
      UI.toast(err.message === 'phone_exists' ? I18n.t('account_err_phone_exists') : I18n.t('account_profile_err'));
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;
    const res = await Api.login(phone, password);
    if (!res.ok) {
      UI.toast(I18n.t('account_err_credentials'));
      return;
    }
    const user = (await Api.getMe()) || res.user;
    await showUser(user);
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
    const user = (await Api.getMe()) || res.user;
    await showUser(user);
    if (typeof Chat !== 'undefined') Chat.onLogin();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await Api.logout();
    showGuest();
    if (typeof Chat !== 'undefined') Chat.onLogout();
  });

  if (me && me.role === 'customer') {
    await renderOrders();
    scrollToOrdersIfNeeded();
  }
  window.addEventListener('hashchange', scrollToOrdersIfNeeded);
})();
