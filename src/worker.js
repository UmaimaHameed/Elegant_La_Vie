/**
 * Oud & Essence — Cloudflare Worker
 * Stack: Hono (routing) · D1 (database) · Stripe (payments) · JWT (auth)
 *
 * Install deps:  npm install hono stripe
 * Deploy:        wrangler deploy
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign, verify } from 'hono/jwt'
import Stripe from 'stripe'

// ─────────────────────────────────────────────
// App bootstrap
// ─────────────────────────────────────────────
const app = new Hono()

// Allow your frontend origin in production — tighten this up before launch
app.use('*', cors({ origin: '*', allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'] }))

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Simple SHA-256 password hashing using the Web Crypto API (no Node.js) */
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('')
}

async function comparePassword(plain, hashed) {
  return (await hashPassword(plain)) === hashed
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// Auth middleware — attaches { id, role, email } to c.var.user
const authMiddleware = async (c, next) => {
  const header = c.req.header('Authorization') ?? ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return jsonError('Unauthorised', 401)

  try {
    const payload = await verify(token, c.env.JWT_SECRET)
    c.set('user', payload)
    await next()
  } catch {
    return jsonError('Invalid or expired token', 401)
  }
}

const adminOnly = async (c, next) => {
  if (c.get('user')?.role !== 'admin') return jsonError('Forbidden', 403)
  await next()
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

/** POST /api/auth/login
 *  Body: { identity: string, password: string, role: 'customer' | 'admin' }
 *  Returns: { token, user }
 */
app.post('/api/auth/login', async (c) => {
  const { identity, password, role } = await c.req.json()

  if (!identity || !password) return jsonError('identity and password are required')

  const db = c.env.DB
  const user = await db
    .prepare('SELECT * FROM users WHERE (email = ?1 OR username = ?1) AND role = ?2 LIMIT 1')
    .bind(identity, role ?? 'customer')
    .first()

  if (!user) return jsonError('Invalid credentials', 401)

  const valid = await comparePassword(password, user.password)
  if (!valid)  return jsonError('Invalid credentials', 401)

  const payload = { id: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now()/1000) + 60*60*8 }
  const token   = await sign(payload, c.env.JWT_SECRET)

  return c.json({
    token,
    user: { id: user.id, email: user.email, username: user.username, role: user.role, full_name: user.full_name }
  })
})

/** POST /api/auth/register
 *  Body: { email, username, password, full_name }
 */
app.post('/api/auth/register', async (c) => {
  const { email, username, password, full_name } = await c.req.json()
  if (!email || !username || !password) return jsonError('email, username, password required')

  const hashed = await hashPassword(password)
  try {
    const result = await c.env.DB
      .prepare('INSERT INTO users (email, username, password, full_name) VALUES (?,?,?,?) RETURNING id,email,username,role')
      .bind(email, username, hashed, full_name ?? null)
      .first()
    return c.json({ user: result }, 201)
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return jsonError('Email or username already taken', 409)
    throw e
  }
})

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────

/** GET /api/products
 *  Query params:
 *    mood  = mysterious | floral | fresh | warm   (optional filter)
 *    limit = number (default 20)
 *    page  = number (default 1)
 */
app.get('/api/products', async (c) => {
  const mood  = c.req.query('mood')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100)
  const page  = Math.max(parseInt(c.req.query('page')  ?? '1'),  1)
  const offset = (page - 1) * limit

  const VALID_MOODS = ['mysterious','floral','fresh','warm']

  let query  = 'SELECT * FROM products WHERE is_active = 1'
  const args = []

  if (mood && VALID_MOODS.includes(mood)) {
    query += ' AND scent_mood = ?'
    args.push(mood)
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  args.push(limit, offset)

  const { results } = await c.env.DB.prepare(query).bind(...args).all()

  // Parse scent_notes JSON for each product
  const products = results.map(p => ({
    ...p,
    scent_notes: JSON.parse(p.scent_notes ?? '[]')
  }))

  return c.json({ products, page, limit })
})

/** GET /api/products/:slug */
app.get('/api/products/:slug', async (c) => {
  const product = await c.env.DB
    .prepare('SELECT * FROM products WHERE slug = ? AND is_active = 1 LIMIT 1')
    .bind(c.req.param('slug'))
    .first()

  if (!product) return jsonError('Product not found', 404)
  return c.json({ ...product, scent_notes: JSON.parse(product.scent_notes ?? '[]') })
})

/** POST /api/products  (admin only) */
app.post('/api/products', authMiddleware, adminOnly, async (c) => {
  const body = await c.req.json()
  const { name, slug, tagline, description, price, scent_mood, scent_notes,
          concentration, volume_ml, stock, image_url } = body

  if (!name || !slug || !price || !scent_mood || !scent_notes)
    return jsonError('name, slug, price, scent_mood, scent_notes required')

  const result = await c.env.DB
    .prepare(`INSERT INTO products (name,slug,tagline,description,price,scent_mood,scent_notes,concentration,volume_ml,stock,image_url)
              VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .bind(name,slug,tagline??null,description??null,price,scent_mood,
          JSON.stringify(scent_notes),concentration??null,volume_ml??null,stock??0,image_url??null)
    .first()

  return c.json({ product: result }, 201)
})

// ─────────────────────────────────────────────
// CART & CHECKOUT (Stripe)
// ─────────────────────────────────────────────

/** POST /api/checkout
 *  Body: {
 *    items: [{ product_id, quantity }],
 *    gift_wrapping: 'emerald_box' | 'wooden_chest' | 'none',
 *    gift_message: string,
 *    shipping_address: { line1, city, country, postal_code }
 *  }
 *  Returns: { client_secret, order_id }
 */
app.post('/api/checkout', authMiddleware, async (c) => {
  const { items, gift_wrapping, gift_message, shipping_address } = await c.req.json()
  const user = c.get('user')
  const db   = c.env.DB

  if (!items?.length) return jsonError('Cart is empty')

  // ── 1. Resolve products & calculate totals ──────────────────
  const placeholders = items.map((_, i) => `?${i + 1}`).join(',')
  const productIds   = items.map(i => i.product_id)

  const { results: products } = await db
    .prepare(`SELECT id, price, stock FROM products WHERE id IN (${placeholders}) AND is_active = 1`)
    .bind(...productIds)
    .all()

  if (products.length !== items.length) return jsonError('One or more products not found or inactive', 422)

  let subtotalCents = 0
  const lineItems   = []

  for (const item of items) {
    const product = products.find(p => p.id === item.product_id)
    if (!product)              return jsonError(`Product ${item.product_id} not found`, 422)
    if (product.stock < item.quantity) return jsonError(`Insufficient stock for product ${item.product_id}`, 422)

    const unitCents = Math.round(product.price * 100)
    subtotalCents  += unitCents * item.quantity
    lineItems.push({ product_id: product.id, quantity: item.quantity, unit_price_cents: unitCents })
  }

  const totalCents = subtotalCents   // extend with tax/shipping logic here

  // ── 2. Create order row in D1 ────────────────────────────────
  const orderRow = await db
    .prepare(`INSERT INTO orders
                (user_id, gift_wrapping, gift_message, subtotal_cents, total_cents, shipping_address)
              VALUES (?,?,?,?,?,?) RETURNING id`)
    .bind(user.id, gift_wrapping ?? 'none', gift_message ?? null,
          subtotalCents, totalCents, JSON.stringify(shipping_address ?? {}))
    .first()

  const orderId = orderRow.id

  // ── 3. Insert order items ─────────────────────────────────────
  const itemInserts = lineItems.map(li =>
    db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?,?,?,?)')
      .bind(orderId, li.product_id, li.quantity, li.unit_price_cents)
  )
  await db.batch(itemInserts)

  // ── 4. Create Stripe PaymentIntent ───────────────────────────
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

  const paymentIntent = await stripe.paymentIntents.create({
    amount:   totalCents,
    currency: 'usd',
    metadata: { order_id: String(orderId), user_id: String(user.id) },
    description: `Oud & Essence Order #${orderId}`
  })

  // ── 5. Store the payment intent ID ───────────────────────────
  await db
    .prepare('UPDATE orders SET stripe_payment_intent = ? WHERE id = ?')
    .bind(paymentIntent.id, orderId)
    .run()

  return c.json({ client_secret: paymentIntent.client_secret, order_id: orderId })
})

