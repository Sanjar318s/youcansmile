/* ============================================================
   YouCanSmile — виджет чата (покупатель ↔ ИИ ↔ продавец)
   ============================================================ */
const Chat = (() => {
  let root = null;
  let panel = null;
  let listEl = null;
  let inputEl = null;
  let replyBar = null;
  let me = null;
  let lastTs = 0;
  let pollTimer = null;
  let replyTo = null;
  let recorder = null;
  let recChunks = [];

  const AVATARS = {
    customer: '🙂',
    agent: '🤖',
    seller: '💬',
  };

  function authorLabel(author) {
    if (author === 'agent') return I18n.t('chat_agent');
    if (author === 'seller') return I18n.t('chat_seller');
    return me?.name || I18n.t('review_guest');
  }

  function escape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderMessage(m) {
    const mine = m.author === 'customer';
    const reply = m.replyToId
      ? `<div class="chat-reply-ref">${I18n.t('chat_reply')} #${escape(m.replyToId.slice(-6))}</div>`
      : '';
    let body = '';
    if (m.type === 'photo' && m.mediaUrl) {
      body = `<a href="${escape(m.mediaUrl)}" target="_blank" rel="noopener"><img class="chat-img" src="${escape(m.mediaUrl)}" alt=""/></a>`;
      if (m.text) body += `<p>${escape(m.text)}</p>`;
    } else if (m.type === 'voice' && m.mediaUrl) {
      body = `<audio controls src="${escape(m.mediaUrl)}"></audio>`;
      if (m.text) body += `<p>${escape(m.text)}</p>`;
    } else if (m.type === 'location') {
      body = `<a href="https://maps.google.com/?q=${m.lat},${m.lng}" target="_blank" rel="noopener">📍 ${m.lat?.toFixed?.(5) || m.lat}, ${m.lng?.toFixed?.(5) || m.lng}</a>`;
      if (m.text) body += `<p>${escape(m.text)}</p>`;
    } else {
      body = `<p>${escape(m.text)}</p>`;
    }
    return `
      <div class="chat-msg ${mine ? 'mine' : 'theirs'} ${escape(m.author)}" data-id="${escape(m.id)}">
        <div class="chat-avatar" title="${escape(authorLabel(m.author))}">${AVATARS[m.author] || '•'}</div>
        <div class="chat-bubble">
          <div class="chat-author">${escape(authorLabel(m.author))}</div>
          ${reply}
          ${body}
          <button type="button" class="chat-reply-btn" data-reply="${escape(m.id)}" title="${I18n.t('chat_reply')}">↩</button>
        </div>
      </div>`;
  }

  function appendMessages(messages, replace) {
    if (!listEl) return;
    if (replace) listEl.innerHTML = '';
    messages.forEach((m) => {
      if (listEl.querySelector(`[data-id="${m.id}"]`)) return;
      listEl.insertAdjacentHTML('beforeend', renderMessage(m));
      if (m.createdAt > lastTs) lastTs = m.createdAt;
    });
    listEl.scrollTop = listEl.scrollHeight;
    listEl.querySelectorAll('.chat-reply-btn').forEach((btn) => {
      btn.onclick = () => setReply(btn.dataset.reply);
    });
  }

  function setReply(id) {
    replyTo = id;
    if (replyBar) {
      replyBar.classList.remove('hidden');
      replyBar.textContent = `${I18n.t('chat_reply')}: …${String(id).slice(-6)}`;
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
    pollTimer = setInterval(() => refresh(false), 3000);
  }

  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function send(payload) {
    if (!me) return;
    const res = await Api.sendChatMessage(payload);
    if (res.messages) appendMessages(res.messages, false);
    clearReply();
    inputEl.value = '';
  }

  async function sendText() {
    const text = inputEl.value.trim();
    if (!text) return;
    await send({ type: 'text', text, replyToId: replyTo });
  }

  async function sendPhoto(file) {
    if (!file) return;
    const dataUrl = await UI.readFileAsDataURL(file);
    const up = await Api.uploadMedia(dataUrl, file.type || 'image/jpeg');
    await send({ type: 'photo', text: '', mediaUrl: up.url, replyToId: replyTo });
  }

  async function sendVoice(blob) {
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const up = await Api.uploadMedia(dataUrl, blob.type || 'audio/webm');
    await send({ type: 'voice', mediaUrl: up.url, replyToId: replyTo });
  }

  function sendLocation() {
    if (!navigator.geolocation) {
      UI.toast('Geolocation unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await send({
          type: 'location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          replyToId: replyTo,
        });
      },
      () => UI.toast('Location denied')
    );
  }

  async function toggleRecord(btn) {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      btn.classList.remove('recording');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size) recChunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size) await sendVoice(blob);
      };
      recorder.start();
      btn.classList.add('recording');
      UI.toast(I18n.t('chat_voice_rec'));
    } catch (_) {
      UI.toast('Mic unavailable');
    }
  }

  function showLoginHint() {
    if (!panel) return;
    panel.querySelector('.chat-login-hint')?.classList.remove('hidden');
    panel.querySelector('.chat-compose')?.classList.add('hidden');
  }

  function showCompose() {
    if (!panel) return;
    panel.querySelector('.chat-login-hint')?.classList.add('hidden');
    panel.querySelector('.chat-compose')?.classList.remove('hidden');
  }

  function buildUI() {
    if (root || /admin\.html/i.test(location.pathname)) return;
    root = document.createElement('div');
    root.className = 'chat-widget';
    root.innerHTML = `
      <button type="button" class="chat-fab" id="chatFab" aria-label="${I18n.t('chat_open')}">💬</button>
      <div class="chat-panel hidden" id="chatPanel">
        <div class="chat-head">
          <b data-i18n="chat_title">${I18n.t('chat_title')}</b>
          <button type="button" class="icon-btn chat-close" id="chatClose">×</button>
        </div>
        <div class="chat-login-hint hidden">
          <p data-i18n="chat_login_hint">${I18n.t('chat_login_hint')}</p>
          <a class="btn btn-primary" href="account.html">${I18n.t('account_login_btn')}</a>
        </div>
        <div class="chat-messages" id="chatMessages"></div>
        <div class="chat-reply-bar hidden" id="chatReplyBar"></div>
        <div class="chat-compose">
          <div class="chat-tools">
            <button type="button" class="icon-btn" id="chatPhotoBtn" title="${I18n.t('chat_photo')}">📷</button>
            <button type="button" class="icon-btn" id="chatVoiceBtn" title="${I18n.t('chat_voice')}">🎤</button>
            <button type="button" class="icon-btn" id="chatLocBtn" title="${I18n.t('chat_location')}">📍</button>
            <input type="file" accept="image/*" id="chatPhotoInput" hidden/>
          </div>
          <div class="chat-input-row">
            <input type="text" id="chatInput" placeholder="${I18n.t('chat_placeholder')}" autocomplete="off"/>
            <button type="button" class="btn btn-primary" id="chatSend">${I18n.t('chat_send')}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    panel = root.querySelector('#chatPanel');
    listEl = root.querySelector('#chatMessages');
    inputEl = root.querySelector('#chatInput');
    replyBar = root.querySelector('#chatReplyBar');

    root.querySelector('#chatFab').addEventListener('click', () => {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden') && me) refresh(true);
    });
    root.querySelector('#chatClose').addEventListener('click', () => panel.classList.add('hidden'));
    root.querySelector('#chatSend').addEventListener('click', sendText);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendText();
      }
    });
    replyBar.addEventListener('click', clearReply);

    const photoInput = root.querySelector('#chatPhotoInput');
    root.querySelector('#chatPhotoBtn').addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => {
      if (photoInput.files && photoInput.files[0]) sendPhoto(photoInput.files[0]);
      photoInput.value = '';
    });
    root.querySelector('#chatVoiceBtn').addEventListener('click', (e) => toggleRecord(e.currentTarget));
    root.querySelector('#chatLocBtn').addEventListener('click', sendLocation);
  }

  async function syncSession() {
    me = await Api.getMe();
    if (me && me.role === 'customer') {
      showCompose();
      await refresh(true);
      startPoll();
    } else {
      me = null;
      stopPoll();
      showLoginHint();
    }
  }

  async function init() {
    buildUI();
    await syncSession();
  }

  async function onLogin() {
    await syncSession();
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
