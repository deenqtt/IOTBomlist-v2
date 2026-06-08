import { Hono } from 'hono'
import prisma from '../lib/prisma.js'
import { authMiddleware, requireRole, AuthUser } from '../middleware/auth.js'
import { logChange } from '../lib/changelog.js'

const items = new Hono<{ Variables: { user: AuthUser } }>()
items.use('*', authMiddleware)

items.get('/', async (c) => {
  const skip = Math.max(0, Number(c.req.query('skip') || 0))
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') || 100)))
  const q = c.req.query('q')
  const category = c.req.query('category')
  const supplier = c.req.query('supplier')
  const pkg = c.req.query('package')

  const where = {
    AND: [
      q ? { OR: [
        { partNumber: { contains: q, mode: 'insensitive' as const } },
        { productName: { contains: q, mode: 'insensitive' as const } },
        { stableId: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
        { manufacturer: { contains: q, mode: 'insensitive' as const } },
      ]} : {},
      category ? { category: { equals: category, mode: 'insensitive' as const } } : {},
      supplier ? { OR: [
        { suppliers: { contains: supplier, mode: 'insensitive' as const } },
        { supplierPrices: { contains: supplier, mode: 'insensitive' as const } },
      ]} : {},
      pkg ? { package: { equals: pkg, mode: 'insensitive' as const } } : {},
    ],
  }

  const [data, total] = await Promise.all([
    prisma.item.findMany({ where, skip, take: limit, orderBy: { stableId: 'asc' } }),
    prisma.item.count({ where }),
  ])

  // Enrich with market availability (Best In-Stock Supplier)
  const enriched = data.map(item => {
    let bestPrice = Infinity
    let bestSup = null
    let bestStock = null

    if (item.supplierPrices) {
      try {
        const spMap = JSON.parse(item.supplierPrices)
        const entries = Object.entries(spMap) as [string, any][]
        
        // 1. Try to find cheapest with stock > 0
        for (const [key, s] of entries) {
          if (s.price != null && (s.quantity_available ?? 0) > 0) {
            if (s.price < bestPrice) {
              bestPrice = s.price
              bestSup = key
              bestStock = s.quantity_available
            }
          }
        }

        // 2. Fallback: If no one has stock, find cheapest overall
        if (!bestSup) {
          for (const [key, s] of entries) {
            if (s.price != null) {
              if (s.price < bestPrice) {
                bestPrice = s.price
                bestSup = key
                bestStock = s.quantity_available ?? 0
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    return {
      ...item,
      marketPrice: bestSup ? bestPrice : item.priceMin,
      marketSupplier: bestSup,
      marketStock: bestStock,
    }
  })

  return c.json({ data: enriched, total, skip, limit })
})

// distinct values for filter dropdowns
// ?category=Resistor → return only packages belonging to that category
items.get('/meta', async (c) => {
  const filterCategory = c.req.query('category')

  const packageWhere = {
    package: { not: null as null },
    ...(filterCategory ? { category: { equals: filterCategory, mode: 'insensitive' as const } } : {}),
  }

  const [categories, packages] = await Promise.all([
    prisma.item.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { category: { not: null } },
      orderBy: { category: 'asc' },
    }),
    prisma.item.findMany({
      select: { package: true },
      distinct: ['package'],
      where: packageWhere,
      orderBy: { package: 'asc' },
    }),
  ])

  const supplierRows = await prisma.item.findMany({ select: { suppliers: true }, where: { suppliers: { not: null } } })
  const supplierSet = new Set<string>()
  for (const row of supplierRows) {
    if (row.suppliers) {
      row.suppliers.split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(s => supplierSet.add(s))
    }
  }

  return c.json({
    categories: categories.map(r => r.category).filter(Boolean),
    packages: packages.map(r => r.package).filter(Boolean),
    suppliers: [...supplierSet].sort(),
  })
})

// Find potential alternatives: same Value + Package + VoltageRating + Tolerance
// Excludes the requesting item and items already listed as alternatives
items.get('/:stableId/alternatives', async (c) => {
  const stableId = c.req.param('stableId')
  const item = await prisma.item.findUnique({ where: { stableId } })
  if (!item) return c.json({ error: 'Not found' }, 404)

  const canMatch = item.value || item.package || item.voltageRating || item.tolerance
  if (!canMatch) return c.json({ items: [] })

  const currentAlts = (item.alternatives ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean)

  const candidates = await prisma.item.findMany({
    where: {
      AND: [
        { stableId: { not: stableId } },
        item.value ? { value: { equals: item.value, mode: 'insensitive' as const } } : {},
        item.package ? { package: { equals: item.package, mode: 'insensitive' as const } } : {},
        item.voltageRating ? { voltageRating: { equals: item.voltageRating, mode: 'insensitive' as const } } : {},
        item.tolerance ? { tolerance: { equals: item.tolerance, mode: 'insensitive' as const } } : {},
      ],
    },
    take: 20,
  })

  return c.json({
    items: candidates,
    alreadyLinked: currentAlts,
  })
})

// Helper robust untuk menghapus ID dari string alternatif
function removeFromAlts(current: string | null, remove: string): string {
  if (!current) return "";
  return current
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== remove.toLowerCase())
    .join(";");
}

// POST /items/:stableId/alternatives/link — bidirectional link two items as alternatives
items.post("/:stableId/alternatives/link", requireRole("admin", "super"), async (c) => {
  const stableId = c.req.param("stableId");
  const user = c.get('user')
  const { targetId } = (await c.req.json()) as { targetId: string };
  if (!targetId || targetId === stableId)
    return c.json({ error: "Invalid targetId" }, 400);

  const [itemA, itemB] = await Promise.all([
    prisma.item.findUnique({
      where: { stableId },
      select: { stableId: true, alternatives: true },
    }),
    prisma.item.findUnique({
      where: { stableId: targetId },
      select: { stableId: true, alternatives: true },
    }),
  ]);
  if (!itemA || !itemB) return c.json({ error: "Item not found" }, 404);

  function addToAlts(current: string | null, add: string): string {
    const list = (current ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes(add)) return current ?? "";
    return [...list, add].join(";");
  }

  const valA = addToAlts(itemA.alternatives, targetId);
  const valB = addToAlts(itemB.alternatives, stableId);

  await Promise.all([
    prisma.item.update({
      where: { stableId },
      data: { alternatives: valA },
    }),
    prisma.item.update({
      where: { stableId: targetId },
      data: { alternatives: valB },
    }),
    logChange({
      entity: 'item',
      entityId: stableId,
      field: 'alternatives',
      oldValue: itemA.alternatives,
      newValue: valA,
      changedBy: user.username,
      context: `Linked with ${targetId}`
    }),
    logChange({
      entity: 'item',
      entityId: targetId,
      field: 'alternatives',
      oldValue: itemB.alternatives,
      newValue: valB,
      changedBy: user.username,
      context: `Linked with ${stableId}`
    })
  ]);
  return c.json({ ok: true });
});

// DELETE /items/:stableId/alternatives/unlink — bidirectional unlink
items.delete("/:stableId/alternatives/unlink", requireRole("admin", "super"), async (c) => {
  const stableId = c.req.param("stableId");
  const user = c.get('user')
  const { targetId } = (await c.req.json()) as { targetId: string };
  if (!targetId) return c.json({ error: "targetId required" }, 400);

  const [itemA, itemB] = await Promise.all([
    prisma.item.findUnique({
      where: { stableId },
      select: { stableId: true, alternatives: true },
    }),
    prisma.item.findUnique({
      where: { stableId: targetId },
      select: { stableId: true, alternatives: true },
    }),
  ]);

  const newAltsA = removeFromAlts(itemA?.alternatives ?? "", targetId);
  const newAltsB = removeFromAlts(itemB?.alternatives ?? "", stableId);

  // Perbarui tabel Item (Global)
  await Promise.all([
    itemA
      ? prisma.item.update({
          where: { stableId },
          data: { alternatives: newAltsA },
        })
      : Promise.resolve(),
    itemB
      ? prisma.item.update({
          where: { stableId: targetId },
          data: { alternatives: newAltsB },
        })
      : Promise.resolve(),
    logChange({
      entity: 'item',
      entityId: stableId,
      field: 'alternatives',
      oldValue: itemA?.alternatives,
      newValue: newAltsA,
      changedBy: user.username,
      context: `Unlinked from ${targetId}`
    }),
    logChange({
      entity: 'item',
      entityId: targetId,
      field: 'alternatives',
      oldValue: itemB?.alternatives,
      newValue: newAltsB,
      changedBy: user.username,
      context: `Unlinked from ${stableId}`
    })
  ]);

  // Perbarui tabel ProductItem (BOM Rows) - Hapus spesifik ID yang di-unlink
  const allProductItemsA = await prisma.productItem.findMany({
    where: { stableId, alternatives: { contains: targetId } },
  });
  const allProductItemsB = await prisma.productItem.findMany({
    where: { stableId: targetId, alternatives: { contains: stableId } },
  });

  await Promise.all([
    ...allProductItemsA.map((pi) =>
      prisma.productItem.update({
        where: {
          productId_stableId: { productId: pi.productId, stableId: pi.stableId },
        },
        data: { alternatives: removeFromAlts(pi.alternatives, targetId) || null },
      }),
    ),
    ...allProductItemsB.map((pi) =>
      prisma.productItem.update({
        where: {
          productId_stableId: { productId: pi.productId, stableId: pi.stableId },
        },
        data: { alternatives: removeFromAlts(pi.alternatives, stableId) || null },
      }),
    ),
  ]);

  return c.json({ ok: true });
});

items.get('/:stableId', async (c) => {
  const stableId = c.req.param('stableId')
  const item = await prisma.item.findUnique({
    where: { stableId },
    include: {
      products: {
        include: { product: { select: { id: true, name: true } } }
      }
    }
  })
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json(item)
})

items.post('/', requireRole('admin', 'super'), async (c) => {
  const data = await c.req.json()
  const user = c.get('user')

  // Duplicate check: same partNumber + manufacturer (case-insensitive)
  if (data.partNumber && data.manufacturer) {
    const existing = await prisma.item.findFirst({
      where: {
        partNumber: { equals: data.partNumber, mode: 'insensitive' as const },
        manufacturer: { equals: data.manufacturer, mode: 'insensitive' as const },
      },
      select: { stableId: true, partNumber: true, manufacturer: true },
    })
    if (existing) {
      return c.json({
        error: 'Duplicate item',
        existing,
        message: `Part number "${existing.partNumber}" from "${existing.manufacturer}" already exists (${existing.stableId})`,
      }, 409)
    }
  }

  const item = await prisma.item.create({ data })
  
  await logChange({
    entity: 'item',
    entityId: item.stableId,
    field: 'all',
    oldValue: null,
    newValue: item.partNumber || item.stableId,
    changedBy: user.username,
    context: 'Manual Creation'
  })

  return c.json(item, 201)
})

items.patch('/:stableId', requireRole('admin', 'super'), async (c) => {
  const stableId = c.req.param('stableId')
  const user = c.get('user')
  const data = await c.req.json()
  
  const oldItem = await prisma.item.findUnique({ where: { stableId } })
  if (!oldItem) return c.json({ error: 'Not found' }, 404)

  const item = await prisma.item.update({ where: { stableId }, data })

  // Log each changed field
  for (const field of Object.keys(data)) {
    const oldValue = (oldItem as any)[field]
    const newValue = (data as any)[field]
    
    if (String(oldValue) !== String(newValue)) {
      await logChange({
        entity: 'item',
        entityId: stableId,
        field,
        oldValue: oldValue === null ? null : String(oldValue),
        newValue: newValue === null ? null : String(newValue),
        changedBy: user.username,
        context: 'Manual Edit'
      })
    }
  }

  return c.json(item)
})

items.delete('/:stableId', requireRole('admin', 'super'), async (c) => {
  const stableId = c.req.param('stableId')
  const user = c.get('user')
  
  const oldItem = await prisma.item.findUnique({ where: { stableId } })
  if (!oldItem) return c.json({ error: 'Not found' }, 404)

  function removeFromAlts(current: string | null, remove: string): string {
    if (!current) return ''
    return current
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(s => s && s.toLowerCase() !== remove.toLowerCase())
      .join(';')
  }

  // 1. Cari semua Item Global yang mengandung ID ini sebagai alternatif
  const globalAffected = await prisma.item.findMany({
    where: { alternatives: { contains: stableId } },
    select: { stableId: true, alternatives: true }
  })

  // 2. Cari semua baris BOM (ProductItem) yang mengandung ID ini sebagai alternatif
  const bomRowsAffected = await prisma.productItem.findMany({
    where: { alternatives: { contains: stableId } },
    select: { productId: true, stableId: true, alternatives: true }
  })

  // 3. Eksekusi pembersihan massal sebelum data utama dihapus
  await Promise.all([
    // Bersihkan di tabel Item Global
    ...globalAffected.map(it => 
      prisma.item.update({
        where: { stableId: it.stableId },
        data: { alternatives: removeFromAlts(it.alternatives, stableId) || null }
      })
    ),
    // Bersihkan di tabel ProductItem (BOM Rows)
    ...bomRowsAffected.map(pi => 
      prisma.productItem.update({
        where: { productId_stableId: { productId: pi.productId, stableId: pi.stableId } },
        data: { alternatives: removeFromAlts(pi.alternatives, stableId) || null }
      })
    ),
    // 4. Baru hapus data barang aslinya
    prisma.item.delete({ where: { stableId } }),
    logChange({
      entity: 'item',
      entityId: stableId,
      field: 'all',
      oldValue: oldItem.partNumber || oldItem.stableId,
      newValue: null,
      changedBy: user.username,
      context: 'Item Deleted'
    })
  ])

  return c.json({ ok: true })
})

items.post('/bulk-delete', requireRole('admin', 'super'), async (c) => {
  const { stableIds } = await c.req.json()
  
  if (!Array.isArray(stableIds) || !stableIds.length) {
    return c.json({ error: 'stableIds array required' }, 400)
  }

  const result = await prisma.item.deleteMany({
    where: {
      stableId: { in: stableIds }
    }
  })

  return c.json({ deletedCount: result.count })
})

export default items
