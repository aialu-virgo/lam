---
title: Data map — Collection
summary: Collections (customer receipts): no export yet; exact B1 ORCT/RCT2 query columns.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/receivable.md
  - data-map/invoice.md
  - data-map/customer.md
  - design/plan-model.md
---

# Collection (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Collection · **Status:** **no collection export uploaded.**

## Source and export
- **Not available.** Effect: no collections vs plan, no collection KPI per person.

## Export to request (Q-D18)
B1 saved query on **ORCT / RCT2**, one row per receipt-to-invoice allocation:
`ORCT.DocEntry`, `DocNum`, `DocDate`, `Canceled`, `CardCode`, `BPLId`, `DocTotal`, `CashSum`, `CheckSum`, `TrsfrSum`; `RCT2.InvType`, `DocEntry` (the invoice), `SumApplied`. Filter: receipts from 1 Oct 2023. Field names follow the standard B1 schema (**Assumed**).
S/4: incoming payments (ACDOCA / BSAD, document type DZ): `BELNR`, `BUDAT`, `KUNNR`, `WRBTR`, `AUGBL` (clearing document).
Recommendation: weekly, same cadence as receivables.

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `source_doc_no` | `DocNum` | `BELNR` |
| `doc_date` | `DocDate` | `BUDAT` |
| `customer_code` | `CardCode` | `KUNNR` |
| `amount_inr` | `DocTotal` | `WRBTR` |
| `applied_invoice_no` | `RCT2.DocEntry` → invoice `DocNum` | `AUGBL` / clearing |

## Validation
Cancelled receipts dropped; amount > 0; customer exists; allocated amount ≤ receipt total.

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |

