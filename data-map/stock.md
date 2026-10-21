---
title: Data map — Stock
summary: Stock by plant and item: S/4 Stock Overview Totals export received 21 Oct 2026 (layout below); B1 OITW/batch query still listed for history.
status: draft
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
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Stock · **Status:** first S/4 export received 21 Oct 2026; intake being built ([Decisions](../decisions.md) D34).

## Source and export
- **S/4 "Stock Overview Totals"** (`Stock_Overview_Totals-YYYY-MM-DD-N.xlsx`): one sheet `Data`, header on row 1, one row per material × plant × batch, storage location W003, unit PC (sheets), INR. As-on date comes from the file name.
- Columns: Company Code, Plant, Material Type, Material Group, Old Material Number, Material, Material Description, Batch, Storage Location, Stock Quantity/Value on Period Start, Total Goods Receipt Quantity/Value, Total Goods Issue Quantity/Value, Stock Quantity/Value on Period End, Debit/Credit Revaluation, Base Unit of Measure, Currency, Price Control.
- Map: `on_hand_sheets` = Stock Quantity on Period End (summed over batches); value = Stock Value on Period End; `item_code` = Old Material Number (B1 code), S/4 `MATNR` = Material. Zero-end rows skipped; start + receipts − issues ≠ end is a warning, never a reject.
- **Snapshot entity:** "as on" a date; a new snapshot replaces the previous; month-end snapshots are kept for the trend.

## Export to request (Q-D19)
B1 saved query on **OITW** (stock by warehouse) as on the export date, laminate items only: `ItemCode`, `WhsCode`, `OnHand`, `IsCommited`, `OnOrder`.
For ageing, batch stock (**OIBT**): `ItemCode`, `WhsCode`, `BatchNum`, `Quantity`, `InDate`. For history, the inventory ledger (**OINM**): `ItemCode`, `Warehouse`, `DocDate`, `InQty`, `OutQty`, `TransType`, `BaseRef`, so month-end stock can be rebuilt for 12 quarters. Field names follow the standard B1 schema (**Assumed**).
S/4: MARD / MATDOC: `MATNR`, `WERKS`, `LGORT`, `LABST`; API_MATERIAL_STOCK_SRV.
Recommendation: weekly snapshot from now; ask for the OINM history once.

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `item_code` | `ItemCode` | `MATNR` (via item cross-reference) |
| `warehouse_code`, `plant_code` | `WhsCode`, branch of warehouse | `LGORT`, `WERKS` |
| `on_hand_sheets` | `OnHand` | `LABST` |
| `batch_in_date` | `InDate` | batch creation date |
| `as_on_date` | export date | export date |

## Validation
`OnHand` ≥ 0 (negative → warn); item and warehouse exist; unit is sheets (item master `Inventory UoM` Pcs); a laminate item stocked in SQM or Mtr is flagged.

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |

