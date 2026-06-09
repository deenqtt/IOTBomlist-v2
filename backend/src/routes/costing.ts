import { Hono } from 'hono'
import prisma from '../lib/prisma.js'
import { authMiddleware, requireRole, AuthUser } from '../middleware/auth.js'

const costing = new Hono<{ Variables: { user: AuthUser } }>()
costing.use('*', authMiddleware, requireRole('admin', 'super'))

// USD base exchange rates (rough defaults, can be overridden client-side)
const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  IDR: 16000,
  EUR: 0.92,
  GBP: 0.79,
  CNY: 7.25,
  JPY: 155,
  SGD: 1.35,
  AUD: 1.55,
  CAD: 1.37,
  KRW: 1370,
  INR: 83.5,
}

type PriceItem = { priceMin: number | null; supplierPrices?: string | null }

function getEffectivePrice(item: PriceItem): number | null {
  if (!item.supplierPrices) return item.priceMin
  try {
    const spMap = JSON.parse(item.supplierPrices)
    const entries = Object.values(spMap) as any[]
    const inStock = entries
      .filter((s: any) => s.price != null && (s.quantity_available ?? 0) > 0)
      .map((s: any) => s.price as number)
    if (inStock.length > 0) return Math.min(...inStock)
    const allPrices = entries.filter((s: any) => s.price != null).map((s: any) => s.price as number)
    if (allPrices.length > 0) return Math.min(...allPrices)
  } catch (e) {
    console.error(`[Costing] Failed to parse supplierPrices`, e)
  }
  return item.priceMin
}

function getAltEffectivePrice(item: PriceItem, altIds: string[], altMap: Map<string, PriceItem>): number | null {
  const mainPrice = getEffectivePrice(item)
  if (altIds.length === 0) return mainPrice
  const altPrices = altIds
    .map(id => altMap.get(id))
    .filter((a): a is PriceItem => !!a)
    .map(a => getEffectivePrice(a))
    .filter((p): p is number => p !== null && p > 0)
  const candidates = [mainPrice, ...altPrices].filter((p): p is number => p !== null && p > 0)
  return candidates.length > 0 ? Math.min(...candidates) : mainPrice
}

// ── Cache helpers ──────────────────────────────────────────────────────────────

export async function invalidateCosts(): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'cost_last_invalidated_at' },
    create: { key: 'cost_last_invalidated_at', value: Date.now().toString() },
    update: { value: Date.now().toString() },
  })
}

async function getCostInvalidatedAt(): Promise<Date> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'cost_last_invalidated_at' } })
  if (!row) return new Date(0)
  return new Date(parseInt(row.value))
}

function isFresh(costUpdatedAt: Date | null, invalidatedAt: Date): boolean {
  return costUpdatedAt != null && costUpdatedAt > invalidatedAt
}

// GET /costing/status — last invalidation + calculation timestamps
costing.get('/status', async (c) => {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'cost_last_invalidated_at' } })
  const lastInvalidatedAt = row ? new Date(parseInt(row.value)) : null

  const [lastProduct, lastSet, lastSuperset] = await Promise.all([
    prisma.product.findFirst({ where: { costUpdatedAt: { not: null } }, orderBy: { costUpdatedAt: 'desc' }, select: { costUpdatedAt: true } }),
    prisma.configSet.findFirst({ where: { costUpdatedAt: { not: null } }, orderBy: { costUpdatedAt: 'desc' }, select: { costUpdatedAt: true } }),
    prisma.superset.findFirst({ where: { costUpdatedAt: { not: null } }, orderBy: { costUpdatedAt: 'desc' }, select: { costUpdatedAt: true } }),
  ])

  const lastCalculatedAt = [lastProduct?.costUpdatedAt, lastSet?.costUpdatedAt, lastSuperset?.costUpdatedAt]
    .filter(Boolean)
    .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null

  return c.json({ lastInvalidatedAt, lastCalculatedAt })
})

