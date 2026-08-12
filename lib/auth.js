const { getDb, uid, normPhone, ensureCustomerSchema } = require('./db');
const { hashPassword, safeEqual, parseCookies, setCookie, clearCookie } = require('./http');

const COOKIE = 'ycs_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days — remember device
const COOKIE_MAX_AGE = Math.floor(TTL_MS / 1000);

function parseProfile(raw) {
  if (!raw) return {};
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

function customerToUser(c) {
  const profile = parseProfile(c.profile);
  return {
    id: c.id,
    role: 'customer',
    name: c.name || '',
    phone: c.phone || '',
    email: c.email || '',
    telegram: profile.telegram || '',
    instagram: profile.instagram || '',
    address: profile.address || '',
  };
}

async function createSession(res, user) {
  const id = uid('s');
  const expires = Date.now() + TTL_MS;
  const db = getDb();
  const role = user.role || 'customer';
  const customerId =
    user.customerId ||
    (role === 'customer' && user.id && user.id !== 'admin' ? user.id : null);
  await db.execute({
    sql: 'INSERT INTO sessions (id, customer_id, role, data, expires_at) VALUES (?, ?, ?, ?, ?)',
    args: [id, customerId, role, JSON.stringify(user), expires],
  });
  setCookie(res, COOKIE, id, { maxAge: COOKIE_MAX_AGE });
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

async function renewSessionCookie(req, res) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE];
  if (!sid || !res) return;
  const expires = Date.now() + TTL_MS;
  const db = getDb();
  await db.execute({
    sql: 'UPDATE sessions SET expires_at = ? WHERE id = ? AND expires_at > ?',
    args: [expires, sid, Date.now()],
  });
  setCookie(res, COOKIE, sid, { maxAge: COOKIE_MAX_AGE });
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
    await ensureCustomerSchema();
    const c = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [s.customer_id] });
    const customer = c.rows[0];
    if (!customer) return null;
    return customerToUser(customer);
  }
  return s.data ? JSON.parse(s.data) : null;
}

async function registerCustomer({ name, phone, password }) {
  await ensureCustomerSchema();
  const phoneNorm = normPhone(phone);
  if (phoneNorm.length < 9) throw new Error('bad_phone');
  if (!password || password.length < 4) throw new Error('bad_password');
  const db = getDb();
  const exists = await db.execute({ sql: 'SELECT id FROM customers WHERE phone_norm = ?', args: [phoneNorm] });
  if (exists.rows.length) return { ok: false, error: 'phone_exists' };
  const id = uid('u');
  await db.execute({
    sql: 'INSERT INTO customers (id, name, phone, phone_norm, password_hash, profile) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, String(name || '').trim(), String(phone).trim(), phoneNorm, hashPassword(password), '{}'],
  });
  return { ok: true, user: { id, role: 'customer', name: name || '', phone: String(phone).trim(), email: '', telegram: '', instagram: '', address: '' } };
}

async function loginCustomer({ phone, password }) {
  const phoneNorm = normPhone(phone);
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT * FROM customers WHERE phone_norm = ?', args: [phoneNorm] });
  const c = row.rows[0];
  if (!c || !c.password_hash) return { ok: false, error: 'bad_credentials' };
  if (!safeEqual(c.password_hash, hashPassword(password))) return { ok: false, error: 'bad_credentials' };
  return { ok: true, user: customerToUser(c) };
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
  await ensureCustomerSchema();
  const db = getDb();
  let row = await db.execute({ sql: 'SELECT * FROM customers WHERE google_id = ?', args: [googleId] });
  if (row.rows[0]) return customerToUser(row.rows[0]);
  if (email) {
    row = await db.execute({ sql: 'SELECT * FROM customers WHERE email = ?', args: [email] });
    if (row.rows[0]) {
      await db.execute({ sql: 'UPDATE customers SET google_id = ? WHERE id = ?', args: [googleId, row.rows[0].id] });
      const again = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [row.rows[0].id] });
      return customerToUser(again.rows[0]);
    }
  }
  const id = uid('u');
  const phoneNorm = `g${googleId.slice(-8)}`;
  await db.execute({
    sql: 'INSERT INTO customers (id, name, phone, phone_norm, email, google_id, password_hash, profile) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [id, name || 'Google user', '', phoneNorm, email || '', googleId, '', '{}'],
  });
  return { id, role: 'customer', name: name || 'Google user', phone: '', email: email || '', telegram: '', instagram: '', address: '' };
}

async function updateCustomerProfile(customerId, patch) {
  await ensureCustomerSchema();
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [customerId] });
  const c = row.rows[0];
  if (!c) throw new Error('not_found');
  const profile = parseProfile(c.profile);
  const name = patch.name != null ? String(patch.name).trim() : c.name;
  let phone = c.phone;
  let phoneNorm = c.phone_norm;
  if (patch.phone != null && String(patch.phone).trim()) {
    const nextNorm = normPhone(patch.phone);
    if (nextNorm.length >= 9 && nextNorm !== String(c.phone_norm || '')) {
      const clash = await db.execute({
        sql: 'SELECT id FROM customers WHERE phone_norm = ? AND id != ?',
        args: [nextNorm, customerId],
      });
      if (clash.rows.length) throw new Error('phone_exists');
      phone = String(patch.phone).trim();
      phoneNorm = nextNorm;
    } else if (String(patch.phone).trim()) {
      phone = String(patch.phone).trim();
    }
  }
  if (patch.telegram != null) profile.telegram = String(patch.telegram).trim().replace(/^@+/, '');
  if (patch.instagram != null) profile.instagram = String(patch.instagram).trim().replace(/^@+/, '');
  if (patch.address != null) profile.address = String(patch.address).trim();
  const profileJson = JSON.stringify(profile);
  await db.execute({
    sql: 'UPDATE customers SET name = ?, phone = ?, phone_norm = ?, profile = ? WHERE id = ?',
    args: [name || '', phone || '', phoneNorm || c.phone_norm || '', profileJson, customerId],
  });
  // Keep session snapshot in sync (fallback if customer row read fails)
  try {
    await db.execute({
      sql: `UPDATE sessions SET data = ? WHERE customer_id = ? AND expires_at > ?`,
      args: [
        JSON.stringify({
          role: 'customer',
          customerId,
          id: customerId,
          name: name || '',
          phone: phone || '',
          email: c.email || '',
          telegram: profile.telegram || '',
          instagram: profile.instagram || '',
          address: profile.address || '',
        }),
        customerId,
        Date.now(),
      ],
    });
  } catch (_) {
    /* ignore */
  }
  const updated = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [customerId] });
  return customerToUser(updated.rows[0]);
}

module.exports = {
  COOKIE,
  createSession,
  destroySession,
  renewSessionCookie,
  getSessionUser,
  registerCustomer,
  loginCustomer,
  loginAdmin,
  upsertGoogleCustomer,
  updateCustomerProfile,
  customerToUser,
};
