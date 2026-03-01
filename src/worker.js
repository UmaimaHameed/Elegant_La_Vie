/**
 * ================================================================
 *  Elegant La Vie — Cloudflare Worker  (src/worker.js)
 *  Pakistani Perfume Store
 *
 *  Stack  : Hono · D1 · JWT
 *  Orders : WhatsApp deep-link + Cash on Delivery
 *  Pricing: PKR (Pakistani Rupee) throughout
 *
 *  Setup commands:
 *    npm install hono
 *    wrangler secret put JWT_SECRET
 *    wrangler secret put WHATSAPP_NUMBER   # e.g. 923001234567
 *    wrangler deploy
 * ================================================================
 */

import { Hono }        from 'hono'
import { cors }        from 'hono/cors'
import { sign, verify } from 'hono/jwt'

// ── Bootstrap ──────────────────────────────────────────────────
const app = new Hono()

app.use('*', cors({
  origin: '*',   // tighten to your domain before production
  allowMethods:  ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders:  ['Content-Type', 'Authorization'],
}))

// ================================================================
// HELPERS
// ================================================================

/**
 * SHA-256 password hash using the Web Crypto API.
 * No Node.js — 100 % Cloudflare Edge compatible.
 */
async function hashPassword(password) {
  const data = new TextEncoder().encode(password)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function comparePassword(plain, stored) {
  return (await hashPassword(plain)) === stored
}

/** Uniform error response (mirrors the original jsonError shape) */
function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Safely parse a JSON-text column; returns [] on failure */
const parseJSON = (val) => { try { return JSON.parse(val ?? '[]') } catch { return [] } }

/** Format a PKR number → "Rs. 4,500" */
const pkr = (n) => 'Rs. ' + Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })

// ================================================================
// AUTH MIDDLEWARE
// ================================================================

/**
 * Verifies the Bearer JWT.
 * On success attaches { id, email, username, role } to c.var.user.
 * Matches the exact same shape the original worker expected.
 */
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

// ================================================================
// ① AUTH — same endpoint shape as original worker
// ================================================================

/**
 * POST /api/auth/login
 * Body : { identity: string, password: string, role?: 'customer'|'admin' }
 * Note : "identity" accepts email OR username (matches original frontend)
 */
app.post('/api/auth/login', async (c) => {
  const { identity, password, role } = await c.req.json()
  if (!identity || !password) return jsonError('identity and password are required')

  const user = await c.env.DB
    .prepare(
      `SELECT * FROM users
       WHERE (email = ?1 OR username = ?1) AND role = ?2
       LIMIT 1`
    )
    .bind(identity, role ?? 'customer')
    .first()

  if (!user) return jsonError('Invalid credentials', 401)

  const valid = await comparePassword(password, user.password)
  if (!valid)  return jsonError('Invalid credentials', 401)

  const payload = {
    id:       user.id,
    email:    user.email,
    username: user.username,
    role:     user.role,
    exp:      Math.floor(Date.now() / 1000) + 60 * 60 * 8,  // 8 h
  }
  const token = await sign(payload, c.env.JWT_SECRET)

  return c.json({
    token,
    user: {
      id:        user.id,
      email:     user.email,
      username:  user.username,
      role:      user.role,
      full_name: user.full_name,
      phone:     user.phone,
    },
  })
})

/**
 * POST /api/auth/register
 * Body : { email, username, password, full_name, phone? }
 */
app.post('/api/auth/register', async (c) => {
  const { email, username, password, full_name, phone } = await c.req.json()
  if (!email || !username || !password)
    return jsonError('email, username, password required')

  const hashed = await hashPassword(password)
  try {
    const result = await c.env.DB
      .prepare(
        `INSERT INTO users (email, username, password, full_name, phone)
         VALUES (?,?,?,?,?)
         RETURNING id, email, username, role, full_name`
      )
      .bind(email, username, hashed, full_name ?? null, phone ?? null)
      .first()
    return c.json({ user: result }, 201)
  } catch (e) {
    if (e.message?.includes('UNIQUE'))
      return jsonError('Email or username already taken', 409)
    throw e
  }
})

// ================================================================
// ② PRODUCTS
// ================================================================

/**
 * GET /api/products
 *
 * Query params (all optional):
 *   gender   = male | female | unisex
 *   mood     = retained for backward-compat with any existing frontend call
 *   featured = 1
 *   search   = free-text
 *   limit    = (default 20, max 100)
 *   page     = (default 1)
 *
 * Response shape matches the original worker so existing card-render
 * code needs zero changes.
 */
