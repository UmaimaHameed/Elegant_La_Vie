# 🌿 Elegant La Vie — Luxury Perfume E-Commerce

> A production-ready, full-stack luxury perfume store built on Cloudflare's edge platform.

**Admin:** Kaleem Ullah | **Contact:** 03008206118 | **WhatsApp:** 03008206118

---

## 🚀 Quick Deploy to Cloudflare

### Prerequisites
- [Node.js](https://nodejs.org) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- Cloudflare Account
- Stripe Account (optional, for real payments)

---

## Step-by-Step Deployment

### 1. Clone & Install
```bash
git clone https://github.com/your-username/elegant-la-vie.git
cd elegant-la-vie
npm install
```

### 2. Authenticate with Cloudflare
```bash
wrangler login
```

### 3. Create the D1 Database
```bash
wrangler d1 create perfume-store
```
Copy the `database_id` from the output and update `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "perfume-store"
database_id = "YOUR_DATABASE_ID_HERE"  # <-- paste here
```

### 4. Initialize the Database (with seed data)
```bash
# Local development
npm run db:init

# Production (remote)
npm run db:init:remote
```

### 5. Set Environment Secrets
```bash
# Required for real Stripe payments
wrangler secret put STRIPE_SECRET_KEY
# Enter: sk_live_... or sk_test_...

# JWT secret (change this!)
wrangler secret put JWT_SECRET
# Enter: your-super-secret-key-here
```

### 6. Deploy the Worker
```bash
npm run deploy
```
Note your Worker URL: `https://elegant-la-vie.your-subdomain.workers.dev`

### 7. Deploy Frontend to Pages
```bash
npm run pages:deploy
```
Or connect your GitHub repo in [Cloudflare Pages Dashboard](https://pages.cloudflare.com):
- **Build command:** (leave empty)
- **Build output directory:** `public`
- **Root directory:** `/`

### 8. Update Frontend URL in wrangler.toml
```toml
[vars]
FRONTEND_URL = "https://elegant-la-vie.pages.dev"  # Your Pages URL
```

---

## 🏗 Project Structure

```
elegant-la-vie/
│
├── public/                    # Frontend (Cloudflare Pages)
│   ├── index.html             # Homepage with hero + featured products
│   ├── products.html          # Full collection with mood filters
│   ├── product.html           # Product detail page
│   ├── quiz.html              # Scent Mood Quiz (4-step)
│   ├── cart.html              # Shopping cart with localStorage
│   ├── checkout.html          # Order confirmation page
│   ├── login.html             # Login + Registration
│   ├── admin.html             # Admin Dashboard (Kaleem Ullah)
│   └── _routes.json           # Cloudflare routing config
│
├── src/
│   └── worker.js              # Hono-based API worker (edge runtime)
│
├── functions/
│   └── api/[[path]].js        # Pages Functions API proxy
│
├── schema.sql                 # D1 database schema + seed data
├── wrangler.toml              # Cloudflare configuration
├── package.json               # Dependencies & scripts
└── README.md                  # This file
```

---

## 🔑 Admin Access

| Field    | Value                        |
|----------|------------------------------|
| Email    | admin@elegantlavie.com       |
| Password | admin123                     |
| Name     | Kaleem Ullah                 |
| URL      | /admin.html                  |

Admin features:
- ✅ Add / Edit / Delete perfumes
- ✅ View all customer orders
- ✅ Dashboard with revenue stats
- ✅ Product image management

---

## 🛍 API Reference

### Auth
| Method | Endpoint        | Description     |
|--------|----------------|-----------------|
| POST   | /api/login     | Login (JWT)     |
| POST   | /api/register  | Register user   |

### Products
| Method | Endpoint                   | Description              |
|--------|---------------------------|--------------------------|
| GET    | /api/products             | All products             |
| GET    | /api/products/featured    | Featured products        |
| GET    | /api/products/:id         | Single product           |
| GET    | /api/products/mood/:mood  | Filter by scent mood     |

### Orders
| Method | Endpoint       | Auth     | Description              |
|--------|---------------|----------|--------------------------|
| POST   | /api/checkout | Optional | Create Stripe session    |

### Admin (JWT required, role=admin)
| Method | Endpoint                  | Description        |
|--------|--------------------------|-------------------|
| GET    | /api/admin/products      | All products       |
| POST   | /api/admin/product       | Add product        |
| PUT    | /api/admin/product/:id   | Edit product       |
| DELETE | /api/admin/product/:id   | Delete product     |
| GET    | /api/admin/orders        | All orders         |
| GET    | /api/admin/stats         | Dashboard stats    |

---

## 💳 Stripe Integration

In **demo mode** (no STRIPE_SECRET_KEY), orders are saved to D1 and you're redirected to the success page.

For **live payments**:
1. Create a [Stripe account](https://stripe.com)
2. Get your secret key from the Stripe Dashboard
3. `wrangler secret put STRIPE_SECRET_KEY`
4. Update the public key in `wrangler.toml`: `STRIPE_PUBLIC_KEY = "pk_live_..."`

---

## 🎨 Tech Stack

| Layer      | Technology                    |
|------------|-------------------------------|
| Frontend   | HTML + TailwindCSS (CDN)      |
| Fonts      | Cinzel + Cormorant Garamond   |
| Backend    | Hono (Cloudflare Workers)     |
| Database   | Cloudflare D1 (SQLite)        |
| Auth       | JWT (Web Crypto API)          |
| Payments   | Stripe Checkout               |
| Hosting    | Cloudflare Pages              |
| Edge       | 100% compatible, no Node.js   |

---

## 🌸 Scent Moods

| Mood        | Icon | Notes                     |
|-------------|------|---------------------------|
| Mysterious  | 🌙   | Oud, Amber, Dark Musk     |
| Floral      | 🌹   | Rose, Jasmine, Peony      |
| Fresh       | 🌊   | Citrus, Ocean, Vetiver    |
| Warm        | 🕯️   | Vanilla, Sandalwood, Spice |

---

## 🤝 Support

**Store:** Elegant La Vie  
**Admin:** Kaleem Ullah  
**Phone:** 03008206118  
**WhatsApp:** [wa.me/923008206118](https://wa.me/923008206118)  

---

*Built with Cloudflare Workers + Pages + D1 — 100% edge-native.*
