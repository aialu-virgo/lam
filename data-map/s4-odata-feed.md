---
title: Data map — S/4HANA OData feed
summary: Read-only OData feed for sales, credit notes and (D77) the customer master incl. state, PIN and district from 1 Oct 2026: candidate services and fields mapped to the S/4 register columns and canonical fields, filters, incremental plant-month replace, paging, volume, and the day-one verification checklist.
status: draft
updated: 2026-11-08
related:
  - data-map/geography.md
  - data-map/_index.md
  - data-map/invoice-s4-register.md
  - data-map/invoice.md
  - data-map/credit-note.md
  - data-map/item.md
  - data-map/customer.md
  - data-map/plant-master.md
  - design/canonical-data-model.md
  - systems/sap-s4hana.md
  - handover/s4hana-switch.md
  - open-questions.md
---

# S/4HANA OData feed (sales, credit notes, customer master)
**Owner:** Data Architect · **Status:** design only; nothing built, nothing called, no communication user yet · **Decided:** D66 (Desk on Google Apps Script).

**Short version.** From 1 Oct 2026 the connector reads billing documents from S/4HANA through released OData APIs (`UrlFetchApp`, communication user, GET only) and hands the Desk the same rows the S/4 Sales Register upload produces, so the existing intake rules, replace-a-plant-month and Net basis apply unchanged. Data to 30 Sep 2026 stays as uploaded; the feed never touches it.

**Status of every SAP name in this file: candidate — verify against $metadata.** Sources of the candidates: the group's existing S/4 connector (unverified; built on mocks only), plus the standard S/4 billing API as recalled (**Assumed**, not checked against a tenant). Names that the group's connector marks "evidenced" are used by another group portal in production; that is not verification for this user.

## Parity rule (what "exactly the upload" means)
The connector does not compute figures. It builds rows that carry the **register's own column names**, then runs them through the unchanged Desk intake (detect, parse, validate, pack, replace). Checked in the Desk source, 7 Nov 2026: the S/4 sales intake reads only the columns in the table below; it reads no tax column.

| Intake behaviour (existing) | Consequence for the feed |
|---|---|
| Keeps one row per (document, line); counts surplus rows as fan-out | Item-level API has no price-group fan-out; the same de-dup stays as a safety net |
| Keeps billing type `F2` only; other types rejected as "Not an invoice document type" | Same type test, set in the connector as a list, see Filters |
| Rejects quantity ≤ 0, net < 0, unreadable or future dates, unknown or switched-off plants | Same, because the feed passes through the same parse. Rejects show in the feed's upload entry |
| Plants 1050 and above (ACP) skipped and counted | Same |
| Product group from `Product Type` (ZABLAM, ZCRLAM, ZCBPVC) and `Material Group 3` (DOOR, COMPACT) | The feed must supply both, see 1.1 |
| Sq ft from `Material Group 4` text `AxB` (feet; values ≥ 100 read as mm) | The feed must supply the same text, not a code, see checklist 11 |
| Salesperson blank in S/4; filled from the customer master as a suggestion | Same; the feed sends it blank |
| No internal-transfer flag for S/4 | Same; none derived |
| Closed quarters locked; credit-note month locks (D60); thinner replacement waits for a confirm | The feed obeys all three and stops with a message; it never confirms or unlocks for itself |

## 1. Entities
### 1.1 Billing (sales)
**Service (OData v2):** `API_BILLING_DOCUMENT_SRV` — candidate — verify against $metadata.
**Read shape A (default):** entity set `A_BillingDocument` (header) with `$expand=to_Item` (`A_BillingDocumentItem`) — candidate — verify against $metadata. I expect type, date, company code, cancellation flag and change date on the **header** (Assumed from memory). The group's connector instead puts them on the item set (shape B). Checklist 2 decides; shape B is used only if the item set carries `BillingDocumentDate` and `Plant`.
**Host and root:** `https://<tenant>-api.s4hana.cloud.sap/sap/opu/odata/sap/<service>` is the shape the group's other portal uses (host open: Q30). JSON, `Accept: application/json`; v2 dates arrive as `/Date(ms)/`.

