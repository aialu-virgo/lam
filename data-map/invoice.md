---
title: Data map — Invoice
summary: Invoice lines from B1 "Combine Sale" (41 columns, Sep 2026 only) and the S/4 sales register: columns, laminates filter, B1↔S4 parity, validation, coverage.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice-s4-register.md
  - data-map/item.md
  - data-map/plant-master.md
  - data-map/sales-employee.md
  - data-map/customer.md
  - data-map/credit-note.md
  - data-map/sales-order.md
  - data-map/delivery.md
  - data-map/warehouse.md
  - data-map/receivable.md
  - data-map/collection.md
  - open-questions.md
  - design/check-rules.md
---

# Invoice (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Invoice · **Profiled:** 20 Oct 2026 by script on the file Vijay uploaded (no data stored here).

## Source and export
- **B1 file:** "Combine Sale" workbook, sheet `DATA`, header on row 1, 139,598 data rows × 41 columns. Name ends 2026-09-30. One row per invoice line (OINV/INV1 style) with the header fields repeated. Saved query name, who runs it and how often: open ([Open questions](../open-questions.md) Q1).
- **S/4 file:** see [Data map — Invoice, S/4 sales register](invoice-s4-register.md).
- **Content:** only GST tax invoices. **No credit notes** (no negative quantity or value, one invoice type). Returns appear only as a per-line `ReturnQty` column, see Returns below.
- **Canonical target:** `invoice_line` in [Canonical data model](../design/canonical-data-model.md).

## What is in the file (counts)
| Cut | Rows | Docs |
|---|---|---|
| All rows | 139,598 | 36,386 |
| Internal stock transfers (flag below) | 19,354 | 1,294 |
| External rows | 120,244 | 35,092 |
| External, item category = decorative laminate(s) | 114,229 | 33,683 |
| External, decorative laminate door | 2,738 | 1,376 |
| External, PVC sheet / compact board / non-product | 2,996 / 75 / 206 | — |

Other product lines (ACP, aluminium, MDF, TAS) do **not** appear in this file; they appear only in the item master, plant list and employee master.

## Laminates filter
- **Rule (decided by Vijay, 20 Oct 2026 — [Decisions](../decisions.md) D6):** on `item_category = upper(trim(Catagory))`, four product groups are in the Desk: Laminate (`DECORATIVE LAMINATE(S)`), Door (`DECORATIVE LAMINATE(S) DOOR`), PVC sheet (`PVC SHEET`) and Compact board (compact board / compact laminates). Base paper, consumables, scrap, raw material and blank category → excluded from the Desk, kept in the upload record.
- **Why this column:** `Catagory` (sic) equals the item master `Item Category` for every matched row; the item master is the authority. Spelling and case vary (18 raw values), so normalise before matching. 108 rows have a blank category because the item is not in the FG item master.
- **S/4 equivalent:** `Product Type` ZABLAM or ZCRLAM = laminate; ZCBPVC = PVC sheet (included). `Material Group 3` (LAM, MICA, DOOR, PVC, LINER) agrees.

## Internal stock transfers (not sales)
- **Rule (Assumed):** `is_internal_transfer` = `AcctName` is "Sales GST - Stock Outward" (`SaleAcctCode` 41111002), **or** `Zone` is BRANCH or FACTORY (any case).
- **Evidence:** 19,354 rows flagged; 100% of them have "VIRGO" in `CardName`; 19,331 on the stock-outward account, 17,449 in zone BRANCH/FACTORY, 17,426 on both. Without the flag, branch-to-branch transfers would be counted as sales (13.9% of rows).
- Not in the S/4 register: it has no account column, so the flag cannot be derived there. All 92 S/4 customers are external by name (Assumed).

## Columns (B1 "Combine Sale")
Types are what the cells hold. Null% over 139,598 rows. Distinct counts are file-wide.

