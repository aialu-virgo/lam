---
title: Comparison basis
summary: QoQ only: quarter, month, QTD, YTD and custom comparisons, the Q1 to prior-FY Q4 crossover, new-entity and partial-history handling, and what the D9 storage grain forces.
status: approved (interim, Vijay, D13)
updated: 2026-10-23
related:
  - design/_index.md
  - data-map/target-phasing.md
  - design/canonical-data-model.md
  - design/architecture.md
  - design/target-model.md
  - design/check-rules.md
  - design/kra-kpi.md
  - decisions.md
  - open-questions.md
  - design/role-matrix.md
  - design/plan-model.md
---

# Comparison basis
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §4 Historic data and the comparison basis, §7 Historic upload mode

**Done when:** every period view's comparison is defined, including Q1 → prior-FY Q4, with no last-FY comparison anywhere.

## The one rule
Growth is **quarter on quarter (QoQ) only**: a period is compared with the period **one quarter earlier**. Same month, same quarter or YTD of last FY, and YoY, are not shown, not selectable, not computed and not exported. The rules engine has one comparison function, `prior(period)`, which shifts a period back by exactly three months. There is no function that shifts by twelve. QA check 9 greps the build for any 12-month shift.

**History window (D28, Vijay):** history starts at Q1 FY26 (setting `history_start`, default `FY26-Q1`, Super admin only). Nothing dated before 1 Apr 2025 is loaded or shown. Rows before it are counted at intake as "Before history start", not rejected, with no action. Intake and every view derive their windows from the setting. The first quarter shows "No prior quarter loaded" instead of a QoQ. Period control and YTD are unchanged (QoQ only).

## Calendar (all dates IST)
- FY runs April–March and is named by the year it ends: **FY27 = Apr 2026 – Mar 2027**. Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar.
- Rule: month m of year y belongs to FY y+1 if m ≥ 4, else FY y. Quarter = ((m − 4) mod 12) div 3 + 1. `month_in_quarter` = ((m − 4) mod 3) + 1.
- **Current quarter: Q3 FY27 (Oct–Dec 2026).** The 12 closed quarters are **Q3 FY24 to Q2 FY27** (Oct 2023 – Sep 2026).
- **Working days** per month come from an Admin calendar: Monday–Saturday less holidays, one calendar for all plants (**Assumed (new)**, editable). Used only to pro-rate (see QTD and MTD).

## Previous-quarter table (`prior`)
| Current | Previous | Note |
|---|---|---|
| Q3 FY27 (Oct–Dec 2026) | Q2 FY27 (Jul–Sep 2026) | Same FY |
| Q2 FY27 | Q1 FY27 | Same FY |
| Q1 FY27 (Apr–Jun 2026) | **Q4 FY26** (Jan–Mar 2026) | **Crossover:** the FY label drops by one; the months are the three before |
| Q4 FY26 | Q3 FY26 | Same FY |
| Q3 FY24 (first loaded) | none | "No prior quarter loaded"; growth blank |

## Views
| View | Current figure | Compared with | Growth shown |
|---|---|---|---|
| **Quarter** | Quarter total (open or closed) | The previous quarter total, same grain | QoQ % = (A − P) ÷ P |
| **Month** | One month | The month at the **same position in the previous quarter**: Oct vs Jul, Nov vs Aug, Dec vs Sep, Jan vs Oct, Apr vs Jan. Shown beside the quarter's own QoQ | Month QoQ % |
| **MTD** | Month to date | The same-position month of the previous quarter, pro-rated to the same working-day count | MTD QoQ % |
| **QTD** | Quarter to date | The previous quarter pro-rated to the same working-day count (method below) | QTD QoQ % |
| **YTD** | Sum of the FY's quarters so far | **Nothing.** Shown as a quarter-by-quarter strip with a QoQ step between each pair. Not compared with last FY's YTD | Latest quarter's QoQ on the card |
| **Custom range** | Whole months (D9, see below) | The same months shifted back three months: Oct–Nov 2026 vs Jul–Aug 2026; Apr–May 2026 vs Jan–Feb 2026 | Range QoQ % |

The period control has MTD · QTD · YTD · custom and, per **Assumed (Q8)**, the month comparison setting `month_compare` = `same_position_prior_quarter` (default) or `previous_month`. Neither option is a last-FY option. If SP Sir chooses `previous_month`, the label says "vs previous month" and it is a sequential comparison, never a year comparison.

## Pro-rating by working days (QTD and MTD)
Let N be the working days elapsed in the current period (up to the latest loaded document date), `WD(m)` the working days of month m.
- **MTD:** prior = P_month × N ÷ WD(P_month), where P_month is the same-position month of the previous quarter.
- **QTD:** walk the previous quarter's months in order, taking each month whole while N is not exhausted, then the fraction of the next month: prior = Σ whole months + (N remaining ÷ WD(next month)) × that month.
- Plan to-date uses the same walk on phased monthly targets ([Target model](target-model.md)).

