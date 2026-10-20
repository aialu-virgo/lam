---
title: Index — build/desk/
summary: Artifact source for the Desk. desk-v0.1 source: Data Intake and Admin masters.
status: active
updated: 2026-10-20
related:
  - build/_index.md
  - design/architecture.md
  - build/demo-data/_index.md
---

# build/desk/

- [index.src.html](index.src.html): page source (intake, admin). `node build.mjs` inlines the demo generator and writes `dist/index.html`, the file that is published.
- [build.mjs](build.mjs): build script.
- Storage and intake design: [Architecture](../../design/architecture.md).
