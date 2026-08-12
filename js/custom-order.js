/* ============================================================
   YouCanSmile — индивидуальный заказ
   ============================================================ */
(async function initCustomOrder() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const s = await Api.getSettings();
  await UI.renderHeader('custom');
  await UI.renderFooter();

  const me = await Api.getMe();
  if (me && me.role === 'customer') {
    const nameEl = document.getElementById('cName');
    const phoneEl = document.getElementById('cPhone');
    const contactEl = document.getElementById('cContact');
    const addressEl = document.getElementById('cAddress');
    if (nameEl && me.name) nameEl.value = me.name;
    if (phoneEl && me.phone) phoneEl.value = me.phone.startsWith('+') ? me.phone : '+998 ' + me.phone.replace(/\D/g, '').slice(-9);
    if (me.instagram && !me.telegram) {
      const ig = document.querySelector('input[name="cContactChannel"][value="instagram"]');
      if (ig) ig.checked = true;
    }
    if (contactEl) {
      const nick = me.telegram || me.instagram || '';
      if (nick) contactEl.value = nick.startsWith('@') ? nick : '@' + nick;
    }
    if (addressEl && me.address) addressEl.value = me.address;
  }

  const form = document.getElementById('customForm');
  const ok = document.getElementById('customOk');
  const pickup = document.getElementById('cPickup');
  const photoInput = document.getElementById('cCharacterPhoto');
  const preview = document.getElementById('cCharacterPreview');
  let picked = { coords: null, address: '' };
  let mapApi = null;
  let characterImage = '';

  (s.pickupPoints || []).forEach((pt) => {
    const opt = document.createElement('option');
    opt.value = pt.id;
    opt.textContent = I18n.txt(pt.name) + ' — ' + I18n.txt(pt.address);
    pickup.appendChild(opt);
  });

  const payBox = document.getElementById('cPayRequisites');
  payBox.innerHTML = UI.payRequisitesHTML(s);
  UI.bindPayRequisites(payBox);
  applyI18n(payBox);

  function fulfill() {
    return (document.querySelector('input[name="cFulfill"]:checked') || {}).value || 'pickup';
  }
  function payment() {
    return (document.querySelector('input[name="cPay"]:checked') || {}).value || 'card';
  }
  function contactChannel() {
    return (document.querySelector('input[name="cContactChannel"]:checked') || {}).value || 'telegram';
  }

  async function ensureMap() {
    if (mapApi) return;
    if (fulfill() !== 'delivery') return;
    mapApi = await YcsMaps.mount(document.getElementById('customMap'), {
      apiKey: s.yandexMapsKey,
      onPick: ({ coords, address }) => {
        picked = { coords, address };
        if (address) document.getElementById('cAddress').value = address;
      },
      initial: picked.coords ? { coords: picked.coords } : {},
    });
  }

  function syncUI() {
    const mode = fulfill();
    document.getElementById('cPickupWrap').classList.toggle('hidden', mode !== 'pickup');
    document.getElementById('cMapField').classList.toggle('hidden', mode !== 'delivery');
    document.getElementById('cPayCashWrap').classList.toggle('hidden', mode === 'delivery');
    document.getElementById('cPayCardOnly').classList.toggle('hidden', mode !== 'delivery');
    if (mode === 'delivery') {
      document.querySelector('input[name="cPay"][value="card"]').checked = true;
      ensureMap();
    }
    payBox.classList.toggle('hidden', payment() !== 'card');
  }

  document.querySelectorAll('input[name="cFulfill"]').forEach((el) => el.addEventListener('change', syncUI));
  document.querySelectorAll('input[name="cPay"]').forEach((el) => el.addEventListener('change', syncUI));
  syncUI();

  pickup.addEventListener('change', () => {
    const pt = (s.pickupPoints || []).find((p) => p.id === pickup.value);
    if (!pt) return;
    document.getElementById('cAddress').value = I18n.txt(pt.address);
    picked = { coords: pt.coords, address: I18n.txt(pt.address) };
    if (mapApi && mapApi.setCenter) mapApi.setCenter(pt.coords);
  });
  if (pickup.options.length) pickup.dispatchEvent(new Event('change'));

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) {
      characterImage = '';
      preview.innerHTML = I18n.t('custom_character_photo_empty');
      return;
    }
    characterImage = await UI.readFileAsDataURL(file);
    preview.innerHTML = `<img src="${characterImage}" alt="character"/>`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cName').value.trim();
    const phone = document.getElementById('cPhone').value.trim();
    const desc = document.getElementById('cDesc').value.trim();
    const contact = document.getElementById('cContact').value.trim();
    const channel = contactChannel();
    const address = document.getElementById('cAddress').value.trim() || picked.address;
    let pay = payment();
    const mode = fulfill();
    if (mode === 'delivery') pay = 'card';
    if (!name || !phone || !desc || !contact) {
      UI.toast(I18n.t('order_required'));
      return;
    }
    if (mode === 'pickup') {
      if (!pickup.value && !address) {
        UI.toast(I18n.t('order_fulfillment_required'));
        return;
      }
    } else if (!address && !picked.coords) {
      UI.toast(I18n.t('order_fulfillment_required'));
      return;
    }

    let paymentReceipt = '';
    if (pay === 'card') {
      paymentReceipt = await UI.getReceiptDataURL(payBox);
      if (!paymentReceipt) {
        UI.toast(I18n.t('pay_receipt_required'));
        return;
      }
    }

    const order = await Api.createOrder({
      type: 'custom',
      customerId: me && me.role === 'customer' ? me.id : undefined,
      fulfillment: mode,
      payment: pay,
      pickupPoint: mode === 'pickup' ? pickup.value : '',
      coords: mode === 'delivery' ? picked.coords : null,
      paymentReceipt,
      characterImage,
      customer: {
        name,
        phone,
        contact,
        contactChannel: channel,
        address,
        note: desc,
      },
      items: [],
      total: 0,
      customDescription: desc,
      lang: I18n.lang,
    });

    form.classList.add('hidden');
    ok.classList.remove('hidden');
  });
})();
