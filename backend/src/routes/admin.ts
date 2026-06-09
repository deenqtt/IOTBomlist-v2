import { Hono } from 'hono'
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js'
import prisma from '../lib/prisma.js'
import { authMiddleware, requireRole, AuthUser } from '../middleware/auth.js'
import { logChange } from '../lib/changelog.js'
import { clearDigikeyTokenCache } from './digikey.js'
import { invalidateCosts } from './costing.js'
import { generateBackupBuffer } from '../lib/backup.js'
import * as XLSX from 'xlsx'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

const VALID_ROLES = ['user', 'admin', 'super'] as const
type Role = typeof VALID_ROLES[number]

const BACKUP_AUTO_DIR = resolve(process.cwd(), 'backups', 'auto')
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024 // 50MB for Excel imports
import axios from 'axios'

const admin = new Hono<{ Variables: { user: AuthUser } }>()
admin.use('*', authMiddleware)

// ─── Users (super only) ────────────────────────────────────────────────────

admin.get('/users', requireRole('admin', 'super'), async (c) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { username: 'asc' },
  })
  return c.json(users)
})

admin.post('/users', requireRole('admin', 'super'), async (c) => {
  const { username, password, role = 'user' } = await c.req.json()
  const operator = c.get('user')
  if (!username?.trim() || !password) return c.json({ error: 'username and password required' }, 400)
  if (!VALID_ROLES.includes(role as Role)) return c.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, 400)
  const exists = await prisma.user.findUnique({ where: { username: username.trim() } })
  if (exists) return c.json({ error: 'Username already exists' }, 409)
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { username: username.trim(), passwordHash, role },
    select: { id: true, username: true, role: true, createdAt: true },
  })
  
  await logChange({
    entity: 'user',
    entityId: user.id,
    field: 'all',
    oldValue: null,
    newValue: user.username,
    changedBy: operator.username,
    context: `Created user with role ${role}`
  })

  return c.json(user, 201)
})

admin.patch('/users/:id', requireRole('admin', 'super'), async (c) => {
  const id = Number(c.req.param('id'))
  const { role, password } = await c.req.json()
  const operator = c.get('user')
  
  const oldUser = await prisma.user.findUnique({ where: { id } })
  if (!oldUser) return c.json({ error: 'Not found' }, 404)

  const data: Record<string, string> = {}
  if (role) {
    if (!VALID_ROLES.includes(role as Role)) return c.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, 400)
    data.role = role
  }
  if (password) data.passwordHash = await hashPassword(password)
  if (!Object.keys(data).length) return c.json({ error: 'Nothing to update' }, 400)
  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, role: true, createdAt: true },
  })

  if (role && role !== oldUser.role) {
    await logChange({
      entity: 'user',
      entityId: id,
      field: 'role',
      oldValue: oldUser.role,
      newValue: role,
      changedBy: operator.username,
      context: 'Role update'
    })
  }
  if (password) {
    await logChange({
      entity: 'user',
      entityId: id,
      field: 'password',
      oldValue: '********',
      newValue: '********',
      changedBy: operator.username,
      context: 'Password reset'
    })
  }

  return c.json(user)
})

admin.delete('/users/:id', requireRole('admin', 'super'), async (c) => {
  const id = Number(c.req.param('id'))
  const operator = c.get('user')
  
  const oldUser = await prisma.user.findUnique({ where: { id } })
  if (!oldUser) return c.json({ error: 'Not found' }, 404)

  await prisma.user.delete({ where: { id } })
  
  await logChange({
    entity: 'user',
    entityId: id,
    field: null as any,
    oldValue: oldUser.username,
    newValue: null,
    changedBy: operator.username,
    context: 'User deleted'
  })

  return c.body(null, 204)
})

// ─── Change Log ────────────────────────────────────────────────────────────

admin.get('/changelog', requireRole('admin', 'super'), async (c) => {
  const entity = c.req.query('entity')
  const q = c.req.query('q')
  const from = c.req.query('from')
  const to = c.req.query('to')
  const skip = Number(c.req.query('skip') || 0)
  const limit = Math.min(Number(c.req.query('limit') || 100), 500)

  const where = {
    AND: [
      entity ? { entity } : {},
      q ? {
        OR: [
          { entityId: { contains: q, mode: 'insensitive' as const } },
          { field: { contains: q, mode: 'insensitive' as const } },
          { oldValue: { contains: q, mode: 'insensitive' as const } },
          { newValue: { contains: q, mode: 'insensitive' as const } },
          { changedBy: { contains: q, mode: 'insensitive' as const } },
          { context: { contains: q, mode: 'insensitive' as const } },
        ],
      } : {},
      from ? { changedAt: { gte: new Date(from) } } : {},
      to ? { changedAt: { lte: new Date(to) } } : {},
    ],
  }

  const [data, total] = await Promise.all([
    prisma.changeLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { changedAt: 'desc' },
    }),
    prisma.changeLog.count({ where }),
  ])

  return c.json({ data, total, skip, limit })
})

// ─── Warehouse ─────────────────────────────────────────────────────────────

admin.get('/warehouse', requireRole('admin', 'super'), async (c) => {
  const q = c.req.query('q')
  const skip = Number(c.req.query('skip') || 0)
  const limit = Number(c.req.query('limit') || 100)

  const where = q ? {
    OR: [
      { stableId: { contains: q, mode: 'insensitive' as const } },
      { partNumber: { contains: q, mode: 'insensitive' as const } },
      { productName: { contains: q, mode: 'insensitive' as const } },
    ],
  } : undefined

  const [data, total] = await Promise.all([
    prisma.item.findMany({
      where,
      skip,
      take: limit,
      select: {
        stableId: true, partNumber: true, productName: true,
        stockQty: true, whQty: true, whLocation: true,
      },
      orderBy: { stableId: 'asc' },
    }),
    prisma.item.count({ where }),
  ])

  return c.json({ data, total, skip, limit })
})

admin.patch('/warehouse/:stableId', requireRole('admin', 'super'), async (c) => {
  const stableId = c.req.param('stableId')
  const { whQty, whLocation } = await c.req.json()
  const operator = c.get('user')
  
  const oldItem = await prisma.item.findUnique({ 
    where: { stableId },
    select: { whQty: true, whLocation: true, partNumber: true }
  })
  if (!oldItem) return c.json({ error: 'Not found' }, 404)

  const item = await prisma.item.update({
    where: { stableId },
    data: { whQty, whLocation },
    select: { stableId: true, whQty: true, whLocation: true },
  })

  if (whQty !== oldItem.whQty) {
    await logChange({
      entity: 'item',
      entityId: stableId,
      field: 'whQty',
      oldValue: String(oldItem.whQty),
      newValue: String(whQty),
      changedBy: operator.username,
      context: `Warehouse Qty Update (${oldItem.partNumber})`
    })
  }
  if (whLocation !== oldItem.whLocation) {
    await logChange({
      entity: 'item',
      entityId: stableId,
      field: 'whLocation',
      oldValue: oldItem.whLocation,
      newValue: whLocation,
      changedBy: operator.username,
      context: `Warehouse Location Update (${oldItem.partNumber})`
    })
  }

  return c.json(item)
})

// ─── Import Excel ──────────────────────────────────────────────────────────

admin.post('/import', requireRole('admin', 'super'), async (c) => {
  const dryRun = c.req.query('dryRun') === 'true'
  const autoEnrich = c.req.query('autoEnrich') === 'true'
  const body = await c.req.parseBody()
  const file = body['file'] as File
  const user = c.get('user')
  if (!file) return c.json({ error: 'file required' }, 400)
  if (file.size > UPLOAD_MAX_BYTES) return c.json({ error: 'File too large (max 50MB)' }, 413)
  const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream']
  if (file.name && !file.name.match(/\.(xlsx|xls)$/i)) return c.json({ error: 'Only .xlsx and .xls files are accepted' }, 400)

  // Get current auth token to pass to internal API calls
  const authHeader = c.req.header('Authorization')
  const api = axios.create({
    baseURL: `http://localhost:${process.env.PORT || 8001}`,
    headers: authHeader ? { 'Authorization': authHeader } : {}
  })

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'buffer' })

  let itemsImported = 0
  let itemsEnriched = 0
  let productsImported = 0
  let bomRowsImported = 0
  let setsImported = 0
  let setItemsImported = 0
  let supersetsImported = 0
  let ssItemsImported = 0
  const errors: string[] = []
  const warnings: string[] = []

  // ── Import helpers ────────────────────────────────────────────────────────

  // Issue #3: Detect internal/custom part codes that cannot be searched on suppliers
  function isInternalPartCode(pn: string | null | undefined): boolean {
    if (!pn) return true
    const s = pn.trim()
    // Pure numeric 6+ digits (e.g. 102040008, 308070004) → internal stock/serial codes
    if (/^\d{6,}$/.test(s)) return true
    // Known internal prefixes used in this dataset
    if (/^(102|106|201|202|206|307|308|309)\d{6,}$/.test(s)) return true
    return false
  }

  // Issue #4 & #5: Extract Value and Package from a description string
  function extractFromDescription(desc: string | null | undefined): { value: string | null; package: string | null } {
    if (!desc) return { value: null, package: null }
    const d = desc

    // Value: resistance (e.g. "47 Ohms", "10 kOhms", "330 Ohms")
    const resistMatch = d.match(/(\d+(?:\.\d+)?)\s*(k|m|g|meg)?ohms?/i)
    // Value: capacitance (e.g. "10 µF", "100nF", "0.1uF")
    const capMatch = d.match(/(\d+(?:\.\d+)?)\s*(µ|u|n|p|μ)F/i)
    // Value: inductance (e.g. "10 µH", "100nH")
    const indMatch = d.match(/(\d+(?:\.\d+)?)\s*(µ|u|n|μ)H/i)
    // Value: voltage (e.g. "5V", "3.3V")
    const voltMatch = d.match(/(\d+(?:\.\d+)?)\s*V(?:\s|,|$)/i)

    let value: string | null = null
    if (resistMatch) {
      const num = resistMatch[1]; const prefix = (resistMatch[2] || '').toLowerCase()
      value = prefix === 'k' ? `${num}k` : prefix === 'm' ? `${num}M` : `${num}`
    } else if (capMatch) {
      const num = capMatch[1]; const prefix = capMatch[2].toLowerCase().replace('μ', 'u').replace('µ', 'u')
      value = `${num}${prefix}F`
    } else if (indMatch) {
      const num = indMatch[1]; const prefix = indMatch[2].toLowerCase().replace('μ', 'u').replace('µ', 'u')
      value = `${num}${prefix}H`
    } else if (voltMatch) {
      value = `${voltMatch[1]}V`
    }

    // Package: standard SMD/THT sizes
    const pkgMatch = d.match(/\b(0201|0402|0603|0805|1206|1210|1812|2010|2512|SOT-23(?:-\d+)?|SOT-\d+|SOP-\d+|SOIC-\d+|DIP-\d+|QFN-\d+|QFP-\d+|BGA-\d+|TO-\d+|DO-\d+|Through\s*Hole|SMD|SMT)\b/i)
    const package_ = pkgMatch ? pkgMatch[1] : null

    return { value, package: package_ }
  }

  // Issue #6: Validate Value field — reject garbage (part numbers, IDs, product names)
  function isValidValue(val: string | null | undefined): boolean {
    if (!val) return false
    const v = val.trim()
    // Reject if looks like: C-code, pure numeric ID, MPN-like string with many chars
    if (/^C\d+$/i.test(v)) return false           // LCSC C-code
    if (/^\d{6,}$/.test(v)) return false           // internal numeric ID
    if (/^[A-Z0-9]{8,}$/i.test(v) && !/^[\d.]+\s*(ohm|pf|nf|uf|nh|uh|mh|v|k|m|r)/i.test(v)) return false // long alphanumeric MPN-like
    if ((v.includes('_') || v.includes('-')) && v.length > 12) return false  // slug/product-name-like
    return true
  }

  // Throttle state — shared across all enrichItem calls in this import run
  let lastMouserCallAt = 0
  const MOUSER_MIN_INTERVAL_MS = 600 // max ~1.5 req/sec

  // Normalize supplier column value → canonical key
  function normalizeSupplier(raw: string | null | undefined): 'lcsc' | 'mouser' | 'digikey' | null {
    if (!raw) return null
    const s = raw.toLowerCase().replace(/[^a-z]/g, '')
    if (s.includes('lcsc')) return 'lcsc'
    if (s.includes('mouser')) return 'mouser'
    if (s.includes('digikey')) return 'digikey'
    return null // unsupported: tokopedia, aliexpress, waveshare, dll
  }

  // Helper for Auto-Enrichment (LCSC/Mouser/Digikey)
  async function enrichItem(sid: string, rawPn: string, lcsc?: string, links?: string, supplierCol?: string, stockCode?: string) {
    const pn = cleanPN(rawPn, stockCode ?? lcsc) ?? rawPn

    // Issue #3: skip internal/custom part codes — not searchable on any supplier
    if (!lcsc && isInternalPartCode(pn)) {
      console.log(`[Auto-Enrich] Skipping internal part code: ${pn} (SID: ${sid})`)
      return false
    }

    // Skip if item has zero supplier signals — no supplier col, no links, no LCSC code
    // These are custom/physical parts (cables, busbars, custom hardware) with no online presence
    const hasSupplierSignal = !!(lcsc || supplierCol?.trim() || links?.trim())
    if (!hasSupplierSignal) {
      console.log(`[Auto-Enrich] Skipping — no supplier/links/LCSC for: ${pn} (SID: ${sid})`)
      return false
    }

    console.log(`[Auto-Enrich] Initiating for Part: ${pn} (SID: ${sid}, LCSC: ${lcsc || 'N/A'})`);
    try {
      let found: any = null;
      let source = "";

      // Detect preferred supplier — kolom Supplier(s) sebagai primary, URL scan sebagai fallback
      type SearchTarget = 'lcsc' | 'mouser' | 'digikey'
      let preferred: SearchTarget | null = normalizeSupplier(supplierCol)
      let detectedFrom = 'supplier column'

      if (!preferred) {
        // Fallback: scan URL
        const linkStr = (links || '').toLowerCase()
        const prefersLcsc    = linkStr.includes('lcsc.com')
        const prefersMouser  = linkStr.includes('mouser.com') || linkStr.includes('mouser.co')
        const prefersDigikey = linkStr.includes('digikey.com') || linkStr.includes('digikey.co')
        preferred = prefersLcsc ? 'lcsc' : prefersMouser ? 'mouser' : prefersDigikey ? 'digikey' : null
        detectedFrom = preferred ? 'url scan' : 'none (default)'
      }

      // Issue #7: Unsupported supplier (Tokopedia, AliExpress, dll) — no API but still save URL
      if (supplierCol && !preferred) {
        console.log(`[Auto-Enrich] Unsupported supplier "${supplierCol}" — saving URL only for ${pn}`)
        const supKey = supplierCol.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
        // Find URL matching the supplier domain if possible, else first URL
        const allUrls = (links || '').split(/[;\s]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
        const domainHints: Record<string, string[]> = {
          tokopedia: ['tokopedia.com'],
          aliexpress: ['aliexpress.com', 'aliexpress.us'],
          waveshare: ['waveshare.com'],
          shopee: ['shopee.co'],
          lazada: ['lazada.co'],
        }
        const hints = Object.entries(domainHints).find(([k]) => supKey.includes(k))?.[1] ?? []
        const matchedUrl = hints.length
          ? allUrls.find(u => hints.some(d => u.toLowerCase().includes(d))) ?? allUrls[0]
          : allUrls[0]
        if (matchedUrl) {
          // Use "other" key so UI SupplierPnBadges renders the link button
          const spMap: Record<string, unknown> = {
            other: { pn: pn, url: matchedUrl, price: null, quantity_available: null }
          }
          await prisma.item.update({
            where: { stableId: sid },
            data: {
              links: matchedUrl,
              supplierPrices: JSON.stringify(spMap),
              suppliers: supplierCol.trim(),
            }
          })
          console.log(`[Auto-Enrich] Saved URL for unsupported supplier "${supplierCol}": ${matchedUrl}`)
          return true
        }
        return false
      }

      // If supplier explicitly set from column → only search that supplier, no fallback (save API quota)
      // If detected from URL scan → allow fallback across suppliers
      const strictSupplier = detectedFrom === 'supplier column'
      const order: SearchTarget[] = strictSupplier && preferred
        ? [preferred]                                          // single supplier, no fallback
        : preferred === 'lcsc'
          ? ['lcsc', 'mouser', 'digikey']
          : preferred === 'mouser'
            ? ['mouser', 'lcsc', 'digikey']
            : preferred === 'digikey'
              ? ['digikey', 'lcsc', 'mouser']
              : ['lcsc', 'mouser', 'digikey']

      // Collect unsupported supplier URLs from links (AliExpress, Tokopedia, etc.) to preserve
      const unsupportedDomains: Record<string, string[]> = {
        tokopedia:  ['tokopedia.com'],
        aliexpress: ['aliexpress.com', 'aliexpress.us'],
        shopee:     ['shopee.co'],
        lazada:     ['lazada.co'],
      }
      const allLinkUrls = (links || '').split(/[;\s]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
      const extraUrls: { key: string; url: string }[] = []
      for (const [key, domains] of Object.entries(unsupportedDomains)) {
        const url = allLinkUrls.find(u => domains.some(d => u.toLowerCase().includes(d)))
        if (url) extraUrls.push({ key, url })
      }

      console.log(`[Auto-Enrich] Preferred: ${preferred || 'none'} (from ${detectedFrom}) | Order: ${order.join(' → ')}${extraUrls.length ? ` | Extra URLs: ${extraUrls.map(e => e.key).join(',')}` : ''}`)

      // No supported supplier found anywhere (URL scan + column both null), BUT have unsupported URLs
      // → skip auto-enrich entirely, just save the URL so UI shows blue link button
      if (!preferred && !supplierCol && !lcsc && extraUrls.length > 0) {
        // Use "other" key for all unsupported URLs so UI renders the link button
        const firstUrl = extraUrls[0].url
        const fallbackMap: any = {
          other: { pn: pn, url: firstUrl, price: null, quantity_available: null }
        }
        await prisma.item.update({
          where: { stableId: sid },
          data: {
            links: extraUrls.map(e => e.url).join(';'),
            supplierPrices: JSON.stringify(fallbackMap),
          }
        })
        console.log(`[Auto-Enrich] Only unsupported supplier URLs for "${pn}" — saved URL, skipped enrich`)
        return true
      }

      // LCSC by C-code first (if available) regardless of order
      let discoveredLcsc: string | null = lcsc || null
      if (lcsc) {
        console.log(`[Auto-Enrich] Querying LCSC by C-code: ${lcsc}`);
        // Also fetch search result to get marketplace stock (lookup returns JLCPCB warehouse stock which can be 0)
        const [lookupRes, searchRes] = await Promise.all([
          api.post("/lcsc/lookup", { items: [{ lcsc, qty: 1 }] }),
          api.post("/lcsc/search", { keyword: lcsc, limit: 1 }),
        ])
        found = lookupRes.data?.items?.[0];
        const mktItem = searchRes.data?.items?.[0]
        if (found) {
          source = "lcsc";
          const marketplaceStock = mktItem?.quantity_available
          if ((!found.quantity_available || found.quantity_available === 0) && marketplaceStock) {
            found = { ...found, quantity_available: marketplaceStock }
            console.log(`[Auto-Enrich] Using marketplace stock for ${lcsc}: ${marketplaceStock}`)
          }
          console.log(`[Auto-Enrich] Found on LCSC: ${found.mpn}, Price: ${found.price}, Stock: ${found.quantity_available}`);
        } else if (mktItem) {
          // Sidecar miss (marketplace-only part) — use jlcsearch result already fetched in parallel
          found = mktItem
          source = 'lcsc'
          console.log(`[Auto-Enrich] Sidecar miss for ${lcsc} — using jlcsearch result: ${found.mpn}, Stock: ${found.quantity_available}`)
        }
      }

      // Search by MPN/keyword following preferred order
      for (const target of order) {
        if (found) break
        if (!pn) continue
        try {
          if (target === 'lcsc') {
            console.log(`[Auto-Enrich] → Trying LCSC search by keyword: "${pn}"`);
            const searchRes = await api.post("/lcsc/search", { keyword: pn, limit: 5 });
            const lcscItems: any[] = searchRes.data?.items ?? [];
            console.log(`[Auto-Enrich]   LCSC search results (${lcscItems.length}): ${lcscItems.map((r: any) => r.mpn).join(', ') || 'none'}`);
            const match = lcscItems.find((r: any) => r.mpn?.toLowerCase() === pn.toLowerCase()) ?? lcscItems[0];
            if (match?.lcsc) {
              console.log(`[Auto-Enrich]   Best match: ${match.mpn} (${match.lcsc}), doing full lookup...`);
              const lookupRes = await api.post("/lcsc/lookup", { items: [{ lcsc: match.lcsc, qty: 1 }] });
              found = lookupRes.data?.items?.[0];
              if (found) {
                source = 'lcsc';
                discoveredLcsc = match.lcsc
                // Prefer marketplace stock (from search) over JLCPCB warehouse stock (from lookup)
                // because lookup uses JLC Business SDK which returns SMT assembly stock, not LCSC marketplace stock
                if ((!found.quantity_available || found.quantity_available === 0) && match.quantity_available) {
                  found = { ...found, quantity_available: match.quantity_available }
                  console.log(`[Auto-Enrich]   Using marketplace stock from search: ${match.quantity_available} (lookup returned 0)`)
                }
                console.log(`[Auto-Enrich]   LCSC lookup OK: mpn=${found.mpn} value=${found.value} voltageRating=${found.voltageRating} tolerance=${found.tolerance} package=${found.package} price=${found.price} stock=${found.quantity_available}`);
              }
            } else {
              console.log(`[Auto-Enrich]   No LCSC match found`);
            }
          } else if (target === 'mouser') {
            console.log(`[Auto-Enrich] → Trying Mouser search by keyword: "${pn}"`);
            // Throttle: enforce minimum interval between Mouser calls
            const now = Date.now()
            const wait = MOUSER_MIN_INTERVAL_MS - (now - lastMouserCallAt)
            if (wait > 0) await new Promise(r => setTimeout(r, wait))
            lastMouserCallAt = Date.now()
            // Retry up to 3x on 502/503/429 with exponential backoff
            let mousRes: any = null
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                if (attempt > 0) {
                  const backoff = 2000 * Math.pow(2, attempt - 1) // 2s, 4s
                  console.warn(`[Auto-Enrich]   Mouser retry ${attempt}/2, waiting ${backoff}ms...`)
                  await new Promise(r => setTimeout(r, backoff))
                }
                mousRes = await api.post("/mouser/search", { keyword: pn, qty: 1 })
                lastMouserCallAt = Date.now()
                break
              } catch (e: any) {
                const status = e?.response?.status
                if (status === 502 || status === 503 || status === 429) {
                  console.warn(`[Auto-Enrich]   Mouser ${status} on attempt ${attempt + 1}`)
                  if (attempt === 2) console.warn(`[Auto-Enrich]   Mouser giving up after 3 attempts, falling back to next supplier`)
                } else { throw e }
              }
            }
            found = mousRes?.data?.items?.[0]
            if (found) {
              source = 'mouser';
              console.log(`[Auto-Enrich]   Mouser OK: mpn=${found.mpn} value=${found.value} voltageRating=${found.voltageRating} tolerance=${found.tolerance} price=${found.price}`);
            } else {
              console.log(`[Auto-Enrich]   Mouser: no result (quota exceeded or not found)`);
            }
          } else if (target === 'digikey') {
            console.log(`[Auto-Enrich] → Trying DigiKey search by keyword: "${pn}"`);
            const res = await api.post("/digikey/search", { keyword: pn, qty: 1 });
            found = res.data?.items?.[0];
            if (found) {
              source = 'digikey';
              console.log(`[Auto-Enrich]   DigiKey OK: mpn=${found.mpn} value=${found.value} voltageRating=${found.voltageRating} tolerance=${found.tolerance} price=${found.price}`);
            } else {
              console.log(`[Auto-Enrich]   DigiKey: no result`);
            }
          }
        } catch (e: any) {
          console.warn(`[Auto-Enrich]   ${target} error: ${e.message}`)
        }
      }

      // Specs enrichment: found from Mouser but specs incomplete → enrich with LCSC
      // Skip for DigiKey source — DigiKey specs call below is more authoritative
      if (found && source === 'mouser' && !lcsc && pn && (!found.voltageRating || !found.value || !found.tolerance)) {
        try {
          console.log(`[Auto-Enrich] Specs incomplete from ${source}, enriching with LCSC search for: ${pn}`);
          const searchRes = await api.post("/lcsc/search", { keyword: pn, limit: 5 });
          const lcscItems: any[] = searchRes.data?.items ?? [];
          const lcscMatch = lcscItems.find((r: any) =>
            r.mpn?.toLowerCase() === (found.mpn || pn).toLowerCase()
          ) ?? lcscItems[0];
          if (lcscMatch?.lcsc) {
            const lookupRes = await api.post("/lcsc/lookup", { items: [{ lcsc: lcscMatch.lcsc, qty: 1 }] });
            const fullData = lookupRes.data?.items?.[0];
            if (fullData) {
              console.log(`[Auto-Enrich] LCSC enrich success for ${pn}: value=${fullData.value}, voltageRating=${fullData.voltageRating}, tolerance=${fullData.tolerance}`);
              found = {
                ...found,
                value:        fullData.value        ?? found.value,
                voltageRating: fullData.voltageRating ?? found.voltageRating,
                tolerance:    fullData.tolerance    ?? found.tolerance,
                package:      fullData.package      ?? found.package,
                manufacturer: fullData.manufacturer ?? found.manufacturer,
                category:     fullData.category     ?? found.category,
                description:  fullData.description  ?? found.description,
              };
            }
          }
        } catch (e: any) {
          console.warn(`[Auto-Enrich] LCSC spec enrichment failed for ${pn}:`, e.message);
        }
      }

      if (found) {
        const currentItem = await prisma.item.findUnique({ where: { stableId: sid }, select: { productName: true } })

        console.log(`[enrichItem] found from ${source}:`, JSON.stringify({
          mpn: found.mpn, manufacturer: found.manufacturer, description: found.description,
          package: found.package, category: found.category, value: found.value,
          voltageRating: found.voltageRating, tolerance: found.tolerance,
          price: found.price, quantity_available: found.quantity_available
        }, null, 2));

        // Specs enrichment: if source != digikey OR specs blob missing, hit /digikey/specs
        let specsData: { specs?: string; value?: string; voltageRating?: string; tolerance?: string; package?: string } = {
          specs: found.specs || undefined,
          value: found.value || undefined,
          voltageRating: found.voltageRating || undefined,
          tolerance: found.tolerance || undefined,
          package: found.package || undefined,
        };
        const mpnForSpecs = found.mpn || pn;
        if (mpnForSpecs && (source !== 'digikey' || !found.specs)) {
          try {
            console.log(`[Auto-Enrich] Fetching DigiKey specs for: ${mpnForSpecs}`);
            const dkRes = await api.post('/digikey/specs', { mpn: mpnForSpecs });
            if (dkRes.data?.specs) {
              specsData = {
                specs: dkRes.data.specs,
                value: dkRes.data.value || specsData.value,
                voltageRating: dkRes.data.voltageRating || specsData.voltageRating,
                tolerance: dkRes.data.tolerance || specsData.tolerance,
                package: dkRes.data.package || specsData.package,
              };
              console.log(`[Auto-Enrich] DigiKey specs OK for ${mpnForSpecs}: ${Object.keys(JSON.parse(dkRes.data.specs)).length} params`);
            }
          } catch (e: any) {
            console.warn(`[Auto-Enrich] DigiKey specs failed for ${mpnForSpecs}: ${e.message}`);
          }
        }

        const stockNum = found.quantity_available != null ? Number(found.quantity_available) : null;
        const spMap: any = {};
        spMap[source] = {
          pn: (source === 'lcsc' ? lcsc : found.mpn) || pn,
          price: found.price || null,
          url: found.url || null,
          quantity_available: stockNum,
          priceBreaks: found.priceBreaks || []
        };
        // Preserve unsupported supplier URLs (AliExpress, Tokopedia, etc.) under "other" key so UI renders button
        if (extraUrls.length > 0 && !spMap['other']) {
          spMap['other'] = { pn: pn, url: extraUrls[0].url, price: null, quantity_available: null }
        }
        // Preserve secondary supported supplier URLs from original links (URL-only, no price/stock)
        // e.g. strictSupplier=digikey but links also has Mouser URL → keep mouser badge in UI
        const supportedDomains: Record<string, string[]> = {
          lcsc:    ['lcsc.com'],
          mouser:  ['mouser.com', 'mouser.co'],
          digikey: ['digikey.com', 'digikey.co'],
        }
        for (const [supKey, domains] of Object.entries(supportedDomains)) {
          if (supKey === source || spMap[supKey]) continue
          const secUrl = allLinkUrls.find(u => domains.some(d => u.toLowerCase().includes(d)))
          if (secUrl) spMap[supKey] = { pn: found.mpn || pn, url: secUrl, price: null, quantity_available: null }
        }

        // Auto-fix partNumber: kalau sekarang C-code (e.g. "C114767") tapi LCSC return MPN asli → update
        const isCcode = (v: string) => /^C\d+$/i.test(v.trim())
        const realMpn = found.mpn && !isCcode(found.mpn) && (
          isCcode(rawPn) ||        // C-code replaced by real MPN
          !rawPn?.trim()           // rawPn empty — fill from LCSC
        ) ? found.mpn : null
        if (realMpn) console.log(`[Auto-Enrich] Updating partNumber: "${rawPn || '(empty)'}" → "${realMpn}" (real MPN from LCSC)`)

        const supplierLabel = source === 'lcsc' ? 'LCSC' : source === 'mouser' ? 'Mouser' : source === 'digikey' ? 'DigiKey' : source
        console.log(`[Auto-Enrich] Updating Database for SID: ${sid} with fresh data from ${supplierLabel} (Stock: ${stockNum})`);
        await prisma.item.update({
          where: { stableId: sid },
          data: {
            priceMin: found.price || undefined,
            priceCurrency: "USD",
            suppliers: supplierLabel,
            stockQty: stockNum ?? undefined,
            links: (() => {
              const parts = [
                found.url,
                found.datasheet,
                ...extraUrls.map(e => e.url),
              ].filter(Boolean)
              return parts.length ? parts.join(';') : undefined
            })(),
            supplierPrices: JSON.stringify(spMap),
            // save discovered LCSC C-code so Price Sync can look it up later
            ...(discoveredLcsc ? { stockCode: discoveredLcsc } : {}),
            // replace C-code with real MPN if found via LCSC
            ...(realMpn ? { partNumber: realMpn } : {}),
            // specs blob (DigiKey Parameters JSON)
            ...(specsData.specs ? { specs: specsData.specs } : {}),
            // fill productName if currently empty (ALT items often have no product name in old export)
            ...(!currentItem?.productName && found.description ? { productName: found.description } : {}),
            // fill technical fields only if currently empty
            ...(found.description         ? { description:    found.description    } : {}),
            ...(found.manufacturer        ? { manufacturer:   found.manufacturer   } : {}),
            ...(found.category            ? { category:       found.category       } : {}),
            ...(specsData.package        ? { package:        specsData.package        } : {}),
            ...(specsData.value          ? { value:          specsData.value          } : {}),
            ...(specsData.voltageRating  ? { voltageRating:  specsData.voltageRating  } : {}),
            ...(specsData.tolerance      ? { tolerance:      specsData.tolerance      } : {}),
          }
        });
        return true;
      } else {
        console.warn(`[Auto-Enrich] No data found on any supplier for: ${pn}`)
        // Still save unsupported supplier URLs (AliExpress, Tokopedia, etc.) even when enrich fails
        if (extraUrls.length > 0) {
          const fallbackMap: any = {}
          for (const { key, url } of extraUrls) {
            fallbackMap[key] = { pn: pn, url, price: null, quantity_available: null }
          }
          await prisma.item.update({
            where: { stableId: sid },
            data: {
              links: extraUrls.map(e => e.url).join(';'),
              supplierPrices: JSON.stringify(fallbackMap),
            }
          })
          console.log(`[Auto-Enrich] Saved ${extraUrls.length} unsupported URL(s) for: ${pn}`)
          return true
        }
      }
    } catch (e: any) {
      console.error(`[Auto-Enrich] Critical failure for ${pn}:`, e.message);
    }
    return false;
  }

  // 0. Detect Migration Type
  const isLegacyFormat = wb.SheetNames.includes('UniqueItems') && wb.SheetNames.includes('ItemUsage')

  if (isLegacyFormat) {
    // --- LEGACY MIGRATION PATH (Enhanced Master BOM) ---
    const uniqueItemsWs = wb.Sheets['UniqueItems']!
    const itemUsageWs = wb.Sheets['ItemUsage']!
    
    const legacyItems = XLSX.utils.sheet_to_json<Record<string, any>>(uniqueItemsWs, { defval: '' })
    const legacyUsage = XLSX.utils.sheet_to_json<Record<string, any>>(itemUsageWs, { defval: '' })

    // A. Migrate UniqueItems -> Master Inventory
    for (const row of legacyItems) {
      const sid = String(row['Stable ID'] || '').trim()
      if (!sid) continue

      const rawPn = strOrNull(row['Part Number'])
      const legacyStockCode = strOrNull(row['Stock Code'])
      const legacyLcscCol = strOrNull(row['LCSC Code'])
      const possibleLinks = [
        row['Link(s)'],
        row['links'],
        row['Link'],
        row['Product URL'],
        row['Datasheet URL'],
        row['Remark'],
        row['remark'],
      ].map(l => strOrNull(l)).filter(Boolean) as string[]
      const linkStr = possibleLinks.length > 0 ? Array.from(new Set(possibleLinks)).join(';') : null
      const lcscFromUrl = possibleLinks.join(' ').match(/lcsc\.com\/[^\s"']*\/(C\d+)/i)?.[1] ?? null
      const isLcscCode = (v: string | null) => !!v && /^C\d+$/i.test(v.trim())
      const legacyLcsc = isLcscCode(legacyLcscCol) ? legacyLcscCol : isLcscCode(legacyStockCode) ? legacyStockCode : lcscFromUrl
      const pn = cleanPN(rawPn, legacyStockCode ?? legacyLcsc)

      if (!dryRun) {
        try {
          const priceVal = numOrNull(row['Price (min)'])
          const suppliers = strOrNull(row['Supplier(s)'])

          await prisma.item.upsert({
            where: { stableId: sid },
            update: {
              partNumber: pn,
              productName: strOrNull(row['Product Name']),
              value: strOrNull(row['Value (canonical)']),
              description: strOrNull(row['Description']),
              category: strOrNull(row['Category']),
              package: strOrNull(row['Package (canonical)']),
              manufacturer: strOrNull(row['Manufacturer']),
              suppliers: suppliers,
              priceMin: priceVal,
              priceCurrency: 'USD',
              links: linkStr,
            },
            create: {
              stableId: sid,
              partNumber: pn,
              productName: strOrNull(row['Product Name']),
              value: strOrNull(row['Value (canonical)']),
              description: strOrNull(row['Description']),
              category: strOrNull(row['Category']),
              package: strOrNull(row['Package (canonical)']),
              manufacturer: strOrNull(row['Manufacturer']),
              suppliers: suppliers,
              priceMin: priceVal,
              priceCurrency: 'USD',
              links: linkStr,
            }
          })

          if (autoEnrich && pn) {
            if (await enrichItem(sid, pn, legacyLcsc || undefined, linkStr || undefined, suppliers || undefined)) itemsEnriched++;
          }
        } catch (e) { errors.push(`Legacy Item ${sid}: ${String(e)}`) }
      }
      itemsImported++
    }

    // B. Detect Products from Source Files
    const productNames = Array.from(new Set(legacyUsage.map(u => String(u['Source File'] || '').trim()).filter(Boolean)))
    for (const name of productNames) {
      if (!dryRun) {
        try {
          await prisma.product.upsert({
            where: { name },
            update: {},
            create: { name }
          })
        } catch (e) { errors.push(`Legacy Product ${name}: ${String(e)}`) }
      }
      productsImported++
    }

    // C. Map Usage -> ProductItems (BOM)
    for (const row of legacyUsage) {
      const sid = String(row['Stable ID'] || '').trim()
      const sourceFile = String(row['Source File'] || '').trim()
      if (!sid || !sourceFile) continue

      if (!dryRun) {
        try {
          const product = await prisma.product.findUnique({ where: { name: sourceFile } })
          if (!product) continue
          await prisma.productItem.upsert({
            where: { productId_stableId: { productId: product.id, stableId: sid } },
            update: {
              quantitySum: numOrNull(row['Quantity Sum']),
              references: strOrNull(row['References']),
            },
            create: {
              productId: product.id,
              stableId: sid,
              quantitySum: numOrNull(row['Quantity Sum']),
              references: strOrNull(row['References']),
            }
          })
        } catch (e) { errors.push(`Legacy BOM ${sourceFile}/${sid}: ${String(e)}`) }
      }
      bomRowsImported++
    }
  } else {
    // --- STANDARD BACKUP PATH (Current Logic) ---
    // 1. Data Structures for Dry Run & Validation
    const sheetItems: string[] = []
    const sheetProducts: string[] = []
    const sheetSets: string[] = []

    // 2. Scan Master Items
    const itemSheetName = wb.SheetNames.find(n => /^items?$/i.test(n) || /master.?bom/i.test(n)) ?? wb.SheetNames[0]
    if (itemSheetName) {
      const ws = wb.Sheets[itemSheetName]!
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      for (const row of rows) {
        // Universal Mapping for Items
        // Universal Mapping for Items (Case-insensitive helper)
        const getVal = (keys: string[]) => {
          for (const k of keys) {
            const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? row[k.replace(/ /g, '_')] ?? row[k.replace(/ /g, '')];
            if (val !== undefined && val !== null && val !== '') return val;
          }
          return null;
        };

        const sid = String(getVal(['Stable ID', 'stable_id', 'SID']) || '').trim();
        if (sid) {
          sheetItems.push(sid);
          const rawPn = strOrNull(getVal(['Part Number', 'part_number', 'MPN']));
          const stockCode = strOrNull(getVal(['Stock Code', 'StockCode']));
          const lcscColRaw = strOrNull(getVal(['LCSC Code', 'LcscCode']));
          // Extract C-code from LCSC URL if no dedicated column (e.g. https://www.lcsc.com/product-detail/C23140.html)
          const allLinkVals = [getVal(['Product URL', 'ProductURL']), getVal(['Link(s)', 'links', 'Link']), getVal(['Remark', 'remark', 'Remarks'])].filter(Boolean).join(' ')
          const lcscFromUrl = allLinkVals.match(/lcsc\.com\/[^\s"']*\/(C\d+)/i)?.[1] ?? null
          // Only use as LCSC C-code if it actually matches C-code pattern (C followed by digits)
          const isLcscCode = (v: string | null) => !!v && /^C\d+$/i.test(v.trim())
          const lcsc = isLcscCode(lcscColRaw) ? lcscColRaw : isLcscCode(stockCode) ? stockCode : lcscFromUrl
          const pn = cleanPN(rawPn, stockCode ?? lcsc);
          const suppliers = strOrNull(getVal(['Supplier(s)', 'suppliers', 'Supplier']));
          const priceVal = numOrNull(getVal(['Price (min)', 'price_min', 'Price', 'UnitPrice']));

          // Join multiple potential link columns
          const possibleLinks = [
            getVal(['Product URL', 'ProductURL']),
            getVal(['Datasheet URL', 'DatasheetURL']), 
            getVal(['Link(s)', 'links', 'Link'])
          ].filter(Boolean) as string[];
          const linkStr = possibleLinks.length > 0 ? Array.from(new Set(possibleLinks)).join(';') : null;

          if (!dryRun) {
            try {
              const rawSupPrices = getVal(['supplier_prices', 'SupplierPrices']);
              let formattedSupPrices = strOrNull(rawSupPrices);
              if (formattedSupPrices) {
                try { JSON.parse(formattedSupPrices) } catch { formattedSupPrices = null }
              }

              // Helper: find URL matching a specific supplier domain from combined link string
              const findSupplierUrl = (allLinks: string | null, supKey: string): string | null => {
                if (!allLinks) return null
                const domainMap: Record<string, string[]> = {
                  lcsc:    ['lcsc.com'],
                  mouser:  ['mouser.com', 'mouser.co'],
                  digikey: ['digikey.com', 'digikey.co'],
                  tokopedia: ['tokopedia.com'],
                  aliexpress: ['aliexpress.com', 'aliexpress.us'],
                  waveshare: ['waveshare.com'],
                }
                const domains = domainMap[supKey] ?? []
                const urls = allLinks.split(/[;\s]+/).map(u => u.trim()).filter(Boolean)
                for (const domain of domains) {
                  const match = urls.find(u => u.toLowerCase().includes(domain))
                  if (match) return match
                }
                return urls[0] ?? null // fallback: first URL
              }

              // Reconstruct supplierPrices — use normalizeSupplier() for accurate matching (handles "Digi-Key" etc.)
              if (!formattedSupPrices && pn && suppliers) {
                const allLinksRaw = [
                  strOrNull(getVal(['Product URL', 'ProductURL'])),
                  strOrNull(getVal(['Link(s)', 'links', 'Link'])),
                  strOrNull(getVal(['Datasheet URL', 'DatasheetURL'])),
                ].filter(Boolean).join(';')

                // Try each supplier listed (e.g. "Digi-Key; Mouser")
                const supplierList = suppliers.split(/[;,]/).map(s => s.trim()).filter(Boolean)
                const spMap: any = {}
                for (const sup of supplierList) {
                  const supKey = normalizeSupplier(sup)
                  if (supKey) {
                    const supplierUrl = findSupplierUrl(allLinksRaw, supKey)
                    spMap[supKey] = {
                      pn: (supKey === 'lcsc' ? lcsc : pn) || pn,
                      url: supplierUrl,
                      price: priceVal,
                      quantity_available: numOrNull(getVal(['Stock Qty', 'stock_qty']))
                    }
                  } else {
                    // Unsupported supplier (Tokopedia, AliExpress, etc.) — save URL as-is
                    const supKeyRaw = sup.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const supplierUrl = findSupplierUrl(allLinksRaw, supKeyRaw) ?? allLinksRaw.split(';')[0]?.trim() ?? null
                    if (supplierUrl) {
                      spMap[supKeyRaw] = { pn: pn, url: supplierUrl, price: priceVal, quantity_available: null }
                    }
                  }
                }
                if (Object.keys(spMap).length > 0) {
                  formattedSupPrices = JSON.stringify(spMap)
                }
              }

              // Issue #4 & #5: Extract Value/Package from Description as fallback
              const descRaw = strOrNull(getVal(['Description', 'description', 'Description2']))
              const descExtracted = extractFromDescription(descRaw)

              // Issue #6: Validate Value — reject garbage (part numbers, IDs, product names)
              const rawValue = strOrNull(getVal(['Value (canonical)', 'value', 'Value']))
              const cleanValue = isValidValue(rawValue) ? rawValue : (descExtracted.value ?? null)

              const rawPackage = strOrNull(getVal(['Package (canonical)', 'package', 'Footprint']))
              const cleanPackage = rawPackage || descExtracted.package

              await prisma.item.upsert({
                where: { stableId: sid },
                update: {
                  partNumber: pn,
                  productName: strOrNull(getVal(['Product Name', 'product_name', 'Description'])),
                  value: cleanValue,
                  description: descRaw,
                  category: strOrNull(getVal(['Category', 'category'])),
                  package: cleanPackage,
                  manufacturer: strOrNull(getVal(['Manufacturer', 'manufacturer'])),
                  suppliers: suppliers,
                  stockCode: lcsc,
                  priceMin: priceVal,
                  priceCurrency: strOrNull(getVal(['Price Currency', 'price_currency', 'Currency'])) ?? 'USD',
                  stockQty: numOrNull(getVal(['Stock Qty', 'stock_qty', 'StockQty'])),
                  whQty: numOrNull(getVal(['Warehouse Qty', 'wh_qty'])),
                  whLocation: strOrNull(getVal(['Warehouse Location', 'wh_location'])),
                  alternatives: strOrNull(getVal(['Alternatives', 'alternatives'])),
                  links: linkStr,
                  supplierPrices: formattedSupPrices,
                },
                create: {
                  stableId: sid,
                  partNumber: pn,
                  productName: strOrNull(getVal(['Product Name', 'product_name', 'Description'])),
                  value: cleanValue,
                  description: descRaw,
                  category: strOrNull(getVal(['Category', 'category'])),
                  package: cleanPackage,
                  manufacturer: strOrNull(getVal(['Manufacturer', 'manufacturer'])),
                  suppliers: suppliers,
                  stockCode: lcsc,
                  priceMin: priceVal,
                  priceCurrency: strOrNull(getVal(['Price Currency', 'price_currency', 'Currency'])) ?? 'USD',
                  stockQty: numOrNull(getVal(['Stock Qty', 'stock_qty', 'StockQty'])),
                  whQty: numOrNull(getVal(['Warehouse Qty', 'wh_qty'])),
                  whLocation: strOrNull(getVal(['Warehouse Location', 'wh_location'])),
                  alternatives: strOrNull(getVal(['Alternatives', 'alternatives'])),
                  links: linkStr,
                  supplierPrices: formattedSupPrices,
                },
              });

              // AGGRESSIVE ENRICHMENT: If autoEnrich is ON, always prioritize internet data for stock & price
              if (autoEnrich) {
                if (await enrichItem(sid, rawPn || '', lcsc || undefined, linkStr || undefined, suppliers || undefined, stockCode || undefined)) itemsEnriched++;
              }
            } catch (e) { errors.push(`Item ${sid}: ${String(e)}`) }
          }
          itemsImported++;
        }
      }
    }

    // 3. Scan Products (PCBs)
    const prodSheetName = wb.SheetNames.find(n => /^products?$/i.test(n))
    if (prodSheetName) {
      const ws = wb.Sheets[prodSheetName]!
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      for (const row of rows) {
        const name = String(row['Name'] ?? row['name'] ?? row['ProductName'] ?? '').trim()
        if (name) {
          sheetProducts.push(name)
          if (!dryRun) {
            try {
              await prisma.product.upsert({
                where: { name },
                update: { slug: strOrNull(row['Slug'] ?? row['slug']) },
                create: { name, slug: strOrNull(row['Slug'] ?? row['slug']) },
              })
              productsImported++
            } catch (e) { errors.push(`Product ${name}: ${String(e)}`) }
          } else { productsImported++ }
        }
      }
    }

    // 4. Scan ProductItems (BOM)
    const bomSheetName = wb.SheetNames.find(n => /product.?items?|bom.?rows?|bom$/i.test(n))
    if (bomSheetName) {
      const ws = wb.Sheets[bomSheetName]!
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      for (const row of rows) {
        const productName = String(row['Product'] ?? row['product_name'] ?? row['ProductName'] ?? row['Product'] ?? '').trim()
        const sid = String(row['Stable ID'] ?? row['stable_id'] ?? row['StableId'] ?? row['SID'] ?? '').trim()
        if (!productName || !sid) continue

        // Validation
        if (!sheetItems.includes(sid)) warnings.push(`BOM Row: Item "${sid}" not found in Items sheet.`)
        if (!sheetProducts.includes(productName)) warnings.push(`BOM Row: PCB "${productName}" not found in Products sheet.`)

        if (!dryRun) {
          try {
            const product = await prisma.product.findUnique({ where: { name: productName } })
            if (!product) { errors.push(`BOM: product "${productName}" not in DB`); continue }
            await prisma.productItem.upsert({
              where: { productId_stableId: { productId: product.id, stableId: sid } },
              update: {
                quantitySum: numOrNull(row['Quantity'] ?? row['quantity_sum'] ?? row['Qty']),
                references: strOrNull(row['References'] ?? row['references']),
                notes: strOrNull(row['Notes'] ?? row['notes']),
              },
              create: {
                productId: product.id,
                stableId: sid,
                quantitySum: numOrNull(row['Quantity'] ?? row['quantity_sum'] ?? row['Qty']),
                references: strOrNull(row['References'] ?? row['references']),
                notes: strOrNull(row['Notes'] ?? row['notes']),
              },
            })
            bomRowsImported++
          } catch (e) { errors.push(`BOM row ${productName}/${sid}: ${String(e)}`) }
        } else { bomRowsImported++ }
      }
    }

    // 5. Scan ConfigSets (Products)
    const setSheetName = wb.SheetNames.find(n => /config.?sets?|sets?$/i.test(n))
    if (setSheetName) {
      const ws = wb.Sheets[setSheetName]!
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      for (const row of rows) {
        const name = String(row['Name'] ?? row['name'] ?? row['SetName'] ?? '').trim()
        if (name) {
          sheetSets.push(name)
          if (!dryRun) {
            try {
              await prisma.configSet.upsert({
                where: { name },
                update: { notes: strOrNull(row['Notes'] ?? row['notes']) },
                create: {
                  name,
                  notes: strOrNull(row['Notes'] ?? row['notes']),
                  createdBy: strOrNull(row['Created By'] ?? row['created_by'] ?? row['CreatedBy']),
                },
              })
              setsImported++
            } catch (e) { errors.push(`Set ${name}: ${String(e)}`) }
          } else { setsImported++ }
        }
      }
    }

    // 6. Scan ConfigSetItems (Set Composition)
    const setItemSheetName = wb.SheetNames.find(n => /config.?set.?items?|set.?items?|composition$/i.test(n))
    if (setItemSheetName) {
      const ws = wb.Sheets[setItemSheetName]!
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      for (const row of rows) {
        const setName = String(row['Set Name'] ?? row['set_name'] ?? row['BundleName'] ?? '').trim()
        const productName = String(row['Main Product'] ?? row['product_name'] ?? row['ProductName'] ?? '').trim()
        if (!setName || !productName) continue

        // Validation
        if (!sheetSets.includes(setName)) warnings.push(`Set Composition: Bundle "${setName}" not found in Sets sheet.`)
        if (!sheetProducts.includes(productName)) warnings.push(`Set Composition: PCB "${productName}" not found in Products sheet.`)

        if (!dryRun) {
          try {
            const [cs, prod] = await Promise.all([
              prisma.configSet.findUnique({ where: { name: setName } }),
              prisma.product.findUnique({ where: { name: productName } })
            ])
            if (!cs || !prod) { errors.push(`SetItem: "${setName}" or "${productName}" not in DB`); continue }

            await prisma.configSetItem.upsert({
              where: { setId_orderIndex: { setId: cs.id, orderIndex: numOrNull(row['Order'] ?? row['order_index'] ?? row['Index']) ?? 0 } },
              update: {
                mainProductId: prod.id,
                qty: numOrNull(row['Qty'] ?? row['qty'] ?? row['Quantity']) ?? 1,
                op: strOrNull(row['Op'] ?? row['op'] ?? row['Operation']) ?? 'set_qty'
              },
              create: {
                setId: cs.id,
                orderIndex: numOrNull(row['Order'] ?? row['order_index'] ?? row['Index']) ?? 0,
                mainProductId: prod.id,
                qty: numOrNull(row['Qty'] ?? row['qty'] ?? row['Quantity']) ?? 1,
                op: strOrNull(row['Op'] ?? row['op'] ?? row['Operation']) ?? 'set_qty'
              }
            })
            setItemsImported++
          } catch (e) { errors.push(`SetItem ${setName}/${productName}: ${String(e)}`) }
        } else { setItemsImported++ }
      }
    }

    // 7. Scan Supersets (Projects)
    const supersetSheetName = wb.SheetNames.find(n => /supersets?|projects?$/i.test(n))
    if (supersetSheetName) {
      const ws = wb.Sheets[supersetSheetName]!
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      for (const row of rows) {
        const name = String(row['Name'] ?? row['name'] ?? row['ProjectName'] ?? '').trim()
        if (name) {
          if (!dryRun) {
            try {
              await prisma.superset.upsert({
                where: { name },
                update: { notes: strOrNull(row['Notes'] ?? row['notes']) },
                create: {
                  name,
                  notes: strOrNull(row['Notes'] ?? row['notes']),
                  createdBy: strOrNull(row['Created By'] ?? row['created_by'] ?? row['CreatedBy']),
                },
              })
              supersetsImported++
            } catch (e) { errors.push(`Project ${name}: ${String(e)}`) }
          } else { supersetsImported++ }
        }
      }
    }

    // 8. Scan SupersetItems (Project Composition)
    const ssItemSheetName = wb.SheetNames.find(n => /superset.?items?|project.?items?|project.?composition$/i.test(n))
    if (ssItemSheetName) {
      const ws = wb.Sheets[ssItemSheetName]!
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      for (const row of rows) {
        const projectName = String(row['Superset Name'] ?? row['project_name'] ?? row['ProjectName'] ?? '').trim()
        const productName = String(row['Set Name'] ?? row['product_name'] ?? row['ProductName'] ?? '').trim()
        if (!projectName || !productName) continue

        if (!dryRun) {
          try {
            const [ss, cs] = await Promise.all([
              prisma.superset.findUnique({ where: { name: projectName } }),
              prisma.configSet.findUnique({ where: { name: productName } })
            ])
            if (!ss || !cs) { errors.push(`ProjectItem: "${projectName}" or "${productName}" not in DB`); continue }

            await prisma.supersetItem.upsert({
              where: { supersetId_orderIndex: { supersetId: ss.id, orderIndex: numOrNull(row['Order'] ?? row['order_index'] ?? row['Index']) ?? 0 } },
              update: {
                setId: cs.id,
                qty: numOrNull(row['Qty'] ?? row['qty'] ?? row['Quantity']) ?? 1
              },
              create: {
                supersetId: ss.id,
                orderIndex: numOrNull(row['Order'] ?? row['order_index'] ?? row['Index']) ?? 0,
                setId: cs.id,
                qty: numOrNull(row['Qty'] ?? row['qty'] ?? row['Quantity']) ?? 1
              }
            })
            ssItemsImported++
          } catch (e) { errors.push(`ProjectItem ${projectName}/${productName}: ${String(e)}`) }
        } else { ssItemsImported++ }
      }
    }
  }

  if (!dryRun) {
    await logChange({
      entity: 'system',
      entityId: 'import',
      field: 'all',
      oldValue: null,
      newValue: `Imported: ${itemsImported} items, ${productsImported} products, ${bomRowsImported} BOM rows, ${setsImported} sets, ${setItemsImported} set items, ${supersetsImported} projects, ${ssItemsImported} project items`,
      changedBy: user.username,
      context: `Excel Import: ${file.name}`
    })
  }

  return c.json({
    dryRun,
    itemsImported,
    productsImported,
    bomRowsImported,
    setsImported,
    setItemsImported,
    supersetsImported,
    ssItemsImported,
    warnings: Array.from(new Set(warnings)).slice(0, 50),
    errors: errors.slice(0, 20),
    totalErrors: errors.length,
    isValid: errors.length === 0
  })
})

// ─── Integrity Check ───────────────────────────────────────────────────────

admin.get('/verify-integrity', requireRole('admin', 'super'), async (c) => {
  const [orphanedBOM, emptyPCBs, emptySets] = await Promise.all([
    // BOM rows referencing non-existent items
    prisma.productItem.findMany({
      where: { item: { is: undefined } },
      select: { productId: true, stableId: true, product: { select: { name: true } } }
    }),
    // Products with 0 items
    prisma.product.findMany({
      where: { items: { none: {} } },
      select: { id: true, name: true }
    }),
    // ConfigSets with 0 items
    prisma.configSet.findMany({
      where: { items: { none: {} } },
      select: { id: true, name: true }
    })
  ])

  const totalItems = await prisma.item.count()
  const pricedItems = await prisma.item.count({ where: { priceMin: { gt: 0 } } })
  
  const healthScore = totalItems > 0 
    ? Math.max(0, 100 - (orphanedBOM.length * 5) - (emptyPCBs.length * 2))
    : 100

  return c.json({
    healthScore,
    checks: {
      orphanedBOM: orphanedBOM.length === 0,
      completeInventory: pricedItems === totalItems,
      populatedPCBs: emptyPCBs.length === 0,
      populatedSets: emptySets.length === 0
    },
    details: {
      orphanedBOMCount: orphanedBOM.length,
      emptyPCBsCount: emptyPCBs.length,
      emptySetsCount: emptySets.length,
      unpricedItemsCount: totalItems - pricedItems
    }
  })
})

// ─── Settings ──────────────────────────────────────────────────────────────

admin.get('/settings', requireRole('admin', 'super'), async (c) => {
  const settings = await prisma.systemSetting.findMany()
  const out: Record<string, string> = {}
  settings.forEach(s => { out[s.key] = s.value })
  return c.json(out)
})

admin.patch('/settings', requireRole('admin', 'super'), async (c) => {
  try {
    const data = await c.req.json() as Record<string, string>
    const user = c.get('user')

    if (!prisma.systemSetting) {
      throw new Error("Prisma client property 'systemSetting' is missing. Please regenerate Prisma Client.")
    }

    for (const [key, value] of Object.entries(data)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
      
      await logChange({
        entity: 'system',
        entityId: 'settings',
        field: key,
        oldValue: '?',
        newValue: String(value),
        changedBy: user.username,
        context: 'Update System Configuration'
      })
    }
    return c.json({ ok: true })
  } catch (err: any) {
    console.error('[Admin Settings] Error updating settings:', err)
    return c.json({ error: err.message || 'Internal Server Error' }, 500)
  }
})

// ─── API Keys (super only) ─────────────────────────────────────────────────

function maskKey(val: string | undefined): string {
  if (!val) return ''
  if (val.length <= 4) return '****'
  return '****' + val.slice(-4)
}

admin.get('/api-keys', requireRole('super'), async (c) => {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['api_mouser_key', 'api_digikey_client_id', 'api_digikey_client_secret'] } }
  })
  const db: Record<string, string> = {}
  rows.forEach(r => { db[r.key] = r.value })

  const mouserSrc  = db['api_mouser_key']           ? 'db' : (process.env.MOUSER_API_KEY          ? 'env' : 'none')
  const dkIdSrc    = db['api_digikey_client_id']    ? 'db' : (process.env.DIGIKEY_CLIENT_ID        ? 'env' : 'none')
  const dkSecSrc   = db['api_digikey_client_secret']? 'db' : (process.env.DIGIKEY_CLIENT_SECRET    ? 'env' : 'none')

  return c.json({
    mouserKey:           maskKey(db['api_mouser_key']            || process.env.MOUSER_API_KEY),
    digikeyClientId:     maskKey(db['api_digikey_client_id']     || process.env.DIGIKEY_CLIENT_ID),
    digikeyClientSecret: maskKey(db['api_digikey_client_secret'] || process.env.DIGIKEY_CLIENT_SECRET),
    sources: { mouser: mouserSrc, digikeyId: dkIdSrc, digikeySecret: dkSecSrc },
  })
})

