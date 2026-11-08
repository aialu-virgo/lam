---
title: Data map — Customer
summary: Customer master intake built (D39): B1 OCRD and S/4 business partner in Admin; names, salesperson suggestion, credit limit and over-limit flag.
status: active
updated: 2026-10-23
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/sales-employee.md
  - data-map/market-potential.md
  - data-map/receivable.md
  - data-map/sales-order.md
  - data-map/collection.md
---

# Customer (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Customer · **Status:** **intake built (D39); no real file loaded yet.**

## Source and export
- **Derived now (from invoices):** the B1 sales file holds 3,696 customer codes (3,655 on external rows) with code, name, GSTIN (0.27% blank), city (748 spellings, messy), state, zone. The S/4 register holds 92 customers with code, name, GSTIN, sales district, state code, customer group (C1, C2). Fields in [Data map — Invoice](invoice.md) and [Data map — Invoice, S/4 sales register](invoice-s4-register.md).
- **Not derivable:** customer group / segment (B1), salesperson owner (`SlpCode`), territory, credit terms, active flag, creation date. Without them: no A/B/C by master, no "own customers" filter for sales executives, no new-customer count (a customer with no history is "new", which needs a master creation date).
- **Cross-system key (Assumed):** GSTIN; 82.4% of the 91 S/4 GSTINs also appear in the B1 file.

## Export to request (Q-D13)
B1 saved query on **OCRD** (customers only, `CardType = 'C'`), one row per customer:
`CardCode`, `CardName`, `GroupCode` and the group name from OCRG, `SlpCode`, `Territory` (OTER name), GSTIN (CRD7 `TaxId0`, or the GSTIN UDF), default bill-to `City`, `State`, `ZipCode` (CRD1), `GroupNum` with payment-terms name (OCTG), `CreditLine`, `validFor`, `frozenFor`, `CreateDate`, `UpdateDate`. Field names follow the standard B1 schema (**Assumed**); the B1 administrator confirms any UDF names.
S/4 equivalent: KNA1 / business partner: `KUNNR`, `NAME1`, `KTOKD`, `KDGRP`, `VKGRP`, `STCD3` (GSTIN), `ORT01`, `REGIO`, `ZTERM`, `ERDAT`; or API_BUSINESS_PARTNER.
Recommendation: send once now, then weekly.

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `customer_code` | `CardCode` | `KUNNR` (sales register: `Sold-to-Party Number`) |
| `name` | `CardName` | `NAME1` |
| `gstin` | `BILL GSTIN` in invoices; CRD7 in master | `STCD3`; `Sold-to-Party GSTIN` |
| `customer_group` | `GroupCode` | `KDGRP` (`Customer Group` C1, C2) |
| `sales_employee_code` | `SlpCode` | `VKGRP` / partner function |

## Validation
`customer_code` unique per source system; GSTIN 15 characters; unknown customer in an invoice → warn and auto-create a stub from the invoice (Assumed) so sales are not lost; a code with two names in one file → warn (3,697 names for 3,696 B1 codes).

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |


## Intake in the Desk (D39, 23 Oct 2026)
Admin › Customers. Each load replaces the whole master (like the item master). Layouts: B1 OCRD (`CardCode`, `CardName`, `CardType` C only, `GroupName`, `City`, `State`, `SlpName`, `CreditLine`, `Balance`, `PymntGroup`) and the S/4 business partner list (`Customer`, `Name`, `City`, `Region`, credit limit); other headers go through the mapping step. Non-customer partners are skipped and counted; duplicate codes are rejected.
Uses: the customer name where only a code shows; the salesperson from the master as a suggestion only; credit limit and "over limit by" on the Receivables page (open receivable of the customer across the plants in scope against the limit). A display and a flag, no new automatic action. Template: [customer-b1.csv](templates/customer-b1.csv).
