import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
const mouser = new Hono();
mouser.use('*', authMiddleware);
const BASE = 'https://api.mouser.com/api/v1';
function getKey() {
    const k = process.env.MOUSER_API_KEY ?? '';
    if (!k)
        throw new Error('MOUSER_API_KEY not configured');
    return k;
}
function normalizePriceBreaks(breaks) {
    return (breaks ?? []).flatMap(br => {
        const q = parseInt(String(br.Quantity ?? 0));
        const p = parseFloat(String(br.Price ?? '').replace(/[$,]/g, ''));
        return isNaN(q) || isNaN(p) ? [] : [{ qtyFrom: q, qtyTo: null, unitPrice: p }];
    });
}
// Extract specs from ProductAttributes (only populated in part-number search)
function extractFromAttrs(attrs, description) {
    const get = (names) => {
        for (const name of names) {
            const found = attrs.find(a => String(a.AttributeName ?? '').toLowerCase() === name.toLowerCase() ||
                String(a.AttributeName ?? '').toLowerCase().includes(name.toLowerCase()));
            if (found?.AttributeValue)
                return String(found.AttributeValue).trim();
        }
        return null;
    };
    const specs = {
        value: get(['resistance', 'capacitance', 'inductance', 'frequency', 'current rating', 'current - output', 'power rating', 'forward voltage', 'clamping voltage', 'current - hold', 'current - trip']),
        voltageRating: get(['voltage rating', 'voltage rating dc', 'voltage - rated', 'voltage - supply', 'supply voltage - max', 'operating supply voltage', 'output voltage', 'input voltage', 'voltage - output', 'voltage - input', 'zener voltage', 'voltage - breakdown', 'dc reverse voltage', 'reverse voltage', 'vr - reverse voltage', 'voltage - dc reverse', 'voltage - max']),
        tolerance: get(['tolerance', 'resistance tolerance', 'capacitance tolerance', 'frequency stability']),
        package: get(['package / case', 'case code - in', 'case code - mm', 'package/case', 'package', 'mounting style', 'standard package name', 'packaging / case']),
    };
    const descFallback = extractFromDesc(description);
    const merged = {
        value: specs.value || descFallback.value,
        voltageRating: specs.voltageRating || descFallback.voltageRating,
        tolerance: specs.tolerance || descFallback.tolerance,
        package: specs.package || descFallback.package,
    };
    console.log(`[Mouser Debug] Extracted Specs (Merged):`, merged);
    return merged;
}
// Fallback: parse from description string (keyword search only)
function extractFromDesc(description) {
    const d = description ?? '';
    const valueMatch = d.match(/\b\d+(?:\.\d+)?\s*(?:nF|uF|µF|pF|mF)\b/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*(?:mH|uH|µH|nH)\b/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*[kKM]?\s*(?:Ω|[Oo]hms?)\b/) ||
        d.match(/\b\d+(?:\.\d+)?\s*[kKM]\b(?!\s*(?:Hz|W|V|ohm))/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*(?:Hz|MHz|kHz)\b/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*(?:A|mA)\b/i);
    const value = valueMatch ? valueMatch[0].trim() : null;
    const voltageMatch = d.match(/\b\d+(?:\.\d+)?\s*V(?:DC|AC)?\b/i);
    const voltageRating = voltageMatch ? voltageMatch[0].trim() : null;
    const toleranceMatch = d.match(/[±]?\s*\d+(?:\.\d+)?\s*%/) || d.match(/\b\d+ppm\b/i);
    const tolerance = toleranceMatch ? toleranceMatch[0].trim() : null;
    const packageMatch = d.match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512|SOT-\d+|SOIC-?\d*|SOP-?\d*|DIP-?\d*|QFN-?\d*|QFP-?\d*|BGA-?\d*|TO-\d+|DO-\d+|SC-\d+|TSSOP-?\d*|LQFP-?\d*|WLCSP-?\d*|SOD-?\d*)\b/i);
    const pkg = packageMatch ? packageMatch[0].toUpperCase() : null;
    return { value, voltageRating, tolerance, package: pkg };
}
function summarize(part, qty = 1) {
    const attrs = part.ProductAttributes ?? [];
    console.log(`[Mouser Debug] Raw Attrs Map for ${part.ManufacturerPartNumber}:`, attrs.reduce((acc, a) => ({ ...acc, [String(a.AttributeName)]: a.AttributeValue }), {}));
    const breaks = normalizePriceBreaks(part.PriceBreaks ?? []);
    let price = null;
    for (const br of [...breaks].sort((a, b) => b.qtyFrom - a.qtyFrom)) {
        if (br.qtyFrom <= qty) {
            price = br.unitPrice;
            break;
        }
    }
    if (price === null && breaks.length)
        price = breaks[0]?.unitPrice ?? null;
    const moq = breaks.length ? Math.min(...breaks.map(b => b.qtyFrom ?? 0)) : null;
    const specKeywords = [
        'resistance', 'capacitance', 'inductance', 'tolerance', 'voltage rating',
        'case code', 'package / case', 'package/case', 'supply voltage', 'operating supply voltage',
        'mounting style', 'frequency', 'output voltage', 'input voltage', 'zener voltage', 'voltage - output', 'voltage - input',
        'dc reverse voltage', 'reverse voltage', 'forward voltage', 'voltage - dc reverse', 'voltage - max', 'current - hold'
    ];
    const specs = extractFromAttrs(attrs, String(part.Description ?? ''));
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
    };
}
// POST /mouser/search — keyword or PN search
// Body: { keyword?: string, pn?: string, qty?: number, limit?: number }
mouser.post('/search', async (c) => {
    const { keyword, pn, qty = 1, limit = 10 } = await c.req.json();
    if (!keyword && !pn)
        return c.json({ error: 'keyword or pn required' }, 400);
    const key = getKey();
    let parts = [];
    const searchTerm = (pn || keyword || '').trim();
    const looksLikeMpn = !searchTerm.includes(' ');
    if (pn || looksLikeMpn) {
        // Part-number search returns full ProductAttributes (specs)
        const res = await fetch(`${BASE}/search/partnumber?apiKey=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                SearchByPartRequest: { mouserPartNumber: searchTerm, partSearchOptions: '' }
            }),
        });
        if (!res.ok)
            return c.json({ error: `Mouser API error ${res.status}` }, 502);
        const data = await res.json();
        parts = data.SearchResults?.Parts ?? [];
    }
    // Fallback to keyword search if no results (or multi-word query)
    if (parts.length === 0 && keyword) {
        const res = await fetch(`${BASE}/search/keyword?apiKey=${key}`, {
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
        });
        if (!res.ok)
            return c.json({ error: `Mouser API error ${res.status}` }, 502);
        const data = await res.json();
        parts = data.SearchResults?.Parts ?? [];
    }
    return c.json({
        items: parts.slice(0, limit).map(p => summarize(p, qty)),
        total: parts.length,
    });
});
// GET /mouser/healthz
mouser.get('/healthz', (c) => {
    const configured = !!process.env.MOUSER_API_KEY;
    return c.json({ ok: configured, configured });
});
export default mouser;
