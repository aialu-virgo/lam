---
title: Milestones
summary: Schedule (IST), milestones 0–7 with done criteria, current milestone and blocker.
status: active
updated: 2026-10-20
related:
  - CLAUDE.md
---

# Milestones
**Current:** M6 acceptance (desk-v1.0 published, D22). **Blocker:** People List not received; exports for orders, deliveries, receivables, collections, stock not yet listed ([Open questions](open-questions.md) Q1, Q6).

## Schedule (IST)
| By | What | Owner | Status |
|---|---|---|---|
| Tue 16:15 | Canonical model, B1↔S4 map, one data-map file per export, upload templates sent to Vijay | Data Architect | done 16:46 (slipped 31 min) |
| Tue 17:15 | desk-v0.1 published: Data Intake, coverage grid, Admin masters | Full-Stack Engineer | published 17:00 (D8); QA passed, fixes republished |
| Tue 18:40 | History, potential, users uploaded; rejected rows fixed; coverage green or gaps named | Vijay + Delivery Lead | partial 19:55 (D17): Sep 2026 B1 + Oct 2026 S/4 (1013) loaded; gap = Oct 2023–Aug 2026, users, potential |
| Tue 20:00 | Wireframes of all pages sent for approval | Product Designer | published 17:25 (D12); awaiting SP Sir |
| Tue 21:00 | Written design approval | Principals | interim approval by Vijay 18:08 (D13); SP Sir confirms Wed 11:30 |
| Wed 07:00 | desk-v0.9 on real data | Full-Stack Engineer | published Tue ~19:30 on demo data (D14); real data not yet loaded |
| Wed 10:00 | QA + blind second check passed, fixes done | Engineering QA | passed Tue ~20:00 on v0.9 version 11 (demo data, stubbed runtime); open: live sign-in, real-data volume, visual match to reference |
| Wed 11:30 | Acceptance walk-through | SP Sir | open |
| Wed 12:00 | desk-v1.0 published, tagged, link sent | Delivery Lead | done Tue night (D22) |

## Milestones
**M0 Discovery**
- [x] Reference artifact studied (layout notes in [Wireframes](design/wireframes.md))
- [ ] SAP B1 exports listed, one [data-map](data-map/_index.md) file each
- [ ] Roles and people list; plant/branch list
- [x] Market-potential template

**M1 Foundation**
- [x] Canonical model, B1↔S4 map, role matrix, target model, comparison basis, priority + check + escalation rules, KRA/KPI in [design/](design/_index.md)
- [ ] Historic coverage per entity recorded in data-map/

**M2 Design approved** — [x] wireframes of every page, Today, action thread, intake, admin · [x] interim written approval (Vijay, D13); SP Sir confirms in [Decisions](decisions.md). No build before this (except M3, decision D1).

**M3 Build v0.1 (intake only)** — [x] Data Intake with historic mode and coverage grid · [x] Admin masters: users, plants, market potential with revisions · [ ] real data loaded by Tue 18:40

**M4 Build v0.9** — [x] all pages: target vs actual vs potential, 12-quarter trend, Action Center, Today, responses, follow-up drafts, escalation, action log, roles and row-level access, scorecard

**M5 v1.0** — [x] QA fixes (acceptance fixes after 11:30 if any) · [x] published and tagged (D22)

**M6 QA pass + acceptance** — [ ] all 12 checks pass ([Brief Part B — design inputs](design/brief-part-b.md) §8) · [ ] SP Sir accepts · [ ] first real B1 upload by Virgo users

**M7 Handover** — [x] role guides + admin guide (drafts) · [ ] walkthrough in [handover/](handover/_index.md) · [x] S/4HANA switch notes
