---
title: Index — build/desk/
summary: Artifact source for the Desk. desk-v0.9: all pages, rules engine, actions, escalation drafts, plans with revisions, intake and admin.
status: active
updated: 2026-10-20
related:
  - build/_index.md
  - design/architecture.md
  - build/demo-data/_index.md
---

# build/desk/

- [index.src.html](index.src.html): page shell and the v0.1 intake and admin code. `node build.mjs` inlines the demo generator, the v0.9 modules and styles, and writes `dist/index.html`, the file that is published.
- [src/](src/): v0.9 modules, concatenated in file-name order inside the page's one script: `10-core` (settings, calendar, period and QoQ maths, trend and Stretch), `20-data` (scope, roll-ups, customer detail, targets), `30-rules` (R1 to R7, priority score, escalation drafts), `40-ui-actions` (Today, Action Center, thread, follow-ups, log), `50-views` (KPI cards, tables, trend card, Overview), `55-sales-team` (Sales, Team and Scorecard), `60-ops` (Orders, Receivables, Inventory), `70-admin` (plans workflow, settings, tools, demo extras), `80-nav` (shell, routing, handlers), `99-expose` (test hooks), `styles.css`.
- [test/](test/): headless self-test harness (in-memory stand-in for the platform database, Playwright scripts). Not shipped, holds no data.
- [build.mjs](build.mjs): build script.
- Design: [Architecture](../../design/architecture.md).
