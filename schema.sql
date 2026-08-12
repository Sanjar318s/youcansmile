-- YouCanSmile — Turso schema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'site',
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  phone_norm TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  profile TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_customers_google ON customers(google_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  data TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  phone_norm TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone_norm);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  phone_norm TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  needs_seller INTEGER NOT NULL DEFAULT 0,
  seller_connected INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_customer ON chat_threads(customer_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  author TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT,
  media_url TEXT,
  lat REAL,
  lng REAL,
  reply_to_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  keys_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_role ON push_subscriptions(role);
