---
title: Data map — Sales order
summary: Sales orders: no export yet; exact B1 ORDR/RDR1 query columns for open orders and O2D; S/4 only shows an order-creation date on invoiced lines.
status: not used (D31)
updated: 2026-10-21
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/delivery.md
  - data-map/customer.md
  - data-map/item.md
  - design/plan-model.md
---

# Sales order (SAP export)

> **D31 (Vijay, 21 Oct 2026):** not used. Orders & Dispatch was removed from scope; no export of this entity is needed. Kept for history.
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Sales order · **Status:** **no sales order export uploaded.**

## Source and export
- **Not available:** B1 sales file has no order number or order date. The S/4 register has `Order Creation Date` on invoiced lines (equal to invoice date on 98%), which cannot show open or unbilled orders.
- **Effect:** Orders & Dispatch page (open orders, order-to-dispatch days against plan TAT) and the "order beyond TAT" rule have no data.

## Export to request (Q-D14)
B1 saved query on **ORDR / RDR1**, one row per order line:
`ORDR.DocEntry`, `DocNum`, `DocDate`, `DocDueDate`, `DocStatus`, `CANCELED`, `CardCode`, `SlpCode`, `BPLId`; `RDR1.LineNum`, `ItemCode`, `Quantity`, `OpenQty`, `LineStatus`, `Price`, `LineTotal`, `WhsCode`, `ShipDate`.
Filter: `DocDate` from 1 Oct 2023 (12 quarters) plus every order still open. Field names follow the standard B1 schema (**Assumed**).
S/4 equivalent: VBAK/VBAP: `VBELN`, `POSNR`, `AUDAT`, `KUNNR`, `MATNR`, `KWMENG`, `NETWR`, `WERKS`, `GBSTK`, `WBSTK`; or API_SALES_ORDER_SRV. Recommendation: weekly, with open orders re-sent each time (an open-order export replaces the previous one).

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `source_doc_no`, `source_line` | `DocNum`, `LineNum` | `VBELN`, `POSNR` |
| `doc_date` | `DocDate` | `AUDAT` |
| `due_date` | `DocDueDate` / `ShipDate` | `VDATU` |
| `customer_code`, `item_code`, `plant_code` | `CardCode`, `ItemCode`, `BPLId` / `WhsCode` | `KUNNR`, `MATNR`, `WERKS` |
| `qty_sheets`, `open_qty_sheets` | `Quantity`, `OpenQty` | `KWMENG`, open from delivery status |
| `net_value_inr` | `LineTotal` | `NETWR` |

## Validation
Mandatory: doc no, line, date, customer, item, quantity; unknown customer, item or plant → warn / reject per shared rules; `OpenQty` ≤ `Quantity`; cancelled orders dropped.

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |

