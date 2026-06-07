/**
 * One-time migration: enhanced_master_bom.xlsx → bom_v2 database
 * Run: npx tsx src/migrate-v1.ts [path-to-xlsx]
 *
 * Reads:
 *   UniqueItems sheet → Item records
 *   EnhancedBOM sheet → Product + ProductItem records (Source File = product name)
 */
import 'dotenv/config';
//# sourceMappingURL=migrate-v1.d.ts.map