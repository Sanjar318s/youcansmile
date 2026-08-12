const { cors, json } = require('../lib/http');
const { getSessionUser } = require('../lib/auth');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'method' });
  const user = await getSessionUser(req);
  return json(res, 200, user);
};
