/* Checkout helpers: foreign-phone Telegram verify + social gate */
(function (global) {
  function ensureModal() {
    let el = document.getElementById('foreignContactModal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'foreignContactModal';
    el.className = 'ycs-modal-backdrop hidden';
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<div class="ycs-modal">' +
      '<h3 id="foreignContactModalTitle"></h3>' +
      '<p id="foreignContactModalText"></p>' +
      '<div class="ycs-modal-actions">' +
      '<button type="button" class="btn btn-primary" id="foreignContactModalVerify"></button>' +
      '<button type="button" class="btn btn-ghost" id="foreignContactModalClose"></button>' +
      '</div></div>';
    document.body.appendChild(el);
    return el;
  }

  function t(key, fallback) {
    try {
      if (typeof I18n !== 'undefined' && I18n.t) return I18n.t(key) || fallback;
    } catch (_) {}
    return fallback;
  }

  /**
   * @param {object} opts
   * @param {HTMLInputElement} opts.phoneInput
   * @param {HTMLInputElement} opts.contactInput
   * @param {function(): string} opts.getChannel
   * @param {HTMLElement} [opts.verifyHost] — container for verify button/badge
   * @param {HTMLButtonElement|HTMLInputElement} [opts.submitBtn]
   */
  function attach(opts) {
    const phoneInput = opts.phoneInput;
    const contactInput = opts.contactInput;
    const getChannel = opts.getChannel || function () { return 'telegram'; };
    const verifyHost = opts.verifyHost;
    const submitBtn = opts.submitBtn;
    let phoneCtl = null;
    let verified = false;
    let verifiedUsername = '';
    let pollTimer = null;
    let lastParsed = null;

    if (phoneInput && typeof Phone !== 'undefined' && Phone.bind) {
      phoneCtl = Phone.bind(phoneInput, {
        onChange: function (p) {
          lastParsed = p;
          syncVerifyUI();
          syncSubmit();
        },
      });
      if (opts.initialPhone) phoneCtl.setValue(opts.initialPhone);
      lastParsed = phoneCtl.getParsed();
    }

    function parsed() {
      if (phoneCtl) return phoneCtl.getParsed();
      if (typeof Phone !== 'undefined') return Phone.parsePhone(phoneInput.value);
      return { complete: !!phoneInput.value, isUz: true, e164: '', display: phoneInput.value };
    }

    function socialOk() {
      const raw = contactInput ? contactInput.value : '';
      if (typeof Phone !== 'undefined' && Phone.isValidSocialText) return Phone.isValidSocialText(raw);
      return String(raw || '').trim().length >= 3;
    }

    function canSubmitContact() {
      const p = parsed();
      if (!p.complete) return false;
      if (p.isUz) return socialOk();
      return verified || socialOk();
    }

    function syncSubmit() {
      if (!submitBtn) return;
      const phoneOk = parsed().complete;
      // Don't force-disable for other form fields; only phone completeness as hard gate
      if (!phoneOk) {
        submitBtn.disabled = true;
        return;
      }
      // Keep enabled; gate on submit with modal for foreign
      submitBtn.disabled = false;
    }

    function syncVerifyUI() {
      if (!verifyHost) return;
      const p = parsed();
      const need = p.complete && !p.isUz;
      verifyHost.classList.toggle('hidden', !need);
      const badge = verifyHost.querySelector('[data-tg-badge]');
      const btn = verifyHost.querySelector('[data-tg-verify-btn]');
      if (badge) {
        badge.classList.toggle('hidden', !verified);
        if (verified) {
          badge.textContent =
            t('tg_verified_badge', 'Telegram подтверждён') +
            (verifiedUsername ? ' (@' + verifiedUsername.replace(/^@/, '') + ')' : '');
        }
      }
      if (btn) btn.classList.toggle('hidden', !!verified);
      if (need && !verified) refreshStatus();
    }

    async function refreshStatus() {
      const p = parsed();
      if (!p.complete || p.isUz || typeof Api === 'undefined') return;
      try {
        const st = await Api.telegramVerifyStatus(p.display || '+' + p.e164);
        if (st && st.verified) {
          verified = true;
          verifiedUsername = st.telegramUsername || '';
          syncVerifyUI();
        }
      } catch (_) {}
    }

    function stopPoll() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }

    function startPoll() {
      stopPoll();
      pollTimer = setInterval(function () {
        refreshStatus().then(function () {
          if (verified) stopPoll();
        });
      }, 2000);
      setTimeout(stopPoll, 5 * 60 * 1000);
    }

    async function startVerify() {
      const p = parsed();
      if (!p.complete || p.isUz) return;
      try {
        const res = await Api.startTelegramVerify(p.display || '+' + p.e164);
        if (res && res.alreadyVerified) {
          verified = true;
          verifiedUsername = res.telegramUsername || '';
          syncVerifyUI();
          if (UI && UI.toast) UI.toast(t('tg_verified_badge', 'Telegram подтверждён'));
          return;
        }
        if (res && res.deepLink) {
          window.open(res.deepLink, '_blank', 'noopener');
          startPoll();
          if (UI && UI.toast) UI.toast(t('tg_verify_opened', 'Откройте бота и нажмите Start'));
        } else if (res && res.error === 'bot_username_missing') {
          if (UI && UI.toast) UI.toast(t('tg_bot_missing', 'Бот не настроен (TELEGRAM_BOT_USERNAME)'));
        }
      } catch (e) {
        if (UI && UI.toast) UI.toast(t('tg_verify_fail', 'Не удалось начать подтверждение'));
      }
    }

    function showModal() {
      const modal = ensureModal();
      const title = modal.querySelector('#foreignContactModalTitle');
      const text = modal.querySelector('#foreignContactModalText');
      const verifyBtn = modal.querySelector('#foreignContactModalVerify');
      const closeBtn = modal.querySelector('#foreignContactModalClose');
      if (title) title.textContent = t('foreign_contact_title', 'Нужна связь через соцсеть');
      if (text) {
        text.textContent = t(
          'foreign_contact_text',
          'Для номера не из Узбекистана подтвердите Telegram через бота или укажите Instagram / другую соцсеть (@username или ссылку).'
        );
      }
      if (verifyBtn) verifyBtn.textContent = t('tg_verify_btn', 'Подтвердить через Telegram');
      if (closeBtn) closeBtn.textContent = t('foreign_contact_close', 'Указать соцсеть');
      modal.classList.remove('hidden');
      verifyBtn.onclick = function () {
        modal.classList.add('hidden');
        startVerify();
      };
      closeBtn.onclick = function () {
        modal.classList.add('hidden');
        if (contactInput) {
          contactInput.focus();
          contactInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
      modal.onclick = function (ev) {
        if (ev.target === modal) modal.classList.add('hidden');
      };
    }

    /**
     * @returns {{ ok: boolean, phone?: string, reason?: string }}
     */
    function gateBeforeSubmit() {
      const p = parsed();
      if (!p.complete) {
        if (UI && UI.toast) UI.toast(t('phone_incomplete', 'Введите номер телефона полностью'));
        if (phoneInput) phoneInput.focus();
        return { ok: false, reason: 'bad_phone' };
      }
      if (p.isUz) {
        if (!socialOk()) {
          if (UI && UI.toast) UI.toast(t('order_required', 'Заполните контакты'));
          return { ok: false, reason: 'need_contact' };
        }
        return { ok: true, phone: p.display || '+' + p.e164 };
      }
      if (verified || socialOk()) {
        return { ok: true, phone: p.display || '+' + p.e164, telegramVerified: verified };
      }
      showModal();
      return { ok: false, reason: 'need_telegram_verify' };
    }

    if (verifyHost) {
      const btn = verifyHost.querySelector('[data-tg-verify-btn]');
      if (btn) btn.addEventListener('click', function (e) {
        e.preventDefault();
        startVerify();
      });
    }
    if (contactInput) {
      contactInput.addEventListener('input', function () {
        syncSubmit();
      });
    }

    syncVerifyUI();
    syncSubmit();
    refreshStatus();

    return {
      getParsed: parsed,
      gateBeforeSubmit: gateBeforeSubmit,
      isVerified: function () { return verified; },
      refreshStatus: refreshStatus,
      phoneCtl: phoneCtl,
    };
  }

  global.CheckoutContact = { attach: attach, ensureModal: ensureModal };
})(typeof window !== 'undefined' ? window : globalThis);