| # | OData field (header H / item I) | Register column (as the intake reads it) | Canonical field | Rule | Status |
|---|---|---|---|---|---|
| 1 | H `BillingDocument` | `Invoice Document Number` | `source_doc_no` | Trim leading zeros; must equal the register text | candidate — verify against $metadata |
| 2 | I `BillingDocumentItem` | `Invoice Document item` | `source_line` | Trim leading zeros (register shows 10, 20 …) | candidate — verify against $metadata |
| 3 | H `BillingDocumentDate` | `Invoice Date` | `doc_date` | Take the UTC date of the `/Date(ms)/` value, never shift to IST | candidate — verify against $metadata |
| 4 | I `Plant` | `Plant` | `plant_code` | 4 characters, equals Plant List code | candidate — verify against $metadata |
| 5 | H `SoldToParty` | `Sold-to-Party Number` | `customer_code` | Trim leading zeros if the register has none | candidate — verify against $metadata |
| 6 | customer read (1.3) `CustomerName` (**optional**, see 1.1a) | `Sold-to-Party Description` | `customer_name` | First 60 characters kept by the Desk | candidate — verify against $metadata |
| 7 | I `Material` | `Product Code` | `s4_material_no` | Trim leading zeros | candidate — verify against $metadata |
| 8 | product read (1.3) `ProductType` | `Product Type` | `item_type` → product group | ZABLAM, ZCRLAM, ZCBPVC; others counted as "other", not stored | candidate — verify against $metadata |
| 9 | I `AdditionalMaterialGroup3` (or product sales view `ThirdSalesSpecProductGroup`) | `Material Group 3` | `thickness_type` | Text such as DOOR, LAM, COMPACT; if SAP returns a code, a text lookup is needed | candidate — verify against $metadata |
| 10 | I `AdditionalMaterialGroup4` (or `FourthSalesSpecProductGroup`) | `Material Group 4` | `size_ft` | Text `8X4`, `7X3`; a code here breaks sq ft | candidate — verify against $metadata |
| 11 | I `BillingQuantity` | `Invoice Qty` | `qty_sheets` | Unit `BillingQuantityUnit` must be the sheet unit (PC); else flag, do not convert silently | candidate — verify against $metadata |
| 12 | I `NetAmount` | `Total Amount (Item)` | `net_value_inr` | Net of GST; currency `TransactionCurrency` must be INR | candidate — verify against $metadata |
| 13 | H `BillingDocumentType` | `Billing Type` | `source_doc_type` | See Filters | candidate — verify against $metadata |
| 14 | **not read** (real tenant 8 Nov: `SalesDistrict` is not a property of `A_BillingDocumentItem`, HTTP 404) | `Sales District` | `zone` (via table) | Column staged blank. The page uses it only for zone-spelling counts in the intake report (the B1 transfer flag reads the B1 `Zone` only); district and geography come from the customer master read (section 1.4, row 10) | **checked on the real tenant: absent** |
| 15 | — (not read) | `Sales Executive` | `sales_employee_code` | Sent blank, as the register is (Q-D5 open; if answered, customer sales area `SalesGroup` is the candidate) | candidate — verify against $metadata |
| 16 | H `CustomerGroup` | `Customer Group` | `customer_group_code` | Optional; segment meaning open (Q5) | candidate — verify against $metadata |
| 17 | H `DocumentReferenceID` | `ODN` | `official_invoice_no` | Optional; GST invoice number, field location unknown | candidate — verify against $metadata |
| 18 | I `TaxAmount`; pricing elements (India GST conditions, candidate `JOCG`, `JOSG`, `JOIG`) | `CGST Amount`, `SGST Amount`, `IGST Amount` | `cgst_inr`, `sgst_inr`, `igst_inr` | **Not read in v1.** The intake stores net only. Read `TaxAmount` later as a check if wanted | candidate — verify against $metadata |

Columns not read: `Order Creation Date`, `GSTIN`, `State`, `City`, `Price Group(Item)`, plant address columns, `HSN`, licence columns, `Unit Price`, `Total Invoice Amount`, `invqty`, `totinvamt`, `totnetamt`, `Tax Amount` (all unused or duplicates per [Data map — S/4 register](invoice-s4-register.md)).


#### 1.1a Optional properties and the verify rule (first real-SAP finding, 8 Nov)
`sapVerifyMetadata` marks each name required or optional. **Optional** (not needed for net sales, sheets or sq ft): `A_BillingDocumentItem.ReferenceSDDocument` (Reference Document) and `A_Customer.CustomerName` (row 6). An optional name missing on the tenant is a GAP with a warning; `ok` stays true, the name is left out of every later read and the list is kept in the Script Property `SAP_OPT_SKIP` (cleared by the next clean verify). A **required** name that is a GAP makes `ok` false, and the shadow run and sync refuse to read until it is fixed. Every public SAP function writes one summary line to the execution log (no credentials, user or address).

