# Performance Desk on Google Apps Script

Three files: `Desk-Code.gs.txt` (server), `Desk-Index.txt` (the whole page), `appsscript.json.txt` (settings).
Two files are used because Apps Script keeps server code (`.gs`) and page (`.html`) apart. Only `Desk-Index.txt` changes between Desk versions.

## First time (as data@virgoasia.com)
1. Go to script.google.com, **New project**. Name it "Virgo Desk".
2. Project Settings (gear): tick **Show "appsscript.json" manifest file**. Open `appsscript.json`, replace everything with `appsscript.json.txt`.
3. Open `Code.gs`, select all, paste `Desk-Code.gs.txt`.
4. **+ Add a file > HTML**, name it exactly `Index`. Select all, paste `Desk-Index.txt`. (It is about 1.4 MB; the editor may take a minute.)
5. In the toolbar pick the function **setup** and press **Run** (only the project owner or a Super admin can run it; it is refused for anyone else). Accept the permission prompt (Google Sheets and your email address). This creates the database spreadsheet "Virgo Desk database (do not edit)" in your Drive, once. It is safe to run again.
6. **Deploy > New deployment > Web app.** Execute as: **Me**. Who has access: **Anyone in virgoasia.com**. Deploy.
7. Copy the **Web app URL** (ends `/exec`) and open it as yourself. Then add the other users in Admin > Users.

## Every later Desk version (same link)
1. Open the project, open `Index`, select all, paste the new `Desk-Index.txt`. Save.
2. **Deploy > Manage deployments > pencil > Version: New version > Deploy.** The `/exec` URL does not change.
Paste `Desk-Code.gs.txt` the same way only if it was re-issued.

## Moving the data from claude.ai (once, on your own computer)
**Cutover rule: no uploads and no edits on the claude.ai Desk between Download and Restore.** Anything changed after the download is not in the backup. Tell the team to stay out until the restore is verified.
1. On the claude.ai Desk: Admin > Tools > **Download full backup**, then **Save all files** (a manifest and one or more part files). Keep them on your computer only. If the page says data changed while the backup was being made, make it again.
2. Open the new Apps Script Desk: Admin > Tools > **Restore from backup**, select all the files together. The page checks every file, id, size and checksum before it writes anything. It refuses when the database already holds data unless you tick "Replace everything".
3. **Keep the tab open** until the table shows every collection "ok". If it stops partway the page says "Restore incomplete": tick "Replace everything" and run Restore again (a re-run clears first, so it is safe).

## Good to know
- Access is by the Users list in Admin. Anyone else in the domain sees "Ask your admin for access" and receives no data.
- Only a Super admin can write the 23 admin collections (periods, users, plants, cells, inv, roll, uploads ... ); the server refuses everyone else. `planlocks` is Super admin or Management / HO only. Unknown and inactive users cannot read or write.
- **Action and follow-up permissions are enforced by the page, as on claude.ai.** The server lets any active user write `actions`, `followups`, `potential`, `phasing` and `log`; the page decides who may respond to, assign, verify or draft for an action. Not enforced on the server either: field-level changes, approver differs from proposer, closed and locked quarters, and the audit trail (written by the page).
- **Reads are not filtered by row.** A signed-in user with a role can read every collection through browser tools, as on claude.ai today.
- Other people's changes appear within about 30 seconds (the page checks a small revision map and re-reads only what changed).
- If someone has several Google accounts open, the link may open under the wrong one; use a private window or `/u/1/`.
- The database is one spreadsheet with one sheet per collection (`c_inv`, `c_users` ...), plus two Script Properties (`DESK_SHEET_ID`, `DESK_REVS`). Do not edit it by hand. Its link is in your Drive.
- If a save fails with "database is full" or "quota", tell the Delivery Lead: Google Sheets and Apps Script have size and daily limits that this page cannot raise.
- **Store size / slow first load:** Admin > Tools > **Measure store size** shows documents and characters per collection. If the first page load is slow or a read fails, lower `PAGE_CHARS` at the top of `Code.gs` (for example from 2500000 to 1000000), paste, and make a New version.

## SAP S/4HANA feed (read only, from 1 Oct 2026)
Super admin or project owner only. Functions are run from the editor toolbar (pick the function, Run). Nothing is ever written to SAP; data to 30 Sep 2026 is never touched.
1. **Re-paste** `Desk-Code.gs.txt`, `appsscript.json.txt` and `Desk-Index.txt`, make a New version, run `setup` again and allow the two new permissions (call an outside service; create a trigger).
2. **Script properties** (Project Settings > Script properties): `SAP_BASE_URL` (https address only), `SAP_USER`, `SAP_PASSWORD`; optional `SAP_COMPANY_CODE` (default 1000), `CANCEL_MODE` (`exclude` default, or `mirror`), `SAP_BILLING_SHAPE` (`A` or `B`; normally left empty, `sapVerifyMetadata` chooses). They are read only by the server; they are not in the code, the sheet, the backup, the logs or the page.
3. `sapVerifyMetadata`: reads `$metadata` of the billing, product and customer services and reports ok or GAP per entity set and field.
4. `sapShadowRun`: reads October 2026, compares documents, lines, sheets, sq ft and value per plant-month with what is loaded, and writes nothing. Tolerance: value within Rs 1, sq ft within 4 (rounding).
5. `sapSync`: the real run. Reads SAP, checks the count, and parks the rows (admin-only collection `sapstage`). Stops at 5 minutes and resumes from a saved cursor on the next call. Refused until a shadow run has been done.
6. Data Intake > **SAP S/4HANA live feed** > **Load SAP feed** (Super admin): the page's own register intake turns the parked rows into cells and replaces whole plant-months; credit memos go through the credit-note intake. A thinner replacement is held until a person ticks the confirmation. Closed quarters and locked credit-note months are skipped.
7. `sapInstallDailyTrigger` (one daily run, about 02:30 IST; off until called), `sapRemoveDailyTrigger`.
If SAP answers 403 or refuses the connection the message says an IP allow-list may be the cause (Apps Script uses Google addresses that are not fixed).
