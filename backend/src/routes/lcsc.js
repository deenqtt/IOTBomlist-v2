import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
const lcsc = new Hono();
lcsc.use('*', authMiddleware);
const SIDECAR = process.env.JLC_SIDECAR_URL ?? 'http://localhost:8089';
// Parse value, voltageRating, tolerance, package from description string
function extractSpecsFromDesc(description) {
    const d = description ?? '';
    const valueMatch = d.match(/\b\d+(?:\.\d+)?\s*(?:nF|uF|µF|pF|mF)\b/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*(?:mH|uH|µH|nH)\b/i) ||
        d.match(/\b\d+(?:\.\d+)?\s*[kKM]?\s*(?:Ω|[Oo]hms?)\b/) ||
        d.match(/\b\d+(?:\.\d+)?\s*[kKM]\b(?!\s*(?:Hz|W|V|ohm))/i);
    const value = valueMatch ? valueMatch[0].trim() : null;
    const voltageMatch = d.match(/\b\d+(?:\.\d+)?\s*V(?:DC)?\b/i);
    const voltageRating = voltageMatch ? voltageMatch[0].trim() : null;
    const toleranceMatch = d.match(/[±]?\s*\d+(?:\.\d+)?\s*%/);
    const tolerance = toleranceMatch ? toleranceMatch[0].trim() : null;
    const packageMatch = d.match(/\b(0201|0402|0603|0805|1206|1210|2010|2512|SOT-\d+|SOIC-?\d*|SOP-?\d*|DIP-?\d*|QFN-?\d*|QFP-?\d*|BGA-?\d*|TO-\d+|DO-\d+|SC-\d+|TSSOP-?\d*|LQFP-?\d*|WLCSP-?\d*)\b/i);
    const pkg = packageMatch ? packageMatch[0].toUpperCase() : null;
    return { value, voltageRating, tolerance, package: pkg };
}
// Extract specs from raw.parameters array (structured data — more accurate than regex)
// Confirmed field names from JLC API: parameterName, parameterValue
function extractFromParameters(params) {
    const get = (names) => {
        const found = params.find(p => names.some(n => p.parameterName.toLowerCase().includes(n.toLowerCase())));
        return found?.parameterValue?.trim() || null;
    };
    return {
        value: get(['capacitance', 'resistance', 'inductance', 'current rating', 'power rating']),
        voltageRating: get(['voltage rating', 'voltage - rated', 'voltage']),
        tolerance: get(['tolerance']),
    };
}
// Extract manufacturer from dataManualUrl filename
// URL format: .../lcsc_datasheet_{date}_{Manufacturer-Name}-{MPN}_{LCSC}.pdf
// e.g. Samsung-Electro-Mechanics-CL10A105KP8NNNC_C26413.pdf → "Samsung Electro-Mechanics"
function extractManufacturerFromUrl(url, mpn) {
    if (!url || !mpn)
        return null;
    try {
        const filename = url.split('/').pop() ?? '';
        // Strip prefix: lcsc_datasheet_<digits>_
        const afterPrefix = filename.replace(/^lcsc_datasheet_\d+_/, '');
        // Strip suffix: _<LCSC_code>.pdf
        const withoutSuffix = afterPrefix.replace(/_C\d+\.pdf$/i, '');
        // withoutSuffix = "Samsung-Electro-Mechanics-CL10A105KP8NNNC"
        // Strip "-{MPN}" from end (MPN may contain dashes/dots, escape for regex)
        const mpnEscaped = mpn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[\\-]');
        const withoutMpn = withoutSuffix.replace(new RegExp(`-?${mpnEscaped}$`, 'i'), '');
        if (!withoutMpn)
            return null;
        // Replace dashes with spaces, clean up
        return withoutMpn.replace(/-/g, ' ').trim() || null;
    }
    catch {
        return null;
    }
}
// Normalize a single sidecar Part item
// Confirmed raw field names from JLC API log:
//   componentCode, componentModel, componentSpecification (package),
//   firstTypeName, secondTypeName, description, datasheetUrl,
//   parameters (array of {parameterName, parameterValue}), dataManualUrl
function normalizeLcscItem(item) {
    const raw = (item.raw ?? {});
    const description = item.description
        ?? raw.description
        ?? null;
    // raw.componentSpecification = confirmed package field (e.g. "1206", "0603")
    const packageInfo = item.package
        ?? raw.componentSpecification
        ?? null;
    // Extract manufacturer from dataManualUrl filename (JLC API has no dedicated brand field)
    const mpn = item.mpn ?? raw.componentModel ?? '';
    const dataManualUrl = raw.dataManualUrl ?? '';
    // Manufacturer: get from item or extract from dataManualUrl, then strip JLCPCB internal prefix
    // e.g. "2210171730_ElecSuper" → "ElecSuper"
    const rawMfr = item.manufacturer
        ?? extractManufacturerFromUrl(dataManualUrl, mpn)
        ?? null;
    const manufacturer = rawMfr ? (rawMfr.replace(/^\d+_/, '').trim() || null) : null;
    // category: raw.firstTypeName / secondTypeName (confirmed)
    const catFromRaw = [raw.firstTypeName, raw.secondTypeName].filter(Boolean).join(' / ') || null;
    const category = item.category ?? catFromRaw;
    // Datasheet: prefer public dataManualUrl (lcsc.com) over jlcpcb.com internal API URL
    const jlcDatasheet = raw.datasheetUrl ?? item.datasheet ?? null;
    const publicDatasheet = raw.dataManualUrl ?? null;
    const datasheet = publicDatasheet ?? jlcDatasheet ?? null;
    // Purchase URL: construct from LCSC C-code (sidecar does not return purchase URL)
    const lcscCode = item.lcsc ?? null;
    const purchaseUrl = lcscCode ? `https://www.lcsc.com/product-detail/${lcscCode}.html` : null;
    // specs: prefer structured parameters array, fallback to regex on description
    const params = raw.parameters ?? [];
    const structuredSpecs = params.length > 0
        ? extractFromParameters(params)
        : { value: null, voltageRating: null, tolerance: null };
    if (params.length > 0) {
        console.log(`[LCSC Debug] Extracted Specs from ${params.length} parameters:`, structuredSpecs);
    }
    const descSpecs = description ? extractSpecsFromDesc(description) : { value: null, voltageRating: null, tolerance: null, package: null };
    return {
        ...item,
        description: description ?? undefined,
        package: packageInfo ?? descSpecs.package ?? undefined,
        manufacturer: manufacturer ?? undefined,
        category: category ?? undefined,
        datasheet: datasheet ?? undefined,
        url: purchaseUrl ?? undefined, // purchase URL, not datasheet
        value: item.value ?? structuredSpecs.value ?? descSpecs.value ?? undefined,
        voltageRating: item.voltageRating ?? structuredSpecs.voltageRating ?? descSpecs.voltageRating ?? undefined,
        tolerance: item.tolerance ?? structuredSpecs.tolerance ?? descSpecs.tolerance ?? undefined,
        quantity_available: item.quantity_available
            ?? item.quantityAvailable
            ?? null,
        raw: undefined,
    };
}
// POST /lcsc/lookup — forward to Java sidecar + normalize response
// Body: { items: [{ lcsc?: string, pn?: string, qty?: number }] }
lcsc.post('/lookup', async (c) => {
    const body = await c.req.json();
    if (!body?.items?.length)
        return c.json({ error: 'items[] required' }, 400);
    const res = await fetch(`${SIDECAR}/component/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).catch(e => { throw new Error(`Sidecar unreachable: ${e.message}`); });
    if (!res.ok)
        return c.json({ error: `Sidecar error ${res.status}` }, 502);
    const data = await res.json();
    const normalized = {
        ...data,
        items: (data.items ?? []).map(normalizeLcscItem),
    };
    return c.json(normalized);
});
// POST /lcsc/search — keyword search via public proxy
// Body: { keyword: string, limit?: number }
lcsc.post('/search', async (c) => {
    const { keyword, limit = 10 } = await c.req.json();
    if (!keyword)
        return c.json({ error: 'keyword required' }, 400);
    // Use jlcsearch.tscircuit.com as a public proxy for LCSC/JLCPCB parts
    const url = `https://jlcsearch.tscircuit.com/components/list.json?search=${encodeURIComponent(keyword)}`;
    const res = await fetch(url).catch(e => {
        throw new Error(`LCSC search proxy unreachable: ${e.message}`);
    });
    if (!res.ok)
        return c.json({ error: `Search proxy error ${res.status}` }, 502);
    const data = await res.json();
    const items = (data.components ?? []).slice(0, limit).map(comp => {
        // Parse price breaks from JSON string
        let priceBreaks = null;
        let price = null;
        try {
            const parsed = JSON.parse(comp.price || '[]');
            priceBreaks = parsed.map((pb) => ({
                qtyFrom: pb.qFrom,
                qtyTo: pb.qTo || null,
                unitPrice: pb.price
            }));
            if (priceBreaks && priceBreaks.length > 0) {
                price = priceBreaks[0].unitPrice;
            }
        }
        catch (e) {
            console.error('[LCSC Search] Failed to parse price:', comp.price);
        }
        const lcscCode = `C${comp.lcsc}`;
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
        };
    });
    return c.json({ items, total: items.length });
});
// GET /lcsc/healthz — check sidecar alive
lcsc.get('/healthz', async (c) => {
    const res = await fetch(`${SIDECAR}/healthz`).catch(() => null);
    return c.json({ ok: !!res?.ok, sidecar: SIDECAR });
});
export default lcsc;
