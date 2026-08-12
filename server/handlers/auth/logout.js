const { cors, json } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { destroySession } = require(require('path').resolve(process.cwd(), 'lib/auth'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  await destroySession(req, res);
  return json(res, 200, { ok: true });
};
