---
title: Master Data Portal - deployment steps
summary: Step-by-step Google Apps Script setup, admin management, CONFIG changes and limits for the Virgo Asia Master Data Portal.
status: draft
updated: 2026-11-05
related:
  - build/master-data-portal/_index.md
  - build/_index.md
---

# Deploying the Virgo Asia Master Data Portal

Separate from the Performance Desk. Deploy while signed in as **data@virgoasia.com**. Nothing here uses Virgo data; the option lists in `CONFIG` are placeholders to replace.

## 1. Create the project
1. Open script.google.com signed in as data@virgoasia.com, choose **New project**, name it "Virgo Asia Master Data Portal".
2. Project Settings: tick **Show "appsscript.json" manifest file in editor**. Open `appsscript.json` and replace its content with the file in this folder.
3. Replace `Code.gs` with this folder's `Code.gs`.
4. Add HTML files (File + > HTML) named exactly `Index`, `ItemForm`, `Admin`, `StatusTracking`, `Styles`, `JavaScript`; paste each file's content. (Names are case-sensitive; the editor adds `.html`.)

## 2. Edit CONFIG (top of Code.gs)
Replace the placeholder dropdown lists (`OPTIONS`: department, finish, thickness type, size, brand, factory, plant code, purchase group, item category, price group, base UOM, material group, GST %) with the real lists. Other settings:

| Setting | Meaning |
|---|---|
| `NOTIFY_EMAIL` | receives every new request |
| `SEED_ADMIN` | always admin, cannot be removed |
| `LOGO_URL` | https image URL for the logo slot; blank shows a "V" badge |
| `SPREADSHEET_ID`, `DRIVE_FOLDER_ID` | leave blank to auto-create; fill to use existing ones |
| `STRICT_EMAIL_SEARCH` | true: non-admins can search only their own signed-in e-mail |
| `SHARE_FOLDER_WITH_DOMAIN` | true: each request folder is viewable by anyone in virgoasia.com with the link |
| `NOTIFY_REQUESTER_ON_STATUS_CHANGE` | e-mail requester when an admin updates a request |
| `MAX_FILE_MB`, `MAX_FILES`, `MAX_TOTAL_MB`, `ALLOWED_FILE_EXT` | upload limits |
| `REQUIRED_FIELDS` | which fields are mandatory (client and server both read it) |

Keep the GST list a subset of 0, 0.25, 3, 5, 12, 18, 28. After any CONFIG change, **Deploy > Manage deployments > Edit > New version > Deploy** (the web app URL stays the same).

## 3. Run setup once
1. Select function `setup`, click **Run**, then **Review permissions** and allow (Sheets, Drive, send e-mail, external requests, your e-mail address).
2. Check the log: it prints the new spreadsheet URL ("Virgo Asia Master Data Requests", sheets "Item Master Requests" and "Admins") and the Drive folder. Their IDs are saved in Script Properties (`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`); the request counter is `REQ_COUNTER`.
3. Do not rename or reorder the first 29 columns of "Item Master Requests". Columns 30-31 (Last Updated, Updated By) are audit columns.

## 4. Deploy as web app
**Deploy > New deployment > Web app**: Execute as **Me (data@virgoasia.com)**; Who has access **Anyone within virgoasia.com** (matches the manifest). Copy the `/exec` URL. Optional deep links: `?page=item`, `?page=status`, `?page=reports`.

### Access trade-off
With "Execute as: Me", `Session.getActiveUser().getEmail()` returns a visitor's e-mail **only when the visitor is in the same Workspace domain as the deployer**. Therefore:
- **Anyone within virgoasia.com (recommended):** visitors are identified, admin checks work, e-mail search can be limited to the visitor's own address. External people cannot use the portal.
- **Anyone (public):** external requesters can submit, but `getEmail()` is empty, so **no one can be recognised as admin** and admin screens stay locked. Not recommended; if ever needed, use a separate public form.

## 5. Admins
The seed admin is data@virgoasia.com. Admins open **User Management** in the portal to add or remove admin e-mails (stored in the "Admins" sheet). Editing that sheet directly also works. Admin addresses must be Google accounts in virgoasia.com. Every admin server function re-checks the list on each call; hiding buttons in the page is cosmetic only.

## 6. Using it
- **Item Creation** saves a row, uploads files to `<root folder>/<VIR-MAT-nnnnn>/`, and e-mails data@virgoasia.com and the requester ("New Item Creation Request - VIR-MAT-nnnnn"). If e-mail or upload fails, the saved request is kept and the page reports the problem.
- **Status Tracking** searches by Request Number or e-mail; only status, item, date and comments (admin addresses removed) are shown.
- **Dashboard Reports** (admin) shows KPIs, charts, the request table, status/comment editing (comments are appended with time and admin e-mail) and **Export to Excel** (builds a temporary sheet, exports it as .xlsx, trashes the temp file).

## 7. Limits to know
- **Uploads** travel as base64 through `google.script.run`: about 33% larger than the file, and the whole request must fit in one call. Defaults: 5 files, 10 MB each, 25 MB total. Larger payloads may fail or be slow; raise limits only after testing. Very large drawings should be shared by link in Remarks.
- **MailApp quotas:** about 100 recipients/day on consumer accounts, about 1,500/day on Workspace (check the current Google quota page). Each request uses 2; each status e-mail uses 1.
- **Execution time** is 6 minutes per call; LockService waits up to 30 s, so a burst of submissions queues rather than collides.
- Drive folder visibility follows `SHARE_FOLDER_WITH_DOMAIN`; otherwise only the deployer can open attachments.
- The 10 million cell cap of one spreadsheet is far above expected volume.

## 8. Updating after code changes
Paste the changed file, then **Deploy > Manage deployments > pencil > Version: New version > Deploy**. Test with the "Test deployments" `/dev` URL first if desired.

## Not verified
Written and syntax-checked outside Google. Not yet run inside Apps Script: live sign-in, Drive/Mail/Sheets calls, the .xlsx download inside the web-app iframe, chart rendering. Run the checklist in [_index.md](_index.md) after the first deployment.
