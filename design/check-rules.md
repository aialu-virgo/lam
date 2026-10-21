---
title: Check rules
summary: Upload validation rules (V1-V12) and the seven rules that raise actions (R1-R7: shortfall, overdue receivable, order beyond TAT, ageing stock, rejected rows, missing plan, QoQ decline), each with trigger, threshold, owner, due date, next-step text and a worked example.
status: approved (interim, Vijay, D13)
updated: 2026-10-21
related:
  - design/_index.md
  - data-map/invoice.md
  - design/architecture.md
  - design/comparison-basis.md
  - design/target-model.md
  - design/plan-model.md
  - design/role-matrix.md
  - design/priority-rules.md
  - design/escalation-ladder.md
  - design/canonical-data-model.md
  - data-map/invoice-s4-register.md
  - open-questions.md
  - design/kra-kpi.md
---

# Check rules

> **D31 (Vijay, 21 Oct 2026):** rule R3 (order beyond TAT) is removed, with the settings `tat_days`, `tat_min_orders` and `due_R3`. The section R3 below is kept for history and is not evaluated. Orders and deliveries are no longer intake entities (V7 now has no delivery example).
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §6 Created by, §7 Validation, §4 Rules use QoQ

**Done when:** each rule has trigger, threshold, owner, due date and next-step text.

All numbers below are **invented** (₹ lakh unless stated). Every threshold is an editable Admin setting with its key; the label says where it came from (**Assumed (Qn)** = the recommendation in [Open questions](../open-questions.md) used until answered; **Assumed (new)** = proposed here, not yet in the questions). No rule calls a language model; messages are templates with `{placeholders}`.

## A. Upload validation (V rules)
Run on every row at intake ([Architecture](architecture.md) Intake pipeline). A bad row goes to the rejected-rows report; good rows load; the uploader gets action R5. Columns are in [data-map/](../data-map/_index.md).

| ID | Rule | Outcome | Message template | Example (invented) |
|---|---|---|---|---|
| V1 | Mandatory field blank (per entity: invoice needs doc no, line, date, customer, plant, quantity, net value) | Reject | `Row {n}: {field} is blank` | Row 9 has no `DocNum` → rejected |
| V2 | Duplicate (doc type, doc no, line) **within the file** | Keep first, reject later ones | `Row {n}: {doc} line {l} already in this file (row {m})` | Rows 4 and 7 both INV 5001 line 2 → row 7 rejected. S/4 header-fan-out repeats are collapsed first and are not duplicates |
| V3 | Unknown plant code (not in plant master) | Reject | `Row {n}: plant {code} is not in the plant master` | Plant 9999 → rejected, listed once with a count |
| V4 | Unknown customer, item or salesperson | **Warn**, load (masters may not be loaded yet) | `{n} rows use {entity} {code} not in the master` | 3 rows with a new CardCode → loaded, listed for Admin |
| V5 | Document date outside the chosen period, or after today + 1 | Reject | `Row {n}: date {d} is outside {from} to {to}` | File chosen for Sep 2026 has 3 rows dated 02 Oct 2026 → rejected |
| V6 | Quantity ≤ 0 on an invoice line; negative only on credit-note lines | Reject | `Row {n}: quantity {q} not allowed on {type}` | Invoice line qty −5 → rejected |
| V7 | Wrong document type for this entity | Reject | `Row {n}: type {t} is not {expected}` | A delivery in an invoice file → rejected |
| V8 | Row belongs to a **closed** quarter | Reject whole file part unless Super admin re-load (logged) | `Quarter {q} is closed; ask a Super admin` | Sales dated Jun 2026 in an open-period upload → rejected; Super admin may reload |
| V9 | Day/month-swapped date cells | Repaired; range shown for confirmation | `{n} dates repaired; range now {from} to {to}` | 03/10 read as 10 Mar → repaired to 3 Oct |
| V10 | Arithmetic: net + tax differs from gross by more than ₹1 | Warn, load | `{n} rows: net + tax ≠ gross` | Net 1,000 + tax 180 vs gross 1,190 → warned |
| V11 | Out-of-scope product (not Laminate, Door, PVC sheet, Compact board, [D6](../decisions.md)) | Not loaded; counted in the upload record (rows, ₹) | `{n} rows out of scope, ₹ {v}` | 206 rows of base paper → counted, not rejected |
| V12 | **Replacement drop:** a re-upload for an open plant-month has more than `replace_drop_pct` fewer documents than the one it replaces | Warn before loading, user confirms | `Plant {p} {month}: {new} documents replace {old} (−{x}%)` | Plant A Oct: 800 documents replace 1,000 (−20%) → confirm or cancel |

