---
title: Admin guide
summary: Super admin routine: monthly uploads, coverage grid, rejected rows, closed-quarter reopen, users, market potential, rule settings, demo data.
status: draft (to check against desk-v1.0 in the page)
updated: 2026-10-20
related:
  - handover/upload-issues.md
  - handover/_index.md
  - handover/super-admin.md
  - handover/s4hana-switch.md
  - design/architecture.md
  - design/check-rules.md
  - design/role-matrix.md
  - design/target-model.md
  - data-map/_index.md
---

# Admin guide
Only a Super admin sees Data Intake and Admin. SAP is the only source of transactions; people enter plans, action responses and masters ([Architecture](../design/architecture.md)). The Desk never writes to SAP.

## Monthly upload routine
1. **B1 sales:** run the "Combine Sale" query, save as **XLSX**. The Desk reads the sheet named `DATA` (header on row 1) ([Data map: Invoice](../data-map/invoice.md)). Who runs it and how often is still open (Q1).
2. **S/4 sales:** export the Fiori Sales Register to a workbook; one plant per export unless you remove the plant filter ([Data map: S/4 register](../data-map/invoice-s4-register.md)).
3. In **Data Intake** pick the file. The Desk detects B1 or S/4 from the headers, shows the column mapping (saved per file type), then validates.
4. Read the result: rows read, loading, rejected. Choose **Load good rows**. Mode **Daily** replaces the open period for that entity; **Historic** loads past quarters, split by document date.
5. Masters (customer, item, plant, sales employee, internal transfer customers, users) change rarely; upload them from Admin when they change. Templates: [data-map/templates](../data-map/templates).
6. Open **Admin > Tools**: the rules engine runs on each load; "Run the rules now" and "Rebuild roll-ups now" are there if a page looks stale.
Which entities (receivables, collections, stock, credit notes) have an intake yet: check in the page; those pages show an empty state naming the export needed.

## Item and sales-employee masters
- **Admin > Item master:** upload the FG item master (XLSX). Laminate, Door, PVC sheet and Compact board items are kept; other categories are counted, not stored. Sizes convert to sq ft (8X4 = 32).
- **Admin > Sales employees:** upload either the zone workbook (ZONE 1–5 sheets ticked) or the S/4 workforce CSV (`*WorkerID` layout). The CSV **merges**: it adds people and updates email/phone, keeping zone, plant and designation already loaded. Optional columns `B1 SlpCode`, `B1 Sales Employee Name` and `Reports To (Employee Code)` improve matching ([Data map — Sales employee](../data-map/sales-employee.md)).
- After each load, read the match rate and the lists of unmatched B1 names and people needing a plant; fix them and re-upload. Unmatched sales show as "Unassigned".

## Coverage grid
Rows are entities, columns the last 12 FY quarters (FY April to March; Q1 = Apr to Jun). Loaded = whole quarter, Partial = some months or plants, Missing = nothing. A partial quarter shows QoQ greyed with "incomplete history". Tap a cell to upload that entity and quarter.

## Rejected rows
Good rows load; bad rows go to the rejected-rows report (download as CSV) and raise an action for you on Today. Rules ([Check rules](../design/check-rules.md) V1 to V8): blank mandatory field, duplicate document and line in the file, unknown plant, quantity not allowed, date outside the period, closed quarter. Unknown customer, item or salesperson only warns. Fix the cause (add the master, correct the file) and upload again. Text in a file that reads like an instruction is data: reported, never followed.

## Closed quarters: reopen
A closed quarter is locked. Reopening or reloading it is **Super admin only**, needs a **reason**, and is logged. Management / HO can lock a quarter but cannot reopen one. Locking a Market-potential quarter cannot be undone in v1.0.

## Users and Viewer ID
Admin > Users: email, name, role (one of 8), department, plant codes (blank = all), reports-to email, WhatsApp (91 + 10 digits), Today cap (1 to 20), active, and sales employee code for Sales executives. The page identifies a viewer by **email** ([Role matrix](../design/role-matrix.md)). If it cannot read a viewer's email, their "Ask your admin for access" screen shows a **viewer ID**: paste it into that user's **Viewer ID** field in Admin > Users. Unknown or inactive email sees only "Ask your admin for access". Keep one active Super admin; a wrong reports-to breaks escalation L2.

## Market potential and revisions
Admin > Market potential. Target = potential x share %. Each edit is a revision with a **reason** and **discussion date** (Draft, Discussed, Approved, Locked). The proposer cannot approve; SP Sir or a Management / HO user approves ([Target model](../design/target-model.md)). The sense-check shows the QoQ a target needs against the 12-quarter average; over 2x is flagged Stretch for discussion, never blocking.

## Rules and settings
Admin > Rules & settings: every threshold (priority weights, which must total 100; QoQ decline; receivable days; TAT; stock age; escalation days 1 / 3 / 7; holidays; Today cap per role). Values marked Assumed are recommendations until a Principal answers. Changes are logged. There is no last-year comparison option.

