const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));
const { getProducts, saveProduct, deleteProduct, uid } = require(require('path').resolve(process.cwd(), 'lib/data'));

/** Catalog list payload: omit bulky desc; keep image refs (prefer /api/media URLs). */
function forList(p) {
  return {
    id: p.id,
    categoryId: p.categoryId,
    featured: !!p.featured,
    inStock: p.inStock !== false,
    createdAt: p.createdAt,
    price: p.price,
    oldPrice: p.oldPrice || null,
    title: p.title,
    tags: p.tags || [],
    images: Array.isArray(p.images) && p.images.length ? p.images : ['img/logo-ycs.png'],
  };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      const all = await getProducts();
      return json(res, 200, all.map(forList), {
        'Cache-Control': 'public, max-age=30, s-maxage=60',
      });
    }
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
