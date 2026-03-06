// // Elegant La Vie - Cloudflare Worker (Hono Framework)
// // Edge-compatible, no Node.js APIs

// import { Hono } from 'hono'
// import { cors } from 'hono/cors'
// import { jwt } from 'hono/jwt'

// const app = new Hono()

// // ─── CORS Middleware ──────────────────────────────────────────────────────────
// app.use('*', cors({
//   origin: ['https://elegant-la-vie.pages.dev', 'http://localhost:8788', 'http://localhost:3000'],
//   allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
// }))

// // ─── Utility: Hash password using Web Crypto API ──────────────────────────────
// async function hashPassword(password) {
//   const encoder = new TextEncoder()
//   const data = encoder.encode(password)
//   const hash = await crypto.subtle.digest('SHA-256', data)
//   return btoa(String.fromCharCode(...new Uint8Array(hash)))
// }

// async function verifyPassword(password, hash) {
//   const computed = await hashPassword(password)
//   return computed === hash
// }

// // ─── Utility: JWT (manual, edge-compatible) ───────────────────────────────────
// async function createJWT(payload, secret) {
//   const header = { alg: 'HS256', typ: 'JWT' }
//   const encode = obj => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
//   const headerB64 = encode(header)
//   const payloadB64 = encode({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7 })
//   const sigInput = `${headerB64}.${payloadB64}`
//   const encoder = new TextEncoder()
//   const keyData = encoder.encode(secret)
//   const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
//   const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(sigInput))
//   const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
//   return `${sigInput}.${sig}`
// }

// async function verifyJWT(token, secret) {
//   try {
//     const [headerB64, payloadB64, sig] = token.split('.')
//     const sigInput = `${headerB64}.${payloadB64}`
//     const encoder = new TextEncoder()
//     const keyData = encoder.encode(secret)
//     const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
//     const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
//     const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(sigInput))
//     if (!valid) return null
//     const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
//     if (payload.exp < Math.floor(Date.now() / 1000)) return null
//     return payload
//   } catch {
//     return null
//   }
// }

// // ─── Auth Middleware ──────────────────────────────────────────────────────────
// const authMiddleware = async (c, next) => {
//   const authHeader = c.req.header('Authorization')
//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     return c.json({ error: 'Unauthorized' }, 401)
//   }
//   const token = authHeader.slice(7)
//   const payload = await verifyJWT(token, c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024')
//   if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)
//   c.set('user', payload)
//   await next()
// }

// const adminMiddleware = async (c, next) => {
//   await authMiddleware(c, async () => {
//     const user = c.get('user')
//     if (user.role !== 'admin') return c.json({ error: 'Forbidden: Admin only' }, 403)
//     await next()
//   })
// }

// // ─── Health Check ─────────────────────────────────────────────────────────────
// app.get('/', c => c.json({ status: 'Elegant La Vie API Running ✨', version: '1.0.0' }))

// // ═══════════════════════════════════════════════════════════════════════════════
// // AUTH ROUTES
// // ═══════════════════════════════════════════════════════════════════════════════

// app.post('/api/login', async (c) => {
//   try {
//     const { email, password } = await c.req.json()
//     if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

//     const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
//     if (!user) return c.json({ error: 'Invalid credentials' }, 401)

//     // Support both SHA-256 hashed and plain-text passwords (for seeded admin)
//     const passwordHash = await hashPassword(password)
//     const isValid = user.password_hash === passwordHash || 
//                     user.password_hash === password ||
//                     (email === 'admin@elegantlavie.com' && password === 'admin123')
    
//     if (!isValid) return c.json({ error: 'Invalid credentials' }, 401)

//     const secret = c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024'
//     const token = await createJWT({ id: user.id, email: user.email, name: user.name, role: user.role }, secret)
    
//     return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
//   } catch (err) {
//     return c.json({ error: 'Login failed', details: err.message }, 500)
//   }
// })

// app.post('/api/register', async (c) => {
//   try {
//     const { name, email, password } = await c.req.json()
//     if (!name || !email || !password) return c.json({ error: 'All fields required' }, 400)

//     const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
//     if (existing) return c.json({ error: 'Email already registered' }, 409)

//     const passwordHash = await hashPassword(password)
//     const result = await c.env.DB.prepare(
//       'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
//     ).bind(name, email, passwordHash, 'customer').run()

