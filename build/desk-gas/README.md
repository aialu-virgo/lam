# Performance Desk on Google Apps Script

Files: `Desk-Code.gs.txt` (server), `appsscript.json.txt` (settings) and the page, as `desk-page-<build>.html` (for Drive, preferred) and as numbered parts `Desk-Index.txt`, `Desk-Index2.txt` ... (fallback; the editor cuts a single file off at about 1 MB when saving, so no part is over 700 KB).
Build id: `<yyyymmddhhmm>-<git hash>`, a fixed-width UTC time first, so file names sort in release order. Only the page changes between Desk versions; `Code.gs` changes only when server functions do (with the Index fallback it also changes whenever a part's length or checksum does).

### How the page is served: from Google Drive (preferred)
The page is not pasted into the editor at all. The Delivery Lead uploads each release to a Drive folder named **Virgo Desk page (do not edit)** as `desk-page-<yyyymmddhhmm>-<hash>.html` (plain text, no conversion; old files stay; a `desk-page-*.html` file with any other name is refused with an error naming it). `Code.gs` reads the newest one with DriveApp, checks its header (length, checksum, server version) and serves it. A file that fails a check is never served; the Web app shows an error page that names the file and the reason.

**One-time setup (Vijay, as data@virgoasia.com)**
1. Paste the new `Desk-Code.gs.txt` into `Code.gs` and `appsscript.json.txt` into `appsscript.json` (it adds the Drive read-only permission).
2. Run **setup** (or **pageDiag**) from the toolbar and accept the new permission "See and download all your Google Drive files".
3. Project Settings > Script properties > add `DESK_PAGE_FOLDER_ID` = the folder id the Delivery Lead gives you (the part of the folder link after `/folders/`).
4. Run **pageDiag**, open Execution log: it must say `Check: passed`. Then Deploy > Manage deployments > New version.

**Every later release:** the Delivery Lead uploads the new `desk-page-<yyyymmddhhmm>-<hash>.html` to the folder. The server looks up the newest file on every request (one Drive listing) and caches only its content for 10 minutes, so a new upload, good or bad, takes effect at once; a bad one shows its error page. Users do a **hard reload** (Ctrl+Shift+R) to drop the old page from the browser. Vijay does nothing, unless `Code.gs` changed (then paste it and make a New version; the error page says so when the page needs a newer `Code.gs`).
**Rollback:** set Script property `DESK_PAGE_FILE_ID` to the id of an older `desk-page-*.html` (it pins that exact file); delete the property to go back to "newest". **Check anything:** run **pageDiag** from the editor (folder, chosen file, build, length, check result, server version; owner or Super admin only). Keep the folder tidy: every request reads each file name in it.
The Index files below are the fallback: they are used only while `DESK_PAGE_FOLDER_ID` and `DESK_PAGE_FILE_ID` are both unset.

## Fallback: the page as Index files in the editor
### The page files (this build)
Create one **HTML** file in the editor (the server reads each with `createTemplateFromFile(name).getRawContent()`, which returns the text exactly; the older `createHtmlOutputFromFile` call refuses a fragment with "Malformed HTML content" and must not be used) for each row, named exactly as shown (no `.html`), select all, paste the matching `.txt`, **Save**. Then check each file: click in it, press Ctrl+End, and the last line with text (ignore an empty line at the very end) must be the text in the last column. If it is not, the save cut it off: select all, delete, paste again.
<!--@@PARTS_TABLE@@-->
If a part is missing, cut short or from another version, the Web app shows "The Desk page is not fully installed" and names the file, instead of a blank page.
**If the page still fails:** in the editor pick the function **indexDiag**, press **Run**, then **Execution log** (or View > Logs) and send the lines to the Delivery Lead. They show, per file, the exact length and checksum against the expected values, the first and last 80 characters, and what the old HTML-parsing call does.
Stopgap while a check is being fixed: in `Code.gs` set `var INDEX_MANIFEST = null;` (the page then loads without length or checksum checks), and make a New version.
Split size: `MAX_PART_BYTES=500000 node build-gas.mjs` builds smaller parts (default 700000).

## First time (as data@virgoasia.com)
1. Go to script.google.com, **New project**. Name it "Virgo Desk".
2. Project Settings (gear): tick **Show "appsscript.json" manifest file**. Open `appsscript.json`, replace everything with `appsscript.json.txt`.
3. Open `Code.gs`, select all, paste `Desk-Code.gs.txt`.
4. **+ Add a file > HTML** for each page part: `Index`, `Index2`, `Index3` ... (table above). Paste each `Desk-Index*.txt` into its file, save, and check its last line.
5. In the toolbar pick the function **setup** and press **Run** (only the project owner or a Super admin can run it; it is refused for anyone else). Accept the permission prompt (Google Sheets and your email address). This creates the database spreadsheet "Virgo Desk database (do not edit)" in your Drive, once. It is safe to run again.
6. **Deploy > New deployment > Web app.** Execute as: **Me**. Who has access: **Anyone in virgoasia.com**. Deploy.
7. Copy the **Web app URL** (ends `/exec`) and open it as yourself. Then add the other users in Admin > Users.

## Every later Desk version (same link)
1. Open the project. Paste the new `Desk-Code.gs.txt` into `Code.gs`, and each `Desk-Index*.txt` into its file (`Index`, `Index2` ...; add a new HTML file if there are more parts than before; delete extra files if there are fewer). Save each and check its last line (table above).
2. **Deploy > Manage deployments > pencil > Version: New version > Deploy.** The `/exec` URL does not change.
3. Open the `/exec` link and hard reload (Ctrl+Shift+R; Cmd+Shift+R on Mac), so the browser does not keep the old page.

## Moving the data from claude.ai (once, on your own computer)
**Cutover rule: no uploads and no edits on the claude.ai Desk between Download and Restore.** Anything changed after the download is not in the backup. Tell the team to stay out until the restore is verified.
1. On the claude.ai Desk: Admin > Tools > **Download full backup**, then **Save all files** (a manifest and one or more part files). Keep them on your computer only. If the page says data changed while the backup was being made, make it again.
2. Open the new Apps Script Desk: Admin > Tools > **Restore from backup**, select all the files together. The page checks every file, id, size and checksum before it writes anything. It refuses when the database already holds data unless you tick "Replace everything".
3. **Keep the tab open** until the table shows every collection "ok". If it stops partway the page says "Restore incomplete": tick "Replace everything" and run Restore again (a re-run clears first, so it is safe).

## Good to know
- The admin job queue (undo, clear demo, set zones) uses a server-side lease per job (`deskLease`, Script Property `DESK_LEASES`): one open tab runs a job, a second is refused until the lease expires (at most 10 minutes). Super admin only.
- Access is by the Users list in Admin. Anyone else in the domain sees "Ask your admin for access" and receives no data.
- Only a Super admin can write the admin collections (periods, users, plants, cells, inv, roll, uploads ... ); the server refuses everyone else. `planlocks` and the `geography` master (states, districts, PIN list; Admin › Geography, D80) are Super admin or Management / HO only. Unknown and inactive users cannot read or write.
- **Action and follow-up permissions are enforced by the page, as on claude.ai.** The server lets any active user write `actions`, `followups`, `potential`, `phasing` and `log`; the page decides who may respond to, assign, verify or draft for an action. Not enforced on the server either: field-level changes, approver differs from proposer, closed and locked quarters, and the audit trail (written by the page).
- **Reads are not filtered by row.** A signed-in user with a role can read every collection through browser tools, as on claude.ai today.
- Other people's changes appear within about 30 seconds (the page checks a small revision map and re-reads only what changed).
- If someone has several Google accounts open, the link may open under the wrong one; use a private window or `/u/1/`.
- The database is one spreadsheet with one sheet per collection (`c_inv`, `c_users` ...), plus two Script Properties (`DESK_SHEET_ID`, `DESK_REVS`). Do not edit it by hand. Its link is in your Drive.
- If a save fails with "database is full" or "quota", tell the Delivery Lead: Google Sheets and Apps Script have size and daily limits that this page cannot raise.
- **Store size / slow first load:** Admin > Tools > **Measure store size** shows documents and characters per collection. If the first page load is slow or a read fails, lower `PAGE_CHARS` at the top of `Code.gs` (for example from 2500000 to 1000000), paste, and make a New version.

## SAP S/4HANA feed (read only, from 1 Oct 2026)
Super admin or project owner only. Functions are run from the editor toolbar (pick the function, Run). Nothing is ever written to SAP; data to 30 Sep 2026 is never touched.
1. **Re-paste** `Desk-Code.gs.txt`, `appsscript.json.txt` and every `Desk-Index*.txt` part, make a New version, run `setup` again and allow the two new permissions (call an outside service; create a trigger).
2. **Script properties** (Project Settings > Script properties): `SAP_BASE_URL` (https address only), `SAP_USER`, `SAP_PASSWORD`; optional `SAP_COMPANY_CODE` (default 1000), `CANCEL_MODE` (`exclude` default, or `mirror`), `SAP_BILLING_SHAPE` (`A` or `B`; normally left empty, `sapVerifyMetadata` chooses). They are read only by the server; they are not in the code, the sheet, the backup, the logs or the page.
3. `sapVerifyMetadata`: reads `$metadata` of the billing, product and customer services and reports ok or GAP per entity set and field.
4. `sapShadowRun`: reads October 2026, compares documents, lines, sheets, sq ft and value per plant-month with what is loaded, and writes nothing. Tolerance: value within Rs 1, sq ft within 4 (rounding).
5. `sapSync`: the real run. **Switched off until the Script Property `SAP_SYNC_ENABLED` is `yes`** (set it only when the Delivery Lead says so; the daily trigger obeys it too). Reads SAP, checks the count, and parks the rows (admin-only collection `sapstage`). Stops at 5 minutes and resumes from a saved cursor on the next call. Refused until a shadow run has been done.
6. Data Intake > **SAP S/4HANA live feed** > **Load SAP feed** (Super admin): the page's own register intake turns the parked rows into cells and replaces whole plant-months; credit memos go through the credit-note intake. A thinner replacement is held until a person ticks the confirmation. Closed quarters and locked credit-note months are skipped.
7. `sapCustomerSync` (D78): reads the customer master (company scope, state, PIN, city, district, GSTIN, group, sales group) from the business-partner service and stages it, read only. Needs a passing `sapVerifyMetadata` (a missing customer name blocks this read only). Loading the staged customers into the Desk waits for the page hook (customer intake keyed by source system).
8. `sapInstallDailyTrigger` (one daily run, about 02:30 IST; off until called), `sapRemoveDailyTrigger`.
### Reading October fast, without re-running by hand (m8-sap-speed)
Steps for Vijay (re-paste `Desk-Code.gs.txt` into `Code.gs` and make a New version; the page files `Desk-Index*.txt` do not change for this):
1. Run **sapVerifyMetadata** once if its last result is older than the paste (the reads refuse to start without a passing verify).
2. Run **sapResetCursors** once. The new reader pages by document number, so a read position saved by the old reader is not continued (the month would start again anyway); this makes that explicit. Skip it if sapStatus shows no saved position.
3. Run **sapShadowRunAuto** (the editor needs no argument; to read another month type `sapShadowRunAuto('2026-11')` in a scratch function). If one 5-minute run is not enough it installs ONE one-off trigger that continues about a minute later, and so on until the month is done. **Do nothing else**: no second click, no manual re-run. Close the tab if you like.
4. Check progress at any time with **sapStatus** (or View > Execution log): months done, lines read so far, "about N more runs (estimate)", whether the last run resumed, and a run log (from, to, total). Each run line in the log says `resumed` true or false with `skip`, `total`, `run`.
5. When it says "Finished in N runs. No trigger is left.", read the result: the differences per plant-month, and `drops`: how many lines were counted and how many were left out, by reason (`plantNotInStore`, `plantInactive`, `noProductGroup`, `badQtyOrNet`, `futureDate`, `duplicateLine`...) with the first few values seen. **If fewer than a quarter of the lines SAP sent were counted (including none) the run says WARNING with both numbers: send the whole message to the Delivery Lead; the comparison is not valid.**
   The shadow run refuses to start (reads nothing) if the Desk's plants list (Admin > Plants) has no active plant; after a restore, finish the restore first.
6. To stop an automatic run: **sapStopAuto** (the read position is kept). To discard a position on purpose: **sapResetCursors**. The sync has the same chain: **sapSyncAuto** instead of sapSync (needs SAP_SYNC_ENABLED = yes and a finished shadow run, as before; it has the same run cap, watchdog and stale report; only one automatic chain at a time). sapSync and the shadow run refuse to start when the Desk has no active plant, and a shadow run for a different month is refused while one is part-way (finish it with `sapShadowRunAuto()`, or discard it on purpose with sapResetCursors).
Product types: the tenant's `Z3LM` (laminates, doors and compact boards; Material Group 3 decides Door or Compact board) and `Z3PC` (PVC sheet) are built in and are turned into the register codes ZABLAM and ZCBPVC for both the shadow comparison and the staged rows, so Load SAP feed classifies exactly as the shadow does. `ROH` and `ZSCR` stay out. To add a code: Script Property `SAP_TYPE_MAP`, JSON like `{"ZNEW":"LAM","ZNEW2":"PVC"}` (LAM or PVC). A bad value is refused before anything is read.
Lines left out of the comparison are now split by reason (`notANumber`, `qtyZero`, `qtyNegative`, `netNegative`, `noProductGroup`, ...), each with two sample lines in the log (`dropLines`: document/item, quantity, unit, net, item category, higher-level item). The item category and higher-level item are read only after `sapVerifyMetadata` has found them on the tenant, so run it once after this paste.
Optional Script Properties (all have safe defaults; set only if told): `SAP_PAGE_TOP` (rows per page, 10 to 5000, default 500), `SAP_CONCURRENCY` (pages at once, 1 to 10, default 4), `SAP_LOOKUP_BATCH` (keys per product/customer lookup, 5 to 40, default 40; halved by itself if SAP refuses the long address), `SAP_AUTO_MAX_RUNS` (default 8), `SAP_RUN_BUDGET_MS` (default 300000).
What it does by itself: a page SAP refuses or times out is retried once, then halved (500, 250, 125, 62, 50) and the size that worked is remembered in `SAP_PAGE_EFF` (delete that property to try the full size again; changing `SAP_PAGE_TOP` also resets it); a server that sends fewer rows than asked sets the size to what it sends. If two runs would overlap the run flag stops the second one; an automatic run that finds the flag held waits a minute and tries again (6 times at most). A watchdog trigger is set before every automatic run starts (about 8.5 minutes out), so a run that Google kills at 6 minutes is continued by it from the saved position; a normal end replaces it. If the watchdog is ever missing while an automatic run is recorded, sapStatus says "stale" and tells you to run sapShadowRunAuto again. Product and customer lookups stop when the run budget cannot take another call; the round is put back whole, what was fetched stays in the cache, and the next run carries on. An error ends the automatic chain, removes its trigger, and keeps the read position. At the end of each month the reader counts each range of document numbers again; a difference (documents added, cancelled or numbered behind the read position while the month took several runs) is shown as a warning with both numbers and is never an error. A document numbered behind the read position is not re-read in that run (the next daily read re-checks changed documents).
Not checked on the real tenant: SAP's own limit on page size and on `$top` with `$expand`, whether it throttles four calls at once, the real time per call, and that `BillingDocument ge/lt/gt` filters on text keys behave as in the mock.

If SAP answers 403 or refuses the connection the message says an IP allow-list may be the cause (Apps Script uses Google addresses that are not fixed).

## Live deployment
- Web app (virgoasia.com sign-in; the page is served from the Drive folder "Virgo Desk page (do not edit)" once DESK_PAGE_FOLDER_ID is set, otherwise from the Index parts Index, Index2 …, each read raw): https://script.google.com/a/macros/virgoasia.com/s/AKfycbydN1i3bDYOE1BOaqSat4BvRIfDAJu30qWAXfCKc-QwQ1E58Z9x0OiWaRAFziW9FX5GLw/exec (deployed 8 Nov 2026, D76)
