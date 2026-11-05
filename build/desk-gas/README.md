# Performance Desk on Google Apps Script

Three files: `Desk-Code.gs.txt` (server), `Desk-Index.txt` (the whole page), `appsscript.json.txt` (settings).
Two files are used because Apps Script keeps server code (`.gs`) and page (`.html`) apart. Only `Desk-Index.txt` changes between Desk versions.

## First time (as data@virgoasia.com)
1. Go to script.google.com, **New project**. Name it "Virgo Desk".
2. Project Settings (gear): tick **Show "appsscript.json" manifest file**. Open `appsscript.json`, replace everything with `appsscript.json.txt`.
3. Open `Code.gs`, select all, paste `Desk-Code.gs.txt`.
4. **+ Add a file > HTML**, name it exactly `Index`. Select all, paste `Desk-Index.txt`. (It is about 1.4 MB; the editor may take a minute.)
5. **Deploy > New deployment > Web app.** Execute as: **Me**. Who has access: **Anyone in virgoasia.com**. Deploy, accept the permission prompt (Spreadsheets, your email).
6. Copy the **Web app URL** (ends `/exec`). Open it once as yourself. The first open creates the database spreadsheet "Virgo Desk database (do not edit)" in your Drive.

## Every later Desk version (same link)
1. Open the project, open `Index`, select all, paste the new `Desk-Index.txt`. Save.
2. **Deploy > Manage deployments > pencil > Version: New version > Deploy.** The `/exec` URL does not change.
Paste `Desk-Code.gs.txt` the same way only if it was re-issued.

## Moving the data from claude.ai (once, on your own computer)
1. On the claude.ai Desk: Admin > Tools > **Download full backup**, then **Save all files** (a manifest and one or more part files). Keep them on your computer only.
2. Open the new Apps Script Desk: Admin > Tools > **Restore from backup**, select all the files together. The page checks sizes and checksums, then writes. It refuses if the database already holds data unless you tick "Replace everything". The result table must show every collection "ok".

## Good to know
- Access is by the Users list in Admin. Anyone else in the domain sees "Ask your admin for access" and receives no data.
- Only a Super admin can write the admin collections; the server refuses everyone else.
- **Reads are not filtered by row.** A signed-in user with a role can read every collection through browser tools, as on claude.ai today.
- Other people's changes appear within about 20 seconds (the page polls).
- If someone has several Google accounts open, the link may open under the wrong one; use a private window or `/u/1/`.
- Do not edit the database spreadsheet by hand. Its link is in Drive; its ID is in Project Settings > Script Properties (`DESK_SHEET_ID`).
- If a save fails with "database is full" or "quota", tell the Delivery Lead: Google Sheets and Apps Script have size and daily limits that this page cannot raise.
