---
title: Data map — Plant / warehouse
summary: Warehouse (B1 OWHS / S4 LGORT): not exported; sales files carry only the branch, so plant stands in for warehouse until stock and delivery exports arrive.
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/plant-master.md
  - data-map/stock.md
  - data-map/delivery.md
  - data-map/invoice.md
---

# Plant / warehouse (SAP export)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §7 Plant / warehouse · **Status:** no warehouse export uploaded.

## Source and export
- **Not exported.** The B1 sales file has no `WhsCode`; it carries branch (`BPLId`, `BPLName`) only. The S/4 register carries `Plant` only, no storage location.
- **Interim rule (Assumed):** one warehouse per plant; `warehouse_code = plant_code`. Plant data comes from [Data map — Plant / branch master](plant-master.md).
- **When it matters:** stock by warehouse and deliveries by dispatch warehouse ([Stock](stock.md), [Delivery](delivery.md)).

## B1 ↔ S/4HANA mapping
| Canonical | B1 (OWHS) | S/4 (T001W / T001L) |
|---|---|---|
| `warehouse_code` | `WhsCode` | `LGORT` (with `WERKS`) |
| `plant_code` | `BPLid` (branch) joined to Plant List by branch name | `WERKS` |
| `name` | `WhsName` | storage location name |
| `active` | `Inactive` (Y/N) | deletion flag |

## Export to request (Q-D10)
One saved query on **OWHS**: `WhsCode`, `WhsName`, `BPLid`, `Inactive`, `Location`. Recommendation: send once, refresh on change.

## Validation
`warehouse_code` unique; `plant_code` must exist in the plant master; stock or delivery rows with an unknown warehouse are rejected.

## Coverage (12 quarters)
Master, not a time series. Nothing loaded.
