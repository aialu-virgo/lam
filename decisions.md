---
title: Decisions
summary: Every decision on the Desk: what, who decided or approved, why, date.
status: active
updated: 2026-10-20
related:
  - CLAUDE.md
  - design/comparison-basis.md
---

# Decisions
| # | Date | Decision | Decided / approved by | Why |
|---|---|---|---|---|
| D1 | 2026-10-20 | **Approved exception to "design before build":** the intake-only build desk-v0.1 starts before design approval. | Principals (brief) | It is a data-loading tool with no business views, and the Tue 18:40 intake deadline needs it. |
| D2 | 2026-10-20 | `.claude/rules/`, `.claude/agents/` and `.claude/skills/` are indexed by one `.claude/_index.md`, not an `_index.md` inside each. | Delivery Lead | Claude Code loads every file in those folders as a rule or agent; an index file there would be misread. |
| D3 | 2026-10-20 | Workspace setup committed on session branch `claude/sweet-wright-ky7rr0`, merged to `main`. Task branches follow `m<n>-<topic>` from M0. | Delivery Lead | The cloud session requires that branch name for this push. |
| D4 | 2026-10-20 | Brief Part B is kept once, frozen, in [Brief Part B — design inputs](design/brief-part-b.md). Design and data-map files link to its sections; once a design file is approved it is the home of that fact. | Delivery Lead | One home per fact without losing the original input. |
| D5 | 2026-10-20 | Today appears in the sidebar (Team group) as well as being the landing page for non-admin roles. | Delivery Lead | Brief §5 lists no Today item, but §6 makes it the landing page; people need a way back to it. |
| D6 | 2026-10-20 | The Desk's laminates scope includes Door, PVC sheet and Compact board, each as its own product group. Answers Q19. | Vijay (SP Sir may revise) | Vijay: "Door, PVC & compact board is part of Laminate so consider it as laminate data base". |
| D7 | 2026-10-20 | Add an Admin master "Internal transfer customers" (B1 list `CardCode,CardName,Tranfser`). A CardCode in it marks a line as an internal transfer, as well as the AcctName/Zone rule. | Delivery Lead | Vijay's 5 "Combine Sale 2022" CSVs held this list, not sales lines. An explicit code list is more reliable than name or zone matching. |
| D8 | 2026-10-20 | desk-v0.1 (intake only) published privately: https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx · git tag `desk-v0.1` on commit 3516e8e (local only: tag push refused, HTTP 403 from the session git proxy). | Delivery Lead | M3 deliverable under D1. |
| D9 | 2026-10-20 | Storage grain: one database document per plant × month × chunk, holding aggregates (customer × salesperson × product group × transfer flag) plus a document index. Drill-down stops at SAP document, not line or item. See [Architecture](design/architecture.md). | Delivery Lead (interim); SP Sir confirms with design approval | 12 quarters of lines is about 5M rows against a 25,000-document cap. Brief §2 asks drill-down to the document, which this keeps. |
| D10 | 2026-10-20 | Add `salesperson` to the document index (D9 grain), so a Sales executive's document list matches their figures. Built in v0.9. | Delivery Lead | Without it, drill-down and totals disagree for the role the brief scopes to its own customers. |
| D11 | 2026-10-20 | Average QoQ for the trend and the Stretch flag is the arithmetic mean of the quarterly QoQ %. | Delivery Lead (interim); in the 21:00 design approval | Hand-checkable (acceptance check 12), and the page can explain it. |
| D12 | 2026-10-20 | Wireframe set published for design approval (QA blind check: two passes, no blocking defect): https://claude.ai/artifact/MkwPPNp3U5dyZt9Rc8Lx3K | Delivery Lead | M2 deliverable; SP Sir approves in writing. |
| D13 | 2026-10-20 18:08 | **Design approved (interim)**: wireframe set D12 and the M1 design files, including the recommendations on Q4, Q8–Q13 and Q20–Q23, applied as Assumed. Full build (desk-v0.9) starts. | Vijay (interim, per Q14 recommendation); SP Sir to confirm at the Wed 11:30 walk-through | Vijay: "approved, start the full build". Keeps v0.9 on track for Wed 07:00. |
| D14 | 2026-10-20 | desk-v0.9 published (version 6) at https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx · tag `desk-v0.9` (local; tag push refused, see D8). | Delivery Lead | M4 deliverable; engineer self-test passed on demo data; QA blind check pending. |
| D15 | 2026-10-20 19:35 | Load Vijay's uploaded files (B1 Sep 2026, S/4 Oct 2026 plant 1013, item, plant, employee and transfer masters) into the live Desk database from this session, through the page's own intake logic run headlessly. Working files only in the session scratchpad, deleted after. | Vijay ("upload data in background") | History otherwise waits on manual upload; the page's own code keeps the stored format identical. |
