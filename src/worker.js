// Elegant La Vie - Cloudflare Worker v2.0
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({
  origin: ['https://elegant-la-vie.pages.dev', 'http://localhost:8788', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

async function hashPassword(password) {
  const data = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

async function createJWT(payload, secret) {
  const encode = obj => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const h = encode({ alg:'HS256', typ:'JWT' })
  const p = encode({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400*7 })
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${h}.${p}`))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  return `${h}.${p}.${sigB64}`
}

async function verifyJWT(token, secret) {
  try {
    const [h, p, sig] = token.split('.')
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['verify'])
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${h}.${p}`))
    if (!valid) return null
    const payload = JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')))
    if (payload.exp < Math.floor(Date.now()/1000)) return null
    return payload
  } catch { return null }
}

const authMiddleware = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
  const payload = await verifyJWT(auth.slice(7), c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024')
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)
  c.set('user', payload)
  await next()
}

const adminMiddleware = async (c, next) => {
  await authMiddleware(c, async () => {
    if (c.get('user').role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    await next()
  })
}

app.get('/', c => c.json({ status: 'Elegant La Vie API Running', version: '2.0.0' }))

// AUTH
app.post('/api/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) return c.json({ error: 'Email and password required' }, 400)
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    if (!user) return c.json({ error: 'Invalid credentials' }, 401)
    const hash = await hashPassword(password)
    const valid = user.password_hash === hash || user.password_hash === password
    if (!valid) return c.json({ error: 'Invalid credentials' }, 401)
    const token = await createJWT({ id: user.id, email: user.email, name: user.name, role: user.role }, c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024')
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
    const hash = await hashPassword(password)
    const result = await c.env.DB.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').bind(name, email, hash, 'customer').run()
    const token = await createJWT({ id: result.meta.last_row_id, email, name, role: 'customer' }, c.env.JWT_SECRET || 'elegant-la-vie-super-secret-jwt-key-2024')
    return c.json({ token, user: { id: result.meta.last_row_id, name, email, role: 'customer' } }, 201)
  } catch (err) {
    return c.json({ error: 'Registration failed', details: err.message }, 500)
  }
})

app.post('/api/admin/change-credentials', adminMiddleware, async (c) => {
  try {
    const { new_email, new_password, current_password } = await c.req.json()
    const user_id = c.get('user').id
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first()
    const hash = await hashPassword(current_password)
    if (user.password_hash !== hash && user.password_hash !== current_password) return c.json({ error: 'Current password is incorrect' }, 401)
    if (new_email) await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(new_email, user_id).run()
    if (new_password) await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(new_password), user_id).run()
    return c.json({ success: true, message: 'Credentials updated. Please login again.' })
  } catch (err) {
    return c.json({ error: 'Failed to update credentials', details: err.message }, 500)
  }
})

// PRODUCTS
app.get('/api/products', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY featured DESC, created_at DESC').all()
    return c.json({ products: results })
  } catch (err) { return c.json({ error: 'Failed to fetch products' }, 500) }
})

app.get('/api/products/featured', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM products WHERE featured = 1 ORDER BY created_at DESC').all()
    return c.json({ products: results })
  } catch (err) { return c.json({ error: 'Failed to fetch featured products' }, 500) }
})

app.get('/api/products/mood/:mood', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM products WHERE scent_mood = ? ORDER BY name ASC').bind(c.req.param('mood')).all()
    return c.json({ products: results })
  } catch (err) { return c.json({ error: 'Failed to fetch products by mood' }, 500) }
})

app.get('/api/products/:id', async (c) => {
  try {
    const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(c.req.param('id')).first()
    if (!product) return c.json({ error: 'Product not found' }, 404)
    return c.json({ product })
  } catch (err) { return c.json({ error: 'Failed to fetch product' }, 500) }
})

