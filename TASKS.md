# IOTBomlist v2 — Task List

## ✅ 1. Est. Cost — Hitung Ulang Saat BOM Berubah

**Status: DONE**

- Est. cost dihitung ulang hanya jika ada perubahan BOM (via `invalidateCosts()`)
- Hasil disimpan ke DB (`costUpdatedAt` di `Product`, `Set`, `Superset`)
- Load halaman tampilkan hasil terakhir — tidak hitung ulang tiap load
- Sistem `isFresh()` bandingkan `costUpdatedAt` vs `cost_last_invalidated_at` di `SystemSetting`

**Invalidasi dipanggil saat:**
- Item diupdate (harga / supplier prices berubah) — `items.ts:397`
- BOM row ditambah/hapus di product — `products.ts`
- Set / superset diubah — `sets.ts`, `supersets.ts`

**Endpoint:**
- `GET /costing/status` — last invalidated + last calculated timestamp
- `POST /costing/recalculate` — force recalculate semua cost

---

## ✅ 2. Tombol Trigger Est. Cost / Sync Harga

**Status: DONE**

- Tombol "Start Sync" di Admin → Price Sync tab
- Flow: `POST /admin/refresh-prices` → `enrichItemStandalone()` per item (hit Mouser/DigiKey/LCSC) → update `priceMin`/`supplierPrices` di DB → setelah selesai `POST /costing/recalculate` → update `estCostUSD` di semua product/set/superset
- Progress bar live (done/total, updated, failed)
- Fix ditambah di `admin/page.tsx:2179`: call recalculate setelah job done

---

## ✅ 3. Cleansing Data Aplikasi Lama

**Status: DONE (user sudah clean di Excel, tinggal import)**

User sudah membersihkan data MPN di file `part_database_20260607_065026Z.xlsx`.

**Import flow:**
1. Admin → tab **Data Import**
2. Upload file `.xlsx` (format backup: sheet "Items" dengan kolom Stable ID, Part Number, dll)
3. Dry run otomatis — preview berapa item yang akan di-upsert
4. Confirm injection
5. (Opsional) centang **Auto-Enrich** untuk re-enrich MPN dari supplier setelah import

**Backend sudah handle:**
- `cleanPN()` strip supplier prefix otomatis (C-code → real MPN)
- Legacy format (UniqueItems/ItemUsage sheet) dan standard backup format sama-sama supported
- `enrichItem()` auto-fix jika partNumber masih C-code → update ke real MPN dari LCSC

---

## ✅ 4. Sync Data Item dengan Supplier

**Status: DONE — sudah di-cover Price Sync**

`enrichItemStandalone()` (Admin → Price Sync tab) sudah update `specs`, `description`, `category`, `package`, `manufacturer` dari LCSC/Mouser/DigiKey.

Data yang tetap kosong setelah sync = supplier memang tidak punya data untuk item itu — wajar, tidak bisa dipaksakan. Supplier API tidak selalu kirim data lengkap (modul custom, konektor khusus, internal parts).

---

## ✅ 5. Error Import BOM

**Status: DONE**

Root cause: Mouser API key hit rate limit saat auto-enrich di import → semua item gagal enrich.

Fix sudah ada: enrichment sekarang lebih pintar — prioritas lookup by supplier URL / LCSC C-code dulu sebelum hit Mouser API, sehingga hemat API call dan tidak langsung error kalau Mouser limit.
