const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getProduct, saveProduct, deleteProduct } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { requireAdmin } = require(require('path').resolve(process.cwd(), 'lib/admin-guard'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const id = req.query.id;
  if (!id) return json(res, 400, { error: 'missing_id' });
  try {
    if (req.method === 'GET') {
      const p = await getProduct(id);
      if (!p) return json(res, 404, { error: 'not_found' });
      return json(res, 200, p);
    }
    if (req.method === 'PATCH') {
      if (!(await requireAdmin(req, res))) return;
      const patch = (await readBody(req)) || {};
      const cur = await getProduct(id);
      if (!cur) return json(res, 404, { error: 'not_found' });
      const next = Object.assign({}, cur, patch);
      await saveProduct(next);
      return json(res, 200, next, { 'Cache-Control': 'private, no-store' });
    }
    if (req.method === 'DELETE') {
      if (!(await requireAdmin(req, res))) return;
      await deleteProduct(id);
      return json(res, 200, { ok: true }, { 'Cache-Control': 'private, no-store' });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
