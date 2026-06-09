import { Hono } from 'hono'
import prisma from '../lib/prisma.js'
import { authMiddleware, AuthUser } from '../middleware/auth.js'

const mouser = new Hono<{ Variables: { user: AuthUser } }>()
mouser.use('*', authMiddleware)

const BASE = 'https://api.mouser.com/api/v1'

async function getKey(): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'api_mouser_key' } })
  const k = row?.value || process.env.MOUSER_API_KEY || ''
  if (!k) throw new Error('MOUSER_API_KEY not configured')
  return k
}

function normalizePriceBreaks(breaks: Record<string, unknown>[]): { qtyFrom: number; qtyTo: null; unitPrice: number }[] {
  return (breaks ?? []).flatMap(br => {
    const q = parseInt(String(br.Quantity ?? 0))
    const p = parseFloat(String(br.Price ?? '').replace(/[$,]/g, ''))
    return isNaN(q) || isNaN(p) ? [] : [{ qtyFrom: q, qtyTo: null, unitPrice: p }]
  })
}


// Extract specs from ProductAttributes (only populated in part-number search)
function extractFromAttrs(attrs: Record<string, unknown>[], description: string): {
  value: string | null
  voltageRating: string | null
  tolerance: string | null
  package: string | null
} {
  const get = (names: string[]) => {
    for (const name of names) {
      const found = attrs.find(a =>
        String(a.AttributeName ?? '').toLowerCase() === name.toLowerCase() ||
        String(a.AttributeName ?? '').toLowerCase().includes(name.toLowerCase())
      )
      if (found?.AttributeValue) return String(found.AttributeValue).trim()
    }
    return null
  }

  const specs = {
    value:         get(['resistance', 'capacitance', 'inductance', 'frequency', 'current rating', 'current - output', 'power rating', 'forward voltage', 'clamping voltage', 'current - hold', 'current - trip']),
    voltageRating: get(['voltage rating', 'voltage rating dc', 'voltage - rated', 'voltage - supply', 'supply voltage - max', 'operating supply voltage', 'output voltage', 'input voltage', 'voltage - output', 'voltage - input', 'zener voltage', 'voltage - breakdown', 'dc reverse voltage', 'reverse voltage', 'vr - reverse voltage', 'voltage - dc reverse', 'voltage - max']),
    tolerance:     get(['tolerance', 'resistance tolerance', 'capacitance tolerance', 'frequency stability']),
    package:       get(['package / case', 'case code - in', 'case code - mm', 'package/case', 'package', 'mounting style', 'standard package name', 'packaging / case']),
  }

  const descFallback = extractFromDesc(description)
  
  const merged = {
    value: specs.value || descFallback.value,
    voltageRating: specs.voltageRating || descFallback.voltageRating,
    tolerance: specs.tolerance || descFallback.tolerance,
    package: specs.package || descFallback.package,
  }

  console.log(`[Mouser Debug] Extracted Specs (Merged):`, merged)
  return merged
}

// Fallback: parse from description string (keyword search only)
function extractFromDesc(description: string): {
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
    d.match(/\b\d+(?:\.\d+)?\s*(?:Hz|MHz|kHz)\b/i) ||
    d.match(/\b\d+(?:\.\d+)?\s*(?:A|mA)\b/i)
  const value = valueMatch ? valueMatch[0].trim() : null

  const voltageMatch = d.match(/\b\d+(?:\.\d+)?\s*V(?:DC|AC)?\b/i)
  const voltageRating = voltageMatch ? voltageMatch[0].trim() : null

  const toleranceMatch = d.match(/[±]?\s*\d+(?:\.\d+)?\s*%/) || d.match(/\b\d+ppm\b/i)
  const tolerance = toleranceMatch ? toleranceMatch[0].trim() : null

  const packageMatch = d.match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512|SOT-\d+|SOIC-?\d*|SOP-?\d*|DIP-?\d*|QFN-?\d*|QFP-?\d*|BGA-?\d*|TO-\d+|DO-\d+|SC-\d+|TSSOP-?\d*|LQFP-?\d*|WLCSP-?\d*|SOD-?\d*)\b/i)
  const pkg = packageMatch ? packageMatch[0].toUpperCase() : null

  return { value, voltageRating, tolerance, package: pkg }
}

