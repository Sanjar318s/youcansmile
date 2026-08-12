const { cors, json, readBody } = require('../lib/http');
const { ensureSeeded } = require('../lib/seed');
const { getOrders, saveOrder, uid } = require('../lib/data');
const { getSessionUser } = require('../lib/auth');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      const me = await getSessionUser(req);
      if (me && me.role === 'admin') return json(res, 200, await getOrders());
      if (me && me.role === 'customer') {
        const { getCustomerOrders } = require('../lib/data');
        return json(res, 200, await getCustomerOrders(me.id, me.phone));
      }
      return json(res, 401, { error: 'auth' });
    }
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const me = await getSessionUser(req);
      const order = Object.assign(
        {
          id: uid('o'),
          createdAt: Date.now(),
          status: 'new',
          customerId: me && me.role === 'customer' ? me.id : body.customerId || null,
        },
        body
      );
      await saveOrder(order);
      return json(res, 201, order);
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
