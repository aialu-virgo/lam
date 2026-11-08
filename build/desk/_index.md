---
title: Index — build/desk/
summary: Artifact source for the Desk. desk-v0.9: all pages, rules engine, actions, escalation drafts, plans with revisions, intake and admin.
status: active
updated: 2026-11-08
related:
  - build/_index.md
  - design/architecture.md
  - build/demo-data/_index.md
---

# build/desk/

- [index.src.html](index.src.html): page shell and the v0.1 intake and admin code. `node build.mjs` inlines the demo generator, the v0.9 modules and styles, and writes `dist/index.html`, the file that is published.
- [src/](src/): v0.9 modules, concatenated in file-name order inside the page's one script: `10-core` (settings, calendar, period and QoQ maths, trend and Stretch), `20-data` (scope, roll-ups, customer detail, targets), `30-rules` (R1 to R7, priority score, escalation drafts), `40-ui-actions` (Today, Action Center, thread, follow-ups, log), `50-views` (KPI cards, tables, trend card, Overview), `55-sales-team` (Sales, Team and Scorecard), `60-ops` (Orders, Receivables, Inventory), `70-admin` (plans workflow, settings, tools, demo extras), `80-nav` (shell, routing, handlers), `87-fullbackup` (Admin > Tools > Download full backup; also the hook the Apps Script build uses for Restore), `99-expose` (test hooks), `styles.css`.
- My Dashboard (M8, 8 Nov 2026, [spec](../../design/dashboard-builder-spec.md)): `54-dash1-data` (measures, breakdowns, periods, scoped sources), `54-dash2-run` (query engine: members x windows, QoQ, benchmark, visual fit), `54-dash3-viz` (visuals), `54-dash4-lib` (card library, role defaults, caps, card sanitiser), `54-dash5-ui` (page, grid, pointer drag and resize, layouts, drill-down), `54-dash6-builder` (card builder with live preview), `99-zdash-expose` (test hooks). Layouts: `dashlayouts/u_<email>` (My layout), `dashroles/role_<role>` (published role default, Super admin only; `dashroles` is an admin collection, `dashlayouts` a shared one).
- Large histories (Nov 2026): the roll-up read in `20-data` is staged. Stage 1 (plant x group x month totals) paints Overview; stage 2 (per salesperson) runs in 40 ms slices and the Sales, Team, My Dashboard pages and the rules engine wait for it (`DS.spReady`). Below 150,000 roll-up rows, and for a Sales executive, everything is built in one pass as before. Salesperson-name matching (`fuzzyMatch`) is indexed once per master. Tests: `test/mkbigstore.mjs` (synthetic 45-plant x 19-month store, never committed), `test/perf-big.mjs` (first paint, long tasks), `test/tperf-figs.mjs` (figures identical to the old build).
- Activity indicator (`89-activity`, styles at the end of `styles.css`): thin bar at the top plus a status chip, shown while any background work runs (collection loads, roll-up stages, rules, intake, backup, restore, SAP feed, saves, database and Apps Script calls) and in red on an error. Read-only observer of existing state; tests `test/tact.mjs` and the restore check in `build/desk-gas/test/gas-e2e.mjs`. Stage-2 failure shows an error with Try again (`spGateHtml` in `80-nav`); tests `tperf-fault.mjs`.
- [test/](test/): headless self-test harness (in-memory stand-in for the platform database, Playwright scripts). Not shipped, holds no data.
- [build.mjs](build.mjs): build script.
- Design: [Architecture](../../design/architecture.md).
