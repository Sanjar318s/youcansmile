const { getDb } = require('./db');

let pushSchemaReady = false;

async function ensurePushSchema() {
  if (pushSchemaReady) return;
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      keys_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_push_role ON push_subscriptions(role)`
  );
  pushSchemaReady = true;
}

function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@youcansmile.vercel.app';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

async function saveSubscription({ endpoint, keys, userId, role }) {
  if (!endpoint || !keys) return;
  await ensurePushSchema();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, user_id, role, keys_json, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            user_id=excluded.user_id,
            role=excluded.role,
            keys_json=excluded.keys_json,
            updated_at=excluded.updated_at`,
    args: [
      String(endpoint),
      userId || null,
      role || 'customer',
      JSON.stringify(keys),
      Date.now(),
    ],
  });
}

async function removeSubscription(endpoint) {
  if (!endpoint) return;
  await ensurePushSchema();
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
    args: [String(endpoint)],
  });
}

async function listSubscriptionsForUser(userId) {
  if (!userId) return [];
  await ensurePushSchema();
  const db = getDb();
  const rows = await db.execute({
    sql: 'SELECT endpoint, keys_json, role, user_id FROM push_subscriptions WHERE user_id = ?',
    args: [String(userId)],
  });
  return rows.rows.map(rowToSub);
}

async function listSubscriptionsForRole(role) {
  await ensurePushSchema();
  const db = getDb();
  const rows = await db.execute({
    sql: 'SELECT endpoint, keys_json, role, user_id FROM push_subscriptions WHERE role = ?',
    args: [String(role)],
  });
  return rows.rows.map(rowToSub);
}

function rowToSub(r) {
  let keys = {};
  try {
    keys = JSON.parse(r.keys_json || '{}');
  } catch (_) {}
  return {
    endpoint: r.endpoint,
    keys,
    role: r.role,
    userId: r.user_id,
  };
}

async function sendWebPush(subscription, payload) {
  const cfg = getVapidConfig();
  if (!cfg) return { ok: false, error: 'no_vapid' };
  let webpush;
  try {
    webpush = require('web-push');
  } catch (_) {
    return { ok: false, error: 'no_webpush_module' };
  }
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      body
    );
    return { ok: true };
  } catch (e) {
    const code = e.statusCode || e.statusCode;
    if (code === 404 || code === 410) {
      await removeSubscription(subscription.endpoint);
    }
    return { ok: false, error: e.message };
  }
}

async function notifyUser(userId, payload) {
  const subs = await listSubscriptionsForUser(userId);
  const results = [];
  for (const sub of subs) {
    results.push(await sendWebPush(sub, payload));
  }
  return results;
}

async function notifyAdmins(payload) {
  const subs = await listSubscriptionsForRole('admin');
  const results = [];
  for (const sub of subs) {
    results.push(await sendWebPush(sub, payload));
  }
  return results;
}

module.exports = {
  ensurePushSchema,
  vapidPublicKey,
  getVapidConfig,
  saveSubscription,
  removeSubscription,
  notifyUser,
  notifyAdmins,
};
