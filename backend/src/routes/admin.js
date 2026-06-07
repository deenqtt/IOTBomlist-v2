import { Hono } from 'hono';
import { hashPassword } from '../lib/auth';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { logChange } from '../lib/changelog';
import { generateBackupBuffer } from '../lib/backup';
import * as XLSX from 'xlsx';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
const admin = new Hono();
admin.use('*', authMiddleware);
// ─── Users (super only) ────────────────────────────────────────────────────
admin.get('/users', requireRole('super'), async (c) => {
    const users = await prisma.user.findMany({
        select: { id: true, username: true, role: true, createdAt: true },
        orderBy: { username: 'asc' },
    });
    return c.json(users);
});
admin.post('/users', requireRole('super'), async (c) => {
    const { username, password, role = 'user' } = await c.req.json();
    const operator = c.get('user');
    if (!username?.trim() || !password)
        return c.json({ error: 'username and password required' }, 400);
    const exists = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (exists)
        return c.json({ error: 'Username already exists' }, 409);
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: { username: username.trim(), passwordHash, role },
        select: { id: true, username: true, role: true, createdAt: true },
    });
    await logChange({
        entity: 'user',
        entityId: user.id,
        field: 'all',
        oldValue: null,
        newValue: user.username,
        changedBy: operator.username,
        context: `Created user with role ${role}`
    });
    return c.json(user, 201);
});
admin.patch('/users/:id', requireRole('super'), async (c) => {
    const id = Number(c.req.param('id'));
    const { role, password } = await c.req.json();
    const operator = c.get('user');
    const oldUser = await prisma.user.findUnique({ where: { id } });
    if (!oldUser)
        return c.json({ error: 'Not found' }, 404);
    const data = {};
    if (role)
        data.role = role;
    if (password)
        data.passwordHash = await hashPassword(password);
    if (!Object.keys(data).length)
        return c.json({ error: 'Nothing to update' }, 400);
    const user = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, username: true, role: true, createdAt: true },
    });
    if (role && role !== oldUser.role) {
        await logChange({
            entity: 'user',
            entityId: id,
            field: 'role',
            oldValue: oldUser.role,
            newValue: role,
            changedBy: operator.username,
            context: 'Role update'
        });
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
        });
    }
    return c.json(user);
});
admin.delete('/users/:id', requireRole('super'), async (c) => {
    const id = Number(c.req.param('id'));
    const operator = c.get('user');
    const oldUser = await prisma.user.findUnique({ where: { id } });
    if (!oldUser)
        return c.json({ error: 'Not found' }, 404);
    await prisma.user.delete({ where: { id } });
    await logChange({
        entity: 'user',
        entityId: id,
        field: null,
        oldValue: oldUser.username,
        newValue: null,
        changedBy: operator.username,
        context: 'User deleted'
    });
    return c.body(null, 204);
});
// ─── Change Log ────────────────────────────────────────────────────────────
admin.get('/changelog', requireRole('admin', 'super'), async (c) => {
    const entity = c.req.query('entity');
    const q = c.req.query('q');
    const from = c.req.query('from');
    const to = c.req.query('to');
    const skip = Number(c.req.query('skip') || 0);
    const limit = Math.min(Number(c.req.query('limit') || 100), 500);
    const where = {
        AND: [
            entity ? { entity } : {},
            q ? {
                OR: [
                    { entityId: { contains: q, mode: 'insensitive' } },
                    { field: { contains: q, mode: 'insensitive' } },
                    { oldValue: { contains: q, mode: 'insensitive' } },
                    { newValue: { contains: q, mode: 'insensitive' } },
                    { changedBy: { contains: q, mode: 'insensitive' } },
                    { context: { contains: q, mode: 'insensitive' } },
                ],
            } : {},
            from ? { changedAt: { gte: new Date(from) } } : {},
            to ? { changedAt: { lte: new Date(to) } } : {},
        ],
    };
    const [data, total] = await Promise.all([
        prisma.changeLog.findMany({
            where,
            skip,
            take: limit,
            orderBy: { changedAt: 'desc' },
        }),
        prisma.changeLog.count({ where }),
    ]);
    return c.json({ data, total, skip, limit });
});
// ─── Warehouse ─────────────────────────────────────────────────────────────
admin.get('/warehouse', requireRole('admin', 'super'), async (c) => {
    const q = c.req.query('q');
    const skip = Number(c.req.query('skip') || 0);
    const limit = Number(c.req.query('limit') || 100);
    const where = q ? {
        OR: [
            { stableId: { contains: q, mode: 'insensitive' } },
            { partNumber: { contains: q, mode: 'insensitive' } },
            { productName: { contains: q, mode: 'insensitive' } },
        ],
    } : undefined;
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
    ]);
    return c.json({ data, total, skip, limit });
});
admin.patch('/warehouse/:stableId', requireRole('admin', 'super'), async (c) => {
    const stableId = c.req.param('stableId');
    const { whQty, whLocation } = await c.req.json();
    const operator = c.get('user');
    const oldItem = await prisma.item.findUnique({
        where: { stableId },
        select: { whQty: true, whLocation: true, partNumber: true }
    });
    if (!oldItem)
        return c.json({ error: 'Not found' }, 404);
    const item = await prisma.item.update({
        where: { stableId },
        data: { whQty, whLocation },
        select: { stableId: true, whQty: true, whLocation: true },
    });
    if (whQty !== oldItem.whQty) {
        await logChange({
            entity: 'item',
            entityId: stableId,
            field: 'whQty',
            oldValue: String(oldItem.whQty),
            newValue: String(whQty),
            changedBy: operator.username,
            context: `Warehouse Qty Update (${oldItem.partNumber})`
        });
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
        });
    }
    return c.json(item);
});
// ─── Import Excel ──────────────────────────────────────────────────────────
admin.post('/import', requireRole('admin', 'super'), async (c) => {
    const dryRun = c.req.query('dryRun') === 'true';
    const autoEnrich = c.req.query('autoEnrich') === 'true';
    const body = await c.req.parseBody();
    const file = body['file'];
    const user = c.get('user');
    if (!file)
        return c.json({ error: 'file required' }, 400);
    // Get current auth token to pass to internal API calls
    const authHeader = c.req.header('Authorization');
    const api = axios.create({
        baseURL: `http://localhost:${process.env.PORT || 8001}`,
        headers: authHeader ? { 'Authorization': authHeader } : {}
    });
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'buffer' });
    let itemsImported = 0;
    let itemsEnriched = 0;
    let productsImported = 0;
    let bomRowsImported = 0;
    let setsImported = 0;
    let setItemsImported = 0;
    let supersetsImported = 0;
    let ssItemsImported = 0;
    const errors = [];
    const warnings = [];
    // Helper for Auto-Enrichment (LCSC/Mouser/Digikey)
    async function enrichItem(sid, pn, lcsc) {
        console.log(`[Auto-Enrich] Initiating for Part: ${pn} (SID: ${sid}, LCSC: ${lcsc || 'N/A'})`);
        try {
            let found = null;
            let source = "";
            if (lcsc) {
                console.log(`[Auto-Enrich] Querying LCSC for: ${lcsc}`);
                const res = await api.post("/lcsc/lookup", { items: [{ lcsc, qty: 1 }] });
                found = res.data?.items?.[0];
                if (found) {
                    source = "lcsc";
                    console.log(`[Auto-Enrich] Found on LCSC: ${found.mpn}, Price: ${found.price}, Stock: ${found.quantity_available}`);
                }
            }
            if (!found && pn) {
                console.log(`[Auto-Enrich] Querying Mouser for: ${pn}`);
                const res = await api.post("/mouser/search", { keyword: pn, qty: 1 });
                found = res.data?.items?.[0];
                if (found) {
                    source = "mouser";
                    console.log(`[Auto-Enrich] Found on Mouser: ${found.mpn}, Price: ${found.price}, Stock: ${found.quantity_available}`);
                }
            }
            if (!found && pn) {
                console.log(`[Auto-Enrich] Querying DigiKey for: ${pn}`);
                const res = await api.post("/digikey/search", { keyword: pn, qty: 1 });
                found = res.data?.items?.[0];
                if (found) {
                    source = "digikey";
                    console.log(`[Auto-Enrich] Found on DigiKey: ${found.mpn}, Price: ${found.price}, Stock: ${found.quantity_available}`);
                }
            }
            if (found) {
                const stockNum = found.quantity_available != null ? Number(found.quantity_available) : null;
                const spMap = {};
                spMap[source] = {
                    pn: (source === 'lcsc' ? lcsc : found.mpn) || pn,
                    price: found.price || null,
                    url: found.url || null,
                    quantity_available: stockNum,
                    priceBreaks: found.priceBreaks || []
                };
                console.log(`[Auto-Enrich] Updating Database for SID: ${sid} with fresh data from ${source} (Stock: ${stockNum})`);
                await prisma.item.update({
                    where: { stableId: sid },
                    data: {
                        priceMin: found.price || undefined,
                        priceCurrency: "USD",
                        suppliers: source,
                        stockQty: stockNum ?? undefined, // FORCE UPDATE STOCK
                        links: (found.url && found.datasheet) ? `${found.url};${found.datasheet}` : (found.url || found.datasheet || undefined),
                        supplierPrices: JSON.stringify(spMap)
                    }
                });
                return true;
            }
            else {
                console.warn(`[Auto-Enrich] No data found on any supplier for: ${pn}`);
            }
        }
        catch (e) {
            console.error(`[Auto-Enrich] Critical failure for ${pn}:`, e.message);
        }
        return false;
    }
    // 0. Detect Migration Type
    const isLegacyFormat = wb.SheetNames.includes('UniqueItems') && wb.SheetNames.includes('ItemUsage');
    if (isLegacyFormat) {
        // --- LEGACY MIGRATION PATH (Enhanced Master BOM) ---
        const uniqueItemsWs = wb.Sheets['UniqueItems'];
        const itemUsageWs = wb.Sheets['ItemUsage'];
        const legacyItems = XLSX.utils.sheet_to_json(uniqueItemsWs, { defval: '' });
        const legacyUsage = XLSX.utils.sheet_to_json(itemUsageWs, { defval: '' });
        // A. Migrate UniqueItems -> Master Inventory
        for (const row of legacyItems) {
            const sid = String(row['Stable ID'] || '').trim();
            if (!sid)
                continue;
            const pn = strOrNull(row['Part Number']);
            const possibleLinks = [
                row['Link(s)'],
                row['links'],
                row['Link'],
                row['Product URL'],
                row['Datasheet URL']
            ].map(l => strOrNull(l)).filter(Boolean);
            const linkStr = possibleLinks.length > 0 ? Array.from(new Set(possibleLinks)).join(';') : null;
            if (!dryRun) {
                try {
                    const priceVal = numOrNull(row['Price (min)']);
                    const suppliers = strOrNull(row['Supplier(s)']);
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
                    });
                    if (autoEnrich && pn) {
                        if (await enrichItem(sid, pn))
                            itemsEnriched++;
                    }
                }
                catch (e) {
                    errors.push(`Legacy Item ${sid}: ${String(e)}`);
                }
            }
            itemsImported++;
        }
        // B. Detect Products from Source Files
        const productNames = Array.from(new Set(legacyUsage.map(u => String(u['Source File'] || '').trim()).filter(Boolean)));
        for (const name of productNames) {
            if (!dryRun) {
                try {
                    await prisma.product.upsert({
                        where: { name },
                        update: {},
                        create: { name }
                    });
                }
                catch (e) {
                    errors.push(`Legacy Product ${name}: ${String(e)}`);
                }
            }
            productsImported++;
        }
        // C. Map Usage -> ProductItems (BOM)
        for (const row of legacyUsage) {
            const sid = String(row['Stable ID'] || '').trim();
            const sourceFile = String(row['Source File'] || '').trim();
            if (!sid || !sourceFile)
                continue;
            if (!dryRun) {
                try {
                    const product = await prisma.product.findUnique({ where: { name: sourceFile } });
                    if (!product)
                        continue;
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
                    });
                }
                catch (e) {
                    errors.push(`Legacy BOM ${sourceFile}/${sid}: ${String(e)}`);
                }
            }
            bomRowsImported++;
        }
    }
    else {
        // --- STANDARD BACKUP PATH (Current Logic) ---
        // 1. Data Structures for Dry Run & Validation
        const sheetItems = [];
        const sheetProducts = [];
        const sheetSets = [];
        // 2. Scan Master Items
        const itemSheetName = wb.SheetNames.find(n => /^items?$/i.test(n) || /master.?bom/i.test(n)) ?? wb.SheetNames[0];
        if (itemSheetName) {
            const ws = wb.Sheets[itemSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of rows) {
                // Universal Mapping for Items
                // Universal Mapping for Items (Case-insensitive helper)
                const getVal = (keys) => {
                    for (const k of keys) {
                        const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? row[k.replace(/ /g, '_')] ?? row[k.replace(/ /g, '')];
                        if (val !== undefined && val !== null && val !== '')
                            return val;
                    }
                    return null;
                };
                const sid = String(getVal(['Stable ID', 'stable_id', 'SID']) || '').trim();
                if (sid) {
                    sheetItems.push(sid);
                    const pn = strOrNull(getVal(['Part Number', 'part_number', 'MPN']));
                    const lcsc = strOrNull(getVal(['LCSC Code', 'LcscCode', 'Stock Code', 'StockCode']));
                    const suppliers = strOrNull(getVal(['Supplier(s)', 'suppliers', 'Supplier']));
                    const priceVal = numOrNull(getVal(['Price (min)', 'price_min', 'Price', 'UnitPrice']));
                    // Join multiple potential link columns
                    const possibleLinks = [
                        getVal(['Product URL', 'ProductURL']),
                        getVal(['Datasheet URL', 'DatasheetURL']),
                        getVal(['Link(s)', 'links', 'Link'])
                    ].filter(Boolean);
                    const linkStr = possibleLinks.length > 0 ? Array.from(new Set(possibleLinks)).join(';') : null;
                    if (!dryRun) {
                        try {
                            const rawSupPrices = getVal(['supplier_prices', 'SupplierPrices']);
                            let formattedSupPrices = strOrNull(rawSupPrices);
                            if (formattedSupPrices) {
                                try {
                                    JSON.parse(formattedSupPrices);
                                }
                                catch {
                                    formattedSupPrices = null;
                                }
                            }
                            // SMART FIX: Reconstruct supplierPrices if missing but we have URL & Supplier Name
                            if (!formattedSupPrices && pn && suppliers) {
                                const mainSup = suppliers.split(/[;,]/)[0].trim().toLowerCase();
                                const knownSups = ['lcsc', 'mouser', 'digikey'];
                                const matchedSup = knownSups.find(ks => mainSup.includes(ks));
                                if (matchedSup) {
                                    const rawUrl = strOrNull(getVal(['Product URL', 'Link(s)', 'Link']));
                                    const cleanUrl = rawUrl ? rawUrl.split(/[;,\s]/)[0].trim() : null; // Only first URL
                                    const spMap = {};
                                    spMap[matchedSup] = {
                                        pn: (matchedSup === 'lcsc' ? lcsc : pn) || pn,
                                        url: cleanUrl,
                                        price: priceVal,
                                        quantity_available: numOrNull(getVal(['Stock Qty', 'stock_qty']))
                                    };
                                    formattedSupPrices = JSON.stringify(spMap);
                                }
                            }
                            await prisma.item.upsert({
                                where: { stableId: sid },
                                update: {
                                    partNumber: pn,
                                    productName: strOrNull(getVal(['Product Name', 'product_name', 'Description'])),
                                    value: strOrNull(getVal(['Value (canonical)', 'value', 'Value'])),
                                    description: strOrNull(getVal(['Description', 'description', 'Description2'])),
                                    category: strOrNull(getVal(['Category', 'category'])),
                                    package: strOrNull(getVal(['Package (canonical)', 'package', 'Footprint'])),
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
                                    value: strOrNull(getVal(['Value (canonical)', 'value', 'Value'])),
                                    description: strOrNull(getVal(['Description', 'description', 'Description2'])),
                                    category: strOrNull(getVal(['Category', 'category'])),
                                    package: strOrNull(getVal(['Package (canonical)', 'package', 'Footprint'])),
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
                                if (await enrichItem(sid, pn || '', lcsc || undefined))
                                    itemsEnriched++;
                            }
                        }
                        catch (e) {
                            errors.push(`Item ${sid}: ${String(e)}`);
                        }
                    }
                    itemsImported++;
                }
            }
        }
        // 3. Scan Products (PCBs)
        const prodSheetName = wb.SheetNames.find(n => /^products?$/i.test(n));
        if (prodSheetName) {
            const ws = wb.Sheets[prodSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of rows) {
                const name = String(row['Name'] ?? row['name'] ?? row['ProductName'] ?? '').trim();
                if (name) {
                    sheetProducts.push(name);
                    if (!dryRun) {
                        try {
                            await prisma.product.upsert({
                                where: { name },
                                update: { slug: strOrNull(row['Slug'] ?? row['slug']) },
                                create: { name, slug: strOrNull(row['Slug'] ?? row['slug']) },
                            });
                            productsImported++;
                        }
                        catch (e) {
                            errors.push(`Product ${name}: ${String(e)}`);
                        }
                    }
                    else {
                        productsImported++;
                    }
                }
            }
        }
        // 4. Scan ProductItems (BOM)
        const bomSheetName = wb.SheetNames.find(n => /product.?items?|bom.?rows?|bom$/i.test(n));
        if (bomSheetName) {
            const ws = wb.Sheets[bomSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of rows) {
                const productName = String(row['Product'] ?? row['product_name'] ?? row['ProductName'] ?? row['Product'] ?? '').trim();
                const sid = String(row['Stable ID'] ?? row['stable_id'] ?? row['StableId'] ?? row['SID'] ?? '').trim();
                if (!productName || !sid)
                    continue;
                // Validation
                if (!sheetItems.includes(sid))
                    warnings.push(`BOM Row: Item "${sid}" not found in Items sheet.`);
                if (!sheetProducts.includes(productName))
                    warnings.push(`BOM Row: PCB "${productName}" not found in Products sheet.`);
                if (!dryRun) {
                    try {
                        const product = await prisma.product.findUnique({ where: { name: productName } });
                        if (!product) {
                            errors.push(`BOM: product "${productName}" not in DB`);
                            continue;
                        }
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
                        });
                        bomRowsImported++;
                    }
                    catch (e) {
                        errors.push(`BOM row ${productName}/${sid}: ${String(e)}`);
                    }
                }
                else {
                    bomRowsImported++;
                }
            }
        }
        // 5. Scan ConfigSets (Products)
        const setSheetName = wb.SheetNames.find(n => /config.?sets?|sets?$/i.test(n));
        if (setSheetName) {
            const ws = wb.Sheets[setSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of rows) {
                const name = String(row['Name'] ?? row['name'] ?? row['SetName'] ?? '').trim();
                if (name) {
                    sheetSets.push(name);
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
                            });
                            setsImported++;
                        }
                        catch (e) {
                            errors.push(`Set ${name}: ${String(e)}`);
                        }
                    }
                    else {
                        setsImported++;
                    }
                }
            }
        }
        // 6. Scan ConfigSetItems (Set Composition)
        const setItemSheetName = wb.SheetNames.find(n => /config.?set.?items?|set.?items?|composition$/i.test(n));
        if (setItemSheetName) {
            const ws = wb.Sheets[setItemSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of rows) {
                const setName = String(row['Set Name'] ?? row['set_name'] ?? row['BundleName'] ?? '').trim();
                const productName = String(row['Main Product'] ?? row['product_name'] ?? row['ProductName'] ?? '').trim();
                if (!setName || !productName)
                    continue;
                // Validation
                if (!sheetSets.includes(setName))
                    warnings.push(`Set Composition: Bundle "${setName}" not found in Sets sheet.`);
                if (!sheetProducts.includes(productName))
                    warnings.push(`Set Composition: PCB "${productName}" not found in Products sheet.`);
                if (!dryRun) {
                    try {
                        const [cs, prod] = await Promise.all([
                            prisma.configSet.findUnique({ where: { name: setName } }),
                            prisma.product.findUnique({ where: { name: productName } })
                        ]);
                        if (!cs || !prod) {
                            errors.push(`SetItem: "${setName}" or "${productName}" not in DB`);
                            continue;
                        }
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
                        });
                        setItemsImported++;
                    }
                    catch (e) {
                        errors.push(`SetItem ${setName}/${productName}: ${String(e)}`);
                    }
                }
                else {
                    setItemsImported++;
                }
            }
        }
        // 7. Scan Supersets (Projects)
        const supersetSheetName = wb.SheetNames.find(n => /supersets?|projects?$/i.test(n));
        if (supersetSheetName) {
            const ws = wb.Sheets[supersetSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of rows) {
                const name = String(row['Name'] ?? row['name'] ?? row['ProjectName'] ?? '').trim();
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
                            });
                            supersetsImported++;
                        }
                        catch (e) {
                            errors.push(`Project ${name}: ${String(e)}`);
                        }
                    }
                    else {
                        supersetsImported++;
                    }
                }
            }
        }
        // 8. Scan SupersetItems (Project Composition)
        const ssItemSheetName = wb.SheetNames.find(n => /superset.?items?|project.?items?|project.?composition$/i.test(n));
        if (ssItemSheetName) {
            const ws = wb.Sheets[ssItemSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of rows) {
                const projectName = String(row['Superset Name'] ?? row['project_name'] ?? row['ProjectName'] ?? '').trim();
                const productName = String(row['Set Name'] ?? row['product_name'] ?? row['ProductName'] ?? '').trim();
                if (!projectName || !productName)
                    continue;
                if (!dryRun) {
                    try {
                        const [ss, cs] = await Promise.all([
                            prisma.superset.findUnique({ where: { name: projectName } }),
                            prisma.configSet.findUnique({ where: { name: productName } })
                        ]);
                        if (!ss || !cs) {
                            errors.push(`ProjectItem: "${projectName}" or "${productName}" not in DB`);
                            continue;
                        }
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
                        });
                        ssItemsImported++;
                    }
                    catch (e) {
                        errors.push(`ProjectItem ${projectName}/${productName}: ${String(e)}`);
                    }
                }
                else {
                    ssItemsImported++;
                }
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
        });
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
    });
});
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
    ]);
    const totalItems = await prisma.item.count();
    const pricedItems = await prisma.item.count({ where: { priceMin: { gt: 0 } } });
    const healthScore = totalItems > 0
        ? Math.max(0, 100 - (orphanedBOM.length * 5) - (emptyPCBs.length * 2))
        : 100;
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
    });
});
// ─── Settings ──────────────────────────────────────────────────────────────
admin.get('/settings', requireRole('admin', 'super'), async (c) => {
    const settings = await prisma.systemSetting.findMany();
    const out = {};
    settings.forEach(s => { out[s.key] = s.value; });
    return c.json(out);
});
admin.patch('/settings', requireRole('super'), async (c) => {
    try {
        const data = await c.req.json();
        const user = c.get('user');
        if (!prisma.systemSetting) {
            throw new Error("Prisma client property 'systemSetting' is missing. Please regenerate Prisma Client.");
        }
        for (const [key, value] of Object.entries(data)) {
            await prisma.systemSetting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            });
            await logChange({
                entity: 'system',
                entityId: 'settings',
                field: key,
                oldValue: '?',
                newValue: String(value),
                changedBy: user.username,
                context: 'Update System Configuration'
            });
        }
        return c.json({ ok: true });
    }
    catch (err) {
        console.error('[Admin Settings] Error updating settings:', err);
        return c.json({ error: err.message || 'Internal Server Error' }, 500);
    }
});
// ─── Backup export ─────────────────────────────────────────────────────────
admin.get('/backups/auto', requireRole('admin', 'super'), async (c) => {
    const dir = join(process.cwd(), 'backups', 'auto');
    if (!existsSync(dir))
        return c.json([]);
    const files = readdirSync(dir)
        .filter(f => f.endsWith('.xlsx'))
        .sort()
        .reverse()
        .slice(0, 10);
    return c.json(files);
});
admin.get('/backups/auto/:filename', requireRole('admin', 'super'), async (c) => {
    const filename = c.req.param('filename');
    const path = join(process.cwd(), 'backups', 'auto', filename);
    if (!existsSync(path))
        return c.json({ error: 'Not found' }, 404);
    const buf = readFileSync(path);
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(buf);
});
admin.get('/backup', requireRole('admin', 'super'), async (c) => {
    const buf = await generateBackupBuffer();
    const now = new Date().toISOString().slice(0, 10);
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="bom_backup_${now}.xlsx"`);
    return c.body(new Uint8Array(buf));
});
// ─── helpers ───────────────────────────────────────────────────────────────
function strOrNull(v) {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
}
function numOrNull(v) {
    const n = Number(v);
    return isNaN(n) || v === '' ? null : n;
}
export default admin;