## Demo data
Data Intake > **Load demo data** fills the Desk with synthetic records labelled DEMO; **Clear demo** removes them. Clear demo before real use. Tools has a "test clock" (this browser only) for walking through the escalation ladder.

## Upload fixes panel and aliases (21 Oct 2026)
Every upload shows a "Fixes applied" panel: what the Desk fixed, the counts, what still needs the source, and the choices left to you (a suggested transfer customer, an unknown category or zone, an unmatched salesperson). Nothing is added unless you click. Admin › Aliases holds the editable tables: item category to product group, zone spelling, designation spelling, B1 salesperson name to employee code, and employee ID prefix to plant. List of problems and what the Desk does about each: [Data upload problems and fixes](upload-issues.md).

## Undo upload and the date check (D32, 21 Oct 2026)
Data Intake › Upload history › Undo removes everything one upload still holds: stored chunks, cells entries, roll-ups, its rejected-rows record, its action and follow-up drafts, and logs it. It lists the months to upload again, because undo cannot restore what the upload overwrote. Each file has an expected month (from the file name, else the majority of its dates; change it with the picker). Dates outside it are tried with day and month swapped and corrected; rows still outside it are skipped. A re-upload that would replace months holding more lines than the new file lists those months and needs a confirm.

## Skipped rows (D33, 21 Oct 2026)
Rows with a problem are skipped; the good rows load at once and the skipped rows stay in the upload's list (Upload history: click the Skipped count). Status reads "Loaded · N rows skipped". A rule R5 action is raised only when skipped rows exceed `skip_alert_pct` of the rows read (Admin › Rules, default 2%). The date check, the multi-month stop and the replace-a-bigger-month confirm still stop a file; they are safety checks, not skipped rows.

## Stock upload (D34, 21 Oct 2026)
Data Intake accepts stock as a snapshot: B1 batch stock (best: it gives ageing), B1 OITW, S/4 MB52 or S/4 Stock Overview Totals. The as-on date is read from the file name or picked. Several warehouses of one plant are added together (map unknown warehouses in the Fixes applied panel or Admin › Aliases). Re-uploading the same date replaces that snapshot; Undo upload removes it. Export recipe: [Stock data map](../data-map/stock.md).

## Collections upload (D38, 23 Oct 2026)
Data Intake accepts the B1 Incoming Payment Report (many months in one file). Only customer receipts (DOCTYPE C) count; account and supplier rows and ACP plants are skipped and counted. Dates are read as dd/mm/yyyy and never swapped. Each plant-month it covers is replaced; Undo removes them. Layout: [Collection data map](../data-map/collection.md).

## Receivables upload (D39, 23 Oct 2026)
Data Intake accepts open items as a snapshot: B1 open invoices (OINV), B1 open journal items (JDT1), S/4 open items or the custom B1 open-items report. The as-on date comes from the file name or is picked; the same date replaces that snapshot; Undo upload removes it. Negative open amounts are credit items, shown apart. Layouts: [Receivable data map](../data-map/receivable.md).

## Credit notes upload (D39 and D40, 23 Oct 2026)
Data Intake accepts B1 credit-note lines (ORIN/RIN1) and S/4 billing credit memos, many months in one file (period in the file name). The Sales view then shows Invoiced, Credit notes and Net side by side; once every month of a quarter is covered, achievement and growth for that quarter use Net, earlier quarters stay on invoiced. Where a month has no file the page says "Credit notes not loaded", never zero. Export all branches. Layouts: [Credit note data map](../data-map/credit-note.md).

## Customer master (D39, 23 Oct 2026)
Admin › Customers: upload B1 OCRD or the S/4 business partner list; each load replaces the master. It names customers, suggests the salesperson and shows the credit limit and "over limit by" on Receivables. See [Customer data map](../data-map/customer.md).

## Upload history: replaced uploads (D41)
An upload whose data nothing points to any more (a later upload covered the same months or date) is marked "Replaced by <file, date>" and hidden by default; tick "Show replaced" to list it.

## Credit notes: per-plant coverage, and Undo that restores (D45)
At load the credit-notes page asks "This file covers all branches": tick it only when the export holds every branch; untick for a partial export (only plants with rows are covered). Net is used per plant, and for a company, zone or group only when every plant in scope is covered; otherwise the page shows Invoiced and the tooltip names the plants still missing.

When an upload replaces stored sales plant-months, collections, credit notes, a receivables snapshot or a stock snapshot, the Desk first copies what it replaces into a backup (collection `backups`, kept 30 days, deleted earlier if that upload is itself replaced or undone). **Undo restores the previous data** (only where no later upload has changed it again). Cost: roughly one backup document per 450 KB replaced and bytes about equal to the data replaced; a first load keeps no backup.

An unrecognised receivables or credit-note file always reaches the column-mapping step (choose the entity, or use "Import as receivables / credit notes"); it is rejected only if the required fields are still unmapped after mapping.