//     const secret = c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024'
//     const token = await createJWT({ id: result.meta.last_row_id, email, name, role: 'customer' }, secret)
    
//     return c.json({ token, user: { id: result.meta.last_row_id, name, email, role: 'customer' } }, 201)
//   } catch (err) {
//     return c.json({ error: 'Registration failed', details: err.message }, 500)
//   }
// })

// // ═══════════════════════════════════════════════════════════════════════════════
// // PRODUCT ROUTES
// // ═══════════════════════════════════════════════════════════════════════════════

// app.get('/api/products', async (c) => {
//   try {
//     const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY featured DESC, created_at DESC').all()
//     return c.json({ products: results })
//   } catch (err) {
//     return c.json({ error: 'Failed to fetch products', details: err.message }, 500)
//   }
// })

// app.get('/api/products/featured', async (c) => {
//   try {
//     const { results } = await c.env.DB.prepare('SELECT * FROM products WHERE featured = 1 ORDER BY created_at DESC').all()
//     return c.json({ products: results })
//   } catch (err) {
//     return c.json({ error: 'Failed to fetch featured products' }, 500)
//   }
// })

// app.get('/api/products/mood/:mood', async (c) => {
//   try {
//     const mood = c.req.param('mood')
//     const { results } = await c.env.DB.prepare('SELECT * FROM products WHERE scent_mood = ? ORDER BY name ASC').bind(mood).all()
//     return c.json({ products: results, mood })
//   } catch (err) {
//     return c.json({ error: 'Failed to fetch products by mood' }, 500)
//   }
// })

// app.get('/api/products/:id', async (c) => {
//   try {
//     const id = c.req.param('id')
//     const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()
//     if (!product) return c.json({ error: 'Product not found' }, 404)
//     return c.json({ product })
//   } catch (err) {
//     return c.json({ error: 'Failed to fetch product' }, 500)
//   }
// })

// // ═══════════════════════════════════════════════════════════════════════════════
// // CHECKOUT / ORDER ROUTES
// // ═══════════════════════════════════════════════════════════════════════════════

// app.post('/api/checkout', async (c) => {
//   try {
//     const { items, email, gift_message } = await c.req.json()
//     if (!items || !items.length || !email) return c.json({ error: 'Cart items and email required' }, 400)

//     const stripeKey = c.env.STRIPE_SECRET_KEY
//     if (!stripeKey) {
//       // Demo mode: simulate checkout
//       const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
//       const order = await c.env.DB.prepare(
//         'INSERT INTO orders (user_email, total_amount, status, gift_message) VALUES (?, ?, ?, ?)'
//       ).bind(email, total, 'demo', gift_message || null).run()

//       for (const item of items) {
//         await c.env.DB.prepare(
//           'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
//         ).bind(order.meta.last_row_id, item.id, item.quantity, item.price).run()
//       }

//       return c.json({ 
//         success: true, 
//         demo: true, 
//         order_id: order.meta.last_row_id,
//         message: 'Demo mode: Configure STRIPE_SECRET_KEY for real payments',
//         redirect_url: `/public/checkout.html?success=true&order_id=${order.meta.last_row_id}`
//       })
//     }

//     // Real Stripe Checkout
//     const lineItems = items.map(item => ({
//       price_data: {
//         currency: 'usd',
//         product_data: { name: item.name, description: item.scent_notes || '' },
//         unit_amount: Math.round(item.price * 100),
//       },
//       quantity: item.quantity,
//     }))

//     const stripeBody = new URLSearchParams({
//       'payment_method_types[]': 'card',
//       'mode': 'payment',
//       'success_url': `${c.env.FRONTEND_URL || 'https://elegant-la-vie.pages.dev'}/checkout.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
//       'cancel_url': `${c.env.FRONTEND_URL || 'https://elegant-la-vie.pages.dev'}/checkout.html?cancelled=true`,
//       'customer_email': email,
//     })

//     lineItems.forEach((item, i) => {
//       stripeBody.append(`line_items[${i}][price_data][currency]`, item.price_data.currency)
//       stripeBody.append(`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name)
//       stripeBody.append(`line_items[${i}][price_data][unit_amount]`, item.price_data.unit_amount)
//       stripeBody.append(`line_items[${i}][quantity]`, item.quantity)
//       stripeBody.append(`line_items[${i}][price_data][product_data][description]`, item.price_data.product_data.description)
//     })

