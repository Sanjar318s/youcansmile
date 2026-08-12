const { getDb, uid, normPhone } = require('./db');
const { hashPassword, safeEqual, parseCookies, setCookie, clearCookie } = require('./http');

const COOKIE = 'ycs_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

async function createSession(res, user) {
  const id = uid('s');
  const expires = Date.now() + TTL_MS;
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO sessions (id, customer_id, role, data, expires_at) VALUES (?, ?, ?, ?, ?)',
    args: [id, user.customerId || null, user.role || 'customer', JSON.stringify(user), expires],
  });
  setCookie(res, COOKIE, id);
  return user;
}

async function destroySession(req, res) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE];
  if (sid) {
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sid] });
  }
  clearCookie(res, COOKIE);
}

async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE];
  if (!sid) return null;
  const db = getDb();
  const row = await db.execute({
    sql: 'SELECT * FROM sessions WHERE id = ? AND expires_at > ?',
    args: [sid, Date.now()],
  });
  const s = row.rows[0];
  if (!s) return null;
  if (s.role === 'admin') {
    return Object.assign({ role: 'admin', id: 'admin', name: 'Администратор' }, s.data ? JSON.parse(s.data) : {});
  }
  if (s.customer_id) {
    const c = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [s.customer_id] });
    const customer = c.rows[0];
    if (!customer) return null;
    return {
      id: customer.id,
      role: 'customer',
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
    };
  }
  return s.data ? JSON.parse(s.data) : null;
}

async function registerCustomer({ name, phone, password }) {
  const phoneNorm = normPhone(phone);
  if (phoneNorm.length < 9) throw new Error('bad_phone');
  if (!password || password.length < 4) throw new Error('bad_password');
  const db = getDb();
  const exists = await db.execute({ sql: 'SELECT id FROM customers WHERE phone_norm = ?', args: [phoneNorm] });
  if (exists.rows.length) return { ok: false, error: 'phone_exists' };
  const id = uid('u');
  await db.execute({
    sql: 'INSERT INTO customers (id, name, phone, phone_norm, password_hash) VALUES (?, ?, ?, ?, ?)',
    args: [id, String(name || '').trim(), String(phone).trim(), phoneNorm, hashPassword(password)],
  });
  return { ok: true, user: { id, role: 'customer', name: name || '', phone: String(phone).trim() } };
}

async function loginCustomer({ phone, password }) {
  const phoneNorm = normPhone(phone);
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT * FROM customers WHERE phone_norm = ?', args: [phoneNorm] });
  const c = row.rows[0];
  if (!c || !c.password_hash) return { ok: false, error: 'bad_credentials' };
  if (!safeEqual(c.password_hash, hashPassword(password))) return { ok: false, error: 'bad_credentials' };
  return {
    ok: true,
    user: { id: c.id, role: 'customer', name: c.name, phone: c.phone, email: c.email || '' },
  };
}

async function loginAdmin(password) {
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT data FROM settings WHERE id = ?', args: ['site'] });
  let adminPassword = 'admin123';
  if (row.rows[0]) {
    try {
      const s = JSON.parse(row.rows[0].data);
      adminPassword = s.adminPassword || adminPassword;
    } catch (_) { /* keep default */ }
  }
  if (password !== adminPassword) return { ok: false, error: 'bad_credentials' };
  return { ok: true, user: { id: 'admin', role: 'admin', name: 'Администратор' } };
}

async function upsertGoogleCustomer({ googleId, email, name }) {
  const db = getDb();
  let row = await db.execute({ sql: 'SELECT * FROM customers WHERE google_id = ?', args: [googleId] });
  if (row.rows[0]) {
    const c = row.rows[0];
    return { id: c.id, role: 'customer', name: c.name || name, phone: c.phone || '', email: c.email || email || '' };
  }
  if (email) {
    row = await db.execute({ sql: 'SELECT * FROM customers WHERE email = ?', args: [email] });
    if (row.rows[0]) {
      await db.execute({ sql: 'UPDATE customers SET google_id = ? WHERE id = ?', args: [googleId, row.rows[0].id] });
      const c = row.rows[0];
      return { id: c.id, role: 'customer', name: c.name || name, phone: c.phone || '', email: c.email || email };
    }
  }
  const id = uid('u');
  const phoneNorm = `g${googleId.slice(-8)}`;
  await db.execute({
    sql: 'INSERT INTO customers (id, name, phone, phone_norm, email, google_id, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, name || 'Google user', '', phoneNorm, email || '', googleId, ''],
  });
  return { id, role: 'customer', name: name || 'Google user', phone: '', email: email || '' };
}

module.exports = {
  COOKIE,
  createSession,
  destroySession,
  getSessionUser,
  registerCustomer,
  loginCustomer,
  loginAdmin,
  upsertGoogleCustomer,
};
