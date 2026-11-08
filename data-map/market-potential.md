---
title: Data map — Market potential
summary: Market potential plan file (quarter × state × optional district × product group × segment, ₹ and sheets and sq ft, with share, source and owner; D77 replaced plant) and template market-potential.csv.
status: draft
updated: 2026-11-08
related:
  - data-map/geography.md
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
- **Basis (D77, 8 Nov 2026):** geography, not plant. **State is the only required level**; district is optional and later ([Geography](geography.md), [Target model](../design/target-model.md#geography-basis-d77)). Plant is no longer a column.
- **Source:** people, not SAP. Branch heads propose, Vijay consolidates, SP Sir approves (Q3 recommendation). Entered in Admin or uploaded with [market-potential.csv](templates/market-potential.csv) (header only).
- **Target = potential × share %.** Share % and revisions are plan entities in [Target model](../design/target-model.md); phasing in [Target phasing](target-phasing.md).

## Columns (template)
| Column | Type | Mandatory | Rule |
|---|---|---|---|
| `fy_quarter` | `FY27-Q3` | Yes | FY Apr–Mar. A locked quarter cannot be uploaded to. |
| `state_code` | 2 digits (GST code) | Yes | In the State table of [Geography](geography.md). A state name is accepted if it matches a name or alias. |
| `district_id` | LGD code, or `_state`, or blank | No | **Blank or `_state` = the state total** (the default and the only required row). A district id = optional slice; must belong to `state_code`. |
| `product_group` | text | Yes | Configurable list. Proposed start: Laminate, Door (Assumed; Q-D8). |
| `customer_segment` | text | Yes | Configurable (Q5). `All` when not split. Proposed start: S/4 `Customer Group` C1, C2 until named (Assumed). |
| `potential_value_inr` | number ≥ 0 | Yes | ₹, net of GST. |
| `potential_qty_sheets` | number ≥ 0 | Yes | Sheets. |
| `potential_qty_sqft` | number ≥ 0 | Yes | Sq ft. Check against sheets × the group's average sheet area (warn if > 5% off). |
| `share_pct` | number 0–100 | No | Target share of potential; blank = default share Draft ([Target model](../design/target-model.md)). On a `_state` row with districts present it applies to the unallocated slice only. |
| `source_type` | enum | Yes | dealer / market survey · branch estimate · industry data. |
| `source_note` | text | No | Free text. |
| `owner_email` | text | Yes | Must be an active user. |

**Changes from the plant template (20 Oct):** `plant_code` and `territory` removed; `state_code`, `district_id` added; `share_pct` added (the tab already carries it). Per-plant potential cannot be uploaded any more; the plant is derived from the district's responsible plant.

Key: (`fy_quarter`, `state_code`, `district_id` or `_state`, `product_group`, `customer_segment`). A re-upload of the same key creates a **revision** (Draft); it does not overwrite. Revision fields (old → new, reason, discussion date, participants, status) are captured in the page. **Legacy plant-keyed records** are not touched and not re-uploadable; see Migration in [Canonical data model](../design/canonical-data-model.md).

## B1 ↔ S/4HANA mapping
None; not an SAP entity. `product_group` must use the same values as the invoice lines, and `state_code` the same state as the customer master (through the alias table), so potential and actual line up ([Canonical data model](../design/canonical-data-model.md)).

## Validation
- Quarter format and not locked; state exists; district (if given) exists and belongs to the state; owner is an active user; values numeric and ≥ 0; no duplicate key in one file.
- **Districts:** only checked for a state × group × segment that has district rows. Σ districts > state total (₹, sheets or sq ft): the rows load as Draft, Submit is refused. Σ districts < state total: no warning, shown as "Unallocated to districts" in the tab. **No district rows: no check at all.**
- Warn: potential below last quarter's actual (share of potential would exceed 100%).

## Coverage (12 quarters)
No potential loaded for any quarter. Needed: Q3 FY27 (current) first; Q2 FY27 and Q1 FY27 to show share of potential and its QoQ change; earlier quarters optional (Assumed: share-of-potential trend starts from the first loaded quarter, flagged "incomplete history").

| Quarter | Status |
|---|---|
| Q3 FY24 to Q2 FY27 (12 quarters) | missing |
| Q3 FY27 (current) | missing |

## Open items
- Where potential arrives (state or district): Q35 in [Open questions](../open-questions.md); default state only.
- **Q-D8 (SP Sir / Vijay):** product groups and segments to start with. Recommendation: Laminate and Door; segments C1 and C2 renamed in Admin.