| # | Column (exact) | Type | Null % | Distinct | Canonical field / use |
|---|---|---|---|---|---|
| 0 | `10` (header cell holds this number, not a name) | int | 0 | 9,210 | **Unused.** Row serial that restarts each day (max 9,211). |
| 1 | `BPLId` | int | 0 | 42 | `b1_bpl_id`; range 1–66. **Not** the plant code (no fixed offset). |
| 2 | `BPLName` | text | 0 | 42 | `plant_code` by exact match to Plant List name: 42 of 42 match. Mandatory. |
| 3 | `Salesemployee` | text | 0 | 309 | `salesperson_name_raw`. 67 values carry a " - <branch>" suffix. Only 44% of rows match an employee-master full name. SlpCode missing (gap). |
| 4 | `Invoice Type` | text | 0 | 2 | `invoice_type`. "Gst Tax Invoice" except 1 row "z" (reject). |
| 5 | `Place of Supply` | text | 0.002 | 27 | `place_of_supply` (state name). 3 blank, 2 junk values ("z", "zz"). |
| 6 | `DocDate` | date, mixed | 0 | 30 | `doc_date`. **See Date defect below.** Mandatory. |
| 7 | `TaxDate` | date, mixed | 0 | 30 | **Unused.** Identical to `DocDate` on every row. |
| 8 | `docnum` | int, 9 digits | 0 | 36,386 | `source_doc_no`. Range 270309495–276401755; every value starts "27". Mandatory. |
| 9 | `billNo` | text/int | 99.58 | 182 | **Unused.** Free-text manual reference, almost always blank. |
| 10 | `CardCode` | text `VRGLCU` + 6 digits | 0 | 3,696 | `customer_code`. Mandatory. |
| 11 | `CardName` | text | 0 | 3,697 | `customer_name`. |
| 12 | `Zone` | text | 11.65 | 30 raw | `zone` after normalising to ZONE1–ZONE5, BRANCH, FACTORY, ACP. 30 spellings of ~8 values. |
| 13 | `ItemCode` | text `FG` + 5 digits | 0 | 6,504 | `item_code`. 99.1% of distinct codes are in the item master; 309 rows are not (materials). Mandatory. |
| 14 | `Dscription` (sic) | text | 0 | 6,499 | **Unused** (item master is the home). 99.78% equal master description. |
| 15 | `Thickness` | text "0.80 MM" | 0.24 | 18 | **Unused** (item master). Used only as fallback attribute. |
| 16 | `Thickness Type` | text/number | 0.26 | 36 | **Unused.** Mixed codes (LAM, MICA, DOOR, LINER, PVC, numbers). |
| 17 | `Size` | text `AxB` feet | 0.26 | 14 | `size_ft` for sq ft. 8X4 and 7X3 cover 99.9% of laminate rows; "8x4" lower-case 20 rows. |
| 18 | `Finish` | text/int | 0.37 | 326 | **Unused** now (design attribute). |
| 19 | `Brand` | text | 0 | 15 | `brand`. Optional product-group split. |
| 20 | `Price` | number | 0 | 2,759 | **Unused for value.** Unit net price per sheet. `Price × Quantity` differs from `LineTotal` on 97 rows; `LineTotal` wins. |
| 21 | `Quantity` | int (1 float) | 0 | 839 | `qty_sheets` (unit Pcs). Range 1–30,330; no negatives, no zeros. Mandatory. |
| 22 | `HSN` | text | 0.02 | 39 | **Unused.** |
| 23 | `GST RATE` | int | 0 | 3 | `gst_rate_pct` (18, 5, 0). |
| 24 | `ReturnQty` | int | 0 | 32 | `return_qty_sheets` (information). 193 lines > 0; 181 equal the line qty. `LineTotal` is **not** reduced by it. |
| 25 | `BILL GSTIN` | text, 15 chars | 0.27 | 3,625 | `customer_gstin`. Cross-system customer key (Assumed). |
| 26 | `GST RATE` (second copy, header repeats) | int | 0 | 3 | **Unused.** Identical to column 23. |
| 27 | `LineTotal` | number | 0 | 21,633 | `net_value_inr`: line value **net of GST**. Mandatory. |
| 28 | `CGST_Amt` | number | 0 | 11,265 | `cgst_inr`. |
| 29 | `SGST_Amt` | number | 0 | 11,265 | `sgst_inr`. |
| 30 | `IGST_Amt` | number | 0 | 12,351 | `igst_inr`. |
| 31 | `Total Value` | number | 0 | 21,844 | `gross_value_inr` = `LineTotal` + CGST + SGST + IGST (holds on 100% of rows). |
| 32 | `DocTotal` | number | 0 | 13,625 | **Unused.** Header total repeated on each line, whole rupees. |
| 33 | `WTAmount` | int | 0 | 1 | **Unused.** Always 0. |
| 34 | `Catagory` (sic) | text | 0.08 | 18 | `item_category` (laminates filter). |
| 35 | `Price Group` | text | 0.32 | 232 | **Unused** (item master `Price Group Name`). |
| 36 | `CITY` | text | 0.01 | 748 | `customer_city` (free text, messy). |
| 37 | `State` | text | 0.01 | 26 | `customer_state`. |
| 38 | `SaleAcctCode` | int and text mixed | 0 | 12 | `sale_account_code`. 12,302 cells are text, same block as the missing flag in col 40. Parse as text. |
| 39 | `AcctName` | text | 0 | 7 | `sale_account_name` (internal-transfer flag). |
| 40 | (no header) | text "Y" | 8.81 | 1 | **Unused.** "Y" on 127,297 rows; blank on one contiguous block of 12,301 rows (25–27 Sep, 41 plants), which also holds the text-typed account codes. Meaning unknown, see Q-D6. |

