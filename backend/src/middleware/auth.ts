import { createMiddleware } from 'hono/factory'
import { verifyToken } from '../lib/auth.js'

export type AuthUser = { id: number; username: string; role: string }

export const authMiddleware = createMiddleware<{ Variables: { user: AuthUser } }>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[Auth] Missing or invalid Authorization header')
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const token = authHeader.slice(7)
    const user = await verifyToken(token)
    c.set('user', user)
    await next()
  } catch (err: any) {
    console.error('[Auth] Token verification failed:', err.message)
    return c.json({ error: 'Invalid token' }, 401)
  }
})

export const requireRole = (...roles: string[]) =>
  createMiddleware<{ Variables: { user: AuthUser } }>(async (c, next) => {
    const user = c.get('user')
    console.log(`[Auth] Checking role for user: ${user?.username}, role: ${user?.role}, required: ${roles.join(',')}`)
    if (!user || !roles.includes(user.role)) {
      console.warn(`[Auth] Access denied for user: ${user?.username}. Role ${user?.role} not in ${roles.join(',')}`)
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
