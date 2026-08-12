const { getDb, uid } = require('./db');

async function getOrCreateThread(customerId) {
  const db = getDb();
  const row = await db.execute({
    sql: 'SELECT * FROM chat_threads WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1',
    args: [customerId],
  });
  if (row.rows[0]) return row.rows[0];
  const id = uid('t');
  const now = Date.now();
  await db.execute({
    sql: 'INSERT INTO chat_threads (id, customer_id, needs_seller, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
    args: [id, customerId, now, now],
  });
  return { id, customer_id: customerId, needs_seller: 0, created_at: now, updated_at: now };
}

async function getThreadById(threadId) {
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
  const db = getDb();
  await db.execute({
    sql: 'UPDATE chat_threads SET needs_seller = ?, updated_at = ? WHERE id = ?',
    args: [val ? 1 : 0, Date.now(), threadId],
  });
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
  getOrCreateThread,
  getThreadById,
  getMessages,
  saveMessage,
  setNeedsSeller,
  saveMedia,
  getMedia,
  mapMessageRow,
};
