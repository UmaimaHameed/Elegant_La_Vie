# Oud & Essence — Backend Setup Guide

## Prerequisites
- [Cloudflare account](https://dash.cloudflare.com)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- [Stripe account](https://stripe.com) (free test mode works)
- Node.js 18+

---

## Step 1 — Install dependencies
```bash
npm init -y
npm install hono stripe
```

---

## Step 2 — Create the D1 database
```bash
wrangler d1 create oud-essence-db
# ✅ Copy the `database_id` printed to the terminal
# Paste it into wrangler.toml → database_id
```

Apply the schema:
```bash
# Local dev
wrangler d1 execute oud-essence-db --local --file=schema.sql

# Production
wrangler d1 execute oud-essence-db --file=schema.sql
```

---

## Step 3 — Set secrets
```bash
wrangler secret put JWT_SECRET
# → enter a random 32+ character string

wrangler secret put STRIPE_SECRET_KEY
# → enter sk_test_... from your Stripe dashboard

wrangler secret put STRIPE_WEBHOOK_SECRET
# → enter whsec_... from your Stripe webhook settings
```

For **local dev**, create `.dev.vars` (never commit this):
```
JWT_SECRET=my-local-dev-secret-at-least-32-chars
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Step 4 — Run locally
```bash
wrangler dev
# Worker available at http://localhost:8787
```

---

## Step 5 — Deploy to production
```bash
wrangler deploy
# Note your Worker URL: https://oud-essence-api.YOUR_SUBDOMAIN.workers.dev
```

Update `API_BASE` in `frontend-integration.html` with your Worker URL.

---

## Step 6 — Stripe Webhook
In your Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://oud-essence-api.YOUR_SUBDOMAIN.workers.dev/api/checkout/webhook`
- Events: `payment_intent.succeeded`

Copy the signing secret and run:
```bash
wrangler secret put STRIPE_WEBHOOK_SECRET
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create customer account |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/products` | — | List products (optional `?mood=`) |
| GET | `/api/products/:slug` | — | Single product |
| POST | `/api/products` | admin | Create product |
| POST | `/api/checkout` | customer | Create order + Stripe PaymentIntent |
| POST | `/api/checkout/webhook` | Stripe | Confirm payment |
| GET | `/api/orders` | customer | List own orders |
| GET | `/api/orders/:id` | customer/admin | Order detail |
| GET | `/api/admin/orders` | admin | All orders |

---

## Mood → Product mapping
| Frontend card | API `mood` value |
|---|---|
| Mysterious & Deep | `mysterious` |
| Floral & Romantic | `floral` |
| Fresh & Airy | `fresh` |
| Warm & Spicy | `warm` |

---

## Password note
The schema uses SHA-256 hashing (Web Crypto API — no Node.js). For production,
consider pre-hashing passwords server-side with bcrypt via a separate script,
or upgrading the hash function to PBKDF2 (also available in Web Crypto):

```js
// PBKDF2 upgrade example (drop-in for hashPassword in worker.js)
async function hashPassword(password) {
  const enc  = new TextEncoder()
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = enc.encode('oud-essence-static-salt') // use a per-user random salt in production
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt, iterations:100_000 }, key, 256)
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('')
}
```
