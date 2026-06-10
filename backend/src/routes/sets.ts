import { Hono } from 'hono'
import ExcelJS from 'exceljs'
import { join } from 'path'
import prisma from '../lib/prisma.js'
import { authMiddleware, requireRole, AuthUser } from '../middleware/auth.js'
import { logChange } from '../lib/changelog.js'
import { invalidateCosts } from './costing.js'

const sets = new Hono<{ Variables: { user: AuthUser } }>()
sets.use('*', authMiddleware)

/**
 * Smart Price & Supplier Resolver:
 * 1. Checks supplierPrices JSON for any supplier with stock > 0.
 * 2. If multiple have stock, picks the cheapest among them.
 * 3. Returns the price AND the name of the winning supplier.
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
  } catch {
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
    } catch {
      /* ignore */
    }
  }
  return links || "";
}

sets.get('/', async (c) => {
  const data = await prisma.configSet.findMany({
    include: {
      _count: { select: { items: true } },
      parent: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })
  return c.json(data)
})

// Resolve effective contents (with parent inheritance)
sets.get('/:id/contents', async (c) => {
  const id = Number(c.req.param('id'))

  async function resolveSet(setId: number, depth = 0): Promise<Map<number, { productId: number; productName: string; qty: number }>> {
    if (depth > 8) return new Map()
    const cs = await prisma.configSet.findUnique({
      where: { id: setId },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        parent: { select: { id: true } },
      },
    })
    if (!cs) return new Map()

    const base = cs.parentSetId ? await resolveSet(cs.parentSetId, depth + 1) : new Map<number, { productId: number; productName: string; qty: number }>()
    const out = new Map(base)

    const productIds = cs.items.map(i => i.mainProductId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    })
    const nameById = Object.fromEntries(products.map(p => [p.id, p.name]))

    for (const item of cs.items) {
      const pid = item.mainProductId
      const qty = item.qty
      const op = item.op.toLowerCase()
      if (op === 'remove') {
        out.delete(pid)
      } else if (op === 'add') {
        const prev = out.get(pid)
        out.set(pid, { productId: pid, productName: nameById[pid] ?? String(pid), qty: (prev?.qty ?? 0) + qty })
      } else {
        out.set(pid, { productId: pid, productName: nameById[pid] ?? String(pid), qty })
      }
    }
    return out
  }

  const resolved = await resolveSet(id)
  const contents = Array.from(resolved.values()).sort((a, b) => a.productName.localeCompare(b.productName))
  return c.json(contents)
})

