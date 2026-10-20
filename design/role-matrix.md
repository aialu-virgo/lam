---
title: Role matrix
summary: Eight roles with the row-level scope filter applied before rendering, allowed actions, Today cap and one QA test case each, on a small demo fixture.
status: approved (interim, Vijay, D13)
updated: 2026-10-20
related:
  - design/_index.md
  - data-map/sales-employee.md
  - data-map/user-master.md
  - design/canonical-data-model.md
  - design/architecture.md
  - design/priority-rules.md
  - design/escalation-ladder.md
  - design/plan-model.md
  - design/target-model.md
  - design/kra-kpi.md
  - design/comparison-basis.md
  - open-questions.md
  - design/check-rules.md
---

# Role matrix
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §3

**Done when:** each role has scope filter, allowed actions, default Today cap and a test case for QA.

## How scope works
- The viewer's **email** finds the user in the user master ([User master](../data-map/user-master.md)). No match, or `active` = N → the page shows only "Ask your admin for access". No data is fetched.
- The filter is applied to the **data before it is rendered** and before any total is computed, so totals, ranks, trends and drill-down all respect it. Hiding in the browser after fetching does not count.
- Filters use these user fields: `role`, `department`, `plant_codes[]` (blank = all), `sales_employee_code`, `reports_to_email`.
- **Today cap** default **5** for every role (**Assumed (Q10)**), editable per role and per user (`today_cap`, 1–20).
- **Super admin "view as role"** previews any role or user with that user's filter; a banner says "Viewing as …", and the preview is read-only and logged.
- Access is enforced in the page, not in the database ([Architecture](architecture.md) Access). The Desk is therefore for trusted viewers only.

## Department rule (for HOD and action scope)
**Assumed (new), editable in Admin.** A department decides which pages and actions a HOD sees.
| Department | Pages | Action sources |
|---|---|---|
| Sales | Overview, Sales, Orders & Dispatch, Team & Scorecard | Plan shortfall, QoQ decline, missing plan |
| CRR | Orders & Dispatch, Sales (customer and document view) | Order beyond TAT |
| Accounts | Receivables | Overdue receivable |
| Plant | Orders & Dispatch, Inventory | Order beyond TAT, ageing stock |
| HO | All | All |

## Matrix
Plants: "own" means `plant_code ∈ user.plant_codes`. "Sees" lists data scope; pages are from [Brief Part B](brief-part-b.md) §5.

| Role | Scope filter (rows kept) | Pages | Can do |
|---|---|---|---|
| **Super admin** | All rows, all plants, all users | All, including Data Intake and Admin | Users, roles, rules and settings, masters, plan and data upload; re-load a closed quarter (logged); lock quarter; view-as; every action of every role |
| **Management / HO** | All plants and departments (`plant_codes` blank) | All except Admin settings and Data Intake (view only on Intake) | Propose and **approve** plans; assign and reassign any action; **verify** closures; see escalations; approve revisions (never own) |
| **HOD** | All plants; department filter per the Department table; actions where `department` = own | Pages of own department; Action Center for own department | Assign and close department actions; propose department plans (P4, P5, P7); approve P2 and P4 and P5 |
| **Branch / depot manager** | `plant_code ∈ plant_codes`; customers and persons of those plants; actions owned by or assigned within own plants | Overview, Sales, Orders & Dispatch, Receivables, Inventory (own plants), Action Center, Team & Scorecard (own team) | Propose branch plans (P1, P2, P3 view, P6, P7); assign within branch; respond; request reassign; verify closure of actions assigned by self |
| **Sales executive** | Aggregate rows where `salesperson = sales_employee_code`, plus customers whose master salesperson is the user. Where the row has no salesperson (S/4 periods) the customer master's salesperson is used | Today, Sales (own customers), own scorecard, own actions | Respond to own actions and follow-ups: Acknowledge, Update, Mark done, Need help, Request reassign. Cannot assign or approve |
| **Coordinator (sales / CRR)** | Plants in `plant_codes`; orders, dispatch, customers. Sales page shows customers and documents only (no target, potential or scorecard columns) | Orders & Dispatch, Sales (customer and document view), Action Center | Raise and track actions within scope; send follow-up drafts (copy, open mail, open WhatsApp, mark Sent) for own scope ([Escalation ladder](escalation-ladder.md)) |
| **Accounts** | Plants in `plant_codes` (blank = all); receivables and collections | Receivables, Action Center | Respond on collection actions; propose P3 for own plants |
| **Plant** | `plant_code ∈ plant_codes` (own plant) | Orders & Dispatch, Inventory, Action Center | Respond on plant actions; propose P4 and P5 |

## Capability grid
Y = yes, own scope. P = propose only. A = approves. V = view only. — = no.

