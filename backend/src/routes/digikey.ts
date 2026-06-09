import { Hono } from 'hono'
import prisma from '../lib/prisma.js'
import { authMiddleware, AuthUser } from '../middleware/auth.js'

const digikey = new Hono<{ Variables: { user: AuthUser } }>()
digikey.use('*', authMiddleware)

const TOKEN_URL = 'https://api.digikey.com/v1/oauth2/token'
const API_HOST = 'https://api.digikey.com'

// Simple in-memory token cache
let cachedToken: { token: string; expiresAt: number } | null = null

export function clearDigikeyTokenCache() { cachedToken = null }

async function getCreds(): Promise<{ clientId: string; clientSecret: string }> {
  const [idRow, secretRow] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'api_digikey_client_id' } }),
    prisma.systemSetting.findUnique({ where: { key: 'api_digikey_client_secret' } }),
  ])
  const clientId = idRow?.value || process.env.DIGIKEY_CLIENT_ID || ''
  const clientSecret = secretRow?.value || process.env.DIGIKEY_CLIENT_SECRET || ''
  if (!clientId || !clientSecret) throw new Error('DIGIKEY_CLIENT_ID / DIGIKEY_CLIENT_SECRET not configured')
  return { clientId, clientSecret }
}

async function getToken(): Promise<string> {
  const now = Date.now() / 1000
  if (cachedToken && cachedToken.expiresAt > now + 30) return cachedToken.token

  const { clientId, clientSecret } = await getCreds()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`DigiKey token error ${res.status}`)
  const data = await res.json() as Record<string, unknown>
  const token = String(data.access_token ?? '')
  const ttl = Number(data.expires_in ?? 540)
  cachedToken = { token, expiresAt: now + ttl }
  return token
}

function makeHeaders(token: string, clientId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-DIGIKEY-Client-Id': clientId,
    'X-DIGIKEY-Locale-Site': 'US',
    'X-DIGIKEY-Locale-Language': 'en',
    'X-DIGIKEY-Locale-Currency': 'USD',
    'Content-Type': 'application/json',
  }
}

function safeFloat(v: unknown): number | null {
  const n = Number(v)
  return isNaN(n) ? null : n
}

function normalizePriceBreaks(pricing: Record<string, unknown>[]): { qtyFrom: number; qtyTo: null; unitPrice: number }[] {
  return (pricing ?? []).flatMap(br => {
    const q = safeFloat(br.BreakQuantity)
    const p = safeFloat(br.UnitPrice)
    return q !== null && p !== null ? [{ qtyFrom: q, qtyTo: null, unitPrice: p }] : []
  })
}

function pickVariation(variations: Record<string, unknown>[]) {
  if (!variations?.length) return { variation: null, price: null, moq: null, breaks: null }
  // Pick variation with lowest MOQ → lowest price
  let best: Record<string, unknown> | null = null
  let bestMoq = Infinity
  let bestPrice: number | null = null

  for (const v of variations) {
    const pricing = (v.StandardPricing as Record<string, unknown>[]) ?? []
    const moq = safeFloat(v.MinimumOrderQuantity) ?? (pricing[0] ? safeFloat(pricing[0].BreakQuantity) : null) ?? 1
    const price = pricing.length ? (safeFloat(pricing[0]?.UnitPrice) ?? null) : null
    if ((moq ?? Infinity) < bestMoq || (moq === bestMoq && price !== null && (bestPrice === null || price < bestPrice))) {
      best = v; bestMoq = moq ?? Infinity; bestPrice = price
    }
  }

  if (!best) return { variation: null, price: null, moq: null, breaks: null }
  const breaks = normalizePriceBreaks((best.StandardPricing as Record<string, unknown>[]) ?? [])
  return { variation: best, price: bestPrice, moq: bestMoq, breaks: breaks.length ? breaks : null }
}

// DigiKey v4 uses ParameterText / ValueText (not Parameter / Value)
const DK_VALUE_PARAMS   = [
  'resistance in ohms @ 25°c', 'resistance', 'capacitance', 'inductance',
  'current rating', 'current - output', 'frequency', 'voltage', 'power (watts)', 'forward voltage (vf) (typ) @ if',
  'current - hold (ih) (max)', 'current - trip (it)'
]
const DK_VOLTAGE_PARAMS = [
  'voltage - rated', 'voltage rating', 'voltage range', 'voltage - input', 'voltage - output',
  'voltage - collector emitter breakdown (max)', 'voltage - supply', 'voltage - supply (vcc/vdd)',
  'voltage - isolation', 'voltage - input (max)', 'voltage - output (min/fixed)', 'voltage - output (max)',
  'voltage - max', 'supply voltage - max', 'operating supply voltage'
]
const DK_TOLERANCE_PARAMS = ['resistance tolerance', 'capacitance tolerance', 'tolerance', 'frequency stability']
const DK_PACKAGE_PARAMS   = ['package / case', 'supplier device package', 'case / package', 'mounting type']

