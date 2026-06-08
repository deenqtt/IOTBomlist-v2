import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

import auth from './routes/auth.js'
import products from './routes/products.js'
import documents from './routes/documents.js'
import items from './routes/items.js'
import sets from './routes/sets.js'
import supersets from './routes/supersets.js'
import analytics from './routes/analytics.js'
import adminRoutes from './routes/admin.js'
import costing from './routes/costing.js'
import lcsc from './routes/lcsc.js'
import mouser from './routes/mouser.js'
import digikeyRoute from './routes/digikey.js'
import cron from 'node-cron'
import prisma from './lib/prisma.js'
import { performAutoBackup } from './lib/backup.js'

const app = new Hono()

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001']

app.use('*', logger())
app.use('*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// Security headers
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
})

// Request body size limit (10MB)
app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length')
  const MAX_BODY = 10 * 1024 * 1024 // 10MB
  if (contentLength && Number(contentLength) > MAX_BODY) {
    return c.json({ error: 'Request body too large' }, 413)
  }
  await next()
})

app.get('/health', (c) => c.json({ status: 'ok' }))

// Serve uploaded product images
app.get('/uploads/product-images/:filename', (c) => {
  const filename = c.req.param('filename')
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '')
  const filePath = join(process.cwd(), 'uploads', 'product-images', safeName)
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404)
  const ext = extname(safeName).toLowerCase()
  const mime: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
  c.header('Content-Type', mime[ext] || 'application/octet-stream')
  c.header('Cache-Control', 'public, max-age=31536000')
  return c.body(readFileSync(filePath) as unknown as ArrayBuffer)
})

app.route('/auth', auth)
app.route('/products', products)
app.route('/products', documents)
app.route('/items', items)
app.route('/sets', sets)
app.route('/supersets', supersets)
app.route('/analytics', analytics)
app.route('/admin', adminRoutes)
app.route('/costing', costing)
app.route('/lcsc', lcsc)
app.route('/mouser', mouser)
app.route('/digikey', digikeyRoute)

const port = Number(process.env.PORT || 8000)
console.log(`Server running on http://localhost:${port}`)

// --- Background Scheduler ---
// Run every day at 00:00 (Midnight)
cron.schedule('0 0 * * *', async () => {
  console.log('[SCHEDULER] Running daily health checks...')
  
  try {
    const settings = await prisma.systemSetting.findMany()
    const isEnabled = settings.find(s => s.key === 'auto_backup_enabled')?.value === 'true'
    const interval = Number(settings.find(s => s.key === 'auto_backup_interval')?.value || '30')
    const lastRunStr = settings.find(s => s.key === 'last_auto_backup_at')?.value
    
    if (!isEnabled) {
      console.log('[SCHEDULER] Auto-archive is disabled.')
      return
    }

    const now = new Date()
    let shouldRun = false
    
    if (!lastRunStr) {
      shouldRun = true
    } else {
      const lastRun = new Date(lastRunStr)
      const diffMs = now.getTime() - lastRun.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      if (diffDays >= interval) shouldRun = true
    }

    if (shouldRun) {
      await performAutoBackup()
    } else {
      console.log('[SCHEDULER] Auto-archive not yet due.')
    }
  } catch (err) {
    console.error('[SCHEDULER ERROR]', err)
  }
})

serve({ fetch: app.fetch, port })
