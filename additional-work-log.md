---
title: Additional work log
summary: Requests outside the one-artifact scope, held for the Principals with effort spent.
status: active
updated: 2026-11-18
related:
  - CLAUDE.md
  - build/gstin-verify/_index.md
---

# Additional work log
| Date notified | What | Why it serves the goal | Effort spent | Status |
|---|---|---|---|---|
| 2026-10-21 | Host the Desk outside claude.ai on a Virgo-owned server with its own login (email + password, initial Virgo@2026, forced change at first login), server-side role filtering and database. | Most Desk users have no claude.ai account, so the claude.ai link cannot reach them (Vijay, 21 Oct). | Analysis only; estimate 2–3 days once server access is given. | Approved by Vijay 21 Oct (D24): Virgo Google Cloud; design in progress. |
| 2026-11-18 | Google Apps Script to verify ~20,000 customer GSTINs against GST data (GST verification, firm name, state, district, city, pincode, address) — [build/gstin-verify/](build/gstin-verify/_index.md). | Clean customer master feeds the Desk customer data. | Script + self-test + blind check, ~1 h. | Requested by Vijay 18 Nov; delivered; API provider and cost to be chosen by Vijay. |