// DISCOUNT VALIDATE (public)
app.post('/api/discount/validate', async (c) => {
  try {
    const { code, cart_total } = await c.req.json()
    if (!code) return c.json({ error: 'Discount code required' }, 400)
    const discount = await c.env.DB.prepare('SELECT * FROM discount_codes WHERE code = ? AND active = 1').bind(code.toUpperCase()).first()
    if (!discount) return c.json({ error: 'Invalid or expired discount code' }, 404)
    if (discount.min_order_amount && cart_total < discount.min_order_amount) return c.json({ error: `Minimum order amount is Rs. ${discount.min_order_amount}` }, 400)
    if (discount.usage_limit && discount.used_count >= discount.usage_limit) return c.json({ error: 'This discount code has been fully used' }, 400)
    const discount_amount = discount.type === 'percentage' ? Math.round(cart_total * discount.value / 100) : discount.value
    return c.json({ success: true, code: discount.code, type: discount.type, value: discount.value, discount_amount, final_total: cart_total - discount_amount, message: discount.type === 'percentage' ? `${discount.value}% off applied!` : `Rs. ${discount.value} off applied!` })
  } catch (err) { return c.json({ error: 'Failed to validate code', details: err.message }, 500) }
})

// CHECKOUT (login required)
app.post('/api/checkout', authMiddleware, async (c) => {
  try {
    const { items, full_name, phone, address, payment_method, gift_message, discount_code } = await c.req.json()
    const user = c.get('user')
    if (!items || !items.length) return c.json({ error: 'Cart is empty' }, 400)
    if (!full_name || !phone || !address) return c.json({ error: 'Name, phone, and address required' }, 400)

    let total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    let discount_amount = 0
    let applied_code = null

    if (discount_code) {
      const discount = await c.env.DB.prepare('SELECT * FROM discount_codes WHERE code = ? AND active = 1').bind(discount_code.toUpperCase()).first()
      if (discount) {
        discount_amount = discount.type === 'percentage' ? Math.round(total * discount.value / 100) : discount.value
        total = total - discount_amount
        applied_code = discount.code
        await c.env.DB.prepare('UPDATE discount_codes SET used_count = used_count + 1 WHERE code = ?').bind(discount.code).run()
      }
    }

    const items_summary = items.map(i => `${i.name} x${i.quantity}`).join(', ')
    const order = await c.env.DB.prepare(
      'INSERT INTO orders (user_email, full_name, phone, address, total_amount, status, payment_method, gift_message, items_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.email, full_name, phone, address, total, 'pending', payment_method||'cod', gift_message||null, items_summary).run()

    const order_id = order.meta.last_row_id
    for (const item of items) {
      await c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)').bind(order_id, item.id, item.quantity, item.price).run()
    }

    return c.json({ success: true, order_id, message: 'Order placed successfully!', discount_applied: applied_code, discount_amount, final_total: total })
  } catch (err) {
    return c.json({ error: 'Checkout failed', details: err.message }, 500)
  }
})

app.get('/api/my-orders', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { results } = await c.env.DB.prepare('SELECT * FROM orders WHERE user_email = ? ORDER BY created_at DESC').bind(user.email).all()
    return c.json({ orders: results })
  } catch (err) { return c.json({ error: 'Failed to fetch orders' }, 500) }
})

// ADMIN - PRODUCTS
app.get('/api/admin/products', adminMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all()
    return c.json({ products: results })
  } catch (err) { return c.json({ error: 'Failed to fetch products' }, 500) }
})

app.post('/api/admin/product', adminMiddleware, async (c) => {
  try {
    const { name, description, price, image, scent_mood, scent_notes, stock, featured, gender } = await c.req.json()
    if (!name || !price || !scent_mood) return c.json({ error: 'Name, price, and scent mood required' }, 400)
    const result = await c.env.DB.prepare('INSERT INTO products (name, description, price, image, scent_mood, scent_notes, stock, featured, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(name, description||'', price, image||'', scent_mood, scent_notes||'', stock||100, featured?1:0, gender||'').run()
    return c.json({ success: true, id: result.meta.last_row_id }, 201)
  } catch (err) { return c.json({ error: 'Failed to add product', details: err.message }, 500) }
})

app.put('/api/admin/product/:id', adminMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    const { name, description, price, image, scent_mood, scent_notes, stock, featured, gender } = await c.req.json()
    await c.env.DB.prepare('UPDATE products SET name=?, description=?, price=?, image=?, scent_mood=?, scent_notes=?, stock=?, featured=?, gender=? WHERE id=?').bind(name, description, price, image, scent_mood, scent_notes, stock, featured?1:0, gender||'', id).run()
    return c.json({ success: true })
  } catch (err) { return c.json({ error: 'Failed to update product', details: err.message }, 500) }
})

