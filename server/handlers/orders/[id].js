const { cors, json, readBody, baseUrl } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getOrder, saveOrder } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { uid } = require(require('path').resolve(process.cwd(), 'lib/db'));
const {
  ORDER_STATUSES,
  normalizeStatus,
  statusLabelRu,
  orderNumberLabel,
} = require(require('path').resolve(process.cwd(), 'lib/orders'));
const { getOrCreateThread, saveMessage } = require(require('path').resolve(process.cwd(), 'lib/chat'));
const { notifyUser } = require(require('path').resolve(process.cwd(), 'lib/push'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const id = req.query.id;
  if (!id) return json(res, 400, { error: 'missing_id' });
  try {
    const order = await getOrder(id);
    if (req.method === 'GET') {
      if (!order) return json(res, 404, { error: 'not_found' });
      return json(res, 200, order);
    }
    if (req.method === 'PATCH') {
      const me = await getSessionUser(req);
      if (!me || me.role !== 'admin') return json(res, 401, { error: 'auth' });
      if (!order) return json(res, 404, { error: 'not_found' });
      const patch = (await readBody(req)) || {};
      const next = Object.assign({}, order);

      if (patch.status != null) {
        const status = String(patch.status);
        if (!ORDER_STATUSES.includes(status)) {
          return json(res, 400, { error: 'bad_status', allowed: ORDER_STATUSES });
        }
        next.status = normalizeStatus(status);
      }
      // Allow other safe admin fields later; ignore unknown mass-assign of id
      if (patch.note != null) next.adminNote = String(patch.note);

      next.updatedAt = Date.now();
      await saveOrder(next);

      let chatNotified = false;
      let pushNotified = false;
      if (patch.status != null && next.customerId) {
        const label = orderNumberLabel(next, 'ru');
        const st = statusLabelRu(next.status);
        const site = baseUrl(req);
        const statusUrl = `${site}/order-status.html?id=${encodeURIComponent(next.id)}`;
        const text = `${label}: статус «${st}».\nОтслеживать: ${statusUrl}`;
        try {
          const thread = await getOrCreateThread(next.customerId);
          await saveMessage({
            id: uid('m'),
            threadId: thread.id,
            author: 'seller',
            type: 'text',
            text,
            createdAt: Date.now(),
          });
          chatNotified = true;
        } catch (_) {}
        try {
          const results = await notifyUser(next.customerId, {
            title: 'YouCanSmile',
            body: `${label}: ${st}`,
            url: statusUrl,
            tag: `order-${next.id}`,
          });
          pushNotified = results.some((r) => r.ok);
        } catch (_) {}
      }

      return json(res, 200, Object.assign({}, next, { chatNotified, pushNotified }));
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
