-- ================================================================
-- Elegant La Vie — D1 Database Schema
-- Pakistani Perfume Store | All prices in PKR (Pakistani Rupee)
-- ================================================================
-- Run locally : wrangler d1 execute elegant-la-vie-db --local --file=schema.sql
-- Run on prod : wrangler d1 execute elegant-la-vie-db --file=schema.sql
-- ================================================================

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT    NOT NULL,
  email       TEXT    UNIQUE,
  username    TEXT    UNIQUE,
  phone       TEXT,                          -- WhatsApp / contact number
  password    TEXT    NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer', 'admin')),
  city        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ── Products ──────────────────────────────────────────────────
-- gender column drives the Male / Female section split on the frontend
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  tagline         TEXT,
  description     TEXT,

  -- Primary classification visible on the storefront
  gender          TEXT    NOT NULL DEFAULT 'unisex'
                    CHECK (gender IN ('male', 'female', 'unisex')),

  -- Scent metadata (stored as JSON arrays for flexibility)
  scent_family    TEXT,                      -- e.g. "Woody Oriental"
  top_notes       TEXT    DEFAULT '[]',      -- JSON: ["bergamot","cardamom"]
  middle_notes    TEXT    DEFAULT '[]',      -- JSON
  base_notes      TEXT    DEFAULT '[]',      -- JSON

  -- Product specs
  concentration   TEXT    CHECK (concentration IN ('Parfum','EDP','EDT','EDC','Attar','Oil')),
  volume_ml       INTEGER,
  brand           TEXT    NOT NULL DEFAULT 'Elegant La Vie',

  -- Pricing in PKR
  price_pkr       REAL    NOT NULL,
  sale_price_pkr  REAL,                      -- NULL = no active sale

  -- Inventory
  stock           INTEGER NOT NULL DEFAULT 0,
  is_featured     INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  image_url       TEXT,

  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_gender   ON products(gender);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);

-- ── Orders ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Customer snapshot (captured at checkout — no account required)
  customer_name     TEXT    NOT NULL,
  customer_phone    TEXT    NOT NULL,
  customer_city     TEXT    NOT NULL,
  customer_address  TEXT    NOT NULL,

  -- Optional linked account
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- Order lifecycle
  status            TEXT    NOT NULL DEFAULT 'pending_whatsapp'
                      CHECK (status IN (
                        'pending_whatsapp',   -- WA message sent, awaiting store reply
                        'confirmed',          -- store owner confirmed via WA
                        'dispatched',         -- handed to courier
                        'delivered',          -- COD collected, done
                        'cancelled'
                      )),

  -- Payment
  payment_method    TEXT    NOT NULL DEFAULT 'cod'
                      CHECK (payment_method IN ('cod', 'easypaisa', 'jazzcash', 'bank')),
  payment_status    TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (payment_status IN ('pending', 'paid', 'refunded')),

  -- Financials (PKR)
  subtotal_pkr      REAL    NOT NULL DEFAULT 0,
  shipping_pkr      REAL    NOT NULL DEFAULT 200,
  discount_pkr      REAL    NOT NULL DEFAULT 0,
  total_pkr         REAL    NOT NULL DEFAULT 0,

  -- Gift / notes
  gift_wrapping     TEXT    DEFAULT 'none'
                      CHECK (gift_wrapping IN ('none', 'standard', 'premium')),
  gift_message      TEXT,
  notes             TEXT,

  -- WhatsApp audit
  whatsapp_sent_at  TEXT,

  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone  ON orders(customer_phone);

-- ── Order Items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name   TEXT    NOT NULL,    -- price-snapshot name
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price_pkr REAL    NOT NULL,    -- price locked at time of order
  line_total_pkr REAL    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- ================================================================
-- SEED DATA — 6 Male + 6 Female perfumes
-- ================================================================

-- ── MALE perfumes ─────────────────────────────────────────────
INSERT OR IGNORE INTO products
  (name, slug, tagline, description, gender,
   scent_family, top_notes, middle_notes, base_notes,
   concentration, volume_ml, price_pkr, sale_price_pkr,
   stock, is_featured, image_url)
VALUES
  (
    'Intense Wood',
    'intense-wood',
    'Commanding depth, refined edge.',
    'A bold woody aromatic built for the confident Pakistani man. Deep cedarwood and smoky vetiver anchor a heart of spiced cardamom — leaving a trail that demands respect in boardrooms and banquets alike.',
    'male',
    'Woody Aromatic',
    '["bergamot","black pepper","cardamom"]',
    '["cedarwood","geranium","leather"]',
    '["vetiver","amber","dark musk"]',
    'EDP', 100, 4500, 3800,
    50, 1, NULL
  ),
  (
    'Ocean Blue',
    'ocean-blue',
    'Fresh as the Arabian Sea.',
    'Inspired by Karachi''s shoreline, Ocean Blue opens with a burst of sea salt and citrus before giving way to crisp marine florals. Effortlessly modern — perfect for the daily grind.',
    'male',
    'Aquatic Fresh',
    '["sea salt","lemon","grapefruit"]',
    '["marine accord","lavender","jasmine"]',
    '["sandalwood","white musk","driftwood"]',
    'EDT', 100, 3200, NULL,
    65, 1, NULL
  ),
  (
    'Royal Oud',
    'royal-oud',
    'Heritage in every drop.',
    'A grand Middle-Eastern oud woven with saffron and rose — a tribute to the subcontinent''s love affair with agarwood. Worn at weddings, worn for milestones.',
    'male',
    'Woody Oriental',
    '["saffron","pink pepper","bergamot"]',
    '["oud","rose","leather"]',
    '["amber","sandalwood","dark musk"]',
    'Parfum', 50, 7500, 6500,
    30, 1, NULL
  ),
  (
    'Dark Ember',
    'dark-ember',
    'Mysterious. Smoky. Unforgettable.',
    'A brooding oriental of charred incense, tobacco, and leather. Dark Ember is the scent of winter evenings in Lahore — intoxicating, warm, and unmistakably masculine.',
    'male',
    'Oriental Woody',
    '["incense","clove","nutmeg"]',
    '["leather","tobacco","rose"]',
    '["dark oud","amber","vanilla"]',
    'EDP', 75, 5200, NULL,
    28, 0, NULL
  ),
  (
    'Silver Sport',
    'silver-sport',
    'Clean energy for every day.',
    'A light aromatic fougère built for Pakistan''s climate — fresh, long-lasting, and inoffensive. Ideal for office wear during Lahore and Karachi summers.',
    'male',
    'Aromatic Fougère',
    '["mint","green apple","bergamot"]',
    '["lavender","violet leaf","aquatic"]',
    '["cedarwood","white musk","vetiver"]',
    'EDT', 100, 2800, 2400,
    85, 0, NULL
  ),
  (
    'Amber Nights',
    'amber-nights',
    'Warm gold for festive evenings.',
    'Rich amber and warm vanilla envelop a spicy heart of cinnamon and benzoin. The perfect companion for Eid gatherings, shaadi events, and Pakistani winters.',
    'male',
    'Amber Oriental',
    '["rum","bergamot","cinnamon"]',
    '["amber","benzoin","rose"]',
    '["vanilla","tonka bean","sandalwood"]',
    'EDP', 100, 4200, NULL,
    42, 0, NULL
  );