/** POST /api/checkout/webhook  — Stripe webhook to confirm payment */
app.post('/api/checkout/webhook', async (c) => {
  const stripe    = new Stripe(c.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  const body      = await c.req.text()
  const signature = c.req.header('stripe-signature') ?? ''

  let event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, c.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return jsonError(`Webhook signature verification failed: ${err.message}`, 400)
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object
    await c.env.DB
      .prepare("UPDATE orders SET status = 'paid', stripe_charge_id = ?, updated_at = datetime('now') WHERE stripe_payment_intent = ?")
      .bind(pi.latest_charge ?? '', pi.id)
      .run()
  }

  return c.json({ received: true })
})

// ─────────────────────────────────────────────
// ORDERS (authenticated)
// ─────────────────────────────────────────────

/** GET /api/orders  — current user's orders */
app.get('/api/orders', authMiddleware, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(user.id)
    .all()
  return c.json({ orders: results })
})

/** GET /api/orders/:id */
app.get('/api/orders/:id', authMiddleware, async (c) => {
  const user  = c.get('user')
  const order = await c.env.DB
    .prepare('SELECT * FROM orders WHERE id = ? LIMIT 1')
    .bind(parseInt(c.req.param('id')))
    .first()

  if (!order) return jsonError('Order not found', 404)
  if (order.user_id !== user.id && user.role !== 'admin') return jsonError('Forbidden', 403)

  const { results: items } = await c.env.DB
    .prepare(`SELECT oi.*, p.name, p.image_url FROM order_items oi
              JOIN products p ON p.id = oi.product_id
              WHERE oi.order_id = ?`)
    .bind(order.id)
    .all()

  return c.json({ ...order, items })
})

// ─────────────────────────────────────────────
// ADMIN — list all orders
// ─────────────────────────────────────────────
app.get('/api/admin/orders', authMiddleware, adminOnly, async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 100")
    .all()
  return c.json({ orders: results })
})

// ─────────────────────────────────────────────
// 404 catch-all
// ─────────────────────────────────────────────
app.notFound(c => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