// POST /costing/recalculate — force recalculate all costs
costing.post('/recalculate', async (c) => {
  // Reset invalidation timestamp so all entities are considered stale
  await prisma.systemSetting.upsert({
    where: { key: 'cost_last_invalidated_at' },
    create: { key: 'cost_last_invalidated_at', value: '0' },
    update: { value: '0' },
  })

  const now = new Date()

  // ── Recalculate Products ────────────────────────────────────────────────────
  const allProducts = await prisma.product.findMany({
    include: {
      items: {
        include: {
          item: { select: { stableId: true, priceMin: true, priceCurrency: true, supplierPrices: true, alternatives: true } }
        }
      }
    }
  })

  const allAltIds = new Set<string>()
  for (const p of allProducts)
    for (const pi of p.items)
      if (pi.item.alternatives) pi.item.alternatives.split(';').filter(Boolean).forEach(id => allAltIds.add(id.trim()))
  const altItems = await prisma.item.findMany({
    where: { stableId: { in: [...allAltIds] } },
    select: { stableId: true, priceMin: true, priceCurrency: true, supplierPrices: true }
  })
  const altMap = new Map(altItems.map(a => [a.stableId, a]))

  const productCostUSD = new Map<number, { cost: number; altCost: number; missing: number }>()
  for (const p of allProducts) {
    let totalUSD = 0, altTotalUSD = 0, missing = 0
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)
      const altIds = pi.item.alternatives ? pi.item.alternatives.split(';').map(s => s.trim()).filter(Boolean) : []
      const altPrice = getAltEffectivePrice(pi.item, altIds, altMap)
      if (!effectivePrice || effectivePrice <= 0) {
        missing++
      } else {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        totalUSD += (effectivePrice / r) * qty
      }
      if (altPrice && altPrice > 0) {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        altTotalUSD += (altPrice / r) * qty
      } else if (effectivePrice && effectivePrice > 0) {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        altTotalUSD += (effectivePrice / r) * qty
      }
    }
    productCostUSD.set(p.id, { cost: totalUSD, altCost: altTotalUSD, missing })
  }

  await Promise.all(allProducts.map(p => {
    const data = productCostUSD.get(p.id)!
    return prisma.product.update({
      where: { id: p.id },
      data: { estCostUSD: data.cost, estAltCostUSD: data.altCost, missingPrices: data.missing, costUpdatedAt: now }
    })
  }))

  // ── Recalculate Sets ────────────────────────────────────────────────────────
  const allSets = await prisma.configSet.findMany({
    include: { items: { orderBy: { orderIndex: 'asc' } }, parent: { select: { id: true, name: true } } }
  })

  async function resolveSetCostRecalc(setId: number, depth = 0): Promise<{ products: Map<number, number>; missing: number }> {
    if (depth > 8) return { products: new Map(), missing: 0 }
    const cs = allSets.find(s => s.id === setId)
    if (!cs) return { products: new Map(), missing: 0 }
    const base = cs.parentSetId ? await resolveSetCostRecalc(cs.parentSetId, depth + 1) : { products: new Map<number, number>(), missing: 0 }
    const productQtys = new Map(base.products)
    for (const item of cs.items) {
      const op = item.op.toLowerCase()
      if (op === 'remove') productQtys.delete(item.mainProductId)
      else if (op === 'add') productQtys.set(item.mainProductId, (productQtys.get(item.mainProductId) ?? 0) + item.qty)
      else productQtys.set(item.mainProductId, item.qty)
    }
    let totalMissing = 0
    for (const [pid] of productQtys.entries()) {
      const pc = productCostUSD.get(pid)
      if (pc) totalMissing += pc.missing
    }
    return { products: productQtys, missing: totalMissing }
  }

  await Promise.all(allSets.map(async s => {
    const { products: productQtys, missing } = await resolveSetCostRecalc(s.id)
    let totalCostUSD = 0, altTotalCostUSD = 0
    for (const [pid, qty] of productQtys.entries()) {
      const pc = productCostUSD.get(pid)
      if (pc) { totalCostUSD += pc.cost * qty; altTotalCostUSD += pc.altCost * qty }
    }
    await prisma.configSet.update({
      where: { id: s.id },
      data: { estCostUSD: totalCostUSD, estAltCostUSD: altTotalCostUSD, missingPrices: missing, costUpdatedAt: now }
    })
  }))

  // ── Recalculate Supersets ───────────────────────────────────────────────────
  const allSupersets = await prisma.superset.findMany({
    include: { items: { include: { set: true } } }
  })

  async function resolveSetQtysRecalc(setId: number): Promise<Map<number, number>> {
    async function resolve(sid: number, depth = 0): Promise<Map<number, number>> {
      if (depth > 8) return new Map()
      const cs = allSets.find(s => s.id === sid)
      if (!cs) return new Map()
      const base = cs.parentSetId ? await resolve(cs.parentSetId, depth + 1) : new Map<number, number>()
      const out = new Map(base)
      for (const item of cs.items) {
        const op = item.op.toLowerCase()
        if (op === 'remove') out.delete(item.mainProductId)
        else if (op === 'add') out.set(item.mainProductId, (out.get(item.mainProductId) ?? 0) + item.qty)
        else out.set(item.mainProductId, item.qty)
      }
      return out
    }
    return resolve(setId)
  }

  // Fetch full product item data for budget drainers
  const productItemData = new Map<number, { itemUsage: Map<string, { qty: number; price: number; pn: string; name: string }> }>()
  const allProductsFull = await prisma.product.findMany({
    include: {
      items: {
        include: { item: { select: { stableId: true, partNumber: true, productName: true, priceMin: true, priceCurrency: true, supplierPrices: true, alternatives: true } } }
      }
    }
  })
  for (const p of allProductsFull) {
    const usage = new Map<string, { qty: number; price: number; pn: string; name: string }>()
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)
      if (effectivePrice && effectivePrice > 0) {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        usage.set(pi.item.stableId, { qty, price: effectivePrice / r, pn: pi.item.partNumber || '', name: pi.item.productName || '' })
      }
    }
    productItemData.set(p.id, { itemUsage: usage })
  }

  await Promise.all(allSupersets.map(async ss => {
    let totalCostUSD = 0, altTotalCostUSD = 0, totalMissing = 0
    const projectItems = new Map<string, { qty: number; price: number; pn: string; name: string; totalCost: number }>()

    for (const si of ss.items) {
      const setQtys = await resolveSetQtysRecalc(si.setId)
      for (const [productId, productQty] of setQtys.entries()) {
        const scaled = productQty * si.qty
        const pc = productCostUSD.get(productId)
        if (pc) {
          totalCostUSD += pc.cost * scaled
          altTotalCostUSD += pc.altCost * scaled
          totalMissing += pc.missing
        }
        const pid_data = productItemData.get(productId)
        if (pid_data) {
          for (const [stableId, usage] of pid_data.itemUsage.entries()) {
            const itemTotalQty = usage.qty * scaled
            const existing = projectItems.get(stableId)
            if (existing) { existing.qty += itemTotalQty; existing.totalCost += usage.price * itemTotalQty }
            else projectItems.set(stableId, { qty: itemTotalQty, price: usage.price, pn: usage.pn, name: usage.name, totalCost: usage.price * itemTotalQty })
          }
        }
      }
    }

    const drainers = Array.from(projectItems.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)

    await prisma.superset.update({
      where: { id: ss.id },
      data: {
        estCostUSD: totalCostUSD,
        estAltCostUSD: altTotalCostUSD,
        missingPrices: totalMissing,
        costUpdatedAt: now,
        budgetDrainersJson: JSON.stringify(drainers),
      }
    })
  }))

  return c.json({
    recalculated: {
      products: allProducts.length,
      sets: allSets.length,
      supersets: allSupersets.length,
    },
    calculatedAt: now,
  })
})