// Export set BOM as CSV (Excel would need exceljs — use CSV for now)
sets.get('/:id/export', async (c) => {
  const id = Number(c.req.param('id'))
  const mode = (c.req.query('mode') || 'original') as 'original' | 'combined' | 'alternative'

  // Resolve product qty map with inheritance
  async function resolveSet(setId: number, depth = 0): Promise<Map<number, number>> {
    if (depth > 8) return new Map()
    const cs = await prisma.configSet.findUnique({
      where: { id: setId },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    })
    if (!cs) return new Map()
    const base = cs.parentSetId ? await resolveSet(cs.parentSetId, depth + 1) : new Map<number, number>()
    const out = new Map(base)
    for (const item of cs.items) {
      const pid = item.mainProductId
      const op = item.op.toLowerCase()
      if (op === 'remove') out.delete(pid)
      else if (op === 'add') out.set(pid, (out.get(pid) ?? 0) + item.qty)
      else out.set(pid, item.qty)
    }
    return out
  }

  const set = await prisma.configSet.findUnique({ where: { id }, select: { name: true } })
  if (!set) return c.json({ error: 'Not found' }, 404)

  const productQtyMap = await resolveSet(id)
  if (!productQtyMap.size) return c.json({ error: 'Project is empty' }, 404)

  // Fetch all BOM rows for products in this set
  const bomRows = await prisma.productItem.findMany({
    where: { productId: { in: [...productQtyMap.keys()] } },
    include: { product: { select: { id: true, name: true } }, item: true },
    orderBy: [{ product: { name: 'asc' } }, { stableId: 'asc' }],
  })

  // Pre-fetch all possible alternative items to avoid N+1 queries
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

  // Resolver logic for the best item (Smart Swap)
  function resolveBestItem(row: typeof bomRows[0]) {
    let itemToExport = row.item;
    let isSwapped = false;

    const mainSup = getEffectiveSupplier(itemToExport);
    const mainIsOos = mainSup.supplierStock == null || Number(mainSup.supplierStock) === 0 || Number.isNaN(Number(mainSup.supplierStock));
    const mainPrice = mainSup.price ?? Infinity;

    // Collect valid alternatives
    const combinedAlts = (itemToExport.alternatives ?? "") + ";" + (row.alternatives ?? "");
    const altIds = combinedAlts.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    
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

    // Dual-Mode Decision Making
    if (mode !== 'alternative') {
      // Normal/Combined Mode: Swap only if main is OOS and we have a valid alt
      if (mainIsOos && bestAltItem) {
        itemToExport = bestAltItem;
        isSwapped = true;
      }
    } else {
      // Cost Down Mode: Swap if main is OOS, OR if alt is cheaper
      if (bestAltItem) {
        if (mainIsOos || bestAltPrice < mainPrice) {
          itemToExport = bestAltItem;
          isSwapped = true;
        }
      }
    }

    // Determine row color based on final selection
    const finalSup = getEffectiveSupplier(itemToExport);
    const finalIsOos = finalSup.supplierStock == null || Number(finalSup.supplierStock) === 0 || Number.isNaN(Number(finalSup.supplierStock));
    
    let rowFill: string | undefined = undefined;
    if (finalIsOos) {
       rowFill = "FFFF0000"; // Pure RED
    } else if (isSwapped) {
       rowFill = "FFFFF2CC"; // Light Yellow
    }

    return { item: itemToExport, isSwapped, rowFill, supplier: finalSup };
  }

  // Build data rows
  interface DataRow {
    productId: number
    productName: string
    setQty: number
    no: number
    manufacturer: string
    partNumber: string
    description: string
    totalQty: number
    purchaseUrl: string
    datasheetUrl: string
    rowFill?: string
    remarks?: string
  }

  let dataRows: DataRow[] = []

  if (mode === 'combined') {
    // Merge same stableId across products, sum qty
    const merged = new Map<string, DataRow>()
    let no = 1
    for (const row of bomRows) {
      const resolved = resolveBestItem(row)
      const item = resolved.item
      const setQty = productQtyMap.get(row.productId) ?? 1
      const totalQty = (row.quantitySum ?? 1) * setQty
      
      const existing = merged.get(item.stableId)
      if (existing) {
        existing.totalQty += totalQty
        // If any grouped row is RED, the whole merged row should be RED
        if (resolved.rowFill === 'FFFF0000') existing.rowFill = 'FFFF0000'
      } else {
        merged.set(item.stableId, {
          productId: row.productId,
          productName: row.product.name,
          setQty,
          no: no++,
          manufacturer: item.manufacturer ?? '',
          partNumber: item.partNumber ?? '',
          description: item.partNumber ?? '', // PN in description
          totalQty,
          purchaseUrl: getPurchaseUrl(item.supplierPrices, item.links, resolved.supplier.supplier),
          datasheetUrl: item.links ?? '',
          rowFill: resolved.rowFill,
          remarks: resolved.isSwapped ? `Auto-swapped for cost/stock` : '',
        })
      }
    }
    dataRows = [...merged.values()]
  } else {
    // original / alternative — keep per-product grouping
    let no = 1
    for (const row of bomRows) {
      const resolved = resolveBestItem(row)
      const item = resolved.item
      const setQty = productQtyMap.get(row.productId) ?? 1
      dataRows.push({
        productId: row.productId,
        productName: row.product.name,
        setQty,
        no: no++,
        manufacturer: item.manufacturer ?? '',
        partNumber: item.partNumber ?? '',
        description: item.partNumber ?? '', // PN in description
        totalQty: (row.quantitySum ?? 1) * setQty,
        purchaseUrl: getPurchaseUrl(item.supplierPrices, item.links, resolved.supplier.supplier),
        datasheetUrl: item.links ?? '',
        rowFill: resolved.rowFill,
        remarks: resolved.isSwapped ? `Swapped from ${row.item.partNumber}` : '',
      })
    }
  }

  // Build Excel from template
  const templatePath = join(process.cwd(), 'templates', 'bom-template.xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)

  const ws = workbook.getWorksheet('BOM_Template')
  if (!ws) return c.json({ error: 'Template sheet not found' }, 500)

  const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  ws.getCell('D6').value = today
  ws.getCell('C9').value = set.name
  ws.getCell('C10').value = set.name
  ws.getCell('H10').value = (mode === 'combined' ? 'BOM COMBINED' : mode === 'alternative' ? 'BOM ALT' : 'BOM') + ' v2.1'

  const DATA_START_ROW = 12
  const user = c.get('user')

  // Clear template placeholder dashes in Remarks (G) and DataSheet (J) columns
  for (let r = DATA_START_ROW; r < DATA_START_ROW + 200; r++) {
    for (const col of ['G', 'J'] as const) {
      const cell = ws.getRow(r).getCell(col)
      if (cell.value === '-' || cell.value === ' ' || cell.value === '–') {
        cell.value = null
      }
    }
  }

  // Set column widths — G/H/I are merged as Remarks, J/K/L merged as DataSheet
  ws.getColumn('A').width = 8
  ws.getColumn('B').width = 22
  ws.getColumn('C').width = 14
  ws.getColumn('D').width = 22
  ws.getColumn('E').width = 8
  ws.getColumn('F').width = 7
  ws.getColumn('G').width = 50   // Remarks (purchase URL)
  ws.getColumn('J').width = 50   // DataSheet

  // Generic write row helper with styling
  function writeExcelRow(rowNum: number, data: DataRow, customNo?: string | number) {
    const excelRow = ws!.getRow(rowNum)
    excelRow.getCell('A').value = customNo ?? data.no
    excelRow.getCell('B').value = data.manufacturer
    excelRow.getCell('C').value = ''
    excelRow.getCell('D').value = data.partNumber
    excelRow.getCell('E').value = data.totalQty
    excelRow.getCell('F').value = 'PCS'
    excelRow.getCell('G').value = data.remarks
      ? `${data.purchaseUrl}  [${data.remarks}]`
      : data.purchaseUrl
    excelRow.getCell('J').value = data.datasheetUrl

    const cols = ['A','B','C','D','E','F','G','J'] as const
    for (const col of cols) {
      const cell = excelRow.getCell(col)
      const existingStyle = cell.style
      cell.style = {
        ...existingStyle,
        fill: data.rowFill ? {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: data.rowFill },
          bgColor: { argb: data.rowFill }
        } : { type: 'pattern', pattern: 'none' },
        border: {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        },
        alignment: {
          horizontal: 'left',
          vertical: 'middle',
          wrapText: false,
        },
        font: { size: 9 },
      }
    }
    excelRow.commit()
  }

  if (mode === 'original' || mode === 'alternative') {
    // Group rows by product, add product header rows
    let currentRow = DATA_START_ROW
    const grouped = new Map<number, DataRow[]>()
    for (const row of dataRows) {
      const arr = grouped.get(row.productId) ?? []
      arr.push(row)
      grouped.set(row.productId, arr)
    }

    let groupNo = 1
    for (const [, rows] of grouped) {
      if (!rows.length) continue
      const productName = rows[0]!.productName
      const setQty = rows[0]!.setQty

      // Product header row — light blue fill
      const headerRow = ws.getRow(currentRow)
      headerRow.getCell('A').value = groupNo
      headerRow.getCell('B').value = `▸ ${productName}`
      headerRow.getCell('C').value = ''
      headerRow.getCell('D').value = `Qty: ${setQty}`;
      (['A','B','C','D','E','F','G','H','I','J'] as const).forEach(col => {
        headerRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
        headerRow.getCell(col).font = { bold: true, size: 9 }
        headerRow.getCell(col).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
      headerRow.commit()
      currentRow++

      let itemSubNo = 1
      for (const row of rows) {
        writeExcelRow(currentRow, row, `${groupNo}.${itemSubNo++}`)
        currentRow++
      }
      groupNo++
    }
  } else {
    // combined — flat rows, sequential numbering
    dataRows.forEach((row, i) => {
      writeExcelRow(DATA_START_ROW + i, row)
    })
  }

  const buf = await workbook.xlsx.writeBuffer()

  await logChange({
    entity: 'set',
    entityId: id,
    field: 'export',
    oldValue: null,
    newValue: `BOM Export (${mode})`,
    changedBy: user.username,
    context: 'Data Extraction'
  })

  const filename = `BOM_${set.name.replace(/[^a-zA-Z0-9]/g, '_')}_${mode}.xlsx`
  return c.body(new Uint8Array(buf), 200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
  })
})

sets.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const user = c.get('user')
  const data = await prisma.configSet.findUnique({
    where: { id },
    include: {
      items: { orderBy: { orderIndex: 'asc' } },
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  })
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json(data)
})

