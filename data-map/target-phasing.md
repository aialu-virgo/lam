---
title: Data map — Target phasing
summary: Monthly phasing of each quarter's target (3 rows summing to 100%, equal by default) and template target-phasing.csv.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/market-potential.md
  - data-map/templates/target-phasing.csv
  - design/target-model.md
  - design/comparison-basis.md
---

# Target phasing (plan file, Admin)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §4 · **Status:** no file exists; default is equal thirds.

## Source and export
Entered in Admin or uploaded with [target-phasing.csv](templates/target-phasing.csv) (header only). Optional: without a row, a quarter target is split equally across its three months. To-date plan is pro-rated by working days inside each month ([Comparison basis](../design/comparison-basis.md)).

## Columns (template, long format: one row per month)
| Column | Type | Mandatory | Rule |
|---|---|---|---|
| `fy_quarter` | `FY27-Q3` | Yes | Not locked. |
| `plant_code` | 4 digits | No | Blank = all plants. |
| `product_group` | text | No | Blank = all groups. |
| `customer_segment` | text | No | Blank = all segments. |
| `month_in_quarter` | 1, 2 or 3 | Yes | 1 = first month (Q3 = Oct). |
| `phasing_pct` | number 0–100 | Yes | Three rows per key sum to 100 (±0.01). |

A more specific row (plant, group, segment) overrides a broader row. Each change creates a revision like any target edit ([Target model](../design/target-model.md)).

## B1 ↔ S/4HANA mapping
None; not an SAP entity.

## Validation
Exactly three months per key; each in 1–3; percentages sum to 100; keys exist in the plant master and the group and segment lists; locked quarters rejected.

## Coverage (12 quarters)
Nothing loaded; equal phasing applies to every quarter. Past quarters need no phasing (actuals are used).
