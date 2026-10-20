---
title: Priority rules
summary: How Today ranks actions: five weighted components scored 0-100, editable weights, tie-breaks, the cap, and the "why" text, with a worked example.
status: approved (interim, Vijay, D13)
updated: 2026-10-20
related:
  - handover/_index.md
  - design/_index.md
  - design/role-matrix.md
  - design/check-rules.md
  - design/escalation-ladder.md
  - design/kra-kpi.md
  - open-questions.md
---

# Priority rules
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §6 Today

**Done when:** score formula, editable weights and the 'why' text are defined with a worked example.

Rules only, no AI. Computed on load and on each upload, per viewer, on the viewer's own actions.

## Which actions are candidates
An action is a candidate for a person's Today when:
- they own it and its status is Open, Acknowledged, In progress or Reassign requested; or
- they are the assigner of an action in **Done**, waiting for **Verified closed** (card type "Verify").
**Blocked** actions are not candidates (shown in a collapsed "Blocked" strip in the Action Center, with the reason). The follow-up drafts queue ([Escalation ladder](escalation-ladder.md)) is a separate list, not part of Today and not counted in the cap (**Assumed (new)**).

## Score
`score = Σ weight_k × component_k ÷ 100`, each component 0–100, weights sum to 100. Range 0–100.

| k | Component | Definition | Default weight (**Assumed (new)**; brief says editable) |
|---|---|---|---|
| U | **Due-date urgency** | days to due `d` (negative = overdue): overdue → 100; due today → 90; due in 1 → 75; 2–3 → 50; 4–7 → 25; later → 10 | 35 |
| V | **Value at risk** | `min(100, 100 × value_at_risk ÷ value_ref)`, `value_ref` = ₹10 lakh | 25 |
| C | **Customer impact** | customer class from last closed quarter's sales rank: A = 100, B = 60, C = 30, no customer = 0. A = customers making the first 70% of sales cumulatively, B the next 20%, C the last 10% (`abc_cuts` 70 / 20 / 10, **Assumed (new)**) | 15 |
| A | **Ageing** | days since created ÷ `age_ref` (30 days), capped at 100 | 15 |
| D | **Dependency** | `min(100, 50 × n)` where n = other open actions or orders that are waiting on this one (a "blocked by" link) | 10 |

Tie-break in order: earlier due date, higher value at risk, lower action ID. Same inputs always give the same order.

Priority label on the action: High if score ≥ 70, Medium 40–69, Low < 40 (`prio_high`, `prio_med`, **Assumed (new)**).

## Cap
Today shows the top **N** by score, N = the user's `today_cap` (default **5**, **Assumed (Q10)**; editable per role and per user, 1–20). Remaining actions show as "N more in Action Center". The cap is hard: an overdue L3 item does not exceed it; it simply scores near the top (U = 100). QA check 2.

## The "why" line
Each card shows the two largest weighted contributions and the due state. Template: `Ranked {rank}: {top1_label} ({top1_points} pts), {top2_label} ({top2_points} pts). Score {score}.` Labels: "overdue {n} days" / "due {date}", "₹{v} at risk", "class {A/B/C} customer", "open {n} days", "blocks {n} items". A "Score details" tap shows all five points.

## Worked example (invented)
Weights 35 / 25 / 15 / 15 / 10. Viewer: a user with cap 5 who owns all six.

| Action | Due | U | Value at risk | V | Class | C | Age | A | n | D | Score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A-1 Overdue receivable K1 | overdue 2 d | 100 | 8.50 | 85 | A | 100 | 12 d | 40 | 0 | 0 | 35 + 21.25 + 15 + 6 + 0 = **77.25** |
| A-2 Order beyond TAT | due today | 90 | 24.00 | 100 | B | 60 | 3 d | 10 | 1 | 50 | 31.5 + 25 + 9 + 1.5 + 5 = **72.00** |
| A-3 Plan shortfall A Laminate | in 3 d | 50 | 19.20 | 100 | none | 0 | 1 d | 3.33 | 0 | 0 | 17.5 + 25 + 0 + 0.50 + 0 = **43.00** |
| A-4 QoQ decline K2 | in 6 d | 25 | 4.00 | 40 | A | 100 | 20 d | 66.67 | 0 | 0 | 8.75 + 10 + 15 + 10 + 0 = **43.75** |
| A-5 Rejected rows | in 1 d | 75 | 6.40 | 64 | none | 0 | 0 d | 0 | 0 | 0 | 26.25 + 16 = **42.25** |
| A-6 Missing plan C | in 10 d | 10 | 0 | 0 | none | 0 | 2 d | 6.67 | 0 | 0 | 3.5 + 1 = **4.50** |

Order with cap 5: A-1 (77.25), A-2 (72.00), A-4 (43.75), A-3 (43.00), A-5 (42.25); A-6 falls to "1 more in Action Center". A-1 card: `Ranked 1: overdue 2 days (35.0 pts), ₹8.5 lakh at risk (21.3 pts). Score 77.3.`
Tie-break check: if A-3 and A-4 both scored 43.00, A-3 ranks first (due in 3 days is earlier than 6).

## D9 effects
Value at risk and class come from aggregates (customer × plant × product group) and from the open-item stores; no item-level or line-level input is used. **Cannot be done:** item-level customer impact (a customer's critical item). Customer class is computed from the last **closed** quarter so it is stable within a quarter. A customer with no history is class C.

## Settings (Admin)
Weights `w_U w_V w_C w_A w_D` (must total 100, else save refused) · `value_ref` ₹10 lakh · `age_ref` 30 days · `abc_cuts` 70/20/10 · `prio_high` 70 · `prio_med` 40 · `today_cap` per role/user. All **Assumed (new)** except the cap (Q10).
