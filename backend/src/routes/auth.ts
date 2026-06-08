import { Hono } from 'hono'
import prisma from '../lib/prisma.js'
import { verifyPassword, hashPassword, signToken } from '../lib/auth.js'
import { authMiddleware, AuthUser } from '../middleware/auth.js'

const auth = new Hono<{ Variables: { user: AuthUser } }>()

const LOGIN_MAX_ATTEMPTS = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

auth.post('/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? c.req.header('x-real-ip') ?? 'unknown'
  const now = Date.now()
  const bucket = loginAttempts.get(ip)

  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= LOGIN_MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many login attempts. Try again later.' }, 429)
    }
    bucket.count++
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
  }

  const { username, password } = await c.req.json()
  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400)
  }

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // clear rate limit on successful login
  loginAttempts.delete(ip)

  const token = await signToken({ id: user.id, username: user.username, role: user.role })
  return c.json({ token, user: { id: user.id, username: user.username, role: user.role } })
})

auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user')
  return c.json(user)
})

export default auth
