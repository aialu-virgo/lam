---
title: Data map — Sales employee
summary: Sales employee master workbook: 394 zone-sheet staff plus one zone head, 15 columns, no SlpCode; B1 sales rows carry a name only and S/4 carries none.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/user-master.md
  - data-map/plant-master.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/customer.md
  - design/role-matrix.md
---

# Sales employee (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Sales employee · **Profiled:** 20 Oct 2026 by script. Names, mobiles and e-mails are personal data and are never stored in this repo.

## Source and export
- **File:** "Sales Employee Master For Sap - Downloaded", described by Vijay as common to B1 and S/4. It is laid out like an SAP employee upload template (columns marked `*`), not an OSLP dump.
- **Sheets:** `ZONE 1` to `ZONE 5` hold the laminate sales staff; `ACP`, `ALU`, `PVC`, `MDF`, `TAS IND`, `TAS ALU` each hold the **same single zone-head row** (other product lines, not laminates); `Plant` is a 74-row plant list (see [Plant / branch master](plant-master.md)). Blank formatted rows below the data (about 1,000 per sheet) are ignored.
- **Populated rows:** Zone 1: 71 · Zone 2: 122 · Zone 3: 104 · Zone 4: 26 · Zone 5: 71 = **394 people**, plus 1 zone head (6 repeats). Employee codes are unique (0 duplicates in the zone sheets).
- **Laminates filter:** zone sheets only. The product-line sheets carry no laminate staff.

## Columns (15, identical on all person sheets)
Null % over the 394 zone-sheet rows.

| # | Column (exact) | Type | Null % | Distinct | Canonical field / use |
|---|---|---|---|---|---|
| 1 | `S.No.` | int | 0 | 122 | **Unused.** Restarts per sheet. |
| 2 | `Employee Code` | text `E-<2–5 letters>/<number>` (6 codes `E<digits>`) | 0 | 394 | `employee_code`, key of this file. 39 branch prefixes. |
| 3 | `*FirstName` | text | 0 | 320 | Part of `name`. |
| 4 | `*LastName` | text | 2.0 | 210 | Part of `name`. |
| 5 | `FullName` | text | 0 | 391 | `name`. |
| 6 | `Mobile No.` | number or text | 1.3 | 389 | `whatsapp_number` candidate (Assumed same number). 10 digits on 380 rows; 9 rows hold 20 digits (two numbers joined); normalise to 91 + 10 digits. |
| 7 | `Email` | text | 52.5 | 186 | `email`, the user key. 90.9% of filled values are valid; 8 on the Virgo domain across all sheets. |
| 8 | `Language` | text | 82.0 | 1 (EN) | **Unused.** |
| 9 | `Designation` | text | 0 | 13 | `designation` → role (below). 13 spellings. |
| 10 | `Zone` | text Zone 1–5 | 0 | 5 | `zone`. Matches the sheet name. |
| 11 | `Plant Name` | text | 0 | 42 | `plant_name_raw`. Matches the Plant List wording on only 23 of 43 names; use `*CompanyCode`. |
| 12 | `*CompanyCode` | int, 4 digits | 41.6 | 22 | `plant_code`. All values exist in the Plant List. Blank on 164 rows: Zone 1: 70, Zone 4: 23, Zone 5: 71 of their rows. |
| 13 | `CostCenter` | — | 100 | 0 | **Unused.** Filled only for the zone head. |
| 14 | `*StartDate(YYYYMMDD)` | — | 100 | 0 | **Unused.** Treat as active (Assumed). |
| 15 | `*EndDate(YYYYMMDD)` | — | 100 | 0 | **Unused.** |

## Optional columns (from 20 Oct, desk-v0.9 version 13)
Three columns may follow the 15 above: `B1 SlpCode`, `B1 Sales Employee Name` (the exact B1 `Salesemployee` text, matched first), and `Reports To (Employee Code)`. A filled `*EndDate(YYYYMMDD)` marks the person inactive, but they still match their past sales. A sheet named "Read me" is ignored. Header-only template: [templates/sales-employee.csv](templates/sales-employee.csv).

## Designations to roles (Assumed)
Spellings seen: sales executive (several spellings, e.g. "Sale Executive"), senior sales executive (one misspelt variant), senior sales executive, area sales manager / ASM, branch manager / branch head, business development manager / executive, NBD, branch coordinator. Proposed mapping to [Role matrix](../design/role-matrix.md) roles: sales executive and senior → Sales executive; branch manager / head → Branch / depot manager; branch coordinator → Coordinator; area sales manager, ASM, NBD, business development → **no matching role** (Q-D11).

## B1 ↔ S/4HANA mapping
| Canonical | B1 (OSLP) | S/4 | In the uploads |
|---|---|---|---|
| `sales_employee_code` | `SlpCode` | partner function / `VKGRP` | **Absent** in B1 sales file; S/4 `Sales Executive` is 100% blank |
| `name` | `SlpName` | employee name | B1 sales rows: `Salesemployee` text, 309 distinct, 67 with " - <branch>" suffix |
| `employee_code` | UDF (Assumed) | personnel number | `Employee Code` here |

**Join quality (B1 name → this master):** 142 of 309 distinct B1 names equal a master `FullName` exactly (44% of invoice rows); after removing the " - <branch>" suffix 152 of 271. Not reliable: needs the code.

## Export to request (Q-D12)
B1 query on **OSLP**: `SlpCode`, `SlpName`, `Active`, `Memo`, `Mobil`, `Email`, plus the UDF holding the HR employee code if one exists, plus `SlpCode` added to the invoice export. S/4: the partner-function (SP) or sales group per customer and sales area. Recommendation: add `SlpCode` to the invoice export first (one column) and send OSLP once.

## Validation
- `employee_code` unique; `email` valid and unique when present; `plant_code` in plant master; `designation` mapped to a role or flagged.
- Warn: no e-mail (52.5%), no plant code (41.6%), mobile not 10 digits (9 rows).
- People without e-mail cannot become Desk users until Admin enters one ([User master](user-master.md)).

## Coverage (12 quarters)
Master, not a time series. Loaded snapshot: one file, date not stated in the file name. People who left in the last 12 quarters and still appear in B1 sales names will have no master row.
