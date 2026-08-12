const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { uid } = require(require('path').resolve(process.cwd(), 'lib/db'));
const { getCustomerOrders, getSettings } = require(require('path').resolve(process.cwd(), 'lib/data'));
const {
  getOrCreateThread,
  saveMessage,
  setNeedsSeller,
} = require(require('path').resolve(process.cwd(), 'lib/chat'));
const { aiReply } = require(require('path').resolve(process.cwd(), 'lib/ai'));
const {
  notifySellerLive,
  notifySellerRequest,
  notifySellerBotAnswer,
} = require(require('path').resolve(process.cwd(), 'lib/telegram'));
const { notifyAdmins, notifyUser } = require(require('path').resolve(process.cwd(), 'lib/push'));

function toTelegramMsg(msg) {
  return {
    id: msg.id,
    type: msg.type,
    text: msg.text,
    media_url: msg.mediaUrl,
    lat: msg.lat,
    lng: msg.lng,
    reply_to_id: msg.replyToId,
  };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== 'customer') return json(res, 401, { error: 'auth' });
    const body = (await readBody(req)) || {};
    const thread = await getOrCreateThread(me.id);
    const customer = { name: me.name, phone: me.phone, email: me.email };
    const connected = !!Number(thread.seller_connected);
    const settings = (await getSettings()) || {};

    const msg = {
      id: uid('m'),
      threadId: thread.id,
      author: 'customer',
      type: body.type || 'text',
      text: String(body.text || '').trim(),
      mediaUrl: body.mediaUrl || body.media_url || '',
      lat: body.lat != null ? Number(body.lat) : null,
      lng: body.lng != null ? Number(body.lng) : null,
      replyToId: body.replyToId || body.reply_to_id || null,
      createdAt: Date.now(),
    };
    if (msg.type === 'text' && !msg.text) return json(res, 400, { error: 'empty' });
    if (msg.type === 'location' && (msg.lat == null || msg.lng == null)) {
      return json(res, 400, { error: 'bad_location' });
    }
    if ((msg.type === 'photo' || msg.type === 'voice') && !msg.mediaUrl) {
      return json(res, 400, { error: 'no_media' });
    }

    await saveMessage(msg);
    const out = [msg];
    try {
      const preview =
        msg.type === 'text'
          ? String(msg.text || '').slice(0, 80)
          : msg.type === 'photo'
            ? '📷 Фото'
            : msg.type === 'voice'
              ? '🎤 Голосовое'
              : msg.type === 'location'
                ? '📍 Геолокация'
                : 'Сообщение';
      await notifyAdmins({
        title: 'Чат YouCanSmile',
        body: `${customer.name || 'Клиент'}: ${preview}`,
        url: '/admin.html',
        tag: `chat-${thread.id}`,
      });
    } catch (_) {}
    const orders = await getCustomerOrders(me.id, me.phone);
    let needsSeller = !!Number(thread.needs_seller);

    if (msg.type === 'text' && msg.text) {
      const { answer, escalate } = await aiReply(msg.text, orders, settings);

      if (answer) {
        const agentMsg = {
          id: uid('m'),
          threadId: thread.id,
          author: 'agent',
          type: 'text',
          text: answer,
          createdAt: Date.now(),
        };
        await saveMessage(agentMsg);
        out.push(agentMsg);
        try {
          await notifyUser(me.id, {
            title: 'YouCanSmile',
            body: String(agentMsg.text || '').slice(0, 100),
            url: '/',
            tag: `chat-agent-${thread.id}`,
          });
        } catch (_) {}
        if (connected) {
          await notifySellerLive(toTelegramMsg(msg), customer, thread.id);
          await notifySellerBotAnswer(answer, customer, thread.id, agentMsg.id);
        }
        // FAQ answered — do not escalate / spam seller
      } else if (escalate) {
        await setNeedsSeller(thread.id, true);
        needsSeller = true;
        if (connected) {
          await notifySellerLive(toTelegramMsg(msg), customer, thread.id);
        } else {
          const escMsg = {
            id: uid('m'),
            threadId: thread.id,
            author: 'agent',
            type: 'text',
            text: 'Передаю ваш вопрос продавцу. Он подключится и ответит здесь.',
            createdAt: Date.now(),
          };
          await saveMessage(escMsg);
          out.push(escMsg);
          await notifySellerRequest(toTelegramMsg(msg), customer, thread.id);
        }
      }
    } else {
      // media / location — seller usually needed
      await setNeedsSeller(thread.id, true);
      needsSeller = true;
      if (connected) {
        await notifySellerLive(toTelegramMsg(msg), customer, thread.id);
      } else {
        const tip = {
          id: uid('m'),
          threadId: thread.id,
          author: 'agent',
          type: 'text',
          text: 'Получил файл/локацию — передаю продавцу.',
          createdAt: Date.now(),
        };
        await saveMessage(tip);
        out.push(tip);
        await notifySellerRequest(toTelegramMsg(msg), customer, thread.id);
      }
    }

    return json(res, 201, { ok: true, messages: out, needsSeller });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
