---
title: Wireframes
summary: Greyscale, mobile-first wireframes with real labels for every page, matched to the reference layout; all pages drawn and ready for SP Sir's approval.
status: ready for approval
updated: 2026-10-20
related:
  - design/_index.md
  - design/brief-part-b.md
  - design/role-matrix.md
  - design/notification-templates.md
  - design/priority-rules.md
  - design/target-model.md
  - design/comparison-basis.md
---

# Wireframes
**Owner:** Product Designer · **Milestone:** M2 · **Approval:** not submitted
**Input:** [Brief Part B — design inputs](brief-part-b.md) §1, §5, §6, §7

**Done when:** every sidebar page plus Today, action thread, intake and admin is drawn at phone and desktop width and shared as a link; SP Sir has approved in writing.

## Mock-ups
Static greyscale HTML, shared kit [wf.css](wireframes/wf.css); start at [index.html](wireframes/index.html). Open in a browser and resize to 360 and 1440 px. All values are invented and marked DEMO. Every table, card and chart follows [Brief Part B](brief-part-b.md) §4: Potential · Target · Actual · Var · Ach % · Share % · Last Qtr · QoQ % · Trend with a total row; actual bars, plan line, previous-quarter marker; 12-quarter trend on Overview, Sales and the person scorecard; no last-year comparison anywhere.

| Screen | File | Serves | Status |
|---|---|---|---|
| Index of all mock-ups | [index.html](wireframes/index.html) | all | ready for approval |
| Overview: KPI cards, 12-quarter trend, branch chart, alerts, product-group and branch tables, YTD strip, target revision and Stretch | [overview.html](wireframes/overview.html) | desk-v0.9 | ready for approval |
| Sales: A/B/C tiles, leaderboard, drill-down branch → salesperson → customer → SAP document | [sales.html](wireframes/sales.html) | desk-v0.9 | ready for approval |
| Orders & Dispatch: open orders, O2D days vs plan TAT | [orders-dispatch.html](wireframes/orders-dispatch.html) | desk-v0.9 | ready for approval |
| Receivables: ageing buckets, collection plan vs actual | [receivables.html](wireframes/receivables.html) | desk-v0.9 | ready for approval |
| Inventory: stock vs plan, stock days, ageing | [inventory.html](wireframes/inventory.html) | desk-v0.9 | ready for approval |
| Action Center: actions, raise action, Follow-ups to send, Action log | [action-center.html](wireframes/action-center.html) | desk-v0.9 | ready for approval |
| Team & Scorecard: KRA/KPI per person, person scorecard with 12-quarter trend | [team-scorecard.html](wireframes/team-scorecard.html) | desk-v0.9 | ready for approval |
| Today: ranked, capped, why-ranked | [today.html](wireframes/today.html) | desk-v0.9 | ready for approval |
| Action thread: status ladder, responses, follow-up drafts | [action-thread.html](wireframes/action-thread.html) | desk-v0.9 | ready for approval |
| Data Intake: upload, mapping, validation, rejected rows, coverage grid, history, S/4 card | [v0.1-data-intake.html](wireframes/v0.1-data-intake.html) | desk-v0.1 (built) | ready for approval |
| Admin: users, plants, market potential, revision trail, original vs current target, Stretch | [v0.1-admin-masters.html](wireframes/v0.1-admin-masters.html) | desk-v0.1 (built) | ready for approval |
| Page states: unknown viewer, empty, new entity, partial history, locked quarter, view as role, draft target | [states.html](wireframes/states.html) | desk-v0.9 | ready for approval |
| Notification texts: reminder, L1, L2, L3 | [Notification templates](notification-templates.md) | desk-v0.9 | ready for approval |

Not yet checked in a browser (none in this environment); layout is by CSS only. HTML structure was checked for balanced tags. Labels still waiting on the Data Architect's rules are marked "pending rules" on the page.

## Open questions for approval
Each has a recommendation; the wireframes draw the recommendation.
1. **Potential and share of potential for non-sales KPIs** (collections, TAT, stock days, new customers). Drawn: Potential shows "Collectable (due)" or "Addressable" marked pending rules, or "—" where none exists (TAT, stock days). Recommendation: "—" where there is no market potential; keep Target, Actual, Var, Ach %, QoQ.
2. **Composite scorecard score.** [KRA / KPI set](kra-kpi.md) has no weights, so none is drawn; the scorecard shows KPIs on plan out of total. Recommendation: no composite score (it would invite ranking, which is SP Sir's decision).
3. **Trend card bars.** Drawn as the 12 closed quarters (Q3 FY24 to Q2 FY27, as in [Target model](target-model.md)) plus the current quarter to date. Recommendation: keep.
4. **QoQ shown on QTD tables, actions only on completed periods** (rule R7). Recommendation: keep; tables label the pro-rated basis.
5. **Not redrawn:** Data Intake and Admin are the v0.1 drawings plus v0.9 additions (access note, Stretch sense-check).

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
