import { Hono } from 'hono'
import prisma from '../lib/prisma.js'
import { authMiddleware, AuthUser } from '../middleware/auth.js'

const lcsc = new Hono<{ Variables: { user: AuthUser } }>()
lcsc.use('*', authMiddleware)

const SIDECAR = process.env.JLC_SIDECAR_URL ?? 'http://localhost:8089'

// Parse value, voltageRating, tolerance, package from description string
function extractSpecsFromDesc(description: string): {
  value: string | null
  voltageRating: string | null
  tolerance: string | null
  package: string | null
} {
  const d = description ?? ''

  const valueMatch =
    d.match(/(?:^|\s)\d+(?:\.\d+)?\s*(?:nF|uF|µF|pF|mF)(?=$|\s|[,;])/i) ||
    d.match(/(?:^|\s)\d+(?:\.\d+)?\s*(?:mH|uH|µH|nH)(?=$|\s|[,;])/i) ||
    d.match(/(?:^|\s)\d+(?:\.\d+)?\s*[kKM]?\s*(?:Ω|[Oo]hms?)(?=$|\s|[,;])/) ||
    d.match(/(?:^|\s)\d+(?:\.\d+)?\s*[kKM](?=$|\s|[,;])(?!\s*(?:Hz|W|V|ohm))/i)
  const value = valueMatch ? valueMatch[0].trim() : null

  const voltageMatch = d.match(/(?:^|\s)\d+(?:\.\d+)?\s*V(?:DC)?(?=$|\s|[,;])/i)
  const voltageRating = voltageMatch ? voltageMatch[0].trim() : null

  const toleranceMatch = d.match(/[±]?\s*\d+(?:\.\d+)?\s*%/)
  const tolerance = toleranceMatch ? toleranceMatch[0].trim() : null

  const packageMatch = d.match(/\b(0201|0402|0603|0805|1206|1210|2010|2512|SOT-\d+|SOIC-?\d*|SOP-?\d*|DIP-?\d*|QFN-?\d*|QFP-?\d*|BGA-?\d*|TO-\d+|DO-\d+|SC-\d+|TSSOP-?\d*|LQFP-?\d*|WLCSP-?\d*)\b/i)
  const pkg = packageMatch ? packageMatch[0].toUpperCase() : null

  return { value, voltageRating, tolerance, package: pkg }
}

// Extract specs from raw.parameters array (structured data — more accurate than regex)
// Confirmed field names from JLC API: parameterName, parameterValue
function extractFromParameters(params: { parameterName: string; parameterValue: string }[]): {
  value: string | null
  voltageRating: string | null
  tolerance: string | null
} {
  const get = (names: string[]) => {
    const found = params.find(p => names.some(n => p.parameterName.toLowerCase().includes(n.toLowerCase())))
    return found?.parameterValue?.trim() || null
  }
  return {
    value: get(['capacitance', 'resistance', 'inductance', 'current rating', 'power rating']),
    voltageRating: get(['voltage rating', 'voltage - rated', 'voltage']),
    tolerance: get(['tolerance']),
  }
}

// Extract manufacturer from dataManualUrl filename
// URL format: .../lcsc_datasheet_{date}_{Manufacturer-Name}-{MPN}_{LCSC}.pdf
// e.g. Samsung-Electro-Mechanics-CL10A105KP8NNNC_C26413.pdf → "Samsung Electro-Mechanics"
function extractManufacturerFromUrl(url: string, mpn: string): string | null {
  if (!url || !mpn) return null
  try {
    const filename = url.split('/').pop() ?? ''
    // Strip prefix: lcsc_datasheet_<digits>_
    const afterPrefix = filename.replace(/^lcsc_datasheet_\d+_/, '')
    // Strip suffix: _<LCSC_code>.pdf
    const withoutSuffix = afterPrefix.replace(/_C\d+\.pdf$/i, '')
    // withoutSuffix = "Samsung-Electro-Mechanics-CL10A105KP8NNNC"
    // Strip "-{MPN}" from end (MPN may contain dashes/dots, escape for regex)
    const mpnEscaped = mpn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[\\-]')
    const withoutMpn = withoutSuffix.replace(new RegExp(`-?${mpnEscaped}$`, 'i'), '')
    if (!withoutMpn) return null
    // Replace dashes with spaces, clean up
    return withoutMpn.replace(/-/g, ' ').trim() || null
  } catch {
    return null
  }
}

