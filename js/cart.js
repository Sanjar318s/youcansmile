/* ============================================================
   YoucanSmile — корзина, избранное, оформление заказа
   ============================================================ */
(async function initCart() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const [s, , me, prods] = await Promise.all([
    Api.getSettings(),
    Promise.all([UI.renderHeader('cart'), UI.renderFooter()]),
    Api.getMe().catch(() => null),
    Api.getProducts(),
  ]);

  if (me && me.role === 'customer') {
    const nameEl = document.getElementById('oName');
    const phoneEl = document.getElementById('oPhone');
    const contactEl = document.getElementById('oContactUser');
    const addressEl = document.getElementById('oAddress');
    if (nameEl && me.name) nameEl.value = me.name;
    if (phoneEl && me.phone) phoneEl.value = me.phone.startsWith('+') ? me.phone : me.phone;
    if (me.instagram && !me.telegram) {
      const ig = document.querySelector('input[name="oContactChannel"][value="instagram"]');
      if (ig) ig.checked = true;
    }
    if (contactEl) {
      const nick = me.telegram || me.instagram || '';
      if (nick) contactEl.value = nick.startsWith('@') ? nick : '@' + nick;
    }
    if (addressEl && me.address) addressEl.value = me.address;
  }

  const listEl = document.getElementById('cartList');
  const emptyEl = document.getElementById('cartEmpty');
  const layoutEl = document.getElementById('cartLayout');
  if (listEl && UI.showSkeleton) UI.showSkeleton(listEl, 'cart', 3);
  const sumItems = document.getElementById('sumItems');
  const sumTotal = document.getElementById('sumTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const orderForm = document.getElementById('orderForm');
  const orderOk = document.getElementById('orderOk');
  const orderLinks = document.getElementById('orderLinks');
  const prodById = Object.fromEntries(prods.map((p) => [p.id, p]));

  let mapApi = null;
  let picked = { coords: null, address: '' };

  const pickupSelect = document.getElementById('oPickupPoint');
  const pickupPoints = Array.isArray(s.pickupPoints) ? s.pickupPoints : [];
  pickupSelect.innerHTML = '';
  if (!pickupPoints.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = I18n.t('map_pickup_empty');
    pickupSelect.appendChild(opt);
    pickupSelect.disabled = true;
  } else {
    pickupSelect.disabled = false;
    pickupPoints.forEach((pt) => {
      const opt = document.createElement('option');
      opt.value = pt.id;
      opt.textContent = I18n.txt(pt.name) + ' — ' + I18n.txt(pt.address);
      pickupSelect.appendChild(opt);
    });
  }

  const payRequisites = document.getElementById('payRequisites');
  payRequisites.innerHTML = UI.payRequisitesHTML(s);
  UI.bindPayRequisites(payRequisites);
  applyI18n(payRequisites);

  function getFulfillment() {
    return (document.querySelector('input[name="fulfillment"]:checked') || {}).value || 'pickup';
  }
  function getPayment() {
    return (document.querySelector('input[name="payment"]:checked') || {}).value || 'card';
  }
  function getContactChannel() {
    return (document.querySelector('input[name="oContactChannel"]:checked') || {}).value || 'telegram';
  }

  const orderSubmitBtn = orderForm && orderForm.querySelector('button[type="submit"]');
  const checkoutContact =
    typeof CheckoutContact !== 'undefined'
      ? CheckoutContact.attach({
          phoneInput: document.getElementById('oPhone'),
          contactInput: document.getElementById('oContactUser'),
          getChannel: getContactChannel,
          verifyHost: document.getElementById('oTgVerifyHost'),
          submitBtn: orderSubmitBtn,
          initialPhone: (me && me.phone) || document.getElementById('oPhone')?.value || '+998 ',
        })
      : null;

  function selectedPickup() {
    return pickupPoints.find((p) => p.id === pickupSelect.value) || null;
  }

  function syncFulfillmentUI() {
    const mode = getFulfillment();
    const cashWrap = document.getElementById('payCashWrap');
    const cardOnly = document.getElementById('payCardOnly');
    const pickupField = document.getElementById('pickupPointField');
    const mapField = document.getElementById('orderMapField');
    const addressField = document.getElementById('orderAddressField');
    const addressLabel = addressField.querySelector('label');
    const addressInput = document.getElementById('oAddress');

    if (mode === 'delivery') {
      cashWrap.classList.add('hidden');
      cardOnly.classList.remove('hidden');
      pickupField.classList.add('hidden');
      mapField.classList.remove('hidden');
      addressField.classList.remove('hidden');
      if (addressLabel) addressLabel.textContent = I18n.t('map_address_manual');
      if (addressInput) {
        addressInput.readOnly = false;
        addressInput.value = picked.address || '';
      }
      const cash = document.querySelector('input[name="payment"][value="cash"]');
      if (cash && cash.checked) {
        document.querySelector('input[name="payment"][value="card"]').checked = true;
      }
      ensureMap();
    } else {
      cashWrap.classList.remove('hidden');
      cardOnly.classList.add('hidden');
      pickupField.classList.remove('hidden');
      mapField.classList.add('hidden');
      addressField.classList.add('hidden');
      if (addressInput) {
        addressInput.readOnly = true;
        const pt = selectedPickup();
        addressInput.value = pt ? I18n.txt(pt.address) : '';
      }
    }
    syncPaymentUI();
  }

  function syncPaymentUI() {
    const pay = getPayment();
    payRequisites.classList.toggle('hidden', pay !== 'card');
  }

  document.querySelectorAll('input[name="fulfillment"]').forEach((el) => el.addEventListener('change', syncFulfillmentUI));
  document.querySelectorAll('input[name="payment"]').forEach((el) => el.addEventListener('change', syncPaymentUI));
  syncFulfillmentUI();

  pickupSelect.addEventListener('change', () => {
    const pt = selectedPickup();
    if (!pt) return;
    const addr = I18n.txt(pt.address);
    document.getElementById('oAddress').value = addr;
    picked = { coords: pt.coords || null, address: addr };
  });
  if (pickupSelect.options.length && pickupSelect.value) pickupSelect.dispatchEvent(new Event('change'));

  async function ensureMap() {
    if (mapApi) return;
    if (getFulfillment() !== 'delivery') return;
    mapApi = await YcsMaps.mount(document.getElementById('orderMap'), {
      apiKey: s.yandexMapsKey || '',
      confirm: true,
      onPick: ({ coords, address }) => {
        picked = { coords, address };
        if (address) document.getElementById('oAddress').value = address;
      },
      initial: picked.coords ? { coords: picked.coords } : {},
    });
  }

  function render() {
    const items = Store.getCart()
      .map((i) => ({ item: i, p: prodById[i.productId] }))
      .filter((x) => x.p);

    if (!items.length) {
      layoutEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      checkoutBtn.disabled = true;
      if (UI.clearSkeleton) UI.clearSkeleton(listEl);
      listEl.innerHTML = '';
      return;
    }
    layoutEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    checkoutBtn.disabled = false;

    listEl.innerHTML = items
      .map(
        ({ item, p }) => `
        <div class="cart-row">
          <a href="product.html?id=${p.id}"><img src="${p.images[0]}" alt="${UI.escapeHtml(I18n.txt(p.title))}" loading="lazy" decoding="async"/></a>
          <div class="cr-info">
            <a class="cr-title" href="product.html?id=${p.id}">${UI.escapeHtml(I18n.txt(p.title))}</a>
            <div class="cr-price">${Store.formatPrice(p.price, s)} × ${item.qty}</div>
          </div>
          <div class="cr-right">
            <div class="qty">
              <button data-op="minus" data-id="${p.id}">−</button>
              <input type="text" value="${item.qty}" readonly/>
              <button data-op="plus" data-id="${p.id}">+</button>
            </div>
            <div style="display:flex; align-items:center; gap:16px;">
              <span class="cr-total">${Store.formatPrice(p.price * item.qty, s)}</span>
              <button class="cr-remove" data-del="${p.id}">✕</button>
            </div>
          </div>
        </div>`
      )
      .join('');
    if (UI.clearSkeleton) UI.clearSkeleton(listEl);

    const total = items.reduce((sum, { item, p }) => sum + p.price * item.qty, 0);
    const qty = items.reduce((sum, { item }) => sum + item.qty, 0);
    sumItems.textContent = qty;
    sumTotal.textContent = Store.formatPrice(total, s);

    listEl.querySelectorAll('[data-op]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const cur = Store.getCart().find((i) => i.productId === id);
        if (!cur) return;
        Store.setQty(id, cur.qty + (btn.dataset.op === 'plus' ? 1 : -1));
        render();
        UI.syncCounts();
      })
    );
    listEl.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', () => {
        Store.removeFromCart(btn.dataset.del);
        render();
        UI.syncCounts();
      })
    );
  }

  render();
  applyI18n(orderForm);

  checkoutBtn.addEventListener('click', async () => {
    if (!me || me.role !== 'customer') {
      UI.toast(I18n.t('order_login_required'));
      setTimeout(() => {
        location.href = 'account.html?next=' + encodeURIComponent('cart.html');
      }, 600);
      return;
    }
    orderForm.classList.toggle('hidden');
    if (!orderForm.classList.contains('hidden')) {
      syncFulfillmentUI();
      orderForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  orderForm.addEventListener(
    'invalid',
    (ev) => {
      const t = ev.target;
      if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    true
  );

  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!me || me.role !== 'customer') {
      UI.toast(I18n.t('order_login_required'));
      location.href = 'account.html?next=' + encodeURIComponent('cart.html');
      return;
    }
    const name = document.getElementById('oName').value.trim();
    const phoneGate = checkoutContact
      ? checkoutContact.gateBeforeSubmit()
      : { ok: true, phone: document.getElementById('oPhone').value.trim() };
    if (!phoneGate.ok) return;
    const phone = phoneGate.phone;
    const contactUser = document.getElementById('oContactUser').value.trim();
    const contactChannel = getContactChannel();
    const fulfillment = getFulfillment();
    let payment = getPayment();
    const pt = fulfillment === 'pickup' ? selectedPickup() : null;
    const address =
      fulfillment === 'pickup'
        ? (pt ? I18n.txt(pt.address) : '')
        : document.getElementById('oAddress').value.trim() || picked.address;

    if (!name) {
      UI.toast(I18n.t('order_required'));
      document.getElementById('oName')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (fulfillment === 'delivery' && payment === 'cash') {
      UI.toast(I18n.t('order_delivery_card_only'));
      payment = 'card';
    }
    if (fulfillment === 'pickup') {
      if (!pt || !pickupSelect.value) {
        UI.toast(I18n.t('order_fulfillment_required'));
        return;
      }
    } else if (!address && !picked.coords) {
      UI.toast(I18n.t('order_fulfillment_required'));
      return;
    }

    let paymentReceipt = '';
    if (payment === 'card') {
      paymentReceipt = await UI.getReceiptDataURL(payRequisites);
      if (!paymentReceipt) {
        UI.toast(I18n.t('pay_receipt_required'));
        const receiptInput = payRequisites.querySelector('.js-receipt-input');
        if (receiptInput) receiptInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const items = Store.getCart()
      .map((i) => ({
        productId: i.productId,
        title: I18n.txt(prodById[i.productId]?.title),
        price: prodById[i.productId]?.price,
        qty: i.qty,
      }))
      .filter((i) => i.title);
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const pickupPoint = fulfillment === 'pickup' ? pickupSelect.value : '';
    const submitBtn = orderForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const order = await Api.createOrder({
        type: 'cart',
        customerId: me.id,
        fulfillment,
        payment,
        pickupPoint,
        coords: fulfillment === 'delivery' ? picked.coords : null,
        paymentReceipt,
        customer: {
          name,
          phone,
          contactChannel,
          contact: contactUser,
          address,
          note: document.getElementById('oNote').value.trim(),
        },
        items,
        total,
        currency: 'UZS',
        displayCurrency: Store.getDisplayCurrency(),
        lang: I18n.lang,
      });

      orderForm.classList.add('hidden');
      orderOk.classList.remove('hidden');
      checkoutBtn.hidden = true;

      const payLabel = payment === 'cash' ? I18n.t('pay_cash') : I18n.t('pay_card');
      const fulfillLabel = fulfillment === 'pickup' ? I18n.t('fulfill_pickup') : I18n.t('fulfill_delivery');
      const channelLabel = contactChannel === 'instagram' ? I18n.t('contact_instagram') : I18n.t('contact_telegram');
      const msg = encodeURIComponent(
        `🛍️ ${I18n.t('order_title')} — ${Store.orderNumberLabel(order)}\n` +
          `\n${items.map((i) => `• ${i.title} × ${i.qty} = ${Store.formatPrice(i.price * i.qty, s)}`).join('\n')}\n` +
          `\n${I18n.t('cart_total')}: ${Store.formatPrice(total, s)}\n` +
          `\n📦 ${fulfillLabel}\n💳 ${payLabel}\n` +
          `\n👤 ${name}\n📞 ${phone}\n💬 ${channelLabel}: ${contactUser}` +
          (address ? `\n📍 ${address}` : '') +
          (fulfillment === 'delivery' && picked.coords ? `\n🧭 ${picked.coords.join(', ')}` : '') +
          (document.getElementById('oNote').value.trim() ? `\n📝 ${document.getElementById('oNote').value.trim()}` : '') +
          (payment === 'card' ? `\n\n${s.cardRecipient || 'Mirsagatova Madina'}\n${s.cardNumber || ''}` : '')
      );

      const waHref = UI.normalizeContactHref('whatsapp', (s.contacts && s.contacts.whatsapp) || '');
      const tgHref = UI.normalizeContactHref('telegram', (s.contacts && s.contacts.telegram) || '');
      orderLinks.innerHTML =
        (waHref
          ? `<a class="btn btn-sm btn-gold" target="_blank" rel="noopener" href="${waHref}?text=${msg}">${I18n.t('order_send_whatsapp')}</a>`
          : '') +
        (tgHref
          ? `<a class="btn btn-sm btn-primary" target="_blank" rel="noopener" href="${tgHref}?text=${msg}">${I18n.t('order_send_telegram')}</a>`
          : '');

      Store.clearCart();
      UI.syncCounts();
    } catch (err) {
      const emsg = (err && err.message) || '';
      if (emsg === 'auth' || emsg === 'login_required') {
        UI.toast(I18n.t('order_login_required'));
        location.href = 'account.html?next=' + encodeURIComponent('cart.html');
      } else if (emsg === 'need_telegram_verify') {
        UI.toast(I18n.t('foreign_contact_title'));
        if (checkoutContact) checkoutContact.gateBeforeSubmit();
      } else if (emsg === 'bad_phone') {
        UI.toast(I18n.t('phone_incomplete'));
      } else if (emsg === 'need_contact') {
        UI.toast(I18n.t('order_required'));
      } else {
        UI.toast(emsg || I18n.t('order_send_fail'));
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();