-- ── FEMALE perfumes ───────────────────────────────────────────
INSERT OR IGNORE INTO products
  (name, slug, tagline, description, gender,
   scent_family, top_notes, middle_notes, base_notes,
   concentration, volume_ml, price_pkr, sale_price_pkr,
   stock, is_featured, image_url)
VALUES
  (
    'Floral Bloom',
    'floral-bloom',
    'Joyful, radiant, effortlessly you.',
    'A sun-kissed bouquet of fresh roses and peonies lifted by the brightness of yuzu. Floral Bloom bottles the feeling of spring in a Pakistan hill station — joyful, light, and endlessly wearable.',
    'female',
    'Floral Fresh',
    '["yuzu","raspberry","pink pepper"]',
    '["rose","peony","magnolia"]',
    '["white musk","sandalwood","cashmere"]',
    'EDP', 75, 3800, 3200,
    60, 1, NULL
  ),
  (
    'Velvet Rose',
    'velvet-rose',
    'The bridal fragrance of a generation.',
    'Opulent Bulgarian rose interwoven with saffron and soft oud. Velvet Rose is the scent a Pakistani bride reaches for — grand, warm, and written into memory on the most important day of her life.',
    'female',
    'Floral Oriental',
    '["saffron","bergamot","blackcurrant"]',
    '["Bulgarian rose","oud","lily of the valley"]',
    '["patchouli","amber","white musk"]',
    'Parfum', 50, 6800, NULL,
    35, 1, NULL
  ),
  (
    'Sweet Orchid',
    'sweet-orchid',
    'Playful sweetness, everyday magic.',
    'A warm gourmand floral of creamy vanilla, exotic orchid, and ripe peach. Youthful, addictive, and universally beloved — perfect for every season and every occasion.',
    'female',
    'Floral Gourmand',
    '["mandarin","lychee","peach"]',
    '["orchid","jasmine","heliotrope"]',
    '["vanilla","sandalwood","musk"]',
    'EDP', 100, 3500, 2900,
    72, 0, NULL
  ),
  (
    'Pink Pearl',
    'pink-pearl',
    'Polished. Powdery. Perfectly chic.',
    'Sophisticated iris and violet on a clean musky base — a powdery floral that balances classic French elegance with modern lightness. Made for the Pakistani professional.',
    'female',
    'Powdery Floral',
    '["bergamot","pink pepper","neroli"]',
    '["iris","violet","rose"]',
    '["musk","cedarwood","vanilla"]',
    'EDT', 100, 3000, NULL,
    55, 0, NULL
  ),
  (
    'Oud Femme',
    'oud-femme',
    'She walks in. Every head turns.',
    'A daring feminine oud — agarwood''s richness softened by rose water and lifted by the sweetness of honey. For the woman who owns every room she enters.',
    'female',
    'Woody Oriental',
    '["rose water","bergamot","saffron"]',
    '["oud","honey","Bulgarian rose"]',
    '["amber","tonka bean","dark musk"]',
    'EDP', 75, 5500, 4800,
    30, 1, NULL
  ),
  (
    'Jasmine Nights',
    'jasmine-nights',
    'As intoxicating as summer in Lahore.',
    'Absolute jasmine — heady, rich, and indulgent the way jasmine smells on hot summer nights. A true ode to the subcontinent''s most beloved flower, wrapped in soft sandalwood.',
    'female',
    'White Floral',
    '["bergamot","green leaves","peach"]',
    '["jasmine absolute","tuberose","ylang-ylang"]',
    '["sandalwood","cedarwood","white musk"]',
    'EDP', 100, 4000, NULL,
    45, 0, NULL
  );

-- ── Admin user ────────────────────────────────────────────────
-- Password: Admin@123 (SHA-256 — change before going live!)
-- Generate a new hash: echo -n 'yourNewPassword' | sha256sum
INSERT OR IGNORE INTO users (full_name, email, username, password, role, city)
VALUES (
  'Elegant La Vie Admin',
  'admin@elegantlavie.pk',
  'admin',
  'c9b28409ee8b6d8f3274f60f6f25d2463edd5ee13edda1a5266aef0ee5e57742',
  'admin',
  'Lahore'
);
