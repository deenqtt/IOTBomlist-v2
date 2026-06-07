# IOT BOM List v2 — Items Tab Progress Report
**Date:** 2026-06-02

---

## Overview

All 7 requirements from management have been implemented in the Items tab, along with additional UI/UX improvements.

---

## Requirement 1 — Key Column Highlighting

**Status: ✅ Done**

Columns **Stable ID**, **Part Number MFR**, **Package**, and **Value** are visually distinguished from secondary columns:

| Column | Style |
|---|---|
| Stable ID | Blue monospace pill, primary color border |
| Part Number MFR | Bold, larger font, manufacturer as subtext |
| Package | Bold monospace, muted background pill |
| Value | Bold font weight |
| Others (Category, Specs, Price…) | Muted/gray, lighter weight |

Column headers for key columns are darker and bold vs secondary columns which are gray.

![Key column highlighting — Items table](screenshots/req1-key-columns.png)

---

## Requirement 2 — 4 Supplier Part Numbers per Item

**Status: ✅ Done**

Each component stores part numbers for 4 sources:

| Supplier | Badge Color |
|---|---|
| LCSC / JLCPCB | Blue |
| Mouser | Green |
| DigiKey | Orange |
| Other | Gray |

Stored as JSON in `supplierPrices` field. Each entry includes: `pn`, `price`, `moq`, `priceBreaks`, `url`, `availability`, `quantity_available`.

In the table: compact colored badges with tooltip showing full PN + price on hover.
In the Edit modal: dedicated input field per supplier.

![Supplier PN badges in table](screenshots/req2-supplier-badges.png)
![Supplier PN fields in Edit modal](screenshots/req2-edit-modal-supplier-fields.png)

---

## Requirement 3 — Alternatives Feature

**Status: ✅ Done**

Click the **GitMerge icon** on any row to open the Alternatives panel.

**Tab 1 — From Database**
Backend finds components matching ALL of:
- Same Value
- Same Package
- Same Voltage Rating *(if present)*
- Same Tolerance *(if present)*

Shows candidates with **Link / Unlink** buttons. Linking is bidirectional — both items updated simultaneously.

**Tab 2 — Search Suppliers**
Searches LCSC, Mouser, DigiKey by keyword (`{Value} {Package}`).
Shows **"X% cheaper"** green badge when supplier price < current item price.

![Alternatives panel — From Database tab](screenshots/req3-alternatives-db.png)
![Alternatives panel — Search Suppliers tab](screenshots/req3-alternatives-suppliers.png)

---

## Requirement 4 — Add Component Flow (Search → Pick → Save)

**Status: ✅ Done**

3-step modal opened via **"+ Add Component"** button (Admin only).

### Step 1 — Search MPN
- Enter part number + optional manufacturer
- Duplicate check runs first (blocks if exact match found in DB)
- Searches LCSC, Mouser, DigiKey simultaneously

![Add Component Step 1 — Search](screenshots/req4-step1-search.png)

### Step 2 — Pick Supplier PNs
- Tab per supplier (LCSC / Mouser / DigiKey)
- Each result shows price, MOQ, stock
- Click to select, click again to deselect
- Can select one PN per supplier

> **Note:** LCSC only supports C-code lookup (e.g. `C7972`). For keyword search use Mouser or DigiKey tabs.

![Add Component Step 2 — Pick PN](screenshots/req4-step2-pick.png)

### Step 3 — Fill Details
- Form pre-filled from best result
- Fields: Stable ID, MPN, Manufacturer, Package, Value, Voltage Rating, Tolerance, WH Location, Datasheet/Link

![Add Component Step 3 — Details](screenshots/req4-step3-details.png)

---

## Requirement 5 — Auto-Find Cheaper Alternatives from Suppliers

**Status: ✅ Done**

In the Alternatives panel (GitMerge icon on each row):
- Tab **"Search Suppliers"** auto-searches by `{Value} {Package}` keyword
- Results from LCSC, Mouser, DigiKey in sub-tabs
- Green badge shows **"X% cheaper"** when alternative price is lower than current item

![Alternatives — cheaper badge on supplier result](screenshots/req5-cheaper-badge.png)

---

## Requirement 6 — Smart Filter Cascade (Category → Package)

**Status: ✅ Done**

- Selecting a **Category** automatically filters the **Package** dropdown to only show packages in that category
- Changing category resets the package filter
- Active filter chips appear below the filter bar — click **×** to remove individual filters or **Clear all** to reset

![Filter cascade — category selected, package filtered](screenshots/req6-filter-cascade.png)
![Active filter chips](screenshots/req6-active-chips.png)

---

## Requirement 7 — Duplicate Check on Add

**Status: ✅ Done**

When entering a part number in Step 1:
- System checks DB before searching suppliers
- Match criteria: same Part Number *(case-insensitive)* + same Manufacturer
- If duplicate found → amber warning box shows existing Stable ID
- Flow stops until user changes input

Backend also returns **HTTP 409 Conflict** if duplicate somehow reaches save.

![Duplicate warning in Add Component modal](screenshots/req7-duplicate-warning.png)

---

## Additional Improvements

### UI / UX Polish
- Replaced native HTML `<select>` dropdowns with **Radix UI Select** — animated, keyboard-accessible, origin-aware popover
- Modals use **Radix UI Dialog** with backdrop blur + scale animation (enter 200ms, exit 150ms — faster exit feels snappier)
- Table reduced from **14 columns → 10 columns** (Product Name, WH, Link removed from view; VR + Tolerance merged into "Specs")
- Row action buttons *(Edit, Delete, Price Lookup, Alternatives)* **hidden by default, appear on row hover** — keeps table clean
- **Skeleton loading rows** while data fetches
- **Stock color coding:**
  - 🔴 Red = 0 units
  - 🟡 Amber = 1–9 units (low stock warning)
  - ⚪ Normal = 10+ units
- Full **English UI**
- Pagination hidden when table is empty

### API Integrations
| API | Status | Notes |
|---|---|---|
| Mouser | ✅ Working | API key configured |
| DigiKey | ✅ Working | OAuth2 client credentials, token cached in memory |
| LCSC | ✅ Partial | Via JLC Sidecar — C-code only (C7972 format) |

### Database
- Added fields: `voltageRating`, `tolerance`
- `supplierPrices` stored as JSON string per component

---

## Known Limitations

| # | Limitation | Impact |
|---|---|---|
| 1 | LCSC keyword search not supported | LCSC tab empty for non-C-code searches. Workaround: use Mouser/DigiKey |
| 2 | Alternatives matching is exact string | "100nF" ≠ "0.1uF" even though equivalent — users must standardize value format |
| 3 | Live prices not written back to DB | Price Lookup shows live price but doesn't update stored item price |

---

*Report generated: 2026-06-02*
