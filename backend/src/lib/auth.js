import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
export async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}
export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
export async function signToken(payload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);
}
export async function verifyToken(token) {
    const { payload } = await jwtVerify(token, secret);
    return payload;
}
