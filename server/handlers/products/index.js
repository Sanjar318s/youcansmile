const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));
const { getProducts, saveProduct, deleteProduct, uid } = require(require('path').resolve(process.cwd(), 'lib/data'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') return json(res, 200, await getProducts());
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const product = Object.assign({ id: uid('p'), createdAt: Date.now() }, body);
      await saveProduct(product);
      return json(res, 201, product);
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

module.exports.config = { api: { bodyParser: true } };