// GET /costing/products
costing.get('/products', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const idsStr = c.req.query('ids')
  const ids = idsStr ? idsStr.split(',').map(Number).filter(n => !isNaN(n)) : null
  const rate = DEFAULT_RATES[currency] ?? 1

  const invalidatedAt = await getCostInvalidatedAt()

  const products = await prisma.product.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true,
      estCostUSD: true, estAltCostUSD: true, missingPrices: true, costUpdatedAt: true,
      _count: { select: { items: true } }
    }
  })

  const staleIds = products.filter(p => !isFresh(p.costUpdatedAt, invalidatedAt)).map(p => p.id)

  if (staleIds.length === 0) {
    return c.json(products.map(p => ({
      productId: p.id,
      productName: p.name,
      bomRows: p._count.items,
      missingPrices: p.missingPrices ?? 0,
      totalUSD: p.estCostUSD ?? 0,
      total: (p.estCostUSD ?? 0) * rate,
      altTotalUSD: p.estAltCostUSD ?? 0,
      altTotal: (p.estAltCostUSD ?? 0) * rate,
      currency,
    })))
  }

  // Load stale products with full BOM for recalculation
  const staleProducts = await prisma.product.findMany({
    where: { id: { in: staleIds } },
    include: {
      items: {
        include: {
          item: { select: { stableId: true, priceMin: true, priceCurrency: true, supplierPrices: true, alternatives: true } }
        }
      }
    }
  })

  const allAltIds = new Set<string>()
  for (const p of staleProducts)
    for (const pi of p.items)
      if (pi.item.alternatives) pi.item.alternatives.split(';').filter(Boolean).forEach(id => allAltIds.add(id.trim()))
  const altItems = await prisma.item.findMany({
    where: { stableId: { in: [...allAltIds] } },
    select: { stableId: true, priceMin: true, priceCurrency: true, supplierPrices: true }
  })
  const altMap = new Map(altItems.map(a => [a.stableId, a]))

  const now = new Date()
  const computed = new Map<number, { totalUSD: number; altTotalUSD: number; missingPrices: number; bomRows: number }>()

  for (const p of staleProducts) {
    let totalUSD = 0, altTotalUSD = 0, missingPrices = 0
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)
      const altIds = pi.item.alternatives ? pi.item.alternatives.split(';').map(s => s.trim()).filter(Boolean) : []
      const altPrice = getAltEffectivePrice(pi.item, altIds, altMap)
      if (!effectivePrice || effectivePrice <= 0) {
        missingPrices++
      } else {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        totalUSD += (effectivePrice / r) * qty
      }
      if (altPrice && altPrice > 0) {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        altTotalUSD += (altPrice / r) * qty
      } else if (effectivePrice && effectivePrice > 0) {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        altTotalUSD += (effectivePrice / r) * qty
      }
    }
    computed.set(p.id, { totalUSD, altTotalUSD, missingPrices, bomRows: p.items.length })
  }

  await Promise.all(Array.from(computed.entries()).map(([id, data]) =>
    prisma.product.update({
      where: { id },
      data: { estCostUSD: data.totalUSD, estAltCostUSD: data.altTotalUSD, missingPrices: data.missingPrices, costUpdatedAt: now }
    })
  ))

  return c.json(products.map(p => {
    const calc = computed.get(p.id)
    if (calc) {
      return {
        productId: p.id, productName: p.name, bomRows: calc.bomRows,
        missingPrices: calc.missingPrices,
        totalUSD: calc.totalUSD, total: calc.totalUSD * rate,
        altTotalUSD: calc.altTotalUSD, altTotal: calc.altTotalUSD * rate,
        currency,
      }
    }
    return {
      productId: p.id, productName: p.name, bomRows: p._count.items,
      missingPrices: p.missingPrices ?? 0,
      totalUSD: p.estCostUSD ?? 0, total: (p.estCostUSD ?? 0) * rate,
      altTotalUSD: p.estAltCostUSD ?? 0, altTotal: (p.estAltCostUSD ?? 0) * rate,
      currency,
    }
  }))
})