### 1.2 Credit notes
Same service, same read as 1.1; credit memos are billing documents of other types. The mapping differs only here:

| Canonical | OData field | Register / intake column | Rule | Status |
|---|---|---|---|---|
| `source_doc_type` | H `BillingDocumentType` (and `SDDocumentCategory`) | `Billing Type` | Types in the credit list only, see Filters | candidate — verify against $metadata |
| `source_doc_no`, `source_line` | H `BillingDocument`, I `BillingDocumentItem` | `Invoice Document Number`, `Invoice Document item` | As 1.1 | candidate — verify against $metadata |
| `doc_date` | H `BillingDocumentDate` | `Invoice Date` | As 1.1 | candidate — verify against $metadata |
| `qty_sheets`, `net_value_inr` | I `BillingQuantity`, I `NetAmount` | `Invoice Qty`, `Total Amount (Item)` | **Absolute value**, as the credit-note intake does (stored positive, sign by type) | candidate — verify against $metadata |
| `base_invoice_no` | I `ReferenceSDDocument` | `Reference Document` | Optional, warn-only. May hold the credit memo request, not the invoice; confirm | candidate — verify against $metadata |
| `customer_code`, `plant_code` | H `SoldToParty`, I `Plant` | `Sold-to-Party Number`, `Plant` | As 1.1 | candidate — verify against $metadata |
| `item_code` | I `Material` | `Product Code` | **Gap, see below** | candidate — verify against $metadata |

**Gap to settle before the credit-note feed is trusted.** The credit-note intake finds the item in the item master by code and counts a row whose item is missing as "other" (not stored). The S/4 `Product Code` is not in the item master ([Data map — Item](item.md): no S/4 material number). So an S/4 credit-memo row can only resolve if the item master carries the S/4 code. The feed does not guess. Needed: the S/4 material master with the old B1 code (Q18, Q-D7), or an agreed description join. Until then the feed loads invoices and reports credit-memo rows as "not resolved" with their value, so Net is never silently overstated. Recommendation: do not set a month's credit-note coverage from the feed until this gap reads zero rows for that month.

