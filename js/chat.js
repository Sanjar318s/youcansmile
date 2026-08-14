/* ============================================================
   YouCanSmile — виджет чата (покупатель ↔ ИИ ↔ продавец)
   Hold-to-talk voice, location cards, optimistic media.
   ============================================================ */
const Chat = (() => {
  let root = null;
  let panel = null;
  let listEl = null;
  let inputEl = null;
  let replyBar = null;
  let composeEl = null;
  let recBar = null;
  let recTimerEl = null;
  let recHintEl = null;
  let me = null;
  let lastTs = 0;
  let pollTimer = null;
  let replyTo = null;
  let recorder = null;
  let recChunks = [];
  let recStream = null;
  let recStartedAt = 0;
  let recTick = null;
  let recCancel = false;
  let recPointerId = null;
  let recStartY = 0;
  let recStarting = false;
  let recStopQueued = false;
  let recMime = '';
  let voiceDocBound = false;
  let locMapApi = null;
  let locPending = null;
  let locPickerGen = 0;
  let activeAudio = null;
  let delegated = false;
  let closeRating = 0;
  let closeSubmitting = false;
  let needsSeller = false;
  let sellerConnected = false;
  let statusTyping = false;
  let lastProducts = [];
  let lastProductId = null;
  let lastSuggestedQty = null;
  let pendingCartKey = null;
  const cartAppliedIds = new Set();
  let welcomed = false;
  let settingsCache = null;
  let orderProduct = null;

  const AVATARS = {
    customer: '🙂',
    agent: '🤖',
    seller: '💬',
  };

  function escId(id) {
    const s = String(id || '');
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function findMsgEl(id) {
    return listEl?.querySelector(`[data-id="${escId(id)}"]`);
  }

  function authorLabel(author) {
    if (author === 'agent') return I18n.t('chat_agent');
    if (author === 'seller') return I18n.t('chat_seller');
    return me?.name || I18n.t('review_guest');
  }

  function fmtMsgClock(ts) {
    const d = new Date(Number(ts) || Date.now());
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(I18n.lang === 'en' ? 'en-GB' : I18n.lang === 'uz' ? 'uz-UZ' : 'ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function msgMetaHTML(m, mine) {
    const time = fmtMsgClock(m.createdAt);
    let ticks = '';
    if (mine) {
      if (m._failed) ticks = `<span class="chat-ticks is-failed" title="fail">!</span>`;
      else if (m._pending) ticks = `<span class="chat-ticks">✓</span>`;
      else ticks = `<span class="chat-ticks">✓✓</span>`;
    }
    return `<div class="chat-msg-meta"><span>${escape(time)}</span>${ticks}</div>`;
  }

  function updateHeadStatus() {
    const el = root?.querySelector('#chatHeadStatus');
    if (!el) return;
    const label = el.querySelector('.label');
    el.classList.toggle('is-typing', !!statusTyping);
    let text = I18n.t('chat_status_ai');
    if (statusTyping) text = I18n.t('chat_status_typing');
    else if (sellerConnected) text = I18n.t('chat_status_seller');
    else if (needsSeller) text = I18n.t('chat_status_seller_wait');
    if (label) label.textContent = text;
  }

  function setPanelOpen(open) {
    if (!panel || !root) return;
    panel.classList.toggle('hidden', !open);
    root.classList.toggle('is-open', !!open);
    if (!open) {
      stopPoll();
      closeAttachMenu();
      statusTyping = false;
      updateHeadStatus();
    }
  }

  function playReplySound() {
    try {
      if (localStorage.getItem('ycs_chat_mute') === '1') return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.start(now);
      o.stop(now + 0.2);
      setTimeout(() => ctx.close().catch(() => {}), 300);
      try {
        navigator.vibrate?.(12);
      } catch (_) {}
    } catch (_) {}
  }

  function openLightbox(src) {
    if (!src || !root) return;
    let box = root.querySelector('#chatLightbox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'chatLightbox';
      box.className = 'chat-lightbox hidden';
      box.innerHTML = `<button type="button" class="chat-lightbox-close" aria-label="close">×</button><img alt=""/>`;
      root.appendChild(box);
      box.addEventListener('click', (e) => {
        if (e.target === box || e.target.closest('.chat-lightbox-close')) {
          box.classList.add('hidden');
          box.querySelector('img').src = '';
        }
      });
    }
    box.querySelector('img').src = src;
    box.classList.remove('hidden');
  }

  function rememberProductsFromMessages(messages) {
    (messages || []).forEach((m) => {
      if (m.type !== 'product') return;
      let payload = m.payload;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (_) {
          payload = null;
        }
      }
      const products = payload && Array.isArray(payload.products) ? payload.products : payload ? [payload] : [];
      if (payload && payload.suggestedQty) {
        lastSuggestedQty = Math.max(1, Number(payload.suggestedQty) || 1);
      }
      products.forEach((p) => {
        if (!p || !p.id) return;
        lastProducts = lastProducts.filter((x) => x.id !== p.id).concat([p]);
        lastProductId = p.id;
      });
    });
  }

  function parsePayload(raw) {
    let payload = raw;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = null;
      }
    }
    return payload;
  }

  function cartKey(pid, qty) {
    return `${pid}:${Math.max(1, Number(qty) || 1)}`;
  }

  function applyCartActionsFromMessages(messages) {
    (messages || []).forEach((m) => {
      if (!m || (m.author !== 'agent' && m.type !== 'product')) return;
      const payload = parsePayload(m.payload);
      if (!payload || payload.action !== 'add_to_cart') return;
      if (m.id && cartAppliedIds.has(m.id)) return;
      const products = Array.isArray(payload.products) ? payload.products : payload.id ? [payload] : [];
      const p = products[0];
      if (!p || !p.id) return;
      const qty = Math.max(1, Number(payload.suggestedQty) || lastSuggestedQty || 1);
      const key = cartKey(p.id, qty);
      if (m.id) cartAppliedIds.add(m.id);
      lastProductId = p.id;
      lastSuggestedQty = qty;
      if (pendingCartKey === key) {
        pendingCartKey = null;
        return;
      }
      if (typeof Store !== 'undefined' && Store.addToCart) {
        Store.addToCart(p.id, qty);
        if (UI.toast) UI.toast(I18n.t('toast_cart_ok'));
        if (UI.syncCounts) UI.syncCounts();
      }
    });
  }

  function escape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function voiceHTML(url, durationHint) {
    return `
      <div class="chat-voice" data-src="${escape(url)}">
        <button type="button" class="chat-voice-play" aria-label="play">▶</button>
        <div class="chat-voice-wave"><i></i></div>
        <span class="chat-voice-time">${escape(durationHint || '0:00')}</span>
        <audio preload="metadata" src="${escape(url)}" hidden></audio>
      </div>`;
  }

  function locationHTML(lat, lng) {
    const la = Number(lat);
    const ln = Number(lng);
    const maps = `https://maps.google.com/?q=${la},${ln}`;
    const staticMap = `https://staticmap.openstreetmap.de/staticmap.php?center=${la},${ln}&zoom=15&size=320x140&markers=${la},${ln},red-pushpin`;
    return `
      <a class="chat-loc" href="${escape(maps)}" target="_blank" rel="noopener">
        <div class="chat-loc-map">
          <img src="${escape(staticMap)}" alt="" loading="lazy" onerror="this.remove()"/>
          <span class="chat-loc-pin" aria-hidden="true">📍</span>
        </div>
        <span class="chat-loc-label">${escape(I18n.t('chat_my_location'))}</span>
        <span class="chat-loc-coords">${la.toFixed(5)}, ${ln.toFixed(5)}</span>
        <span class="chat-loc-open">${escape(I18n.t('chat_open_map'))}</span>
      </a>`;
  }

  function productCardHTML(p) {
    const img = p.image || 'img/logo-ycs.png';
    const price = typeof Store !== 'undefined' ? Store.formatPrice(p.price) : `${p.price} UZS`;
    const stockCls = p.inStock === false ? 'no' : 'ok';
    const stockLabel = p.inStock === false ? I18n.t('chat_prod_outstock') : I18n.t('chat_prod_instock');
    return `
      <div class="chat-prod" data-pid="${escape(p.id)}">
        <img class="chat-prod-img" src="${escape(img)}" alt="" loading="lazy" data-lightbox="${escape(img)}" onerror="this.onerror=null;this.src='img/logo-ycs.png'"/>
        <div class="chat-prod-info">
          <div class="chat-prod-title">${escape(p.title)}</div>
          <div class="chat-prod-price">${escape(String(price))}</div>
          <span class="chat-prod-stock ${stockCls}">${escape(stockLabel)}</span>
        </div>
        <div class="chat-prod-actions">
          <button type="button" class="chat-prod-btn" data-act="cart" data-pid="${escape(p.id)}">${escape(I18n.t('chat_prod_cart'))}</button>
          <button type="button" class="chat-prod-btn primary" data-act="buy" data-pid="${escape(p.id)}">${escape(I18n.t('chat_prod_buy'))}</button>
        </div>
      </div>`;
  }

  function renderProductMessage(m) {
    let payload = m.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = null;
      }
    }
    const products = payload && Array.isArray(payload.products) ? payload.products : payload ? [payload] : [];
    if (payload && payload.suggestedQty) {
      lastSuggestedQty = Math.max(1, Number(payload.suggestedQty) || 1);
    }
    const cards = products.slice(0, 3).map(productCardHTML).join('');
    const reply = m.replyToId
      ? `<div class="chat-reply-ref">${I18n.t('chat_reply')} #${escape(String(m.replyToId).slice(-6))}</div>`
      : '';
    return `
      <div class="chat-msg theirs agent product" data-id="${escape(m.id)}">
        <div class="chat-avatar" title="${escape(authorLabel('agent'))}">${AVATARS.agent}</div>
        <div class="chat-bubble">
          <div class="chat-author">${escape(authorLabel('agent'))}</div>
          ${reply}
          ${m.text ? `<p>${escape(m.text)}</p>` : ''}
          <div class="chat-prod-list">${cards}</div>
          ${msgMetaHTML(m, false)}
        </div>
      </div>`;
  }

  function renderMessage(m) {
    if (m.type === 'typing') {
      return `
        <div class="chat-msg theirs agent typing" data-id="${escape(m.id)}">
          <div class="chat-avatar" title="${escape(authorLabel('agent'))}">${AVATARS.agent}</div>
          <div class="chat-bubble chat-bubble-typing">
            <span class="chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="chat-typing-label">${escape(I18n.t('chat_typing'))}</span>
          </div>
        </div>`;
    }
    if (m.type === 'product') {
      return renderProductMessage(m);
    }
    const mine = m.author === 'customer';
    const pending = m._pending ? ' pending' : '';
    const failed = m._failed ? ' failed' : '';
    const reply = m.replyToId
      ? `<div class="chat-reply-ref">${I18n.t('chat_reply')} #${escape(String(m.replyToId).slice(-6))}</div>`
      : '';
    let body = '';
    if (m.type === 'photo' && m.mediaUrl) {
      body = `<img class="chat-img" src="${escape(m.mediaUrl)}" alt="" loading="lazy" data-lightbox="${escape(m.mediaUrl)}"/>`;
      if (m.text) body += `<p>${escape(m.text)}</p>`;
    } else if (m.type === 'voice' && m.mediaUrl) {
      body = voiceHTML(m.mediaUrl, m._durationLabel);
      if (m.text) body += `<p>${escape(m.text)}</p>`;
    } else if (m.type === 'location' && m.lat != null && m.lng != null) {
      body = locationHTML(m.lat, m.lng);
      if (m.text) body += `<p>${escape(m.text)}</p>`;
    } else {
      body = `<p>${escape(m.text)}</p>`;
    }
    return `
      <div class="chat-msg ${mine ? 'mine' : 'theirs'} ${escape(m.author || '')}${pending}${failed}" data-id="${escape(m.id)}">
        <div class="chat-avatar" title="${escape(authorLabel(m.author))}">${AVATARS[m.author] || '•'}</div>
        <div class="chat-bubble">
          <div class="chat-author">${escape(authorLabel(m.author))}</div>
          ${reply}
          ${body}
          ${msgMetaHTML(m, mine)}
          <button type="button" class="chat-reply-btn" data-reply="${escape(m.id)}" title="${I18n.t('chat_reply')}">↩</button>
        </div>
      </div>`;
  }

  function bindVoicePlayers(scope) {
    (scope || listEl)?.querySelectorAll('.chat-voice').forEach((wrap) => {
      if (wrap.dataset.bound) return;
      wrap.dataset.bound = '1';
      const audio = wrap.querySelector('audio');
      const btn = wrap.querySelector('.chat-voice-play');
      const bar = wrap.querySelector('.chat-voice-wave > i');
      const timeEl = wrap.querySelector('.chat-voice-time');
      if (!audio || !btn) return;

      const syncMeta = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          timeEl.textContent = fmtTime(audio.duration);
        }
      };
      audio.addEventListener('loadedmetadata', syncMeta);
      if (audio.readyState >= 1) syncMeta();

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeAudio && activeAudio !== audio) {
          activeAudio.pause();
          listEl.querySelectorAll('.chat-voice-play').forEach((b) => {
            if (b !== btn) b.textContent = '▶';
          });
        }
        if (audio.paused) {
          audio.play().catch(() => {});
          btn.textContent = '❚❚';
          activeAudio = audio;
        } else {
          audio.pause();
          btn.textContent = '▶';
        }
      });
      audio.addEventListener('timeupdate', () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        bar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        timeEl.textContent = fmtTime(audio.duration - audio.currentTime);
      });
      audio.addEventListener('ended', () => {
        btn.textContent = '▶';
        bar.style.width = '0%';
        syncMeta();
      });
    });
  }

  function appendMessages(messages, replace) {
    if (!listEl) return;
    if (replace) listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    const tmp = document.createElement('div');
    const incoming = [];
    messages.forEach((m) => {
      if (findMsgEl(m.id)) return;
      incoming.push(m);
      tmp.innerHTML = renderMessage(m);
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      if (m.createdAt > lastTs) lastTs = m.createdAt;
    });
    listEl.appendChild(frag);
    listEl.scrollTop = listEl.scrollHeight;
    bindVoicePlayers(listEl);
    hideQuickIfNeeded();
    rememberProductsFromMessages(incoming);
    // Only live messages — don't re-add cart on history reload
    if (!replace) applyCartActionsFromMessages(incoming);
    const replyFromStaff = incoming.some((m) => m.author === 'agent' || m.author === 'seller');
    if (replyFromStaff && !replace && panel && !panel.classList.contains('hidden')) {
      playReplySound();
    }
  }

  function replaceMessageNode(tempId, realMsg) {
    const el = findMsgEl(tempId);
    if (!el) {
      appendMessages([realMsg], false);
      return;
    }
    el.outerHTML = renderMessage(realMsg);
    bindVoicePlayers(listEl);
    if (realMsg.createdAt > lastTs) lastTs = realMsg.createdAt;
    rememberProductsFromMessages([realMsg]);
    applyCartActionsFromMessages([realMsg]);
  }

  function removeMessageNode(id) {
    findMsgEl(id)?.remove();
  }

  function setReply(id) {
    replyTo = id;
    if (replyBar) {
      replyBar.classList.remove('hidden');
      replyBar.textContent = `${I18n.t('chat_reply')}: …${String(id).slice(-6)} · ${I18n.t('chat_reply_clear')}`;
    }
  }

  function clearReply() {
    replyTo = null;
    if (replyBar) {
      replyBar.classList.add('hidden');
      replyBar.textContent = '';
    }
  }

  async function refresh(full) {
    if (!me || me.role !== 'customer') return;
    try {
      const data = await Api.getChatThread(full ? 0 : lastTs);
      if (data.thread) {
        needsSeller = !!data.thread.needsSeller;
        sellerConnected = !!data.thread.sellerConnected;
        updateHeadStatus();
      }
      if (full) lastTs = 0;
      appendMessages(data.messages || [], full);
      if (full) maybeWelcome();
    } catch (_) { /* offline */ }
  }

  function maybeWelcome() {
    if (welcomed || !me || !listEl) return;
    if (listEl.querySelector('.chat-msg')) {
      welcomed = true;
      return;
    }
    welcomed = true;
    const name = (me.name || '').trim().split(/\s+/)[0];
    const text = name
      ? I18n.t('chat_welcome_named').replace('{name}', name)
      : I18n.t('chat_welcome');
    appendMessages(
      [
        {
          id: 'welcome_local',
          author: 'agent',
          type: 'text',
          text,
          createdAt: Date.now(),
        },
      ],
      false
    );
  }

  function startPoll() {
    stopPoll();
    if (!me || me.role !== 'customer') return;
    if (!panel || panel.classList.contains('hidden')) return;
    pollTimer = setInterval(() => refresh(false), 12000);
  }

  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function send(payload, optimistic) {
    if (!me) return null;
    const tempId = optimistic?.id;
    const typingId = 'typing_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    statusTyping = true;
    updateHeadStatus();
    appendMessages([{ id: typingId, author: 'agent', type: 'typing', text: '', createdAt: 0 }], false);
    try {
      const res = await Api.sendChatMessage(payload);
      removeMessageNode(typingId);
      statusTyping = false;
      if (typeof res.needsSeller === 'boolean') needsSeller = res.needsSeller;
      updateHeadStatus();
      const msgs = res.messages || [];
      if (tempId && msgs[0]) {
        replaceMessageNode(tempId, msgs[0]);
        if (msgs.length > 1) appendMessages(msgs.slice(1), false);
      } else {
        appendMessages(msgs, false);
      }
      clearReply();
      if (inputEl) inputEl.value = '';
      return res;
    } catch (err) {
      removeMessageNode(typingId);
      statusTyping = false;
      updateHeadStatus();
      if (tempId) {
        const el = findMsgEl(tempId);
        if (el) el.classList.add('failed');
      }
      UI.toast(I18n.t('chat_send_fail'));
      throw err;
    }
  }

  async function sendText(preset, orderId) {
    const text = (preset != null ? String(preset) : inputEl.value).trim();
    if (!text) return;
    if (/^(оформить|оформи|купить сейчас|buy now|checkout|rasmiylashtir)/i.test(text) && lastProductId) {
      if (inputEl) inputEl.value = '';
      syncActionBtn();
      openOrderSheet(lastProductId);
      return;
    }
    const cartExplicit = /в\s*к[ао]рзин|добав(ь|ить).*к[ао]рзин|add(\s+it)?\s+to\s+cart|savatga/i.test(text);
    if (cartExplicit && lastProductId && typeof Store !== 'undefined' && Store.addToCart) {
      const qty = Math.max(1, Number(lastSuggestedQty) || 1);
      pendingCartKey = cartKey(lastProductId, qty);
      Store.addToCart(lastProductId, qty);
      if (UI.toast) UI.toast(I18n.t('toast_cart_ok'));
      if (UI.syncCounts) UI.syncCounts();
    }
    const optimistic = {
      id: 'tmp_' + Date.now().toString(36),
      author: 'customer',
      type: 'text',
      text,
      replyToId: replyTo,
      createdAt: Date.now(),
      _pending: true,
    };
    appendMessages([optimistic], false);
    if (inputEl) inputEl.value = '';
    syncActionBtn();
    hideQuickIfNeeded();
    const payload = { type: 'text', text, replyToId: replyTo };
    if (orderId) payload.orderId = String(orderId).trim();
    await send(payload, optimistic);
  }

  function quickKeys() {
    return ['chat_q1', 'chat_q2', 'chat_q3', 'chat_q4', 'chat_q5'];
  }

  function renderQuick() {
    const wrap = root?.querySelector('#chatQuick');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="chat-quick-label">${escape(I18n.t('chat_quick_title'))}</div>
      <div class="chat-quick-row">
        <div class="chat-quick-chips" id="chatQuickChips">
          ${quickKeys().map((k) => `<button type="button" class="chat-quick-chip" data-quick="${escape(k)}">${escape(I18n.t(k))}</button>`).join('')}
        </div>
      </div>`;
    bindQuickSwipe(wrap.querySelector('.chat-quick-chips'));
  }

  function bindQuickSwipe(chips) {
    if (!chips || chips.dataset.swipeBound) return;
    chips.dataset.swipeBound = '1';
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    chips.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startScroll = chips.scrollLeft;
      chips.setPointerCapture?.(e.pointerId);
    });
    chips.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      chips.scrollLeft = startScroll - (e.clientX - startX);
    });
    const end = () => {
      dragging = false;
    };
    chips.addEventListener('pointerup', end);
    chips.addEventListener('pointercancel', end);
  }

  function hideQuickIfNeeded() {
    const wrap = root?.querySelector('#chatQuick');
    if (!wrap) return;
    // Keep shortcuts available like Telegram quick replies
    wrap.classList.remove('hidden');
  }

  function syncActionBtn() {
    const sendBtn = root?.querySelector('#chatSendBtn');
    const voiceBtn = root?.querySelector('#chatVoiceBtn');
    if (!sendBtn || !voiceBtn || !inputEl) return;
    const hasText = !!inputEl.value.trim();
    sendBtn.classList.toggle('hidden', !hasText);
    voiceBtn.classList.toggle('hidden', hasText);
  }

  function closeAttachMenu() {
    root?.querySelector('#chatAttachMenu')?.classList.add('hidden');
  }

  function toggleAttachMenu() {
    const menu = root?.querySelector('#chatAttachMenu');
    if (!menu) return;
    menu.classList.toggle('hidden');
  }

  async function sendPhoto(file) {
    if (!file) return;
    closeAttachMenu();
    const dataUrl = await UI.readFileAsDataURL(file);
    const optimistic = {
      id: 'tmp_' + Date.now().toString(36),
      author: 'customer',
      type: 'photo',
      mediaUrl: dataUrl,
      replyToId: replyTo,
      createdAt: Date.now(),
      _pending: true,
    };
    appendMessages([optimistic], false);
    hideQuickIfNeeded();
    try {
      const up = await Api.uploadMedia(dataUrl, file.type || 'image/jpeg');
      await send({ type: 'photo', text: '', mediaUrl: up.url, replyToId: replyTo }, optimistic);
    } catch (_) {
      removeMessageNode(optimistic.id);
      UI.toast(I18n.t('chat_send_fail'));
    }
  }

  async function sendVoiceBlob(blob, durationSec) {
    if (!blob || !blob.size) return;
    const localUrl = URL.createObjectURL(blob);
    const optimistic = {
      id: 'tmp_' + Date.now().toString(36),
      author: 'customer',
      type: 'voice',
      mediaUrl: localUrl,
      replyToId: replyTo,
      createdAt: Date.now(),
      _pending: true,
      _durationLabel: fmtTime(durationSec),
    };
    appendMessages([optimistic], false);
    hideQuickIfNeeded();
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const mime = blob.type || recMime || 'audio/webm';
      const up = await Api.uploadMedia(dataUrl, mime);
      await send({ type: 'voice', mediaUrl: up.url, replyToId: replyTo }, optimistic);
      URL.revokeObjectURL(localUrl);
    } catch (_) {
      URL.revokeObjectURL(localUrl);
      removeMessageNode(optimistic.id);
      UI.toast(I18n.t('chat_send_fail'));
    }
  }

  function loadMapsLib() {
    if (typeof YcsMaps !== 'undefined') return Promise.resolve(YcsMaps);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ycs-maps]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.YcsMaps), { once: true });
        existing.addEventListener('error', () => reject(new Error('maps')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = 'js/maps.js?v=20260813h';
      s.async = true;
      s.dataset.ycsMaps = '1';
      s.onload = () => resolve(window.YcsMaps);
      s.onerror = () => reject(new Error('maps'));
      document.head.appendChild(s);
    });
  }

  function getGeoOnce() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  function setLocConfirmEnabled(on) {
    const btn = root?.querySelector('#chatLocConfirm');
    if (btn) btn.disabled = !on;
  }

  function closeLocPicker() {
    locPickerGen += 1;
    const picker = root?.querySelector('#chatLocPicker');
    if (picker) picker.classList.add('hidden');
    document.body.classList.remove('chat-loc-open');
    if (locMapApi && locMapApi.destroy) {
      try {
        locMapApi.destroy();
      } catch (_) {}
    }
    locMapApi = null;
    locPending = null;
    setLocConfirmEnabled(false);
    const mapEl = root?.querySelector('#chatLocMap');
    if (mapEl) mapEl.innerHTML = '';
  }

  async function confirmLocPicker() {
    if (!locPending || locPending.length < 2) return;
    const lat = Number(locPending[0]);
    const lng = Number(locPending[1]);
    closeLocPicker();
    const optimistic = {
      id: 'tmp_' + Date.now().toString(36),
      author: 'customer',
      type: 'location',
      lat,
      lng,
      replyToId: replyTo,
      createdAt: Date.now(),
      _pending: true,
    };
    appendMessages([optimistic], false);
    hideQuickIfNeeded();
    await send({ type: 'location', lat, lng, replyToId: replyTo }, optimistic);
  }

  async function openLocPicker() {
    closeAttachMenu();
    const picker = root?.querySelector('#chatLocPicker');
    const mapEl = root?.querySelector('#chatLocMap');
    if (!picker || !mapEl) return;
    if (locMapApi && locMapApi.destroy) {
      try {
        locMapApi.destroy();
      } catch (_) {}
      locMapApi = null;
    }
    const gen = ++locPickerGen;
    picker.classList.remove('hidden');
    document.body.classList.add('chat-loc-open');
    setLocConfirmEnabled(false);
    locPending = null;
    mapEl.innerHTML = `<div class="map-loading">${escape(I18n.t('map_loading'))}</div>`;

    const [geo, settings] = await Promise.all([
      getGeoOnce(),
      Api.getSettings().catch(() => ({})),
    ]);
    if (gen !== locPickerGen) return;
    const center = geo || (typeof YcsMaps !== 'undefined' ? YcsMaps.TASHKENT : [41.2995, 69.2401]);
    locPending = center.slice();
    setLocConfirmEnabled(true);

    try {
      await loadMapsLib();
      if (gen !== locPickerGen) return;
      const apiKey = settings?.yandexMapsKey || '';
      if (locMapApi && locMapApi.destroy) {
        try {
          locMapApi.destroy();
        } catch (_) {}
      }
      locMapApi = await YcsMaps.mount(mapEl, {
        apiKey,
        emitInitial: false,
        initial: { coords: center },
        onPending: ({ coords }) => {
          if (!coords || coords.length < 2) return;
          locPending = coords.slice();
          setLocConfirmEnabled(true);
        },
        onPick: ({ coords }) => {
          if (!coords || coords.length < 2) return;
          locPending = coords.slice();
          setLocConfirmEnabled(true);
        },
      });
      if (gen !== locPickerGen) return;
      // OSM/Yandex already rendered; only hard-fail leaves hasMap false with map_error UI.
      if (locMapApi?.hasMap) {
        setTimeout(() => {
          try {
            locMapApi.setCenter?.(locPending || center);
          } catch (_) {}
        }, 100);
      }
    } catch (_) {
      if (gen !== locPickerGen) return;
      mapEl.innerHTML = `
        <div class="chat-loc-fallback">
          <div class="chat-loc-map" aria-hidden="true"><span class="chat-loc-pin">📍</span></div>
          <p>${escape(I18n.t('chat_loc_pick_hint'))}</p>
          <div class="chat-loc-coords">${center[0].toFixed(5)}, ${center[1].toFixed(5)}</div>
        </div>`;
    }
  }

  function sendLocation() {
    openLocPicker();
  }

  function pickRecorderMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/aac'];
    for (const t of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  function setRecordingUI(on) {
    if (!composeEl) return;
    composeEl.classList.toggle('recording', !!on);
    document.body.classList.toggle('chat-recording', !!on);
    closeAttachMenu();
    if (recHintEl) {
      recHintEl.textContent = I18n.t('chat_voice_slide_cancel');
      recHintEl.classList.toggle('cancel', false);
    }
  }

  function stopRecTimer() {
    if (recTick) clearInterval(recTick);
    recTick = null;
  }

  function startRecTimer() {
    stopRecTimer();
    recStartedAt = Date.now();
    if (recTimerEl) recTimerEl.textContent = '0:00';
    recTick = setInterval(() => {
      const sec = Math.floor((Date.now() - recStartedAt) / 1000);
      if (recTimerEl) recTimerEl.textContent = fmtTime(sec);
    }, 250);
  }

  function unbindVoiceDoc() {
    if (!voiceDocBound) return;
    voiceDocBound = false;
    document.removeEventListener('pointerup', onDocVoiceEnd, true);
    document.removeEventListener('pointercancel', onDocVoiceCancel, true);
    document.removeEventListener('pointermove', onVoicePointerMove, true);
  }

  function bindVoiceDoc() {
    if (voiceDocBound) return;
    voiceDocBound = true;
    document.addEventListener('pointerup', onDocVoiceEnd, true);
    document.addEventListener('pointercancel', onDocVoiceCancel, true);
    document.addEventListener('pointermove', onVoicePointerMove, true);
  }

  function onDocVoiceEnd(e) {
    if (recPointerId == null || e.pointerId !== recPointerId) return;
    const y = e.clientY;
    const cancel = y != null && recStartY - y > 56;
    finishRecord(cancel);
  }

  function onDocVoiceCancel(e) {
    if (recPointerId == null || (e.pointerId != null && e.pointerId !== recPointerId)) return;
    finishRecord(true);
  }

  function cleanupRecUi() {
    setRecordingUI(false);
    stopRecTimer();
    root?.querySelector('#chatVoiceBtn')?.classList.remove('holding');
    unbindVoiceDoc();
    recPointerId = null;
    recStarting = false;
    recStopQueued = false;
  }

  async function beginRecord(pointerId, clientY) {
    if (recorder || recStarting) return;
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      UI.toast(I18n.t('chat_mic_unavailable'));
      return;
    }
    recStarting = true;
    recStopQueued = false;
    recCancel = false;
    recPointerId = pointerId;
    recStartY = clientY;
    bindVoiceDoc();
    setRecordingUI(true);
    root?.querySelector('#chatVoiceBtn')?.classList.add('holding');
    try {
      recStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (recPointerId !== pointerId || recCancel) {
        recStream.getTracks().forEach((t) => t.stop());
        recStream = null;
        cleanupRecUi();
        return;
      }
      recChunks = [];
      recMime = pickRecorderMime();
      const rec = recMime ? new MediaRecorder(recStream, { mimeType: recMime }) : new MediaRecorder(recStream);
      recorder = rec;
      recMime = rec.mimeType || recMime || 'audio/webm';
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) recChunks.push(e.data);
      };
      rec.onstop = async () => {
        const started = recStartedAt || Date.now();
        const durationSec = Math.round((Date.now() - started) / 1000);
        const tracks = recStream ? recStream.getTracks() : [];
        tracks.forEach((t) => t.stop());
        recStream = null;
        cleanupRecUi();
        const cancelled = recCancel;
        const chunks = recChunks;
        recChunks = [];
        if (cancelled) return;
        if (durationSec < 1 || !chunks.length) {
          UI.toast(I18n.t('chat_voice_too_short'));
          return;
        }
        const blob = new Blob(chunks, { type: recMime || 'audio/webm' });
        if (!blob.size) {
          UI.toast(I18n.t('chat_voice_too_short'));
          return;
        }
        await sendVoiceBlob(blob, Math.max(1, durationSec));
      };
      startRecTimer();
      try {
        rec.start(200);
      } catch (_) {
        rec.start();
      }
      recStarting = false;
      if (recStopQueued) {
        const cancel = recCancel;
        recStopQueued = false;
        finishRecord(cancel);
      }
    } catch (_) {
      UI.toast(I18n.t('chat_mic_unavailable'));
      if (recStream) {
        recStream.getTracks().forEach((t) => t.stop());
        recStream = null;
      }
      cleanupRecUi();
    } finally {
      recStarting = false;
    }
  }

  function finishRecord(cancel) {
    recCancel = !!cancel;
    if (recStarting && !recorder) {
      recStopQueued = true;
      return;
    }
    const rec = recorder;
    recorder = null;
    if (rec && (rec.state === 'recording' || rec.state === 'paused')) {
      try {
        rec.requestData?.();
      } catch (_) {}
      try {
        rec.stop();
      } catch (_) {
        cleanupRecUi();
      }
      return;
    }
    cleanupRecUi();
  }

  function onVoicePointerMove(e) {
    if (recPointerId == null) return;
    if (e.pointerId != null && e.pointerId !== recPointerId) return;
    const y = e.clientY ?? (e.touches && e.touches[0]?.clientY);
    if (y == null) return;
    const dy = recStartY - y;
    const willCancel = dy > 56;
    if (recHintEl) {
      recHintEl.textContent = willCancel ? I18n.t('chat_voice_release_cancel') : I18n.t('chat_voice_slide_cancel');
      recHintEl.classList.toggle('cancel', willCancel);
    }
    recCancel = willCancel;
  }

  function bindVoiceHold(btn) {
    if (!btn) return;
    const arm = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (btn.classList.contains('hidden')) return;
      e.preventDefault();
      try {
        btn.setPointerCapture?.(e.pointerId);
      } catch (_) {}
      beginRecord(e.pointerId, e.clientY);
    };
    btn.addEventListener('pointerdown', arm);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => e.preventDefault());
  }

  function showLoginHint() {
    if (!panel) return;
    panel.querySelector('.chat-login-hint')?.classList.remove('hidden');
    panel.querySelector('.chat-compose')?.classList.add('hidden');
    panel.querySelector('#chatQuick')?.classList.add('hidden');
    panel.querySelector('#chatEndBtn')?.classList.add('hidden');
  }

  function showCompose() {
    if (!panel) return;
    panel.querySelector('.chat-login-hint')?.classList.add('hidden');
    panel.querySelector('.chat-compose')?.classList.remove('hidden');
    panel.querySelector('#chatEndBtn')?.classList.remove('hidden');
    renderQuick();
    hideQuickIfNeeded();
    syncActionBtn();
  }

  function setEndConfirmEnabled(on) {
    const btn = root?.querySelector('#chatEndConfirm');
    if (btn) btn.disabled = !on;
  }

  function renderStars() {
    const box = root?.querySelector('#chatStars');
    if (!box) return;
    box.querySelectorAll('.chat-star').forEach((el) => {
      const n = Number(el.dataset.star);
      el.classList.toggle('on', n <= closeRating);
    });
  }

  function openEndPicker() {
    if (!me) return;
    closeRating = 0;
    closeSubmitting = false;
    renderStars();
    setEndConfirmEnabled(false);
    const bodyEl = root?.querySelector('#chatEndBody');
    if (bodyEl) {
      bodyEl.classList.remove('hidden');
      bodyEl.querySelector('.chat-end-question')?.classList.remove('hidden');
      bodyEl.querySelector('.chat-end-sub')?.classList.remove('hidden');
      bodyEl.querySelector('#chatStars')?.classList.remove('hidden');
    }
    const picker = root?.querySelector('#chatEndPicker');
    if (picker) picker.classList.remove('hidden');
    document.body.classList.add('chat-end-open');
  }

  function closeEndPicker() {
    const picker = root?.querySelector('#chatEndPicker');
    if (picker) picker.classList.add('hidden');
    document.body.classList.remove('chat-end-open');
    setEndConfirmEnabled(false);
  }

  function setCloseRating(n) {
    closeRating = n;
    renderStars();
    setEndConfirmEnabled(true);
  }

  async function confirmEndPicker() {
    if (closeSubmitting) return;
    if (!closeRating) return;
    closeSubmitting = true;
    setEndConfirmEnabled(false);
    try {
      const res = await Api.closeChat({ rating: closeRating });
      if (res && res.ok) {
        const bodyEl = root?.querySelector('#chatEndBody');
        if (bodyEl) {
          bodyEl.querySelector('.chat-end-question')?.classList.add('hidden');
          bodyEl.querySelector('.chat-end-sub')?.classList.add('hidden');
          bodyEl.querySelector('#chatStars')?.classList.add('hidden');
          const q = bodyEl.querySelector('.chat-end-question');
          if (q) q.textContent = I18n.t('chat_end_thanks');
          q.classList.remove('hidden');
        }
        setTimeout(closeEndPicker, 1600);
      } else {
        UI.toast(I18n.t('chat_end_fail'));
        setEndConfirmEnabled(true);
      }
    } catch (_) {
      UI.toast(I18n.t('chat_end_fail'));
      setEndConfirmEnabled(true);
    } finally {
      closeSubmitting = false;
    }
  }

  function closeOrderSheet() {
    const picker = document.getElementById('chatOrderPicker');
    if (picker) picker.classList.add('hidden');
    document.body.classList.remove('chat-order-open');
    orderProduct = null;
  }

  async function resolveProduct(pid) {
    let p = lastProducts.find((x) => x.id === pid);
    if (p && p.price != null) return p;
    try {
      const full = await Api.getProduct(pid);
      if (full) {
        p = {
          id: full.id,
          title: I18n.txt(full.title) || full.title?.ru || pid,
          price: full.price,
          inStock: full.inStock !== false,
          image: (full.images && full.images[0]) || 'img/logo-ycs.png',
        };
        lastProducts = lastProducts.filter((x) => x.id !== p.id).concat([p]);
        return p;
      }
    } catch (_) {}
    return p || null;
  }

  async function openOrderSheet(pid) {
    if (!me) {
      showLoginHint();
      return;
    }
    const p = await resolveProduct(pid);
    if (!p) {
      UI.toast(I18n.t('chat_order_no_product'));
      return;
    }
    orderProduct = p;
    lastProductId = p.id;
    const qtyPrefill = Math.max(1, Number(lastSuggestedQty) || 1);
    settingsCache = settingsCache || (await Api.getSettings().catch(() => ({})));
    const s = settingsCache || {};
    const points = Array.isArray(s.pickupPoints) ? s.pickupPoints : [];
    const picker = document.getElementById('chatOrderPicker') || root?.querySelector('#chatOrderPicker');
    const body = document.getElementById('chatOrderBody') || root?.querySelector('#chatOrderBody');
    if (!picker || !body) return;
    if (picker.parentElement !== document.body) {
      document.body.appendChild(picker);
    }

    const price = typeof Store !== 'undefined' ? Store.formatPrice(p.price, s) : `${p.price} UZS`;
    const cardHint =
      I18n.txt(s.cardRequisites) ||
      `${s.cardRecipient || ''}\n${s.cardNumber || ''}`.trim() ||
      I18n.t('pay_requisites');

    body.innerHTML = `
      <div class="chat-order-prod">
        <img src="${escape(p.image || 'img/logo-ycs.png')}" alt=""/>
        <div>
          <div class="chat-prod-title">${escape(p.title)}</div>
          <div class="chat-prod-price">${escape(String(price))}</div>
        </div>
      </div>
      <div class="field">
        <label>${escape(I18n.t('order_name'))}</label>
        <input id="chatOrdName" value="${escape(me.name || '')}" autocomplete="name"/>
      </div>
      <div class="field">
        <label>${escape(I18n.t('order_phone'))}</label>
        <input id="chatOrdPhone" value="${escape(me.phone || '')}" autocomplete="tel" inputmode="tel"/>
      </div>
        <div class="field">
        <label>${escape(I18n.t('chat_order_qty'))}</label>
        <input id="chatOrdQty" type="number" min="1" step="1" value="${qtyPrefill}"/>
      </div>
      <div class="field">
        <label>${escape(I18n.t('fulfill_title'))}</label>
        <div class="chat-order-row">
          <label><input type="radio" name="chatFulfill" value="pickup" checked/> ${escape(I18n.t('fulfill_pickup'))}</label>
          <label><input type="radio" name="chatFulfill" value="delivery"/> ${escape(I18n.t('fulfill_delivery'))}</label>
        </div>
      </div>
      <div class="field" id="chatPickupField">
        <label>${escape(I18n.t('map_pickup_point'))}</label>
        <select id="chatOrdPickup">
          ${
            points.length
              ? points
                  .map(
                    (pt) =>
                      `<option value="${escape(pt.id)}">${escape(I18n.txt(pt.name) || pt.id)}</option>`
                  )
                  .join('')
              : `<option value="">${escape(I18n.t('map_pickup_empty'))}</option>`
          }
        </select>
      </div>
      <div class="field hidden" id="chatAddrField">
        <label>${escape(I18n.t('map_address_manual'))}</label>
        <textarea id="chatOrdAddr" rows="2" placeholder="${escape(I18n.t('map_address_manual'))}"></textarea>
      </div>
      <div class="field">
        <label>${escape(I18n.t('pay_title'))}</label>
        <div class="chat-order-row">
          <label><input type="radio" name="chatPay" value="card" checked/> ${escape(I18n.t('pay_card'))}</label>
          <label id="chatPayCashLabel"><input type="radio" name="chatPay" value="cash"/> ${escape(I18n.t('pay_cash'))}</label>
        </div>
      </div>
      <div id="chatCardBlock">
        <p class="chat-order-card-hint">${escape(cardHint)}</p>
        <div class="field">
          <label>${escape(I18n.t('pay_attach_receipt'))} (${escape(I18n.t('chat_order_receipt_optional'))})</label>
          <input type="file" accept="image/*" class="js-receipt-input" id="chatOrdReceipt"/>
        </div>
      </div>
      <div class="chat-loc-picker-actions" style="margin-top:12px">
        <button type="button" class="btn btn-ghost" id="chatOrdCancel">${escape(I18n.t('chat_loc_cancel'))}</button>
        <button type="button" class="btn btn-primary" id="chatOrdConfirm">${escape(I18n.t('chat_order_confirm'))}</button>
      </div>`;

    const syncFulfill = () => {
      const f = (body.querySelector('input[name="chatFulfill"]:checked') || {}).value || 'pickup';
      body.querySelector('#chatPickupField')?.classList.toggle('hidden', f !== 'pickup');
      body.querySelector('#chatAddrField')?.classList.toggle('hidden', f !== 'delivery');
      const cashLabel = body.querySelector('#chatPayCashLabel');
      if (cashLabel) {
        cashLabel.style.display = f === 'pickup' ? '' : 'none';
        if (f === 'delivery') {
          const card = body.querySelector('input[name="chatPay"][value="card"]');
          if (card) card.checked = true;
        }
      }
      const pay = (body.querySelector('input[name="chatPay"]:checked') || {}).value || 'card';
      body.querySelector('#chatCardBlock')?.classList.toggle('hidden', pay !== 'card');
    };
    body.querySelectorAll('input[name="chatFulfill"], input[name="chatPay"]').forEach((el) => {
      el.addEventListener('change', syncFulfill);
    });
    syncFulfill();
    body.querySelector('#chatOrdCancel')?.addEventListener('click', closeOrderSheet);
    body.querySelector('#chatOrdConfirm')?.addEventListener('click', () => {
      submitChatOrder().catch((err) => UI.toast(err?.message || I18n.t('chat_send_fail')));
    });

    picker.classList.remove('hidden');
    document.body.classList.add('chat-order-open');
  }

  async function submitChatOrder() {
    if (!orderProduct || !me) return;
    const body = document.getElementById('chatOrderBody') || root?.querySelector('#chatOrderBody');
    if (!body) return;
    const name = body.querySelector('#chatOrdName')?.value.trim();
    const phone = body.querySelector('#chatOrdPhone')?.value.trim();
    const qty = Math.max(1, Number(body.querySelector('#chatOrdQty')?.value) || 1);
    const fulfillment = (body.querySelector('input[name="chatFulfill"]:checked') || {}).value || 'pickup';
    let payment = (body.querySelector('input[name="chatPay"]:checked') || {}).value || 'card';
    const pickupId = body.querySelector('#chatOrdPickup')?.value || '';
    const addressManual = body.querySelector('#chatOrdAddr')?.value.trim() || '';
    const s = settingsCache || (await Api.getSettings().catch(() => ({})));
    const points = Array.isArray(s.pickupPoints) ? s.pickupPoints : [];
    const pt = points.find((p) => p.id === pickupId);

    if (!name || !phone) {
      UI.toast(I18n.t('order_required'));
      return;
    }
    if (fulfillment === 'delivery' && payment === 'cash') {
      payment = 'card';
    }
    if (fulfillment === 'pickup' && !pickupId) {
      UI.toast(I18n.t('order_fulfillment_required'));
      return;
    }
    if (fulfillment === 'delivery' && !addressManual) {
      UI.toast(I18n.t('order_fulfillment_required'));
      return;
    }

    let paymentReceipt = '';
    if (payment === 'card' && typeof UI.getReceiptDataURL === 'function') {
      paymentReceipt = await UI.getReceiptDataURL(body);
    }

    const title = orderProduct.title;
    const price = Number(orderProduct.price) || 0;
    const items = [{ productId: orderProduct.id, title, price, qty }];
    const total = price * qty;
    const address =
      fulfillment === 'pickup' ? (pt ? I18n.txt(pt.address) : '') : addressManual;

    const btn = body.querySelector('#chatOrdConfirm');
    if (btn) {
      btn.disabled = true;
      btn.textContent = I18n.t('chat_order_sending');
    }

    try {
      const order = await Api.createOrder({
        type: 'cart',
        customerId: me.id,
        fulfillment,
        payment,
        pickupPoint: fulfillment === 'pickup' ? pickupId : '',
        coords: null,
        paymentReceipt: paymentReceipt || '',
        customer: {
          name,
          phone,
          contactChannel: 'telegram',
          contact: phone,
          address,
          note: I18n.t('chat_order_note_source'),
        },
        items,
        total,
        currency: 'UZS',
        displayCurrency: Store.getDisplayCurrency ? Store.getDisplayCurrency() : 'UZS',
        lang: I18n.lang,
      });
      closeOrderSheet();
      const num = order.number || order.id;
      const link = `order-status.html?id=${encodeURIComponent(order.id)}`;
      appendMessages(
        [
          {
            id: 'order_ok_' + Date.now().toString(36),
            author: 'agent',
            type: 'text',
            text: I18n.t('chat_order_success').replace('{n}', String(num)),
            createdAt: Date.now(),
            _orderLink: link,
          },
        ],
        false
      );
      const last = listEl?.querySelector('.chat-msg:last-child .chat-bubble');
      if (last && link) {
        const a = document.createElement('a');
        a.href = link;
        a.className = 'chat-order-ok-link';
        a.textContent = I18n.t('chat_order_open_status');
        last.appendChild(a);
      }
      UI.toast(I18n.t('chat_order_success_toast'));
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = I18n.t('chat_order_confirm');
      }
      throw err;
    }
  }

  function ensureDelegation() {
    if (delegated || !listEl) return;
    delegated = true;
    listEl.addEventListener('click', (e) => {
      const lb = e.target.closest('[data-lightbox]');
      if (lb && listEl.contains(lb)) {
        e.preventDefault();
        openLightbox(lb.getAttribute('data-lightbox') || lb.getAttribute('src'));
        return;
      }
      const pbtn = e.target.closest('[data-act]');
      if (pbtn && listEl.contains(pbtn)) {
        e.preventDefault();
        e.stopPropagation();
        const id = pbtn.dataset.pid;
        const act = pbtn.dataset.act;
        if (!id) return;
        if (act === 'cart') {
          Store.addToCart(id, Math.max(1, Number(lastSuggestedQty) || 1));
          UI.toast(I18n.t('toast_cart_ok'));
          if (UI.syncCounts) UI.syncCounts();
        } else if (act === 'buy') {
          openOrderSheet(id);
        }
        return;
      }
      const btn = e.target.closest('[data-reply]');
      if (btn && listEl.contains(btn)) {
        e.preventDefault();
        setReply(btn.dataset.reply);
      }
    });
  }

  function buildUI() {
    if (root || /admin\.html/i.test(location.pathname)) return;
    root = document.createElement('div');
    root.className = 'chat-widget';
    root.innerHTML = `
      <button type="button" class="chat-fab" id="chatFab" aria-label="${I18n.t('chat_open')}">
        <span class="chat-fab-face" aria-hidden="true">
          <img src="img/chat-fab-cat.svg" alt="" width="64" height="64" decoding="async" fetchpriority="low"/>
        </span>
        <span class="chat-fab-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
            <path d="M5 6.8c0-1.3 1.1-2.3 2.4-2.3h9.2c1.3 0 2.4 1 2.4 2.3v6.1c0 1.3-1.1 2.3-2.4 2.3H11l-3.6 3.2V15.2H7.4C6.1 15.2 5 14.2 5 12.9V6.8z" fill="currentColor"/>
            <circle cx="9.2" cy="9.7" r="1.05" fill="#7d936a"/>
            <circle cx="12" cy="9.7" r="1.05" fill="#7d936a"/>
            <circle cx="14.8" cy="9.7" r="1.05" fill="#7d936a"/>
          </svg>
        </span>
      </button>
      <div class="chat-panel hidden" id="chatPanel">
        <div class="chat-head">
          <div class="chat-head-main">
            <div class="chat-head-avatar" aria-hidden="true">🛍️</div>
            <div class="chat-head-text">
              <b data-i18n="chat_title">${I18n.t('chat_title')}</b>
              <div class="chat-head-status" id="chatHeadStatus">
                <span class="dot" aria-hidden="true"></span>
                <span class="label">${I18n.t('chat_status_ai')}</span>
              </div>
            </div>
          </div>
          <div class="chat-head-actions">
            <button type="button" class="chat-end-btn hidden" id="chatEndBtn" title="${I18n.t('chat_end_btn')}">${I18n.t('chat_end_btn')}</button>
            <button type="button" class="icon-btn chat-close" id="chatClose" aria-label="close">×</button>
          </div>
        </div>
        <div class="chat-login-hint hidden">
          <p data-i18n="chat_login_hint">${I18n.t('chat_login_hint')}</p>
          <a class="btn btn-primary" href="account.html">${I18n.t('account_login_btn')}</a>
        </div>
        <div class="chat-messages" id="chatMessages"></div>
        <div class="chat-quick" id="chatQuick"></div>
        <div class="chat-reply-bar hidden" id="chatReplyBar"></div>
        <div class="chat-compose" id="chatCompose">
          <div class="chat-rec-bar" id="chatRecBar">
            <span class="chat-rec-dot" aria-hidden="true"></span>
            <span data-i18n="chat_voice_rec">${I18n.t('chat_voice_rec')}</span>
            <span id="chatRecTimer">0:00</span>
            <span class="chat-rec-hint" id="chatRecHint">${I18n.t('chat_voice_slide_cancel')}</span>
          </div>
          <div class="chat-tg-row">
            <div class="chat-attach-wrap">
              <button type="button" class="chat-icon-btn" id="chatAttachBtn" title="${I18n.t('chat_attach')}" aria-label="${I18n.t('chat_attach')}">📎</button>
              <div class="chat-attach-menu hidden" id="chatAttachMenu" role="menu">
                <button type="button" role="menuitem" id="chatGalleryBtn">🖼 ${I18n.t('chat_gallery')}</button>
                <button type="button" role="menuitem" id="chatCameraBtn">📷 ${I18n.t('chat_camera')}</button>
                <button type="button" role="menuitem" id="chatLocBtn">📍 ${I18n.t('chat_location')}</button>
              </div>
              <input type="file" accept="image/*" id="chatPhotoInput" hidden/>
              <input type="file" accept="image/*" capture="environment" id="chatCameraInput" hidden/>
            </div>
            <input type="text" id="chatInput" placeholder="${I18n.t('chat_placeholder')}" autocomplete="off" enterkeyhint="send"/>
            <button type="button" class="chat-action-btn chat-send-btn hidden" id="chatSendBtn" title="${I18n.t('chat_send')}" aria-label="${I18n.t('chat_send')}">➤</button>
            <button type="button" class="chat-action-btn chat-voice-btn" id="chatVoiceBtn" title="${I18n.t('chat_voice_hold')}" aria-label="${I18n.t('chat_voice_hold')}">🎤</button>
          </div>
        </div>
        <div class="chat-loc-picker hidden" id="chatLocPicker" role="dialog" aria-modal="true" aria-label="${I18n.t('chat_loc_pick_title')}">
          <div class="chat-loc-picker-backdrop" id="chatLocBackdrop"></div>
          <div class="chat-loc-picker-sheet">
            <div class="chat-loc-picker-head">
              <b>${I18n.t('chat_loc_pick_title')}</b>
              <button type="button" class="icon-btn chat-close" id="chatLocClose" aria-label="close">×</button>
            </div>
            <p class="chat-loc-picker-hint">${I18n.t('chat_loc_pick_hint')}</p>
            <div class="chat-loc-picker-map ycs-map" id="chatLocMap"></div>
            <div class="chat-loc-picker-actions">
              <button type="button" class="btn btn-ghost" id="chatLocCancel">${I18n.t('chat_loc_cancel')}</button>
              <button type="button" class="btn btn-primary" id="chatLocConfirm" disabled>${I18n.t('chat_loc_confirm')}</button>
            </div>
          </div>
        </div>
        <div class="chat-loc-picker hidden" id="chatEndPicker" role="dialog" aria-modal="true" aria-label="${I18n.t('chat_end_title')}">
          <div class="chat-loc-picker-backdrop" id="chatEndBackdrop"></div>
          <div class="chat-loc-picker-sheet chat-end-sheet">
            <div class="chat-loc-picker-head">
              <b>${I18n.t('chat_end_title')}</b>
              <button type="button" class="icon-btn chat-close" id="chatEndClose" aria-label="close">×</button>
            </div>
            <div class="chat-end-body" id="chatEndBody">
              <p class="chat-end-question">${I18n.t('chat_end_question')}</p>
              <p class="chat-end-sub">${I18n.t('chat_end_sub')}</p>
              <div class="chat-stars" id="chatStars" role="radiogroup" aria-label="${I18n.t('chat_end_sub')}">
                <button type="button" class="chat-star" data-star="1" role="radio" aria-label="1">★</button>
                <button type="button" class="chat-star" data-star="2" role="radio" aria-label="2">★</button>
                <button type="button" class="chat-star" data-star="3" role="radio" aria-label="3">★</button>
                <button type="button" class="chat-star" data-star="4" role="radio" aria-label="4">★</button>
                <button type="button" class="chat-star" data-star="5" role="radio" aria-label="5">★</button>
              </div>
              <div class="chat-loc-picker-actions">
                <button type="button" class="btn btn-ghost" id="chatEndCancel">${I18n.t('chat_end_cancel')}</button>
                <button type="button" class="btn btn-primary" id="chatEndConfirm" disabled>${I18n.t('chat_end_confirm')}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="chat-loc-picker hidden" id="chatOrderPicker" role="dialog" aria-modal="true" aria-label="${I18n.t('chat_order_title')}">
          <div class="chat-loc-picker-backdrop" id="chatOrderBackdrop"></div>
          <div class="chat-loc-picker-sheet chat-order-sheet">
            <div class="chat-loc-picker-head">
              <b>${I18n.t('chat_order_title')}</b>
              <button type="button" class="icon-btn chat-close" id="chatOrderClose" aria-label="close">×</button>
            </div>
            <div class="chat-end-body" id="chatOrderBody"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    panel = root.querySelector('#chatPanel');
    listEl = root.querySelector('#chatMessages');
    inputEl = root.querySelector('#chatInput');
    replyBar = root.querySelector('#chatReplyBar');
    composeEl = root.querySelector('#chatCompose');
    recBar = root.querySelector('#chatRecBar');
    recTimerEl = root.querySelector('#chatRecTimer');
    recHintEl = root.querySelector('#chatRecHint');
    ensureDelegation();
    renderQuick();

    root.querySelector('#chatFab').addEventListener('click', async () => {
      const willOpen = panel.classList.contains('hidden');
      setPanelOpen(willOpen);
      if (willOpen) {
        await ensureSession();
        if (me) {
          await refresh(true);
          hideQuickIfNeeded();
          startPoll();
          updateHeadStatus();
        }
      }
    });
    root.querySelector('#chatClose').addEventListener('click', () => {
      setPanelOpen(false);
    });
    root.querySelector('#chatSendBtn').addEventListener('click', () => sendText());
    inputEl.addEventListener('input', syncActionBtn);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendText();
      }
    });
    replyBar.addEventListener('click', clearReply);

    root.querySelector('#chatAttachBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAttachMenu();
    });
    const galleryInput = root.querySelector('#chatPhotoInput');
    const cameraInput = root.querySelector('#chatCameraInput');
    root.querySelector('#chatGalleryBtn').addEventListener('click', () => {
      closeAttachMenu();
      galleryInput.click();
    });
    root.querySelector('#chatCameraBtn').addEventListener('click', () => {
      closeAttachMenu();
      cameraInput.click();
    });
    const onPhoto = (input) => {
      if (input.files && input.files[0]) sendPhoto(input.files[0]);
      input.value = '';
    };
    galleryInput.addEventListener('change', () => onPhoto(galleryInput));
    cameraInput.addEventListener('change', () => onPhoto(cameraInput));
    bindVoiceHold(root.querySelector('#chatVoiceBtn'));
    root.querySelector('#chatLocBtn').addEventListener('click', sendLocation);
    root.querySelector('#chatLocClose')?.addEventListener('click', closeLocPicker);
    root.querySelector('#chatLocCancel')?.addEventListener('click', closeLocPicker);
    root.querySelector('#chatLocBackdrop')?.addEventListener('click', closeLocPicker);
    root.querySelector('#chatLocConfirm')?.addEventListener('click', () => {
      confirmLocPicker().catch(() => UI.toast(I18n.t('chat_send_fail')));
    });

    root.querySelector('#chatEndBtn')?.addEventListener('click', openEndPicker);
    root.querySelector('#chatEndClose')?.addEventListener('click', closeEndPicker);
    root.querySelector('#chatEndCancel')?.addEventListener('click', closeEndPicker);
    root.querySelector('#chatEndBackdrop')?.addEventListener('click', closeEndPicker);
    root.querySelector('#chatStars')?.addEventListener('click', (e) => {
      const star = e.target.closest('.chat-star');
      if (!star) return;
      setCloseRating(Number(star.dataset.star));
    });
    root.querySelector('#chatEndConfirm')?.addEventListener('click', () => {
      confirmEndPicker().catch(() => UI.toast(I18n.t('chat_end_fail')));
    });

    root.querySelector('#chatOrderClose')?.addEventListener('click', closeOrderSheet);
    root.querySelector('#chatOrderBackdrop')?.addEventListener('click', closeOrderSheet);

    root.querySelector('#chatQuick').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-quick]');
      if (!chip) return;
      const key = chip.getAttribute('data-quick');
      sendText(I18n.t(key));
    });

    document.addEventListener('pointerdown', (e) => {
      if (!root.contains(e.target)) closeAttachMenu();
      else if (!e.target.closest('.chat-attach-wrap')) closeAttachMenu();
    });

    syncActionBtn();
  }

  let sessionWarmed = false;

  async function syncSession() {
    me = await Api.getMe();
    if (me && me.role === 'customer') {
      showCompose();
      if (panel && !panel.classList.contains('hidden')) {
        await refresh(true);
        startPoll();
      }
    } else {
      me = null;
      stopPoll();
      showLoginHint();
    }
  }

  async function ensureSession() {
    if (sessionWarmed) return;
    sessionWarmed = true;
    await syncSession();
    if (me && typeof YcsPush !== 'undefined') YcsPush.warm();
  }

  async function init() {
    buildUI();
    const warm = () => {
      ensureSession().catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(warm, { timeout: 3500 });
    } else {
      setTimeout(warm, 1200);
    }
  }

  async function onLogin() {
    await syncSession();
    if (typeof YcsPush !== 'undefined') YcsPush.subscribe(true);
  }

  function onLogout() {
    me = null;
    stopPoll();
    if (listEl) listEl.innerHTML = '';
    lastTs = 0;
    showLoginHint();
  }

  /** Open chat panel; optional draft/send text (e.g. order help). */
  async function open(opts = {}) {
    if (!root) buildUI();
    if (!panel) return;
    setPanelOpen(true);
    await ensureSession();
    if (!me) {
      showLoginHint();
      return;
    }
    await refresh(true);
    hideQuickIfNeeded();
    startPoll();
    updateHeadStatus();
    const msg = opts.message != null ? String(opts.message).trim() : '';
    if (!msg) return;
    if (opts.send) {
      await sendText(msg, opts.orderId);
    } else if (inputEl) {
      inputEl.value = msg;
      syncActionBtn();
      inputEl.focus();
    }
  }

  return { init, onLogin, onLogout, open };
})();