// GET /costing/sets
costing.get('/sets', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const idsStr = c.req.query('ids')
  const ids = idsStr ? idsStr.split(',').map(Number).filter(n => !isNaN(n)) : null
  const rate = DEFAULT_RATES[currency] ?? 1

  const invalidatedAt = await getCostInvalidatedAt()

  const sets = await prisma.configSet.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: 'asc' },
    include: {
      items: { orderBy: { orderIndex: 'asc' } },
      parent: { select: { id: true, name: true } },
    }
  })

  const allFresh = sets.every(s => isFresh(s.costUpdatedAt, invalidatedAt))

  if (allFresh) {
    return c.json(sets.map(s => ({
      setId: s.id, setName: s.name, parentName: s.parent?.name ?? null,
      products: s.items.length,
      missingPrices: s.missingPrices ?? 0,
      totalUSD: s.estCostUSD ?? 0, total: (s.estCostUSD ?? 0) * rate,
      altTotalUSD: s.estAltCostUSD ?? 0, altTotal: (s.estAltCostUSD ?? 0) * rate,
      currency,
    })))
  }

  // Recalculate all sets
  const allProducts = await prisma.product.findMany({
    include: {
      items: {
        include: { item: { select: { priceMin: true, priceCurrency: true, supplierPrices: true, alternatives: true } } }
      }
    }
  })

  const setsAltIds = new Set<string>()
  for (const p of allProducts)
    for (const pi of p.items)
      if (pi.item.alternatives) pi.item.alternatives.split(';').filter(Boolean).forEach(id => setsAltIds.add(id.trim()))
  const setsAltItems = await prisma.item.findMany({
    where: { stableId: { in: [...setsAltIds] } },
    select: { stableId: true, priceMin: true, priceCurrency: true, supplierPrices: true }
  })
  const setsAltMap = new Map(setsAltItems.map(a => [a.stableId, a]))

  const productCostUSD = new Map<number, { cost: number; altCost: number; missing: number }>()
  for (const p of allProducts) {
    let cost = 0, altCost = 0, missing = 0
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)
      const altIds = pi.item.alternatives ? pi.item.alternatives.split(';').map(s => s.trim()).filter(Boolean) : []
      const altPrice = getAltEffectivePrice(pi.item, altIds, setsAltMap)
      if (!effectivePrice || effectivePrice <= 0) { missing++ }
      else { const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1; cost += (effectivePrice / r) * qty }
      if (altPrice && altPrice > 0) { const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1; altCost += (altPrice / r) * qty }
      else if (effectivePrice && effectivePrice > 0) { const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1; altCost += (effectivePrice / r) * qty }
    }
    productCostUSD.set(p.id, { cost, altCost, missing })
  }

  const allSetsForResolution = await prisma.configSet.findMany({
    include: { items: { orderBy: { orderIndex: 'asc' } } }
  })

  async function resolveSetCost(setId: number, depth = 0): Promise<{ products: Map<number, number>; missing: number }> {
    if (depth > 8) return { products: new Map(), missing: 0 }
    const cs = allSetsForResolution.find(s => s.id === setId)
    if (!cs) return { products: new Map(), missing: 0 }
    const base = cs.parentSetId ? await resolveSetCost(cs.parentSetId, depth + 1) : { products: new Map<number, number>(), missing: 0 }
    const productQtys = new Map(base.products)
    for (const item of cs.items) {
      const op = item.op.toLowerCase()
      if (op === 'remove') productQtys.delete(item.mainProductId)
      else if (op === 'add') productQtys.set(item.mainProductId, (productQtys.get(item.mainProductId) ?? 0) + item.qty)
      else productQtys.set(item.mainProductId, item.qty)
    }
    let totalMissing = 0
    for (const [pid] of productQtys.entries()) { const pc = productCostUSD.get(pid); if (pc) totalMissing += pc.missing }
    return { products: productQtys, missing: totalMissing }
  }

  const now = new Date()
  const result = await Promise.all(sets.map(async s => {
    const { products: productQtys, missing } = await resolveSetCost(s.id)
    let totalCostUSD = 0, altTotalCostUSD = 0
    for (const [pid, qty] of productQtys.entries()) {
      const pc = productCostUSD.get(pid)
      if (pc) { totalCostUSD += pc.cost * qty; altTotalCostUSD += pc.altCost * qty }
    }
    await prisma.configSet.update({
      where: { id: s.id },
      data: { estCostUSD: totalCostUSD, estAltCostUSD: altTotalCostUSD, missingPrices: missing, costUpdatedAt: now }
    })
    return {
      setId: s.id, setName: s.name, parentName: s.parent?.name ?? null,
      products: productQtys.size,
      missingPrices: missing,
      totalUSD: totalCostUSD, total: totalCostUSD * rate,
      altTotalUSD: altTotalCostUSD, altTotal: altTotalCostUSD * rate,
      currency,
    }
  }))

  return c.json(result)
})

