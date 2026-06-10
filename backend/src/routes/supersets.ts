import { Hono } from 'hono'
import ExcelJS from 'exceljs'
import { join } from 'path'
import prisma from '../lib/prisma.js'
import { authMiddleware, requireRole, AuthUser } from '../middleware/auth.js'
import { logChange } from '../lib/changelog.js'
import { invalidateCosts } from './costing.js'

const supersets = new Hono<{ Variables: { user: AuthUser } }>()
supersets.use('*', authMiddleware)

/**
 * Smart Price & Supplier Resolver
 */
function getEffectiveSupplier(item: {
  priceMin: number | null;
  supplierPrices?: string | null;
}): {
  price: number | null;
  supplier: string | null;
  supplierStock: number | null;
  hasStockData: boolean;
} {
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
    const entries = Object.entries(spMap) as [string, any][];
    let bestPrice = Infinity;
    let bestSup = null;
    let bestStock = null;
    let hasStockData = false;

    for (const [key, s] of entries) {
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
                ? Number(s.quantity_available)
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
  } catch { /* ignore */ }

  return {
    price: item.priceMin,
    supplier: null,
    supplierStock: null,
    hasStockData: false,
  };
}

function getPurchaseUrl(
  supplierPrices?: string | null,
  links?: string | null,
  effectiveSup?: string | null,
): string {
  if (supplierPrices) {
    try {
      const sp = JSON.parse(supplierPrices);
      if (effectiveSup && sp[effectiveSup]?.url) return sp[effectiveSup].url;
      return (
        sp.lcsc?.url || sp.mouser?.url || sp.digikey?.url || sp.other?.url || ""
      );
    } catch { /* ignore */ }
  }
  return links || "";
}

