const { cors, json, readBody, text } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { uid } = require(require('path').resolve(process.cwd(), 'lib/db'));
const { saveMessage, getThreadById } = require(require('path').resolve(process.cwd(), 'lib/chat'));
const { sendTelegram } = require(require('path').resolve(process.cwd(), 'lib/telegram'));

function parsePrefix(raw) {
  const s = String(raw || '');
  const m = s.match(/ycs:([^:\s]+):([^\s]+)/);
  if (!m) return null;
  return { threadId: m[1], msgId: m[2] };
}

async function downloadTelegramFile(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !fileId) return null;
  const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) =>
    r.json()
  );
  const path = info.result?.file_path;
  if (!path) return null;
  const url = `https://api.telegram.org/file/bot${token}/${path}`;
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const b64 = Buffer.from(buf).toString('base64');
  const mime = path.endsWith('.ogg') ? 'audio/ogg' : path.match(/\.(jpg|jpeg|png|webp)$/i) ? 'image/jpeg' : 'application/octet-stream';
  return { data: `data:${mime};base64,${b64}`, mime };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return text(res, 405, 'method');
  try {
    const update = (await readBody(req)) || {};
    const msg = update.message || update.edited_message;
    if (!msg) return json(res, 200, { ok: true });

    const chatId = msg.chat?.id;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (msg.text === '/start' && chatId) {
      await sendTelegram({
        method: 'sendMessage',
        text: `YouCanSmile seller bot\n\nВаш chat id: ${chatId}\n\nДобавьте TELEGRAM_SELLER_CHAT_ID=${chatId} в env Vercel.\n\nОтвечайте reply на сообщения клиентов — ответ появится на сайте.`,
      });
      return json(res, 200, { ok: true });
    }

    let prefix = parsePrefix(msg.text || msg.caption || '');
    if (!prefix && msg.reply_to_message) {
      prefix = parsePrefix(msg.reply_to_message.text || msg.reply_to_message.caption || '');
    }
    if (!prefix) return json(res, 200, { ok: true, skip: 'no_prefix' });

    const thread = await getThreadById(prefix.threadId);
    if (!thread) return json(res, 200, { ok: true, skip: 'no_thread' });

    let type = 'text';
    let mediaUrl = '';
    let bodyText = String(msg.text || msg.caption || '').replace(/ycs:[^\s]+\s*/g, '').trim();
    let lat = null;
    let lng = null;

    if (msg.photo && msg.photo.length) {
      type = 'photo';
      const file = msg.photo[msg.photo.length - 1];
      const dl = await downloadTelegramFile(file.file_id);
      if (dl) {
        const { saveMedia } = require(require('path').resolve(process.cwd(), 'lib/chat'));
        const mediaId = uid('md');
        await saveMedia({ id: mediaId, mime: dl.mime, data: dl.data });
        mediaUrl = `/api/media?id=${mediaId}`;
      }
    } else if (msg.voice) {
      type = 'voice';
      const dl = await downloadTelegramFile(msg.voice.file_id);
      if (dl) {
        const { saveMedia } = require(require('path').resolve(process.cwd(), 'lib/chat'));
        const mediaId = uid('md');
        await saveMedia({ id: mediaId, mime: dl.mime, data: dl.data });
        mediaUrl = `/api/media?id=${mediaId}`;
      }
    } else if (msg.location) {
      type = 'location';
      lat = msg.location.latitude;
      lng = msg.location.longitude;
    }

    const sellerMsg = {
      id: uid('m'),
      threadId: prefix.threadId,
      author: 'seller',
      type,
      text: bodyText,
      mediaUrl,
      lat,
      lng,
      replyToId: prefix.msgId,
      createdAt: Date.now(),
    };
    await saveMessage(sellerMsg);
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
