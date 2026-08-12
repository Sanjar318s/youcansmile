const { getSettings, saveSettings } = require('./data');

function publicBase() {
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
  return '';
}

function absoluteMediaUrl(url) {
  const u = String(url || '');
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base = publicBase();
  if (!base) return u;
  return u.startsWith('/') ? base + u : `${base}/${u}`;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function shortId(id) {
  const s = String(id || '');
  return s.length > 10 ? s.slice(-8) : s;
}

function customerLabel(customer) {
  return customer?.name || customer?.phone || customer?.email || 'Клиент';
}

function msgBodyPreview(msg) {
  if (msg.type === 'text') return String(msg.text || '').trim() || '—';
  if (msg.type === 'photo') return `📷 Фото${msg.text ? ': ' + msg.text : ''}`;
  if (msg.type === 'voice') return `🎤 Голосовое`;
  if (msg.type === 'location') return `📍 ${msg.lat}, ${msg.lng}`;
  return String(msg.text || msg.type || 'сообщение');
}

function routingTag(threadId, msgId) {
  return `ycs:${threadId}:${msgId}`;
}

function sellerMainKeyboard() {
  return {
    keyboard: [
      [{ text: '📋 Чаты' }, { text: '🔌 Отключиться' }],
      [{ text: 'ℹ️ Статус' }, { text: '❓ Помощь' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function connectKeyboard(threadId) {
  return {
    inline_keyboard: [
      [
        { text: '🟢 Подключиться', callback_data: `connect:${threadId}` },
        { text: '📋 Все чаты', callback_data: 'chats' },
      ],
    ],
  };
}

function chatListKeyboard(threads, activeId) {
  const rows = (threads || []).slice(0, 12).map((t) => {
    const name = t.customer_name || t.customer_phone || shortId(t.id);
    const mark = t.seller_connected || t.id === activeId ? '🟢' : t.needs_seller ? '🟡' : '⚪';
    const label = `${mark} ${String(name).slice(0, 28)}`;
    return [{ text: label, callback_data: `connect:${t.id}` }];
  });
  rows.push([{ text: '🔌 Отключиться', callback_data: 'disconnect' }]);
  return { inline_keyboard: rows };
}

function liveKeyboard(threadId) {
  return {
    inline_keyboard: [
      [
        { text: '🔌 Отключиться', callback_data: 'disconnect' },
        { text: '📋 Чаты', callback_data: 'chats' },
      ],
    ],
  };
}

function formatEscalationCard(msg, customer, threadId) {
  const who = escHtml(customerLabel(customer));
  const body = escHtml(msgBodyPreview(msg));
  const tag = routingTag(threadId, msg.id);
  return (
    `🟡 <b>Нужен продавец</b>\n` +
    `👤 <b>${who}</b>\n` +
    `──────────────\n` +
    `${body}\n` +
    `──────────────\n` +
    `<i>Нажмите «Подключиться», чтобы вести диалог.\n` +
    `Или ответьте reply на это сообщение.</i>\n` +
    `<code>${escHtml(tag)}</code>`
  );
}

function formatLiveCard(msg, customer, threadId, opts = {}) {
  const who = escHtml(customerLabel(customer));
  const body = escHtml(msgBodyPreview(msg));
  const tag = routingTag(threadId, msg.id);
  const title = opts.title || '💬 Сообщение клиента';
  return (
    `${title}\n` +
    `👤 <b>${who}</b>\n` +
    `──────────────\n` +
    `${body}\n` +
    `──────────────\n` +
    `<code>${escHtml(tag)}</code>`
  );
}

function formatBotNote(answer, customer, threadId, msgId) {
  const who = escHtml(customerLabel(customer));
  const tag = routingTag(threadId, msgId);
  return (
    `🤖 <b>Бот ответил</b> · ${who}\n` +
    `${escHtml(String(answer || '').slice(0, 500))}\n` +
    `<code>${escHtml(tag)}</code>`
  );
}

async function sendTelegram(payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = payload.chat_id || process.env.TELEGRAM_SELLER_CHAT_ID || (await getSellerChatId());
  if (!token || !chatId) return null;
  const { chat_id: _omit, method, ...rest } = payload;
  const url = `https://api.telegram.org/bot${token}/${method || 'sendMessage'}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, ...rest }),
  });
  return res.json().catch(() => null);
}

async function answerCallback(callbackQueryId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !callbackQueryId) return null;
  return fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || '',
      show_alert: false,
    }),
  }).then((r) => r.json()).catch(() => null);
}

async function getSellerChatId() {
  if (process.env.TELEGRAM_SELLER_CHAT_ID) return process.env.TELEGRAM_SELLER_CHAT_ID;
  try {
    const s = await getSettings();
    return s?.telegramSellerChatId ? String(s.telegramSellerChatId) : null;
  } catch {
    return null;
  }
}

function looksLikeOgg(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('audio/ogg') || u.includes('.ogg') || u.includes('opus');
}

async function sendMediaBundle(msg, captionHtml, replyMarkup) {
  const common = {
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  };
  if (msg.type === 'photo' && msg.media_url) {
    return sendTelegram({
      method: 'sendPhoto',
      photo: absoluteMediaUrl(msg.media_url),
      caption: captionHtml.slice(0, 1024),
      ...common,
    });
  }
  if (msg.type === 'voice' && msg.media_url) {
    const media = absoluteMediaUrl(msg.media_url);
    if (looksLikeOgg(msg.media_url) || looksLikeOgg(media)) {
      const voiceRes = await sendTelegram({
        method: 'sendVoice',
        voice: media,
        caption: captionHtml.slice(0, 1024),
        ...common,
      });
      if (voiceRes && voiceRes.ok) return voiceRes;
    }
    const audioRes = await sendTelegram({
      method: 'sendAudio',
      audio: media,
      caption: captionHtml.slice(0, 1024),
      ...common,
    });
    if (audioRes && audioRes.ok) return audioRes;
    return sendTelegram({
      method: 'sendDocument',
      document: media,
      caption: captionHtml.slice(0, 1024),
      ...common,
    });
  }
  if (msg.type === 'location') {
    await sendTelegram({
      method: 'sendLocation',
      latitude: Number(msg.lat),
      longitude: Number(msg.lng),
    });
  }
  return sendTelegram({
    method: 'sendMessage',
    text: captionHtml,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

/** Live chat while seller is connected */
async function notifySellerLive(msg, customer, threadId) {
  const text = formatLiveCard(msg, customer, threadId);
  return sendMediaBundle(msg, text, liveKeyboard(threadId));
}

/** Alert when bot cannot answer and seller is not connected */
async function notifySellerRequest(msg, customer, threadId) {
  const text = formatEscalationCard(msg, customer, threadId);
  return sendMediaBundle(msg, text, connectKeyboard(threadId));
}

/** Optional note that bot answered (only when seller connected) */
async function notifySellerBotAnswer(answer, customer, threadId, msgId) {
  return sendTelegram({
    method: 'sendMessage',
    text: formatBotNote(answer, customer, threadId, msgId),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function sendSellerHelp(chatId) {
  return sendTelegram({
    chat_id: chatId,
    method: 'sendMessage',
    parse_mode: 'HTML',
    reply_markup: sellerMainKeyboard(),
    text:
      `<b>YouCanSmile — кабинет продавца</b>\n\n` +
      `🤖 Бот сам отвечает на базовые вопросы (доставка, оплата, самовывоз…).\n` +
      `Вам приходят только диалоги, где нужна помощь.\n\n` +
      `<b>Как работать</b>\n` +
      `1. «📋 Чаты» — список клиентов\n` +
      `2. «🟢 Подключиться» — войти в диалог\n` +
      `3. Пишите обычные сообщения — они уйдут клиенту на сайт\n` +
      `4. «🔌 Отключиться» — выйти из диалога\n\n` +
      `Команды: /chats /status /disconnect /help`,
  });
}

async function registerSellerChat(chatId) {
  const id = String(chatId);
  process.env.TELEGRAM_SELLER_CHAT_ID = id;
  try {
    const s = (await getSettings()) || {};
    if (String(s.telegramSellerChatId || '') === id) return;
    await saveSettings({ ...s, telegramSellerChatId: id });
  } catch {
    /* ignore */
  }
}

/** @deprecated keep for older call sites */
async function notifySellerMessage(msg, customer, threadId) {
  return notifySellerLive(msg, customer, threadId);
}

function formatMsgForTelegram(msg, customer, threadId) {
  return formatLiveCard(msg, customer, threadId).replace(/<[^>]+>/g, '');
}

/* ------------------------------------------------------------------
   New order notifications to the seller
   ------------------------------------------------------------------ */

function txt(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.ru || v.uz || v.en || Object.values(v)[0] || '';
  return String(v);
}

/** Persist a data: URL into the media table and return a fetchable URL. */
async function persistDataImage(dataUrl) {
  const raw = String(dataUrl || '');
  if (!raw) return '';
  if (!raw.startsWith('data:')) return raw; // already a URL
  const m = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return '';
  const { saveMedia } = require('./chat');
  const { uid } = require('./db');
  const id = uid('md');
  await saveMedia({ id, mime: m[1] || 'application/octet-stream', data: raw });
  return `/api/media?id=${id}`;
}

async function formatOrderCard(order) {
  const c = order.customer || {};
  const isCustom = order.type === 'custom';
  const lines = [];
  lines.push(isCustom ? '🔥 <b>Новый индивидуальный заказ</b>' : '🛍️ <b>Новый заказ</b>');
  lines.push('──────────────');
  lines.push(`📦 <b>#${escHtml(order.id)}</b>`);
  if (order.createdAt) {
    const d = new Date(order.createdAt);
    lines.push(
      `🕒 ${d.toLocaleString('ru-RU', {
        timeZone: 'Asia/Tashkent',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`
    );
  }

  if (isCustom) {
    const desc = String(order.customDescription || c.note || '').trim();
    if (desc) lines.push(`📝 ${escHtml(desc)}`);
  } else {
    const items = (order.items || [])
      .map((i) => `• ${escHtml(i.title)} × ${i.qty} = ${i.price * i.qty}`)
      .join('\n');
    if (items) lines.push(`🧾 ${items}`);
    if (order.total != null) {
      lines.push(`💰 Итого: ${order.total}${order.currency ? ' ' + escHtml(order.currency) : ''}`);
    }
  }

  lines.push('──────────────');
  if (c.name) lines.push(`👤 <b>${escHtml(c.name)}</b>`);
  if (c.phone) lines.push(`📞 ${escHtml(c.phone)}`);
  if (c.contact) {
    const ch = c.contactChannel === 'instagram' ? 'Instagram' : c.contactChannel === 'telegram' ? 'Telegram' : '';
    lines.push(`💬 ${ch ? ch + ': ' : ''}${escHtml(c.contact)}`);
  }
  if (order.fulfillment) {
    const f =
      order.fulfillment === 'pickup'
        ? 'Самовывоз'
        : order.fulfillment === 'delivery'
          ? 'Доставка'
          : order.fulfillment;
    lines.push(`📦 ${escHtml(f)}`);
    if (order.fulfillment === 'pickup' && order.pickupPoint) {
      try {
        const s = (await getSettings()) || {};
        const p = ((s.pickupPoints || [])).find((x) => x.id === order.pickupPoint);
        lines.push(`📍 ${escHtml(p ? txt(p.name) || txt(p.address) || order.pickupPoint : order.pickupPoint)}`);
      } catch {
        /* ignore */
      }
    }
  }
  if (c.address) lines.push(`📍 ${escHtml(c.address)}`);
  if (Array.isArray(order.coords) && order.coords.length === 2) {
    lines.push(`🧭 ${escHtml(order.coords.join(', '))}`);
  }
  if (order.payment) {
    const pay = order.payment === 'card' ? 'Карта' : order.payment === 'cash' ? 'Наличные' : order.payment;
    lines.push(`💳 ${escHtml(pay)}`);
  }
  lines.push(`\n<i>Продавец свяжется с клиентом для уточнения деталей.</i>`);
  return lines.join('\n');
}

/** Notify the seller about a new order (with reference / receipt photo when present). */
async function notifySellerNewOrder(order) {
  const caption = await formatOrderCard(order);
  let photoUrl = '';
  if (order.type === 'custom' && order.characterImage) {
    photoUrl = await persistDataImage(order.characterImage);
  } else if (order.paymentReceipt) {
    photoUrl = await persistDataImage(order.paymentReceipt);
  }
  if (photoUrl) {
    return sendTelegram({
      method: 'sendPhoto',
      photo: absoluteMediaUrl(photoUrl),
      caption: caption.slice(0, 1024),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }
  return sendTelegram({
    method: 'sendMessage',
    text: caption,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

module.exports = {
  getSettings,
  sendTelegram,
  answerCallback,
  notifySellerMessage,
  notifySellerLive,
  notifySellerRequest,
  notifySellerBotAnswer,
  formatMsgForTelegram,
  formatEscalationCard,
  formatLiveCard,
  registerSellerChat,
  getSellerChatId,
  absoluteMediaUrl,
  publicBase,
  sellerMainKeyboard,
  connectKeyboard,
  chatListKeyboard,
  liveKeyboard,
  sendSellerHelp,
  routingTag,
  customerLabel,
  msgBodyPreview,
  escHtml,
  shortId,
  notifySellerNewOrder,
};
