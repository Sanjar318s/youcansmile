const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

let client;
let customerSchemaReady = false;

function getDb() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  client = createClient({ url, authToken: authToken || undefined });
  return client;
}

async function ensureCustomerSchema() {
  if (customerSchemaReady) return;
  const db = getDb();
  try {
    await db.execute('ALTER TABLE customers ADD COLUMN profile TEXT');
  } catch (_) {
    /* already exists */
  }
  try {
    await db.execute(`UPDATE customers SET profile = '{}' WHERE profile IS NULL OR profile = ''`);
  } catch (_) {
    /* ignore */
  }
  customerSchemaReady = true;
}

async function runSchema() {
  const db = getDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  const parts = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
  for (const stmt of parts) {
    await db.execute(stmt);
  }
  customerSchemaReady = false;
  await ensureCustomerSchema();
  try {
    const { ensureChatSchema } = require('./chat');
    await ensureChatSchema();
  } catch (_) {
    /* chat module optional during early boot */
  }
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function normPhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-9);
}

module.exports = { getDb, runSchema, ensureCustomerSchema, uid, normPhone };
