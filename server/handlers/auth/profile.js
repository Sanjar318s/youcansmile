const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser, updateCustomerProfile, renewSessionCookie } = require(require('path').resolve(process.cwd(), 'lib/auth'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'POST') {
    return json(res, 405, { error: 'method' });
  }
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== 'customer') return json(res, 401, { ok: false, error: 'auth' });
    const body = (await readBody(req)) || {};
    const user = await updateCustomerProfile(me.id, body);
    await renewSessionCookie(req, res);
    return json(res, 200, { ok: true, user });
  } catch (e) {
    const code = e.message === 'phone_exists' ? 400 : e.message === 'not_found' ? 404 : 500;
    return json(res, code, { ok: false, error: e.message });
  }
};
