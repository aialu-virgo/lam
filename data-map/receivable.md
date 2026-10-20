---
title: Data map — Receivable
summary: Receivables: no export yet; exact B1 open-invoice and open-items query columns for ageing 0–30 / 31–60 / 61–90 / 90+.
status: draft
updated: 2026-10-20
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
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Receivable · **Status:** **no receivable export uploaded.**

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