// GET /costing/by-supplier
costing.get('/by-supplier', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const rate = DEFAULT_RATES[currency] ?? 1

  const items = await prisma.item.findMany({
    where: { priceMin: { gt: 0 } },
    select: { stableId: true, priceMin: true, priceCurrency: true, suppliers: true }
  })
  const bomRows = await prisma.productItem.findMany({ select: { stableId: true, quantitySum: true } })

  const usageMap = new Map<string, number>()
  for (const br of bomRows)
    usageMap.set(br.stableId, (usageMap.get(br.stableId) ?? 0) + (br.quantitySum ?? 1))

  const supplierCost = new Map<string, { lines: number; totalUSD: number }>()
  for (const item of items) {
    if (!item.suppliers) continue
    const sups = item.suppliers.split(/[;,]/).map(s => s.trim()).filter(Boolean)
    const qty = usageMap.get(item.stableId) ?? 0
    if (qty === 0) continue
    const itemRate = DEFAULT_RATES[item.priceCurrency ?? 'USD'] ?? 1
    const costUSD = (item.priceMin! / itemRate) * qty
    for (const sup of sups) {
      const existing = supplierCost.get(sup)
      if (existing) { existing.lines++; existing.totalUSD += costUSD / sups.length }
      else supplierCost.set(sup, { lines: 1, totalUSD: costUSD / sups.length })
    }
  }

  const result = Array.from(supplierCost.entries())
    .map(([supplier, v]) => ({ supplier, lines: v.lines, totalUSD: v.totalUSD, total: v.totalUSD * rate, currency }))
    .sort((a, b) => b.totalUSD - a.totalUSD)

  return c.json(result)
})

