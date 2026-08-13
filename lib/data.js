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
  getReviews,
  saveReview,
  getCustomerOrders,
  uid,
  normPhone,
};
