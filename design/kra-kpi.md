---
title: KRA / KPI set
summary: KPI catalogue (formula, actual source, plan source) and the KRAs and KPIs per role measured on Team & Scorecard, with status rules and D9 limits.
status: draft
updated: 2026-10-20
related:
  - design/_index.md
  - design/role-matrix.md
  - design/plan-model.md
  - design/target-model.md
  - design/comparison-basis.md
  - design/check-rules.md
  - design/escalation-ladder.md
  - design/priority-rules.md
  - .claude/rules/boundaries.md
---

# KRA / KPI set
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** not submitted
**Input:** [Brief Part B — design inputs](brief-part-b.md) §5 Team & Scorecard, §4 (every KPI card)

**Done when:** each role has KPIs with source, plan source and formula.

Every KPI shows: plan, actual, variance, achievement %, last quarter's value, **QoQ** (₹ and count KPIs: % change; % KPIs: change in points), 12-quarter trend where history exists, and a status pill. QoQ rules and "New, no prior quarter" follow [Comparison basis](comparison-basis.md). Nothing compares with last FY.

**Status:** "higher is better" KPIs use achievement = actual ÷ plan: green ≥ 100, orange 90–99, red < 90 (**Assumed (Q13)**). "Lower is better" KPIs (K10, K14, K15, K16, K19, K20, K21) are green when actual ≤ plan, orange up to plan × 1.10, red above (**Assumed (new)**). No plan → grey "No plan".

## KPI catalogue
Scopes follow the viewer ([Role matrix](role-matrix.md)). "Aggregates" = the D9 invoice store (plant × month × customer × salesperson × product group). Plan sources are in [Plan model](plan-model.md) (P1–P7).

| ID | KPI | Formula | Actual source | Plan source |
|---|---|---|---|---|
| K1 | Sales achievement % | Sales actual ÷ current approved target × 100 | Aggregates (Sales: four product groups, internal transfers out) | P1; person: P2 split |
| K2 | Share of potential % | Sales actual ÷ market potential × 100; change vs last quarter in points | Aggregates | Market potential (person: potential × P2 split) |
| K3 | QoQ growth % | (A − P) ÷ P, P = previous quarter (month: same position) | Aggregates | none (history only) |
| K4 | Run-rate, required vs current | required = (target − actual to date) ÷ remaining working days; current = actual to date ÷ elapsed working days | Aggregates, working-day calendar | P1 |
| K5 | Trend direction | Rising / flat / falling from the 12-quarter average QoQ with ±1 pt band | Aggregates | none |
| K6 | Stretch targets | Count of approved or draft targets flagged Stretch | Plan tables, aggregates | P1 |
| K7 | New customers | Customers whose first invoice in the loaded history falls in the quarter | Aggregates (needs 4 earlier quarters) | P6 |
| K8 | Class A/B customers in decline | Count of A/B customers whose completed month or quarter QoQ ≤ −5% (R7) | Aggregates, customer class | P7 (default 0) |
| K9 | Collection achievement % | Receipts in the period ÷ collection plan × 100 | Collection export | P3 |
| K10 | Overdue share % | Open receivables more than 60 days past due ÷ total open × 100 | Receivable export | P7 (default 15%, **Assumed (new)**) |
| K11 | Ageing profile | Open receivables in 0–30 / 31–60 / 61–90 / 90+ days past due, ₹ and % | Receivable export | none (display) |
| K12 | On-time dispatch % | Order documents dispatched within plant × group TAT ÷ order documents dispatched | Sales order and delivery exports | P4 TAT, P7 (default 90%, **Assumed (new)**) |
| K13 | Order-to-dispatch days | Average working days from order date to dispatch date | Sales order and delivery exports | P4 TAT |
| K14 | Open orders beyond TAT | Count and ₹ of open order documents past TAT | Sales order export | P4 (target 0) |
| K15 | Stock days | On hand sheets ÷ (sheets sold in the last three completed months ÷ days in them), plant × product group | Stock export, aggregates | P5 |
| K16 | Aged stock % | Sheets older than 180 days ÷ on hand sheets | Stock export (age buckets) | P7 (default 10%, **Assumed (new)**) |
| K17 | On-time closure % | Actions reaching Done on or before due date ÷ actions reaching Done in the period | Desk action log | P7 (default 90%, **Assumed (new)**) |
| K18 | Response within 1 day % | Actions acknowledged within 1 working day of assignment ÷ actions assigned | Desk action log | P7 (default 90%) |
| K19 | Overdue open actions | Count of open actions past due | Desk action log | P7 (default 0) |
| K20 | Escalations reached | Count of own actions reaching L2 or L3 in the period | Desk follow-up queue | P7 (default 0) |
| K21 | Data errors | Rejected rows ÷ rows read for the uploader's uploads (%); plus unresolved master codes | Upload history | P7 (default ≤ 1%) |
| K22 | Follow-ups sent on time % | Drafts marked Sent within 1 day ÷ drafts addressed to the sender | Desk follow-up queue | P7 (default 90%) |
| K23 | Plans on time % | Leaf targets Approved before the quarter starts ÷ leaves with potential | Plan tables | P7 (default 100%) |
| K24 | History coverage % | Entity × quarter cells loaded ÷ cells required (12 quarters × entities in use) | Coverage grid | P7 (default 100%) |
| K25 | Closures verified in 3 days % | Done actions verified within 3 working days ÷ Done actions the assigner owes | Desk action log | P7 (default 90%) |

