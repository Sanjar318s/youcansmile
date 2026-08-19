const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));
const { getSettings, saveSettings } = require(require('path').resolve(process.cwd(), 'lib/data'));
const { mergePromoSettings } = require(require('path').resolve(process.cwd(), 'lib/promo-defaults'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { requireAdmin, publicSettings } = require(require('path').resolve(process.cwd(), 'lib/admin-guard'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      const s = await getSettings();
      const me = await getSessionUser(req);
      const payload = me && me.role === 'admin' ? mergePromoSettings(s || {}) : publicSettings(s);
      return json(res, 200, payload, {
        'Cache-Control': me && me.role === 'admin' ? 'private, no-store' : 'public, max-age=30, s-maxage=60',
      });
    }
    if (req.method === 'PUT') {
      if (!(await requireAdmin(req, res))) return;
      const body = (await readBody(req)) || {};
      const prev = (await getSettings()) || {};
      const merged = Object.assign({}, prev, body);
      if (!merged.adminPassword) merged.adminPassword = prev.adminPassword || 'admin123';
      await saveSettings(merged);
      return json(res, 200, mergePromoSettings(merged), { 'Cache-Control': 'private, no-store' });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
