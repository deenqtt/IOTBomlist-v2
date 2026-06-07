# IOTBomlist-v2 Frontend Plan

Stack: **Next.js 14 (App Router)** + **TypeScript** + **shadcn/ui** + **TanStack Table** + **TanStack Query**

Backend: `http://localhost:8001` (Hono + Prisma)

---

## Build Order

```
1. Setup (Next.js + shadcn + axios)
2. Login Page
3. Layout (sidebar + auth guard)
4. Items
5. Products
6. Sets
7. Set Configurator
8. Product Builder
9. Analytics
10. Admin
11. Costing        ← super only
12. Superset
13. Superset Configurator
```

---

## Folder Structure

```
frontend/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx              ← sidebar + auth guard
│       ├── items/page.tsx
│       ├── products/page.tsx
│       ├── sets/page.tsx
│       ├── sets/configurator/page.tsx
│       ├── builder/page.tsx
│       ├── costing/page.tsx
│       ├── admin/page.tsx
│       ├── analytics/page.tsx
│       ├── superset/page.tsx
│       └── superset/configurator/page.tsx
├── components/
│   ├── ui/                         ← shadcn components
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   └── shared/
│       ├── DataTable.tsx           ← TanStack Table wrapper (virtual scroll)
│       ├── ConfirmDialog.tsx
│       └── ExportButton.tsx
├── lib/
│   ├── api.ts                      ← axios instance + interceptors
│   ├── auth.ts                     ← token storage + decode
│   └── utils.ts
├── hooks/
│   ├── useAuth.ts
│   └── useItems.ts, useSets.ts ... ← TanStack Query per resource
└── types/
    └── index.ts
```

---

## Auth

- JWT disimpan di `localStorage` (key: `bom_token`)
- Setiap request: `Authorization: Bearer <token>`
- `useAuth` hook: decode role dari JWT payload
- Route guard di `(dashboard)/layout.tsx`: redirect ke `/login` jika token tidak ada / expired
- Role logic:
  - `user` → hanya read di semua tab
  - `admin` → full CRUD kecuali Costing
  - `super` → semua termasuk Costing

---

## Tab Features

---

### 1. Items

**URL:** `/items`

**Features:**
- Tabel items (TanStack Table + virtual scroll untuk 2000+ rows)
- Kolom: Stable ID, Part Number, Product Name, Category, Package, Value, Price, Currency, Supplier(s), Stock Qty, WH Qty, WH Location, Alternatives, Links
- Filter: text search (Part Number / Product Name / Stable ID), Category, Supplier, Package
- Pagination (50 / 100 / 500 / all)
- **Add Item** (admin+): form modal → POST `/items`
- **Edit Item** (admin+): inline edit atau modal → PATCH `/items/:stableId`
- **Delete Item** (admin+): confirm dialog → DELETE (jika ada)
- **Enrichment links**: klik Stable ID → buka di LCSC/Mouser/DigiKey
- **Show where used**: expand row → produk mana yang pakai item ini

**API:**
- `GET /items?q=&category=&supplier=&page=&limit=`
- `PATCH /items/:stableId`

---

### 2. Products

**URL:** `/products`

**Features:**
- Tabel semua BOM rows (product_items) — bisa filter per product
- Kolom: Product, Stable ID, Part Number, Qty, Price, Currency, Alternatives, References, Notes
- Filter: Product dropdown, text search
- **Rename Product** (admin+): modal → PATCH `/products/:id`
- **Product Usage in Sets**: pilih satu/banyak product → tabel: Set, Product, Qty
- Download CSV: BOM rows filtered

**API:**
- `GET /products`
- `GET /products/:id/items`
- `PATCH /products/:id`

---

### 3. Sets

**URL:** `/sets`

**Features:**
- Tabel semua ConfigSets (Name, Base Set, Items count, Created By, Notes)
- **View Set Contents**: klik set → drawer/panel dengan daftar product × qty
- **Download BOM** (3 mode):
  - Original BOM
  - Alternative BOM
  - Combined BOM (prefers alt)
  - Setiap file: multi-sheet Excel (Summary + BOM rows)
