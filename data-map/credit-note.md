---
title: Data map — Credit note
summary: Credit notes and returns: no export; B1 sales file has only a per-line ReturnQty; S/4 register shows F2 invoices only; exact ORIN/RIN1 query columns.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/receivable.md
---

# Credit note (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Credit note · **Status:** **no credit note export uploaded.**

## Source and export
- **B1 sales file:** no negative lines, one invoice type. `ReturnQty` marks returns on 193 invoice lines (0.13% of laminate sheets) but `LineTotal` is not reduced; there is no credit-note number or value.
- **S/4 register:** billing type F2 only. Whether credit memos are excluded by the report or absent is unknown (Q-D4).
- **Effect:** net sales (invoices less credit notes) cannot be computed; the Desk shows invoiced sales and says so. Negative quantity is allowed only on this entity.

## Export to request (Q-D16)
B1 saved query on **ORIN / RIN1**, one row per line: `ORIN.DocEntry`, `DocNum`, `DocDate`, `CANCELED`, `CardCode`, `SlpCode`, `BPLId`; `RIN1.LineNum`, `ItemCode`, `Quantity`, `LineTotal`, `BaseType`, `BaseEntry`, `BaseLine` (the original invoice), plus the reason UDF if one exists. Filter: from 1 Oct 2023. Field names follow the standard B1 schema (**Assumed**).
S/4: credit-memo billing documents (VBRK/VBRP, billing types G2 and similar): same columns as the invoice register with the billing type included.
Recommendation: same file layout and cadence as the invoice export so one intake rule serves both.

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `source_doc_type` | `CRN` | `CRN` (billing type G2 or equivalent) |
| `source_doc_no`, `source_line` | `DocNum`, `LineNum` | `Invoice Document Number`, `Invoice Document item` |
| `base_invoice_no`, `base_invoice_line` | `BaseEntry` → invoice `DocNum`, `BaseLine` | reference document |
| `qty_sheets`, `net_value_inr` | `Quantity`, `LineTotal` (positive; sign by type) | `Invoice Qty`, `Total Amount (Item)` |

## Validation
Base invoice should exist (warn if not); credit quantity ≤ invoiced quantity per base line (warn); S/4 rows de-duplicated like the invoice register.

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |

