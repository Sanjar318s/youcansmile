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

  function renderMessage(m) {
    const mine = m.author === 'customer';
    const pending = m._pending ? ' pending' : '';
    const failed = m._failed ? ' failed' : '';
    const reply = m.replyToId
      ? `<div class="chat-reply-ref">${I18n.t('chat_reply')} #${escape(String(m.replyToId).slice(-6))}</div>`
      : '';
    let body = '';
    if (m.type === 'photo' && m.mediaUrl) {
      body = `<a href="${escape(m.mediaUrl)}" target="_blank" rel="noopener"><img class="chat-img" src="${escape(m.mediaUrl)}" alt="" loading="lazy"/></a>`;
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
    messages.forEach((m) => {
      if (findMsgEl(m.id)) return;
      tmp.innerHTML = renderMessage(m);
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      if (m.createdAt > lastTs) lastTs = m.createdAt;
    });
    listEl.appendChild(frag);
    listEl.scrollTop = listEl.scrollHeight;
    bindVoicePlayers(listEl);
    hideQuickIfNeeded();
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
      if (full) lastTs = 0;
      appendMessages(data.messages || [], full);
    } catch (_) { /* offline */ }
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
    try {
      const res = await Api.sendChatMessage(payload);
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
      if (tempId) {
        const el = findMsgEl(tempId);
        if (el) el.classList.add('failed');
      }
      UI.toast(I18n.t('chat_send_fail'));
      throw err;
    }
  }

  async function sendText(preset) {
    const text = (preset != null ? String(preset) : inputEl.value).trim();
    if (!text) return;
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
    await send({ type: 'text', text, replyToId: replyTo }, optimistic);
  }

  function quickKeys() {
    return ['chat_q1', 'chat_q2', 'chat_q3', 'chat_q4', 'chat_q5'];
  }

  function renderQuick() {
    const wrap = root?.querySelector('#chatQuick');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="chat-quick-label">${escape(I18n.t('chat_quick_title'))}</div>
      <div class="chat-quick-chips">
        ${quickKeys().map((k) => `<button type="button" class="chat-quick-chip" data-quick="${escape(k)}">${escape(I18n.t(k))}</button>`).join('')}
      </div>`;
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
  }

  function showCompose() {
    if (!panel) return;
    panel.querySelector('.chat-login-hint')?.classList.add('hidden');
    panel.querySelector('.chat-compose')?.classList.remove('hidden');
    renderQuick();
    hideQuickIfNeeded();
    syncActionBtn();
  }

  function ensureDelegation() {
    if (delegated || !listEl) return;
    delegated = true;
    listEl.addEventListener('click', (e) => {
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
          <b data-i18n="chat_title">${I18n.t('chat_title')}</b>
          <button type="button" class="icon-btn chat-close" id="chatClose" aria-label="close">×</button>
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
              <button type="button" class="chat-icon-btn" id="chatAttachBtn" title="${I18n.t('chat_attach')}" aria-label="${I18n.t('chat_attach')}">＋</button>
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
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        await ensureSession();
        if (me) {
          await refresh(true);
          hideQuickIfNeeded();
          startPoll();
        }
      } else {
        stopPoll();
      }
    });
    root.querySelector('#chatClose').addEventListener('click', () => {
      panel.classList.add('hidden');
      closeAttachMenu();
      stopPoll();
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

  return { init, onLogin, onLogout };
})();
