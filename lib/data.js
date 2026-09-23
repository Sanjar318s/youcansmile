const { getDb, uid, normPhone } = require('./db');

async function getJsonTable(table) {
  const db = getDb();
  const rows = await db.execute(`SELECT id, data FROM ${table}`);
  return rows.rows.map((r) => JSON.parse(r.data));
}

async function getProducts() {
  const db = getDb();
  const rows = await db.execute('SELECT data FROM products');
  return rows.rows.map((r) => JSON.parse(r.data));
}

async function getProduct(id) {
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT data FROM products WHERE id = ?', args: [id] });
  return row.rows[0] ? JSON.parse(row.rows[0].data) : null;
}

async function saveProduct(product) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO products (id, category_id, data, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id, data=excluded.data`,
    args: [product.id, product.categoryId || null, JSON.stringify(product), product.createdAt || Date.now()],
  });
  return product;
}

async function deleteProduct(id) {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [id] });
}

async function getCategories() {
  const db = getDb();
  const rows = await db.execute('SELECT data FROM categories');
  return rows.rows.map((r) => JSON.parse(r.data));
}

async function saveCategory(cat) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO categories (id, data, created_at) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    args: [cat.id, JSON.stringify(cat), Date.now()],
  });
  return cat;
}

async function deleteCategory(id) {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] });
}

async function getSettings() {
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT data FROM settings WHERE id = ?', args: ['site'] });
  return row.rows[0] ? JSON.parse(row.rows[0].data) : null;
}

async function saveSettings(data) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO settings (id, data) VALUES ('site', ?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    args: [JSON.stringify(data)],
  });
  return data;
}

async function getOrders() {
  const db = getDb();
  const rows = await db.execute('SELECT data FROM orders ORDER BY created_at DESC');
  return rows.rows.map((r) => JSON.parse(r.data));
}

async function getOrder(id) {
  const db = getDb();
  const row = await db.execute({ sql: 'SELECT data FROM orders WHERE id = ?', args: [id] });
  return row.rows[0] ? JSON.parse(row.rows[0].data) : null;
}

async function saveOrder(order) {
  const db = getDb();
  const phoneNorm = normPhone(order.customer && order.customer.phone);
  await db.execute({
    sql: `INSERT INTO orders (id, customer_id, phone_norm, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id, phone_norm=excluded.phone_norm, status=excluded.status, data=excluded.data`,
    args: [
      order.id,
      order.customerId || null,
      phoneNorm || null,
      order.status || 'new',
      JSON.stringify(order),
      order.createdAt || Date.now(),
    ],
  });
  return order;
}

async function deleteOrder(id) {
  const db = getDb();
  const existing = await getOrder(id);
  if (!existing) return false;
  await db.execute({ sql: 'DELETE FROM orders WHERE id = ?', args: [id] });
  return true;
}

async function getOrdersByStatus(status, limit = 20) {
  const db = getDb();
  const st = String(status || 'new');
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 40);
  try {
    const rows = await db.execute({
      sql: `SELECT data FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
      args: [st, lim],
    });
    return rows.rows.map((r) => JSON.parse(r.data));
  } catch (_) {
    const all = await getOrders();
    return all.filter((o) => (o.status || 'new') === st).slice(0, lim);
  }
}

async function getOrderByNumber(num) {
  const n = String(num || '').replace(/\D/g, '');
  if (n.length < 4) return null;
  const padded = n.length >= 6 ? n.slice(-6) : n.padStart(6, '0');
  const db = getDb();
  try {
    const rows = await db.execute({
      sql: `SELECT data FROM orders WHERE json_extract(data, '$.number') = ? LIMIT 1`,
      args: [padded],
    });
    if (rows.rows[0]) return JSON.parse(rows.rows[0].data);
  } catch (_) {}
  const { orderNumber } = require(require('path').resolve(process.cwd(), 'lib/orders'));
  const all = await getOrders();
  return all.find((o) => orderNumber(o) === padded) || null;
}

async function getReviews(productId) {
  const db = getDb();
  const rows = productId
    ? await db.execute({ sql: 'SELECT data FROM reviews WHERE product_id = ? ORDER BY created_at DESC', args: [productId] })
    : await db.execute('SELECT data FROM reviews ORDER BY created_at DESC');
  return rows.rows.map((r) => JSON.parse(r.data));
}

