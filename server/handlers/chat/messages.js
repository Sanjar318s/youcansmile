const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { uid } = require(require('path').resolve(process.cwd(), 'lib/db'));
const { getCustomerOrders } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { getOrCreateThread, saveMessage, setNeedsSeller } = require(require('path').resolve(process.cwd(), 'lib/chat'));
const { aiReply } = require(require('path').resolve(process.cwd(), 'lib/ai'));
const { notifySellerMessage } = require(require('path').resolve(process.cwd(), 'lib/telegram'));

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
    const customer = { name: me.name, phone: me.phone };

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
    await notifySellerMessage(toTelegramMsg(msg), customer, thread.id);

    const out = [msg];
    const orders = await getCustomerOrders(me.id, me.phone);

    if (msg.type === 'text' && msg.text) {
      const { answer, escalate } = await aiReply(msg.text, orders);
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
        await notifySellerMessage(toTelegramMsg(agentMsg), { name: 'ИИ-агент' }, thread.id);
        out.push(agentMsg);
      }
      if (escalate) {
        await setNeedsSeller(thread.id, true);
        const escMsg = {
          id: uid('m'),
          threadId: thread.id,
          author: 'agent',
          type: 'text',
          text: 'Передаю ваш вопрос продавцу. Скоро ответит.',
          createdAt: Date.now(),
        };
        await saveMessage(escMsg);
        await notifySellerMessage(
          toTelegramMsg(Object.assign({}, escMsg, { text: `⚠️ Эскалация\n${msg.text}` })),
          customer,
          thread.id
        );
        out.push(escMsg);
      }
    } else if (msg.type !== 'text') {
      await setNeedsSeller(thread.id, true);
    }

    return json(res, 201, { ok: true, messages: out, needsSeller: !!thread.needs_seller });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