Settings: `replace_drop_pct` = 20 (**Assumed (new)**), `reject_partial_pct` = 1 (**Assumed (new)**: a plant-month with more than 1% rows rejected is shown **partial** in the coverage grid until re-uploaded, so QoQ on it greys out).

Plan files (market potential, phasing, users, plants) use the checks listed in their data-map files plus: key duplicate, share % between 0 and 100, phasing sums to 100, quarter not locked, owner is an active user.

**D9 effects.** Duplicate detection covers one file only (cross-file safety comes from replacing a whole plant-month). Lines are not stored, so a line-level check cannot be re-run later; the first 1,500 rejected rows per upload are kept for the report. V12 is a document-count check that D9's coverage document supports.

## B. Rules that raise actions (R rules)
Run **on page load and on each upload**, on open periods only. They never use last-FY comparisons ([Comparison basis](comparison-basis.md)).

**Common behaviour**
- **One action per key and period.** The action ID is built from (rule, entity key, period), so two people loading the page at once cannot create duplicates.
- **Fields:** ID, title, source link (the drill-down to the figure or documents), one owner, one due date, one next step, priority (from [Priority rules](priority-rules.md)), status Open, creator `Desk rule Rn`, timestamps, value at risk.
- **Due dates** count working days from the Admin calendar, from the day created.
- **Volume cap:** at most `max_new_per_rule_per_run` = 20 new actions per rule per run, largest value at risk first (**Assumed (new)**); the rest wait for the next run.
- When the condition clears, the action is **not** auto-closed; it shows "Condition cleared" and the assigner verifies.
- If the owner cannot be resolved (no active user in scope), the action goes to the next level up (Branch manager → HOD → Management) and a data error is logged.

### R1. Plan shortfall
| | |
|---|---|
| **Trigger** | For each plant × product group with an Approved or Locked target: to-date achievement below the threshold. Evaluated for each **completed month**, and for the open month once `shortfall_from_pct` of its working days have passed |
| **Threshold** | Achievement < `status_orange_pct` = 90 (**Assumed (Q13)**); `shortfall_from_pct` = 80 (**Assumed (new)**) |
| **Owner** | Branch manager of the plant |
| **Due** | 3 working days (`due_shortfall`, **Assumed (new)**) |
| **Next step** | `Open {plant} {group}: shortfall {gap} against plan to date. Review the 3 customers with the largest drop against the previous quarter, agree a recovery plan, reply with the new ETA.` |
| **Example** | Wed 28 Oct, Plant A Laminate, Oct target 165.00, 22 of 25 working days gone (88% ≥ 80%). To-date plan = 165.00 × 22 ÷ 25 = 145.20; actual 126.00 → 86.78% < 90 → action, value at risk 19.20, due Sat 31 Oct. At 130.68 or more (≥ 90%) nothing fires |
| **D9** | Plant × product group is exact in the aggregates. Salesperson-level shortfall actions are **not** raised (too many; the scorecard shows it). The "3 customers" list comes from aggregates |