async function saveReview(review) {
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO reviews (id, product_id, order_id, phone_norm, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [
      review.id,
      review.productId,
      review.orderId,
      normPhone(review.phone),
      JSON.stringify(review),
      review.createdAt || Date.now(),
    ],
  });
  return review;
}

async function getCustomerOrders(customerId, phone) {
  const db = getDb();
  const phoneNorm = normPhone(phone);
  const rows = await db.execute({
    sql: `SELECT data FROM orders WHERE customer_id = ? OR phone_norm = ? ORDER BY created_at DESC`,
    args: [customerId, phoneNorm],
  });
  return rows.rows.map((r) => JSON.parse(r.data));
}

/** Digits-only phone for deep links (WhatsApp / Telegram). Keeps country code when present. */
function phoneDigitsIntl(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 9) d = '998' + d; // local UZ without country
  return d;
}

function parseCustomerProfile(raw) {
  if (!raw) return {};
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

/**
 * Lookup customer + orders by phone for seller contact tooling.
 * Returns profile socials, order contact fields, and deep-link helpers.
 */
async function findContactsByPhone(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9) return { ok: false, error: 'bad_phone' };

  const phoneNorm = normPhone(raw);
  const intl = phoneDigitsIntl(raw);
  const db = getDb();

  const custRows = await db.execute({
    sql: 'SELECT id, name, phone, phone_norm, email, profile FROM customers WHERE phone_norm = ? OR phone = ? LIMIT 5',
    args: [phoneNorm, raw],
  });
  // Also match by trailing digits if exact phone string differs
  let customers = custRows.rows || [];
  if (!customers.length && digits.length >= 9) {
    const all = await db.execute({
      sql: 'SELECT id, name, phone, phone_norm, email, profile FROM customers WHERE phone_norm = ? LIMIT 5',
      args: [digits.slice(-9)],
    });
    customers = all.rows || [];
  }

  const orderRows = await db.execute({
    sql: `SELECT id, data, customer_id FROM orders WHERE phone_norm = ? ORDER BY created_at DESC LIMIT 20`,
    args: [phoneNorm],
  });
  const orders = (orderRows.rows || []).map((r) => {
    try {
      return JSON.parse(r.data);
    } catch (_) {
      return null;
    }
  }).filter(Boolean);

  // Expand orders that embed phone in JSON but mismatched phone_norm
  if (!orders.length && digits.length >= 9) {
    const recent = await db.execute({
      sql: `SELECT data FROM orders ORDER BY created_at DESC LIMIT 80`,
      args: [],
    });
    for (const r of recent.rows || []) {
      try {
        const o = JSON.parse(r.data);
        const p = String((o.customer && o.customer.phone) || o.phone || '').replace(/\D/g, '');
        if (p && (p.slice(-9) === digits.slice(-9) || p === digits || p === intl)) {
          orders.push(o);
        }
      } catch (_) {}
      if (orders.length >= 15) break;
    }
  }

  const accounts = customers.map((c) => {
    const profile = parseCustomerProfile(c.profile);
    return {
      id: c.id,
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      telegram: profile.telegram || '',
      instagram: profile.instagram || '',
      address: profile.address || '',
    };
  });

  // Aggregate socials from orders (checkout contact field)
  const orderContacts = [];
  for (const o of orders) {
    const c = o.customer || {};
    if (c.contact || c.contactChannel) {
      orderContacts.push({
        orderId: o.id,
        name: c.name || '',
        phone: c.phone || '',
        contact: c.contact || '',
        channel: c.contactChannel || '',
      });
    }
  }

  return {
    ok: true,
    query: raw,
    phoneNorm,
    intl,
    accounts,
    orders,
    orderContacts,
  };
}

module.exports = {
  getProducts,
  getProduct,
  saveProduct,
  deleteProduct,
  getCategories,
  saveCategory,
  deleteCategory,
  getSettings,
  saveSettings,
  getOrders,
  getOrder,
  saveOrder,
  deleteOrder,
  getOrdersByStatus,
  getOrderByNumber,
  getReviews,
  saveReview,
  getCustomerOrders,
  findContactsByPhone,
  phoneDigitsIntl,
  uid,
  normPhone,
};
