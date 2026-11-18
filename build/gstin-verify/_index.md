---
title: Index — build/gstin-verify/
summary: Google Apps Script that checks customer-master GSTINs (checksum, then a GST API) and fills status, names and address in the sheet.
status: active
updated: 2026-11-18
related:
  - build/_index.md
  - additional-work-log.md
---

# build/gstin-verify/
Requested by Vijay, 18 Nov 2026 (outside the Desk scope; logged in [Additional work log](../../additional-work-log.md)).

- `Code.gs` — paste into the sheet's Extensions › Apps Script. Setup steps in its header comment.
- `test.js` — `node build/gstin-verify/test.js`; checks the checksum and the response parser.

Open: the API provider is not chosen. The parser reads the standard GSTN taxpayer fields (`lgnm`, `tradeNam`, `sts`, `pradr.addr`); confirm with "Test first GSTIN" before a full run.