admin.put('/api-keys', requireRole('super'), async (c) => {
  const { mouserKey, digikeyClientId, digikeyClientSecret, confirmPassword } = await c.req.json()
  if (!confirmPassword) return c.json({ error: 'confirmPassword required' }, 400)

  const user = c.get('user')
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser || !(await verifyPassword(confirmPassword, dbUser.passwordHash))) {
    return c.json({ error: 'Password incorrect' }, 401)
  }

  const updates: { key: string; value: string }[] = []
  if (mouserKey?.trim())           updates.push({ key: 'api_mouser_key',            value: mouserKey.trim() })
  if (digikeyClientId?.trim())     updates.push({ key: 'api_digikey_client_id',     value: digikeyClientId.trim() })
  if (digikeyClientSecret?.trim()) updates.push({ key: 'api_digikey_client_secret', value: digikeyClientSecret.trim() })

  if (updates.length === 0) return c.json({ error: 'No keys provided' }, 400)

  for (const { key, value } of updates) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
    await logChange({ entity: 'system', entityId: 'api-keys', field: key, oldValue: '****', newValue: '****', changedBy: user.username, context: 'API Key updated via Configure page' })
  }

  const digikeyChanged = updates.some(u => u.key.startsWith('api_digikey'))
  if (digikeyChanged) clearDigikeyTokenCache()

  return c.json({ ok: true, updated: updates.map(u => u.key) })
})

