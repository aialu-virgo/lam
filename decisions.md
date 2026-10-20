---
title: Decisions
summary: Every decision on the Desk: what, who decided or approved, why, date.
status: active
updated: 2026-10-20
related:
  - CLAUDE.md
---

# Decisions
| # | Date | Decision | Decided / approved by | Why |
|---|---|---|---|---|
| D1 | 2026-10-20 | **Approved exception to "design before build":** the intake-only build desk-v0.1 starts before design approval. | Principals (brief) | It is a data-loading tool with no business views, and the Tue 18:40 intake deadline needs it. |
| D2 | 2026-10-20 | `.claude/rules/`, `.claude/agents/` and `.claude/skills/` are indexed by one `.claude/_index.md`, not an `_index.md` inside each. | Delivery Lead | Claude Code loads every file in those folders as a rule or agent; an index file there would be misread. |
| D3 | 2026-10-20 | Workspace setup committed on session branch `claude/sweet-wright-ky7rr0`, merged to `main`. Task branches follow `m<n>-<topic>` from M0. | Delivery Lead | The cloud session requires that branch name for this push. |
| D4 | 2026-10-20 | Brief Part B is kept once, frozen, in [Brief Part B — design inputs](design/brief-part-b.md). Design and data-map files link to its sections; once a design file is approved it is the home of that fact. | Delivery Lead | One home per fact without losing the original input. |
| D5 | 2026-10-20 | Today appears in the sidebar (Team group) as well as being the landing page for non-admin roles. | Delivery Lead | Brief §5 lists no Today item, but §6 makes it the landing page; people need a way back to it. |
