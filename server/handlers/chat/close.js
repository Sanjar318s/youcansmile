const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const {
  getOrCreateThread,
  setThreadClosed,
  getMessages,
} = require(require('path').resolve(process.cwd(), 'lib/chat'));
const { getCustomerOrders } = require(require('path').resolve(process.cwd(), 'lib/data'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== 'customer') return json(res, 401, { error: 'auth' });

    const body = (await readBody(req)) || {};
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json(res, 400, { error: 'bad_rating' });
    }
    const comment = String(body.comment || '').trim().slice(0, 500);

    const thread = await getOrCreateThread(me.id);
    await setThreadClosed(thread.id, rating, comment);

    try {
      const connected = !!Number(thread.seller_connected);
      const history = await getMessages(thread.id);
      const lastCustomerMsg = [...history].reverse().find((m) => m.author === 'customer');
      const orders = await getCustomerOrders(me.id, me.phone);
      const orderId = (orders[0] || {}).id || null;
      const { notifySellerAiReport } = require(require('path').resolve(process.cwd(), 'lib/telegram'));
      await notifySellerAiReport({
        customer: { name: me.name, phone: me.phone, email: me.email },
        threadId: thread.id,
        rating,
        comment,
        connected,
        question: lastCustomerMsg ? String(lastCustomerMsg.text || '') : '',
        orderId,
      });
    } catch (_) {
      /* отчёт не должен ломать закрытие чата */
    }

    return json(res, 200, { ok: true, threadId: thread.id });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
