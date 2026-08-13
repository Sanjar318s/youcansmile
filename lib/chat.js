const { getDb, uid } = require('./db');

let chatSchemaReady = false;

async function ensureChatSchema() {
  if (chatSchemaReady) return;
  const db = getDb();
  try {
    await db.execute('ALTER TABLE chat_threads ADD COLUMN seller_connected INTEGER NOT NULL DEFAULT 0');
  } catch (_) {
    /* exists */
  }
  try {
    await db.execute('ALTER TABLE chat_threads ADD COLUMN closed_at INTEGER NOT NULL DEFAULT 0');
  } catch (_) {
    /* exists */
  }
  try {
    await db.execute('ALTER TABLE chat_threads ADD COLUMN rating INTEGER NOT NULL DEFAULT 0');
  } catch (_) {
    /* exists */
  }
  try {
    await db.execute('ALTER TABLE chat_threads ADD COLUMN rating_comment TEXT');
  } catch (_) {
    /* exists */
  }
  chatSchemaReady = true;
}

async function getOrCreateThread(customerId) {
  await ensureChatSchema();
  const db = getDb();
  const row = await db.execute({
    sql: 'SELECT * FROM chat_threads WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1',
    args: [customerId],
  });
  if (row.rows[0]) return row.rows[0];
  const id = uid('t');
  const now = Date.now();
  await db.execute({
    sql: 'INSERT INTO chat_threads (id, customer_id, needs_seller, seller_connected, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)',
    args: [id, customerId, now, now],
  });
  return {
    id,
    customer_id: customerId,
    needs_seller: 0,
    seller_connected: 0,
    created_at: now,
    updated_at: now,
  };
}

async function getThreadById(threadId) {
  await ensureChatSchema();
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT * FROM chat_threads WHERE id = ?', args: [threadId] });
  return row.rows[0] || null;
}

async function getMessages(threadId, since) {
  const db = getDb();
  const sinceNum = Number(since) || 0;
  const rows = sinceNum
    ? await db.execute({
        sql: 'SELECT * FROM chat_messages WHERE thread_id = ? AND created_at > ? ORDER BY created_at ASC',
        args: [threadId, sinceNum],
      })
    : await db.execute({
        sql: 'SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC',
        args: [threadId],
      });
  return rows.rows.map(mapMessageRow);
}

function mapMessageRow(r) {
  return {
    id: r.id,
    threadId: r.thread_id,
    author: r.author,
    type: r.type || 'text',
    text: r.text || '',
    mediaUrl: r.media_url || '',
    lat: r.lat,
    lng: r.lng,
    replyToId: r.reply_to_id || null,
    createdAt: r.created_at,
  };
}

async function saveMessage(msg) {
  const db = getDb();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO chat_messages (id, thread_id, author, type, text, media_url, lat, lng, reply_to_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      msg.id,
      msg.threadId,
      msg.author,
      msg.type || 'text',
      msg.text || null,
      msg.mediaUrl || null,
      msg.lat ?? null,
      msg.lng ?? null,
      msg.replyToId || null,
      msg.createdAt || now,
    ],
  });
  await db.execute({
    sql: 'UPDATE chat_threads SET updated_at = ? WHERE id = ?',
    args: [now, msg.threadId],
  });
  return msg;
}

async function setNeedsSeller(threadId, val) {
  await ensureChatSchema();
  const db = getDb();
  await db.execute({
    sql: 'UPDATE chat_threads SET needs_seller = ?, updated_at = ? WHERE id = ?',
    args: [val ? 1 : 0, Date.now(), threadId],
  });
}

async function setSellerConnected(threadId, val) {  await ensureChatSchema();
  const db = getDb();
  const now = Date.now();
  if (val) {
    await db.execute({
      sql: 'UPDATE chat_threads SET seller_connected = 0 WHERE seller_connected = 1',
      args: [],
    });
    await db.execute({
      sql: 'UPDATE chat_threads SET seller_connected = 1, needs_seller = 1, updated_at = ? WHERE id = ?',
      args: [now, threadId],
    });
  } else {
    await db.execute({
      sql: 'UPDATE chat_threads SET seller_connected = 0, updated_at = ? WHERE id = ?',
      args: [now, threadId],
    });
  }
}

async function setThreadClosed(threadId, rating, comment) {
  await ensureChatSchema();
  const db = getDb();
  const r = Math.min(5, Math.max(1, Number(rating) || 0));
  await db.execute({
    sql: 'UPDATE chat_threads SET closed_at = ?, rating = ?, rating_comment = ?, updated_at = ? WHERE id = ?',
    args: [Date.now(), r, String(comment || '') || null, Date.now(), threadId],
  });
}

async function getConnectedThread() {
  await ensureChatSchema();
  const db = getDb();
  const row = await db.execute({
    sql: 'SELECT * FROM chat_threads WHERE seller_connected = 1 ORDER BY updated_at DESC LIMIT 1',
    args: [],
  });
  return row.rows[0] || null;
}

async function listSellerThreads(limit = 15) {
  await ensureChatSchema();
  const db = getDb();
  const rows = await db.execute({
    sql: `SELECT t.id, t.customer_id, t.needs_seller, t.seller_connected, t.updated_at,
                 c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
                 (SELECT text FROM chat_messages m WHERE m.thread_id = t.id AND m.text IS NOT NULL AND m.text != ''
                  ORDER BY m.created_at DESC LIMIT 1) AS last_text,
                 (SELECT type FROM chat_messages m WHERE m.thread_id = t.id
                  ORDER BY m.created_at DESC LIMIT 1) AS last_type
          FROM chat_threads t
          LEFT JOIN customers c ON c.id = t.customer_id
          ORDER BY t.seller_connected DESC, t.needs_seller DESC, t.updated_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return rows.rows;
}

async function getCustomerBrief(customerId) {
  const db = getDb();
  const row = await db.execute({
    sql: 'SELECT id, name, phone, email FROM customers WHERE id = ?',
    args: [customerId],
  });
  return row.rows[0] || null;
}

async function saveMedia({ id, mime, data }) {
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO media (id, mime, data, created_at) VALUES (?, ?, ?, ?)',
    args: [id, mime, data, Date.now()],
  });
  return { id, mime };
}

async function getMedia(id) {
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT * FROM media WHERE id = ?', args: [id] });
  return row.rows[0] || null;
}

module.exports = {
  ensureChatSchema,
  getOrCreateThread,
  getThreadById,
  getMessages,
  saveMessage,
  setNeedsSeller,
  setSellerConnected,
  setThreadClosed,
  getConnectedThread,
  listSellerThreads,
  getCustomerBrief,
  saveMedia,
  getMedia,
  mapMessageRow,
};
