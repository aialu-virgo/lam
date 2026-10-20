---
title: Open questions
summary: Questions for the Principals, each addressed to its owner with a recommendation and the default if unanswered.
status: active
updated: 2026-10-20
related:
  - .claude/rules/talking-to-principals.md
  - CLAUDE.md
  - data-map/invoice.md
---

# Open questions
If a question is unanswered by the time work needs it, the recommendation is used, flagged **Assumed**, and logged in [Decisions](decisions.md).

| # | To | Question | Recommendation | Answer |
|---|---|---|---|---|
| Q1 | Vijay | Which SAP B1 reports/queries are exported today, by whom, how often? | One saved query per entity in §7, weekly to start, daily once stable. | |
| Q2 | Vijay | S/4HANA go-live status for laminates; who is the SAP partner? | Keep B1 format as the intake contract until S/4 OData access is confirmed. | |
| Q3 | SP Sir | Who supplies market potential, at what level, from what source? | Branch heads propose per quarter (branch × product group × segment); Vijay consolidates; SP Sir approves. | |
| Q4 | SP Sir | Default target share % of potential while discussions happen? | Last quarter's actual share + 2 points, flagged Draft. | |
| Q5 | Vijay | Customer segments for laminates? | Start with the segments in current sales reports; editable master. | |
| Q6 | Vijay | User list with role, branch/plant and reports-to? | HO coordination maintains the user master in Admin. | |
| Q7 | Vijay | How much history can B1 export; is any of it already in S/4HANA? | Last 12 quarters from B1; any S/4 period loaded from S/4 exports through the same mapping. | |
| Q8 | SP Sir | Month comparison: same position in previous quarter (Oct vs Jul) or previous month? | Same position in the previous quarter; previous-month comparison not shown. | |
| Q9 | SP Sir | QoQ decline threshold that raises an action? | −5%. | |
| Q10 | SP Sir | Default Today cap per role? | 5. | |
| Q11 | SP Sir | Escalation days? | L1 at 1 day overdue, L2 at 3, L3 at 7. | |
| Q12 | SP Sir | WhatsApp: links only, or Business API later? | wa.me draft links now (no cost, nothing auto-sends). | |
| Q13 | SP Sir | Status thresholds for plan achievement? | ≥100% green, 90–99% orange, <90% red. | |
| Q14 | SP Sir | The brief says Vijay may approve design only if you delegate in writing, but also that Vijay may give interim approval if you have not answered by 21:00. Which holds? | Vijay gives interim approval at 21:00 if you have not answered; you confirm at the 11:30 walk-through. | |
| Q15 | Vijay | Who should the published Desk link be shared with before v1.0? | Principals only until v1.0; then users from the user master. | |
| Q16 | Vijay | Export B1 "Combine Sale" for Oct 2023 – Aug 2026 (the file has Sep 2026 only), adding LineNum, SlpCode, WhsCode and dates as text? | One file per quarter in the same query; columns per [Data map — Invoice](data-map/invoice.md). | |
| Q17 | Vijay | S/4 register: export all plants (the file has plant 1013 only), include credit memos and the salesperson (Sales Executive is empty)? | Same report, all plants, Oct to date; salesperson as a partner-function column. | |
| Q18 | Vijay | Send the S/4 material master with the old B1 code, and the B1 exports for orders, deliveries, receivables, collections, stock, customers and sales employees? | Exact columns are in each [data-map/](data-map/_index.md) file; weekly to start. | |
| Q19 | SP Sir | Which product lines count as laminates on this Desk: decorative laminates; door; PVC sheet; compact board? | Laminates + Door (as its own product group); PVC sheet and compact board out. Assumed until answered. | |