| Capability | Super admin | Mgmt / HO | HOD | Branch mgr | Sales exec | Coord. | Accounts | Plant |
|---|---|---|---|---|---|---|---|---|
| See Today (landing for non-admin) | Y | Y | Y | Y | Y | Y | Y | Y |
| Respond to own action | Y | Y | Y | Y | Y | Y | Y | Y |
| Raise a manual action | Y | Y | Y | Y | — | Y | — | — |
| Assign / reassign | Y | Y | Y (dept) | Y (branch) | — | — | — | — |
| Verify closure (assigner only) | Y | Y | Y | Y | — | Y | — | — |
| Send follow-up drafts | Y | Y | Y | Y | — | Y | — | — |
| Propose plan | Y | Y | P | P | — | — | P | P |
| Approve plan (not own) | Y | A | A (P2, P4, P5) | — | — | — | — | — |
| Lock quarter | Y | Y | — | — | — | — | — | — |
| Edit masters, users, settings | Y | — | — | — | — | — | — | — |
| Upload SAP data / plans | Y | V | — | — | — | — | — | — |
| Export action log CSV | Y | Y | Y (dept) | Y (branch) | — | — | — | — |

SP Sir approves as a Super admin or Management user; his approval satisfies "SP Sir or a Management role" in [Target model](target-model.md).

## D9 limits on scope
- **Salesperson is not in the document index**, only in aggregates. For a Sales executive, the *figures* are exact (aggregates), but the *document list* behind a figure is filtered by customer and plant, so it can include a document sold under another salesperson. The list carries the note "Documents of your customers". **Cannot be exact at D9 grain.** Recommendation: add `salesperson` to the document index row (see the open item below).
- A document spanning two product groups sits once in the index with the document's total, so a product-group drill list can total more than the figure above it; the page says so.
- For S/4 periods the salesperson comes from the customer master (**Assumed (new)**); for B1 periods it comes from the row. A Sales executive's number may therefore shift if the customer's master salesperson changes.

## Demo fixture for QA (invented, DEMO; ₹ lakh, Q2 FY27 invoice totals)
Three demo plants A, B, C (any three codes from the plant master). Customers K1, K2 at A, K3 at B, K4 at C. Salespeople S1, S2 at A, S3 at B, S4 at C.
| Plant | S-person | Customer | Q2 FY27 net sales |
|---|---|---|---|
| A | S1 | K1 | 250 |
| A | S2 | K2 | 350 |
| B | S3 | K3 | 400 |
| C | S4 | K4 | 300 |
| **Total** | | | **1,300** |

Demo users: `super@demo`, `mgmt@demo` (blank plants), `hod.sales@demo` (dept Sales), `bm.a@demo` (plant A), `se.s1@demo` (S1, plant A), `coord.a@demo` (plant A), `acc.ab@demo` (plants A;B), `plant.b@demo` (plant B), `stranger@demo` (not in master).

## One QA test case per role (check 1; check 2 uses the cap)
| Role | Log in as | Expected |
|---|---|---|
| Super admin | `super@demo` | Sees total 1,300 and all nine nav items. "View as bm.a@demo" shows 600 and the banner; the preview cannot save anything. |
| Management / HO | `mgmt@demo` | Overview total 1,300 across plants A, B, C. Admin and Data Intake are not editable. Can approve a revision proposed by `bm.a@demo`; the Approve button is absent on a revision proposed by `mgmt@demo`. |
| HOD | `hod.sales@demo` | Totals 1,300; Sales, Orders pages shown; Receivables page absent. Action Center lists only department Sales actions. |
| Branch / depot manager | `bm.a@demo` | Total **600** (250 + 350). K3 and K4 never appear, even by searching their names. Opening plant B by URL shows "Ask your admin for access". |
| Sales executive | `se.s1@demo` | Sales total **250**; only K1; no Admin, no plan edit, no Assign. Document list note "Documents of your customers" shown. |
| Coordinator | `coord.a@demo` | Orders & Dispatch for plant A only. Sales page lists K1 and K2 and their documents but no target, potential or scorecard columns. Can raise an action for K1. |
| Accounts | `acc.ab@demo` | Receivables for plants A and B only; K4 and plant C absent. No Sales page. |
| Plant | `plant.b@demo` | Orders & Dispatch and Inventory for plant B only; plant A orders never appear. |
| (none) | `stranger@demo` | Only "Ask your admin for access". |

**Cap test (check 2):** seed `bm.a@demo` with 12 open actions and `today_cap` = 5 → Today lists exactly 5, ranked by [Priority rules](priority-rules.md), with "7 more in Action Center". Set cap to 3 → 3. Cap 20 with 12 actions → 12.

## Open item
- **O-R1 (SP Sir, via Delivery Lead):** add `salesperson` to the document index row so a Sales executive's document list matches the figure. Recommendation: yes; one short code per document, small size cost against the D9 size unknown.
