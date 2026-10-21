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
Counts are from the files received on 20–21 Oct 2026. History starts at Q1 FY26 (1 Apr 2025) per [Decisions](../decisions.md) D28.

## B1 Combine Sale (invoices)
| # | Problem | Effect on the Desk | Fix at source |
|---|---|---|---|
| 1 | The 2022 CSVs held the internal-transfer list, not sales (Excel saves only the open sheet to CSV) | Nothing loaded from them | Save as **XLSX**, or open the **DATA** sheet before saving as CSV |
| 2 | Only Sep 2026 received | No QoQ or trend before Sep 2026 | Export Apr 2025 – Aug 2026, one file per month or quarter |
| 3 | DocDate stored as day/month in some rows and month/day in others (51,015 rows swapped) | Repaired on upload, but risky | Export dates as text `YYYY-MM-DD` |
| 4 | No `LineNum`, `SlpCode`, `WhsCode` columns | Duplicate check is weaker; salesperson matched by name only (56.6% of lines) | Add the three columns to the saved query |
| 5 | Internal stock transfers in the same file (19,879 rows) | Excluded using the transfer list and account/zone rule | Keep the transfer list current in Admin, or filter transfers out in the query |
| 6 | `Catagory` has 18 spellings; 108 rows blank (item not in FG master) | Normalised; blanks fall outside laminates | One category spelling in SAP; add missing items to the item master |
| 7 | `Zone` has 30 spellings; junk values in Invoice Type and Place of Supply ("z", "zz") | Normalised or rejected | Clean the masters in SAP |
| 8 | 29 MB per month | About 15 s to read in the browser | Fine; keep one month per file |

## S/4 Sales Register
| # | Problem | Effect | Fix |
|---|---|---|---|
| 9 | Only plant 1013, 4–19 Oct | Other plants show no October sales | Export all plants, month to date |
| 10 | Each line repeated 1–8 times (1,753 repeats) | De-duplicated on invoice + item | Remove the extra breakdown columns from the report layout |
| 11 | `Sales Executive` empty; no credit memos | No salesperson on S/4 sales; net sales overstated | Add the sales-employee partner function and credit-memo billing types |
| 12 | "Unit Price" holds the line value | Mapped as line value | Rename or confirm in the report |

## Masters
| # | Problem | Effect | Fix |
|---|---|---|---|
| 13 | Sales employee: 164 rows without plant code, 52% without email, 13 designation spellings | People without a plant sit outside every branch; no email means no login | Fill `*CompanyCode`, Email and one designation list |
| 14 | Employee IDs changed format between files (`E-XXX/123` → `E-XXX-1234`); 21 new people without plant or designation | Matched by name; new people need plant and role | Keep one ID format; add plant and designation |
| 15 | 122 B1 salesperson names match nobody | Their sales show as "Unassigned" | Add `B1 Sales Employee Name` or `SlpCode` (see the sample file) |
| 16 | Item master: 3,560 non-laminate items, 17 without size | Not stored; no sq ft for 17 | None needed; add sizes |

## Process
| # | Problem | Effect | Fix |
|---|---|---|---|
| 17 | "Load demo data" clicked on the live Desk overwrote 5 real plant-months (D27) | Mixed demo and real figures | Fixed in v24: demo refused once real data exists; restore done from the original files |
| 18 | The page cannot read viewers' email addresses | New users must give their viewer ID once | Admin › Users › Viewer ID |