**Worked example (invented ₹ lakh).** Today is Tue 20 Oct 2026. Oct has 25 working days; 15 have elapsed. Jul 2026 had 26 working days and ₹180 lakh; Aug had 25 and ₹175.
- MTD prior = 180 × 15 ÷ 26 = **103.85**. Oct MTD actual 108.00 → QoQ = (108.00 − 103.85) ÷ 103.85 = **+4.00%**.
- Later, N = 40 (all of Oct's 25, plus 15 of Nov): QTD prior walks Jul (26) whole = 180 → N left 14 → 14 ÷ 25 × Aug 175 = 98.00 → prior = **278.00**.

## Crossover worked example (invented ₹ lakh, Plant A, Laminate)
- Q1 FY27 actual 520.00; Q4 FY26 actual 500.00 → QoQ = 20 ÷ 500 = **+4.00%**. Comparing with Q1 FY26 (465.00, +11.83%) is wrong and must never appear.
- Month: Apr 2026 actual 170.00 vs Jan 2026 160.00 → **+6.25%**, not vs Apr 2025.
- Custom range Apr–May 2026 compares with Jan–Feb 2026.

## New entities and partial history
Entities are customers, items, persons, plants and product groups, taken **at the level of the row being shown**.
| Case | Test | Shown |
|---|---|---|
| New entity | Prior quarter is **fully loaded** and the entity has no rows in it | "New, no prior quarter". No growth figure. Excluded from QoQ rules |
| Prior total zero or ≤ 0 | P ≤ 0 (including a net-credit quarter) | "n/a" (never divide by zero). Current > 0 is treated as new |
| Dropped to zero | P > 0 and A = 0 | −100.00%, valid; the decline rule applies |
| Prior quarter missing or partial | Coverage grid says `missing` or `partial` for the entity in either quarter | Figure shown, QoQ greyed with "incomplete history". No rule fires |
| Both zero | P = 0, A = 0 | "—" |
| Share of potential | Potential missing for either quarter | Share shown for the quarters that have it; its QoQ change (in points) is greyed |
| Trend card | Quarter missing in the 12 | Gap in the bars (not a zero); moving average needs four consecutive loaded quarters; average QoQ uses consecutive loaded pairs and needs at least four pairs (`min_pairs`, **Assumed (new)**), else "history too short" |
| New customers KPI | Customer has no rows in any earlier loaded quarter | Counted only when at least four quarters precede it in the loaded history, else "n/a" |

Changes in a customer's segment re-bucket all history to the **current** segment, so segment QoQ is on today's classification (**Assumed (new)**).

## What the D9 grain forces
[Architecture](architecture.md) stores aggregates per plant × month × customer × salesperson × product group (plus transfer flag) and a document index. Consequences:
1. **Month is the smallest period in aggregates.** MTD and QTD pro-rating by working days is **approximate**: it assumes invoicing is spread evenly across working days. Invoicing is usually heavier at month end, so early-month QTD can look like a decline. The card says "pro-rated". **Rule that cannot be exact:** day-exact QTD by product group or salesperson. The document index holds a day per document, so day-exact figures are possible only at plant, customer and total level, and only if the index is kept. One method is used everywhere for consistency (pro-rated); recommended.
2. **QoQ decline rules run on completed months and completed quarters only**, never on QTD, so month-end loading does not raise false actions ([Check rules](check-rules.md) R7).
3. **Custom range snaps to whole months.** Day ranges are not available at product group or salesperson level.
4. **No item-level or line-level QoQ.** "New item" cannot be derived. A "New" label applies to customers, persons, plants and product groups only.
5. **Drill-down:** figure → quarter → month → document. It stops at the document ([Decisions](../decisions.md) D9). If the uploader drops the index, it stops at the aggregate row (plant × month × customer).
6. **Salesperson:** B1 rows carry a name, S/4 rows carry none. Person-level QoQ for S/4-loaded periods uses the customer master's salesperson (**Assumed (new)**); see [Role matrix](role-matrix.md).
7. **Credit notes (D40, 23 Oct 2026; Vijay interim yes, SP Sir to confirm):** actuals are invoiced until credit notes are loaded. Once every month of a quarter (up to today) is covered by a credit-note file, achievement and growth for that quarter and later use Net = invoiced − credit notes; earlier quarters stay on invoiced. Each figure is labelled Invoiced or Net. QoQ compares Net with Net only when both quarters are covered, otherwise invoiced with invoiced, and the tooltip says which. A month with no credit-note file shows "Credit notes not loaded", never zero. Coverage is by month for all branches in the file (a plant with no credit note in a covered month has none). Not available per salesperson. Targets stay set on invoiced sales. Build: [Credit note data map](../data-map/credit-note.md).

## Hand test for QA check 9
Use the demo series in [Target model](target-model.md). Expected: Q3 FY27 QoQ is against Q2 FY27 (540.00); Q1 FY27 against Q4 FY26 (500.00); no view shows Q3 FY26 (470.00) beside Q3 FY27; grep finds no 12-month shift.
