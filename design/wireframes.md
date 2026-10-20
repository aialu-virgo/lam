---
title: Wireframes
summary: Greyscale, mobile-first wireframes with real labels for every page, matched to the reference layout; v0.1 intake and admin drawn.
status: draft
updated: 2026-10-20
related:
  - design/_index.md
  - design/brief-part-b.md
---

# Wireframes
**Owner:** Product Designer · **Milestone:** M2 · **Approval:** not submitted
**Input:** [Brief Part B — design inputs](brief-part-b.md) §1, §5, §6, §7

**Done when:** every sidebar page plus Today, action thread, intake and admin is drawn at phone and desktop width and shared as a link; SP Sir has approved in writing.

## Mock-ups
Static greyscale HTML, shared kit [wf.css](wireframes/wf.css). Open in a browser; resize to 360px and 1440px. All values are invented and marked DEMO.

| Screen | File | Serves | Status |
|---|---|---|---|
| Data Intake: upload, mapping, validation, rejected rows, coverage grid, history, S/4 card | [v0.1-data-intake.html](wireframes/v0.1-data-intake.html) | desk-v0.1 | drawn |
| Admin: users, plants, market potential with revision trail | [v0.1-admin-masters.html](wireframes/v0.1-admin-masters.html) | desk-v0.1 | drawn |
| Today | [today.html](wireframes/today.html) | desk-v0.9 | first draft |
| Action thread | [action-thread.html](wireframes/action-thread.html) | desk-v0.9 | first draft |
| Overview, Sales, Orders & Dispatch, Receivables, Inventory, Action Center list, Team & Scorecard | not started | desk-v0.9 | open |

Not yet checked in a browser (none in this environment); layout is by CSS only.

## Reference study
Source: the Virgo ACP Sales Desk artifact. The Artifact tool's summary was truncated; layout tokens below come from the page's own stylesheet in the saved raw read. No data shown there is recorded here.

- **Shell:** two-column grid, sidebar 232px + fluid main. Below 860px the sidebar becomes a horizontal scrolling strip (nav groups in a row, headings hidden).
- **Sidebar:** brand circle + name and sub-line; groups with 10.5px uppercase headings; items 13.5px/500, 10px radius, active item tinted; small tags (NEW, DATA, DAILY, RULES) at the right; current-user box and Share at the bottom.
- **Top bar:** wrapping flex row. Left: page title + grey sub-line. Right: pill segmented control (period), selects, toggle, "Clear filters", data-source chip, theme toggle, Share link.
- **Cards:** white, 1px line border, 18px radius, soft shadow, padding 16×18, 12px inner gap, uppercase small headings.
- **KPI row:** 4-column grid, 14px gap; 2 columns at ≤1100px, 1 at ≤520px. Card: coloured 28px chip (9px radius), 11px bold pill status, 28px/800 tabular number, label/value foot rows (12px), progress bar, mini bars.
- **Tables:** sticky header, tabular numbers, sticky total row on soft indigo; horizontal scroll inside a wrapper, never the page.
- **Grids:** 2-col, 3-col (1.2fr 1fr 1fr, first column spans at ≤1100px), 1fr/2fr; auto-fit tiles (min 170 to 240px) for classification and alert cards.
- **Colour (light):** bg #f3f4fa, card #fff, line #e7e8f2, ink #161827 / #555a72 / #8a8fa8; indigo #5b4de8 leads, violet #8b5cf6, orange #f59e0b, green #10b981, red #ef4444, sky #0ea5e9, pink #ec4899, teal #14b8a6.
- **Colour (dark):** same names on :root; bg #0f1017, card #181a24, line #262938, ink #eef0f7, accents lightened.
- **Type:** Plus Jakarta Sans 400–800 for text, JetBrains Mono for codes and figures. Radii 8, 10, 12, 16, 18px and pills 999px.
- **Breakpoints:** 1100, 900, 860, 620, 520px (build to 360, 768, 1440 per acceptance check 7).
- **Wireframe choice:** the mock-ups replace colour with greyscale (hatched = partial or pending, dashed = missing or empty, solid dark = loaded or approved) and keep every structural token above. The wireframe nav adds Today and groups pages under Overview / Team / Data; the reference's own groups differ and are not copied.
