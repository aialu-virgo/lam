---
title: Data map — Receivable
summary: Receivables snapshot intake built (D39): four layouts (B1 OINV, B1 JDT1, S/4 open items, custom B1 report), as-on date from the file name or a picker, credit items shown apart.
status: active
updated: 2026-10-23
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/collection.md
  - data-map/credit-note.md
  - data-map/customer.md
  - design/plan-model.md
---

# Receivable (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Receivable · **Status:** **intake built (D39); no real file loaded yet.**

## Source and export
- **Not available.** Invoice files carry `DocTotal` but no due date, paid amount or open balance.
- **Effect:** no ageing buckets, no overdue-receivable actions, no collection plan vs actual.
- **Snapshot entity:** each export is "as on" a date. A new snapshot replaces the previous one; month-end snapshots are kept for history.

## Export to request (Q-D17)
B1 saved query on **open invoices** (OINV) as on the export date:
`DocEntry`, `DocNum`, `DocDate`, `DocDueDate`, `CardCode`, `SlpCode`, `BPLId`, `DocTotal`, `PaidToDate`, `GroupNum` (payment terms).
Plus **open journal items** (JDT1, customer lines with a balance) for credit notes and on-account receipts: `TransId`, `Line_ID`, `ShortName` (customer code), `RefDate`, `DueDate`, `Debit`, `Credit`, `BalDueDeb`, `BalDueCred`, `TransType`, `BaseRef`.
Field names follow the standard B1 schema (**Assumed**). S/4: open items (ACDOCA / BSID): `BELNR`, `ZFBDT` (baseline date), `ZBD1T`, `WRBTR`, `KUNNR`, `BUKRS`; I_OperationalAcctgDocItem.
Recommendation: weekly snapshot; for history, month-end open items for the last 12 quarters (needed only for a receivables trend).

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `source_doc_no` | `DocNum` | `BELNR` |
| `due_date` | `DocDueDate` | `ZFBDT` + terms |
| `doc_total_inr`, `paid_inr`, `open_inr` | `DocTotal`, `PaidToDate`, `DocTotal` − `PaidToDate` | `WRBTR` open amount |
| `as_on_date` | export date (entered at upload) | export date |

## Validation
Open ≥ 0 except credit items; due date ≥ doc date; customer exists; `as_on_date` required; plant from `BPLId`.

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |


## Intake in the Desk (D39, 23 Oct 2026)
Data Intake detects the layout from the headers; if none matches it shows the column-mapping step.
| Layout | Recognised by | Open amount |
|---|---|---|
| B1 OINV open invoices | `DocNum`, `DocDueDate`, `CardCode`, `DocTotal`, `PaidToDate` | `DocTotal` − `PaidToDate` |
| B1 JDT1 open items | `BaseRef`, `DueDate`, `ShortName`, `BalDueDeb`, `BalDueCred` | debit − credit |
| S/4 open items | `Net Due Date`, `Customer`, `Amount in Local Currency` | the amount column |
| B1 custom open-items report | `BRANCHNAME`, `DOCNUM`, `DUEDATE`, `CARDCODE`, `BALANCE` | `BALANCE` |

- **As-on date:** read from the file name (`2026-10-20`, `20.10.2026`) or picked in the page; required, never in the future. Dates are read as written, never swapped.
- **Snapshot:** one snapshot per as-on date; the same date replaces it. The last 6 snapshots plus the latest of each month since history start are kept. Undo upload removes a snapshot.
- **Credit items (negative open amount):** kept, shown apart on the Receivables page, not netted against invoices and not in the ageing. ACP plants are skipped and counted.
- **Ageing:** days past due counted to the snapshot's as-on date. Rule R2 and K10 read the latest snapshot.
- Saved column mapping is kept per layout. Template: [receivable-b1-open-invoices.csv](templates/receivable-b1-open-invoices.csv).
