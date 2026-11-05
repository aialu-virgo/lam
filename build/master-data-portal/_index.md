---
title: Index - build/master-data-portal/
summary: Source of the Virgo Asia Master Data Portal, a Google Apps Script web app separate from the Desk (material master requests).
status: draft
updated: 2026-11-05
related:
  - build/master-data-portal/README.md
  - build/_index.md
  - build/desk/_index.md
---

# build/master-data-portal/

Requested by Vijay (data@virgoasia.com), deployed by him. Not part of the Performance Desk; no Virgo data, no LLM calls, no auto-send beyond the request e-mails the form is built for. Not deployed or committed by the Full-Stack Engineer.

- [Master Data Portal - deployment steps](README.md) - setup, CONFIG, admins, limits
- `Code.gs` - CONFIG, validation, submit (LockService numbering), status search, admin API, xlsx export
- `Index.html` - shell, six module cards, navigation; includes the files below
- `ItemForm.html`, `StatusTracking.html`, `Admin.html` - views
- `Styles.html`, `JavaScript.html` - shared CSS and client script
- `appsscript.json` - manifest (Asia/Kolkata, V8, USER_DEPLOYING, DOMAIN, scopes)

## First-deployment check (needs a Google session)
1. `setup()` logs sheet and folder. 2. Submit a test item with a PDF; row, folder, two e-mails appear. 3. Search by number and by own e-mail. 4. As admin: change status, add comment, export .xlsx and open it. 5. As a non-admin domain user: Dashboard Reports is denied. 6. Add and remove a test admin.
