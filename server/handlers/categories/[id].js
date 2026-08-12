const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getCategories, saveCategory, deleteCategory } = require(require('path').resolve(process.cwd(), 'lib/data'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const id = req.query.id;
  if (!id) return json(res, 400, { error: 'missing_id' });
  try {
    const cats = await getCategories();
    const cur = cats.find((c) => c.id === id);
    if (req.method === 'PATCH') {
      if (!cur) return json(res, 404, { error: 'not_found' });
      const patch = (await readBody(req)) || {};
      const next = Object.assign({}, cur, patch);
      await saveCategory(next);
      return json(res, 200, next);
    }
    if (req.method === 'DELETE') {
      await deleteCategory(id);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