app.get('/api/products', async (c) => {
  const gender   = c.req.query('gender')
  const mood     = c.req.query('mood')     // legacy compat
  const featured = c.req.query('featured')
  const search   = c.req.query('search')?.trim()
  const limit    = Math.min(parseInt(c.req.query('limit') ?? '20'), 100)
  const page     = Math.max(parseInt(c.req.query('page')  ?? '1'),  1)
  const offset   = (page - 1) * limit

  const VALID_GENDERS = ['male', 'female', 'unisex']

  let query = 'SELECT * FROM products WHERE is_active = 1'
  const args = []

  // Primary gender filter
  if (gender && VALID_GENDERS.includes(gender)) {
    query += ' AND gender = ?'
    args.push(gender)
  }

  // Legacy mood filter maps to scent_family — keeps old frontend calls working
  if (mood && !gender) {
    query += ' AND LOWER(scent_family) LIKE ?'
    args.push(`%${mood.toLowerCase()}%`)
  }

  if (featured === '1') {
    query += ' AND is_featured = 1'
  }

  if (search) {
    query += ' AND (name LIKE ? OR tagline LIKE ? OR description LIKE ?)'
    const t = `%${search}%`
    args.push(t, t, t)
  }

  query += ' ORDER BY is_featured DESC, created_at DESC LIMIT ? OFFSET ?'
  args.push(limit, offset)

  const { results } = await c.env.DB.prepare(query).bind(...args).all()

  // Hydrate JSON fields + add PKR display helpers
  const products = results.map(p => ({
    ...p,
    // Parsed arrays — usable directly in JS template literals
    top_notes:    parseJSON(p.top_notes),
    middle_notes: parseJSON(p.middle_notes),
    base_notes:   parseJSON(p.base_notes),
    // Combined scent_notes array (mirrors original field name)
    scent_notes:  [...parseJSON(p.top_notes), ...parseJSON(p.middle_notes), ...parseJSON(p.base_notes)],
    // Pricing helpers
    effective_price_pkr: p.sale_price_pkr ?? p.price_pkr,
    on_sale:             Boolean(p.sale_price_pkr && p.sale_price_pkr < p.price_pkr),
    price_display:       pkr(p.price_pkr),
    sale_price_display:  p.sale_price_pkr ? pkr(p.sale_price_pkr) : null,
  }))

  return c.json({ products, page, limit })
})

/**
 * GET /api/products/:slug
 */
app.get('/api/products/:slug', async (c) => {
  const product = await c.env.DB
    .prepare('SELECT * FROM products WHERE slug = ? AND is_active = 1 LIMIT 1')
    .bind(c.req.param('slug'))
    .first()

  if (!product) return jsonError('Product not found', 404)

  return c.json({
    ...product,
    top_notes:           parseJSON(product.top_notes),
    middle_notes:        parseJSON(product.middle_notes),
    base_notes:          parseJSON(product.base_notes),
    scent_notes:         [...parseJSON(product.top_notes), ...parseJSON(product.middle_notes)],
    effective_price_pkr: product.sale_price_pkr ?? product.price_pkr,
    on_sale:             Boolean(product.sale_price_pkr && product.sale_price_pkr < product.price_pkr),
    price_display:       pkr(product.price_pkr),
    sale_price_display:  product.sale_price_pkr ? pkr(product.sale_price_pkr) : null,
  })
})

/**
 * POST /api/products  (admin only)
 */
app.post('/api/products', authMiddleware, adminOnly, async (c) => {
  const {
    name, slug, tagline, description, gender,
    scent_family, top_notes, middle_notes, base_notes,
    concentration, volume_ml, brand,
    price_pkr, sale_price_pkr,
    stock, is_featured, image_url,
  } = await c.req.json()

  if (!name || !slug || !price_pkr || !gender)
    return jsonError('name, slug, gender, price_pkr required')

  const result = await c.env.DB
    .prepare(
      `INSERT INTO products
         (name, slug, tagline, description, gender,
          scent_family, top_notes, middle_notes, base_notes,
          concentration, volume_ml, brand,
          price_pkr, sale_price_pkr,
          stock, is_featured, image_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       RETURNING *`
    )
    .bind(
      name, slug, tagline ?? null, description ?? null, gender,
      scent_family ?? null,
      JSON.stringify(top_notes    ?? []),
      JSON.stringify(middle_notes ?? []),
      JSON.stringify(base_notes   ?? []),
      concentration ?? null, volume_ml ?? null,
      brand ?? 'Elegant La Vie',
      price_pkr, sale_price_pkr ?? null,
      stock ?? 0, is_featured ? 1 : 0, image_url ?? null
    )
    .first()

  return c.json({ product: result }, 201)
})

/**
 * PUT /api/products/:id  (admin only)
 * Update any subset of fields — useful for restocking or price changes
 */
app.put('/api/products/:id', authMiddleware, adminOnly, async (c) => {
  const id   = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const ALLOWED = [
    'name', 'tagline', 'description', 'scent_family',
    'price_pkr', 'sale_price_pkr',
    'stock', 'is_featured', 'is_active', 'image_url',
    'concentration', 'volume_ml',
  ]

  const sets = []
  const vals = []
  for (const key of ALLOWED) {
    if (key in body) { sets.push(`${key} = ?`); vals.push(body[key]) }
  }

  if (!sets.length) return jsonError('No valid fields to update')

  sets.push("updated_at = datetime('now')")
  vals.push(id)

  await c.env.DB
    .prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run()

  return c.json({ success: true })
})

// ================================================================
// ③ CHECKOUT — WhatsApp + COD (replaces Stripe entirely)
// ================================================================

/**
 * POST /api/checkout
 *
 * ── What this endpoint does ───────────────────────────────────
 *  1. Accepts the cart + customer details from your frontend form
 *  2. Fetches authoritative prices from D1 (frontend price ignored)
 *  3. Validates stock for every item
 *  4. Persists the order + line items to D1
 *  5. Builds a rich Urdu/English WhatsApp message
 *  6. Returns a wa.me deep-link the frontend opens immediately
 *
 * ── Request body ──────────────────────────────────────────────
 * {
 *   // Customer details (from your checkout form)
 *   customer_name:    string,   // required
 *   customer_phone:   string,   // required
 *   customer_city:    string,   // required
 *   customer_address: string,   // required
 *   payment_method:   'cod' | 'easypaisa' | 'jazzcash',  // default 'cod'
 *   gift_wrapping:    'none' | 'standard' | 'premium',   // default 'none'
 *   gift_message:     string,
 *   notes:            string,
 *
 *   // Cart items — exactly as the frontend cart stores them
 *   items: [{ product_id: number, quantity: number }]
 * }
 *
 * ── Response ──────────────────────────────────────────────────
 * {
 *   order_id:         number,
 *   whatsapp_url:     string,   // open this → WhatsApp with pre-filled message
 *   whatsapp_message: string,   // decoded text (for copy-button / display)
 *   summary: {
 *     items:          [...],
 *     subtotal_pkr:   number,
 *     shipping_pkr:   number,
 *     total_pkr:      number,
 *     total_display:  string,   // "Rs. 8,700"
 *     free_shipping:  boolean,
 *   }
 * }
 */
