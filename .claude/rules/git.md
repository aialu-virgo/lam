---
title: Rules — git
summary: Short-lived task branches, commits that name the milestone, tagged artifact versions, and what .gitignore blocks.
status: active
updated: 2026-10-20
related:
  - .claude/rules/data-handling.md
  - .claude/_index.md
---

# Git
- Short-lived branch per task (`m<milestone>-<topic>`); merge to `main` when done. Never force-push.
- Commit as part of finishing, with a message saying what changed and which milestone it serves.
- Tag each published artifact version (`desk-v0.1`, `desk-v0.2` …) and record the artifact link and tag in [Decisions](../../decisions.md).
- `.gitignore` covers credentials, `.env`, tokens, SAP connection files, `*.xlsx`/`*.csv` uploads and any exported data. The demo-data generator script is allowed; its output is not committed.
