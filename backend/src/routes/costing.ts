import { Hono } from 'hono'
import prisma from '../lib/prisma.js'
import { authMiddleware, requireRole, AuthUser } from '../middleware/auth.js'

const costing = new Hono<{ Variables: { user: AuthUser } }>()
costing.use('*', authMiddleware, requireRole('super'))

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

/**
 * Smart Price Resolver:
 * 1. Checks supplierPrices JSON for any supplier with stock > 0.
 * 2. If multiple have stock, picks the cheapest among them.
 * 3. Fallback: If no one has stock, uses the global priceMin.
 */
function getEffectivePrice(item: { priceMin: number | null; supplierPrices?: string | null }): number | null {
  if (!item.supplierPrices) return item.priceMin

  try {
    const spMap = JSON.parse(item.supplierPrices)
    const entries = Object.values(spMap) as any[]
    
    // 1. Try cheapest among IN-STOCK suppliers
    const inStock = entries
      .filter((s: any) => s.price != null && (s.quantity_available ?? 0) > 0)
      .map((s: any) => s.price as number)

    if (inStock.length > 0) {
      return Math.min(...inStock)
    }

    // 2. Fallback: cheapest among all available prices (even if 0 stock)
    const allPrices = entries
      .filter((s: any) => s.price != null)
      .map((s: any) => s.price as number)
      
    if (allPrices.length > 0) {
      return Math.min(...allPrices)
    }
  } catch (e) {
    console.error(`[Costing] Failed to parse supplierPrices for item`, e)
  }

  return item.priceMin
}

// Cost per product: sum of (priceMin * quantitySum) for each BOM row
costing.get('/products', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const idsStr = c.req.query('ids')
  const ids = idsStr ? idsStr.split(',').map(Number).filter(n => !isNaN(n)) : null
  const rate = DEFAULT_RATES[currency] ?? 1

  const products = await prisma.product.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: 'asc' },
    include: {
      items: {
        include: {
          item: { select: { stableId: true, priceMin: true, priceCurrency: true, supplierPrices: true } }
        }
      }
    }
  })

  const result = products.map(p => {
    let totalUSD = 0
    let missingPrices = 0
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)

      if (!effectivePrice || effectivePrice <= 0) {
        missingPrices++
      } else {
        // Normalize to USD first (all prices assumed to be in item.priceCurrency)
        const itemRate = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        totalUSD += (effectivePrice / itemRate) * qty
      }
    }
    return {
      productId: p.id,
      productName: p.name,
      bomRows: p.items.length,
      missingPrices,
      totalUSD,
      total: totalUSD * rate,
      currency,
    }
  })

  return c.json(result)
})

// Cost per set: resolve set products × qty, sum product costs
costing.get('/sets', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const idsStr = c.req.query('ids')
  const ids = idsStr ? idsStr.split(',').map(Number).filter(n => !isNaN(n)) : null
  const rate = DEFAULT_RATES[currency] ?? 1

  // Resolve sets (with parent inheritance)
  const sets = await prisma.configSet.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: 'asc' },
    include: {
      items: { orderBy: { orderIndex: 'asc' } },
      parent: { select: { id: true, name: true } },
    }
  })

  // To compute cost for these sets, we need product costs.
  // We'll fetch all products that might be used in these sets.
  // For simplicity if no IDs are provided, we fetch all. 
  // If IDs are provided, we could technically just fetch those used, but let's stick to filtering for now.
  const allProducts = await prisma.product.findMany({
    include: {
      items: {
        include: { item: { select: { priceMin: true, priceCurrency: true, supplierPrices: true } } }
      }
    }
  })

  const productCostUSD = new Map<number, { cost: number; missing: number }>()
  for (const p of allProducts) {
    let cost = 0
    let missing = 0
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)

      if (!effectivePrice || effectivePrice <= 0) {
        missing++
      } else {
        const itemRate = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        cost += (effectivePrice / itemRate) * qty
      }
    }
    productCostUSD.set(p.id, { cost, missing })
  }

  // We need ALL sets in memory for the recursive resolveSetCost if it depends on parents
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

    let totalCost = 0
    let totalMissing = 0
    for (const [pid, qty] of productQtys.entries()) {
      const pc = productCostUSD.get(pid)
      if (pc) {
        totalCost += pc.cost * qty
        totalMissing += pc.missing
      }
    }

    return { products: productQtys, missing: totalMissing }
  }

  const result = await Promise.all(sets.map(async s => {
    const { products: productQtys, missing } = await resolveSetCost(s.id)
    let totalCostUSD = 0
    for (const [pid, qty] of productQtys.entries()) {
      const pc = productCostUSD.get(pid)
      if (pc) totalCostUSD += pc.cost * qty
    }
    return {
      setId: s.id,
      setName: s.name,
      parentName: s.parent?.name ?? null,
      products: productQtys.size,
      missingPrices: missing,
      totalUSD: totalCostUSD,
      total: totalCostUSD * rate,
      currency,
    }
  }))

  return c.json(result)
})

