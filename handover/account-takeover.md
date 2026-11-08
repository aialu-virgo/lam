---
title: Account takeover — Virgo Laminates Performance Desk
summary: Everything a Claude session under a different claude.ai account needs to take over the Desk on 8 Nov 2026 20:40 IST, with what it can and cannot reach.
status: active
updated: 2026-11-08
related:
  - handover/_index.md
  - handover/session-takeover-2026-11-08.md
  - CLAUDE.md
  - milestones.md
  - decisions.md
  - open-questions.md
  - build/desk-gas/README.md
  - data-map/s4-odata-feed.md
---

# Account takeover — Virgo Laminates Performance Desk

Written 8 Nov 2026, 20:40 IST, for a Claude session running under **another claude.ai account**. Start with [CLAUDE.md](../CLAUDE.md); it loads the identity, Principals, rules and milestones. This file adds what changes when the account changes, and where everything stands.

## 0. Takeover accounts (Vijay, 8 Nov 2026)
- New Claude accounts: **ai@virgoasia.com** and **ai.lam@virgoasia.com**. Vijay approved giving them edit access to the claude.ai Desk; he shares it himself from the artifact's Share menu (Claude cannot change sharing).
- Desk sign-in: ai.lam@virgoasia.com is already a Super admin in the claude.ai Desk users, so it arrives on `/exec` with the restore. ai@virgoasia.com is not a Desk user; Vijay adds it at Admin › Users if that account needs to open the Desk.
- Both are virgoasia.com accounts, so the `/exec` link (domain access) opens for them once they are Desk users.

## 1. Where the work lives
| What | Where | Notes |
|---|---|---|
| Code and docs | GitHub `aialu-virgo/lam`, branch **`claude/serene-clarke-g6hgzg`**, HEAD `57eb38d` or later | Contains everything: our geography/SAP work, the parallel session's v44 and My Dashboard (`5db7cfe`). Not yet merged to `main`. |
| Last released build | commit **`5db7cfe`** | Same build on both platforms (Apps Script files sent 19:55 IST, D101). |
| Decisions | [decisions.md](../decisions.md) | This lane writes D100–D149; the parallel session writes D150+. |
| Open threads, history | [Session takeover, 8 Nov](session-takeover-2026-11-08.md) | Read its updates at the bottom. |
| Specialist agents | `.claude/agents/` (data-architect, engineering-qa, full-stack-engineer, product-designer) | In the repo, so they load in any account. |

## 2. What a new account can and cannot reach
- **GitHub:** the new account needs the Claude GitHub app with access to `aialu-virgo/lam`. Push only to your designated branch; merge to `main` only when asked.
- **claude.ai Desk artifact** https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx and its **database** are owned by the data@virgoasia.com account. A different account cannot publish to it or read/write its database unless Vijay shares it with **edit** access. Without that, do not create a new artifact as a replacement: the data lives in that artifact's database. Ask Vijay.
- **Setup page** https://claude.ai/artifact/VVgq6L1VwALvsMjL8GThj8: same owner; same rule. Files can be sent as attachments instead.
- **Apps Script Desk (the main Desk):** `/exec` link in [Apps Script Desk README](../build/desk-gas/README.md). It runs in Vijay's Google account. We never deploy it; we build the three text files and Vijay pastes them and makes a New version. A virgoasia.com sign-in is needed to open it; from outside it redirects (302).
- **SAP S/4HANA:** read only, through the connector inside Vijay's Apps Script. Credentials live in Script Properties, set by Vijay. Never ask for or accept the password in chat.
- **Google Drive / Gmail:** only through connectors on the new account, and only with Vijay's OK each time ([Rules — boundaries](../.claude/rules/boundaries.md)). Drive downloads above 10 MB fail.
- **Other Claude sessions:** cross-session messages do not cross accounts. Coordinate with the parallel session through the repo (branches and notes) or through Vijay.

## 3. How to build and test (no data needed)
1. `cd build/desk && node build.mjs` → `dist/index.html` (the claude.ai page).
2. `cd build/desk-gas && node build-gas.mjs` → `out/Desk-Code.gs.txt`, `out/Desk-Index.txt`, `out/appsscript.json.txt` (git-ignored; keep a copy of anything you send).
3. Tests: `build/desk/test/*.mjs` (run t22 first; known baseline failures t51 ×2, t52 ×2, t57 ×3) and `build/desk-gas/test/gas-*.mjs` (gas-e2e expects 51/0). Fixtures come from `build/desk/test/mkfixtures.py` and `mkstore.mjs`; tdash3/3b need `store-big-dash.json` and the theme test needs a saved artifact copy, both missing from a fresh checkout.
4. Chromium + Playwright are preinstalled in cloud sessions (`require('playwright')`).
5. Every file sent to a Principal passes a blind check by `engineering-qa` first ([Rules — honesty](../.claude/rules/honesty.md)).

## 4. State at 20:40 IST, 8 Nov
**Released (D101):** Apps Script files from `5db7cfe`: Targets & Potential by State + Admin › Geography (D77–D83), customer master per system with GSTIN state fallback, SAP S/4 feed (verify, shadow run, gated sync, customer read), restore fixes with auto-resume, v44 Overview cards (D84–D91), My Dashboard with backup of `dashroles`/`dashlayouts`.

**claude.ai Desk:** version 48 published by the parallel session from `m8-dashboard`; it approved publishing `5db7cfe` after its own QA (check the artifact's version before assuming).

**Waiting on Vijay**
1. Paste `Desk-Code.gs.txt` and `Desk-Index.txt`, run `setup`, New version.
2. Download the full backup on claude.ai → Restore on `/exec` with **Replace everything** → send the summary.
3. `sapShadowRun` until `"done":true` → send the line. If it needs more than ~4 runs of 5 minutes, have the engineer speed up the read. Only after the Oct 2026 comparison matches: `SAP_SYNC_ENABLED=yes`.
4. Then `sapVerifyMetadata` again (it now checks customer names), `sapCustomerSync`, and **Load SAP feed** on Data Intake.
5. B1 customer master: `Customer Master Lam-9985.xml` (82 MB, his Drive) → save as .xlsx → upload at Admin › Customers on `/exec`.
6. Admin › Geography › Draft from sales history → review → save.
7. Open questions Q1 (People List), Q18 (S/4 material master with B1 codes), Q34–Q36 (geography) in [Open questions](../open-questions.md).

**Known limits (accepted):** D83 (quarters locked before D79 keep live state attribution), D100 (rules may run on a store left incomplete by a failed restore, with a visible notice), numeric SAP region codes map only through an explicit `SAP:<code>` alias (D82).

**Follow-ups, can wait:** lock must refuse if the snapshot write fails (D83); stale comment in `desk-gas/src/restore.js`; weekly trigger for `sapCustomerSync`; resume for very large customer reads.

## 5. First actions for the new session
1. Run `TZ=Asia/Kolkata date`; read [Milestones](../milestones.md), [Open questions](../open-questions.md), this file and the 8 Nov takeover note.
2. `git fetch origin && git log --oneline -5 origin/claude/serene-clarke-g6hgzg origin/m8-dashboard` — merge anything newer from the parallel lane before building.
3. Ask Vijay one question if needed: does the new account have edit access to the claude.ai Desk artifact? If not, work on Apps Script files only.
4. Reply to Vijay in IST, answer first, labelled asks ([Rules — talking to the Principals](../.claude/rules/talking-to-principals.md)).
