import { Hono } from "hono";
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync, existsSync, unlinkSync, } from "fs";
import { join, extname } from "path";
import prisma from "../lib/prisma";
import { authMiddleware, requireRole } from "../middleware/auth";
import { logChange } from "../lib/changelog";
const products = new Hono();
products.use("*", authMiddleware);
products.get("/", async (c) => {
    const q = c.req.query("q");
    const skip = Number(c.req.query("skip") || 0);
    const limit = Number(c.req.query("limit") || 200);
    const where = q
        ? { name: { contains: q, mode: "insensitive" } }
        : undefined;
    const [data, total] = await Promise.all([
        prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy: { name: "asc" },
            include: { _count: { select: { items: true } } },
        }),
        prisma.product.count({ where }),
    ]);
    return c.json({ data, total, skip, limit });
});
// All BOM rows across all products (for Products tab table)
products.get("/bom-rows", async (c) => {
    const productId = c.req.query("productId")
        ? Number(c.req.query("productId"))
        : undefined;
    const q = c.req.query("q");
    const skip = Number(c.req.query("skip") || 0);
    const limit = Number(c.req.query("limit") || 200);
    const where = {
        AND: [
            productId ? { productId } : {},
            q
                ? {
                    OR: [
                        {
                            item: {
                                partNumber: { contains: q, mode: "insensitive" },
                            },
                        },
                        {
                            item: {
                                productName: { contains: q, mode: "insensitive" },
                            },
                        },
                        { stableId: { contains: q, mode: "insensitive" } },
                    ],
                }
                : {},
        ],
    };
    const [data, total] = await Promise.all([
        prisma.productItem.findMany({
            where,
            skip,
            take: limit,
            orderBy: [{ product: { name: "asc" } }, { stableId: "asc" }],
            include: {
                product: { select: { id: true, name: true } },
                item: {
                    select: {
                        stableId: true,
                        partNumber: true,
                        productName: true,
                        value: true,
                        category: true,
                        package: true,
                        priceMin: true,
                        priceCurrency: true,
                        suppliers: true,
                        supplierPrices: true,
                        links: true,
                        stockCode: true,
                    },
                },
            },
        }),
        prisma.productItem.count({ where }),
    ]);
    // In-memory enrichment for effective price
    const enriched = data.map((row) => ({
        ...row,
        ...getEffectiveSupplier(row.item),
    }));
    return c.json({ data: enriched, total, skip, limit });
});
/**
 * Smart Price & Supplier Resolver:
 * 1. Checks supplierPrices JSON for any supplier with stock > 0.
 * 2. If multiple have stock, picks the cheapest among them.
 * 3. Returns the price AND the name of the winning supplier.
 */