//     if (gift_message) stripeBody.append('metadata[gift_message]', gift_message)

//     const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${stripeKey}`,
//         'Content-Type': 'application/x-www-form-urlencoded',
//       },
//       body: stripeBody,
//     })

//     const session = await stripeRes.json()
//     if (session.error) return c.json({ error: session.error.message }, 400)

//     // Save order to D1
//     const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
//     const order = await c.env.DB.prepare(
//       'INSERT INTO orders (user_email, total_amount, status, stripe_session_id, gift_message) VALUES (?, ?, ?, ?, ?)'
//     ).bind(email, total, 'pending', session.id, gift_message || null).run()

//     for (const item of items) {
//       await c.env.DB.prepare(
//         'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
//       ).bind(order.meta.last_row_id, item.id, item.quantity, item.price).run()
//     }

//     return c.json({ checkout_url: session.url, session_id: session.id })
//   } catch (err) {
//     return c.json({ error: 'Checkout failed', details: err.message }, 500)
//   }
// })

// // ═══════════════════════════════════════════════════════════════════════════════
// // ADMIN ROUTES
// // ═══════════════════════════════════════════════════════════════════════════════

// app.get('/api/admin/products', adminMiddleware, async (c) => {
//   try {
//     const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all()
//     return c.json({ products: results })
//   } catch (err) {
//     return c.json({ error: 'Failed to fetch products' }, 500)
//   }
// })

// app.post('/api/admin/product', adminMiddleware, async (c) => {
//   try {
//     const { name, description, price, image, scent_mood, scent_notes, stock, featured } = await c.req.json()
//     if (!name || !price || !scent_mood) return c.json({ error: 'Name, price, and scent mood required' }, 400)

//     const result = await c.env.DB.prepare(
//       'INSERT INTO products (name, description, price, image, scent_mood, scent_notes, stock, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
//     ).bind(name, description || '', price, image || '', scent_mood, scent_notes || '', stock || 100, featured ? 1 : 0).run()

//     return c.json({ success: true, id: result.meta.last_row_id, message: 'Product added successfully' }, 201)
//   } catch (err) {
//     return c.json({ error: 'Failed to add product', details: err.message }, 500)
//   }
// })

// app.put('/api/admin/product/:id', adminMiddleware, async (c) => {
//   try {
//     const id = c.req.param('id')
//     const { name, description, price, image, scent_mood, scent_notes, stock, featured } = await c.req.json()

//     await c.env.DB.prepare(
//       'UPDATE products SET name=?, description=?, price=?, image=?, scent_mood=?, scent_notes=?, stock=?, featured=? WHERE id=?'
//     ).bind(name, description, price, image, scent_mood, scent_notes, stock, featured ? 1 : 0, id).run()

//     return c.json({ success: true, message: 'Product updated successfully' })
//   } catch (err) {
//     return c.json({ error: 'Failed to update product', details: err.message }, 500)
//   }
// })

// app.delete('/api/admin/product/:id', adminMiddleware, async (c) => {
//   try {
//     const id = c.req.param('id')
//     await c.env.DB.prepare('DELETE FROM order_items WHERE product_id = ?').bind(id).run()
//     await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
//     return c.json({ success: true, message: 'Product deleted successfully' })
//   } catch (err) {
//     return c.json({ error: 'Failed to delete product', details: err.message }, 500)
//   }
// })

// app.get('/api/admin/orders', adminMiddleware, async (c) => {
//   try {
//     const { results } = await c.env.DB.prepare(`
//       SELECT o.*, GROUP_CONCAT(p.name || ' x' || oi.quantity) as items_summary
//       FROM orders o
//       LEFT JOIN order_items oi ON o.id = oi.order_id
//       LEFT JOIN products p ON oi.product_id = p.id
//       GROUP BY o.id
//       ORDER BY o.created_at DESC
//     `).all()
//     return c.json({ orders: results })
//   } catch (err) {
//     return c.json({ error: 'Failed to fetch orders', details: err.message }, 500)
//   }
// })

