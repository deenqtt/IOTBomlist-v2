# Import & Auto-Enrich Issues Analysis
> Source: `part_database_20260607_065026Z.xlsx` — 872 items, 7 sheets

---

## Struktur Excel

| Sheet | Rows | Keterangan |
|---|---|---|
| Items | 872 | Master part database — MAIN |
| Products | 123 | PCB definitions |
| ProductItems | 2478 | BOM rows (Product ↔ Item) |
| ConfigSets | 67 | Bundle/product config |
| ConfigSetItems | 102 | Set composition |
| Supersets | 17 | Project definitions |
| SupersetItems | 66 | Project composition |

---

## Issue #1 — Deteksi Supplier Pakai URL Scan, Bukan Kolom Supplier

**Root cause:** `enrichItem()` baca kolom `links` dan scan string URL untuk tahu preferred supplier. Tidak baca kolom `Supplier(s)`.

**Akibat:** Kalau satu item punya link Mouser **dan** DigiKey sekaligus, yang menang adalah Mouser (karena dicek duluan di if-else), meskipun kolom `Supplier(s)` bilang `Digi-Key`.

**Contoh:**
```
CL21A106KPFNNNF
Supplier(s) = "Digi-Key"
links = "mouser.co.id/...; digikey.com/..."
→ prefersMouser = true (ketemu duluan)
→ Order jadi: Mouser → LCSC → DigiKey  ← SALAH
→ Harusnya: DigiKey → LCSC → Mouser
```

**Impacted:** Semua item dengan multi-supplier links (~274 DigiKey items & ~350 Mouser items berpotensi terdampak).

---

## Issue #2 — Part Number Internal Code, MPN Asli di URL

**Root cause:** Beberapa item punya Part Number berupa kode internal (6-9 digit angka), tapi MPN asli ada di URL Mouser/DigiKey. Kode tidak parse MPN dari URL.

**Contoh:**
```
Part Number = "206010053"
Product Name = "LAMPU LED 4W 30CM"
Supplier URL = "mouser.co.id/ProductDetail/Mill-Max/821-22-060-10-053101"
→ Search by "206010053" → semua supplier tidak ketemu
→ Harusnya search "821-22-060-10-053101" (dari URL)
```

**Pattern internal codes yang tidak bisa di-search:**
- `102XXXXXXX` — ~20+ items
- `106XXXXXXX` — ~10+ items  
- `206XXXXXXX` — ~5+ items
- `308XXXXXXX` — custom physical parts (busbar, cable, dll)

---

## Issue #3 — Custom/Internal Parts Tidak Bisa Di-Enrich

**Root cause:** ~90 item (10.3%) adalah part custom/internal — kabel, terminal, hardware fisik — yang tidak ada di supplier database manapun.

**Contoh:**
```
202010339 → CABLE NYAF 6MM KUNING HIJAU
308070004 → BUSBAR 3X15X4000MM
TERMINAL KLASTIN 10A 380V
Perdana Sim Card telkomsel
```

**Akibat:** Auto-enrich buang waktu mencari ke 3 supplier, semua return kosong.

---

## Issue #4 — Value Field Kosong 67% (585/872 items)

**Root cause:** Field `Value (canonical)` tidak diisi, terutama pada item Mouser (2.3% fill rate).

**Detail per supplier:**
| Supplier | Items | Value Filled |
|---|---|---|
| Digi-Key | 274 | 72.6% |
| Mouser | 350 | **2.3%** ← sangat parah |
| LCSC | 146 | 53.4% |
| No Supplier | 96 | 1.0% |

**Padahal:** Kolom `Description` Mouser sangat lengkap (99.7% filled) dan mengandung value info.  
Contoh: `"47 Ohms ±5% 0.1W Chip Resistor 0402"` → Value harusnya `47`

---

## Issue #5 — Package Field Kosong 67% (582/872 items)

Sama seperti Value — Mouser items punya Package di Description tapi tidak di-extract ke kolom Package.

---

## Issue #6 — Garbage Data di Field Value

Beberapa item punya Value diisi dengan data yang salah (bukan nilai komponen).

**Contoh:**
```
Value = "691322110004"  ← kode supplier
Value = "nanopi_duo"    ← nama produk
Value = "es3db-13-f"    ← variant part number
Value = "c1h12"         ← part number fragment
Value = "sht40-ad1b-r2" ← MPN
```

---

## Issue #7 — Supplier Tidak Didukung (Tokopedia, AliExpress, Waveshare)

| Supplier | Items | Status |
|---|---|---|
| Tokopedia | 4 | ❌ Tidak ada API |
| AliExpress | 1 | ❌ Tidak ada API |
| Waveshare | 1 | ❌ Tidak ada API |

Item-item ini tidak akan pernah ter-enrich otomatis. Perlu di-flag sebagai "manual only".

---

## Issue #8 — Items Tanpa Supplier (96 items / 11%)

96 item tidak punya kolom `Supplier(s)` → default order LCSC → Mouser → DigiKey → buang waktu search ke semua supplier tanpa hasil.

Sebagian besar ini adalah custom/internal parts (lihat Issue #3).

---

## Issue #9 — LCSC Items Tidak Punya Manufacturer (145/146 = 99.3%)

Items dengan LCSC Code ada, tapi kolom `Manufacturer` hampir selalu kosong untuk LCSC items. Data ini ada di LCSC API tapi tidak di-extract saat import.

---

## Issue #10 — Package Inconsistency

Package values tidak konsisten formatnya:
```
Standard: "0603", "0805", "1206", "Through Hole"
IPC code: "RESC1608X55N", "SHDR2W80P0X381_1X2_901X725X920"
Verbose: "0805 (2012 Metric)", "SOT-23-5"
```

Tidak ada normalisasi — query/filter berdasarkan package tidak reliable.

---

## Summary Prioritas Fix

| # | Issue | Impact | Fix Complexity |
|---|---|---|---|
| 1 | Deteksi supplier dari kolom, bukan URL scan | Tinggi — 600+ items salah order | Mudah |
| 2 | Parse MPN dari URL kalau Part Number = internal code | Medium — ~50 items | Medium |
| 3 | Skip auto-enrich untuk internal/custom parts | Medium — hemat waktu | Mudah |
| 4 | Extract Value dari Description (terutama Mouser) | Tinggi — 585 items kosong | Medium |
| 5 | Extract Package dari Description | Tinggi — 582 items kosong | Medium |
| 6 | Validate/clean garbage di Value field | Medium — data integrity | Medium |
| 7 | Flag items supplier tidak didukung | Low — info only | Mudah |
| 8 | Detect & flag items tanpa supplier | Low — hemat waktu enrich | Mudah |
| 9 | LCSC items — fill Manufacturer dari API | Low | Sudah berjalan via enrichItem |
| 10 | Normalisasi Package format | Low | Kompleks |
