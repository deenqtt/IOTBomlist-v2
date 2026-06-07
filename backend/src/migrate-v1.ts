/**
 * One-time migration: enhanced_master_bom.xlsx → bom_v2 database
 * Run: npx tsx src/migrate-v1.ts [path-to-xlsx]
 *
 * Reads:
 *   UniqueItems sheet → Item records
 *   EnhancedBOM sheet → Product + ProductItem records (Source File = product name)
 */

import 'dotenv/config'
import * as XLSX from 'xlsx'
import prisma from './lib/prisma'
import path from 'path'

const xlsxPath = process.argv[2] ?? path.join(__dirname, '../../IOTBomlist/enhanced_master_bom.xlsx')

function deriveProductName(sourceFile: string): string {
  // "001. Modbit Micro - Bill Of Materials POWER_ISO_24_6W.xlsx"
  // → strip leading "NNN. " → strip ".xlsx"
  return sourceFile
    .replace(/^\d+\.\s*/, '')    // strip "001. "
    .replace(/\.xlsx?$/i, '')    // strip ".xlsx"
    .trim()
}

function strOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

function numOrNull(v: unknown): number | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

async function main() {
  console.log(`Reading: ${xlsxPath}`)
  const wb = XLSX.readFile(xlsxPath)

  // ── 1. Import UniqueItems → Item ─────────────────────────────────────────
  const uniqueWs = wb.Sheets['UniqueItems']
  if (!uniqueWs) {
    console.error('Sheet "UniqueItems" not found. Available:', wb.SheetNames.join(', '))
    process.exit(1)
  }

  const uniqueRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(uniqueWs, { defval: '' })
  console.log(`\nImporting ${uniqueRows.length} items from UniqueItems...`)

  let itemsOk = 0, itemsFail = 0
  for (const row of uniqueRows) {
    const stableId = strOrNull(row['Stable ID'])
    if (!stableId) continue
    try {
      await prisma.item.upsert({
        where: { stableId },
        update: {
          partNumber: strOrNull(row['Part Number']),
          productName: strOrNull(row['Product Name']),
          value: strOrNull(row['Value (canonical)']),
          description: strOrNull(row['Description']),
          category: strOrNull(row['Category']),
          package: strOrNull(row['Package (canonical)']),
          suppliers: strOrNull(row['Supplier(s)']),
          priceMin: numOrNull(row['Price (min)']),
          priceCurrency: 'USD',
          alternatives: strOrNull(row['Alternate']),
        },
        create: {
          stableId,
          partNumber: strOrNull(row['Part Number']),
          productName: strOrNull(row['Product Name']),
          value: strOrNull(row['Value (canonical)']),
          description: strOrNull(row['Description']),
          category: strOrNull(row['Category']),
          package: strOrNull(row['Package (canonical)']),
          suppliers: strOrNull(row['Supplier(s)']),
          priceMin: numOrNull(row['Price (min)']),
          priceCurrency: 'USD',
          alternatives: strOrNull(row['Alternate']),
        },
      })
      itemsOk++
    } catch (e) {
      console.error(`  Item ${stableId}: ${String(e).split('\n')[0]}`)
      itemsFail++
    }
  }
  console.log(`  ✓ ${itemsOk} items imported, ${itemsFail} failed`)

  // ── 2. Import EnhancedBOM → Product + ProductItem ────────────────────────
  const bomWs = wb.Sheets['EnhancedBOM']
  if (!bomWs) {
    console.error('Sheet "EnhancedBOM" not found')
    process.exit(1)
  }

  const bomRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(bomWs, { defval: '' })
  console.log(`\nImporting ${bomRows.length} BOM rows from EnhancedBOM...`)

  // Collect unique products
  const productNames = [...new Set(
    bomRows.map(r => strOrNull(r['Source File'])).filter(Boolean).map(f => deriveProductName(f!))
  )]
  console.log(`  Found ${productNames.length} unique products`)

  // Upsert all products
  const productIdMap = new Map<string, number>()
  for (const name of productNames) {
    try {
      const p = await prisma.product.upsert({
        where: { name },
        update: {},
        create: { name },
      })
      productIdMap.set(name, p.id)
    } catch (e) {
      console.error(`  Product "${name}": ${String(e).split('\n')[0]}`)
    }
  }
  console.log(`  ✓ ${productIdMap.size} products upserted`)

  // Upsert ProductItems
  let piOk = 0, piFail = 0, piSkip = 0
  for (const row of bomRows) {
    const stableId = strOrNull(row['Stable ID'])
    const sourceFile = strOrNull(row['Source File'])
    if (!stableId || !sourceFile) { piSkip++; continue }

    const productName = deriveProductName(sourceFile)
    const productId = productIdMap.get(productName)
    if (!productId) { piSkip++; continue }

    const qty = numOrNull(row['Quantity']) ?? 1
    const refs = strOrNull(row['Reference'])

    try {
      await prisma.productItem.upsert({
        where: { productId_stableId: { productId, stableId } },
        update: { quantitySum: qty, references: refs },
        create: { productId, stableId, quantitySum: qty, references: refs },
      })
      piOk++
    } catch (e) {
      console.error(`  ProductItem ${productName}/${stableId}: ${String(e).split('\n')[0]}`)
      piFail++
    }
  }
  console.log(`  ✓ ${piOk} BOM rows imported, ${piFail} failed, ${piSkip} skipped`)

  // ── Summary ──────────────────────────────────────────────────────────────
  const [totalItems, totalProducts, totalBomRows] = await Promise.all([
    prisma.item.count(),
    prisma.product.count(),
    prisma.productItem.count(),
  ])
  console.log(`\nDatabase totals: ${totalItems} items · ${totalProducts} products · ${totalBomRows} BOM rows`)
  console.log('Migration complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