// GET /costing/rates
costing.get('/rates', async (c) => c.json(DEFAULT_RATES))

// Helper for supersets: resolve set product qtys
async function resolveSetProductQtys(setId: number): Promise<Map<number, number>> {
  const sets = await prisma.configSet.findMany({
    include: { items: { orderBy: { orderIndex: 'asc' } } }
  })
  async function resolve(sid: number, depth = 0): Promise<Map<number, number>> {
    if (depth > 8) return new Map()
    const cs = sets.find(s => s.id === sid)
    if (!cs) return new Map()
    const base = cs.parentSetId ? await resolve(cs.parentSetId, depth + 1) : new Map<number, number>()
    const out = new Map(base)
    for (const item of cs.items) {
      const op = item.op.toLowerCase()
      if (op === 'remove') out.delete(item.mainProductId)
      else if (op === 'add') out.set(item.mainProductId, (out.get(item.mainProductId) ?? 0) + item.qty)
      else out.set(item.mainProductId, item.qty)
    }
    return out
  }
  return resolve(setId)
}

// GET /costing/supersets
costing.get('/supersets', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const idsStr = c.req.query('ids')
  const ids = idsStr ? idsStr.split(',').map(Number).filter(n => !isNaN(n)) : null
  const rate = DEFAULT_RATES[currency] ?? 1

  const invalidatedAt = await getCostInvalidatedAt()

  const supersets = await prisma.superset.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: 'asc' },
    include: { items: { include: { set: true } } }
  })

  const allFresh = supersets.every(ss => isFresh(ss.costUpdatedAt, invalidatedAt))

  if (allFresh) {
    return c.json(supersets.map(ss => ({
      projectId: ss.id, projectName: ss.name, productCount: ss.items.length,
      missingPrices: ss.missingPrices ?? 0,
      totalUSD: ss.estCostUSD ?? 0, total: (ss.estCostUSD ?? 0) * rate,
      altTotalUSD: ss.estAltCostUSD ?? 0, altTotal: (ss.estAltCostUSD ?? 0) * rate,
      currency,
      budgetDrainers: ss.budgetDrainersJson
        ? (JSON.parse(ss.budgetDrainersJson) as any[]).map(d => ({ ...d, totalCost: d.totalCost * rate, price: d.price * rate }))
        : [],
    })))
  }

  // Recalculate all supersets
  const allProducts = await prisma.product.findMany({
    include: {
      items: {
        include: { item: { select: { stableId: true, partNumber: true, productName: true, priceMin: true, priceCurrency: true, supplierPrices: true, alternatives: true } } }
      }
    }
  })

  const ssAltIds = new Set<string>()
  for (const p of allProducts)
    for (const pi of p.items)
      if (pi.item.alternatives) pi.item.alternatives.split(';').filter(Boolean).forEach(id => ssAltIds.add(id.trim()))
  const ssAltItems = await prisma.item.findMany({
    where: { stableId: { in: [...ssAltIds] } },
    select: { stableId: true, priceMin: true, priceCurrency: true, supplierPrices: true }
  })
  const ssAltMap = new Map(ssAltItems.map(a => [a.stableId, a]))

  const productData = new Map<number, { cost: number; altCost: number; missing: number; itemUsage: Map<string, { qty: number; price: number; pn: string; name: string }> }>()
  for (const p of allProducts) {
    let cost = 0, altCost = 0, missing = 0
    const usage = new Map<string, { qty: number; price: number; pn: string; name: string }>()
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)
      const altIds = pi.item.alternatives ? pi.item.alternatives.split(';').map(s => s.trim()).filter(Boolean) : []
      const altPrice = getAltEffectivePrice(pi.item, altIds, ssAltMap)
      if (!effectivePrice || effectivePrice <= 0) { missing++ }
      else {
        const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        const priceUSD = effectivePrice / r
        cost += priceUSD * qty
        usage.set(pi.item.stableId, { qty, price: priceUSD, pn: pi.item.partNumber || '', name: pi.item.productName || '' })
      }
      if (altPrice && altPrice > 0) { const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1; altCost += (altPrice / r) * qty }
      else if (effectivePrice && effectivePrice > 0) { const r = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1; altCost += (effectivePrice / r) * qty }
    }
    productData.set(p.id, { cost, altCost, missing, itemUsage: usage })
  }

  const now = new Date()
  const result = await Promise.all(supersets.map(async ss => {
    let totalCostUSD = 0, altTotalCostUSD = 0, totalMissing = 0
    const projectItems = new Map<string, { qty: number; price: number; pn: string; name: string; totalCost: number }>()

    for (const si of ss.items) {
      const setQtys = await resolveSetProductQtys(si.setId)
      for (const [productId, productQty] of setQtys.entries()) {
        const scaled = productQty * si.qty
        const pd = productData.get(productId)
        if (pd) {
          totalCostUSD += pd.cost * scaled
          altTotalCostUSD += pd.altCost * scaled
          totalMissing += pd.missing
          for (const [stableId, usage] of pd.itemUsage.entries()) {
            const itemTotalQty = usage.qty * scaled
            const existing = projectItems.get(stableId)
            if (existing) { existing.qty += itemTotalQty; existing.totalCost += usage.price * itemTotalQty }
            else projectItems.set(stableId, { qty: itemTotalQty, price: usage.price, pn: usage.pn, name: usage.name, totalCost: usage.price * itemTotalQty })
          }
        }
      }
    }

    const drainersUSD = Array.from(projectItems.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)

    await prisma.superset.update({
      where: { id: ss.id },
      data: {
        estCostUSD: totalCostUSD, estAltCostUSD: altTotalCostUSD, missingPrices: totalMissing,
        costUpdatedAt: now, budgetDrainersJson: JSON.stringify(drainersUSD),
      }
    })

    return {
      projectId: ss.id, projectName: ss.name, productCount: ss.items.length,
      missingPrices: totalMissing,
      totalUSD: totalCostUSD, total: totalCostUSD * rate,
      altTotalUSD: altTotalCostUSD, altTotal: altTotalCostUSD * rate,
      currency,
      budgetDrainers: drainersUSD.map(d => ({ ...d, totalCost: d.totalCost * rate, price: d.price * rate }))
    }
  }))

  return c.json(result)
})

export default costing
