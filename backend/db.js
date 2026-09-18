// db.js
// SQLite database setup using Node's built-in node:sqlite module (Node 22.5+).
// No native build step required — good for quick deploys.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'brewbliss.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- 'owner' | 'staff'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'coffee', -- offer | coffee | dessert | food | sides
  price REAL NOT NULL,
  original_price REAL, -- only used for category='offer' — the "was" price the discount % is computed from
  description TEXT,
  image_url TEXT,
  icon TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  stock INTEGER, -- NULL = unlimited
  avg_rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  combo_config TEXT, -- JSON: { slots: [{ label, category, nameContains? }] } — only for combo/offer items that require picking specific menu items
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, -- e.g. BB-482913
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'delivery', -- delivery | pickup
  delivery_address TEXT,
  subtotal REAL NOT NULL,
  delivery_fee REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL, -- card | upi | cod
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  payment_ref TEXT,
  status TEXT NOT NULL DEFAULT 'placed', -- placed|confirmed|preparing|on-the-way|ready|delivered|cancelled
  placed_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id),
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  selections TEXT -- JSON array of chosen item names, for combo items (e.g. ["Belgian Chocolate Cake","Classic Tiramisu"])
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  rater_token TEXT NOT NULL, -- a random ID the browser generates & stores locally, so a repeat visitor updates their own rating instead of stacking duplicates
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (menu_item_id, rater_token)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_ratings_menu_item_id ON ratings(menu_item_id);
`);

// Migration: add original_price to any database created before this column existed.
const existingColumns = db.prepare("PRAGMA table_info(menu_items)").all().map(c => c.name);
if (!existingColumns.includes('original_price')) {
  db.exec('ALTER TABLE menu_items ADD COLUMN original_price REAL;');
}
if (!existingColumns.includes('avg_rating')) {
  db.exec('ALTER TABLE menu_items ADD COLUMN avg_rating REAL NOT NULL DEFAULT 0;');
}
if (!existingColumns.includes('rating_count')) {
  db.exec('ALTER TABLE menu_items ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;');
}
if (!existingColumns.includes('combo_config')) {
  db.exec('ALTER TABLE menu_items ADD COLUMN combo_config TEXT;');
}
const existingOrderItemColumns = db.prepare("PRAGMA table_info(order_items)").all().map(c => c.name);
if (!existingOrderItemColumns.includes('selections')) {
  db.exec('ALTER TABLE order_items ADD COLUMN selections TEXT;');
}

module.exports = db;
