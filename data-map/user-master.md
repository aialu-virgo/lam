---
title: Data map — User master
summary: User master for access, Today caps and reports-to: fields from the brief, template user-master.csv, seeded from the employee master (no People List received).
status: draft
updated: 2026-10-20
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/sales-employee.md
  - data-map/plant-master.md
  - data-map/templates/user-master.csv
  - design/role-matrix.md
---

# User master (master file, Admin)
**Owner:** Data Architect · **Input:** [Brief Part B — design inputs](../design/brief-part-b.md) §3 · **Status:** the "People List" Vijay named was **not in the upload** (Q6).

## Source and export
- **Source:** HO coordination maintains it in Admin; the page also accepts the upload template [user-master.csv](templates/user-master.csv) (header only).
- **Seed available:** [Sales employee](sales-employee.md) gives name, e-mail (47.5% filled), mobile, designation, zone and plant for 394 people. It gives no reports-to, department or Desk role.
- **Access is by e-mail:** an unknown viewer sees "Ask your admin for access".

## Columns (template)
| Column | Type | Mandatory | Rule / source |
|---|---|---|---|
| `email` | text | Yes | Key; valid format; unique; lower-case. Seed: employee `Email`. |
| `name` | text | Yes | Seed: `FullName`. |
| `role` | one of 8 | Yes | Super admin · Management / HO · HOD · Branch / depot manager · Sales executive · Coordinator (sales / CRR) · Accounts · Plant. Seed: designation map in [Sales employee](sales-employee.md). |
| `department` | text | Yes | Sales, CRR, Accounts, Plant, HO. Not in any file; entered. |
| `plant_codes` | codes separated by `;` | Yes (blank = all for Management / HO and Super admin) | Each in [Plant master](plant-master.md). Seed: `*CompanyCode` (41.6% blank). |
| `reports_to_email` | text | Yes except top | Must be an active user. Not in any file; entered (drives escalation L2). |
| `whatsapp_number` | text, `91` + 10 digits | No | Seed: `Mobile No.`; used for wa.me drafts only. |
| `today_cap` | integer 1–20 | Yes | Default 5 (Q10). |
| `active` | Y / N | Yes | Default Y. |
| `sales_employee_code` | text | Sales executives only | Added to the brief's fields so a salesperson's own customers and targets can be filtered; B1 `SlpCode` once exported (Assumed). |

## B1 ↔ S/4HANA mapping
Not an SAP entity. Only `sales_employee_code` and `plant_codes` tie to SAP codes ([Sales employee](sales-employee.md), [Plant master](plant-master.md)).

## Validation
Email valid and unique; role in list; every plant code exists; `reports_to_email` exists and is not a cycle; Sales executive has `sales_employee_code`; at least one active Super admin; WhatsApp 12 digits starting 91.

## Coverage (12 quarters)
Master, not a time series. Nothing loaded. Needed before the first role-based view: at least the two Principals, HO coordination and one user per role for testing.
