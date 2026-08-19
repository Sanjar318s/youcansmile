const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));
const { getCategories, saveCategory, uid } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { requireAdmin } = require(require('path').resolve(process.cwd(), 'lib/admin-guard'));

function normalizeCategory(body) {
  const icon = String(body.icon || '🎁').trim() || '🎁';
  const name = body.name && typeof body.name === 'object' ? body.name : {};
  const ru = String(name.ru || body.ru || '').trim();
  if (!ru) throw new Error('name_required');
  const en = String(name.en || body.en || ru).trim() || ru;
  const uz = String(name.uz || body.uz || ru).trim() || ru;
  return { icon, name: { ru, en, uz } };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      return json(res, 200, await getCategories(), {
        'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=30',
      });
    }
    if (req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = (await readBody(req)) || {};
      const norm = normalizeCategory(body);
      const cat = Object.assign({ id: body.id || uid('c') }, norm);
      await saveCategory(cat);
      return json(res, 201, cat, { 'Cache-Control': 'private, no-store' });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    if (e.message === 'name_required') return json(res, 400, { error: 'name_required' });
    return json(res, 500, { error: e.message });
  }
};
