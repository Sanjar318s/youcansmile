const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { loginCustomer, loginAdmin, createSession } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    await ensureSeeded();
    const body = (await readBody(req)) || {};

    const { email, password, phone } = body;
    if (email === 'admin') {
      const result = await loginAdmin(password);
      if (!result.ok) return json(res, 401, result);
      await createSession(res, result.user);
      return json(res, 200, result);
    }
    const result = await loginCustomer({ phone: phone || email, password });
    if (!result.ok) return json(res, 401, result);
    await createSession(res, { role: 'customer', customerId: result.user.id, ...result.user });
    return json(res, 200, result);
  } catch (e) {
    const code = e.message === 'bad_phone' || e.message === 'bad_password' ? 400 : 500;
    return json(res, code, { ok: false, error: e.message });
  }
};