## Date defect (must be handled at intake)
- `DocDate` holds two kinds of cell: 51,016 real dates and 88,582 text values "dd/mm/yyyy".
- All 51,016 real dates have day = 9 and month 1–12; all 88,582 text values are 13–30 September. Read together, the real dates are **day and month swapped** (the export opened dd/mm text as mm/dd). Swapped back, the file spans 1–30 Sep 2026, every day present, Sundays thin.
- **Intake rule (Assumed):** when a file mixes real-date cells and dd/mm/yyyy text, swap day and month on the real-date cells, show the resulting first and last date at upload, and ask the uploader to confirm. Better fix: Vijay exports `DocDate` as text `yyyy-mm-dd`.

## Value, quantity and returns
- **Value:** canonical `net_value_inr` = `LineTotal` (net of GST). Verified: gross − tax = net on 100% of rows; GST is 18% on 138,659 rows, 5% on 38, 0% on 901.
- **Sheets:** `Quantity`; unit Pcs for 116,965 of 116,967 laminate rows (2 rows have no item-master unit).
- **Sq ft:** `qty_sheets × length × width` of `Size` (feet; mm sizes ÷ 304.8). Parse succeeds on 99.999% of laminate rows (1 blank). Fallback: item master `Size` (no extra rows recovered).
- **Returns:** invoices only; no credit-note rows. `ReturnQty` totals 0.13% of laminate sheets. Canonical sales are invoiced sheets and value; returns come from the credit-note feed once exported ([Data map — Credit note](credit-note.md)). `ReturnQty` is stored for information and not netted (Assumed; keeps B1 and S/4 on the same basis).
- **Header totals:** on 570 docs (1.6%) `DocTotal` exceeds the sum of line gross by more than ₹5 (header-level charges not in the line export, Assumed). Not used.

## B1 ↔ S/4HANA column-level map (acceptance check 4)
"Same numbers" means: derive the same canonical value from each source for the same documents. Parity is **Yes** when both exports carry the inputs.

