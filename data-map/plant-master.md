---
title: Data map — Plant / branch master
summary: Plant List (61 plants, codes 1001–1065): laminates scope 1001–1006, 1011, 1012–1049; template plant-master.csv; B1 branch and S/4 plant join.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/warehouse.md
  - data-map/sales-employee.md
  - data-map/user-master.md
  - data-map/templates/plant-master.csv
  - data-map/stock.md
  - data-map/market-potential.md
---

# Plant / branch master (master file, Admin)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §3 (default plant master) · **Profiled:** 20 Oct 2026 by script.

## Source and export
- **File:** "Plant List", sheet `Sheet1`, header row 1, 61 plants × 2 columns. Described by Vijay as common to B1 and S/4.
- **Second list:** the employee master workbook has a `Plant` sheet (74 plants, columns reversed: name, code). It is a different list, see below. **The Plant List file is the authority.**
- **Upload template:** [plant-master.csv](templates/plant-master.csv) (header only). Admin can edit the master in the page; the file seeds it.

## Columns
| # | Column (exact) | Type | Null % | Distinct | Canonical field |
|---|---|---|---|---|---|
| 1 | `Plant Coding` | 4-digit code (stored as number) | 0 | 61 | `plant_code`, key. Range 1001–1065; 1001–1006 and 1011–1065 (1007–1010 unused). |
| 2 | `Plant name` | text "<City> - <type>" | 0 | 61 | `plant_name`; `plant_type` is parsed from the suffix. |

## What is in the file (counts by type, parsed from the name)
| Type | Codes | Count | In Laminates desk |
|---|---|---|---|
| Laminate factory | 1001–1006 | 6 | Yes |
| Head office | 1011 | 1 | Yes (HO) |
| Laminate depot (includes two brand depots) | 1012–1049 | 38 | Yes |
| ACP depot or factory | 1050–1065 | 16 | **No** (other product line, Assumed) |

This matches the default in the brief (factories 1001–1006, HO 1011, depots 1012–1049). The file has no zone, state or manager; `zone` and `state` must be filled in Admin (the B1 `Zone` and employee-master `Zone` can seed it).

## Laminates filter
`business = laminates` for codes 1001–1049; `business = ACP` for 1050–1065 (not loaded, not shown). **Assumed**; confirm with Q-D1.

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `plant_code` | none in the sales export; branch `BPLId` (1–66) and `BPLName` | `Plant` (WERKS) in the sales register |
| `plant_name` | `BPLName` | `Plant Description` |

- **B1 join:** `BPLName` matches the Plant List name on 42 of 42 branches in the sales file (normalised for case and spaces). `BPLId` is not the plant code (no fixed offset), so it is stored as `b1_bpl_id` only.
- **S/4 join:** `Plant` equals `Plant Coding` directly; `Plant Description` equals the Plant List name for 1013.
- **Not seen in Sep 2026 B1 sales:** 1006, 1012, 1027 (laminate plants with no invoice rows).

## Employee-master `Plant` sheet vs Plant List
74 rows. 45 codes are in the Plant List (names equal on 8 of 45, so wording differs). 29 codes are not (2001–2004, 3011–3029, 4001, 5001, 6001, 7001, 8001, 8002: other business units). The 16 ACP codes 1050–1065 are missing from it. Not used; Plant List wins.

## Validation
- `plant_code`: 4 digits, unique, within 1001–1999; `plant_name` required.
- `plant_type` in {factory, HO, depot}; `zone` in Zone 1–5 or blank; `active` Y/N.
- Every `plant_code` used in an upload, user or plan must exist here (unknown code → reject row).
- Warn when an upload names a branch not in this list (B1 `BPLName`).

## Coverage (12 quarters)
Master, not a time series. One list as of 20 Oct 2026: loaded on upload. Plants opened or closed in the past 12 quarters are unknown (Q-D9: ask Vijay for open/close dates if any plant changed).