### R2. Overdue receivable
| | |
|---|---|
| **Trigger** | Per customer: open receivable items more than `rcv_days` past due, total at least `rcv_min_inr` |
| **Threshold** | `rcv_days` = 30, `rcv_min_inr` = ₹1 lakh (**Assumed (new)**); ageing buckets 0–30, 31–60, 61–90, 90+ (brief) |
| **Owner** | Accounts user whose plants include the customer's plant; none → Branch manager |
| **Due** | 2 working days |
| **Next step** | `Call {customer}. Overdue {amount} on {n} invoices, oldest {days} days. Record the promised payment date and amount in your reply.` |
| **Example** | K1 has items 5.00 (45 days overdue) and 3.50 (38 days) = 8.50 ≥ 1.00 → action, value at risk 8.50. An item of 0.40 at 90 days alone does not fire |
| **D9** | Receivables are their own store of open items, outside the invoice store; item-level drill (to the invoice document) is available |

### R3. Order beyond TAT
| | |
|---|---|
| **Trigger** | Per dispatching plant: open order documents whose working days since order date exceed the plant × product group TAT plan ([Plan model](plan-model.md) P4), at least `tat_min_orders` late |
| **Threshold** | TAT plan default `tat_days` = 3 (**Assumed (new)**); `tat_min_orders` = 3 (**Assumed (new)**). An order's group is the group with the largest open value (**Assumed (new)**) |
| **Owner** | Plant user of the plant; none → Branch manager |
| **Due** | 1 working day |
| **Next step** | `Confirm the dispatch date for each listed order, or name the blocker (stock, vehicle, credit hold). Reply with the ETA.` |
| **Example** | Plant B TAT 3. Orders SO-1 (age 6 WD, open 12.00), SO-2 (5, 7.00), SO-3 (4, 5.00): all > 3 → 3 late ≥ 3 → one action, value at risk 24.00, worst order 3 days late. When SO-4 turns late, it is **added** to the open action, not a new one |
| **D9** | Orders and deliveries are open-item stores, so the order document and line are available. Order-level age uses the order doc date; S/4 shows an order creation date only on invoiced lines ([Sales order](../data-map/sales-order.md)), so open S/4 orders need the order export |

### R4. Ageing stock
| | |
|---|---|
| **Trigger** | Per plant × product group: (A) stock older than `stock_age_days` of at least `stock_age_min_sheets` sheets, or (B) stock days above plan by `stock_over_pct` |
| **Threshold** | `stock_age_days` = 180, `stock_age_min_sheets` = 500, `stock_over_pct` = 125 (all **Assumed (new)**); stock plan default 30 days ([Plan model](plan-model.md) P5) |
| **Owner** | Plant user; none → Branch manager |
| **Due** | 5 working days |
| **Next step** | `Choose a route for the {aged / excess} stock: transfer to a depot with demand, price action, or write-off request. Reply with route, quantity and date.` |
| **Example** | Plant B Door: 700 sheets aged over 180 days → trigger A. Trigger B: on hand 12,000 sheets; Jul–Sep sold 27,600 sheets over 92 days = 300 a day → 40 stock days; 30 × 125% = 37.5 → fires. One action cites both |
| **D9** | Stock days at **plant × product group** work from aggregates. **Item-level stock days and item-level ageing cannot** be derived from invoices (no item); the age buckets come from the stock upload. Recommendation: the stock store keeps plant × product group × age bucket only |

### R5. Rejected upload rows
| | |
|---|---|
| **Trigger** | An upload with at least `reject_min` rejected rows |
| **Threshold** | `reject_min` = 1 (**Assumed (new)**) |
| **Owner** | The uploader |
| **Due** | Next working day |
| **Next step** | `Fix the {n} rejected rows ({top reasons}) in the SAP export or the column mapping, then re-upload the same file. The rejected-rows report is attached.` |
| **Example** | Upload U-7: 41,200 rows read, 38 rejected (25 unknown plant, 13 date outside period), rejected value 6.40 → action to the uploader due next working day; the other 41,162 rows are loaded; the plant-month shows partial only if rejected rows exceed 1% |
| **D9** | Only the first 1,500 rejected rows per upload are stored; the count and value are exact |

