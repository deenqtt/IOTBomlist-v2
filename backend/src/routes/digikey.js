import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
const digikey = new Hono();
digikey.use('*', authMiddleware);
const TOKEN_URL = 'https://api.digikey.com/v1/oauth2/token';
const API_HOST = 'https://api.digikey.com';
// Simple in-memory token cache
let cachedToken = null;
function getCreds() {
    const clientId = process.env.DIGIKEY_CLIENT_ID ?? '';
    const clientSecret = process.env.DIGIKEY_CLIENT_SECRET ?? '';
    if (!clientId || !clientSecret)
        throw new Error('DIGIKEY_CLIENT_ID / DIGIKEY_CLIENT_SECRET not configured');
    return { clientId, clientSecret };
}
async function getToken() {
    const now = Date.now() / 1000;
    if (cachedToken && cachedToken.expiresAt > now + 30)
        return cachedToken.token;
    const { clientId, clientSecret } = getCreds();
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        }),
    });
    if (!res.ok)
        throw new Error(`DigiKey token error ${res.status}`);
    const data = await res.json();
    const token = String(data.access_token ?? '');
    const ttl = Number(data.expires_in ?? 540);
    cachedToken = { token, expiresAt: now + ttl };
    return token;
}
function makeHeaders(token, clientId) {
    return {
        Authorization: `Bearer ${token}`,
        'X-DIGIKEY-Client-Id': clientId,
        'X-DIGIKEY-Locale-Site': 'US',
        'X-DIGIKEY-Locale-Language': 'en',
        'X-DIGIKEY-Locale-Currency': 'USD',
        'Content-Type': 'application/json',
    };
}
function safeFloat(v) {
    const n = Number(v);
    return isNaN(n) ? null : n;
}
function normalizePriceBreaks(pricing) {
    return (pricing ?? []).flatMap(br => {
        const q = safeFloat(br.BreakQuantity);
        const p = safeFloat(br.UnitPrice);
        return q !== null && p !== null ? [{ qtyFrom: q, qtyTo: null, unitPrice: p }] : [];
    });
}
function pickVariation(variations) {
    if (!variations?.length)
        return { variation: null, price: null, moq: null, breaks: null };
    // Pick variation with lowest MOQ → lowest price
    let best = null;
    let bestMoq = Infinity;
    let bestPrice = null;
    for (const v of variations) {
        const pricing = v.StandardPricing ?? [];
        const moq = safeFloat(v.MinimumOrderQuantity) ?? (pricing[0] ? safeFloat(pricing[0].BreakQuantity) : null) ?? 1;
        const price = pricing.length ? (safeFloat(pricing[0]?.UnitPrice) ?? null) : null;
        if ((moq ?? Infinity) < bestMoq || (moq === bestMoq && price !== null && (bestPrice === null || price < bestPrice))) {
            best = v;
            bestMoq = moq ?? Infinity;
            bestPrice = price;
        }
    }
    if (!best)
        return { variation: null, price: null, moq: null, breaks: null };
    const breaks = normalizePriceBreaks(best.StandardPricing ?? []);
    return { variation: best, price: bestPrice, moq: bestMoq, breaks: breaks.length ? breaks : null };
}
// DigiKey v4 uses ParameterText / ValueText (not Parameter / Value)
const DK_VALUE_PARAMS = [
    'resistance in ohms @ 25°c', 'resistance', 'capacitance', 'inductance',
    'current rating', 'current - output', 'frequency', 'voltage', 'power (watts)', 'forward voltage (vf) (typ) @ if',
    'current - hold (ih) (max)', 'current - trip (it)'
];
const DK_VOLTAGE_PARAMS = [
    'voltage - rated', 'voltage rating', 'voltage - input', 'voltage - output',
    'voltage - collector emitter breakdown (max)', 'voltage - supply',
    'voltage - isolation', 'voltage - input (max)', 'voltage - output (min/fixed)', 'voltage - output (max)',
    'voltage - max'
];
const DK_TOLERANCE_PARAMS = ['resistance tolerance', 'capacitance tolerance', 'tolerance', 'frequency stability'];
const DK_PACKAGE_PARAMS = ['package / case', 'supplier device package', 'case / package', 'mounting type'];
function extractSpecsDk(params) {
    const map = new Map(params.map(p => [p.ParameterText?.toLowerCase().trim(), p.ValueText?.trim()]));
    let value;
    for (const k of DK_VALUE_PARAMS) {
        const v = map.get(k);
        if (v && v !== '-') {
            value = v;
            break;
        }
    }
    let voltageRating;
    for (const k of DK_VOLTAGE_PARAMS) {
        const v = map.get(k);
        if (v && v !== '-') {
            voltageRating = v;
            break;
        }
    }
    let tolerance;
    for (const k of DK_TOLERANCE_PARAMS) {
        const v = map.get(k);
        if (v && v !== '-') {
            tolerance = v;
            break;
        }
    }
    let pkg;
    for (const k of DK_PACKAGE_PARAMS) {
        const v = map.get(k);
        if (v && v !== '-') {
            pkg = v;
            break;
        }
    }
    const specs = { value, voltageRating, tolerance, package: pkg };
    console.log(`[DigiKey Debug] Raw Params Map:`, Object.fromEntries(map));
    console.log(`[DigiKey Debug] Extracted Specs from ${map.size} params:`, specs);
    return specs;
}
// Fallback: parse from description string (if structured params are missing)
function extractFromDescDk(description) {
    const d = description ?? '';
    const valueMatch = d.match(/\b\d+(?:\.\d+)?\s*(?:nF|uF|µF|pF|mF)\b/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*(?:mH|uH|µH|nH)\b/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*[kKM]?\s*(?:Ω|[Oo]hms?)\b/) ||
        d.match(/\b\d+(?:\.\d+)?\s*[kKM]\b(?!\s*(?:Hz|W|V|ohm))/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*(?:Hz|MHz|kHz)\b/i);
    const value = valueMatch ? valueMatch[0].trim() : null;
    const voltageMatch = d.match(/\b\d+(?:\.\d+)?\s*V(?:DC|AC)?\b/i);
    const voltageRating = voltageMatch ? voltageMatch[0].trim() : null;
    const toleranceMatch = d.match(/[±]?\s*\d+(?:\.\d+)?\s*%/) || d.match(/\b\d+ppm\b/i);
    const tolerance = toleranceMatch ? toleranceMatch[0].trim() : null;
    const packageMatch = d.match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512|SOT-\d+|SOIC-?\d*|SOP-?\d*|DIP-?\d*|QFN-?\d*|QFP-?\d*|BGA-?\d*|TO-\d+|DO-\d+|SC-\d+|TSSOP-?\d*|LQFP-?\d*|WLCSP-?\d*|SOD-?\d*)\b/i);
    const pkg = packageMatch ? packageMatch[0].toUpperCase() : null;
    return { value, voltageRating, tolerance, package: pkg };
}
function summarize(product, qty = 1) {
    const mfr = product.Manufacturer?.Name;
    const descRaw = product.Description;
    const description = (descRaw?.DetailedDescription ?? descRaw?.ProductDescription);
    const status = product.ProductStatus?.Status;
    const cat = product.Category?.Name;
    const variations = product.ProductVariations ?? [];
    const { variation, price, moq, breaks } = pickVariation(variations);
    const dkPn = variation ? variation.DigiKeyProductNumber : null;
    const rawParams = product.Parameters ?? [];
    const structuredSpecs = extractSpecsDk(rawParams);
    // If structured specs are missing voltage or package, try parsing from description
    const fallbackSpecs = (!structuredSpecs.voltageRating || !structuredSpecs.package)
        ? extractFromDescDk(description ?? '')
        : { value: null, voltageRating: null, tolerance: null, package: null };
    const specs = {
        value: structuredSpecs.value || fallbackSpecs.value,
        voltageRating: structuredSpecs.voltageRating || fallbackSpecs.voltageRating,
        tolerance: structuredSpecs.tolerance || fallbackSpecs.tolerance,
        package: structuredSpecs.package || fallbackSpecs.package,
    };
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
        ...specs,
    };
}
// POST /digikey/search
// Body: { keyword?: string, pn?: string, qty?: number, limit?: number }
digikey.post('/search', async (c) => {
    const { keyword, pn, qty = 1, limit = 10 } = await c.req.json();
    if (!keyword && !pn)
        return c.json({ error: 'keyword or pn required' }, 400);
    const { clientId } = getCreds();
    const token = await getToken();
    const headers = makeHeaders(token, clientId);
    const searchTerm = pn ?? keyword;
    const res = await fetch(`${API_HOST}/products/v4/search/keyword`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ Keywords: String(searchTerm).trim(), Limit: limit, Offset: 0, Includes: ['Parameters'] }),
    });
    if (!res.ok) {
        const text = await res.text();
        return c.json({ error: `DigiKey API error ${res.status}: ${text.slice(0, 200)}` }, 502);
    }
    const data = await res.json();
    const exactMatches = data.ExactMatches ?? [];
    const allProducts = data.Products ?? [];
    const products = exactMatches.length > 0 ? exactMatches : allProducts;
    return c.json({
        items: products.slice(0, limit).map(p => summarize(p, qty)),
        total: products.length,
    });
});
// GET /digikey/healthz
digikey.get('/healthz', (c) => {
    const configured = !!(process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET);
    return c.json({ ok: configured, configured });
});
export default digikey;