// Cost breakdown by supplier
costing.get('/by-supplier', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const rate = DEFAULT_RATES[currency] ?? 1

  const items = await prisma.item.findMany({
    where: { priceMin: { gt: 0 } },
    select: { stableId: true, priceMin: true, priceCurrency: true, suppliers: true }
  })

  const bomRows = await prisma.productItem.findMany({
    select: { stableId: true, quantitySum: true }
  })

  // Build usage map: stableId → total qty used in BOM
  const usageMap = new Map<string, number>()
  for (const br of bomRows) {
    usageMap.set(br.stableId, (usageMap.get(br.stableId) ?? 0) + (br.quantitySum ?? 1))
  }

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
      if (existing) {
        existing.lines++
        existing.totalUSD += costUSD / sups.length
      } else {
        supplierCost.set(sup, { lines: 1, totalUSD: costUSD / sups.length })
      }
    }
  }

  const result = Array.from(supplierCost.entries())
    .map(([supplier, v]) => ({
      supplier,
      lines: v.lines,
      totalUSD: v.totalUSD,
      total: v.totalUSD * rate,
      currency,
    }))
    .sort((a, b) => b.totalUSD - a.totalUSD)

  return c.json(result)
})

// Available currencies + rates
costing.get('/rates', async (c) => {
  return c.json(DEFAULT_RATES)
})

// Helper: get all ConfigSetItems for a set (resolving parent inheritance)
async function resolveSetProductQtys(setId: number): Promise<Map<number, number>> {
  // Simple version without recursion depth limit for now (matches supersets.ts logic)
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

// Cost per project (superset): aggregate products × qty, sum costs, find top items
costing.get('/supersets', async (c) => {
  const currency = c.req.query('currency') || 'USD'
  const idsStr = c.req.query('ids')
  const ids = idsStr ? idsStr.split(',').map(Number).filter(n => !isNaN(n)) : null
  const rate = DEFAULT_RATES[currency] ?? 1

  // 1. Calculate cost per product first
  const allProducts = await prisma.product.findMany({
    include: {
      items: {
        include: { item: { select: { stableId: true, partNumber: true, productName: true, priceMin: true, priceCurrency: true, supplierPrices: true } } }
      }
    }
  })

  const productData = new Map<number, { cost: number; missing: number; itemUsage: Map<string, { qty: number, price: number, pn: string, name: string }> }>()
  for (const p of allProducts) {
    let cost = 0
    let missing = 0
    const usage = new Map<string, { qty: number, price: number, pn: string, name: string }>()
    
    for (const pi of p.items) {
      const qty = pi.quantitySum ?? 1
      const effectivePrice = getEffectivePrice(pi.item)

      if (!effectivePrice || effectivePrice <= 0) {
        missing++
      } else {
        const itemRate = DEFAULT_RATES[pi.item.priceCurrency ?? 'USD'] ?? 1
        const priceUSD = effectivePrice / itemRate
        cost += priceUSD * qty
        usage.set(pi.item.stableId, { qty, price: priceUSD, pn: pi.item.partNumber || '', name: pi.item.productName || '' })
      }
    }
    productData.set(p.id, { cost, missing, itemUsage: usage })
  }

  // 2. Resolve Projects
  const supersets = await prisma.superset.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: 'asc' },
    include: { items: { include: { set: true } } }
  })

  const result = await Promise.all(supersets.map(async ss => {
    let totalCostUSD = 0
    let totalMissing = 0
    const projectItems = new Map<string, { qty: number, price: number, pn: string, name: string, totalCost: number }>()

    for (const si of ss.items) {
      const setQtys = await resolveSetProductQtys(si.setId)
      for (const [productId, productQty] of setQtys.entries()) {
        const scaled = productQty * si.qty
        const pd = productData.get(productId)
        if (pd) {
          totalCostUSD += pd.cost * scaled
          totalMissing += pd.missing // Note: this might count same item multiple times if in different products

          // Aggregate items for budget drainer
          for (const [stableId, usage] of pd.itemUsage.entries()) {
            const existing = projectItems.get(stableId)
            const itemTotalQty = usage.qty * scaled
            if (existing) {
              existing.qty += itemTotalQty
              existing.totalCost += usage.price * itemTotalQty
            } else {
              projectItems.set(stableId, { 
                qty: itemTotalQty, 
                price: usage.price, 
                pn: usage.pn, 
                name: usage.name, 
                totalCost: usage.price * itemTotalQty 
              })
            }
          }
        }
      }
    }

    // Sort items by total cost to find budget drainers
    const drainers = Array.from(projectItems.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)
      .map(d => ({
        ...d,
        totalCost: d.totalCost * rate,
        price: d.price * rate
      }))

    return {
      projectId: ss.id,
      projectName: ss.name,
      productCount: ss.items.length,
      missingPrices: totalMissing,
      totalUSD: totalCostUSD,
      total: totalCostUSD * rate,
      currency,
      budgetDrainers: drainers
    }
  }))

  return c.json(result)
})

export default costing
