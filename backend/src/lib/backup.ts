import * as XLSX from 'xlsx'
import prisma from './prisma.js'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { logChange } from './changelog.js'

export async function generateBackupBuffer(): Promise<Buffer> {
  const [items, products, productItems, configSets, configSetItems, supersets, supersetItems] = await Promise.all([
    prisma.item.findMany({ orderBy: { stableId: 'asc' } }),
    prisma.product.findMany({ orderBy: { name: 'asc' } }),
    prisma.productItem.findMany({
      include: { product: { select: { name: true } } },
      orderBy: [{ product: { name: 'asc' } }, { stableId: 'asc' }],
    }),
    prisma.configSet.findMany({ orderBy: { name: 'asc' } }),
    prisma.configSetItem.findMany({
      include: { set: { select: { name: true } } },
      orderBy: [{ set: { name: 'asc' } }, { orderIndex: 'asc' }],
    }),
    prisma.superset.findMany({ orderBy: { name: 'asc' } }),
    prisma.supersetItem.findMany({
      include: { superset: { select: { name: true } }, set: { select: { name: true } } },
      orderBy: [{ superset: { name: 'asc' } }, { orderIndex: 'asc' }],
    }),
  ])

  // Build name lookups
  const productNameById = Object.fromEntries(products.map(p => [p.id, p.name]))

  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items.map(i => ({
    'Stable ID': i.stableId,
    'Part Number': i.partNumber,
    'Product Name': i.productName,
    'Price (min)': i.priceMin,
    'Price Currency': i.priceCurrency,
    'Value (canonical)': i.value,
    'Description': i.description,
    'Alternatives': i.alternatives,
    'Category': i.category,
    'Package (canonical)': i.package,
    'Manufacturer': i.manufacturer,
    'Stock Qty': i.stockQty,
    'Warehouse Qty': i.whQty,
    'Warehouse Location': i.whLocation,
    'Stock Code': i.stockCode,
    'LCSC Code': i.supplierPrices ? (JSON.parse(i.supplierPrices).lcsc?.pn || '') : '',
    'Supplier(s)': i.suppliers,
    'Link(s)': i.links,
    'Product URL': i.links ? i.links.split(';')[0] : '',
    'Datasheet URL': i.links ? (i.links.split(';')[1] || '') : '',
    'supplier_prices': i.supplierPrices, // Preserve JSON blob for internal restore
  }))), 'Items')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products.map(p => ({
    'Name': p.name,
    'Slug': p.slug,
  }))), 'Products')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productItems.map(pi => ({
    'Product': pi.product.name,
    'Stable ID': pi.stableId,
    'Quantity': pi.quantitySum,
    'References': pi.references,
    'Notes': pi.notes,
  }))), 'ProductItems')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(configSets.map(s => ({
    'Name': s.name,
    'Parent': s.parentSetId,
    'Notes': s.notes,
    'Created By': s.createdBy,
  }))), 'ConfigSets')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(configSetItems.map(si => ({
    'Set Name': si.set.name,
    'Main Product': productNameById[si.mainProductId] ?? String(si.mainProductId),
    'Op': si.op,
    'Qty': si.qty,
    'Order': si.orderIndex,
  }))), 'ConfigSetItems')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supersets.map(s => ({
    'Name': s.name,
    'Notes': s.notes,
    'Created By': s.createdBy,
  }))), 'Supersets')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supersetItems.map(si => ({
    'Superset Name': si.superset.name,
    'Set Name': si.set.name,
    'Qty': si.qty,
    'Order': si.orderIndex,
  }))), 'SupersetItems')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export async function performAutoBackup() {
  const dir = join(process.cwd(), 'backups', 'auto')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const buf = await generateBackupBuffer()
  const now = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `auto_backup_${now}.xlsx`
  const path = join(dir, filename)

  writeFileSync(path, buf)
  
  await prisma.systemSetting.upsert({
    where: { key: 'last_auto_backup_at' },
    update: { value: new Date().toISOString() },
    create: { key: 'last_auto_backup_at', value: new Date().toISOString() }
  })

  await logChange({
    entity: 'system',
    entityId: 'backup',
    field: 'auto_archive',
    oldValue: null,
    newValue: filename,
    changedBy: 'SYSTEM',
    context: 'Scheduled Maintenance'
  })

  console.log(`[BACKUP] Auto-archive completed: ${filename}`)
}
