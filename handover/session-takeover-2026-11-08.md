---
title: Session takeover — 8 Nov 2026 15:31 IST
summary: State of every open thread when the Delivery Lead session hit its limit, and the exact next steps for whoever takes over.
status: active
updated: 2026-11-08
related:
  - handover/_index.md
  - milestones.md
  - decisions.md
  - open-questions.md
  - data-map/s4-odata-feed.md
  - design/target-model.md
---

# Session takeover — 8 Nov 2026, 15:31 IST

Branch `claude/serene-clarke-g6hgzg`, HEAD `3348da8`, working tree clean. Decisions D64–D82 in [Decisions](../decisions.md) hold every choice made.

## 1. Release waiting to go out (promised to Vijay by 18:00 IST, he asked for earlier)
Contents: Targets & Potential by State (D77–D80), Admin › Geography, customer master per source system with State/PIN/GSTIN and GSTIN state fallback, SAP pre-sync safety fixes, SAP customer read (`sapCustomerSync`), S/4 region alias fix (D82).
- Blind QA round 1 at 2ac91a1: all criteria PASS except C6 (S/4 region alias); C6 fixed in 3348da8 (t59 69/0, t43 9/0, t22 13/0, gas-targets 20/0).
- QA re-check of C6 + quarter lock + growth row base + full gas-e2e was running, due 16:30 IST. **If its result is not in this repo, re-run it** (engineering-qa, same criteria) before publishing.
- Then:
  1. Publish `build/desk/dist/index.html` to the claude.ai Desk https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx (Artifact publish with that `url`; keeps db/downloads/user capabilities). That becomes v46.
  2. Republish the setup page `build/desk-gas/setup-page/index.html` to https://claude.ai/artifact/VVgq6L1VwALvsMjL8GThj8 with `files` = the three `build/desk-gas/out/*.txt`.
  3. Send Vijay `Desk-Code.gs.txt`, `Desk-Index.txt`, `appsscript.json.txt`; he pastes all three, New version. No new OAuth scopes.
  4. Log D83 (v46 published), update the milestone row "Sun 8 Nov 18:00".

## 2. SAP feed on Vijay's Apps Script (`/exec` link in [Apps Script Desk README](../build/desk-gas/README.md))
- Verify passed on the real tenant: 29/29 billing names (D81).
- `sapShadowRun` for Oct 2026 hit the 5-minute limit once (13:09 IST) and continues per run. Waiting on Vijay's `"done":true` line. If it needs more than ~4 runs, have the engineer speed up the read before sync.
- `SAP_SYNC_ENABLED` stays unset until the shadow comparison matches loaded Oct 2026 plant-months.
- After the release: Vijay runs `sapVerifyMetadata` again (it now also checks customer names), then `sapCustomerSync`, then Load SAP feed on Data Intake.

## 3. Customer master (B1)
`Customer Master Lam-9985.xml` (82 MB) in Vijay's Drive › Customer Master › Customer Master Laminate. Too large for the Drive connector (10 MB limit). Vijay will save it as .xlsx and upload it himself at Admin › Customers on the `/exec` link **after** the release. Ask him for the load summary (loaded, rejected, placed by GSTIN).

## 4. Still open with Vijay
Backup → restore with Replace everything on `/exec` (not confirmed done); People List (Q1); S/4 material master with B1 codes (Q18); credit-note files to reload as credit notes; Q34–Q36 (geography).

## 5. Rules that bit today
- A file sent to a Principal must have passed a blind QA check. `out/` is git-ignored, so keep a copy of anything sent (QA scratch copies were used once to resend).
- Commit after each agent report; the stop hook enforces it.

## Update 17:10 IST — parallel-session merge
- Claude.ai publish of our build was refused: the other Lam session ("Virgo Lam Performance Desk", branch m8-gcp / m8-v44-fix) published v44 as version 47 at 15:21 IST.
- Merged both into `claude/serene-clarke-g6hgzg`: 41567e6 (m8-gcp) and c6622f9 (m8-v44-fix), pushed. Their decisions D64–D71 are now D84–D91.
- Tests on c6622f9: desk suite 745 PASS / 7 baseline FAIL; gas-unit, shim, targets, sap, qa4 all pass; **gas-e2e 46/2 FAIL** (restore re-run differs from backup by 11–13 docs: extra R1 actions, later roll/R4 timestamps). Regression enters with 41567e6. Engineer is fixing (due 18:15).
- **Do not publish or send files until gas-e2e is 48/0 and a blind QA of the merged build passes.** Then: publish dist to the claude.ai Desk (merge onto version 47 is now in source), republish the setup page, send the three files, log D92, and message session_01MrczuPzhyUR5CA4GNy3QT5 that it may resume.
- The other session ran a live data reload until ~17:15 IST; check with it before any write to the Desk database.
- Vijay was told to hold pasting/restoring the 15:35 files.

## Update 18:50 IST
- Released to Vijay: merged Apps Script files (c6622f9, D92) and the restore-race Desk-Index follow-up (c4ee91c, D93); Vijay deployed the Index.
- claude.ai Desk: the parallel session published version 48 at ~18:44 IST from origin/m8-dashboard (our merge + v44 + My Dashboard). Not republished by us (D94). origin/m8-dashboard merged into this branch (0e893b5).
- Next Apps Script files must wait for the parallel session's My Dashboard QA (it adds dashroles/dashlayouts collections to Code.gs).
- Open: engBlock timeout + "rules paused" notice (engineer, due 19:30); Vijay's sapShadowRun still running; publishing order agreed: each session tells the other before publishing.
- Decision numbering: parallel session moves its entries to D95–D97. From now on this session uses D100–D149, the parallel session D150+.
