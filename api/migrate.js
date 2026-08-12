const { cors, json } = require('../lib/http');
const { runSchema } = require('../../lib/db');
const { ensureSeeded } = require('../../lib/seed');

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
