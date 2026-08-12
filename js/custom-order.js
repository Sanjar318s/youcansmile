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
    if (phoneEl && me.phone) phoneEl.value = me.phone.startsWith('+') ? me.phone : '+998 ' + me.phone.replace(/\D/g, '').slice(-9);
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
    if (!name || !phone || !desc || !contact) {
      UI.toast(I18n.t('order_required'));
      return;
    }

    await Api.createOrder({
      type: 'custom',
      customerId: me && me.role === 'customer' ? me.id : undefined,
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
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();
