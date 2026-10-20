---
title: Data map — Market potential
summary: Market potential plan file (quarter × plant/territory × product group × segment, ₹ and sheets and sq ft, with source and owner) and template market-potential.csv.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/target-phasing.md
  - data-map/templates/market-potential.csv
  - design/target-model.md
  - design/plan-model.md
  - data-map/customer.md
  - data-map/plant-master.md
---

# Market potential (plan file, Admin)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §4 Market potential · **Status:** no file exists yet (Q3, Q5).

## Source and export
- **Source:** people, not SAP. Branch heads propose, Vijay consolidates, SP Sir approves (Q3 recommendation). Entered in Admin or uploaded with [market-potential.csv](templates/market-potential.csv) (header only).
- **Target = potential × share %.** Share % and revisions are plan entities in [Target model](../design/target-model.md); phasing in [Target phasing](target-phasing.md).

## Columns (template)
| Column | Type | Mandatory | Rule |
|---|---|---|---|
| `fy_quarter` | `FY27-Q3` | Yes | FY Apr–Mar. A locked quarter cannot be uploaded to. |
| `plant_code` | 4 digits | One of plant / territory | In [Plant master](plant-master.md). Branch level. |
| `territory` | text | One of plant / territory | For potential not tied to a plant. Free text from a controlled list in Admin. |
| `product_group` | text | Yes | Configurable list. Proposed start: Laminate, Door (Assumed; Q-D8). |
| `customer_segment` | text | Yes | Configurable (Q5). Proposed start: the S/4 `Customer Group` codes C1, C2 until named (Assumed). |
| `potential_value_inr` | number ≥ 0 | Yes | ₹, net of GST. |
| `potential_qty_sheets` | number ≥ 0 | Yes | Sheets. |
| `potential_qty_sqft` | number ≥ 0 | Yes | Sq ft. Check against sheets × the group's average sheet area (warn if > 5% off). |
| `source_type` | enum | Yes | dealer / market survey · branch estimate · industry data. |
| `source_note` | text | No | Free text. |
| `owner_email` | text | Yes | Must be an active user. |

Key: (`fy_quarter`, `plant_code` or `territory`, `product_group`, `customer_segment`). A re-upload of the same key creates a **revision** (Draft); it does not overwrite. Revision fields (old → new, reason, discussion date, participants, status) are captured in the page.

## B1 ↔ S/4HANA mapping
None; not an SAP entity. `product_group` and `plant_code` must use the same values as the invoice lines so potential and actual line up ([Canonical data model](../design/canonical-data-model.md)).

## Validation
- Quarter format and not locked; plant exists; owner is an active user; values numeric and ≥ 0; no duplicate key in one file.
- Warn: sum of plants differs from a stated territory total; potential below last quarter's actual (share of potential would exceed 100%).

## Coverage (12 quarters)
No potential loaded for any quarter. Needed: Q3 FY27 (current) first; Q2 FY27 and Q1 FY27 to show share of potential and its QoQ change; earlier quarters optional (Assumed: share-of-potential trend starts from the first loaded quarter, flagged "incomplete history").

| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |

## Open items
- **Q-D8 (SP Sir / Vijay):** product groups and segments to start with. Recommendation: Laminate and Door; segments C1 and C2 renamed in Admin.
