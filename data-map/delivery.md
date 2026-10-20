---
title: Data map — Delivery
summary: Deliveries (dispatches): no export yet; exact B1 ODLN/DLN1 query columns; needed for dispatch TAT.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/sales-order.md
  - data-map/invoice.md
  - data-map/warehouse.md
  - design/plan-model.md
---

# Delivery (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Delivery · **Status:** **no delivery export uploaded.**

## Source and export
- **Not available.** The invoice files carry no delivery number, dispatch date or base-document link.
- **Effect:** no dispatch TAT (order date to dispatch date), no "dispatched not invoiced".

## Export to request (Q-D15)
B1 saved query on **ODLN / DLN1**, one row per delivery line:
`ODLN.DocEntry`, `DocNum`, `DocDate`, `CANCELED`, `CardCode`, `BPLId`; `DLN1.LineNum`, `ItemCode`, `Quantity`, `LineTotal`, `WhsCode`, `BaseType`, `BaseEntry`, `BaseLine`; plus the dispatch / LR date if kept in a UDF. Filter: from 1 Oct 2023. Field names follow the standard B1 schema (**Assumed**).
S/4: LIKP/LIPS: `VBELN`, `WADAT_IST` (actual goods issue), `VGBEL` (base order), `LFIMG`, `WERKS`, `LGORT`; API_OUTBOUND_DELIVERY_SRV. Recommendation: weekly, same cadence as orders.

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `source_doc_no`, `source_line` | `DocNum`, `LineNum` | `VBELN`, `POSNR` |
| `dispatch_date` | `DocDate` (or UDF) | `WADAT_IST` |
| `base_order_no`, `base_order_line` | `BaseEntry` → order `DocNum`, `BaseLine` | `VGBEL`, `VGPOS` |
| `qty_sheets` | `Quantity` | `LFIMG` |
| `warehouse_code`, `plant_code` | `WhsCode`, `BPLId` | `LGORT`, `WERKS` |

## Validation
Base order must exist (warn if not); quantity > 0; dispatch date not before order date; cancelled deliveries dropped.

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |

