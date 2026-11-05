---
title: Data map — User master
summary: User master for access, Today caps and reports-to: fields from the brief, template user-master.csv, seeded from the employee master (no People List received).
status: draft
updated: 2026-11-05
related:
  - design/canonical-data-model.md
  - data-map/_index.md
  - data-map/sales-employee.md
  - data-map/plant-master.md
  - data-map/templates/user-master.csv
  - design/role-matrix.md
  - design/escalation-ladder.md
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
| `user_id` | 4-digit text | No (Yes for a placeholder) | Unique when present. Admin › Users shows it first. Placeholders carry 1001–1050; existing users without one stay valid. |
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
Email valid and unique; role in list; every plant code exists; `reports_to_email` exists and is not a cycle; Sales executive has `sales_employee_code`; at least one active Super admin; WhatsApp 12 digits starting 91; `user_id` is 4 digits and unique.

**Placeholder rule.** Admin › Users (Super admin) has "Add placeholder users 1001–1050": 50 rows, `user_id` 1001–1050, name "User 1" … "User 50", e-mail `user<id>@placeholder.invalid`, role, department and plants blank, cap 5, active N, flag `placeholder`. Stored at `users/u<id>`, so re-running adds none that exist ("Added N, skipped M"). An inactive row whose e-mail ends `@placeholder.invalid` needs only `user_id`, name and e-mail. Switching it on, or giving it a real e-mail, needs every mandatory field above; a `.invalid` e-mail can never be active. A placeholder is not offered for assignment, Today, escalation, reports-to, scorecard or "view as", cannot be a reports-to, and grants no access. Editing a placeholder keeps its document, so a changed e-mail never leaves a duplicate. A placeholder cannot have a `reports_to_email`. The Users header counts real users and placeholders separately ("Users · 13 · Placeholders 49").

**Upload matching.** A row is matched by `user_id` first, then by email.
- Email rebind: a row whose `user_id` matches a **placeholder** may change that record's email (this is how a placeholder becomes a real person). If it matches a real user and the email differs, the row is rejected ("User ID n belongs to x; change the email in Admin › Users"). If `user_id` matches record A and the email matches a different record B, the row is rejected.
- A row matched by email only: if the stored record has no `user_id`, the row's `user_id` is set (bulk ID assignment). If the stored record already has a different `user_id`, the row is rejected ("<email> already has User ID n; change it in Admin › Users"). In the form, a User ID can be changed to another unused 4-digit id but never cleared ("User ID cannot be removed").
- Blank or missing `user_id` keeps the stored one; the upload never clears it. Fields the upload does not carry (for example `slp_code`, `uid`) are kept as stored; the `placeholder` flag is dropped only when the merged record is no longer an inactive `@placeholder.invalid` row.

## Coverage (12 quarters)
Master, not a time series. Nothing loaded. Needed before the first role-based view: at least the two Principals, HO coordination and one user per role for testing.
