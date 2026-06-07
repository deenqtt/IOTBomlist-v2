import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
const analytics = new Hono();
analytics.use('*', authMiddleware, requireRole('admin', 'super'));
analytics.get('/summary', async (c) => {
    const [totalItems, totalProducts, totalSets, totalSupersets, enrichedItems] = await Promise.all([
        prisma.item.count(),
        prisma.product.count(),
        prisma.configSet.count(),
        prisma.superset.count(),
        prisma.item.count({ where: { priceMin: { gt: 0 } } }),
    ]);
    const bomRows = await prisma.productItem.count();
    return c.json({
        totalItems,
        totalProducts,
        totalSets,
        totalSupersets,
        bomRows,
        enrichedItems,
        missingPrices: totalItems - enrichedItems,
    });
});
analytics.get('/by-category', async (c) => {
    const data = await prisma.item.groupBy({
        by: ['category'],
        _count: { stableId: true },
        orderBy: { _count: { stableId: 'desc' } },
    });
    return c.json(data.map(d => ({ category: d.category || 'Unknown', count: d._count.stableId })));
});
analytics.get('/by-supplier', async (c) => {
    const items = await prisma.item.findMany({ select: { suppliers: true } });
    const map = {};
    for (const item of items) {
        if (!item.suppliers)
            continue;
        const sups = item.suppliers.split(/[;,]/).map(s => s.trim()).filter(Boolean);
        for (const s of sups) {
            map[s] = (map[s] || 0) + 1;
        }
    }
    const result = Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .map(([supplier, count]) => ({ supplier, count }));
    return c.json(result);
});
analytics.get('/missing-by-set', async (c) => {
    const [sets, products] = await Promise.all([
        prisma.configSet.findMany({
            include: { items: true },
            orderBy: { name: 'asc' },
        }),
        prisma.product.findMany({
            include: { items: { include: { item: { select: { priceMin: true } } } } }
        })
    ]);
    const productMap = new Map(products.map(p => [p.id, p]));
    const result = sets.map(set => {
        const productIds = new Set();
        let bomRows = 0;
        let missingPrices = 0;
        for (const si of set.items) {
            productIds.add(si.mainProductId);
            const p = productMap.get(si.mainProductId);
            if (p) {
                for (const pi of p.items) {
                    bomRows++;
                    if (!pi.item.priceMin || pi.item.priceMin <= 0)
                        missingPrices++;
                }
            }
        }
        return {
            setId: set.id,
            setName: set.name,
            products: productIds.size,
            bomRows,
            missingPrices,
        };
    });
    return c.json(result.sort((a, b) => b.missingPrices - a.missingPrices));
});
analytics.get('/project-health', async (c) => {
    const [supersets, products] = await Promise.all([
        prisma.superset.findMany({
            include: { items: { include: { set: { include: { items: true } } } } }
        }),
        prisma.product.findMany({
            include: { items: { include: { item: { select: { priceMin: true } } } } }
        })
    ]);
    const productMap = new Map(products.map(p => [p.id, p]));
    const result = supersets.map(ss => {
        let totalRows = 0;
        let missingRows = 0;
        for (const si of ss.items) {
            for (const csi of si.set.items) {
                const p = productMap.get(csi.mainProductId);
                if (p) {
                    for (const pi of p.items) {
                        totalRows++;
                        if (!pi.item.priceMin || pi.item.priceMin <= 0)
                            missingRows++;
                    }
                }
            }
        }
        const coverage = totalRows > 0 ? Math.round(((totalRows - missingRows) / totalRows) * 100) : 100;
        return {
            id: ss.id,
            name: ss.name,
            coverage,
            totalRows,
            missingRows
        };
    });
    return c.json(result.sort((a, b) => a.coverage - b.coverage));
});
export default analytics;
