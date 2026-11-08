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
| Fri 14:00 | Collection intake published (D38) | Full-Stack Engineer | done 13:45 (v31) |
| Fri 15:00 | Incoming Payment Report Apr 2025–Sep 2026 loaded live and checked | Delivery Lead | done (D43) |
| Fri 17:30 | Receivables, credit notes, customer master intakes; net-sales basis (D40); auto-replaced history (D41) published | Full-Stack Engineer | done 14:50 (v32); QA FAIL 5 defects (D45), v33 16:55; backup size blocker (D46); v34 17:30; QA FAIL on backup cap (D47), v35 18:40, QA passed (D48); sales uploads released |
| File + 45 min | Each receivables / credit-note / customer file loaded live after Vijay sends it | Delivery Lead | waiting on files |
| Sun 8 Nov | Sales Apr 2025–Oct 2026 + stock 7-Nov reloaded from VIRGO_ONE files, inter-company excluded (D70, D150) | Delivery Lead | done 16:42 IST |
| Wed 4 Nov 12:00 | Infographic Overview mock-up for approval (D50) | Product Designer | v2 approved by Vijay (D52) |
| Tue 3 Nov 23:30 | Infographic Overview built on real data, published (v36); QA check right after | Full-Stack Engineer | published 21:50 (v36); v37 22:46, QA passed (D54) |
| Wed 4 Nov 15:00 | v38: no DEMO targets against real sales, 6+ quarters with values, brand in item master (D55) | Full-Stack Engineer | published 13:58; item master reloaded with brand (D56); QA FAIL (D57); v39 15:13, QA: one label defect (D58); v40 16:00, QA passed (D59) |
| Wed 4 Nov 13:45 | Mock-up v3: thickness, brand, collections, branch rating cards (D55) | Product Designer | published 13:19; awaiting approval |
| Sun 8 Nov 20:52 | claude.ai Desk v49 from 5db7cfe (backup covers dashboards, D103); speed fix next | Full-Stack Engineer | v49 published 20:52 |
| Thu 5 Nov 13:00 | v41: credit-note files blocked in sales intake, CN lock, bulk Undo (D60) | Full-Stack Engineer | published 12:13; QA FAIL on undo integrity (D61); v42 12:37, QA passed (D63); Undo cleared |
| Thu 5 Nov (after Undo) | Sales Apr 2025–Sep 2026 restored; credit notes loaded as credit notes and locked | Vijay + Delivery Lead | open |
| Fri 6 Nov 09:00 (was Thu 23:30, Fri 01:00, Fri 06:00) | Desk on Google Apps Script (D66): backup download in claude.ai Desk, restore + Apps Script project in Vijay's Drive, QA passed, Drive link sent | Full-Stack Engineer + Engineering QA | QA passed pass 5 07:58; v44 + setup page published by 12:24 (D68; slipped past 09:00); deployed by Vijay 8 Nov 11:48 (D76); restore pending |
| Sat 7 Nov 15:30 | "Targets & Potential" tab mock-up for approval (Vijay, 7 Nov) | Product Designer | published 14:05, approved (D70); built, QA passed round 3, desk-v45 published (D72); new GAS files sent |
| Sun 8 Nov 13:00 | S/4 OData feed: mapping (Data Architect), then Apps Script connector on a mock SAP, QA passed (D73) | Data Architect + Full-Stack Engineer | mapping done; built on mock, fast QA passed, files sent 00:35 Sun (D74; Vijay moved deadline to 00:52); sync locked until dry run matches |
| Sun 8 Nov 15:00 | Targets & Potential by State → District: model change + mock-up for approval (D77) | Data Architect + Product Designer | model done (D79); mock-up blind check passed round 2, published 12:12 for approval |
| Sun 8 Nov 19:00 (was 18:00, 16:45, 17:30) | Targets & Potential by State built (D80), QA passed, claude.ai Desk + Apps Script files sent | Full-Stack Engineer + Engineering QA | built; QA round 1 passed except C6, fixed 3348da8; QA passed (C6, L5 accepted D83); merge with parallel v44 c6622f9, gas-e2e restore regression being fixed; takeover note [handover/session-takeover-2026-11-08.md](handover/session-takeover-2026-11-08.md) |
| Sun 8 Nov 13:00 | v43: admin job queue; recovery Undo + Clear demo queued by Delivery Lead (D86) | Full-Stack Engineer | v43 live (version 46); jobs ran 12:21–12:36 IST (D88) |
| After Vijay opens the Desk | Sales Apr 2025–Sep 2026 restored; credit notes written and locked | Delivery Lead | done 12:40 IST (D88) |
| Sun 8 Nov 18:00 | v44: thickness, brand, collections, branch-rating cards; zones from sales (D84, D85) | Full-Stack Engineer | built, tests run (D89); QA re-check passed, published 15:21 IST as claude.ai version 47 from m8-v44-fix 1d9baaf (D91); merged here with the geography branch |

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

**M6 QA pass + acceptance** — [ ] all 12 checks pass ([Brief Part B — design inputs](design/brief-part-b.md) §8) · [x] SP Sir accepts (D87, recorded in the parallel session as D67; relayed by Vijay 8 Nov) · [ ] first real B1 upload by Virgo users

**M7 Handover** — [x] role guides + admin guide (drafts) · [ ] walkthrough in [handover/](handover/_index.md) · [x] S/4HANA switch notes
