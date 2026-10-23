---
title: Data map — Credit note
summary: Credit-note intake built (D39): B1 ORIN/RIN1 lines and S/4 billing credit memos, by plant-month and product group; Net sales basis per D40.
status: active
updated: 2026-10-23
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/receivable.md
---

# Credit note (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Credit note · **Status:** **intake built (D39); no real file loaded yet.**

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


## Intake in the Desk (D39 and D40, 23 Oct 2026)
- **Layouts:** B1 ORIN/RIN1 lines (`DocNum`, `DocDate`, `CardCode`, `BPLName`, `ItemCode`, `Quantity`, `LineTotal`, `BaseRef`; no Invoice Type or Catagory column) and the S/4 billing register where the Billing Type is not F2 (G2, RE, S1; F2 rows are skipped and counted). Otherwise the mapping step.
- **Period:** read from the file name (`..._-2026-07-01_to_2026-09-30.csv`); a row outside it is rejected. A file may span months; every month it covers is marked covered, so a plant with no credit note there shows none, not "not loaded".
- **Stored per plant-month by product group:** sheets, sq ft and value, with the SAP reference per line (document, line, item, base invoice). Item group and scope come from the item master; items not in it are counted, not stored. ACP plants are skipped and counted. Values are stored positive.
- **Replace and undo:** a re-upload replaces the plant-months it covers; a thinner file for a held month waits for a confirm; Undo upload removes them.
- **Net basis (D40):** once every month of a quarter (up to today) is covered, achievement and growth for that quarter use Net = invoiced − credit notes. Earlier quarters stay on invoiced, and each figure is labelled Invoiced or Net. QoQ compares Net with Net only when both quarters are covered, otherwise invoiced with invoiced (the tooltip says which). Not available per salesperson (credit notes carry no salesperson link).
- Template: [credit-note-b1.csv](templates/credit-note-b1.csv).