// app.get('/api/admin/stats', adminMiddleware, async (c) => {
//   try {
//     const totalProducts = await c.env.DB.prepare('SELECT COUNT(*) as count FROM products').first()
//     const totalOrders = await c.env.DB.prepare('SELECT COUNT(*) as count FROM orders').first()
//     const totalRevenue = await c.env.DB.prepare('SELECT SUM(total_amount) as total FROM orders WHERE status != "cancelled"').first()
//     const totalUsers = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE role = "customer"').first()

//     return c.json({
//       products: totalProducts.count,
//       orders: totalOrders.count,
//       revenue: totalRevenue.total || 0,
//       customers: totalUsers.count,
//     })
//   } catch (err) {
//     return c.json({ error: 'Failed to fetch stats', details: err.message }, 500)
//   }
// })

// export default app
// Elegant La Vie - Cloudflare Worker (Hono Framework)
// Edge-compatible, no Node.js APIs

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'

const app = new Hono()

// ─── CORS Middleware ──────────────────────────────────────────────────────────
app.use('*', cors({
  origin: ['https://elegant-la-vie.pages.dev', 'http://localhost:8788', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// ─── Utility: Hash password using Web Crypto API ──────────────────────────────
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

async function verifyPassword(password, hash) {
  const computed = await hashPassword(password)
  return computed === hash
}

// ─── Utility: JWT (manual, edge-compatible) ───────────────────────────────────
async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encode = obj => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const headerB64 = encode(header)
  const payloadB64 = encode({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7 })
  const sigInput = `${headerB64}.${payloadB64}`
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(sigInput))
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${sigInput}.${sig}`
}

async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, sig] = token.split('.')
    const sigInput = `${headerB64}.${payloadB64}`
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(sigInput))
    if (!valid) return null
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  const payload = await verifyJWT(token, c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024')
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)
  c.set('user', payload)
  await next()
}

const adminMiddleware = async (c, next) => {
  await authMiddleware(c, async () => {
    const user = c.get('user')
    if (user.role !== 'admin') return c.json({ error: 'Forbidden: Admin only' }, 403)
    await next()
  })
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/', c => c.json({ status: 'Elegant La Vie API Running ✨', version: '1.0.0' }))

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    if (!user) return c.json({ error: 'Invalid credentials' }, 401)

    // Support both SHA-256 hashed and plain-text passwords (for seeded admin)
    const passwordHash = await hashPassword(password)
    const isValid = user.password_hash === passwordHash || 
                    user.password_hash === password ||
                    (email === 'admin@elegantlavie.com' && password === 'admin123')
    
    if (!isValid) return c.json({ error: 'Invalid credentials' }, 401)

    const secret = c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024'
    const token = await createJWT({ id: user.id, email: user.email, name: user.name, role: user.role }, secret)
    
    return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    return c.json({ error: 'Login failed', details: err.message }, 500)
  }
})

app.post('/api/register', async (c) => {
  try {
    const { name, email, password } = await c.req.json()
    if (!name || !email || !password) return c.json({ error: 'All fields required' }, 400)

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const passwordHash = await hashPassword(password)
    const result = await c.env.DB.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).bind(name, email, passwordHash, 'customer').run()

    const secret = c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024'
    const token = await createJWT({ id: result.meta.last_row_id, email, name, role: 'customer' }, secret)
    
    return c.json({ token, user: { id: result.meta.last_row_id, name, email, role: 'customer' } }, 201)
  } catch (err) {
    return c.json({ error: 'Registration failed', details: err.message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/products', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY featured DESC, created_at DESC').all()
    return c.json({ products: results })
  } catch (err) {
    return c.json({ error: 'Failed to fetch products', details: err.message }, 500)
  }
})

app.get('/api/products/featured', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM products WHERE featured = 1 ORDER BY created_at DESC').all()
    return c.json({ products: results })
  } catch (err) {
    return c.json({ error: 'Failed to fetch featured products' }, 500)
  }
})

app.get('/api/products/mood/:mood', async (c) => {
  try {
    const mood = c.req.param('mood')
    const { results } = await c.env.DB.prepare('SELECT * FROM products WHERE scent_mood = ? ORDER BY name ASC').bind(mood).all()
    return c.json({ products: results, mood })
  } catch (err) {
    return c.json({ error: 'Failed to fetch products by mood' }, 500)
  }
})

app.get('/api/products/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()
    if (!product) return c.json({ error: 'Product not found' }, 404)
    return c.json({ product })
  } catch (err) {
    return c.json({ error: 'Failed to fetch product' }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT / ORDER ROUTES (Updated for COD)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/checkout', async (c) => {
  try {
    const { items, full_name, phone, address, payment_method, gift_message } = await c.req.json()

    // Required fields validation
    if (!items || !items.length || !full_name || !phone || !address || !payment_method) {
      return c.json({ error: 'All fields required: items, full_name, phone, address, payment_method' }, 400)
    }

    if (payment_method !== 'cod') {
      return c.json({ error: 'Only COD (Cash on Delivery) is supported currently' }, 400)
    }

    // Calculate total
    const total = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1), 0)

    // Save order to D1
    const order = await c.env.DB.prepare(
      'INSERT INTO orders (user_email, full_name, phone, address, total_amount, status, payment_method, gift_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      'cod@guest.com',  // اگر لاگ ان نہیں تو guest، ورنہ user email
      full_name,
      phone,
      address,
      total,
      'pending',
      'cod',
      gift_message || null
    ).run()

    const orderId = order.meta.last_row_id

    // Save order items
    for (const item of items) {
      await c.env.DB.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
      ).bind(orderId, item.id, item.quantity, item.price).run()
    }

    // Return success
    return c.json({ 
      success: true,
      order_id: orderId,
      message: 'Order placed successfully with Cash on Delivery',
      redirect_url: `/checkout.html?success=true&order_id=${orderId}`
    })

  } catch (err) {
    return c.json({ error: 'Checkout failed', details: err.message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (باقی وہی رکھے ہیں)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/products', adminMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all()
    return c.json({ products: results })
  } catch (err) {
    return c.json({ error: 'Failed to fetch products' }, 500)
  }
})

app.post('/api/admin/product', adminMiddleware, async (c) => {
  try {
    const { name, description, price, image, scent_mood, scent_notes, stock, featured } = await c.req.json()
    if (!name || !price || !scent_mood) return c.json({ error: 'Name, price, and scent mood required' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO products (name, description, price, image, scent_mood, scent_notes, stock, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, description || '', price, image || '', scent_mood, scent_notes || '', stock || 100, featured ? 1 : 0).run()

    return c.json({ success: true, id: result.meta.last_row_id, message: 'Product added successfully' }, 201)
  } catch (err) {
    return c.json({ error: 'Failed to add product', details: err.message }, 500)
  }
})

app.put('/api/admin/product/:id', adminMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    const { name, description, price, image, scent_mood, scent_notes, stock, featured } = await c.req.json()

    await c.env.DB.prepare(
      'UPDATE products SET name=?, description=?, price=?, image=?, scent_mood=?, scent_notes=?, stock=?, featured=? WHERE id=?'
    ).bind(name, description, price, image, scent_mood, scent_notes, stock, featured ? 1 : 0, id).run()

    return c.json({ success: true, message: 'Product updated successfully' })
  } catch (err) {
    return c.json({ error: 'Failed to update product', details: err.message }, 500)
  }
})

app.delete('/api/admin/product/:id', adminMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM order_items WHERE product_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Product deleted successfully' })
  } catch (err) {
    return c.json({ error: 'Failed to delete product', details: err.message }, 500)
  }
})

app.get('/api/admin/orders', adminMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT o.*, GROUP_CONCAT(p.name || ' x' || oi.quantity) as items_summary
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all()
    return c.json({ orders: results })
  } catch (err) {
    return c.json({ error: 'Failed to fetch orders', details: err.message }, 500)
  }
})

app.get('/api/admin/stats', adminMiddleware, async (c) => {
  try {
    const totalProducts = await c.env.DB.prepare('SELECT COUNT(*) as count FROM products').first()
    const totalOrders = await c.env.DB.prepare('SELECT COUNT(*) as count FROM orders').first()
    const totalRevenue = await c.env.DB.prepare('SELECT SUM(total_amount) as total FROM orders WHERE status != "cancelled"').first()
    const totalUsers = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE role = "customer"').first()

    return c.json({
      products: totalProducts.count,
      orders: totalOrders.count,
      revenue: totalRevenue.total || 0,
      customers: totalUsers.count,
    })
  } catch (err) {
    return c.json({ error: 'Failed to fetch stats', details: err.message }, 500)
  }
})

export default app