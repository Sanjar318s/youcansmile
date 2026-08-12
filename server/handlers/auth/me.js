const { cors, json } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser, renewSessionCookie } = require(require('path').resolve(process.cwd(), 'lib/auth'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'method' });
  const user = await getSessionUser(req);
  if (user) await renewSessionCookie(req, res);
  return json(res, 200, user);
};