function extractSpecsDk(params: { ParameterText: string; ValueText: string }[]) {
  const map = new Map(params.map(p => [p.ParameterText?.toLowerCase().trim(), p.ValueText?.trim()]))
  let value: string | undefined
  for (const k of DK_VALUE_PARAMS) {
    const v = map.get(k); if (v && v !== '-') { value = v; break }
  }
  let voltageRating: string | undefined
  for (const k of DK_VOLTAGE_PARAMS) {
    const v = map.get(k); if (v && v !== '-') { voltageRating = v; break }
  }
  let tolerance: string | undefined
  for (const k of DK_TOLERANCE_PARAMS) {
    const v = map.get(k); if (v && v !== '-') { tolerance = v; break }
  }
  let pkg: string | undefined
  for (const k of DK_PACKAGE_PARAMS) {
    const v = map.get(k); if (v && v !== '-') { pkg = v; break }
  }
  // All params as clean key-value for specs JSON blob
  const allSpecs: Record<string, string> = {}
  for (const p of params) {
    if (p.ParameterText && p.ValueText && p.ValueText !== '-') {
      allSpecs[p.ParameterText] = p.ValueText
    }
  }
  const specs = { value, voltageRating, tolerance, package: pkg, allSpecs }
  console.log(`[DigiKey Debug] Extracted Specs from ${map.size} params:`, { value, voltageRating, tolerance, package: pkg })
  return specs
}

// Fallback: parse from description string (if structured params are missing)
function extractFromDescDk(description: string): {
  value: string | null
  voltageRating: string | null
  tolerance: string | null
  package: string | null
} {
  const d = description ?? ''

  const valueMatch =
    d.match(/\b\d+(?:\.\d+)?\s*(?:nF|uF|µF|pF|mF)\b/i) ||
    d.match(/\b\d+(?:\.\d+)?\s*(?:mH|uH|µH|nH)\b/i) ||
    d.match(/\b\d+(?:\.\d+)?\s*[kKM]?\s*(?:Ω|[Oo]hms?)\b/) ||
    d.match(/\b\d+(?:\.\d+)?\s*[kKM]\b(?!\s*(?:Hz|W|V|ohm))/i) ||
    d.match(/\b\d+(?:\.\d+)?\s*(?:Hz|MHz|kHz)\b/i)
  const value = valueMatch ? valueMatch[0].trim() : null

  const voltageMatch = d.match(/\b\d+(?:\.\d+)?\s*V(?:DC|AC)?\b/i)
  const voltageRating = voltageMatch ? voltageMatch[0].trim() : null

  const toleranceMatch = d.match(/[±]?\s*\d+(?:\.\d+)?\s*%/) || d.match(/\b\d+ppm\b/i)
  const tolerance = toleranceMatch ? toleranceMatch[0].trim() : null

  const packageMatch = d.match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512|SOT-\d+|SOIC-?\d*|SOP-?\d*|DIP-?\d*|QFN-?\d*|QFP-?\d*|BGA-?\d*|TO-\d+|DO-\d+|SC-\d+|TSSOP-?\d*|LQFP-?\d*|WLCSP-?\d*|SOD-?\d*)\b/i)
  const pkg = packageMatch ? packageMatch[0].toUpperCase() : null

  return { value, voltageRating, tolerance, package: pkg }
}

