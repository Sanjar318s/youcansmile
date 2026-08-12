const { cors, json } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { runSchema } = require(require('path').resolve(process.cwd(), 'lib/db'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    await runSchema();
    await ensureSeeded();
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
