---
title: Data map — Item
summary: Item master (sheet FG, 23,490 items, as on 30 Sep 2026): columns, laminates filter, sq ft source, B1↔S4 gap (no S/4 material number).
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/stock.md
  - data-map/sales-order.md
---

# Item (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Item · **Profiled:** 20 Oct 2026 by script.

## Source and export
- **File:** "Item master data as on 2026-09-30", workbook sheet `FG`, header row 1, 23,490 items × 27 columns. Described by Vijay as common to B1 and S/4.
- **Object:** B1 OITM (with item group OITB and UDFs for factory, finish, thickness, size, price group, design, brand, SKU). Saved query name, owner and frequency open (Q1).
- **Snapshot, not history:** one row per item as of 30 Sep 2026. "Production Date" (23 Feb 2022 → 25 Sep 2026) and "Date of Update" (20 Aug 2022 → 29 Sep 2026) are creation and edit dates, not sales dates.
- **No S/4 material number.** Nothing in the file links a B1 `FG#####` code to the S/4 `Product Code` ("32…" 8 digits). See B1 ↔ S/4.

## What is in the file (counts)
| Cut (item category, trimmed, case-insensitive) | Items |
|---|---|
| Decorative laminate(s) | 16,631 |
| Decorative laminate door | 1,732 |
| PVC sheet | 880 |
| Compact board / compact laminates | 613 |
| Non-product: ACP (3,383), cladding, edge band, film, consumables, blank (90) | 3,634 |

Item category has 21 raw spellings. Brand: 25 values. Active "Y" 23,121, "N" 369.

## Laminates filter
Same rule as [Data map — Invoice](invoice.md): normalised `Item Category` = decorative laminate(s) → Laminate; "… door" → Door (Assumed included); everything else excluded. The item master is the authority for the category of a B1 sales line (equals `Catagory` on every matched sales row). ACP items (3,383) are in this file but never in the sales files.

## Columns
| # | Column (exact) | Type | Null % | Distinct | Canonical field / use |
|---|---|---|---|---|---|
| 1 | `Item No.` | text `FG` + 5 digits (1 item `FG` + 7) | 0 | 23,490 | `item_code`, key. Mandatory, unique (holds). |
| 2 | `Item Description` | text | 0.004 | 23,119 | `item_description`; join key to S/4 `Product Description`. 175 descriptions are shared by more than one item. |
| 3 | `Foreign Name` | text | 0.33 | 22,929 | **Unused.** Copy of description. |
| 4 | `Inventory UoM` | text | 5.78 | 9 | `base_uom`. Pcs/PCS 21,676, SQM 356, Mtr 74, Nos 17, Pac 4, SQF 3, KGS 2, Grms 1. Normalise case. Laminates: 18,345 Pcs, 12 blank. |
| 5 | `Sales Item` | Y/N | 0 | 2 | `is_sales_item`. Y 23,147. |
| 6 | `Purchasing Item` | Y/N | 0 | 2 | **Unused.** |
| 7 | `Inventory Item` | Y/N | 0 | 2 | **Unused** (stock entity will need it). |
| 8 | `Item Group` | int | 0 | 4 | **Unused.** 101 Finished Goods (23,459), 100, 141, 102. |
| 9 | `GroupName` | text | 0 | 4 | **Unused.** |
| 10 | `Production Date` | text dd/mm/yyyy | 0 | 668 | `created_on`. Text, not date cells. |
| 11 | `Date of Update` | text dd/mm/yyyy | 0 | 723 | `updated_on`. Text. |
| 12 | `Active` | Y/N | 0 | 2 | `active`. |
| 13 | `Hsn` | text | 0.13 | 25 | **Unused.** |
| 14 | `Factory` | text | 0.91 | 36 | `source_factory`. Optional (dispatch plant hint). |
| 15 | `Finish` | text | 9.62 | 552 | `finish`. |
| 16 | `Thickness Type` | text | 0.89 | 170 | `thickness_type`. |
| 17 | `Thickness` | text "1.00 MM" | 1.25 | 153 | `thickness_mm` (parse the number). |
| 18 | `Size` | text `AxB` (feet, or mm such as 3660X1220) | 0.61 | 368 | `size_ft` → `sqft_per_sheet`. Parses on 99.92% of laminate items; mm values ÷ 304.8. |
| 19 | `Price Group Name` | text | 5.72 | 870 | `price_group_name`. Candidate product-group level (Assumed: group = brand × thickness × finish family). |
| 20 | `Item Category` | text | 0.38 | 21 | `item_category`; laminates filter. |
| 21 | `Sub Group` | text | 99.87 | 3 | **Unused.** Only "… RM" on 30 raw-material rows. |
| 22 | `Price Group Code` | text | 6.47 | 721 | `price_group_code`. Not the 2-letter S/4 `Price Group(Item)`. |
| 23 | `IGST` | text | 0.16 | 11 | **Unused.** Tax code with typos ("IST18", "IGT18", "18%"). |
| 24 | `CGSG` (sic) | text | 0.17 | 10 | **Unused.** Same. |
| 25 | `Design` | text | 1.40 | 4,917 | `design_no`. Optional. |
| 26 | `Brand` | text | 0 | 25 | `brand`. |
| 27 | `SKU` | text | 8.30 | 18,223 | **Unused.** Not the S/4 product code (0% match). |

## B1 ↔ S/4HANA mapping
| Canonical field | B1 (OITM) | S/4 (MARA/MAKT) | Status |
|---|---|---|---|
| `item_code` | `Item No.` | `Product Code` in the sales register (MATNR, 8 digits) | **Gap.** Item master has no MATNR. |
| `item_description` | `Item Description` | `Product Description` | 100% of 564 sold S/4 descriptions found; 3 are shared by two items (ambiguous). |
| `item_category` | `Item Category` | `Product Type` (ZABLAM, ZCRLAM, ZCBPVC) | Mapped by table, see invoice map. |
| `thickness_type`, `size_ft`, `thickness_mm` | `Thickness Type`, `Size`, `Thickness` | `Material Group 3`, `4`, `5` | Same values on sold items. |
| `design_no`, `finish` | `Design`, `Finish` | `Material Group 1`, `2` | Same. |
| `brand` | `Brand` | brand is the last word of `Product Description` | Derive. |

**Recommendation (Q-D7):** ask Vijay for the S/4 material master export (Product, Product Description, Old Material Number, Product Type, Material Group 1–5, Base Unit). If "Old Material Number" holds the B1 `FG` code, the cross-reference is exact; otherwise keep the description join and flag the 3 ambiguous items for manual choice in Admin.

## Validation
- Mandatory: `Item No.`; key unique (holds on 23,490).
- Warn: laminate item without a parseable `Size` (0.08% of laminate items) or `Inventory UoM` not Pcs (17 laminate items); duplicate descriptions (175 groups).
- Normalise: case on category, UoM, brand; dd/mm/yyyy text to date; ignore tax-code columns.
- A sales line whose item is missing from this file is a warning (309 B1 rows, all non-product).

## Coverage (12 quarters)
Not a time series. One snapshot dated 30 Sep 2026 covers every sold B1 laminate item (all laminate lines resolve; 99.1% of distinct sold B1 items resolve overall). Items sold in the earlier 11 missing quarters but since deleted would be missing: unknown until history arrives.

| Quarter | Status |
|---|---|
| Q3 FY24 to Q1 FY27 | not applicable (snapshot); items inactive since then may be absent |
| Q2 FY27 and Q3 FY27 | loaded (snapshot 30 Sep 2026); items created in Oct 2026 missing |
