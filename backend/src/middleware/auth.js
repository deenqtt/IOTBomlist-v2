import { createMiddleware } from 'hono/factory';
import { verifyToken } from '../lib/auth';
export const authMiddleware = createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
        const token = authHeader.slice(7);
        const user = await verifyToken(token);
        c.set('user', user);
        await next();
    }
    catch {
        return c.json({ error: 'Invalid token' }, 401);
    }
});
export const requireRole = (...roles) => createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!roles.includes(user.role)) {
        return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
});
