const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));
const { getOrders, saveOrder, uid } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      const me = await getSessionUser(req);
      if (me && me.role === 'admin') return json(res, 200, await getOrders());
      if (me && me.role === 'customer') {
        const { getCustomerOrders } = require(require('path').resolve(process.cwd(), 'lib/data'));
        return json(res, 200, await getCustomerOrders(me.id, me.phone));
      }
      return json(res, 401, { error: 'auth' });
    }
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const me = await getSessionUser(req);
      if (!me || me.role !== 'customer') {
        return json(res, 401, { error: 'auth', message: 'login_required' });
      }
      const order = Object.assign(
        {
          id: uid('o'),
          createdAt: Date.now(),
          status: 'new',
          customerId: me.id,
        },
        body,
        { customerId: me.id }
      );
      await saveOrder(order);
      try {
        const { notifySellerNewOrder } = require(require('path').resolve(process.cwd(), 'lib/telegram'));
        await notifySellerNewOrder(order);
      } catch (e) {
        /* уведомление не должно ломать создание заказа */
      }
      return json(res, 201, order);
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
