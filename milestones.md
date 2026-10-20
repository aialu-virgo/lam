---
title: Milestones
summary: Schedule (IST), milestones 0–7 with done criteria, current milestone and blocker.
status: active
updated: 2026-10-20
related:
  - CLAUDE.md
---

# Milestones
**Current:** M0 Discovery. **Blocker:** People List not received; exports for orders, deliveries, receivables, collections, stock not yet listed ([Open questions](open-questions.md) Q1, Q6).

## Schedule (IST)
| By | What | Owner | Status |
|---|---|---|---|
| Tue 16:15 | Canonical model, B1↔S4 map, one data-map file per export, upload templates sent to Vijay | Data Architect | slipped → 17:15; 5 SAP exports received 16:30, mapping in progress |
| Tue 17:15 | desk-v0.1 published: Data Intake, coverage grid, Admin masters | Full-Stack Engineer | published 17:00 (D8); QA blind check running |
| Tue 18:40 | History, potential, users uploaded; rejected rows fixed; coverage green or gaps named | Vijay + Delivery Lead | open |
| Tue 20:00 | Wireframes of all pages sent for approval | Product Designer | open |
| Tue 21:00 | Written design approval | Principals | open |
| Wed 07:00 | desk-v0.9 on real data | Full-Stack Engineer | open |
| Wed 10:00 | QA + blind second check passed, fixes done | Engineering QA | open |
| Wed 11:30 | Acceptance walk-through | SP Sir | open |
| Wed 12:00 | desk-v1.0 published, tagged, link sent | Delivery Lead | open |

## Milestones
**M0 Discovery**
- [ ] Reference artifact studied (layout notes in [Wireframes](design/wireframes.md))
- [ ] SAP B1 exports listed, one [data-map](data-map/_index.md) file each
- [ ] Roles and people list; plant/branch list
- [ ] Market-potential template

**M1 Foundation**
- [ ] Canonical model, B1↔S4 map, role matrix, target model, comparison basis, priority + check + escalation rules, KRA/KPI in [design/](design/_index.md)
- [ ] Historic coverage per entity recorded in data-map/

**M2 Design approved** — [ ] wireframes of every page, Today, action thread, intake, admin · [ ] SP Sir's written approval in [Decisions](decisions.md). No build before this (except M3, decision D1).

**M3 Build v0.1 (intake only)** — [ ] Data Intake with historic mode and coverage grid · [ ] Admin masters: users, plants, market potential with revisions · [ ] real data loaded by Tue 18:40

**M4 Build v0.9** — [ ] all pages: target vs actual vs potential, 12-quarter trend, Action Center, Today, responses, follow-up drafts, escalation, action log, roles and row-level access, scorecard

**M5 v1.0** — [ ] QA and acceptance fixes · [ ] published and tagged by Wed 12:00

**M6 QA pass + acceptance** — [ ] all 12 checks pass ([Brief Part B — design inputs](design/brief-part-b.md) §8) · [ ] SP Sir accepts · [ ] first real B1 upload by Virgo users

**M7 Handover** — [ ] role guides + admin guide + walkthrough in [handover/](handover/_index.md) · [ ] S/4HANA switch notes
