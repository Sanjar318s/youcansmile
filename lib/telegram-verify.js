const { getDb } = require('./db');
const { normPhoneE164, phoneLookupKeys } = require('./phone');

let schemaReady = false;

async function ensureTelegramVerifySchema() {
  if (schemaReady) return;
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS phone_telegram_links (
      phone_e164 TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL UNIQUE,
      telegram_username TEXT,
      customer_id TEXT,
      verified_at INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS telegram_verify_tokens (
      token TEXT PRIMARY KEY,
      phone_e164 TEXT NOT NULL,
      customer_id TEXT,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    )
  `);
  try {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_tg_links_telegram ON phone_telegram_links(telegram_id)');
  } catch (_) {}
  schemaReady = true;
}

async function createVerifyToken({ phone, customerId }) {
  await ensureTelegramVerifySchema();
  const phoneE164 = normPhoneE164(phone);
  if (!phoneE164 || phoneE164.length < 10) {
    const err = new Error('bad_phone');
    err.code = 'bad_phone';
    throw err;
  }
  const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const expires = Date.now() + 15 * 60 * 1000;
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO telegram_verify_tokens (token, phone_e164, customer_id, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)',
    args: [token, phoneE164, customerId || null, expires],
  });
  return { token, phoneE164, expiresAt: expires };
}

async function getVerifyToken(token) {
  await ensureTelegramVerifySchema();
  const db = getDb();
  const row = await db.execute({
    sql: 'SELECT * FROM telegram_verify_tokens WHERE token = ?',
    args: [String(token || '')],
  });
  return row.rows[0] || null;
}

async function markTokenUsed(token) {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE telegram_verify_tokens SET used_at = ? WHERE token = ?',
    args: [Date.now(), token],
  });
}

async function getLinkByPhone(phone) {
  await ensureTelegramVerifySchema();
  const keys = phoneLookupKeys(phone);
  if (!keys.length) return null;
  const db = getDb();
  for (const key of keys) {
    const row = await db.execute({
      sql: 'SELECT * FROM phone_telegram_links WHERE phone_e164 = ?',
      args: [key],
    });
    if (row.rows[0]) return row.rows[0];
  }
  return null;
}

async function getLinkByTelegramId(telegramId) {
  await ensureTelegramVerifySchema();
  const db = getDb();
  const row = await db.execute({
    sql: 'SELECT * FROM phone_telegram_links WHERE telegram_id = ?',
    args: [String(telegramId)],
  });
  return row.rows[0] || null;
}

/**
 * Bind telegram user to phone. Fails if telegram_id already on another phone.
 */
async function bindPhoneTelegram({ phoneE164, telegramId, telegramUsername, customerId }) {
  await ensureTelegramVerifySchema();
  const phone = String(phoneE164 || '');
  const tgId = String(telegramId || '');
  if (!phone || !tgId) {
    const err = new Error('bad_bind');
    err.code = 'bad_bind';
    throw err;
  }
  const existingTg = await getLinkByTelegramId(tgId);
  if (existingTg && String(existingTg.phone_e164) !== phone) {
    const err = new Error('telegram_taken');
    err.code = 'telegram_taken';
    throw err;
  }
  const db = getDb();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO phone_telegram_links (phone_e164, telegram_id, telegram_username, customer_id, verified_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(phone_e164) DO UPDATE SET
            telegram_id=excluded.telegram_id,
            telegram_username=excluded.telegram_username,
            customer_id=COALESCE(excluded.customer_id, phone_telegram_links.customer_id),
            verified_at=excluded.verified_at`,
    args: [phone, tgId, telegramUsername || null, customerId || null, now],
  });
  return getLinkByPhone(phone);
}

async function isPhoneTelegramVerified(phone) {
  const link = await getLinkByPhone(phone);
  return !!link;
}

module.exports = {
  ensureTelegramVerifySchema,
  createVerifyToken,
  getVerifyToken,
  markTokenUsed,
  getLinkByPhone,
  getLinkByTelegramId,
  bindPhoneTelegram,
  isPhoneTelegramVerified,
};
