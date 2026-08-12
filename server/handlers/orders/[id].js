const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getOrder, saveOrder } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));

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
      const next = Object.assign({}, order, patch);
      await saveOrder(next);
      return json(res, 200, next);
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
