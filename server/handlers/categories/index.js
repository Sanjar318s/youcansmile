const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));
const { getCategories, saveCategory, deleteCategory, uid } = require(require('path').resolve(process.cwd(), 'lib/data'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      return json(res, 200, await getCategories(), {
        'Cache-Control': 'public, max-age=30, s-maxage=60',
      });
    }
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
