---
title: Data map — Stock
summary: Stock by plant and item: S/4 Stock Overview Totals export received 21 Oct 2026 (layout below); B1 OITW/batch query still listed for history.
status: active
updated: 2026-10-21
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/item.md
  - data-map/warehouse.md
  - data-map/plant-master.md
  - design/plan-model.md
---

# Stock (SAP export)
**Owner:** Data Architect · **Built:** Full-Stack Engineer · **Decision:** D34 (Vijay, 21 Oct 2026, "build stock data intake").

## Source and export
Stock is a **snapshot "as on" a date**, never a period sum. The as-on date comes from the file name (for example `Stock 2026-10-20` or `Stock_Overview_Totals-2026-10-20-1.xlsx`); if the name has none, the uploader picks it (required). A new upload for the same date replaces that snapshot.

**Export Vijay should run (recommended): B1 batch stock** (gives ageing too), as on the day, laminate items only:
- Query on **OIBT** joined to **OWHS**: `ItemCode`, `ItemName`, `WhsCode`, `BatchNum`, `Quantity` (where > 0), `InDate`, and `AvgPrice` (or `StockValue`). Save as XLSX, sheet **DATA**, name it `Stock YYYY-MM-DD`.
- If batch stock is not available: **OITW** `ItemCode`, `ItemName`, `WhsCode`, `OnHand`, `IsCommited`, `OnOrder`, `AvgPrice`. Stock days work; ageing needs the batch file.
- S/4: **MB52** (or the report *Stock Overview Totals*): see layouts below.
Header-only templates: [stock-b1.csv](templates/stock-b1.csv) (OITW), [stock-b1-batch.csv](templates/stock-b1-batch.csv) (batch). Field names follow the standard B1 schema (**Assumed**).

## Layouts recognised (by headers)
| Layout | Detected by | Notes |
|---|---|---|
| B1 OITW | `ItemCode` + `WhsCode` + `OnHand` | no ageing |
| B1 batch | `ItemCode` + `WhsCode` + `BatchNum` + `InDate` | ageing 0–30 / 31–60 / 61–90 / 90+ and sheets older than `stock_age_days` (180) |
| S/4 MB52 | `Material` + `Plant` + an Unrestricted column | quantity = unrestricted + quality inspection + blocked |
| S/4 Stock Overview Totals | `Stock Quantity on Period End` + `Plant` + `Material` | 22 columns, sheet `Data`. Closing stock = `Stock Quantity on Period End`, value = `Stock Value on Period End`. `Old Material Number` (FGxxxxx) is the item cross-reference; rows are material × plant × batch. Zero closing rows skipped. Rows where start + receipts − issues ≠ end are warned, never rejected. Batch has no date, so no ageing |

## Canonical stock row
`as_of`, `plant_code`, `item_code`, `qty_sheets`, `sqft` (item master size × sheets), `value_inr` (if given), `batch` and `in_date` (if given), source refs (system, layout, warehouse or storage location, material, batch, upload id). Product group from the item master (D6). Laminate scope only: items not in the item master are counted, not stored (for the Totals layout the material group gives the group and the row is stored without sq ft).

## Mapping and validation
- **Warehouse → plant:** the plant master (code, code prefix, branch or plant name), then the editable table Admin › Aliases › Warehouse → plant. One plant may have several warehouses; stock is added together.
- Mapping per file type is saved on a successful load (`mappings/<system>_stock_<layout>`).
- Rejected (skipped, kept in the upload's list): empty item code, quantity not a number, negative quantity, unknown warehouse or plant, plant switched off. Not rejected: zero quantity (counted), item not in the item master (counted).
- Fixes applied panel on every stock upload; File column and Undo in Upload history; coverage row "Stock" (the latest snapshot of a month counts as that month).

## Storage (D9 limits)
`stock/snap_YYYYMMDD` (index plus aggregates per plant × product group: sheets, sq ft, value, items, age buckets, sheets over `stock_age_days`) and `stock/it_YYYYMMDD_<plant>_<n>` (per-item rows, gzipped, 1,500 rows per document). Kept: the last 6 snapshots plus the latest snapshot of each month since history start (D28). A 66,097-row Totals file makes about 40 documents, each under 20 KB.

## Stock days (K15)
`on hand sheets ÷ average daily sheets sold in the last 90 days to the as-on date`, per plant × product group. Sales sheets come from the invoice aggregates: each full month counts for the days of it inside the window, the as-on month counts as loaded. Months with no sales loaded are left out. Plan: `stock_days_target` (30). Rule R4 uses stock days and aged sheets ([Check rules](../design/check-rules.md)).
