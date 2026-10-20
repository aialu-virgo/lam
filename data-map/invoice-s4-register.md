---
title: Data map — Invoice, S/4 sales register
summary: The S/4HANA Public Cloud sales register export (60 columns, plant 1013, 4–19 Oct 2026): every column mapped or unused, fan-out defect, coverage.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/item.md
  - data-map/plant-master.md
  - data-map/customer.md
  - data-map/sales-employee.md
  - data-map/credit-note.md
---

# Invoice — S/4 sales register (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Invoice (S/4HANA column) · **Profiled:** 20 Oct 2026 by script. Column-level B1↔S/4 map and the reconciliation verdict live in [Data map — Invoice](invoice.md).

## Source and export
- **System:** SAP S/4HANA Public Cloud, Fiori "Sales Register" report, "Export" to workbook. Sheet `SAPUI5 Export` (header row 1, 2,664 data rows × 60 columns); sheet `Filter` records the export settings.
- **Export filter (from the `Filter` sheet):** `Plant = 1013`; created 20 Oct 2026 10:49 UTC by a Virgo user. So the file holds **one plant only**. All plants need either no plant filter or one export per plant.
- **Grain:** one row per billing item **repeated** (see fan-out). 911 unique lines in 371 invoices; 92 customers; 564 products.
- **Documents:** billing type `F2` only (invoices). No credit memos in the file; whether the register shows them at all is open (Q-D4).
- **Laminates:** `Product Type` ZABLAM (1,605 raw rows) and ZCRLAM (1,045) are laminates; ZCBPVC (14) is PVC, excluded. After de-duplication 904 laminate lines, 7 PVC.

## Fan-out defect (must be handled at intake)
Each (`Invoice Document Number`, `Invoice Document item`) appears 1–8 times (656 keys repeated; 1,753 surplus rows). Rows differ **only** in `Price Group(Item)` (31 values). Raw sums overstate value and sheets about 2.7×.
- **Rule:** keep one row per key; `Price Group(Item)` is not mapped (use item master).
- **Validation after de-dup:** `Tax Amount` equals the sum of line CGST+SGST+IGST on 100% of docs; `totnetamt` equals the sum of line net values within ₹1 on 99.5% of docs (rounding).

## Columns
Null % over 2,664 raw rows; distinct counts raw.

