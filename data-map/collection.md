---
title: Data map — Collection
summary: Collections (customer receipts) from the B1 Incoming Payment Report: layout, rules, storage, validation (D38).
status: active
updated: 2026-10-23
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/receivable.md
  - data-map/invoice.md
  - data-map/customer.md
  - design/plan-model.md
---

# Collection (SAP export)
**Owner:** Data Architect · **Built:** Full-Stack Engineer · **Decision:** D38 (Vijay, 23 Oct 2026).

## Source and export
**B1 "Incoming Payment Report"**, one sheet (`Sheet1`), header on row 1, one row per receipt line. File name carries the period: `Incoming_Payment_Report_-2025-04-01_to_2026-09-30.xlsx`. One file may span many months. Header-only template: [collection-b1-incoming-payment.csv](templates/collection-b1-incoming-payment.csv).

Columns (20): `#`, `BRANCHNAME`, `DOCNUM`, `DOCDATE`, `DOCTYPE`, `PAYMENTMEANS`, `ACCOUNT`, `ACCOUNTNAME`, `CARDCODE`, `CARDNAME`, `CITY`, `CHECK_DATE`, `CHECKNO`, `CHECKSUM`, `TARNSFERREF` (sic), `TRANSFER_DATE`, `TRANSFERSUM`, `CASHSUM`, `REMARKS`, `JOURNALREMARK`.

## Rules (decided)
1. A collection is a `DOCTYPE` **C** row (customer). **A** (account/GL) and **S** (supplier) rows are skipped and counted, not rejected.
2. `amount` = `CHECKSUM` + `TRANSFERSUM` + `CASHSUM` (all ≥ 0).
3. Plant = `BRANCHNAME` resolved like the sales intake (plant master `b1_bpl_name` or name, then aliases). ACP plants (business ACP, code 1050 and up) are skipped and counted. An unknown branch is rejected (skipped, listed).
4. Month and day come from `DOCDATE`, text **dd/mm/yyyy** (also ISO text or an Excel serial). **Never swapped.** A date outside the period in the file name, in the future, or not readable is rejected. Dates before history start (D28) are counted, not loaded.
5. Per row the SAP reference is kept: system B1, source RCT, `DOCNUM`, `CARDCODE`, `CARDNAME` (30 characters), upload id.
6. A multi-month file replaces each plant-month it covers (idempotent). A plant-month that already holds more receipts than the new file needs a confirm (the same guard as sales). Upload history shows the file name; Undo removes what the upload still holds (a plan already set on a month is kept).
7. A plant-month's `plan` field is kept when it exists.

## Storage
`collections/{plant}-{ym}`: `{plant, ym, total, n, rows:[[receipt, day, customer, amount, name]], plan, sys, src, upload, at}`. When a plant-month exceeds about 170,000 characters the document keeps the 1,500 largest receipts in `rows` and every row gzipped in `z`.

## Validation
Rejected (kept in the upload's list): empty receipt number, no amount column value, negative amount, unreadable date, future date, outside the file-name period, unknown branch, plant switched off. Counted, not rejected: types A and S, ACP plants, zero amounts, dates before history start.

## Mapping to S/4 (for the later switch)
| Canonical | B1 | S/4 |
|---|---|---|
| `source_doc_no` | `DOCNUM` | `BELNR` |
| `doc_date` | `DOCDATE` | `BUDAT` |
| `customer_code` | `CARDCODE` | `KUNNR` |
| `amount_inr` | `CHECKSUM`+`TRANSFERSUM`+`CASHSUM` | `WRBTR` (document type DZ) |
