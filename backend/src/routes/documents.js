import { Hono } from 'hono';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, extname, basename } from 'path';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
const docs = new Hono();
docs.use('*', authMiddleware);
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'products');
function ensureDir(dir) {
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
// List documents for a product
docs.get('/:id/documents', async (c) => {
    const productId = Number(c.req.param('id'));
    const documents = await prisma.document.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
    });
    return c.json(documents);
});
// Upload a file (multipart/form-data)
docs.post('/:id/documents/upload', requireRole('admin', 'super'), async (c) => {
    const productId = Number(c.req.param('id'));
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product)
        return c.json({ error: 'Product not found' }, 404);
    const body = await c.req.parseBody();
    const rawFile = body['file'];
    const type = String(body['type'] || 'pick-and-place');
    if (!rawFile || typeof rawFile === 'string' || Array.isArray(rawFile) || !(rawFile instanceof File)) {
        return c.json({ error: 'No file uploaded' }, 400);
    }
    const file = rawFile;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const productDir = join(UPLOADS_DIR, String(productId));
    ensureDir(productDir);
    const savePath = join(productDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(savePath, buffer);
    const user = c.get('user');
    const relativePath = `uploads/products/${productId}/${safeName}`;
    const doc = await prisma.document.create({
        data: {
            productId,
            type,
            storageKind: 'local',
            pathOrUrl: relativePath,
            uploadedBy: user.username,
        },
    });
    return c.json(doc, 201);
});
// Download a document file
docs.get('/:id/documents/:docId/download', async (c) => {
    const productId = Number(c.req.param('id'));
    const docId = Number(c.req.param('docId'));
    const doc = await prisma.document.findFirst({
        where: { id: docId, productId },
    });
    if (!doc)
        return c.json({ error: 'Document not found' }, 404);
    if (doc.storageKind !== 'local') {
        return c.redirect(doc.pathOrUrl);
    }
    const fullPath = join(process.cwd(), doc.pathOrUrl);
    if (!existsSync(fullPath))
        return c.json({ error: 'File not found on disk' }, 404);
    const buf = readFileSync(fullPath);
    const filename = basename(fullPath);
    const ext = extname(filename).toLowerCase();
    const mimeMap = {
        '.csv': 'text/csv',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    c.header('Content-Type', contentType);
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(new Uint8Array(buf));
});
// Delete a document
docs.delete('/:id/documents/:docId', requireRole('admin', 'super'), async (c) => {
    const productId = Number(c.req.param('id'));
    const docId = Number(c.req.param('docId'));
    const doc = await prisma.document.findFirst({
        where: { id: docId, productId },
    });
    if (!doc)
        return c.json({ error: 'Document not found' }, 404);
    if (doc.storageKind === 'local') {
        const fullPath = join(process.cwd(), doc.pathOrUrl);
        if (existsSync(fullPath))
            unlinkSync(fullPath);
    }
    await prisma.document.delete({ where: { id: docId } });
    return c.body(null, 204);
});
export default docs;
