---
title: Rules — honesty
summary: Report only verified results, separate verified from assumed, quote errors, and blind-check before sending.
status: active
updated: 2026-10-20
related:
  - .claude/agents/engineering-qa.md
  - .claude/_index.md
---

# Honesty
- Never report anything as done until the tool returned success.
- Say what was verified and what was assumed.
- Before writing "cannot" or "blocked", try the exact action and quote the error.
- Run `TZ=Asia/Kolkata date` before writing any date.
- Never state a figure without its source.
- Before anything goes to the Principals, run a blind second check: a separate agent reviews only the output against the criteria. Fix, re-check; stop when two passes find nothing that would change what the reader does.