| # | Column (exact) | Type | Null % | Distinct | Canonical field / use |
|---|---|---|---|---|---|
| 1 | `Invoice Document Number` | text, 8 digits ("900…") | 0 | 371 | `source_doc_no`. Mandatory. |
| 2 | `ODN` | text `F` + 11 digits | 0 | 371 | `official_invoice_no` (GST invoice number). One per document. Optional. |
| 3 | `Invoice Document item` | int 10–190 step 10 | 0 | 19 | `source_line`. Mandatory. |
| 4 | `Invoice Date` | datetime | 0 | 16 | `doc_date`. Range 2026-10-04 to 2026-10-19. Mandatory. |
| 5 | `Plant` | text, 4 digits | 0 | 1 (1013) | `plant_code`. Mandatory. |
| 6 | `Plant Description` | text | 0 | 1 | **Unused** (Plant List is the home). Matches Plant List name. |
| 7 | `Plant Region` | text, 2 digits | 0 | 1 | **Unused** (state code of the plant). |
| 8 | `Plant Region Description` | text | 0 | 1 | **Unused.** |
| 9 | `Order Creation Date` | datetime | 0 | 16 | `order_date` (for O2D later). Equals invoice date on 98%; 13 lines differ. Optional. |
| 10 | `PO Number` | text | 0 | 17 | **Unused.** Free text typed by users (names); never loaded. |
| 11 | `Sold-to-Party Number` | text, 8 digits ("5000…") | 0 | 92 | `customer_code`. Mandatory. |
| 12 | `Sold-to-Party Description` | text | 0 | 92 | `customer_name`. |
| 13 | `Sold-to-Party GSTIN` | text, 15 chars | 0 | 91 | `customer_gstin`. 82.4% of distinct values also present in the B1 file (Assumed cross-system key). |
| 14 | `Sales District` | text ZONE01, ZONE03 | 0 | 2 | `zone` via table (ZONE01 → Zone 1, …). Follows the customer's state, not the plant. |
| 15 | `State` | text, 2 digits (GST state code) | 0 | 4 | `customer_state` via GST state-code table (Assumed standard codes). |
| 16 | `City` | text, 3 chars ("C40") | 0 | 31 | **Unused.** S/4 city key, no name. |
| 17 | `Sales Executive` | — | **100** | 0 | `sales_employee_code`. **Empty.** Cannot be used. |
| 18 | `Area Sales Manager` | — | 100 | 0 | Empty. Unused. |
| 19 | `Branch Manager` | — | 100 | 0 | Empty. Unused. |
| 20 | `HOD` | — | 100 | 0 | Empty. Unused. |
| 21 | `HSN` | text, 8 digits | 0 | 2 | **Unused.** |
| 22 | `Product Type` | text | 0 | 3 | `item_type`; laminates filter (ZABLAM, ZCRLAM). |
| 23 | `Price Group(Item)` | text, 2 chars | 0 | 31 | **Unused.** Causes the fan-out. |
| 24 | `Product Code` | text, 8 digits ("32…", "33…", "34…") | 0 | 564 | `s4_material_no`; resolves to `item_code` by description (no S/4 code in item master). |
| 25 | `Product Description` | text | 0 | 564 | Join key to item master `Item Description` (100% found; 3 ambiguous). |
| 26 | `Material Group 1` | text | 0.11 | 405 | **Unused.** Design number. |
| 27 | `Material Group 2` | text | 0.11 | 73 | **Unused.** Finish. |
| 28 | `Material Group 3` | text | 0.11 | 5 | `thickness_type` (LAM, MICA, DOOR, PVC, LINER). Cross-check on the laminates filter. |
| 29 | `Material Group 4` | text `AxB` feet | 0.11 | 2 | `size_ft` (8X4, 7X3) for sq ft. |
| 30 | `Material Group 5` | text thickness mm | 0.11 | 5 | **Unused.** |
| 31 | `Unit Price` | number | 0 | 248 | **Not a unit price.** Equals the line net value (identical to cols 40 and 41 on every row). **Unused**; use col 40. |
| 32 | `Invoice Qty` | int | 0 | 21 | `qty_sheets`. Range 1–58. Mandatory. |
| 33 | `CGST %` | int | 0 | 2 | `gst_rate_pct` part (9 or 0). |
| 34 | `CGST Amount` | number | 0 | 218 | `cgst_inr`. |
| 35 | `SGST %` | int | 0 | 2 | Part of rate (9 or 0). |
| 36 | `SGST Amount` | number | 0 | 218 | `sgst_inr`. |
| 37 | `IGST %` | int | 0 | 2 | Rate (18 or 0). |
| 38 | `IGST Amount` | number | 0 | 31 | `igst_inr`. |
| 39 | `Tax Amount` | number | 0 | 238 | **Unused.** Document-level total, repeated on each line. |
| 40 | `Total Amount (Item)` | number | 0 | 248 | `net_value_inr`: line net of GST. Mandatory. |
| 41 | `Total Invoice Amount` | number | 0 | 248 | **Unused.** Same as col 40 (line net), not the invoice total. |
| 42 | `Reconcilation Account` (sic) | — | 100 | 0 | Empty. Unused. Would carry the internal-transfer signal if filled. |
| 43 | `Reconcilation Account (Description)` | — | 100 | 0 | Empty. Unused. |
| 44–51 | `EPCG Licence Number`, `PCG Licence Date`, `Advance Licence Number`, `Advance Licence Date`, `Marine Policy Number`, `Marine Policy Date`, `LUT Number`, `LUT Date of Filling` | — | 100 | 0 | Export-only fields, all empty. Unused. |
| 52 | `Address` | text | 0 | 1 | **Unused.** Address id of the plant. |
| 53 | `Billing Type` | text | 0 | 1 (F2) | `source_doc_type` check: F2 = invoice. Credit memo types would be rejected here until the credit-note map is built. |
| 54 | `Customer Group` | text C1, C2 | 0 | 2 | `customer_group_code`. Candidate for customer segment (Q5); meaning of C1/C2 unconfirmed. |
| 55 | `invqty` | int | 0 | 21 | **Unused.** Duplicate of `Invoice Qty` on every row. |
| 56 | `Postal Code` | text | 0 | 1 | **Unused.** Plant postal code. |
| 57 | `Street` | text | 0 | 1 | **Unused.** Plant address. |
| 58 | `Street 2` | text | 0 | 1 | **Unused.** Plant address. |
| 59 | `totinvamt` | int | 0 | 1 | **Unused.** Always 0. |
| 60 | `totnetamt` | number | 0 | 238 | **Unused.** Document-level net total, repeated per line. Used only as a validation total. |

## Validation
- Reject: `Billing Type` not F2; `Plant` not in Plant List; `Invoice Qty` ≤ 0; missing `Product Code`; invoice date outside the uploaded period.
- De-duplicate on (`Invoice Document Number`, `Invoice Document item`) before loading; report the number of surplus rows (1,753 here) as a warning, not an error.
- Warn: `Sales Executive` blank (always blank here, so salesperson-level S/4 numbers show "unassigned"); product description not in item master; 3 lines with blank `Material Group 3`.
- Check: line CGST+SGST+IGST ≈ 18% of `Total Amount (Item)` (holds 99.2% within rounding; a few lines at 18.3–18.5% from rounding on small values).

## Coverage (12 quarters)
Dates are 4–19 Oct 2026; by script, per FY quarter.

| Quarter | Raw rows | Unique lines | Status |
|---|---|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | 0 | 0 | missing (S/4 holds no history in this file) |
| Q3 FY27 (current, Oct–Dec 2026) | 2,664 | 911 | **partial**: 16 days (4–19 Oct), plant 1013 only |

**Result:** the S/4 file adds one plant for half of one month. It is not history. Whether other plants went live on S/4, and from which date, is open (Q2).

## Open items
- **Q-D4 (Vijay):** export all plants (remove `Plant = 1013`), and confirm that credit memos appear in the Sales Register (billing types other than F2). Recommendation: one export per week, no plant filter, include credit memos.
- **Q-D5 (Vijay):** `Sales Executive` is blank; where does S/4 hold the salesperson? Recommendation: add the sales-employee / partner-function column (VKGRP or partner SP) to the register, or export the customer's sales area.