Worked example (invented): a Sales executive was assigned 8 actions and 6 reached Done in the quarter, 5 on or before due → K17 = 5 ÷ 6 = 83.33%; plan 90% → achievement 92.59% → orange. Last quarter 100% → QoQ −16.67 points.

## KRAs and KPIs per role
Every role with actions also carries **K17, K18, K19** on its own scorecard.

| Role | KRA | KPIs |
|---|---|---|
| **Super admin** | Data completeness and system health | K24, K21 (all uploaders), upload recency (days since last upload per entity), K17 |
| **Management / HO** | Business results and plan discipline | K1, K2, K3, K5, K6, K9, K10, K20 (all L3 reached), K23 |
| **HOD** | Department delivery | Department set: Sales: K1, K3, K8. CRR: K12, K13, K14. Accounts: K9, K10, K11. Plant: K12, K15, K16. Plus K17, K19, K20, K25 |
| **Branch / depot manager** | Branch results, receivables, execution | K1, K2, K3, K4, K7, K8, K9 (view), K10, K14, K15, K23, K25 |
| **Sales executive** | Own targets and customers | K1, K2, K3, K4, K7, K8 (own customers) |
| **Coordinator (sales / CRR)** | Order flow and follow-through | K12, K13, K14, K22 |
| **Accounts** | Collections | K9, K10, K11 |
| **Plant** | Dispatch and stock | K12, K13, K14, K15, K16 |

Team & Scorecard shows, per person and per role: the role's KPIs, plan vs actual, K17 on-time closure, K21 data errors (for uploaders), and the trend card (12 quarters, QoQ line, 4-quarter average, direction). A Branch manager sees own team; HOD sees department; Management sees all.

## Rules about use
- The scorecard informs. **Disciplinary or incentive action on scorecard results is SP Sir's decision alone** ([Rules — boundaries](../.claude/rules/boundaries.md)); the Desk produces no reward, penalty or ranking label beyond the leaderboard and status pills.
- A KPI whose plan is missing shows "No plan" and raises R6 ([Check rules](check-rules.md)); it is never scored zero.
- A person with fewer than `min_pairs` loaded quarters shows "history too short" for trend and Stretch.

## D9 effects
- K1–K8 run on the aggregates: exact at plant, product group, customer, salesperson and segment. **Cannot be offered:** item mix, SKU or price KPIs, line count per invoice beyond the stored `lines`.
- Person KPIs (K1–K4, K7, K8) for B1 periods use the row's salesperson; for S/4 periods the customer master's salesperson (**Assumed (new)**).
- K7 depends on at least four quarters of loaded history before the quarter being tested; with Oct 2023–Sep 2026 loaded, K7 is available from Q3 FY25.
- K15 and K16 are plant × product group only.
- Document drill-down from any KPI stops at the SAP document ([Decisions](../decisions.md) D9).

## Open
- **O-K1 (SP Sir):** default plan values for P7 (90% on-time closure, 15% overdue, 10% aged stock, 90% on-time dispatch). Recommendation: accept as proposed, review after the first quarter of use.
