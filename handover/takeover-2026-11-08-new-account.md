---
title: Takeover by another Claude account — Desk lane (8 Nov 2026, 20:40 IST)
summary: Everything a new Claude account needs to take over the claude.ai Desk lane: access, live state, open threads, promises to Vijay, exact next steps, rules learned today.
status: active
updated: 2026-11-08
related:
  - handover/_index.md
  - handover/session-takeover-2026-11-08-desk-load.md
  - decisions.md
  - milestones.md
  - CLAUDE.md
---

# Takeover by another Claude account — Desk lane

Read [CLAUDE.md](../CLAUDE.md) and the rules in `.claude/rules/` first: you are the Delivery Lead; Principals are Vijay (data@virgoasia.com) and SP Sir. Supersedes [the 15:35 note](session-takeover-2026-11-08-desk-load.md).

## 1. Access the new account needs (ask Vijay)
- **Desk artifact** https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx — owned by data@virgoasia.com. Vijay is sharing it; you need **edit** access to publish and to write its database (ArtifactData). Check with `Artifact action:"read"`: the header must say "writer".
- **GitHub** aialu-virgo/lam (this repo). Your own designated branch will differ; this lane's working branches are below.
- **Google Drive** (optional): VIRGO_ONE › Laminates › Sales / Credit Note / Collection / Inventory / Master Data. The Drive connector cannot download files over 10 MB; Vijay attaches large files in chat instead.
- **Apps Script /exec Desk** (virgoasia.com sign-in only, Vijay runs it): https://script.google.com/a/macros/virgoasia.com/s/AKfycbydN1i3bDYOE1BOaqSat4BvRIfDAJu30qWAXfCKc-QwQ1E58Z9x0OiWaRAFziW9FX5GLw/exec — steps in `build/desk-gas/README.md`.

## 2. Branches (GitHub, at 20:40 IST)
| Branch | Head | What |
|---|---|---|
| `m8-dashboard` | 5db7cfe | **Release candidate**: v44 + other lane's Targets by State/Geography/SAP feed + My Dashboard + fixes (dashboard layouts in full backup; Apps Script own-layout write rule). Not yet published. |
| `m8-gcp` | f79d0fb | This lane's docs: decisions D68–D71, D150–D152, takeover notes. Does not contain all of m8-dashboard's code. |
| `claude/sweet-wright-ky7rr0` | 48db8d3 | Previous designated branch of this lane (behind m8-gcp). |
| `claude/serene-clarke-g6hgzg` | 57eb38d | Other lane (Targets & Potential by State, SAP S/4 feed, customer master, Apps Script). Contains 5db7cfe. |
| `m8-v44-fix` | 1d9baaf | v44 as published at 15:21 (version 47). Tag `desk-v44` push was refused (403) — not tagged. |

## 3. Live state
- **Desk version 48** (published 18:44 IST from m8-dashboard 9e564ea): My Dashboard (D151/D152) + v44 + other lane's merge. Known defect fixed in 5db7cfe but **not yet live**: full backup/restore omits `dashroles` and `dashlayouts` (no layouts saved yet, dashroles empty at 18:50).
- **Data** (D150): sales Apr 2025–Oct 2026 reloaded from the 19 Sales Register files through the v44 intake (thickness/brand/zone detail), 12 Virgo-group customers excluded as inter-company (D70), stock as on 7-Nov-2026 loaded, credit notes Apr 2025–Sep 2026 loaded and **locked** (18 lock docs). Oct 2026 file is S/4 to 28 Oct: 9,049 of 107,712 rows rejected — not yet investigated.
- **DB size**: ~4,900 of 25,000 docs; upload backups ≈ 20 MB of the 100 MB limit.
- **Apps Script /exec**: Vijay restored the claude.ai backup (second restore started ~18:00). The other lane sent him Apps Script files from 5db7cfe (its D101).

## 4. Open threads and exact next steps
1. **QA re-check of 5db7cfe** was running in this account (blind QA incl. tdash3/tdash3b/theme which the other lane could not run, full suite, backup↔restore of layouts). It does not carry over: re-run it with an `engineering-qa` agent (criteria: D151 in decisions.md + design/dashboard-builder-spec.md; baseline failures t51 2, t52 2, t57 2–3, t59 fixture, t8 flaky). Also measure first-paint on a 45-plant × 19-month synthetic store — the engineer saw ~87 s to decode all roll-ups on load (existing code); if real, that is the next fix.
2. **Publish 5db7cfe to the claude.ai Desk** after QA passes. The other lane has already given its OK. Build: check out 5db7cfe, `build/desk/dist/index.html` (rebuild with `node build/desk/build.mjs` if needed), publish with `url` = the Desk URL. The publish will be refused until you have viewed the live version — read it, confirm it equals version 48 (9e564ea) plus the platform wrapper, then publish. Tell the other lane the version number.
3. **DB rules** (capabilities): `dashroles` should be admin-write, `dashlayouts` interact-write. Changing capabilities replaces the whole 21-rule set — read the current rules first; load the `artifact-capabilities` skill.
4. **October S/4 rejects** (8.4%): read the upload's `rejects` docs, find the reasons, report to Vijay.
5. **SAP feed** (other lane owns the build; Vijay runs it): after his restore → `sapShadowRun` → compare → only then `SAP_SYNC_ENABLED=yes`, `sapSync`, Load SAP feed, `sapInstallDailyTrigger`; then `sapCustomerSync`. Ask Vijay for the shadow-run log.
6. Merge `m8-dashboard` into your working branch and `m8-gcp`; record decisions in this lane's range.

## 5. Promised to Vijay
- The fixed dashboard republished after QA (was due this evening).
- A report on October's rejected rows.
- Check of the SAP shadow-run log when he sends it.

## 6. Coordination with the other lane
- Session "Virgo Asia Master Data Portal / Session deliverables timing", reachable with the claude-code-remote `send_message` tool, session `session_01WVJW4uiLsdCDFMBpcLLVLw` (from another account you may not reach it — then coordinate through Vijay).
- **One publisher at a time**: message before any claude.ai Desk publish and wait for OK.
- **Decision numbers**: other lane D100–D149; this lane **D150 onwards** (next free: D153).

## 7. Lessons from today (keep)
- Never load credit-note registers through the sales intake (D60); the intake now refuses them.
- Live data loads: stage files headlessly through the page's own intake (`build/desk/test/stage-upload.mjs`, `stage-cn.mjs`), snapshot with ArtifactData `list` + `out_dir`, write with `batch` (≤50 writes, <1 MiB, `if_version` on every existing doc). Keep the Desk tab **closed** during writes — an open Super-admin tab rebuilds roll docs and breaks pins. Delete all real-data scratch files afterwards; never commit data.
- Credit-note locks block sales replace/undo for those months: unlock (log a reason), load, relock.
- The page's admin job queue (`jobs` collection: undo, clear_demo, set_zones) runs when a Super admin opens the Desk — use it for page-only actions.
- The transfer (inter-company) list applies at load time only; changing it needs a reload of affected months.
- Vijay's rule (feedback.md): when he asks for speed on a feature he specified, build the final version on real data directly — no demo mock-up — but keep QA before publish.