app.post('/api/checkout', async (c) => {
  const {
    customer_name,
    customer_phone,
    customer_city,
    customer_address,
    payment_method = 'cod',
    gift_wrapping  = 'none',
    gift_message   = '',
    notes          = '',
    items,
  } = await c.req.json()

  // ── Validate required fields ────────────────────────────────
  if (!customer_name?.trim())    return jsonError('Apna naam darain',    400)
  if (!customer_phone?.trim())   return jsonError('Phone number darain', 400)
  if (!customer_city?.trim())    return jsonError('Sheher ka naam darain', 400)
  if (!customer_address?.trim()) return jsonError('Address darain',      400)
  if (!items?.length)            return jsonError('Cart is empty',        400)

  const VALID_PAYMENTS  = ['cod', 'easypaisa', 'jazzcash', 'bank']
  const VALID_WRAPPING  = ['none', 'standard', 'premium']

  if (!VALID_PAYMENTS.includes(payment_method))
    return jsonError('Invalid payment method', 400)
  if (!VALID_WRAPPING.includes(gift_wrapping))
    return jsonError('Invalid gift wrapping option', 400)

  const db = c.env.DB

  // ── 1. Fetch server-side prices ─────────────────────────────
  const productIds   = [...new Set(items.map(i => Number(i.product_id)))]
  const placeholders = productIds.map((_, i) => `?${i + 1}`).join(',')

  const { results: dbProducts } = await db
    .prepare(
      `SELECT id, name, price_pkr, sale_price_pkr, stock, is_active
       FROM products WHERE id IN (${placeholders})`
    )
    .bind(...productIds)
    .all()

  // ── 2. Validate stock + build line items ────────────────────
  let subtotalPkr = 0
  const lineItems = []

  for (const item of items) {
    const qty     = Math.max(1, parseInt(item.quantity) || 1)
    const product = dbProducts.find(p => p.id === Number(item.product_id))

    if (!product)           return jsonError(`Product ${item.product_id} not found`, 422)
    if (!product.is_active) return jsonError(`"${product.name}" is currently unavailable`, 422)
    if (product.stock < qty) return jsonError(`"${product.name}" — only ${product.stock} left in stock`, 422)

    const unitPrice = product.sale_price_pkr ?? product.price_pkr
    const lineTotal = unitPrice * qty

    subtotalPkr += lineTotal
    lineItems.push({
      product_id:    product.id,
      product_name:  product.name,
      quantity:      qty,
      unit_price_pkr: unitPrice,
      line_total_pkr: lineTotal,
    })
  }

  // ── 3. Compute final totals ─────────────────────────────────
  // Free shipping on orders Rs. 5,000 and above
  const FREE_SHIPPING_THRESHOLD = 5000
  const SHIPPING_PKR = subtotalPkr >= FREE_SHIPPING_THRESHOLD ? 0 : 200

  // Gift wrapping surcharges (PKR)
  const WRAPPING_FEES = { none: 0, standard: 300, premium: 600 }
  const WRAPPING_FEE  = WRAPPING_FEES[gift_wrapping] ?? 0

  const DISCOUNT_PKR = 0   // hook in coupon logic here
  const totalPkr     = subtotalPkr + SHIPPING_PKR + WRAPPING_FEE - DISCOUNT_PKR

  // ── 4. Persist order to D1 ──────────────────────────────────
  const orderRow = await db
    .prepare(
      `INSERT INTO orders
         (customer_name, customer_phone, customer_city, customer_address,
          payment_method, gift_wrapping, gift_message, notes,
          subtotal_pkr, shipping_pkr, discount_pkr, total_pkr,
          whatsapp_sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
       RETURNING id`
    )
    .bind(
      customer_name.trim(),
      customer_phone.trim(),
      customer_city.trim(),
      customer_address.trim(),
      payment_method,
      gift_wrapping,
      gift_message?.trim() || null,
      notes?.trim()        || null,
      subtotalPkr,
      SHIPPING_PKR,
      DISCOUNT_PKR,
      totalPkr
    )
    .first()

  const orderId = orderRow.id

  // ── 5. Persist line items ────────────────────────────────────
  await db.batch(
    lineItems.map(li =>
      db.prepare(
        `INSERT INTO order_items
           (order_id, product_id, product_name, quantity, unit_price_pkr, line_total_pkr)
         VALUES (?,?,?,?,?,?)`
      ).bind(
        orderId, li.product_id, li.product_name,
        li.quantity, li.unit_price_pkr, li.line_total_pkr
      )
    )
  )

  // ── 6. Build WhatsApp message ────────────────────────────────
  const storeName  = c.env.STORE_NAME      ?? 'Elegant La Vie'
  const waNumber   = c.env.WHATSAPP_NUMBER ?? '923001234567'

  const PAYMENT_LABELS = {
    cod:       '💵 Cash on Delivery',
    easypaisa: '📱 EasyPaisa',
    jazzcash:  '📱 JazzCash',
    bank:      '🏦 Bank Transfer',
  }

  const WRAPPING_LABELS = {
    none:     null,
    standard: '🎁 Standard Gift Box (+Rs. 300)',
    premium:  '🎀 Premium Gift Box (+Rs. 600)',
  }

  const itemLines = lineItems
    .map(li =>
      `  • ${li.product_name} × ${li.quantity}  →  ${pkr(li.line_total_pkr)}`
    )
    .join('\n')

  const msgParts = [
    `🛍️ *Nayi Order — ${storeName}*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📋 *Order #${orderId}*`,
    ``,
    `👤 *Naam:*    ${customer_name.trim()}`,
    `📞 *Phone:*   ${customer_phone.trim()}`,
    `🏙️ *Sheher:*  ${customer_city.trim()}`,
    `📍 *Address:* ${customer_address.trim()}`,
    ``,
    `🧴 *Order Details:*`,
    itemLines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 Subtotal:   ${pkr(subtotalPkr)}`,
    SHIPPING_PKR > 0
      ? `🚚 Delivery:   ${pkr(SHIPPING_PKR)}`
      : `🚚 Delivery:   *FREE* ✅`,
    WRAPPING_LABELS[gift_wrapping]
      ? `${WRAPPING_LABELS[gift_wrapping]}`
      : null,
    DISCOUNT_PKR > 0
      ? `🎁 Discount:   -${pkr(DISCOUNT_PKR)}`
      : null,
    ``,
    `✅ *Total:     ${pkr(totalPkr)}*`,
    ``,
    `💳 *Payment:* ${PAYMENT_LABELS[payment_method]}`,
    gift_message?.trim()
      ? `💬 *Gift Msg:* "${gift_message.trim()}"`
      : null,
    notes?.trim()
      ? `📝 *Note:*    ${notes.trim()}`
      : null,
    ``,
    `_Meherbani kar ke is order ki jaldi confirmation kar dain._`,
    `_Order #${orderId} | ${new Date().toLocaleDateString('ur-PK', { day: '2-digit', month: 'short', year: 'numeric' })}_`,
  ]
    .filter(p => p !== null)
    .join('\n')

  const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msgParts)}`

  return c.json({
    order_id:         orderId,
    whatsapp_url:     whatsappUrl,
    whatsapp_message: msgParts,
    summary: {
      items:         lineItems,
      subtotal_pkr:  subtotalPkr,
      shipping_pkr:  SHIPPING_PKR,
      discount_pkr:  DISCOUNT_PKR,
      wrapping_fee:  WRAPPING_FEE,
      total_pkr:     totalPkr,
      total_display: pkr(totalPkr),
      free_shipping: SHIPPING_PKR === 0,
    },
  })
})

// ================================================================
// ④ ORDERS
// ================================================================

/**
 * GET /api/orders  — logged-in customer's own orders
 */
app.get('/api/orders', authMiddleware, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB
    .prepare(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    )
    .bind(user.id)
    .all()
  return c.json({ orders: results })
})

/**
 * GET /api/orders/:id — order detail (customer sees own, admin sees all)
 */
app.get('/api/orders/:id', authMiddleware, async (c) => {
  const user  = c.get('user')
  const order = await c.env.DB
    .prepare('SELECT * FROM orders WHERE id = ? LIMIT 1')
    .bind(parseInt(c.req.param('id')))
    .first()

  if (!order) return jsonError('Order not found', 404)
  if (order.user_id !== user.id && user.role !== 'admin')
    return jsonError('Forbidden', 403)

  const { results: items } = await c.env.DB
    .prepare(
      `SELECT oi.*, p.image_url, p.slug, p.gender
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`
    )
    .bind(order.id)
    .all()

  return c.json({ ...order, items })
})

// ================================================================
// ⑤ ADMIN
// ================================================================

/**
 * GET /api/admin/orders  — all orders, filterable by status
 * GET /api/admin/orders?status=pending_whatsapp
 */
app.get('/api/admin/orders', authMiddleware, adminOnly, async (c) => {
  const status = c.req.query('status')
  const limit  = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)

  let query = `
    SELECT o.*, u.email, u.username
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id`
  const args = []

  if (status) { query += ' WHERE o.status = ?'; args.push(status) }
  query += ' ORDER BY o.created_at DESC LIMIT ?'
  args.push(limit)

  const { results } = await c.env.DB.prepare(query).bind(...args).all()
  return c.json({ orders: results, count: results.length })
})

/**
 * PUT /api/admin/orders/:id  — update status / payment after WA confirmation
 * Body: { status?, payment_status? }
 */
app.put('/api/admin/orders/:id', authMiddleware, adminOnly, async (c) => {
  const id  = parseInt(c.req.param('id'))
  const { status, payment_status } = await c.req.json()

  const VALID_STATUS  = ['pending_whatsapp','confirmed','dispatched','delivered','cancelled']
  const VALID_PAYMENT = ['pending','paid','refunded']

  if (status         && !VALID_STATUS.includes(status))
    return jsonError('Invalid status value')
  if (payment_status && !VALID_PAYMENT.includes(payment_status))
    return jsonError('Invalid payment_status value')

  const sets = ["updated_at = datetime('now')"]
  const vals = []
  if (status)         { sets.push('status = ?');         vals.push(status) }
  if (payment_status) { sets.push('payment_status = ?'); vals.push(payment_status) }
  vals.push(id)

  await c.env.DB
    .prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run()

  return c.json({ success: true, order_id: id })
})

/**
 * GET /api/admin/stats  — quick dashboard summary
 */
app.get('/api/admin/stats', authMiddleware, adminOnly, async (c) => {
  const [total, revenue, pending, products] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first(),
    c.env.DB.prepare("SELECT COALESCE(SUM(total_pkr),0) AS n FROM orders WHERE status != 'cancelled'").first(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending_whatsapp'").first(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE is_active = 1").first(),
  ])

  return c.json({
    total_orders:    total?.n    ?? 0,
    pending_orders:  pending?.n  ?? 0,
    total_revenue:   revenue?.n  ?? 0,
    revenue_display: pkr(revenue?.n ?? 0),
    active_products: products?.n ?? 0,
  })
})

// ================================================================
// Error handlers
// ================================================================
app.notFound(c  => c.json({ error: 'Route not found' }, 404))
app.onError((e, c) => {
  console.error('[Worker]', e)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
