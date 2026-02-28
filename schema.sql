-- ============================================================
-- Oud & Essence — Cloudflare D1 Schema
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,
  username    TEXT    NOT NULL UNIQUE,
  password    TEXT    NOT NULL,          -- bcrypt hash (pre-hashed before insert)
  role        TEXT    NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  full_name   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Products ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  tagline         TEXT,
  description     TEXT,
  price           REAL    NOT NULL,
  image_url       TEXT,
  -- Scent classification
  scent_mood      TEXT    NOT NULL CHECK(scent_mood IN ('mysterious','floral','fresh','warm')),
  scent_notes     TEXT    NOT NULL,      -- JSON array: ["oud","sandalwood","amber"]
  concentration   TEXT    CHECK(concentration IN ('EDP','EDT','parfum','oil')),
  volume_ml       INTEGER,
  -- Inventory
  stock           INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_mood   ON products(scent_mood);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- ── Orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status              TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','paid','shipped','delivered','cancelled')),
  -- Stripe
  stripe_payment_intent TEXT UNIQUE,
  stripe_charge_id      TEXT,
  -- Gift
  gift_wrapping       TEXT    CHECK(gift_wrapping IN ('emerald_box','wooden_chest','none')),
  gift_message        TEXT,
  -- Totals (stored in cents to avoid float precision issues)
  subtotal_cents      INTEGER NOT NULL DEFAULT 0,
  tax_cents           INTEGER NOT NULL DEFAULT 0,
  shipping_cents      INTEGER NOT NULL DEFAULT 0,
  total_cents         INTEGER NOT NULL DEFAULT 0,
  -- Shipping address (JSON blob for flexibility)
  shipping_address    TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ── Order Items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,   -- snapshot at time of purchase
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- ── Seed Data ────────────────────────────────────────────────
-- Admin user (password: "admin123" — replace hash in production)
INSERT OR IGNORE INTO users (email, username, password, role, full_name)
VALUES ('admin@oudessence.com', 'admin', '$2a$10$ExampleHashReplaceMe', 'admin', 'Store Admin');

-- Sample products matching the HTML collection cards
INSERT OR IGNORE INTO products (name, slug, tagline, description, price, scent_mood, scent_notes, concentration, volume_ml, stock, image_url)
VALUES
  ('Oud Noir',
   'oud-noir',
   'Deep & Mysterious',
   'A bold journey into the heart of ancient oud forests. Rich, dark, and unforgettable.',
   185.00,
   'mysterious',
   '["oud","black pepper","vetiver","musk","leather"]',
   'EDP', 50, 40,
   'https://lh3.googleusercontent.com/aida-public/AB6AXuB5369f3Cmu6TMXuqpHEqnswtxnCNXRHpvyY12IR2C5BbztzJe3fdg9RA17AaZAZDOxI1xwM8fZbrQ_yuxMszQGiut91bzCMchX4GZ1SEyCBF-erDga7Ybh9_bfP--JLRDlgbJ6OkhhWyiy8dn6lk95DmRKsjqOVgHPrQDRx50eLYFolIKuaM3RBOn5AqYhBtFHBlMlCyCJTcdYGT8aXu_sYGvLGyR4gPS8se0PWSIYiF6xy7EIDa-b-RgVZ6T6qSabc8z0AF8XBw47'),

  ('Rose Royale',
   'rose-royale',
   'Elegant & Floral',
   'Empress-grade Bulgarian rose entwined with saffron and white musk. Royalty in a bottle.',
   160.00,
   'floral',
   '["rose","saffron","white musk","jasmine","patchouli"]',
   'EDP', 50, 55,
   'https://lh3.googleusercontent.com/aida-public/AB6AXuBomvGdi715EGG3q1B4W5xdQUOfMCRsDLIV7JfJLjQ5Ui57A3uHASyUMQWUtcuJ-92fVRlMHkn3rOEDkkUQyzNXZgl8hYNBD-1zYlYXGk1JL4hRGY4diwp0SZJ3kyJrHnaEzCpV5qPzbDusNJRN3QJFkCfMhJtWnRpYybGcYmezaju1Uav7ZCGrRlpJLcc33xwuIpC7himHkOfHAPDfRre0Qbnzs6TrfaIILCokv9E0uM56X2ijyxY1PzPyiKa7c9_MQePhfk9nzqdk'),

  ('Sandalwood Silk',
   'sandalwood-silk',
   'Smooth & Woody',
   'Mysore sandalwood melts into creamy vanilla and warm amber for a silken second skin.',
   160.00,
   'warm',
   '["sandalwood","vanilla","amber","cedarwood","tonka bean"]',
   'EDP', 50, 60,
   'https://lh3.googleusercontent.com/aida-public/AB6AXuC9BfDKpsxkLJ_nNATOw3Wuk4mgwp8y-ncPaCsy13idaUiZnOgknY3j4zadYm_1RGBLaph5qBxmt1pG5wWQ67k8nUndktJnJyVeqfXy_F0dgM5EyDY1daJS61nEYwvpUfWTmYBt8d75H7fa7JxHjwaJlSWIDkclPP58UPWt5nDdKdECrB3iImey9k410lsODWS0wpLhRMeRflLQMbPCYZtzUBMbjw_I92j9cHe2Mc1Epmf3_N3aq5F6rlGgklgmdN3Ca2ZfTZK6kPNe'),

  ('Citrus Breeze',
   'citrus-breeze',
   'Fresh & Airy',
   'Sun-drenched bergamot and neroli float on a bed of sea salt and white cedar.',
   140.00,
   'fresh',
   '["bergamot","neroli","sea salt","white cedar","green tea"]',
   'EDT', 100, 75,
   NULL);
