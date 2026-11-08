---
title: Index — build/desk-gas/
summary: Build step and server for running the Desk as a Google Apps Script web app (Sheet store, domain sign-in), made from build/desk/dist.
status: draft
updated: 2026-11-05
related:
  - ../_index.md
  - ../desk/_index.md
  - ../../design/hosting-gcp.md
  - ../../decisions.md
---
# build/desk-gas/
- [build-gas.mjs](build-gas.mjs): reads `build/desk/dist/index.html`, injects the runtime shim and restore tool, writes `out/` (git-ignored).
- [src/Code.gs.js](src/Code.gs.js): server (`Code.gs`); [src/shim.js](src/shim.js): `window.claude` on `google.script.run`; [src/restore.js](src/restore.js): Admin > Restore from backup.
- [src/sap.gs.js](src/sap.gs.js): read-only S/4HANA OData feed (D73), joined to Code.gs by `build-gas.mjs`; page side is `build/desk/src/88-sapfeed.js`; spec [Data map: S/4 OData feed](../../data-map/s4-odata-feed.md).
- [README.md](README.md): paste, deploy, redeploy, move data from claude.ai.
- test/: `gas-unit.mjs` (server logic), `gas-e2e.mjs` (page, three sign-ins, upload, backup and restore round trip, failure cases), `gas-perf.mjs` (synthetic 80 MB store: calls and getValues volume), `gas-sap-speed.mjs` (faster reader: page size, fallback, parallel, key paging, auto-continue, cursor visibility, drop reasons; compares totals with `fixtures/sap.gs.5db7cfe.js`, the released reader), `gas-sap-model.mjs` (modelled timing of a 108,000-line month), `gas-sap.mjs` with `mock-s4.mjs` (mock S/4 OData server, synthetic data only: feed, paging, resume, cut-off, cancellation, failures, access, parity with the register upload).
