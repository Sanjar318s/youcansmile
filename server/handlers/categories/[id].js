const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getCategories, saveCategory, deleteCategory } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { requireAdmin } = require(require('path').resolve(process.cwd(), 'lib/admin-guard'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const id = req.query.id;
  if (!id) return json(res, 400, { error: 'missing_id' });
  try {
    const cats = await getCategories();
    const cur = cats.find((c) => c.id === id);
    if (req.method === 'PATCH') {
      if (!(await requireAdmin(req, res))) return;
      if (!cur) return json(res, 404, { error: 'not_found' });
      const patch = (await readBody(req)) || {};
      const next = Object.assign({}, cur, patch);
      if (patch.name && typeof patch.name === 'object') {
        next.name = Object.assign({}, cur.name || {}, patch.name);
      }
      await saveCategory(next);
      return json(res, 200, next, { 'Cache-Control': 'private, no-store' });
    }
    if (req.method === 'DELETE') {
      if (!(await requireAdmin(req, res))) return;
      await deleteCategory(id);
      return json(res, 200, { ok: true }, { 'Cache-Control': 'private, no-store' });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
