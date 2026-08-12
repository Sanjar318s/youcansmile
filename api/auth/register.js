const { cors, json, readBody } = require('../lib/http');
const { registerCustomer, createSession } = require('../lib/auth');
const { ensureSeeded } = require('../lib/seed');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    await ensureSeeded();
    const body = (await readBody(req)) || {};
    const result = await registerCustomer(body);
    if (!result.ok) return json(res, 400, result);
    await createSession(res, { role: 'customer', customerId: result.user.id, ...result.user });
    return json(res, 200, { ok: true, user: result.user });
  } catch (e) {
    const code = e.message === 'bad_phone' || e.message === 'bad_password' ? 400 : 500;
    return json(res, code, { ok: false, error: e.message });
  }
};
