const { cors, json } = require('../lib/http');
const { destroySession } = require('../lib/auth');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  await destroySession(req, res);
  return json(res, 200, { ok: true });
};