supersets.get('/', async (c) => {
  const data = await prisma.superset.findMany({
    include: { items: { include: { set: true }, orderBy: { orderIndex: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  return c.json(data)
})

// Helper: get all ConfigSetItems for a set (resolving parent inheritance)
async function resolveSetProductQtys(setId: number, depth = 0): Promise<Map<number, number>> {
  if (depth > 8) return new Map()
  const cs = await prisma.configSet.findUnique({
    where: { id: setId },
    include: { items: { orderBy: { orderIndex: 'asc' } } },
  })
  if (!cs) return new Map()

  const base = cs.parentSetId ? await resolveSetProductQtys(cs.parentSetId, depth + 1) : new Map<number, number>()
  const out = new Map(base)

  for (const item of cs.items) {
    const op = item.op.toLowerCase()
    if (op === 'remove') out.delete(item.mainProductId)
    else if (op === 'add') out.set(item.mainProductId, (out.get(item.mainProductId) ?? 0) + item.qty)
    else out.set(item.mainProductId, item.qty)
  }
  return out
}

// Resolve superset contents
supersets.get('/:id/contents', async (c) => {
  const id = Number(c.req.param('id'))
  const ss = await prisma.superset.findUnique({
    where: { id },
    include: { items: { orderBy: { orderIndex: 'asc' }, include: { set: true } } },
  })
  if (!ss) return c.json({ error: 'Not found' }, 404)

  const productAgg = new Map<number, { totalQty: number; setContributions: { setName: string; qty: number }[] }>()
  for (const si of ss.items) {
    const setQtys = await resolveSetProductQtys(si.setId)
    for (const [productId, productQty] of setQtys.entries()) {
      const scaled = productQty * si.qty
      const existing = productAgg.get(productId)
      if (existing) {
        existing.totalQty += scaled
        existing.setContributions.push({ setName: si.set.name, qty: scaled })
      } else {
        productAgg.set(productId, { totalQty: scaled, setContributions: [{ setName: si.set.name, qty: scaled }] })
      }
    }
  }

  const productIds = Array.from(productAgg.keys())
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  })
  const nameById = Object.fromEntries(products.map(p => [p.id, p.name]))

  const rows = Array.from(productAgg.entries()).map(([productId, v]) => ({
    productId,
    productName: nameById[productId] ?? String(productId),
    totalQty: v.totalQty,
    setContributions: v.setContributions,
  })).sort((a, b) => a.productName.localeCompare(b.productName))

  return c.json({
    supersetId: ss.id,
    supersetName: ss.name,
    sets: ss.items.map(si => ({ setId: si.setId, setName: si.set.name, qty: si.qty })),
    products: rows,
  })
})

// Export project BOM as Multi-Sheet Excel
supersets.get('/:id/export', async (c) => {
  const id = Number(c.req.param('id'))
  const user = c.get('user')
  const ss = await prisma.superset.findUnique({
    where: { id },
    include: { items: { orderBy: { orderIndex: 'asc' }, include: { set: true } } },
  })
  if (!ss) return c.json({ error: 'Not found' }, 404)

  const productQtys = new Map<number, number>()
  for (const si of ss.items) {
    const setQtys = await resolveSetProductQtys(si.setId)
    for (const [productId, qty] of setQtys.entries()) {
      productQtys.set(productId, (productQtys.get(productId) ?? 0) + qty * si.qty)
    }
  }

  const productIds = Array.from(productQtys.keys())
  const bomRows = await prisma.productItem.findMany({
    where: { productId: { in: productIds } },
    include: { product: { select: { id: true, name: true } }, item: true },
    orderBy: [{ product: { name: 'asc' } }, { stableId: 'asc' }],
  })

  type ItemRecord = (typeof bomRows)[0]["item"];
  const altItemsCache = new Map<string, ItemRecord>();
  const allAltIds = bomRows.flatMap((r) =>
    ((r.item.alternatives ?? "") + ";" + (r.alternatives ?? ""))
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const uniqueAltIds = [...new Set(allAltIds)];
  if (uniqueAltIds.length > 0) {
    const fetchedAlts = await prisma.item.findMany({
      where: { stableId: { in: uniqueAltIds } },
    });
    fetchedAlts.forEach((it) => altItemsCache.set(it.stableId, it));
  }

  function resolveBestItem(row: typeof bomRows[0]) {
    let itemToExport = row.item;
    let isSwapped = false;
    const sup = getEffectiveSupplier(itemToExport);
    const isOos = sup.supplierStock == null || Number(sup.supplierStock) === 0 || Number.isNaN(Number(sup.supplierStock));

    if (isOos) {
      const combinedAlts = (itemToExport.alternatives ?? "") + ";" + (row.alternatives ?? "");
      const altIds = combinedAlts.split(/[;,]/).map(s => s.trim()).filter(Boolean);
      let bestAltItem: ItemRecord | null = null;
      let bestAltPrice = Infinity;

      for (const altId of altIds) {
        if (altId.toUpperCase().includes("NEED") || altId.toUpperCase().includes("NA")) continue;
        const altItem = altItemsCache.get(altId);
        if (!altItem) continue;
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
      if (bestAltItem) {
        itemToExport = bestAltItem;
        isSwapped = true;
      }
    }

    const finalSup = getEffectiveSupplier(itemToExport);
    const finalIsOos = finalSup.supplierStock == null || Number(finalSup.supplierStock) === 0 || Number.isNaN(Number(finalSup.supplierStock));
    let rowFill: string | undefined = undefined;
    if (finalIsOos) rowFill = "FFFF0000";
    else if (isSwapped) rowFill = "FFFFF2CC";

    return { item: itemToExport, isSwapped, rowFill, supplier: finalSup };
  }

  // Simplified Export Logic: Single Sheet, grouped by PCB, hierarchical numbering
  const templatePath = join(process.cwd(), 'templates', 'bom-template.xlsx')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.readFile(templatePath)
  } catch (err) {
    console.error(`[EXPORT ERROR] Failed to read template:`, err)
    return c.json({ error: 'Excel template error' }, 500)
  }

  const ws = workbook.getWorksheet('BOM_Template')
  if (!ws) return c.json({ error: 'Template sheet not found' }, 500)

  const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  ws.getCell('D6').value = today
  ws.getCell('C9').value = ss.name
  ws.getCell('C10').value = ss.name
  ws.getCell('H10').value = 'PROJECT BOM v2.1'

  const DATA_START_ROW = 12

  // Column widths — G/H/I merged as Remarks, J/K/L merged as DataSheet
  ws.getColumn('A').width = 8
  ws.getColumn('B').width = 22
  ws.getColumn('C').width = 14
  ws.getColumn('D').width = 22
  ws.getColumn('E').width = 8
  ws.getColumn('F').width = 7
  ws.getColumn('G').width = 50
  ws.getColumn('J').width = 50

  // Clear template placeholder dashes in G and J
  for (let r = DATA_START_ROW; r < DATA_START_ROW + 200; r++) {
    for (const col of ['G', 'J'] as const) {
      const cell = ws.getRow(r).getCell(col)
      if (cell.value === '-' || cell.value === ' ' || cell.value === '–') cell.value = null
    }
  }

  // Group BOM rows by PCB for hierarchical display
  const grouped = new Map<number, typeof bomRows>()
  for (const r of bomRows) {
    const list = grouped.get(r.productId) ?? []
    list.push(r)
    grouped.set(r.productId, list)
  }

  function writeExcelRow(rowNum: number, no: string | number, item: any, qty: number, fill: string | undefined, remarks: string, sup: any) {
    const excelRow = ws!.getRow(rowNum)
    const purchaseUrl = getPurchaseUrl(item.supplierPrices, item.links, sup?.supplier)
    const gText = remarks ? `${purchaseUrl}  [${remarks}]` : purchaseUrl
    const jText = item.links || ''

    excelRow.getCell('A').value = no
    excelRow.getCell('B').value = item.manufacturer ?? ''
    excelRow.getCell('C').value = ''
    excelRow.getCell('D').value = item.partNumber ?? ''
    excelRow.getCell('E').value = qty
    excelRow.getCell('F').value = 'PCS'
    excelRow.getCell('G').value = purchaseUrl ? { text: gText, hyperlink: purchaseUrl } : gText
    excelRow.getCell('J').value = jText ? { text: jText, hyperlink: jText } : jText

    // Only A-G and J — H/I are merged with G (Remarks), don't touch them
    const cols = ['A','B','C','D','E','F','G','J'] as const
    for (const col of cols) {
      const cell = excelRow.getCell(col)
      const isLink = (col === 'G' && !!purchaseUrl) || (col === 'J' && !!jText)
      cell.style = {
        ...cell.style,
        fill: fill ? { type: 'pattern', pattern: 'solid', fgColor: { argb: fill }, bgColor: { argb: fill } } : { type: 'pattern', pattern: 'none' },
        border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} },
        alignment: { horizontal: 'left', vertical: 'middle', wrapText: false },
        font: isLink ? { size: 9, color: { argb: 'FF0563C1' }, underline: true } : { size: 9 },
      }
    }
    excelRow.commit()
  }

  let currentRow = DATA_START_ROW
  let groupNo = 1

  for (const [pId, pRows] of grouped) {
    if (!pRows.length) continue
    const pName = pRows[0].product.name
    const pQty = productQtys.get(pId) ?? 0

    // PCB Header Row
    const headerRow = ws.getRow(currentRow)
    headerRow.getCell('A').value = groupNo
    headerRow.getCell('B').value = `▸ ${pName}`
    headerRow.getCell('D').value = `Project Total Qty: ${pQty}`;
    (['A','B','C','D','E','F','G','H','I','J'] as const).forEach(col => {
      headerRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
      headerRow.getCell(col).font = { bold: true, size: 9 }
      headerRow.getCell(col).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    })
    headerRow.commit()
    currentRow++

    let itemSubNo = 1
    for (const row of pRows) {
      const res = resolveBestItem(row)
      writeExcelRow(currentRow, `${groupNo}.${itemSubNo++}`, res.item, (row.quantitySum ?? 1) * pQty, res.rowFill, res.isSwapped ? `Swapped from ${row.item.partNumber}` : '', res.supplier)
      currentRow++
    }
    groupNo++
  }

  const buf = await workbook.xlsx.writeBuffer()

  await logChange({
    entity: 'project',
    entityId: id,
    field: 'export',
    oldValue: null,
    newValue: `Standard Project BOM Export (Single Sheet)`,
    changedBy: user.username,
    context: 'Data Extraction'
  })

  const safeName = ss.name.replace(/[^a-z0-9_-]/gi, '_')
  return c.body(new Uint8Array(buf), 200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="Project_BOM_${safeName}.xlsx"`,
  })
})

supersets.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const data = await prisma.superset.findUnique({
    where: { id },
    include: { items: { include: { set: { include: { items: true } } }, orderBy: { orderIndex: 'asc' } } },
  })
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json(data)
})

supersets.post('/', requireRole('admin', 'super'), async (c) => {
  const user = c.get('user')
  const { name, notes, items } = await c.req.json()
  const ss = await prisma.superset.create({
    data: {
      name,
      notes,
      createdBy: user.username,
      items: {
        create: (items || []).map((item: any, idx: number) => ({
          orderIndex: idx,
          setId: item.setId,
          qty: item.qty || 1.0,
        })),
      },
    },
    include: { items: true },
  })

  await logChange({
    entity: 'project',
    entityId: ss.id,
    field: 'all',
    oldValue: null,
    newValue: ss.name,
    changedBy: user.username,
    context: 'Create Project'
  })
  await invalidateCosts()

  return c.json(ss, 201)
})

supersets.patch('/:id', requireRole('admin', 'super'), async (c) => {
  const id = Number(c.req.param('id'))
  const user = c.get('user')
  const { name, notes, items, margin } = await c.req.json()

  const old = await prisma.superset.findUnique({ where: { id } })
  if (!old) return c.json({ error: 'Not found' }, 404)

  await prisma.supersetItem.deleteMany({ where: { supersetId: id } })
  const ss = await prisma.superset.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(notes !== undefined && { notes }),
      ...(margin !== undefined && { margin: Number(margin) }),
      items: {
        create: (items || []).map((item: any, idx: number) => ({
          orderIndex: idx,
          setId: item.setId,
          qty: item.qty || 1.0,
        })),
      },
    },
    include: { items: true },
  })

  if (name && name !== old.name) {
    await logChange({
      entity: 'project',
      entityId: id,
      field: 'name',
      oldValue: old.name,
      newValue: name,
      changedBy: user.username,
      context: 'Rename Project'
    })
  }

  if (items) {
    await logChange({
      entity: 'project',
      entityId: id,
      field: 'composition',
      oldValue: 'Previous bundle state purged',
      newValue: `Updated to ${items.length} product entries`,
      changedBy: user.username,
      context: 'Update Project Bundle'
    })
  }
  await invalidateCosts()

  return c.json(ss)
})

supersets.delete('/:id', requireRole('admin', 'super'), async (c) => {
  const id = Number(c.req.param('id'))
  const user = c.get('user')
  
  const old = await prisma.superset.findUnique({ where: { id } })
  if (!old) return c.json({ error: 'Not found' }, 404)

  await prisma.superset.delete({ where: { id } })

  await logChange({
    entity: 'project',
    entityId: id,
    field: 'all',
    oldValue: old.name,
    newValue: null,
    changedBy: user.username,
    context: 'Delete Project'
  })
  await invalidateCosts()

  return c.body(null, 204)
})

export default supersets
