---
title: Index — build/gstin-verify/
summary: Google Apps Script that checks customer-master GSTINs (checksum, then a GST API) and fills verification, firm name and address in columns B–I.
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
- Provider: Vijay asked for Cygnet (cygnettaxindia.cygnet.one, 18 Nov). Its GSTIN Search endpoint, headers and token flow are not yet known; script takes them through Script Properties (`GST_API_URL`, `GST_API_HEADERS`).