### 1.3 Masters, only to resolve codes
| Need | Service and entity set | Fields | Used for | Status |
|---|---|---|---|---|
| Product type, description, material groups | `API_PRODUCT_SRV`: `A_Product`, `A_ProductDescription`, `A_ProductSalesDelivery` | `Product`, `ProductType`, `BaseUnit`; `ProductDescription` (language EN); `FirstSalesSpecProductGroup` … `FifthSalesSpecProductGroup` | Rows 8–10 of 1.1 when the billing item lacks them; description join to the item master when no S/4 code is there | candidate — verify against $metadata |
| Legacy code on the material | `A_Product` custom field (the group's connector guesses `LegacyB1Code`) | one property | Exact S/4 → `item_code` cross-reference (`item_xref`) | candidate — verify against $metadata |
| Customer name | `API_BUSINESS_PARTNER`: `A_Customer` (`CustomerName`) or `A_BusinessPartner` (`BusinessPartnerFullName`, in use elsewhere in the group) | `Customer`, name | Row 6 of 1.1 | candidate — verify against $metadata |
| Customer sales area | `A_CustomerSalesArea` | `SalesDistrict`, `CustomerGroup`, `SalesGroup` | Rows 14–16 (optional) | candidate — verify against $metadata |
| GSTIN | `A_BusinessPartner` → `to_BusinessPartnerTax`, tax type `IN3`, `BPTaxNumber` (seen in another group portal's code) | GSTIN | `customer_xref` only; not needed for sales | candidate — verify against $metadata |
| Plant | none. `Plant` on the billing item is the 4-digit code; the Plant List in Admin is the authority | — | The group's connector lists `API_PLANT_SRV` as a placeholder guess with no API confirmed; do not read it in v1 | candidate — verify against $metadata |

Product and customer name reads for code resolution are by key and cached by the connector (about 564 distinct products and 92 customers appeared in 16 days at one plant, [register profile](invoice-s4-register.md)); a code not yet cached is fetched once. Apart from the customer master in 1.4, no master is bulk-loaded into the Desk by the feed; the other Admin master intakes stay as they are.

### 1.4 Customer master (business partner) — added 8 Nov 2026, D77
**Why.** Targets and potential are set by state and district ([Geography](geography.md)); actuals reach a state and district through the customer's state and PIN. Those live on the customer, so the connector reads the customer master itself, not only a name per code. Every SAP name below: **candidate — verify against $metadata.** Sources: the group's existing S/4 connector's customer mapping (read-only reference; built on mocks, unverified; a few names there are used in production by another group portal, which is not verification here) and the standard business-partner API as recalled (**Assumed**).

**Service (OData v2):** `API_BUSINESS_PARTNER` — candidate — verify against $metadata.
**Scope:** customers extended to the laminates company code (`SAP_COMPANY_CODE`): read `A_CustomerCompany` (`Customer`, `CompanyCode`) and keep only those customers; customers outside it are dropped and counted. Candidate; the group's connector scopes the same way.
**Read shape:** full read of the in-scope customers, weekly to start (change stamp not assumed), plus by-key reads for any billing customer not in the master (the cache of 1.3). `$top=200` pages; address, tax and sales area through `$expand` where the service allows, else a second read by key. Customer count of the tenant is not known (the B1 sales file has 3,696 customer codes, [Customer](customer.md)); expect a few thousand, about 20 pages per entity set.

| # | OData entity set and field | Canonical field ([Customer](customer.md)) | Desk master column | Rule | Status |
|---|---|---|---|---|---|
| 1 | `A_Customer` `Customer` | `customer_code` | code | Key, trimmed as in 1.1 row 5. If the business partner key differs from `Customer`, use `Customer` | candidate — verify against $metadata |
| 2 | `A_Customer` `CustomerName` (or `A_BusinessPartner` `BusinessPartnerFullName`) | `name` | name | First 60 characters kept | candidate — verify against $metadata |
| 3 | `A_Customer` `CustomerAccountGroup` | none (kept for the partner-type test) | skipped | Only customer account groups are kept; others counted as "not a customer" | candidate — verify against $metadata |
| 4 | `A_CustomerSalesArea` `CustomerGroup` | `customer_group` | group | As the register's `Customer Group` (C1, C2) | candidate — verify against $metadata |
| 5 | `A_BusinessPartner` → `to_BusinessPartnerTax`, `BPTaxType` = `IN3`, `BPTaxNumber` | `gstin` | stored with the master for the B1 ↔ S/4 match | The group's connector guesses a flat `A_Customer` `TaxNumber3`; use it only if the relation is absent | candidate — verify against $metadata |
| 6 | `A_BusinessPartner` → `to_BusinessPartnerAddress` `Region` | `state` → `state_code` | state | S/4 region code; mapped to the GST state code by the geography state table. The group's connector guesses a flat `A_Customer` `Region` | candidate — verify against $metadata |
| 7 | `to_BusinessPartnerAddress` `PostalCode` | `pin` | PIN | 6 digits; anything else stored blank and counted. The group's connector guesses a flat `A_Customer` `PostalCode` | candidate — verify against $metadata |
| 8 | `to_BusinessPartnerAddress` `CityName` | `city` | city | Free text; used by the derived draft only ([Geography](geography.md)) | candidate — verify against $metadata |
| 9 | `to_BusinessPartnerAddress` `District` | `district_text` | district (text) | Optional text; matched to the public district list in the geography master. Whether the field is filled by Virgo is unknown (checklist 21) | candidate — verify against $metadata |
| 10 | `A_CustomerSalesArea` `SalesDistrict` | `sales_district` | sales district | Same value as the register's `Sales District` (ZONE01…). A zone, **not a district**: cross-check of state only | candidate — verify against $metadata |
| 11 | `A_CustomerSalesArea` `SalesGroup`, or the partner-function relation (`to_PartnerFunction`: partner function, personnel number) | `sales_employee_code` | salesperson | The register's Sales Executive is 100% blank, so this may also be blank. The group's connector guesses a flat `SalesEmployee`. Used as a suggestion only, as today | candidate — verify against $metadata |
| 12 | `A_CustomerSalesArea` `CustomerPaymentTerms` | `payment_terms` | terms | As [Customer](customer.md) | candidate — verify against $metadata |
| 13 | `A_Customer` `DeletionIndicator`, `PostingIsBlocked` | `active` | blocked flag | Blocked customers stay in the master, flagged | candidate — verify against $metadata |
| 14 | `A_Customer` custom property for the old B1 card code (the group's connector guesses `LegacyB1Code`) | `legacy_b1_code` | legacy code | Exact B1 ↔ S/4 customer match, better than GSTIN (82.4% overlap, [Customer](customer.md)) | candidate — verify against $metadata |
| 15 | Credit limit | `credit_limit` | limit | **Not read here.** Credit limit probably sits in a separate credit-management API (the group's connector says so); keep it blank until that API is checked | candidate — verify against $metadata |

**Address rule.** A business partner can have several addresses. The Desk needs the one the invoice goes to. Candidate rule: the standard/bill-to address (the address usage or default flag is a name to verify); if several remain, the lowest address number, and the customer is counted under "several addresses". Checklist 21 settles it.

**How it lands.** Rows are passed through the existing customer-master loader as one upload entry labelled "S/4 customer feed" (Undo works as for a file). Requirement for the Full-Stack Engineer: the master is keyed by (`source_system`, `customer_code`) and a load replaces only its own system's rows, because today's Admin intake replaces the whole master per load ([Customer](customer.md)), which would let a B1 file wipe the S/4 customers or the reverse. **Assumed:** B1 history customers not in S/4 stay on the OCRD upload (Q-D13), matched to S/4 by legacy code, then GSTIN. Only the Desk database holds the rows; nothing goes into the repo.


#### 1.4a Built on the mock tenant (D78, 8 Nov): `sapCustomerSync`
Reads, in this order and joined by customer code: `A_CustomerCompany` (filter `CompanyCode eq <company>`; the in-scope test), `A_Customer`, `A_CustomerSalesArea` (first sales area kept, others counted), `A_BusinessPartnerAddress` (lowest `AddressID`; several addresses counted; the bill-to usage test waits for checklist 21), `A_BusinessPartnerTax` (filter `BPTaxType eq 'IN3'`). Each set is paged with `$top=200`, `$orderby`, `$inlinecount` and a count check; no `$expand`. Assumes the address and tax rows carry the customer number as `BusinessPartner` (checklist 21 checks it). **Required** (a GAP blocks the customer read only, never billing): `A_CustomerCompany.Customer, CompanyCode`; `A_BusinessPartnerAddress.BusinessPartner, Region, PostalCode`. **Optional** (no figure depends on it): `A_Customer.CustomerName, CustomerAccountGroup, DeletionIndicator, PostingIsBlocked, LegacyB1Code`; all of `A_CustomerSalesArea` and `A_BusinessPartnerTax` (a missing set is skipped whole); `A_BusinessPartnerAddress.AddressID, CityName, District`. Not read: credit limit (row 15). PIN is staged only when it is 6 digits (else blank and counted). Staged in `sapstage` as `cust_man` and `cust_c_<run>_<n>`.

## 2. Filters
All names in this section: candidate — verify against $metadata.

| Filter | Rule | Why |
|---|---|---|
| Date field | `BillingDocumentDate` (header). Cut-off `ge datetime'2026-10-01T00:00:00'`. Setting `FEED_FROM = 2026-10-01`, never earlier | Equals the register's `Invoice Date` (Assumed; checklist 13). The feed also refuses to write any plant-month before Oct 2026, so B1 history is untouched |
| Company code | `CompanyCode eq '<laminates>'`, setting `SAP_COMPANY_CODE`. Default **1000** (Assumed: the group's existing S/4 connector holds 1000 as the laminates default and a different code for the other business; unverified) | Cuts volume at the source and keeps the other business out |
| Plant scope | Plant List codes 1001–1049 (`business = laminates`). Items with `Plant` ≥ 1050 are counted and skipped; unknown plants are rejected as in the upload | Plant filter is on the item, so it is applied after the read, not in `$filter`. This is the safety net if the company code is shared |
| Sales documents | `BillingDocumentType` in `SALES_TYPES = [F2]` and not cancelled (`BillingDocumentIsCancelled eq false`) | Same as the intake (F2 only) |
| Credit notes | `BillingDocumentType` in `CN_TYPES = [G2, RE]` and not cancelled | The credit-note intake takes any non-F2 type (G2, RE, S1 seen); the feed lists types so debit memos and cancellations are not loaded as credit |
| Cancellation documents | Types S1 (cancels F2) and S2 (cancels a credit memo) are **excluded**, and so are the documents they cancel (`CancelledBillingDocument`, `BillingDocumentIsCancelled`) | Pair rule, below |
| Other types (debit memo L2, order-related F1, pro forma, intercompany) | Not loaded. Counted per type with value and listed in the run report | A type nobody mapped must be visible, never guessed |

**How credit memos and cancellations are told apart.** The test is the type code first, with `SDDocumentCategory` as a cross-check (candidates: M invoice, N invoice cancellation, O credit memo, S credit-memo cancellation, P debit memo; **Assumed** from memory). A credit memo is a document of a credit type that is not itself a cancellation and is not cancelled. A cancellation is a document of a cancellation type; it and the document it cancels are removed together.

**Pair rule, with a switch.** Setting `CANCEL_MODE`:
- `exclude` (default): cancelled F2 and its S1 are both left out. Invoiced and Net are both correct.
- `mirror`: cancelled F2 stays in sales and S1 is loaded as a credit note, which is what the upload does **if** the register keeps cancelled F2 rows. Net is identical in both modes; only the Invoiced figure differs.
Whether the register keeps cancelled rows is not known (Q-D4). Checklist 8 compares one real cancellation against the register and sets the switch.

**Type list.** F2, G2, RE are from the existing register intake and credit-note data map. The tenant's full list is taken from the first read (checklist 7), not assumed.

## 3. Incremental rule
Names: candidate — verify against $metadata.

1. **Change field:** header `LastChangeDate` (the group's connector assumes this name and a date-only type). Cancelling a document, or posting its credit, should change it on both documents (checklist 14).
2. **Watermark:** the largest `LastChangeDate` seen, stored in Script Properties per source (sales, credit). Advanced only after a run with no read error, no count mismatch and no write refusal.
3. **Delta read:** `LastChangeDate ge datetime'<watermark − 1 day>'` and `BillingDocumentDate ge 2026-10-01`, company code filter. Overlap is one day because the stamp is date-only (the group's connector uses 1 day for date-only stamps, 1 hour for timestamps). Re-reads are harmless: replacing is idempotent.
4. **Affected plant-months:** from the delta documents, take each item's `Plant` and the month of `BillingDocumentDate`. A cancellation or credit memo marks the month of **both** the new document and the document it cancels or credits (their dates can fall in different months).
5. **Replace, as an upload does:** for each affected month, re-read the whole month (all days, all pages, header filter above), build the register-shaped rows for every plant, and send them to the intake as one file per month. The intake then replaces **each plant-month it covers** whole, never row by row. Nothing is written until the whole month has been read and its count matches `$inlinecount`. A plant with no document left in that month is still replaced (emptied) only if the month read was complete.
6. **Routine safety re-reads:** each run also re-reads the current month; on days 1–5 it also re-reads the previous month, for back-dated postings. Closed quarters are never re-read (locked; the feed reports the skip).
7. **Held-month guard:** if a replacement would hold fewer lines than the stored plant-month, the intake's confirm rule applies. The feed stops, reports it on the Data Intake card, and a person confirms. The feed never confirms.
8. **First run is a shadow run:** October 2026 is already loaded from register uploads. The first run reads Oct to date, computes plant-month totals (documents, lines, sheets, sq ft, value) and **compares them with the stored ones without writing** (checklist 6). Only a clean comparison, accepted by Vijay, lets the feed replace Oct.
9. **Credit-note coverage:** a month is marked covered by credit notes only after a complete, successful credit read of that month for all plants, and the item gap in 1.2 reads zero. Coverage then drives the Net basis per D40 (every month of the quarter up to today).
10. **Locks and undo:** credit-note month locks (D60) and closed quarters are obeyed. Each feed run is one upload entry labelled "S/4 feed", so Undo works as for a file.

Run frequency: once daily at first; every few hours only after the checklist passes and volumes are measured. Apps Script time-driven triggers run it; one run at a time (lock).

## 4. Paging and volume
**Paging (m8-sap-speed).** A month is read by KEY, not by `$skip`: two one-row calls give the count (`$inlinecount=allpages`) and the first and last `BillingDocument`; the month is cut into up to 4 equal ranges of document numbers (first range no lower bound, last no upper bound) and each range is read in order with `BillingDocument gt <last one read>`, `$orderby=BillingDocument asc`, `$top` = SAP_PAGE_TOP (default 500). One page per range goes out together (`UrlFetchApp.fetchAll`, SAP_CONCURRENCY, default 4). A range ends at an empty page. Documents added, changed or cancelled between pages or runs cannot shift the read; a count that differs at the end is a warning with both numbers, never an error. A refused or timed-out page is halved (500, 250, 125, 62, 50) and the size that worked is remembered (SAP_PAGE_EFF); a server that returns fewer rows than asked (`d.__next`) sets the size to what it returns. Keep `$select` narrow. Retry timeouts, 408, 429 and 5xx with growing waits; never retry 401, 403, 404. Page-size limits and `$inlinecount` support unverified on the real tenant (checklist 15).

**Volume, from the existing uploads (no data stored here).**
| Measure | Value | Source |
|---|---|---|
| One plant (1013), S/4, 4–19 Oct 2026 | 371 invoices, 911 unique lines over 16 invoice dates: **about 23 invoices and 57 lines per day** | [S/4 register profile](invoice-s4-register.md) (2,664 raw rows collapse to 911; the API has no fan-out) |
| Lines per invoice, that plant | 2.5 | same |
| All branches, B1, Sep 2026 (all rows incl. internal transfers) | 36,386 documents, 139,598 lines over 30 days: **about 1,210 documents and 4,650 lines per day**; per branch (42) about 29 documents and 110 lines per day | [Data map — Invoice](invoice.md) |
| Lines per invoice, B1 | 3.8 | same |

Planning figure for all laminate plants: **up to about 1,200 documents and 4,700 lines per day** (upper bound: B1 includes internal transfers, which S/4 may not bill). Plant 1013 is below the B1 branch average. Whether other plants are live on S/4 is open (Q2); credit-memo volume is unknown (none seen).

**Calls.** A daily delta of about 1,200 headers is 3 pages at `$top=500`. A whole-month re-read of all plants is about 36,000 documents: about 74 pages at 500, read 4 at a time, plus cached product and customer lookups (bulk cache calls, parallel batches). Modelled timing for a 108,000-line month is in `build/desk-gas/test/gas-sap-model.mjs`; **real per-call time on the tenant is not yet measured** (checklist 15). A run stops at its 5-minute budget and `sapShadowRunAuto` / `sapSyncAuto` continue it with a one-off trigger; nothing is written until the month is complete.

## 5. Verification checklist (the day the communication user exists)
Do in order. Record each result in [Decisions](../decisions.md) with date and source; presence in `$metadata` is evidence, not the record. Read only; the connector's client sends GET only, and nothing here writes to SAP.

| # | Check | Pass when | If not |
|---|---|---|---|
| 1 | Sign in: GET the service root of `API_BILLING_DOCUMENT_SRV`, `API_PRODUCT_SRV`, `API_BUSINESS_PARTNER` with the user; note the auth method accepted (Basic, OAuth, certificate) | HTTP 200 for each; the user is read-only, and is **not** another portal's user | Fix the arrangement (Q29); change the auth method in the connector |
| 2 | Read `$metadata` of each service; confirm every candidate entity set and property in sections 1 and 3 | Each name listed as present, or replaced by the real one in this file | Mark GAP, update the table, re-plan shape A or B |
| 3 | Count what the user can see: one day, one plant, header count and item count | Non-zero and plausible vs 4 | Role too narrow: ask the arrangement owner |
| 4 | Three invoices from the Oct register upload (plant 1013 and two others): compare line by line | Document, item, date, plant, customer, product, quantity, net all equal | List differences; fix the mapping row |
| 5 | One whole day against a register export of that day, all plants | Documents and lines equal; sheets equal; value equal to the paisa on 99% of documents and within ₹1 on the rest | Differences listed by document; do not go on |
| 6 | Shadow run: Oct to date per plant-month vs stored totals | Documents, lines, sheets, sq ft, value equal per plant-month | Vijay decides per difference; no write until clean |
| 7 | List distinct `BillingDocumentType` and `SDDocumentCategory` since 1 Oct with counts and net value | F2 is the only invoice type; credit types identified; other types named | Update `SALES_TYPES`, `CN_TYPES`; ask Vijay about unknown types |
| 8 | One cancelled F2 and its cancellation document: fields on both; is the cancelled F2 in the register? | Pair found by `CancelledBillingDocument`; register behaviour known | Set `CANCEL_MODE` (`exclude` or `mirror`) |
| 9 | One credit memo: sign of `NetAmount` and quantity, base reference, customer and plant | Absolute value equals the register; base reference field known | Adjust sign rule and base field |
| 10 | Units and currency on laminate lines | `BillingQuantityUnit` is the sheet unit, whole numbers; currency INR | Add a unit rule; flag rows, do not convert silently |
| 11 | Product Type and material groups: values for 20 sold products vs the register (`ZABLAM`…, `DOOR`, `8X4`) | Same text as the register | If codes: find the text entity; else take size from the item master |
| 12 | Scope: distinct `CompanyCode` and `Plant` for a month; which of the 45 laminate plants have documents since 1 Oct | Laminates company code confirmed (default 1000); plants all in 1001–1049 or ≥ 1050 only for the other business; silent plants explained | Change `SAP_COMPANY_CODE` or lean on the plant filter; a plant silent in S/4 but active on B1 goes to Vijay (Q2) |
| 13 | Date meaning: `BillingDocumentDate` vs register `Invoice Date`; the UTC date of the `/Date(ms)/` value | Equal on every document of the day | Switch field or fix the time-zone handling |
| 14 | `LastChangeDate`: exists on header (item?), its type, changes when a document is cancelled or credited (observe known cases; do not create test documents) | Stamp moves on both documents of a pair | Fall back to a full read of the current and previous month each run |
| 15 | Paging and limits: `$inlinecount`, server page cap, `$orderby` on the key, 429 behaviour, seconds per call, calls for the largest day, fit in one Apps Script run, `UrlFetchApp` daily quota | Day read completes inside a run; counts match `__count` | Smaller `$top`, queue by plant or day, lower frequency |
| 16 | Licence: written statement from the SAP partner that read-only API calls by this user are not counted (FUE, digital access) | In writing (Q33) | Stop. The feed does not go live |
| 17 | Credentials: stored in Apps Script Script Properties only (never the sheet, repo or Desk backup) | Confirmed by Vijay | Move them |
| 18 | Credit-note item gap (1.2): count of S/4 credit-memo rows not resolved to an item | Zero for the month, or a rule agreed | Keep credit coverage off for that month |
| 19 | Customer read: count of in-scope customers (company code filter) vs the 92 customers of the register extract | Non-zero, at least those 92; out-of-scope rows counted | Fix the scope relation (row `A_CustomerCompany`) |
| 20 | Customer fields present on the tenant: every row 1–15 of 1.4 | Names listed in `$metadata`; each marked present or replaced by the real one | Mark GAP; the field stays blank and the geography draft says so |
| 21 | Address: for 20 known customers compare `Region`, `PostalCode`, `CityName`, `District` with the customer's real bill-to; count customers with several addresses; share of customers with a 6-digit PIN and with `District` filled (counts only, no values written down) | Address rule picks the bill-to; PIN share known | Change the address rule; PIN share decides whether the derived draft can use PIN ([Geography](geography.md)) |
| 22 | Legacy code and GSTIN: match rate of S/4 customers to the B1 customer list by legacy code and by GSTIN | Match rate known | Keep GSTIN as the key (Assumed) |

After checks 1–22 pass: Vijay approves the first live replace of October; SP Sir is told in the next update. The Data Intake "live feed" card changes from "Not connected" only after that approval.

## Open items
- Customer master (1.4, D77): the Desk needs state and PIN per customer; names are candidates until checklist 20 and 21. Vijay's answers of 8 Nov: the customer master comes from this connector, and no district-to-branch list exists, so [Geography](geography.md) derives a draft from sales history.
- Questions only Vijay can answer are Q29–Q33 in [Open questions](../open-questions.md): communication arrangement and user, API host, IP allow-list, same tenant and company code, licence position.
- Q-D4 (does the register keep credit memos and cancelled invoices) and Q18 (S/4 material master with the old B1 code) decide `CANCEL_MODE` and the credit-note item gap.
- Apps Script sends calls from Google addresses that are not fixed. If SAP requires an allow-list, the feed cannot meet it without a fixed-address route, which is a spend and needs a Principal's OK (Q31).