### R6. Missing plan
| | |
|---|---|
| **Trigger** | From `plan_lead_days` before a quarter starts, and during it: a plant that had sales last quarter has no Approved or Locked sales target for a product group (P1), or no collection plan for the open month (P3) |
| **Threshold** | `plan_lead_days` = 7 (**Assumed (new)**) |
| **Owner** | Branch manager of the plant (P1); Accounts user of the plant (P3) |
| **Due** | 3 working days |
| **Next step** | `Propose potential and share % for {plant} ({groups}), record the discussion, and submit for approval.` (P3: `Enter the collection plan for {month}.`) |
| **Example** | 24 Dec 2026: Plant C sold 300 in Q3 FY27 but Q4 FY27 has no Approved target → one action (all groups of the plant together) to the Branch manager of C |
| **D9** | Plans are outside D9; "had sales last quarter" uses aggregates |

### R7. QoQ decline
| | |
|---|---|
| **Trigger** | A **completed** month vs the same-position month of the previous quarter, or a completed quarter vs the previous quarter, for a plant, product group, customer or person, with QoQ ≤ threshold and a valid base |
| **Threshold** | `qoq_decline_pct` = −5 (**Assumed (Q9)**); base at least `qoq_min_base_inr` = ₹5 lakh (**Assumed (new)**); customers only in classes in `qoq_classes` = A, B (**Assumed (new)**); both quarters loaded (not "incomplete history"); not a new entity |
| **Owner** | Plant → Branch manager. Product group → HOD of Sales. Customer → the customer's salesperson, else Branch manager. Person → that person (reports-to is shown on the card) |
| **Due** | 5 working days |
| **Next step** | `{entity}: {period} {A} vs {prior period} {P} ({qoq}). Find the reason (price, stock, competitor, credit) and reply with a recovery plan and ETA.` The card shows the decline and the last-quarter figure |
| **Example** | Customer K1 (class A): Oct 36.00 vs Jul 40.00 = −10.00% ≤ −5% → action, value at risk 4.00. K2: 38.50 vs 40.00 = −3.75% → none. K3: 1.00 vs 2.00 = −50% but base 2.00 < 5.00 → none. K5 first sold in Oct → "New, no prior quarter" → none. Quarter test: Plant A Q1 FY27 520.00 vs Q4 FY26 500.00 = +4.00%, no action (crossover base) |
| **D9** | All four dimensions exist in the aggregates. **Rule simplified:** runs on completed months and quarters only, never QTD, because QTD pro-rating is approximate ([Comparison basis](comparison-basis.md)). First evaluation of a quarter is therefore after its first month closes. Person-level needs a salesperson on the rows; S/4 periods use the customer master's salesperson (**Assumed (new)**) |

## Settings summary (Admin)
`qoq_decline_pct` −5 (Q9) · `status_orange_pct` 90, `status_green_pct` 100 (Q13) · `max_new_per_rule_per_run` 20 · `shortfall_from_pct` 80 · `due_*` per rule (3, 2, 1, 5, 1, 3, 5 working days) · `rcv_days` 30 · `rcv_min_inr` 1 lakh · `tat_days` 3 · `tat_min_orders` 3 · `stock_age_days` 180 · `stock_age_min_sheets` 500 · `stock_over_pct` 125 · `reject_min` 1 · `reject_partial_pct` 1 · `replace_drop_pct` 20 · `plan_lead_days` 7 · `qoq_min_base_inr` 5 lakh · `qoq_classes` A,B. Unlabelled (new) values are proposals for the Principals' review; none changes a figure, only when an action appears.

## Weekly review
Rejected rows and unanswered follow-ups are reviewed weekly ([Rules — learning](../.claude/rules/learning.md)); a repeated cause becomes a new V rule.
