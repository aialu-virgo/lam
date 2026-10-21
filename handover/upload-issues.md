---
title: Data upload problems and fixes
summary: Every problem seen in the SAP files received so far (20–21 Oct 2026), its effect on the Desk, and the fix at source.
status: active
updated: 2026-10-21
related:
  - handover/_index.md
  - handover/admin-guide.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/sales-employee.md
  - data-map/item.md
  - decisions.md
---

# Data upload problems and fixes
The last column is what the Desk now does by itself (auto-fix pass, 21 Oct 2026). Every upload shows a "Fixes applied" panel: what was fixed, counts, what still needs the source. Alias tables are editable by a Super admin in Admin › Aliases. Counts are from the files received on 20–21 Oct 2026. History starts at Q1 FY26 (1 Apr 2025) per [Decisions](../decisions.md) D28.

## B1 Combine Sale (invoices)
| # | Problem | Effect on the Desk | Fix at source | Desk fixes it |
|---|---|---|---|---|
| 1 | The 2022 CSVs held the internal-transfer list, not sales (Excel saves only the open sheet to CSV) | Nothing loaded from them | Save as **XLSX**, or open the **DATA** sheet before saving as CSV | Yes. Recognises the transfer-list layout (CardCode, CardName, Tranfser) and offers "Load as Internal-transfer list"; for a workbook it picks the DATA sheet; empty or unknown layouts say which sheet or export is expected. |
| 2 | Only Sep 2026 received | No QoQ or trend before Sep 2026 | Export Apr 2025 – Aug 2026, one file per month or quarter | No. The panel says which quarters have no history; the months must be exported from SAP. |
| 3 | DocDate stored as day/month in some rows and month/day in others (51,015 rows swapped) | Repaired on upload, but risky | Export dates as text `YYYY-MM-DD` | Yes (D34). The expected month comes from the file name, else the majority of unambiguous dates, and can be changed with a picker. Dates outside it are tried day/month swapped and stored corrected (counted in the panel); rows still outside it are skipped with the reason. Nothing is written outside the expected month. |
| 4 | No `LineNum`, `SlpCode`, `WhsCode` columns | Duplicate check is weaker; salesperson matched by name only (56.6% of lines) | Add the three columns to the saved query | Yes. Line numbers created in row order per document; repeats of document + item + quantity + value removed and counted. Missing SlpCode/WhsCode handled by name matching (improved: case, spacing, punctuation, initials, close spelling, saved aliases). |
| 5 | Internal stock transfers in the same file (19,879 rows) | Excluded using the transfer list and account/zone rule | Keep the transfer list current in Admin, or filter transfers out in the query | Partly. List, account and zone rules flag transfers. Customers whose name holds the group's own names (setting `own_company_names`) are suggested for one-click adding; never applied automatically. |
| 6 | `Catagory` has 18 spellings; 108 rows blank (item not in FG master) | Normalised; blanks fall outside laminates | One category spelling in SAP; add missing items to the item master | Yes. Spellings normalised through the editable category alias table (Admin › Aliases); unknown categories listed for one-click mapping. Blank categories need the item added in SAP. |
| 7 | `Zone` has 30 spellings; junk values in Invoice Type and Place of Supply ("z", "zz") | Normalised or rejected | Clean the masters in SAP | Yes. Zone alias table seeded; unknown zones listed for one-click mapping; junk values counted. Rows with a junk Invoice Type are skipped and counted, not rejected. |
| 8 | 29 MB per month | About 15 s to read in the browser | Fine; keep one month per file | No change needed. |

## S/4 Sales Register
| # | Problem | Effect | Fix | Desk fixes it |
|---|---|---|---|---|
| 9 | Only plant 1013, 4–19 Oct | Other plants show no October sales | Export all plants, month to date | No (needs all plants in the export). |
| 10 | Each line repeated 1–8 times (1,753 repeats) | De-duplicated on invoice + item | Remove the extra breakdown columns from the report layout | Yes (already handled), shown in the panel. |
| 11 | `Sales Executive` empty; no credit memos | No salesperson on S/4 sales; net sales overstated | Add the sales-employee partner function and credit-memo billing types | Partly. Where S/4 customer codes match B1 CardCodes, the salesperson is taken from B1 sales; otherwise the panel says the codes cannot be linked. Credit memos cannot be added by us; the panel flags them as absent. |
| 12 | "Unit Price" holds the line value | Mapped as line value | Rename or confirm in the report | Yes (mapped), shown in the panel. |

## Masters
| # | Problem | Effect | Fix | Desk fixes it |
|---|---|---|---|---|
| 13 | Sales employee: 164 rows without plant code, 52% without email, 13 designation spellings | People without a plant sit outside every branch; no email means no login | Fill `*CompanyCode`, Email and one designation list | Partly. Plant filled from the ID prefix (editable prefix table, learned from known people); designations normalised through an alias table. Only people still without a plant are listed. Missing emails need the source. |
| 14 | Employee IDs changed format between files (`E-XXX/123` → `E-XXX-1234`); 21 new people without plant or designation | Matched by name; new people need plant and role | Keep one ID format; add plant and designation | Yes. IDs normalised (E-XXX/123 becomes E-XXX-0123, old spelling kept as an alternate); the same person under both spellings is merged by ID. People still lacking plant or designation are listed. |
| 15 | 122 B1 salesperson names match nobody | Their sales show as "Unassigned" | Add `B1 Sales Employee Name` or `SlpCode` (see the sample file) | Mostly. Matching improved; remaining names show suggested people and one click saves an alias, applied at once. |
| 16 | Item master: 3,560 non-laminate items, 17 without size | Not stored; no sq ft for 17 | None needed; add sizes | No change needed. |

## Process
| # | Problem | Effect | Fix | Desk fixes it |
|---|---|---|---|---|
| 17 | "Load demo data" clicked on the live Desk overwrote 5 real plant-months (D27) | Mixed demo and real figures | Fixed in v24: demo refused once real data exists; restore done from the original files | Yes (v24). |
| 18 | The page cannot read viewers' email addresses | New users must give their viewer ID once | Admin › Users › Viewer ID | No. The panel says so; add the viewer ID once. |
| 19 | A March file read with serial dates swapped wrote 376 plant-months over real months (D32, 21 Oct 2026) | Real months overwritten | Undo the upload (Data Intake › Upload history › Undo), then upload the affected months again | Guards added: serial dates are never swapped on their own; a month histogram stops files that span more than 2 months, hold future dates or do not match the month in the file name; a replace guard lists plant-months that would lose lines; Undo upload removes what one upload wrote. Undo cannot restore what the upload overwrote. |