- **Rename Set** (admin+): inline edit
- **Delete Set** (admin+): confirm dialog

**API:**
- `GET /sets`
- `GET /sets/:id` (set detail + items)
- `PATCH /sets/:id`
- `DELETE /sets/:id`
- `GET /sets/:id/export?mode=original|alternative|combined` → file download

---

### 4. Set Configurator

**URL:** `/sets/configurator`

**Features:**
- **Load Set**: dropdown select dari saved sets → load ke editor
- **Editor rows** (dynamic):
  - Setiap row: Product (combobox autocomplete) + Qty (number) + Remove button
  - Add Row, Clear All buttons
  - Drag reorder (opsional)
- **Base Set** (parent inheritance): optional combobox
- **Quick Compose**: multiselect sets + per-set multiplier → merge ke editor
- **Exclusion list** (jika ada base set): toggle produk yang di-exclude dari inheritance
- **Save As New**: input nama → POST `/sets`
- **Update Existing**: PUT `/sets/:id`
- **Live BOM Preview**: accordion/panel kecil di bawah editor

**API:**
- `GET /sets`, `GET /products`
- `POST /sets`, `PUT /sets/:id`

---

### 5. Product Builder

**URL:** `/builder`

**Features:**
- **Create Product**: form (name, optional slug) → POST `/products`
- **Clone Product**: select source → input nama baru → copy BOM rows
- **Delete Product**: select + confirm → DELETE `/products/:id`
- **Merge Products**: multiselect "merge these" → ke "keep this" → POST `/products/:id/merge`
- **Edit Product BOM**:
  - Select product → load BOM rows
  - Tabel: Stable ID, Part Number, Qty, Notes, References
  - Add item: combobox search + qty input
  - Remove item: delete row
  - Swap to alternative: dropdown alternatives
  - Save button → PUT `/products/:id/items`

**API:**
- `GET /products`, `POST /products`, `DELETE /products/:id`
- `GET /products/:id/items`, `POST /products/:id/items`, `PATCH /products/:id/items/:stableId`, `DELETE /products/:id/items/:stableId`

---

### 6. Costing *(super only)*

**URL:** `/costing`

**Features:**
- Currency selector + exchange rate input
- Toggle: "Consider alternatives"
- **Product Cost Summary Table**: Product, Items count, Missing Prices, Total Cost (USD), Total Cost (selected currency)
- **By Supplier Table**: Supplier, Lines count, Total
- **By Set Table**: Set, Total Cost, Products count, Missing Prices
- **Missing Costs Table**: items tanpa harga (filter, download CSV)
- **Export Excel** (multi-sheet): Summary, Per-Product, By-Supplier, By-Set

**API:**
- `GET /analytics/summary`
- (costing computed di frontend dari data items + products, atau tambah endpoint khusus nanti)

---

### 7. Admin

**URL:** `/admin`

**Sections (tabs di dalam halaman):**

#### Import
- Upload `.xlsx` → parse → preview diff (added/removed/changed rows)
- Modes: Unified Import (full upsert), Quick BOM Import
- Apply button → POST `/admin/import`

#### Alternatives Management
- Upload mapping CSV/XLSX alternative items
- Preview → Apply → create ALT-* items
- View applied ALT-* changelog, revert

#### Backup & Restore
- Download backup (ZIP: semua table as XLSX)
- Upload backup → diff preview → restore
- Compare 2 backups

#### Suppliers
- View all supplier names (normalized)
- Merge duplicate variants (Mouser vs mouser vs MOUSER)

#### Warehouse
- Bulk edit WH Qty + WH Location per item

#### Audit Log
- Table: Entity, Field, Old → New, Changed By, Timestamp
- Filter: date range, user, entity

#### API Keys
- Mouser API key input + test
- DigiKey OAuth flow

**API:**
- `POST /admin/import`
- `GET /admin/backup`, `POST /admin/restore`
- `GET /change-log` (nanti)

---

### 8. Analytics

**URL:** `/analytics`