function getEffectiveSupplier(item) {
    if (!item.supplierPrices) {
        return {
            price: item.priceMin,
            supplier: null,
            supplierStock: null,
            hasStockData: false,
        };
    }
    try {
        const spMap = JSON.parse(item.supplierPrices);
        const entries = Object.entries(spMap);
        let bestPrice = Infinity;
        let bestSup = null;
        let bestStock = null;
        let hasStockData = false;
        for (const [key, s] of entries) {
            // Tandai kalau ada minimal satu supplier dengan field quantity_available
            if (s.quantity_available !== undefined && s.quantity_available !== null) {
                hasStockData = true;
            }
            if (s.price != null && (s.quantity_available ?? 0) > 0) {
                if (s.price < bestPrice) {
                    bestPrice = s.price;
                    bestSup = key;
                    bestStock = Number(s.quantity_available);
                }
            }
        }
        if (!bestSup) {
            for (const [key, s] of entries) {
                if (s.price != null) {
                    if (s.price < bestPrice) {
                        bestPrice = s.price;
                        bestSup = key;
                        bestStock =
                            s.quantity_available !== undefined &&
                                s.quantity_available !== null
                                ? Number(s.quantity_available) // ← ganti ini
                                : null;
                    }
                }
            }
        }
        if (bestSup) {
            return {
                price: bestPrice,
                supplier: bestSup,
                supplierStock: bestStock,
                hasStockData,
            };
        }
    }
    catch {
        /* ignore */
    }
    return {
        price: item.priceMin,
        supplier: null,
        supplierStock: null,
        hasStockData: false,
    };
}
// Get purchase URL — uses the effective supplier's URL if available, else falls back to priority
function getPurchaseUrl(supplierPrices, links, effectiveSup) {
    if (supplierPrices) {
        try {
            const sp = JSON.parse(supplierPrices);
            if (effectiveSup && sp[effectiveSup]?.url)
                return sp[effectiveSup].url;
            return (sp.lcsc?.url || sp.mouser?.url || sp.digikey?.url || sp.other?.url || "");
        }
        catch {
            /* ignore */
        }
    }
    return links || "";
}
// Product usage in sets
products.get("/usage-in-sets", async (c) => {
    const ids = c.req.query("ids")?.split(",").map(Number).filter(Boolean) ?? [];
    if (!ids.length)
        return c.json([]);
    const setItems = await prisma.configSetItem.findMany({
        where: { mainProductId: { in: ids } },
        include: {
            set: { select: { id: true, name: true } },
        },
        orderBy: [{ set: { name: "asc" } }],
    });
    const productMap = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
    });
    const nameById = Object.fromEntries(productMap.map((p) => [p.id, p.name]));
    return c.json(setItems.map((si) => ({
        setId: si.setId,
        setName: si.set.name,
        productId: si.mainProductId,
        productName: nameById[si.mainProductId] ?? String(si.mainProductId),
        qty: si.qty,
        op: si.op,
    })));
});
// Clone product (copy BOM rows to new product)
products.post("/:id/clone", requireRole("admin", "super"), async (c) => {
    const sourceId = Number(c.req.param("id"));
    const { name, slug, copyReferences = true } = await c.req.json();
    if (!name?.trim())
        return c.json({ error: "Name required" }, 400);
    const exists = await prisma.product.findUnique({
        where: { name: name.trim() },
    });
    if (exists)
        return c.json({ error: "Product already exists" }, 409);
    const sourceBom = await prisma.productItem.findMany({
        where: { productId: sourceId },
    });
    const newProduct = await prisma.product.create({
        data: {
            name: name.trim(),
            slug: slug?.trim() || null,
            items: {
                create: sourceBom.map((r) => ({
                    stableId: r.stableId,
                    quantitySum: r.quantitySum,
                    references: copyReferences ? r.references : null,
                    notes: r.notes,
                })),
            },
        },
        include: { _count: { select: { items: true } } },
    });
    return c.json(newProduct, 201);
});
// Merge products: reassign set items + delete merged products
products.post("/merge", requireRole("admin", "super"), async (c) => {
    const { keepId, mergeIds } = await c.req.json();
    if (!keepId || !mergeIds?.length)
        return c.json({ error: "keepId and mergeIds required" }, 400);
    let reassignedSets = 0;
    let deletedProducts = 0;
    for (const oldId of mergeIds) {
        if (oldId === keepId)
            continue;
        // Reassign ConfigSetItems
        const updated = await prisma.configSetItem.updateMany({
            where: { mainProductId: oldId },
            data: { mainProductId: keepId },
        });
        reassignedSets += updated.count;
        // Remove duplicate ConfigSetItems (same set + keepId might now appear twice)
        const dupes = await prisma.configSetItem.findMany({
            where: { mainProductId: keepId },
            orderBy: [{ setId: "asc" }, { orderIndex: "asc" }],
        });
        const seen = new Map(); // setId → first item id
        for (const d of dupes) {
            if (seen.has(d.setId)) {
                await prisma.configSetItem.delete({ where: { id: d.id } });
            }
            else {
                seen.set(d.setId, d.id);
            }
        }
        // Delete merged product (cascades ProductItems, ProductRelations)
        await prisma.product.delete({ where: { id: oldId } });
        deletedProducts++;
    }
    return c.json({ keepId, deletedProducts, reassignedSets });
});
products.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const product = await prisma.product.findUnique({
        where: { id },
        include: { _count: { select: { items: true } } },
    });
    if (!product)
        return c.json({ error: "Not found" }, 404);
    return c.json(product);
});
products.post("/", requireRole("admin", "super"), async (c) => {
    const { name, slug } = await c.req.json();
    const user = c.get('user');
    const exists = await prisma.product.findUnique({ where: { name } });
    if (exists)
        return c.json({ error: "Product already exists" }, 409);
    const product = await prisma.product.create({ data: { name, slug } });
    await logChange({
        entity: 'product',
        entityId: product.id,
        field: 'all',
        oldValue: null,
        newValue: product.name,
        changedBy: user.username,
        context: 'Create PCB'
    });
    return c.json(product, 201);
});
products.post("/import", requireRole("admin", "super"), async (c) => {
    const { name, items } = await c.req.json();
    if (!name?.trim())
        return c.json({ error: "Product name required" }, 400);
    if (!Array.isArray(items) || !items.length)
        return c.json({ error: "Items array required" }, 400);
    // 1. Create the product
    const exists = await prisma.product.findUnique({
        where: { name: name.trim() },
    });
    if (exists)
        return c.json({ error: `Product "${name}" already exists` }, 409);
    const product = await prisma.product.create({
        data: { name: name.trim() },
    });
    const results = {
        productId: product.id,
        added: 0,
        notFound: [],
        errors: [],
    };
    // 2. Add items to the product
    for (const entry of items) {
        const { identifier, quantity, references, notes } = entry;
        if (!identifier)
            continue;
        try {
            const masterItem = await prisma.item.findFirst({
                where: {
                    OR: [
                        { stableId: identifier },
                        {
                            partNumber: { equals: identifier, mode: "insensitive" },
                        },
                    ],
                },
            });
            if (!masterItem) {
                results.notFound.push(identifier);
                continue;
            }
            await prisma.productItem.create({
                data: {
                    productId: product.id,
                    stableId: masterItem.stableId,
                    quantitySum: Number(quantity) || 0,
                    references: references || null,
                    notes: notes || null,
                },
            });
            results.added++;
        }
        catch (e) {
            results.errors.push(`${identifier}: ${e.message}`);
        }
    }
    return c.json(results, 201);
});
// Dry-run: analyze import items — returns matched/notFound without modifying DB
// Extract MPN from description column — BOM description format: "MPN; full description..."
// Also handles "MPN (extra info)" or just "MPN"
function extractMpnFromDescription(desc) {
    if (!desc)
        return null;
    // 1. Split by semicolon if exists (Standard format)
    let mpn = (desc.split(";")[0] ?? "").trim();
    // 2. Remove anything in brackets: "PartNumber (Description)" -> "PartNumber"
    mpn = mpn.replace(/\(.*\)/g, "").trim();
    // 3. If there's still a space, take the first word (usually the MPN)
    if (mpn.includes(" ")) {
        mpn = mpn.split(" ")[0].trim();
    }
    // Basic validation: must have at least one letter and one number to be a plausible MPN
    return mpn && /[A-Za-z]/.test(mpn) && /\d/.test(mpn) ? mpn : null;
}
// Extract LCSC C-code from URL — e.g. https://lcsc.com/...C8389.html → "C8389"
function extractLcscCode(url) {
    if (!url)
        return null;
    const m = url.match(/_(C\d+)\.html/i) ?? url.match(/\b(C\d{4,})\b/i) ?? null;
    return m?.[1]?.toUpperCase() ?? null;
}
products.post("/import/analyze", requireRole("admin", "super"), async (c) => {
    const { items } = await c.req.json();
    if (!Array.isArray(items) || !items.length)
        return c.json({ error: "items array required" }, 400);
    const matched = [];
    const notFound = [];
    for (const entry of items) {
        const { identifier, qty, description, url } = entry;
        if (!identifier)
            continue;
        // Extract alternate search identifiers from description & URL columns
        const resolvedMpn = extractMpnFromDescription(description ?? "") ?? undefined;
        const lcscCode = extractLcscCode(url ?? "") ?? undefined;
        // Build OR conditions: original identifier + MPN from description + C-code from URL
        const identifierLower = identifier
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
        const orConditions = [
            { stableId: identifier },
            { stableId: identifierLower },
            { partNumber: { equals: identifier, mode: "insensitive" } },
        ];
        if (resolvedMpn && resolvedMpn !== identifier) {
            orConditions.push({
                partNumber: { equals: resolvedMpn, mode: "insensitive" },
            });
            const resolvedLower = resolvedMpn
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "");
            orConditions.push({ stableId: resolvedLower });
        }
        // Strip numeric prefix (e.g. "667-ERJ-3EKF10R0V" → "ERJ-3EKF10R0V")
        const stripped = identifier.replace(/^\d+[-_]/, "");
        if (stripped !== identifier) {
            const strippedLower = stripped
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "");
            orConditions.push({ stableId: strippedLower });
            orConditions.push({
                partNumber: { equals: stripped, mode: "insensitive" },
            });
        }
        if (lcscCode) {
            orConditions.push({
                stockCode: { equals: lcscCode, mode: "insensitive" },
            });
            orConditions.push({ links: { contains: lcscCode } });
            orConditions.push({ supplierPrices: { contains: lcscCode } });
        }
        let item = await prisma.item.findFirst({
            where: { OR: orConditions },
            select: {
                stableId: true,
                partNumber: true,
                productName: true,
                manufacturer: true,
                value: true,
                package: true,
            },
        });
        // Fallback: normalize both sides (remove all non-alphanumeric) and compare
        // Handles cases like "WP937MD2EGW" vs "WP937MD/2EGW" in DB
        if (!item) {
            const candidates = [identifier, stripped, resolvedMpn].filter(Boolean);
            for (const candidate of candidates) {
                const normalized = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (!normalized)
                    continue;
                const rows = await prisma.$queryRaw `
          SELECT stable_id FROM items
          WHERE regexp_replace(lower(part_number), '[^a-z0-9]', '', 'g') = ${normalized}
          LIMIT 1
        `;
                if (rows[0]) {
                    item = await prisma.item.findUnique({
                        where: { stableId: rows[0].stable_id },
                        select: {
                            stableId: true,
                            partNumber: true,
                            productName: true,
                            manufacturer: true,
                            value: true,
                            package: true,
                        },
                    });
                    if (item)
                        break;
                }
            }
        }
        if (item) {
            matched.push({
                identifier,
                stableId: item.stableId,
                partNumber: item.partNumber,
                productName: item.productName,
                qty,
                resolvedMpn,
                lcscCode,
            });
        }
        else {
            notFound.push({ identifier, qty, resolvedMpn, lcscCode });
        }
    }
    return c.json({ matched, notFound });
});
// Import reference designators into existing product's BOM items
// Body: { items: [{ identifier: string, lcscCode?: string, designators: string }] }
// identifier = MPN or PN GSPE or stableId; designators = "R1, R2, C1"
products.post("/:id/import-references", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const { items } = await c.req.json();
    if (!Array.isArray(items) || !items.length)
        return c.json({ error: "items array required" }, 400);
    const product = await prisma.product.findUnique({
        where: { id: productId },
    });
    if (!product)
        return c.json({ error: "Product not found" }, 404);
    const results = { updated: 0, notFound: [] };
    for (const entry of items) {
        const { identifier, lcscCode, designators } = entry;
        if (!identifier || !designators)
            continue;
        const orConditions = [
            { stableId: identifier },
            { partNumber: { equals: identifier, mode: "insensitive" } },
        ];
        if (lcscCode) {
            orConditions.push({
                stockCode: { equals: lcscCode, mode: "insensitive" },
            });
            orConditions.push({ supplierPrices: { contains: lcscCode } });
        }
        const masterItem = await prisma.item.findFirst({
            where: { OR: orConditions },
            select: { stableId: true },
        });
        if (!masterItem) {
            results.notFound.push(identifier);
            continue;
        }
        const updated = await prisma.productItem.updateMany({
            where: { productId, stableId: masterItem.stableId },
            data: { references: String(designators).trim() },
        });
        if (updated.count > 0)
            results.updated++;
        else
            results.notFound.push(identifier);
    }
    return c.json(results);
});
products.patch("/:id", requireRole("admin", "super"), async (c) => {
    const id = Number(c.req.param("id"));
    const user = c.get('user');
    const data = await c.req.json();
    const old = await prisma.product.findUnique({ where: { id } });
    if (!old)
        return c.json({ error: 'Not found' }, 404);
    const product = await prisma.product.update({ where: { id }, data });
    for (const field of Object.keys(data)) {
        const ov = old[field];
        const nv = data[field];
        if (String(ov) !== String(nv)) {
            await logChange({
                entity: 'product',
                entityId: id,
                field,
                oldValue: ov ? String(ov) : null,
                newValue: nv ? String(nv) : null,
                changedBy: user.username,
                context: 'Update PCB Metadata'
            });
        }
    }
    return c.json(product);
});
products.delete("/:id", requireRole("admin", "super"), async (c) => {
    const id = Number(c.req.param("id"));
    const user = c.get('user');
    const old = await prisma.product.findUnique({ where: { id } });
    if (!old)
        return c.json({ error: 'Not found' }, 404);
    await prisma.product.delete({ where: { id } });
    await logChange({
        entity: 'product',
        entityId: id,
        field: 'all',
        oldValue: old.name,
        newValue: null,
        changedBy: user.username,
        context: 'Delete PCB'
    });
    return c.body(null, 204);
});
products.get("/:id/items", async (c) => {
    const productId = Number(c.req.param("id"));
    const items = await prisma.productItem.findMany({
        where: { productId },
        include: { item: true },
        orderBy: { stableId: "asc" },
    });
    // Enrich with effective price logic (Stock first, then Cheapest)
    const enriched = items.map((pi) => ({
        ...pi,
        ...getEffectiveSupplier(pi.item),
    }));
    return c.json(enriched);
});
products.post("/:id/items", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const user = c.get('user');
    const { stableId, quantitySum, references, notes } = await c.req.json();
    const pi = await prisma.productItem.create({
        data: { productId, stableId, quantitySum, references, notes },
        include: { item: true },
    });
    await logChange({
        entity: 'product',
        entityId: productId,
        field: 'bom',
        oldValue: null,
        newValue: `Added ${stableId} (Qty: ${quantitySum})`,
        changedBy: user.username,
        context: 'Add Item to BOM'
    });
    return c.json(pi, 201);
});
products.patch("/:id/items/:stableId", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const stableId = c.req.param("stableId");
    const user = c.get('user');
    const data = await c.req.json();
    const old = await prisma.productItem.findUnique({
        where: { productId_stableId: { productId, stableId } }
    });
    if (!old)
        return c.json({ error: 'Not found' }, 404);
    const pi = await prisma.productItem.update({
        where: { productId_stableId: { productId, stableId } },
        data,
        include: { item: true },
    });
    for (const field of Object.keys(data)) {
        const ov = old[field];
        const nv = data[field];
        if (String(ov) !== String(nv)) {
            await logChange({
                entity: 'product',
                entityId: productId,
                field: `bom:${stableId}:${field}`,
                oldValue: ov ? String(ov) : null,
                newValue: nv ? String(nv) : null,
                changedBy: user.username,
                context: 'Update BOM Row'
            });
        }
    }
    return c.json(pi);
});
products.delete("/:id/items/:stableId", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const stableId = c.req.param("stableId");
    const user = c.get('user');
    await prisma.productItem.delete({
        where: { productId_stableId: { productId, stableId } },
    });
    await logChange({
        entity: 'product',
        entityId: productId,
        field: 'bom',
        oldValue: `Removed ${stableId}`,
        newValue: null,
        changedBy: user.username,
        context: 'Remove Item from BOM'
    });
    return c.body(null, 204);
});
products.post("/:id/items/bulk-delete", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const user = c.get('user');
    const { stableIds } = await c.req.json();
    if (!Array.isArray(stableIds) || !stableIds.length) {
        return c.json({ error: "stableIds array required" }, 400);
    }
    const result = await prisma.productItem.deleteMany({
        where: {
            productId,
            stableId: { in: stableIds },
        },
    });
    await logChange({
        entity: 'product',
        entityId: productId,
        field: 'bom',
        oldValue: `Bulk deleted ${result.count} items`,
        newValue: null,
        changedBy: user.username,
        context: 'Bulk BOM Removal'
    });
    return c.json({ deletedCount: result.count });
});
products.post("/:id/items/bulk-add", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const user = c.get('user');
    const { items } = await c.req.json();
    if (!Array.isArray(items) || !items.length) {
        return c.json({ error: "items array required" }, 400);
    }
    const results = {
        added: 0,
        updated: 0,
        notFound: [],
        errors: [],
    };
    // Process items sequentially to handle concurrent updates to same productItem correctly
    // or use a transaction if volume is very high. For typical BOMs, this is safer.
    for (const entry of items) {
        const { identifier, quantity, references, notes } = entry;
        if (!identifier)
            continue;
        try {
            // 1. Find the master item by stableId or partNumber
            const masterItem = await prisma.item.findFirst({
                where: {
                    OR: [
                        { stableId: identifier },
                        {
                            partNumber: {
                                equals: identifier,
                                mode: "insensitive",
                            },
                        },
                    ],
                },
            });
            if (!masterItem) {
                results.notFound.push(identifier);
                continue;
            }
            // 2. Check if it already exists in this product's BOM
            const existing = await prisma.productItem.findUnique({
                where: {
                    productId_stableId: {
                        productId,
                        stableId: masterItem.stableId,
                    },
                },
            });
            if (existing) {
                // Update existing: increment quantity and merge references
                let newRefs = existing.references || "";
                if (references) {
                    const currentRefs = newRefs
                        .split(",")
                        .map((r) => r.trim())
                        .filter(Boolean);
                    const addRefs = references
                        .split(",")
                        .map((r) => r.trim())
                        .filter(Boolean);
                    newRefs = Array.from(new Set([...currentRefs, ...addRefs])).join(", ");
                }
                await prisma.productItem.update({
                    where: {
                        productId_stableId: { productId, stableId: masterItem.stableId },
                    },
                    data: {
                        quantitySum: (existing.quantitySum || 0) + (Number(quantity) || 0),
                        references: newRefs || null,
                        notes: notes || existing.notes,
                    },
                });
                results.updated++;
            }
            else {
                // Create new
                await prisma.productItem.create({
                    data: {
                        productId,
                        stableId: masterItem.stableId,
                        quantitySum: Number(quantity) || 0,
                        references: references || null,
                        notes: notes || null,
                    },
                });
                results.added++;
            }
        }
        catch (e) {
            results.errors.push(`${identifier}: ${e.message}`);
        }
    }
    await logChange({
        entity: 'product',
        entityId: productId,
        field: 'bom',
        oldValue: null,
        newValue: `Bulk added/updated items: ${results.added} added, ${results.updated} updated`,
        changedBy: user.username,
        context: 'Bulk BOM Integration'
    });
    return c.json(results);
});
// Export BOM as Excel using company template — ?alt=true uses alternatives
products.get("/:id/export/bom", async (c) => {
    const productId = Number(c.req.param("id"));
    const user = c.get('user');
    const useAlt = c.req.query("alt") === "true";
    if (!user)
        return c.json({ error: 'Unauthorized' }, 401);
    let tempOverrides = {};
    try {
        const tempOverridesStr = c.req.query("tempOverrides");
        if (tempOverridesStr)
            tempOverrides = JSON.parse(decodeURIComponent(tempOverridesStr));
    }
    catch { }
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product)
        return c.json({ error: "Not found" }, 404);
    await logChange({
        entity: 'product',
        entityId: productId,
        field: 'export',
        oldValue: null,
        newValue: `BOM Export (${useAlt ? 'Cost-Down' : 'Normal'})`,
        changedBy: user.username,
        context: 'Data Extraction'
    });
    const bomRows = await prisma.productItem.findMany({
        where: { productId },
        include: { item: true },
        orderBy: { stableId: "asc" },
    });
    const templatePath = join(process.cwd(), "templates", "bom-template.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet("BOM_Template");
    if (!ws) {
        console.error("[EXPORT ERROR] Worksheet BOM_Template NOT FOUND!");
        return c.json({ error: "Template sheet not found" }, 500);
    }
    // Fill metadata — preserve existing cell style
    const today = new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
    ws.getCell("D6").value = today;
    ws.getCell("C9").value = product.name; // Project Name
    ws.getCell("C10").value = product.name; // Product Name
    ws.getCell("H10").value = useAlt ? "BOM ALT" : "BOM";
    const DATA_START_ROW = 12;
    // Pre-fetch all alt items unconditionally so they are available for auto-swapping
    const altItemsCache = new Map();
    const allAltIds = bomRows.flatMap((r) => ((r.item?.alternatives ?? "") + ";" + (r.alternatives ?? ""))
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean));
    const uniqueAltIds = [...new Set(allAltIds)];
    if (uniqueAltIds.length > 0) {
        const fetchedAlts = await prisma.item.findMany({
            where: { stableId: { in: uniqueAltIds } },
        });
        fetchedAlts.forEach((it) => altItemsCache.set(it.stableId, it));
    }
    // Helper: write one data row and apply fill color
    function writeRow(rowNum, no, item, qty, fillArgb) {
        const excelRow = ws.getRow(rowNum);
        const { supplier: winner, } = getEffectiveSupplier(item);
        const purchaseUrl = getPurchaseUrl(item.supplierPrices, item.links, winner);
        let rowFill = fillArgb; // Use passed color directly
        excelRow.getCell("A").value = no;
        excelRow.getCell("B").value = item.manufacturer ?? "";
        excelRow.getCell("C").value = ""; // Dikosongkan untuk diisi manual oleh perusahaan
        excelRow.getCell("D").value = item.partNumber ?? ""; // Part Number digeser ke kolom Description
        excelRow.getCell("E").value = qty;
        excelRow.getCell("F").value = "PCS";
        excelRow.getCell("G").value = purchaseUrl;
        excelRow.getCell("J").value = item.links || "";
        const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
        if (rowFill) {
            for (const col of cols) {
                const cell = excelRow.getCell(col);
                const existingStyle = cell.style;
                cell.style = {
                    ...existingStyle,
                    fill: {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: rowFill },
                        bgColor: { argb: rowFill },
                    },
                    border: {
                        top: { style: "thin" },
                        left: { style: "thin" },
                        bottom: { style: "thin" },
                        right: { style: "thin" },
                    },
                };
            }
        }
        else {
            // Explicitly reset to white/no-fill for normal rows
            for (const col of cols) {
                const cell = excelRow.getCell(col);
                const existingStyle = cell.style;
                cell.style = {
                    ...existingStyle,
                    fill: { type: "pattern", pattern: "none" },
                    border: {
                        top: { style: "thin" },
                        left: { style: "thin" },
                        bottom: { style: "thin" },
                        right: { style: "thin" },
                    },
                };
            }
        }
        excelRow.commit();
    }
    let currentRow = DATA_START_ROW;
    let no = 1;
    for (const row of bomRows) {
        if (!row.item)
            continue;
        let itemToExport = row.item;
        let isSwapped = false;
        let isTempOverride = false;
        // 1. Check for Temporary Override
        if (tempOverrides[row.stableId]) {
            itemToExport = tempOverrides[row.stableId];
            isSwapped = true;
            isTempOverride = true;
        }
        // 2. If no temporary override, execute normal Smart Swap logic
        if (!isTempOverride) {
            const mainSup = getEffectiveSupplier(itemToExport);
            const mainIsOos = mainSup.supplierStock == null || Number(mainSup.supplierStock) === 0 || Number.isNaN(Number(mainSup.supplierStock));
            const mainPrice = mainSup.price ?? Infinity;
            // Collect valid alternatives
            const combinedAlts = (itemToExport.alternatives ?? "") + ";" + (row.alternatives ?? "");
            const altIds = combinedAlts.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
            let bestAltItem = null;
            let bestAltPrice = Infinity;
            for (const altId of altIds) {
                if (altId.toUpperCase().includes("NEED") || altId.toUpperCase().includes("NA"))
                    continue;
                const altItem = altItemsCache.get(altId);
                if (!altItem)
                    continue;
                const altSup = getEffectiveSupplier(altItem);
                const altIsOos = altSup.supplierStock == null || Number(altSup.supplierStock) === 0 || Number.isNaN(Number(altSup.supplierStock));
                if (!altIsOos) {
                    const altPrice = altSup.price ?? Infinity;
                    if (altPrice < bestAltPrice) {
                        bestAltPrice = altPrice;
                        bestAltItem = altItem;
                    }
                }
            }
            // Decision Making
            if (!useAlt) {
                // Normal Mode: Swap only if main is OOS and we have a valid alt
                if (mainIsOos && bestAltItem) {
                    itemToExport = bestAltItem;
                    isSwapped = true;
                }
            }
            else {
                // Cost Down Mode: Swap if main is OOS, OR if alt is cheaper
                if (bestAltItem) {
                    if (mainIsOos || bestAltPrice < mainPrice) {
                        itemToExport = bestAltItem;
                        isSwapped = true;
                    }
                }
            }
        }
        // Determine row color based on final itemToExport
        const finalSup = getEffectiveSupplier(itemToExport);
        const finalIsOos = finalSup.supplierStock == null || Number(finalSup.supplierStock) === 0 || Number.isNaN(Number(finalSup.supplierStock));
        let rowFill = undefined;
        // We only color RED if the FINAL item being exported is OOS
        if (finalIsOos) {
            rowFill = "FFFF0000"; // Pure RED
        }
        else if (isSwapped) {
            rowFill = "FFFFF2CC"; // Light Yellow to indicate swapped (temp overrides also use this)
        }
        // Write primary item row (swapped or original)
        writeRow(currentRow, no, itemToExport, row.quantitySum ?? 0, rowFill);
        currentRow++;
        no++;
    }
    const buf = await workbook.xlsx.writeBuffer();
    const filename = `BOM_${product.name.replace(/[^a-zA-Z0-9]/g, "_")}${useAlt ? "_ALT" : ""}.xlsx`;
    return c.body(new Uint8Array(buf), 200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`
    });
});
// Export Reference file as Excel using company template
products.get("/:id/export/reference", async (c) => {
    const productId = Number(c.req.param("id"));
    const user = c.get('user');
    if (!user)
        return c.json({ error: 'Unauthorized' }, 401);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product)
        return c.json({ error: "Not found" }, 404);
    const bomRows = await prisma.productItem.findMany({
        where: { productId },
        include: { item: true },
        orderBy: { stableId: "asc" },
    });
    const templatePath = join(process.cwd(), "templates", "refrence_template.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet("Refrence_template");
    if (!ws)
        return c.json({ error: "Template sheet not found" }, 500);
    // A1:D2 merged — product name
    ws.getCell("A1").value = product.name;
    const DATA_START_ROW = 4;
    bomRows.forEach((row, i) => {
        const refs = (row.references ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .join(", ");
        const excelRow = ws.getRow(DATA_START_ROW + i);
        excelRow.getCell("A").value = i + 1;
        excelRow.getCell("B").value = row.quantitySum ?? 0;
        excelRow.getCell("C").value = row.item?.partNumber ?? "";
        excelRow.getCell("D").value = refs;
        excelRow.commit();
    });
    const buf = await workbook.xlsx.writeBuffer();
    const filename = `Reference_${product.name.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
    return c.body(new Uint8Array(buf), 200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`
    });
});
// Upload PCB image for a product
const IMAGES_DIR = join(process.cwd(), "uploads", "product-images");
const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
products.post("/:id/image", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product)
        return c.json({ error: "Not found" }, 404);
    const body = await c.req.parseBody();
    const rawFile = body["file"];
    if (!rawFile ||
        typeof rawFile === "string" ||
        Array.isArray(rawFile) ||
        !(rawFile instanceof File)) {
        return c.json({ error: "No file uploaded" }, 400);
    }
    const ext = extname(rawFile.name).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
        return c.json({ error: "Only jpg, png, webp allowed" }, 400);
    }
    if (!existsSync(IMAGES_DIR))
        mkdirSync(IMAGES_DIR, { recursive: true });
    // Delete old image file if exists
    if (product.imageUrl) {
        const oldPath = join(process.cwd(), product.imageUrl);
        if (existsSync(oldPath))
            unlinkSync(oldPath);
    }
    const filename = `product-${productId}${ext}`;
    const savePath = join(IMAGES_DIR, filename);
    writeFileSync(savePath, Buffer.from(await rawFile.arrayBuffer()));
    const relativePath = `uploads/product-images/${filename}`;
    const updated = await prisma.product.update({
        where: { id: productId },
        data: { imageUrl: relativePath },
    });
    return c.json({ imageUrl: updated.imageUrl });
});
// Delete PCB image
products.delete("/:id/image", requireRole("admin", "super"), async (c) => {
    const productId = Number(c.req.param("id"));
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product)
        return c.json({ error: "Not found" }, 404);
    if (product.imageUrl) {
        const fullPath = join(process.cwd(), product.imageUrl);
        if (existsSync(fullPath))
            unlinkSync(fullPath);
        await prisma.product.update({
            where: { id: productId },
            data: { imageUrl: null },
        });
    }
    return c.body(null, 204);
});
export default products;