sets.post('/', requireRole('admin', 'super'), async (c) => {
  const user = c.get('user')
  const { name, notes, parentSetId, items } = await c.req.json()
  const set = await prisma.configSet.create({
    data: {
      name,
      notes,
      parentSetId: parentSetId || null,
      createdBy: user.username,
      items: {
        create: (items || []).map((item: { mainProductId: number; op?: string; qty?: number; variantIds?: unknown[] }, idx: number) => ({
          orderIndex: idx,
          mainProductId: item.mainProductId,
          op: item.op || 'set_qty',
          qty: item.qty || 1.0,
          variantIds: item.variantIds ? JSON.stringify(item.variantIds) : null,
        })),
      },
    },
    include: { items: true },
  })

  await logChange({
    entity: 'set',
    entityId: set.id,
    field: 'all',
    oldValue: null,
    newValue: set.name,
    changedBy: user.username,
    context: 'Create Product'
  })
  await invalidateCosts()

  return c.json(set, 201)
})

sets.patch('/:id', requireRole('admin', 'super'), async (c) => {
  const id = Number(c.req.param('id'))
  const user = c.get('user')
  const { name, notes, parentSetId, items } = await c.req.json()
  
  const old = await prisma.configSet.findUnique({ where: { id } })
  if (!old) return c.json({ error: 'Not found' }, 404)

  if (items !== undefined) {
    await prisma.configSetItem.deleteMany({ where: { setId: id } })
  }

  const set = await prisma.configSet.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(notes !== undefined && { notes }),
      ...(parentSetId !== undefined && { parentSetId: parentSetId || null }),
      ...(items !== undefined && {
        items: {
          create: items.map((item: { mainProductId: number; op?: string; qty?: number; variantIds?: unknown[] }, idx: number) => ({
            orderIndex: idx,
            mainProductId: item.mainProductId,
            op: item.op || 'set_qty',
            qty: item.qty || 1.0,
            variantIds: item.variantIds ? JSON.stringify(item.variantIds) : null,
          })),
        },
      }),
    },
    include: { items: true, _count: { select: { items: true } } },
  })

  if (name && name !== old.name) {
    await logChange({
      entity: 'set',
      entityId: id,
      field: 'name',
      oldValue: old.name,
      newValue: name,
      changedBy: user.username,
      context: 'Rename Product'
    })
  }

  if (items !== undefined) {
    await logChange({
      entity: 'set',
      entityId: id,
      field: 'composition',
      oldValue: 'Previous composition purged',
      newValue: `Updated to ${items.length} PCB entries`,
      changedBy: user.username,
      context: 'Update Product Composition'
    })
  }
  await invalidateCosts()

  return c.json(set)
})

sets.delete('/:id', requireRole('admin', 'super'), async (c) => {
  const id = Number(c.req.param('id'))
  const user = c.get('user')

  const old = await prisma.configSet.findUnique({ where: { id } })
  if (!old) return c.json({ error: 'Not found' }, 404)

  await prisma.$transaction([
    prisma.supersetItem.deleteMany({ where: { setId: id } }),
    prisma.configSetItem.deleteMany({ where: { setId: id } }),
    prisma.configSet.delete({ where: { id } }),
  ])

  await logChange({
    entity: 'set',
    entityId: id,
    field: 'all',
    oldValue: old.name,
    newValue: null,
    changedBy: user.username,
    context: 'Delete Product'
  })
  await invalidateCosts()

  return c.body(null, 204)
})

export default sets