**Features:**
- **Summary cards**: Total Items, Products, Sets, Supersets, BOM Rows, Enriched Items, Missing Prices
- **By Category** (bar chart): Category vs Item count
- **By Supplier** (bar chart): Supplier vs Item count
- **Missing Prices by Set** (table): Set, Total Items, Missing, % Missing
- **Alternatives Impact** (table): Product, Cost Without Alts, Cost With Alts, Delta

**API:**
- `GET /analytics/summary`
- `GET /analytics/by-category`
- `GET /analytics/by-supplier`

---

### 9. Superset

**URL:** `/superset`

**Features:**
- List saved Supersets (Name, Sets count, Created By, Notes)
- **View Contents**: klik → panel daftar Set × Qty
- **Download BOM** (3 mode): Original, Alternative, Combined
- **Download ZIP**: per-set Excel files
- **Download GSPE Format**: format khusus (Set headers, Part, Qty, UM, Remarks)

**API:**
- `GET /supersets`, `GET /supersets/:id`
- `GET /supersets/:id/export?mode=...` → file download

---

### 10. Superset Configurator

**URL:** `/superset/configurator`

**Features:**
- Load / Save / Overwrite / Delete saved superset
- **Rows editor**: Set (combobox) + Qty (number) per row, Add Row, Clear
- **Missing ALT-* Audit**:
  - Filter by supplier (All / Mouser / DigiKey / LCSC)
  - Tabel: items lacking alternatives
  - Download audit XLSX
  - **Auto-find LCSC alternatives**: select items → search LCSC API → preview candidates → Apply (create ALT-* + link)

**API:**
- `GET /supersets`, `POST /supersets`, `PUT /supersets/:id`, `DELETE /supersets/:id`
- `GET /supersets/:id/audit-missing-alts?supplier=`
- `POST /supersets/lcsc-search` (proxy ke LCSC API)

---

## Shared Components

| Component | Used In |
|---|---|
| `DataTable` | Items, Products, Sets, Costing, Analytics, Audit Log |
| `ConfirmDialog` | Delete actions (Sets, Products, Items, Superset) |
| `ExportButton` | Sets, Superset, Costing, Admin, Analytics |
| `ProductCombobox` | Set Configurator, Product Builder |
| `ItemCombobox` | Product Builder (attach items) |
| `SetCombobox` | Superset Configurator |

---

## Backend Endpoints Needed (tambahan dari yang sudah ada)

| Endpoint | Keterangan | Status |
|---|---|---|
| `GET /items` (filter+paginate) | sudah ada | ✅ |
| `PATCH /items/:stableId` | sudah ada | ✅ |
| `GET /products` | sudah ada | ✅ |
| `GET /products/:id/items` | sudah ada | ✅ |
| `POST /products/:id/items` | sudah ada | ✅ |
| `GET /sets` | sudah ada | ✅ |
| `POST /sets`, `PUT /sets/:id` | sudah ada | ✅ |
| `GET /sets/:id/export` | **belum** — perlu tambah | ❌ |
| `POST /products/:id/merge` | **belum** | ❌ |
| `GET /supersets/:id/export` | **belum** | ❌ |
| `POST /admin/import` | **belum** | ❌ |
| `GET /admin/backup` | **belum** | ❌ |
| `GET /supersets/:id/audit-missing-alts` | **belum** | ❌ |
| `GET /change-log` | **belum** | ❌ |

Endpoint yang belum ada: dibuat **saat tab-nya dikerjakan** (tidak perlu semua sekarang).

---

## Tech Decisions

| Kebutuhan | Library |
|---|---|
| Table besar (2000+ rows) | TanStack Table v8 + `@tanstack/react-virtual` |
| Server state / caching | TanStack Query v5 |
| UI components | shadcn/ui (Radix-based) |
| Charts (Analytics) | Recharts |
| Excel export | exceljs (di backend routes, bukan frontend) |
| Form | React Hook Form + Zod |
| HTTP client | axios |
| Drag-drop (configurator rows) | dnd-kit |
