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
- [README.md](README.md): paste, deploy, redeploy, move data from claude.ai.
- test/: `node test/gas-unit.mjs` (server logic), `node test/gas-e2e.mjs` (page, three sign-ins, upload, backup round trip).