| Canonical field | B1 column | S/4 register column | Same rule? |
|---|---|---|---|
| `source_doc_type` | constant `INV` | constant `INV` (Billing Type `F2`) | Yes |
| `source_doc_no` | `docnum` | `Invoice Document Number` (8 digits, "900…") | Yes (different numbering) |
| `source_line` | **none** (gap) | `Invoice Document item` (10, 20 … 190) | **No.** B1 needs `LineNum`. Until then B1 line = order within doc (synthetic, Assumed) |
| `doc_date` | `DocDate` (fix swap) | `Invoice Date` | Yes |
| `plant_code` | `BPLName` → Plant List | `Plant` (4 digits) | Yes |
| `customer_code` | `CardCode` | `Sold-to-Party Number` | Codes differ; join on GSTIN (82.4% of S/4 GSTINs also in B1; Assumed) |
| `customer_gstin` | `BILL GSTIN` | `Sold-to-Party GSTIN` | Yes |
| `item_code` | `ItemCode` (FG#####) | `Product Code` (8 digits, "32…") | **Needs cross-reference.** Item master has no S/4 code; descriptions match 100% (3 of 564 ambiguous) |
| `sales_employee_code` | `Salesemployee` (name only) | `Sales Executive` — **100% blank** (also ASM, Branch Manager, HOD) | **No.** Not derivable from S/4 file |
| `qty_sheets` | `Quantity` | `Invoice Qty` (= `invqty`, integers) | Yes |
| `qty_sqft` | `Quantity` × `Size` | `Invoice Qty` × `Material Group 4` / item-master size | Yes, same item master |
| `net_value_inr` | `LineTotal` | `Total Amount (Item)` | Yes after de-duplication (below). Same basis (net of GST) |
| `cgst_inr`, `sgst_inr`, `igst_inr` | `CGST_Amt`, `SGST_Amt`, `IGST_Amt` | `CGST Amount`, `SGST Amount`, `IGST Amount` | Yes |
| `gross_value_inr` | `Total Value` | not exported; net + 3 taxes | Yes (computed) |
| `zone` | `Zone` (30 spellings) | `Sales District` (ZONE01, ZONE03) | Mapping table needed; different meaning (S/4 follows customer state) |
| `is_internal_transfer` | `AcctName` / `Zone` | not derivable | **No** |
| `return_qty_sheets` | `ReturnQty` | none | **No** (credit notes pending) |

**S/4 traps handled in the map:**
- `Unit Price`, `Total Amount (Item)` and `Total Invoice Amount` hold the **same number, the line net value**, not a unit price (identical on 100% of rows). Use `Total Amount (Item)`.
- `Tax Amount` and `totnetamt` are **document-level** and repeat per line; do not sum them. `totinvamt` is always 0.
- Each invoice line repeats 1–8 times, differing only in `Price Group(Item)`. De-duplicate on (`Invoice Document Number`, `Invoice Document item`): 2,664 rows → 911 lines. Summing raw rows overstates value and quantity about 2.7×.

## Reconciliation verdict
- **Derivable from both:** sheets, sq ft and net value in ₹ (net of GST), per plant, per date, per customer (via GSTIN) and per item (via description), provided S/4 rows are de-duplicated.
- **Not derivable from S/4 as exported:** salesperson, internal-transfer flag, returns, invoice line for B1.
- **Not testable yet:** the files share **no plant and period** (B1 is Sep 2026 across 42 plants; S/4 is 4–19 Oct 2026 for plant 1013 only). Check 4 cannot be run on real data until one plant-period exists in both. Same-description net price per sheet for plant 1013 agrees with B1 (median ratio 1.00 across 344 items, Assumed as evidence of same basis).

## Validation (entity-specific)
Shared checks live in [Check rules](../design/check-rules.md).
- Mandatory: `BPLName`, `DocDate`, `docnum`, `CardCode`, `ItemCode`, `Quantity`, `LineTotal`.
- Reject: `Invoice Type` not "Gst Tax Invoice" (1 row); `Quantity` ≤ 0 (0 rows); `BPLName` not in Plant List (0 rows); doc date outside the uploaded period.
- Warn: `ItemCode` not in item master (309 rows, all non-product); `Place of Supply` junk (2); `Size` unparseable (1); gross ≠ net + taxes beyond ₹1 (0).
- Duplicate key (`docnum`, `ItemCode`): 0 duplicates in this file. Without `LineNum` a doc with the same item twice would be wrongly rejected; add `LineNum`.
- One document appears in both the main block and the blank-flag block (238 blank-block rows, split lines); no duplicate keys.

## Coverage (12 quarters)
Script count by `doc_date` after the date fix. FY Apr–Mar; Q1 = Apr–Jun. Rows are B1 all rows / laminate external rows. Status: loaded = whole quarter, partial = some months or plants, missing = no rows.

| Quarter | Dates | B1 rows | B1 laminate external | Status |
|---|---|---|---|---|
| Q3 FY24 | Oct–Dec 2023 | 0 | 0 | missing |
| Q4 FY24 | Jan–Mar 2024 | 0 | 0 | missing |
| Q1 FY25 | Apr–Jun 2024 | 0 | 0 | missing |
| Q2 FY25 | Jul–Sep 2024 | 0 | 0 | missing |
| Q3 FY25 | Oct–Dec 2024 | 0 | 0 | missing |
| Q4 FY25 | Jan–Mar 2025 | 0 | 0 | missing |
| Q1 FY26 | Apr–Jun 2025 | 0 | 0 | missing |
| Q2 FY26 | Jul–Sep 2025 | 0 | 0 | missing |
| Q3 FY26 | Oct–Dec 2025 | 0 | 0 | missing |
| Q4 FY26 | Jan–Mar 2026 | 0 | 0 | missing |
| Q1 FY27 | Apr–Jun 2026 | 0 | 0 | missing |
| Q2 FY27 | Jul–Sep 2026 | 139,598 | 116,967 | **partial**: September only (1 of 3 months), 41 of 45 laminate-business plants |
| Q3 FY27 (current) | Oct–Dec 2026 | 0 | 0 | B1: none; S/4 plant 1013 only, see [S/4 register](invoice-s4-register.md) |

**Result:** 0 of 12 history quarters are complete; 11 are missing. No QoQ figure can be trusted until Jul–Aug 2026 and 10 earlier quarters are exported (Q-D2). Plants with no row in Sep 2026: 1006, 1012, 1027 (and 1 B1 branch with no laminate rows).

## Open items
- **Q-D1 (Vijay): answered 20 Oct** — Door, PVC sheet and compact board are all in, each its own product group ([Decisions](../decisions.md) D6).
- **Q-D2 (Vijay):** 11 history quarters and Jul–Aug 2026. Recommendation: one B1 query, doc date 1 Oct 2023 to 31 Aug 2026, in monthly files. Add `LineNum`, `SlpCode`, `WhsCode`, `BaseEntry`.
- **Q-D3 (Vijay):** export `DocDate` as text `yyyy-mm-dd`; recommended.
- **Q-D6 (Vijay):** what is the unnamed last column and the 12,301-row blank block? Recommendation: ignore the column.
