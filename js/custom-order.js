/* ============================================================
   YouCanSmile — индивидуальный заказ
   ============================================================ */
(async function initCustomOrder() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  await UI.renderHeader('custom');
  await UI.renderFooter();

  const me = await Api.getMe();
  if (me && me.role === 'customer') {
    const nameEl = document.getElementById('cName');
    const phoneEl = document.getElementById('cPhone');
    const contactEl = document.getElementById('cContact');
    if (nameEl && me.name) nameEl.value = me.name;
    if (phoneEl && me.phone) phoneEl.value = me.phone.startsWith('+') ? me.phone : me.phone;
    if (me.instagram && !me.telegram) {
      const ig = document.querySelector('input[name="cContactChannel"][value="instagram"]');
      if (ig) ig.checked = true;
    }
    if (contactEl) {
      const nick = me.telegram || me.instagram || '';
      if (nick) contactEl.value = nick.startsWith('@') ? nick : '@' + nick;
    }
  }

  const form = document.getElementById('customForm');
  const ok = document.getElementById('customOk');
  const photoInput = document.getElementById('cCharacterPhoto');
  const preview = document.getElementById('cCharacterPreview');
  let characterImage = '';

  function contactChannel() {
    return (document.querySelector('input[name="cContactChannel"]:checked') || {}).value || 'telegram';
  }

  const submitBtn = form && form.querySelector('button[type="submit"]');
  const checkoutContact =
    typeof CheckoutContact !== 'undefined'
      ? CheckoutContact.attach({
          phoneInput: document.getElementById('cPhone'),
          contactInput: document.getElementById('cContact'),
          getChannel: contactChannel,
          verifyHost: document.getElementById('cTgVerifyHost'),
          submitBtn: submitBtn,
          initialPhone: (me && me.phone) || document.getElementById('cPhone')?.value || '+998 ',
        })
      : null;

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
    if (!me || me.role !== 'customer') {
      UI.toast(I18n.t('order_login_required'));
      location.href = 'account.html?next=' + encodeURIComponent('custom-order.html');
      return;
    }
    const name = document.getElementById('cName').value.trim();
    const phoneGate = checkoutContact
      ? checkoutContact.gateBeforeSubmit()
      : { ok: true, phone: document.getElementById('cPhone').value.trim() };
    if (!phoneGate.ok) return;
    const phone = phoneGate.phone;
    const desc = document.getElementById('cDesc').value.trim();
    const contact = document.getElementById('cContact').value.trim();
    const channel = contactChannel();
    if (!name || !desc) {
      UI.toast(I18n.t('order_required'));
      return;
    }

    try {
      await Api.createOrder({
        type: 'custom',
        customerId: me.id,
        characterImage,
        customer: {
          name,
          phone,
          contact,
          contactChannel: channel,
          address: '',
          note: desc,
        },
        items: [],
        total: 0,
        customDescription: desc,
        lang: I18n.lang,
      });

      form.classList.add('hidden');
      ok.classList.remove('hidden');
    } catch (err) {
      const emsg = (err && err.message) || '';
      if (emsg === 'need_telegram_verify') {
        UI.toast(I18n.t('foreign_contact_title'));
        if (checkoutContact) checkoutContact.gateBeforeSubmit();
      } else if (emsg === 'bad_phone') {
        UI.toast(I18n.t('phone_incomplete'));
      } else {
        UI.toast(emsg || I18n.t('order_send_fail'));
      }
    }
  });
})();
