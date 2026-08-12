const { getDb } = require('./db');

async function getSettings() {
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT data FROM settings WHERE id = ?', args: ['site'] });
  if (!row.rows[0]) return null;
  return JSON.parse(row.rows[0].data);
}

async function sendTelegram(payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_SELLER_CHAT_ID;
  if (!token || !chatId) return null;
  const url = `https://api.telegram.org/bot${token}/${payload.method || 'sendMessage'}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, ...payload }),
  });
  return res.json();
}

function formatMsgForTelegram(msg, customer, threadId) {
  const prefix = `ycs:${threadId}:${msg.id}`;
  const who = customer?.name || customer?.phone || 'Клиент';
  let body = `${prefix}\n👤 ${who}\n`;
  if (msg.reply_to_id) body += `↩ reply:${msg.reply_to_id}\n`;
  if (msg.type === 'text') body += msg.text || '';
  else if (msg.type === 'photo') body += `📷 Фото${msg.text ? ': ' + msg.text : ''}`;
  else if (msg.type === 'voice') body += `🎤 Голосовое${msg.text ? ': ' + msg.text : ''}`;
  else if (msg.type === 'location') body += `📍 ${msg.lat}, ${msg.lng}${msg.text ? '\n' + msg.text : ''}`;
  return body;
}

async function notifySellerMessage(msg, customer, threadId) {
  const text = formatMsgForTelegram(msg, customer, threadId);
  if (msg.type === 'photo' && msg.media_url) {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    const photo = msg.media_url.startsWith('http') ? msg.media_url : `${base}${msg.media_url}`;
    return sendTelegram({ method: 'sendPhoto', photo, caption: text });
  }
  if (msg.type === 'voice' && msg.media_url) {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    const voice = msg.media_url.startsWith('http') ? msg.media_url : `${base}${msg.media_url}`;
    return sendTelegram({ method: 'sendVoice', voice, caption: text });
  }
  if (msg.type === 'location') {
    await sendTelegram({ method: 'sendLocation', latitude: msg.lat, longitude: msg.lng });
    return sendTelegram({ text });
  }
  return sendTelegram({ text });
}

async function registerSellerChat(chatId) {
  process.env.TELEGRAM_SELLER_CHAT_ID = String(chatId);
}

module.exports = { getSettings, sendTelegram, notifySellerMessage, formatMsgForTelegram, registerSellerChat };
