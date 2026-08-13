module.exports = async (req, res) => {
  const { cors, json } = require(require('path').resolve(process.cwd(), 'lib/http'));
  if (cors(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'method' });
  }
  return json(res, 200, { ok: true, t: Date.now() });
};
