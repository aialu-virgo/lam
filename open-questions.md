---
title: Open questions
summary: Questions for the Principals, each addressed to its owner with a recommendation and the default if unanswered.
status: active
updated: 2026-10-20
related:
  - .claude/rules/talking-to-principals.md
  - CLAUDE.md
  - data-map/invoice.md
  - design/role-matrix.md
  - design/target-model.md
  - design/comparison-basis.md
  - design/priority-rules.md
  - design/check-rules.md
  - design/escalation-ladder.md
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
| Q19 | SP Sir | Which product lines count as laminates on this Desk: decorative laminates; door; PVC sheet; compact board? | Laminates + Door (as its own product group); PVC sheet and compact board out. Assumed until answered. | **Answered (Vijay, 20 Oct):** all four are laminates → D6. |
| Q20 | SP Sir | When the 12-quarter average QoQ is 0 or negative, any growth target is Stretch. Add a floor? | Keep as is for v1.0; consider a 2% floor after the first quarter of use. | |
| Q21 | SP Sir | Personal KPI plan defaults (e.g. 90% on-time closure, ≤15% overdue) per [KRA / KPI set](design/kra-kpi.md)? | Accept as proposed; editable in Admin. | |
| Q22 | SP Sir | Who sends follow-ups for actions raised by rules: the plant's Coordinator? | Yes, the plant Coordinator; owner's manager if none. | |
| Q23 | SP Sir | Should escalation keep running for a Blocked action (e.g. customer dispute)? | Yes: a block needs the manager's help; L2/L3 drafts note "Blocked: <reason>". | |
| Q24 | SP Sir | Approve hosting the Desk on a Virgo-owned server with its own login, so users without claude.ai accounts can use it? | Yes, on a server or cloud account Virgo already owns; keep the claude.ai link for account holders until it is live. | |
| Q25 | Vijay | What server or cloud account does Virgo IT run (Windows server, AWS, Azure, web host)? | Use an existing Virgo-owned one; no new purchase. | **Answered (Vijay, 21 Oct):** Virgo's Google Cloud → D24. |
| Q26 | Vijay | Can you send the S/4 batch master (Material, Batch, Created on / last goods receipt date) and the B1 batch stock with InDate, so stock ageing can be shown? | Yes; until then ageing stays blank and R4 flags only stock high against sales. | |
| Q27 | SP Sir | Once credit notes are loaded, should achievement against target use net sales (invoiced − credit notes) instead of invoiced sales? | Yes from the next full quarter with credit notes loaded; until then invoiced, with net shown beside it. | **Answered:** yes — interim Vijay (D40), confirmed "approved" relayed by Vijay 23 Oct 21:37 (D49). |