function summarize(part: Record<string, unknown>, qty = 1) {
  const attrs = (part.ProductAttributes as Record<string, unknown>[]) ?? []
  console.log(`[Mouser Debug] Raw Attrs Map for ${part.ManufacturerPartNumber}:`, attrs.reduce((acc, a) => ({ ...acc, [String(a.AttributeName)]: a.AttributeValue }), {}))

  const breaks = normalizePriceBreaks((part.PriceBreaks as Record<string, unknown>[]) ?? [])
  let price: number | null = null
  for (const br of [...breaks].sort((a, b) => b.qtyFrom - a.qtyFrom)) {
    if (br.qtyFrom <= qty) { price = br.unitPrice; break }
  }
  if (price === null && breaks.length) price = breaks[0]?.unitPrice ?? null
  const moq = breaks.length ? Math.min(...breaks.map(b => b.qtyFrom ?? 0)) : null

  const specKeywords = [
    'resistance', 'capacitance', 'inductance', 'tolerance', 'voltage rating',
    'case code', 'package / case', 'package/case', 'supply voltage', 'operating supply voltage',
    'mounting style', 'frequency', 'output voltage', 'input voltage', 'zener voltage', 'voltage - output', 'voltage - input',
    'dc reverse voltage', 'reverse voltage', 'forward voltage', 'voltage - dc reverse', 'voltage - max', 'current - hold'
  ]
  
  const specs = extractFromAttrs(attrs, String(part.Description ?? ''))

  return {
    mpn: part.ManufacturerPartNumber,
    manufacturer: part.Manufacturer,
    mouser_pn: part.MouserPartNumber,
    price,
    moq,
    priceBreaks: breaks.length ? breaks : null,
    url: part.ProductDetailUrl,
    datasheet: part.DataSheetUrl,
    description: part.Description,
    category: part.Category ?? part.MouserProductCategory,
    image: part.ImagePath,
    availability: part.Availability,
    quantity_available: part.AvailabilityInStock ?? part.FactoryStock,
    source: 'mouser',
    ...specs,
  }
}

// POST /mouser/search — keyword or PN search
// Body: { keyword?: string, pn?: string, qty?: number, limit?: number }
mouser.post('/search', async (c) => {
  const { keyword, pn, qty = 1, limit = 10 } = await c.req.json()
  if (!keyword && !pn) return c.json({ error: 'keyword or pn required' }, 400)

  const key = await getKey()
  let parts: Record<string, unknown>[] = []

  const searchTerm = (pn || keyword || '').trim()
  const looksLikeMpn = !searchTerm.includes(' ')

  const MOUSER_TIMEOUT_MS = 10000
  const fetchWithTimeout = (url: string, opts: RequestInit) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), MOUSER_TIMEOUT_MS)
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t))
  }

  if (pn || looksLikeMpn) {
    // Part-number search returns full ProductAttributes (specs)
    const res = await fetchWithTimeout(`${BASE}/search/partnumber?apiKey=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SearchByPartRequest: { mouserPartNumber: searchTerm, partSearchOptions: '' }
      }),
    }).catch(() => null)
    if (!res) return c.json({ error: 'Mouser API timeout' }, 504)
    if (!res.ok) return c.json({ error: `Mouser API error ${res.status}` }, 502)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) return c.json({ error: 'Mouser API returned non-JSON response' }, 502)
    const data = await res.json() as Record<string, unknown>
    parts = ((data.SearchResults as Record<string, unknown>)?.Parts as Record<string, unknown>[]) ?? []
  }

  // Fallback to keyword search if no results (or multi-word query)
  if (parts.length === 0 && keyword) {
    const res = await fetchWithTimeout(`${BASE}/search/keyword?apiKey=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SearchByKeywordRequest: {
          keyword: String(keyword).trim(),
          records: limit,
          startingRecord: 0,
          searchOptions: '',
          searchWithYourSignUpLanguage: '',
        }
      }),
    }).catch(() => null)
    if (!res) return c.json({ error: 'Mouser API timeout' }, 504)
    if (!res.ok) return c.json({ error: `Mouser API error ${res.status}` }, 502)
    const ct2 = res.headers.get('content-type') ?? ''
    if (!ct2.includes('application/json')) return c.json({ error: 'Mouser API returned non-JSON response' }, 502)
    const data = await res.json() as Record<string, unknown>
    parts = ((data.SearchResults as Record<string, unknown>)?.Parts as Record<string, unknown>[]) ?? []
  }

  return c.json({
    items: parts.slice(0, limit).map(p => summarize(p, qty)),
    total: parts.length,
  })
})

// GET /mouser/healthz
mouser.get('/healthz', async (c) => {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'api_mouser_key' } })
  const configured = !!(row?.value || process.env.MOUSER_API_KEY)
  return c.json({ ok: configured, configured })
})

export default mouser