// Normalize a single sidecar Part item
// Confirmed raw field names from JLC API log:
//   componentCode, componentModel, componentSpecification (package),
//   firstTypeName, secondTypeName, description, datasheetUrl,
//   parameters (array of {parameterName, parameterValue}), dataManualUrl
function normalizeLcscItem(item: Record<string, unknown>): Record<string, unknown> {
  const raw = (item.raw ?? {}) as Record<string, unknown>

  // Prioritize the longest description string for regex extraction
  const allDescs = [
    item.description as string,
    raw.description as string,
    raw.componentModelEn as string,
    raw.componentSpecificationEn as string
  ].filter(v => typeof v === 'string' && v.length > 0)
  const description = allDescs.sort((a, b) => b.length - a.length)[0] || null

  // raw.componentSpecification = confirmed package field (e.g. "1206", "0603")
  const packageInfo = (item.package as string | null)
    || (raw.componentSpecification as string | null)
    || null

  // Extract manufacturer from dataManualUrl filename (JLC API has no dedicated brand field)
  const mpn = (item.mpn as string | null) || (raw.componentModel as string | null) || ''
  const dataManualUrl = (raw.dataManualUrl as string | null) || ''

  // Manufacturer: get from item or extract from dataManualUrl, then strip JLCPCB internal prefix
  // e.g. "2210171730_ElecSuper" → "ElecSuper"
  const rawMfr = (item.manufacturer as string | null)
    || extractManufacturerFromUrl(dataManualUrl, mpn)
    || null
  const manufacturer = rawMfr ? (rawMfr.replace(/^\d+_/, '').trim() || null) : null

  // category: raw.firstTypeName / secondTypeName (confirmed)
  const catFromRaw = [raw.firstTypeName, raw.secondTypeName].filter(Boolean).join(' / ') || null
  const category = (item.category as string | null) || catFromRaw

  // Datasheet: prefer public dataManualUrl (lcsc.com) over jlcpcb.com internal API URL
  const jlcDatasheet = (raw.datasheetUrl as string | null) || (item.datasheet as string | null) || null
  const publicDatasheet = (raw.dataManualUrl as string | null) || null
  const datasheet = publicDatasheet || jlcDatasheet || null

  // Purchase URL: construct from LCSC C-code (sidecar does not return purchase URL)
  const lcscCode = (item.lcsc as string | null) || null
  const purchaseUrl = lcscCode ? `https://www.lcsc.com/product-detail/${lcscCode}.html` : null

  // specs: prefer structured parameters array, fallback to regex on description
  const params = (raw.parameters as { parameterName: string; parameterValue: string }[]) || []
  const structuredSpecs = params.length > 0
    ? extractFromParameters(params)
    : { value: null, voltageRating: null, tolerance: null }
  
  const descSpecs = description ? extractSpecsFromDesc(description) : { value: null, voltageRating: null, tolerance: null, package: null }

  return {
    ...item,
    description: description || undefined,
    package: packageInfo || descSpecs.package || undefined,
    manufacturer: manufacturer || undefined,
    category: category || undefined,
    datasheet: datasheet || undefined,
    url: purchaseUrl || undefined,   // purchase URL, not datasheet
    value: (item.value as string | null) || structuredSpecs.value || descSpecs.value || undefined,
    voltageRating: (item.voltageRating as string | null) || structuredSpecs.voltageRating || descSpecs.voltageRating || undefined,
    tolerance: (item.tolerance as string | null) || structuredSpecs.tolerance || descSpecs.tolerance || undefined,
    quantity_available: (item.quantity_available as number | null)
      ?? (item.quantityAvailable as number | null)
      ?? null,
    raw: undefined,
  }
}

