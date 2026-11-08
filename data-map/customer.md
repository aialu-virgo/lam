---
title: Data map — Customer
summary: Customer master: S/4 business partner via the OData connector (D77), B1 OCRD upload as fallback; code, name, group, GSTIN, state, PIN, city, district, salesperson suggestion, credit limit; Admin intake built (D39).
status: active
updated: 2026-11-08
related:
  - data-map/geography.md
  - data-map/s4-odata-feed.md
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
**Source (D77, Vijay 8 Nov 2026): the customer master comes from the SAP connector.** The S/4 business-partner reads are specified in [S/4HANA OData feed](s4-odata-feed.md) section 1.4 (customer, name, group, GSTIN, address with Region, PostalCode, CityName, District, sales area, salesperson where available; every name candidate — verify against $metadata). The B1 OCRD upload (below) stays as the fallback for history customers that are not in S/4, matched by legacy code, then GSTIN (**Assumed**). State and PIN are needed so actuals can be attributed to a state and district ([Geography](geography.md)).
- **State and PIN today (8 Nov 2026):** the Desk's customer intake stores code, name, group, city, state, salesperson, credit limit, balance and terms and **does not read a PIN column** (checked in the Desk source `69-cust.js`). No real customer file is recorded as loaded in this file; not re-checked against the live Desk. Counts of customers with state and PIN: [Geography](geography.md) coverage.
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
| `sales_employee_code` | `SlpCode` | `VKGRP` / partner function; connector: sales group or partner-function relation (feed 1.4 row 11) |
| `state` → `state_code` | `State` (CRD1 default bill-to); invoice `State` (name, 26 spellings) | `REGIO`; sales register `State` (GST code); connector `Region` of the address (feed 1.4 row 6) |
| `pin` | `ZipCode` (CRD1 default bill-to) | `PSTLZ` / address `PostalCode` (feed 1.4 row 7) |
| `city` | `City` (CRD1) | `ORT01` / address `CityName` (feed 1.4 row 8) |
| `district_text` | none | address `District`, optional (feed 1.4 row 9) |
| `legacy_b1_code` | the key itself | custom property, name unverified (feed 1.4 row 14) |

## Validation
`customer_code` unique per source system; GSTIN 15 characters; unknown customer in an invoice → warn and auto-create a stub from the invoice (Assumed) so sales are not lost; a code with two names in one file → warn (3,697 names for 3,696 B1 codes).

## Coverage (12 quarters)
| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |


## Changes for D77 (8 Nov 2026)
- The Desk master gains `pin` and `state_code` (via the geography alias table) and `district_text`; the S/4 feed fills them, the B1 OCRD layout takes `ZipCode`. **Build requirement:** key the master by (`source_system`, `customer_code`) and let each load replace only its own system's rows (see [feed 1.4](s4-odata-feed.md)).
- A customer with no PIN or an unresolvable PIN is "<State> – unassigned" at district level; at state level it counts in full. Nothing warns while no district split exists.

## Intake in the Desk (D39, 23 Oct 2026)
Admin › Customers. Each load replaces the whole master (like the item master). Layouts: B1 OCRD (`CardCode`, `CardName`, `CardType` C only, `GroupName`, `City`, `State`, `SlpName`, `CreditLine`, `Balance`, `PymntGroup`) and the S/4 business partner list (`Customer`, `Name`, `City`, `Region`, credit limit); other headers go through the mapping step. Non-customer partners are skipped and counted; duplicate codes are rejected.
Uses: the customer name where only a code shows; the salesperson from the master as a suggestion only; credit limit and "over limit by" on the Receivables page (open receivable of the customer across the plants in scope against the limit). A display and a flag, no new automatic action. Template: [customer-b1.csv](templates/customer-b1.csv).
  - data-map/s4-odata-feed.md