function summarize(product: Record<string, unknown>, qty = 1) {
  const mfr = (product.Manufacturer as Record<string, unknown>)?.Name
  const descRaw = (product.Description as Record<string, unknown>)
  const description = (descRaw?.DetailedDescription ?? descRaw?.ProductDescription) as string | undefined
  const status = (product.ProductStatus as Record<string, unknown>)?.Status
  const cat = (product.Category as Record<string, unknown>)?.Name
  const variations = (product.ProductVariations as Record<string, unknown>[]) ?? []
  const { variation, price, moq, breaks } = pickVariation(variations)
  const dkPn = variation ? (variation as Record<string, unknown>).DigiKeyProductNumber : null

  const rawParams = (product.Parameters as { ParameterText: string; ValueText: string }[]) ?? []
  const structuredSpecs = extractSpecsDk(rawParams)
  
  // If structured specs are missing voltage or package, try parsing from description
  const fallbackSpecs = (!structuredSpecs.voltageRating || !structuredSpecs.package)
    ? extractFromDescDk(description ?? '')
    : { value: null, voltageRating: null, tolerance: null, package: null }

  const mergedSpecs = {
    value: structuredSpecs.value || fallbackSpecs.value,
    voltageRating: structuredSpecs.voltageRating || fallbackSpecs.voltageRating,
    tolerance: structuredSpecs.tolerance || fallbackSpecs.tolerance,
    package: structuredSpecs.package || fallbackSpecs.package,
  }

  const specsJson = Object.keys(structuredSpecs.allSpecs).length
    ? JSON.stringify(structuredSpecs.allSpecs)
    : null

  return {
    mpn: product.ManufacturerProductNumber,
    manufacturer: mfr,
    dk_pn: dkPn,
    price,
    moq,
    priceBreaks: breaks,
    url: product.ProductUrl,
    datasheet: product.DatasheetUrl,
    description,
    category: cat,
    image: product.PhotoUrl,
    availability: status,
    quantity_available: product.QuantityAvailable,
    source: 'digikey',
    specs: specsJson,
    ...mergedSpecs,
  }
}

// POST /digikey/search
// Body: { keyword?: string, pn?: string, qty?: number, limit?: number }
digikey.post('/search', async (c) => {
  const { keyword, pn, qty = 1, limit = 10 } = await c.req.json()
  if (!keyword && !pn) return c.json({ error: 'keyword or pn required' }, 400)

  const { clientId } = await getCreds()
  const token = await getToken()
  const headers = makeHeaders(token, clientId)

  const searchTerm = pn ?? keyword
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  const res = await fetch(`${API_HOST}/products/v4/search/keyword`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ Keywords: String(searchTerm).trim(), Limit: limit, Offset: 0, Includes: ['Parameters'] }),
    signal: ctrl.signal,
  }).catch(() => null).finally(() => clearTimeout(t))

  if (!res) return c.json({ error: 'DigiKey API timeout' }, 504)
  if (!res.ok) {
    const text = await res.text()
    return c.json({ error: `DigiKey API error ${res.status}: ${text.slice(0, 200)}` }, 502)
  }

  const data = await res.json() as Record<string, unknown>
  const exactMatches = (data.ExactMatches as Record<string, unknown>[]) ?? []
  const allProducts = (data.Products as Record<string, unknown>[]) ?? []
  const products = exactMatches.length > 0 ? exactMatches : allProducts

  return c.json({
    items: products.slice(0, limit).map(p => summarize(p, qty)),
    total: products.length,
  })
})

// POST /digikey/specs — fetch only specs JSON for a given MPN (for cross-supplier enrichment)
// Body: { mpn: string }
digikey.post('/specs', async (c) => {
  const { mpn } = await c.req.json()
  if (!mpn) return c.json({ error: 'mpn required' }, 400)

  const { clientId } = await getCreds()
  const token = await getToken()
  const headers = makeHeaders(token, clientId)

  const res = await fetch(`${API_HOST}/products/v4/search/${encodeURIComponent(String(mpn).trim())}/productdetails`, { headers })
  if (!res.ok) return c.json({ specs: null })

  const data = await res.json() as Record<string, unknown>
  const product = data.Product as Record<string, unknown> | undefined
  if (!product) return c.json({ specs: null })

  const rawParams = (product.Parameters as { ParameterText: string; ValueText: string }[]) ?? []
  const allSpecs: Record<string, string> = {}
  for (const p of rawParams) {
    if (p.ParameterText && p.ValueText && p.ValueText !== '-') {
      allSpecs[p.ParameterText] = p.ValueText
    }
  }

  // Also extract the 4 mapped fields
  const extracted = extractSpecsDk(rawParams)

  return c.json({
    specs: Object.keys(allSpecs).length ? JSON.stringify(allSpecs) : null,
    value: extracted.value ?? null,
    voltageRating: extracted.voltageRating ?? null,
    tolerance: extracted.tolerance ?? null,
    package: extracted.package ?? null,
  })
})

// GET /digikey/healthz
digikey.get('/healthz', (c) => {
  const configured = !!(process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET)
  return c.json({ ok: configured, configured })
})

export default digikey
