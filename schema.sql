-- Elegant La Vie - D1 Database Schema
-- Run: wrangler d1 execute perfume-store --file=schema.sql

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  image TEXT,
  scent_mood TEXT NOT NULL,
  scent_notes TEXT,
  stock INTEGER DEFAULT 100,
  featured INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  total_amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  stripe_session_id TEXT,
  gift_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Seed admin user (password: admin123)
INSERT INTO users (name, email, password_hash, role) VALUES
('Kaleem Ullah', 'admin@elegantlavie.com', '$2a$10$rRJkMu0HCzsMq7UaRFKLaOBv5dxZ4A5k9V2Lm3X7NqwP8cYe1tGiC', 'admin');

-- Seed perfume products
INSERT INTO products (name, description, price, image, scent_mood, scent_notes, featured) VALUES
('Noir Mystique', 'A bewitching blend of dark woods and ancient resins that awakens the senses. This enigmatic fragrance unfolds like a midnight secret.', 285.00, 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600', 'Mysterious', 'Oud, Amber, Dark Rose, Sandalwood', 1),
('Velvet Obscura', 'Deep, hypnotic and unmistakably luxurious. A shadowy masterpiece that lingers like a whispered promise in candlelight.', 320.00, 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=600', 'Mysterious', 'Black Musk, Oud, Patchouli, Benzoin', 1),
('Ombre Sacré', 'Sacred darkness distilled into liquid form. Notes of smoked incense and rare resins transport you to ancient ritual spaces.', 390.00, 'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600', 'Mysterious', 'Incense, Myrrh, Labdanum, Black Oud', 0),
('Rose Imperiale', 'The queen of florals reimagined for modern royalty. Turkish rose meets luminous jasmine in this opulent declaration of beauty.', 245.00, 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=600', 'Floral', 'Turkish Rose, Jasmine, Peony, White Musk', 1),
('Jardin Céleste', 'A stroll through a celestial garden at dawn. Delicate yet complex, this fragrance captures the ephemeral beauty of flowers kissed by morning dew.', 210.00, 'https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?w=600', 'Floral', 'Iris, Violet, Lily of the Valley, Soft Musk', 0),
('Magnolia Blanc', 'Pure, radiant, and ethereally beautiful. White magnolia blossoms captured at their peak, blended with creamy vanilla undertones.', 265.00, 'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600', 'Floral', 'White Magnolia, Gardenia, Jasmine, Vanilla', 0),
('Aura Marine', 'Breathe in the salt-kissed freedom of open waters. This electrifying fresh fragrance channels the energy of coastal horizons.', 195.00, 'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=600', 'Fresh', 'Bergamot, Sea Salt, Citrus, Vetiver', 1),
('Vert Éternel', 'Green tea and crisp forest air fused in perfect harmony. An invigorating escape to dew-covered morning gardens and ancient cedar groves.', 175.00, 'https://images.unsplash.com/photo-1595535873420-a599195b3f4a?w=600', 'Fresh', 'Green Tea, Cedar, Lime, Mint, Fougere', 0),
('Lumière Propre', 'Clean, bright and effortlessly sophisticated. A seamless fusion of sun-warmed citrus and crisp white woods for the modern connoisseur.', 220.00, 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600', 'Fresh', 'Lemon, Grapefruit, White Cedar, Ambrette', 0),
('Ambre Royal', 'Molten gold in a bottle. Warm amber resins embrace Madagascar vanilla and spiced benzoin in this regal celebration of opulence.', 350.00, 'https://images.unsplash.com/photo-1590156206657-aec3e2b8e45c?w=600', 'Warm', 'Amber, Vanilla, Benzoin, Warm Musk', 1),
('Santal Doré', 'Golden sandalwood swathed in cashmere-soft musks and a kiss of warm spice. Like being wrapped in the finest silk on a winter evening.', 295.00, 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600', 'Warm', 'Sandalwood, Cashmere Musk, Cardamom, Honey', 0),
('Orient Express', 'A journey through the spice markets of the East. Saffron and rare oud are wrapped in warm resins and vanilla in this extraordinary composition.', 420.00, 'https://images.unsplash.com/photo-1576618148400-f54bed99fcfd?w=600', 'Warm', 'Saffron, Oud, Cinnamon, Amber, Vanilla', 1);