app.delete('/api/admin/product/:id', adminMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM order_items WHERE product_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err) { return c.json({ error: 'Failed to delete product', details: err.message }, 500) }
})

// ADMIN - ORDERS
app.get('/api/admin/orders', adminMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC').all()
    return c.json({ orders: results })
  } catch (err) { return c.json({ error: 'Failed to fetch orders', details: err.message }, 500) }
})

app.put('/api/admin/order/:id/status', adminMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json()
    const valid = ['pending','confirmed','shipped','delivered','cancelled']
    if (!valid.includes(status)) return c.json({ error: 'Invalid status' }, 400)
    await c.env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(status, id).run()
    return c.json({ success: true, message: `Order #${id} updated to ${status}` })
  } catch (err) { return c.json({ error: 'Failed to update order status', details: err.message }, 500) }
})

app.get('/api/admin/stats', adminMiddleware, async (c) => {
  try {
    const totalProducts = await c.env.DB.prepare('SELECT COUNT(*) as count FROM products').first()
    const totalOrders = await c.env.DB.prepare('SELECT COUNT(*) as count FROM orders').first()
    const totalRevenue = await c.env.DB.prepare('SELECT SUM(total_amount) as total FROM orders WHERE status != "cancelled"').first()
    const totalUsers = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE role = "customer"').first()
    return c.json({ products: totalProducts.count, orders: totalOrders.count, revenue: totalRevenue.total||0, customers: totalUsers.count })
  } catch (err) { return c.json({ error: 'Failed to fetch stats' }, 500) }
})

// ADMIN - DISCOUNTS
app.get('/api/admin/discounts', adminMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM discount_codes ORDER BY created_at DESC').all()
    return c.json({ discounts: results })
  } catch (err) { return c.json({ error: 'Failed to fetch discounts' }, 500) }
})

app.post('/api/admin/discount', adminMiddleware, async (c) => {
  try {
    const { code, type, value, min_order_amount, usage_limit } = await c.req.json()
    if (!code || !type || !value) return c.json({ error: 'Code, type, and value required' }, 400)
    if (!['percentage','fixed'].includes(type)) return c.json({ error: 'Type must be percentage or fixed' }, 400)
    const existing = await c.env.DB.prepare('SELECT id FROM discount_codes WHERE code = ?').bind(code.toUpperCase()).first()
    if (existing) return c.json({ error: 'Code already exists' }, 409)
    const result = await c.env.DB.prepare('INSERT INTO discount_codes (code, type, value, min_order_amount, usage_limit, used_count, active) VALUES (?, ?, ?, ?, ?, 0, 1)').bind(code.toUpperCase(), type, value, min_order_amount||0, usage_limit||null).run()
    return c.json({ success: true, id: result.meta.last_row_id }, 201)
  } catch (err) { return c.json({ error: 'Failed to create discount', details: err.message }, 500) }
})

app.put('/api/admin/discount/:id', adminMiddleware, async (c) => {
  try {
    const { active } = await c.req.json()
    await c.env.DB.prepare('UPDATE discount_codes SET active = ? WHERE id = ?').bind(active?1:0, c.req.param('id')).run()
    return c.json({ success: true })
  } catch (err) { return c.json({ error: 'Failed to update discount' }, 500) }
})

app.delete('/api/admin/discount/:id', adminMiddleware, async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM discount_codes WHERE id = ?').bind(c.req.param('id')).run()
    return c.json({ success: true })
  } catch (err) { return c.json({ error: 'Failed to delete discount' }, 500) }
})

export default app
