---
title: Plan model
summary: Every plan type beyond the sales target (person split, collections, dispatch TAT, stock days, new customers, personal KPIs): grain, owner, entry route, actual source and approval.
status: approved (interim, Vijay, D13)
updated: 2026-10-21
related:
  - design/_index.md
  - data-map/market-potential.md
  - design/canonical-data-model.md
  - design/target-model.md
  - design/comparison-basis.md
  - design/check-rules.md
  - design/kra-kpi.md
  - design/role-matrix.md
  - design/architecture.md
  - data-map/receivable.md
  - data-map/collection.md
  - data-map/sales-order.md
  - data-map/delivery.md
  - data-map/stock.md
---

# Plan model

> **D31 (Vijay, 21 Oct 2026):** plan type P4 (Dispatch TAT plan) and the setting `tat_days` are removed. P4 is retired; P5 to P7 keep their numbers. Admin no longer offers a TAT plan.
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §4

**Done when:** each plan type has grain, owner, entry route and actual source.

Plans are entered by people, never from SAP. Actuals come only from SAP uploads. Every plan type uses the revision flow of [Target model](target-model.md) (Draft → Discussed → Approved → Locked, approver not the proposer), except where noted. Every plan figure shown has plan, actual, variance, achievement % and QoQ ([Comparison basis](comparison-basis.md)). Status colour uses `status_green_pct` / `status_orange_pct` (100 / 90, **Assumed (Q13)**).

| # | Plan | Grain | Owner (proposes) | Approver | Entry route | Actual source | Default if none |
|---|---|---|---|---|---|---|---|
| P1 | **Sales target** | quarter × plant or territory × product group × segment, phased by month | Branch manager (own plants) | SP Sir or Management / HO | Admin screen or [market-potential.csv](../data-map/templates/market-potential.csv) and [target-phasing.csv](../data-map/templates/target-phasing.csv) | Invoice aggregates (Sales) | Potential × default share, Draft ([Target model](target-model.md)) |
| P2 | **Person split** | P1 leaf × salesperson, `split_pct`, sums to 100 per leaf | Branch manager | Branch manager's HOD (it moves no ₹ between leaves) | Admin screen or upload | Aggregates by salesperson | Each person's share of the leaf's last-quarter actual, Draft |
| P3 | **Collection plan** | month × plant (₹) | Accounts (plant scope) | Management / HO | Admin screen or upload | [Collection](../data-map/collection.md) receipts, summed by month and plant | Open receivables falling due in the month from the latest [Receivable](../data-map/receivable.md) export |
| P4 | **Dispatch TAT plan** | plant × product group, standard working days from order date to dispatch date | Plant user, with HOD | HOD | Admin screen | [Sales order](../data-map/sales-order.md) date to [Delivery](../data-map/delivery.md) date, per order document | `tat_days` = 3 (**Assumed (new)**) |
| P5 | **Stock plan** | plant × product group, target stock days | Plant user, with HOD | HOD | Admin screen | [Stock](../data-map/stock.md) on hand ÷ average daily sales sheets | `stock_days_target` = 30 (**Assumed (new)**) |
| P6 | **New-customer plan** | quarter × plant (count of customers) | Branch manager | Management / HO | Admin screen or upload | Customers whose first invoice in the loaded history falls in the quarter | None; KPI shows "no plan" |
| P7 | **Personal KPI plan** | quarter × person × KPI (value) | HOD or Branch manager | Management / HO | Role defaults in Admin; per-person override | Desk's own tables (actions, uploads) | Role default in [KRA / KPI set](kra-kpi.md) |

## Rules per plan
- **P1 and P2 sum rules.** P2 per leaf sums to 100 ± 0.01. Person target = leaf target × split %, person potential = leaf potential × split % (so share of potential exists for persons). Person targets are rounded to 2 decimals and the last person takes the remainder, so the leaf is exactly reproduced.
- **P3 collection plan** is ₹ received in the month. Achievement = receipts ÷ plan. Month grain, so no day pro-rating is needed for completed months; open month uses working-day pro-rating.
- **P4 TAT** is measured per order document: working days from `order doc_date` to the first delivery date for the line; late if more than `tat_days`. Order-line grain is open-order data, held outside the D9 invoice store (open orders only, small).
- **P5 stock days** = `on_hand_sheets ÷ (sheets sold in the last three completed months ÷ calendar days in those months)`, by plant × product group. Item-level stock days **cannot** be computed from the D9 aggregates (no item); the Desk offers plant × product group only.
- **P6 new customer** needs four earlier quarters in the coverage grid, else "n/a" ([Comparison basis](comparison-basis.md)).
- **P7** values are defaults from the KPI table (for example on-time closure 90%) so Admin does not enter 100 rows per quarter.

## Missing plans
A missing plan is a gap, not a zero: the KPI shows "No plan" in the pending (orange) style and rule R6 ([Check rules](check-rules.md)) raises an action for the proposer. Achievement is not computed without a plan.

## Locking and history
Quarter plans lock with the quarter ([Target model](target-model.md)). Past-quarter plans are stored with their approved values so every trend bar can show its own target marker and achievement %. Quarters loaded before the Desk existed carry no plan: bars show "no plan".

## Settings (Admin)
| Key | Default | Label |
|---|---|---|
| `tat_days` | 3 | Assumed (new) |
| `stock_days_target` | 30 | Assumed (new) |
| `working_days_calendar` | Mon–Sat less holidays | Assumed (new) |
| `collection_plan_default` | due-in-month | Assumed (new) |

## D9 effects
P1, P2, P6 read the aggregates (plant × month × customer × salesperson × product group) and work. P3 to P5 use their own stores, not the invoice aggregates. **Cannot be done at D9 grain:** item- or line-level plans, per-item stock days, per-SKU TAT. S/4 rows have no salesperson, so P2 actuals for S/4-loaded periods use the customer master's salesperson (**Assumed (new)**).
