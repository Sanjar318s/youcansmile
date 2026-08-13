const { cors, json, readBody, baseUrl } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getOrder, deleteOrder } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { saveOrder } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { ORDER_STATUSES } = require(require('path').resolve(process.cwd(), 'lib/orders'));
const { applyOrderStatus } = require(require('path').resolve(process.cwd(), 'lib/order-status'));

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
    if (req.method === 'DELETE') {
      const me = await getSessionUser(req);
      if (!me || me.role !== 'admin') return json(res, 401, { error: 'auth' });
      if (!order) return json(res, 404, { error: 'not_found' });
      await deleteOrder(id);
      return json(res, 200, { ok: true, id });
    }
    if (req.method === 'PATCH') {
      const me = await getSessionUser(req);
      if (!me || me.role !== 'admin') return json(res, 401, { error: 'auth' });
      if (!order) return json(res, 404, { error: 'not_found' });
      const patch = (await readBody(req)) || {};

      if (patch.note != null && patch.status == null) {
        const next = Object.assign({}, order, {
          adminNote: String(patch.note),
          updatedAt: Date.now(),
        });
        await saveOrder(next);
        return json(res, 200, next);
      }

      if (patch.status != null) {
        const status = String(patch.status);
        if (!ORDER_STATUSES.includes(status)) {
          return json(res, 400, { error: 'bad_status', allowed: ORDER_STATUSES });
        }
        let base = order;
        if (patch.note != null) {
          base = Object.assign({}, order, { adminNote: String(patch.note) });
        }
        const updated = await applyOrderStatus(base, status, { siteUrl: baseUrl(req) });
        return json(res, 200, updated);
      }

      return json(res, 200, order);
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    if (e && e.code === 'bad_status') return json(res, 400, { error: 'bad_status' });
    return json(res, 500, { error: e.message });
  }
};