// ─── Backup export ─────────────────────────────────────────────────────────

admin.get('/backups/auto', requireRole('admin', 'super'), async (c) => {
  const dir = join(process.cwd(), 'backups', 'auto')
  if (!existsSync(dir)) return c.json([])
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.xlsx'))
    .sort()
    .reverse()
    .slice(0, 10)
  return c.json(files)
})

admin.get('/backups/auto/:filename', requireRole('admin', 'super'), async (c) => {
  const filename = c.req.param('filename')
  // Prevent path traversal — resolve and verify path is within backup dir
  const safePath = resolve(BACKUP_AUTO_DIR, filename)
  if (!safePath.startsWith(BACKUP_AUTO_DIR + '/') && safePath !== BACKUP_AUTO_DIR) {
    return c.json({ error: 'Invalid filename' }, 400)
  }
  if (!safePath.endsWith('.xlsx')) return c.json({ error: 'Invalid file type' }, 400)
  if (!existsSync(safePath)) return c.json({ error: 'Not found' }, 404)
  const buf = readFileSync(safePath)
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  c.header('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`)
  return c.body(buf)
})

admin.get('/backup', requireRole('admin', 'super'), async (c) => {
  const buf = await generateBackupBuffer()
  const now = new Date().toISOString().slice(0, 10)
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  c.header('Content-Disposition', `attachment; filename="bom_backup_${now}.xlsx"`)
  return c.body(new Uint8Array(buf))
})

// ─── helpers ───────────────────────────────────────────────────────────────

function strOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

// Strip supplier catalog prefix (e.g. "187-CL21A106" → "CL21A106")
// If stockCode (actual MPN) is provided and non-empty, use it directly.
// Otherwise strip the leading digits+dash prefix.
function cleanPN(pn: string | null, stockCode?: string | null): string | null {
  if (!pn) return pn
  // Strip numeric supplier prefixes: "187-CL21..." → "CL21..."
  const numericPrefix = pn.match(/^\d{3,5}-(.+)/)
  if (numericPrefix) {
    if (stockCode?.trim()) return stockCode.trim()
    return numericPrefix[1].trim() || pn
  }
  // Strip ALT- prefix: "ALT-C42411287" → use stockCode if available
  const altPrefix = pn.match(/^ALT-(.+)/i)
  if (altPrefix) {
    if (stockCode?.trim()) return stockCode.trim()
    return altPrefix[1].trim() || pn
  }
  return pn
}

function numOrNull(v: unknown): number | null {
  const n = Number(v)
  return isNaN(n) || v === '' ? null : n
}

// ─── Price Sync Job Store ────────────────────────────────────────────────────

type JobStatus = {
  status: 'running' | 'done' | 'error'
  mode: 'all' | 'missing'
  total: number
  done: number
  updated: number
  failed: number
  startedAt: number
  finishedAt?: number
  error?: string
}

const priceJobs = new Map<string, JobStatus>()

let _serviceToken: string | null = null
async function getServiceToken() {
  if (!_serviceToken) {
    _serviceToken = await signToken({ id: 0, username: 'service', role: 'super' })
  }
  return _serviceToken
}

let _standaloneLastMouserAt = 0
const STANDALONE_MOUSER_INTERVAL_MS = 600

async function enrichItemStandalone(sid: string, rawPn: string, lcsc?: string): Promise<boolean> {
  const pn = cleanPN(rawPn, lcsc) ?? rawPn
  const base = `http://localhost:${process.env.PORT || 8001}`
  const token = await getServiceToken()
  const headers = { Authorization: `Bearer ${token}` }

  // Read existing supplierPrices from DB to preserve non-enrichable entries (AliExpress etc.)
  // and to detect preferred supplier
  const existing = await prisma.item.findUnique({
    where: { stableId: sid },
    select: { suppliers: true, supplierPrices: true }
  })
  const existingSpMap: Record<string, any> = (() => {
    try { return existing?.supplierPrices ? JSON.parse(existing.supplierPrices as string) : {} } catch { return {} }
  })()
  // Non-enrichable keys to preserve (AliExpress, Tokopedia, etc.)
  const knownSuppliers = new Set(['lcsc', 'mouser', 'digikey'])
  const preservedEntries: Record<string, any> = {}
  for (const [k, v] of Object.entries(existingSpMap)) {
    if (!knownSuppliers.has(k)) preservedEntries[k] = v
  }

  // Determine search order from existing suppliers field in DB
  type SearchTarget = 'lcsc' | 'mouser' | 'digikey'
  const dbSupplier = existing?.suppliers?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
  const preferred: SearchTarget | null = dbSupplier.includes('digikey') ? 'digikey'
    : dbSupplier.includes('mouser') ? 'mouser'
    : dbSupplier.includes('lcsc') ? 'lcsc'
    : null
  const order: SearchTarget[] = preferred === 'digikey' ? ['digikey', 'mouser']
    : preferred === 'mouser' ? ['mouser', 'digikey']
    : preferred === 'lcsc' ? ['lcsc', 'mouser', 'digikey']
    : ['lcsc', 'mouser', 'digikey']

  try {
    let found: any = null
    let source = ''

    // LCSC by C-code first if available
    if (lcsc) {
      try {
        const res = await axios.post(`${base}/lcsc/lookup`, { items: [{ lcsc, qty: 1 }] }, { headers })
        found = res.data?.items?.[0]
        if (found) source = 'lcsc'
      } catch {}
    }

    // Search by MPN following preferred order
    for (const target of order) {
      if (found) break
      if (!pn) continue
      try {
        if (target === 'lcsc') {
          const searchRes = await axios.post(`${base}/lcsc/search`, { keyword: pn, limit: 5 }, { headers })
          const lcscItems: any[] = searchRes.data?.items ?? []
          const match = lcscItems.find((r: any) => r.mpn?.toLowerCase() === pn.toLowerCase()) ?? lcscItems[0]
          if (match?.lcsc) {
            const lookupRes = await axios.post(`${base}/lcsc/lookup`, { items: [{ lcsc: match.lcsc, qty: 1 }] }, { headers })
            found = lookupRes.data?.items?.[0]
            if (found) source = 'lcsc'
          }
        } else if (target === 'mouser') {
          // Throttle Mouser: 600ms minimum interval
          const now = Date.now()
          const wait = STANDALONE_MOUSER_INTERVAL_MS - (now - _standaloneLastMouserAt)
          if (wait > 0) await new Promise(r => setTimeout(r, wait))
          _standaloneLastMouserAt = Date.now()
          // Retry 3x on 502/503/429
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)))
              const res = await axios.post(`${base}/mouser/search`, { keyword: pn, qty: 1 }, { headers })
              _standaloneLastMouserAt = Date.now()
              found = res.data?.items?.[0]
              if (found) source = 'mouser'
              break
            } catch (e: any) {
              const s = e?.response?.status
              if (s === 502 || s === 503 || s === 429) { if (attempt === 2) break }
              else throw e
            }
          }
        } else if (target === 'digikey') {
          const res = await axios.post(`${base}/digikey/search`, { keyword: pn, qty: 1 }, { headers })
          found = res.data?.items?.[0]
          if (found) source = 'digikey'
        }
      } catch {}
    }

    // Specs enrichment: Mouser source + incomplete → try LCSC
    if (found && source === 'mouser' && !lcsc && pn && (!found.voltageRating || !found.value || !found.tolerance)) {
      try {
        const searchRes = await axios.post(`${base}/lcsc/search`, { keyword: pn, limit: 5 }, { headers })
        const lcscItems: any[] = searchRes.data?.items ?? []
        const lcscMatch = lcscItems.find((r: any) => r.mpn?.toLowerCase() === (found.mpn || pn).toLowerCase()) ?? lcscItems[0]
        if (lcscMatch?.lcsc) {
          const lookupRes = await axios.post(`${base}/lcsc/lookup`, { items: [{ lcsc: lcscMatch.lcsc, qty: 1 }] }, { headers })
          const fullData = lookupRes.data?.items?.[0]
          if (fullData) {
            found = {
              ...found,
              value:         fullData.value         ?? found.value,
              voltageRating: fullData.voltageRating  ?? found.voltageRating,
              tolerance:     fullData.tolerance      ?? found.tolerance,
              package:       fullData.package        ?? found.package,
              manufacturer:  fullData.manufacturer   ?? found.manufacturer,
              category:      fullData.category       ?? found.category,
              description:   fullData.description    ?? found.description,
            }
          }
        }
      } catch {}
    }

    // DigiKey specs enrichment (if not already from DigiKey or specs missing)
    let specsData: { specs?: string; value?: string; voltageRating?: string; tolerance?: string; package?: string } = {
      specs: found?.specs || undefined,
      value: found?.value || undefined,
      voltageRating: found?.voltageRating || undefined,
      tolerance: found?.tolerance || undefined,
      package: found?.package || undefined,
    }
    if (found) {
      const mpnForSpecs = found.mpn || pn
      if (mpnForSpecs && (source !== 'digikey' || !found.specs)) {
        try {
          const dkRes = await axios.post(`${base}/digikey/specs`, { mpn: mpnForSpecs }, { headers })
          if (dkRes.data?.specs) {
            specsData = {
              specs: dkRes.data.specs,
              value: dkRes.data.value || specsData.value,
              voltageRating: dkRes.data.voltageRating || specsData.voltageRating,
              tolerance: dkRes.data.tolerance || specsData.tolerance,
              package: dkRes.data.package || specsData.package,
            }
          }
        } catch {}
      }
    }

    if (found) {
      const stockNum = found.quantity_available != null ? Number(found.quantity_available) : null
      const supplierLabel = source === 'lcsc' ? 'LCSC' : source === 'mouser' ? 'Mouser' : source === 'digikey' ? 'DigiKey' : source
      // Merge: preserve non-enrichable entries, add/update the found supplier
      const spMap: Record<string, any> = { ...preservedEntries }
      spMap[source] = {
        pn: (source === 'lcsc' ? lcsc : found.mpn) || pn,
        price: found.price || null,
        url: found.url || null,
        quantity_available: stockNum,
        priceBreaks: found.priceBreaks || []
      }
      // Build links: supplier URL + datasheet + preserved unsupported URLs
      const linkParts = [
        found.url,
        found.datasheet,
        ...Object.values(preservedEntries).map((e: any) => e.url).filter(Boolean),
      ].filter(Boolean) as string[]
      await prisma.item.update({
        where: { stableId: sid },
        data: {
          priceMin: found.price || undefined,
          priceCurrency: 'USD',
          suppliers: supplierLabel,
          stockQty: stockNum ?? undefined,
          links: linkParts.length ? linkParts.join(';') : undefined,
          supplierPrices: JSON.stringify(spMap),
          ...(specsData.specs        ? { specs:         specsData.specs        } : {}),
          ...(found.description      ? { description:   found.description      } : {}),
          ...(specsData.package      ? { package:       specsData.package      } : found.package ? { package: found.package } : {}),
          ...(found.manufacturer     ? { manufacturer:  found.manufacturer     } : {}),
          ...(found.category         ? { category:      found.category         } : {}),
          ...(specsData.value        ? { value:         specsData.value        } : found.value ? { value: found.value } : {}),
          ...(specsData.voltageRating ? { voltageRating: specsData.voltageRating } : found.voltageRating ? { voltageRating: found.voltageRating } : {}),
          ...(specsData.tolerance    ? { tolerance:     specsData.tolerance    } : found.tolerance ? { tolerance: found.tolerance } : {}),
        }
      })
      return true
    }
  } catch {}
  return false
}

