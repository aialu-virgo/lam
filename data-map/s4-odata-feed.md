---
title: Data map — S/4HANA OData feed
summary: Read-only OData feed for sales and credit notes from 1 Oct 2026: candidate services and fields mapped to the S/4 register columns and canonical fields, filters, incremental plant-month replace, paging, volume, and the day-one verification checklist.
status: draft
updated: 2026-11-07
related:
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

# S/4HANA OData feed (sales and credit notes)
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
| 6 | customer read (1.3) `CustomerName` | `Sold-to-Party Description` | `customer_name` | First 60 characters kept by the Desk | candidate — verify against $metadata |
| 7 | I `Material` | `Product Code` | `s4_material_no` | Trim leading zeros | candidate — verify against $metadata |
| 8 | product read (1.3) `ProductType` | `Product Type` | `item_type` → product group | ZABLAM, ZCRLAM, ZCBPVC; others counted as "other", not stored | candidate — verify against $metadata |
| 9 | I `AdditionalMaterialGroup3` (or product sales view `ThirdSalesSpecProductGroup`) | `Material Group 3` | `thickness_type` | Text such as DOOR, LAM, COMPACT; if SAP returns a code, a text lookup is needed | candidate — verify against $metadata |
| 10 | I `AdditionalMaterialGroup4` (or `FourthSalesSpecProductGroup`) | `Material Group 4` | `size_ft` | Text `8X4`, `7X3`; a code here breaks sq ft | candidate — verify against $metadata |
| 11 | I `BillingQuantity` | `Invoice Qty` | `qty_sheets` | Unit `BillingQuantityUnit` must be the sheet unit (PC); else flag, do not convert silently | candidate — verify against $metadata |
| 12 | I `NetAmount` | `Total Amount (Item)` | `net_value_inr` | Net of GST; currency `TransactionCurrency` must be INR | candidate — verify against $metadata |
| 13 | H `BillingDocumentType` | `Billing Type` | `source_doc_type` | See Filters | candidate — verify against $metadata |
| 14 | I `SalesDistrict` or customer sales area `SalesDistrict` | `Sales District` | `zone` (via table) | Optional; Desk uses it for zone counts only | candidate — verify against $metadata |
| 15 | — (not read) | `Sales Executive` | `sales_employee_code` | Sent blank, as the register is (Q-D5 open; if answered, customer sales area `SalesGroup` is the candidate) | candidate — verify against $metadata |
| 16 | H `CustomerGroup` | `Customer Group` | `customer_group_code` | Optional; segment meaning open (Q5) | candidate — verify against $metadata |
| 17 | H `DocumentReferenceID` | `ODN` | `official_invoice_no` | Optional; GST invoice number, field location unknown | candidate — verify against $metadata |
| 18 | I `TaxAmount`; pricing elements (India GST conditions, candidate `JOCG`, `JOSG`, `JOIG`) | `CGST Amount`, `SGST Amount`, `IGST Amount` | `cgst_inr`, `sgst_inr`, `igst_inr` | **Not read in v1.** The intake stores net only. Read `TaxAmount` later as a check if wanted | candidate — verify against $metadata |

Columns not read: `Order Creation Date`, `GSTIN`, `State`, `City`, `Price Group(Item)`, plant address columns, `HSN`, licence columns, `Unit Price`, `Total Invoice Amount`, `invqty`, `totinvamt`, `totnetamt`, `Tax Amount` (all unused or duplicates per [Data map — S/4 register](invoice-s4-register.md)).

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

Product and customer reads are by key and cached by the connector (about 564 distinct products and 92 customers appeared in 16 days at one plant, [register profile](invoice-s4-register.md)); a code not yet cached is fetched once. No master is bulk-loaded into the Desk by the feed; the Admin master intakes stay as they are.

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
**Paging.** `$top` and `$skip`, with `$orderby=BillingDocument asc` for stable order; `$inlinecount=allpages` on the first page (`d.__count`) to check the total; follow `d.__next` when the server pages for us; stop on an empty page. Start at `$top=200` headers (about 500 items with `$expand`); keep `$select` narrow to hold the payload small. Retry timeouts, 408, 429 and 5xx with growing waits; never retry 401, 403, 404. All names: candidate — verify against $metadata; page-size limits and `$inlinecount` support unverified (checklist 15).

**Volume, from the existing uploads (no data stored here).**
| Measure | Value | Source |
|---|---|---|
| One plant (1013), S/4, 4–19 Oct 2026 | 371 invoices, 911 unique lines over 16 invoice dates: **about 23 invoices and 57 lines per day** | [S/4 register profile](invoice-s4-register.md) (2,664 raw rows collapse to 911; the API has no fan-out) |
| Lines per invoice, that plant | 2.5 | same |
| All branches, B1, Sep 2026 (all rows incl. internal transfers) | 36,386 documents, 139,598 lines over 30 days: **about 1,210 documents and 4,650 lines per day**; per branch (42) about 29 documents and 110 lines per day | [Data map — Invoice](invoice.md) |
| Lines per invoice, B1 | 3.8 | same |

Planning figure for all laminate plants: **up to about 1,200 documents and 4,700 lines per day** (upper bound: B1 includes internal transfers, which S/4 may not bill). Plant 1013 is below the B1 branch average. Whether other plants are live on S/4 is open (Q2); credit-memo volume is unknown (none seen).

**Calls.** A daily delta of about 1,200 headers is about 6 pages at `$top=200`. A whole-month re-read of all plants is about 36,000 documents, about 180 pages, plus cached product and customer lookups. That may exceed one Apps Script run (6 minutes, **Assumed** limit; check current quotas), so the month read is queued by day and resumed by the next trigger, and nothing is written until the month is complete. The `UrlFetchApp` daily quota and per-call time are measured in checklist 15, not assumed.

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

After checks 1–18 pass: Vijay approves the first live replace of October; SP Sir is told in the next update. The Data Intake "live feed" card changes from "Not connected" only after that approval.

## Open items
- Questions only Vijay can answer are Q29–Q33 in [Open questions](../open-questions.md): communication arrangement and user, API host, IP allow-list, same tenant and company code, licence position.
- Q-D4 (does the register keep credit memos and cancelled invoices) and Q18 (S/4 material master with the old B1 code) decide `CANCEL_MODE` and the credit-note item gap.
- Apps Script sends calls from Google addresses that are not fixed. If SAP requires an allow-list, the feed cannot meet it without a fixed-address route, which is a spend and needs a Principal's OK (Q31).
