const { cors, json, readBody } = require('../lib/http');
const { ensureSeeded } = require('../lib/seed');
const { getCategories, saveCategory, deleteCategory, uid } = require('../lib/data');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') return json(res, 200, await getCategories());
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const cat = Object.assign({ id: uid('c') }, body);
      await saveCategory(cat);
      return json(res, 201, cat);
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