admin.post('/refresh-prices', requireRole('admin', 'super'), async (c) => {
  const { mode = 'missing' } = await c.req.json<{ mode?: 'all' | 'missing' }>().catch(() => ({ mode: 'missing' as const }))

  const where = mode === 'missing'
    ? { OR: [{ priceMin: null }, { priceMin: 0 }] }
    : {}

  const items = await prisma.item.findMany({
    where,
    select: { stableId: true, partNumber: true, stockCode: true }
  })

  const jobId = `job_${Date.now()}`
  const job: JobStatus = {
    status: 'running',
    mode,
    total: items.length,
    done: 0,
    updated: 0,
    failed: 0,
    startedAt: Date.now()
  }
  priceJobs.set(jobId, job)

  // Run in background — do not await
  ;(async () => {
    for (const item of items) {
      const ok = await enrichItemStandalone(item.stableId, item.partNumber || '', item.stockCode || undefined)
      job.done++
      if (ok) job.updated++; else job.failed++
    }
    job.status = 'done'
    job.finishedAt = Date.now()
    await invalidateCosts()
    // Clean up after 10 minutes
    setTimeout(() => priceJobs.delete(jobId), 10 * 60 * 1000)
  })()

  return c.json({ jobId, total: items.length })
})

admin.get('/refresh-prices/:jobId', requireRole('admin', 'super'), async (c) => {
  const job = priceJobs.get(c.req.param('jobId'))
  if (!job) return c.json({ error: 'Job not found' }, 404)
  return c.json(job)
})

export default admin