// POST /lcsc/lookup — forward to Java sidecar + normalize response
// Body: { items: [{ lcsc?: string, pn?: string, qty?: number }] }
lcsc.post('/lookup', async (c) => {
  const body = await c.req.json()
  if (!body?.items?.length) return c.json({ error: 'items[] required' }, 400)

  const res = await fetch(`${SIDECAR}/component/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(e => { throw new Error(`Sidecar unreachable: ${e.message}`) })

  if (!res.ok) return c.json({ error: `Sidecar error ${res.status}` }, 502)
  const data = await res.json() as { items?: Record<string, unknown>[] }

  const normalized = {
    ...data,
    items: (data.items ?? []).map(normalizeLcscItem),
  }

  return c.json(normalized)
})

// POST /lcsc/search — keyword search via public proxy
// Body: { keyword: string, limit?: number }
lcsc.post('/search', async (c) => {
  const { keyword, limit = 10 } = await c.req.json()
  if (!keyword) return c.json({ error: 'keyword required' }, 400)

  // Use jlcsearch.tscircuit.com as a public proxy for LCSC/JLCPCB parts
  const url = `https://jlcsearch.tscircuit.com/components/list.json?search=${encodeURIComponent(keyword)}`
  const res = await fetch(url).catch(e => { 
    throw new Error(`LCSC search proxy unreachable: ${e.message}`) 
  })

  if (!res.ok) return c.json({ error: `Search proxy error ${res.status}` }, 502)
  const data = await res.json() as { components: any[] }

  function mapComp(comp: any) {
    let priceBreaks: any[] | null = null
    let price: number | null = null
    try {
      const parsed = JSON.parse(comp.price || '[]')
      priceBreaks = parsed.map((pb: any) => ({
        qtyFrom: pb.qFrom,
        qtyTo: pb.qTo || null,
        unitPrice: pb.price
      }))
      if (priceBreaks && priceBreaks.length > 0) price = priceBreaks[0].unitPrice
    } catch { /* ignore */ }
    const lcscCode = `C${comp.lcsc}`
    return {
      mpn: comp.mfr,
      lcsc: lcscCode,
      price,
      priceBreaks,
      quantity_available: comp.stock,
      category: [comp.category, comp.subcategory].filter(Boolean).join(' / '),
      package: comp.package,
      description: comp.description,
      url: `https://www.lcsc.com/product-detail/${lcscCode}.html`,
      source: 'lcsc'
    }
  }

  let items = (data.components ?? []).slice(0, limit).map(mapComp)

  // Fallback: jlcsearch miss on exact MPN (e.g. "ERJ-3EKF10R0V") — try sidecar lookup by MPN
  if (items.length === 0 && keyword && !/^\d+$/.test(keyword)) {
    try {
      const sidecarRes = await fetch(`${SIDECAR}/component/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ pn: keyword, qty: 1 }] }),
      })
      if (sidecarRes.ok) {
        const sidecarData = await sidecarRes.json() as { items?: Record<string, unknown>[] }
        const normalized = (sidecarData.items ?? []).map(normalizeLcscItem).filter((i: any) => i.mpn || i.lcsc)
        if (normalized.length > 0) {
          console.log(`[LCSC Search] jlcsearch miss for "${keyword}" — sidecar fallback found ${normalized.length} result(s)`)
          items = normalized as any[]
        }
      }
    } catch (e: any) {
      console.warn(`[LCSC Search] Sidecar fallback failed for "${keyword}": ${e.message}`)
    }
  }

  return c.json({ items, total: items.length })
})

// GET /lcsc/healthz — check sidecar alive
lcsc.get('/healthz', async (c) => {
  const res = await fetch(`${SIDECAR}/healthz`).catch(() => null)
  return c.json({ ok: !!res?.ok, sidecar: SIDECAR })
})

export default lcsc
