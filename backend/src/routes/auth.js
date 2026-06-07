import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { verifyPassword, signToken } from '../lib/auth';
import { authMiddleware } from '../middleware/auth';
const auth = new Hono();
auth.post('/login', async (c) => {
    const { username, password } = await c.req.json();
    if (!username || !password) {
        return c.json({ error: 'Username and password required' }, 400);
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return c.json({ error: 'Invalid credentials' }, 401);
    }
    const token = await signToken({ id: user.id, username: user.username, role: user.role });
    return c.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});
auth.get('/me', authMiddleware, async (c) => {
    const user = c.get('user');
    return c.json(user);
});
export default auth;
