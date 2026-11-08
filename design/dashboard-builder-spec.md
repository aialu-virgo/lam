---
title: My Dashboard builder, spec
summary: Written spec for a customisable My Dashboard (card catalogue by module, builder, layouts, drill-down, phone, infographic style); built straight into the Desk, no mock-up approval step.
status: draft, for build (Vijay, 8 Nov 2026: build final version directly)
updated: 2026-11-08
related:
  - design/_index.md
  - design/wireframes.md
  - design/wireframes/dashboard-builder.html
  - design/wireframes/overview-infographic.html
  - design/role-matrix.md
  - design/comparison-basis.md
  - design/kra-kpi.md
  - decisions.md
---

# My Dashboard builder, spec
**Owner:** Product Designer · **Input:** Vijay, 8 Nov 2026: "dynamic dashboard where it can be pick and drop to be customised… cards so wholistic that whatever any one can imagine could be derived"; then "most dynamic in form of infographic… all modules… runs on actual data"; then "build the final version straight into the Desk".
**Reference prototype (partial, DEMO numbers, not for publishing):** [dashboard-builder.html](wireframes/dashboard-builder.html). It proves the card model, builder with live preview, pointer-event drag, resize, duplicate, remove, layouts, role cap note, role scope and drill-down. It does **not** yet draw the Benchmark, Small-multiples and Coverage visuals or the Actions, Planning and Data-health cards; those are specified below. Visual style: [Overview infographic](wireframes/overview-infographic.html).

## 1. Card model (one rule, every card)
A card is saved data, never code: `{ id, title, measure, breakdown, filters[], period, visual, n, direction, sortBy, span 1–4 }`. The page draws it by rules and queries; **no AI/LLM**. Row-level access is applied to the query before drawing, so a card can never show more than the viewer's scope ([Role matrix](role-matrix.md)).
- **Measure** (what): see catalogue. Each measure knows its numerator, denominator, whether it adds up, whether lower is better, whether it is a month-end snapshot, whether it has a target, and the first month it is loaded.
- **Breakdown** (by): None, Plant, Zone (1–5, D65), State, Product group, Thickness, Brand, Item, Customer, Salesperson, Ageing bucket (receivables only). Actions measures allow None, Plant, Zone, State only.
- **Filters** (where): up to 3, dimension plus one or more values, combined with AND.
- **Period** (when): Follow dashboard (default), Month, Quarter, QTD, FY, Custom.
- **Visual** (how): KPI tile (tile grid when a breakdown is set), Bar, Stacked bar (7 quarters), Line trend, Donut (top 6 + Other), Table, Ranked list (top/bottom N, sort by value or QoQ), Heatmap (breakdown × last 8 months), Bullet vs target, plus three new: **Benchmark** (members against best and median, with percentile), **Small multiples** (one tile per member: big number, QoQ, 6-quarter sparkline, band tint), **Coverage grid** (data health only).
- The builder greys out any visual that does not fit and says why on hover (e.g. donut for a ratio: "Ratios do not add to a whole"; bullet for a measure with no target).

## 2. Rules that hold on every card
1. **QoQ only.** Month vs same position in previous quarter; quarter vs previous quarter; QTD vs same months of previous quarter; FY shows the latest quarter vs the one before; Custom vs the same range one quarter earlier. No last-year option exists ([Comparison basis](comparison-basis.md)). No prior quarter: "New, no prior qtr", never a growth figure on a zero base.
2. **Sheets first, ₹ second** (D51). Values in lakh/crore with Indian grouping. Ratios show change in percentage points (days for stock days).
3. **Band colours per D51** on Ach %: under 75 Far behind, 75 to under 90 Behind, 90 to under 100 Watch, 100 and over On target; each also carries a text label, a ▼/▲ mark and a dark border. Ach or Share above 300% shows "Check target" / "Check potential" (D55).
4. **Partial is labelled, never zero.** Period incomplete: "partial: 1 of 3 months" (hatched chip, hollow dot, faded bar). Measure not loaded for some months: "partial: n of N loaded". Not loaded at all: dashed empty panel naming the first loaded month.
5. **Branch rating** is informational only (D55 weights sales 50 / collections 30 / stock days 20, stars at 80/60/40/20); never an incentive.
6. **Lower is better** for credit-note ratio, overdue, stock days, open actions: the QoQ chip colours invert.
7. Every card footer shows **DEMO** only while demo data is loaded, and always the **data source** line (section 4). Every figure drills to SAP documents.

## 3. Card catalogue by module
Source names are the Desk's live collections (as used in build/desk): `cells/` plant-month cells, `inv/` invoice documents, `collections/`, `stock/`, `potential/`, `phasing/`, `actions/`, `plants/`, `items/`, `users/`. Receivables, credit-note and upload-history collection names are **to be confirmed by the Full-Stack Engineer** from the v32 intake.

| Module | Card | Measure × breakdown × visual | Binds to |
|---|---|---|---|
| Sales | Sheets vs target | Sheets × None × KPI + bullet | `cells/`, `potential/` target |
| Sales | Net sales (₹) | Net × None × KPI | `cells/` (D40 net basis) |
| Sales | Sheets by zone | Sheets × Zone × KPI tiles (zone tiles, band tint) | `cells/`, `plants/` zone |
| Sales | Thickness split | Sheets × Thickness × Donut | `cells/` detail chunks (D69) |
| Sales | Brand split | Sheets × Brand × Bar | `cells/` detail, `items/` brand |
| Sales | Product-group mix by quarter | Sheets × Group × Stacked | `cells/` detail |
| Sales | Sheets trend, 7 quarters | Sheets × None × Line with target | `cells/` |
| Sales | Plant × month heatmap | Sheets × Plant × Heatmap | `cells/` |
| Sales | Top 5 customers / Top 10 items | Net × Customer, Sheets × Item × Ranked / Table | `inv/` |
| Sales | Net sales by state | Net × State × Table | `cells/`, `plants/` |
| Collections | Collections (₹) | Collections × None × KPI vs collectable | `collections/` |
| Collections | Collection efficiency by plant | Efficiency × Plant × Bar | `collections/`, receivables due |
| Collections | Collections by zone | Collections × Zone × Small multiples | `collections/` |
| Receivables | Ageing | Outstanding × Ageing × Bar or Stacked | receivables intake (confirm) |
| Receivables | Top 5 receivable customers | Outstanding × Customer × Ranked | receivables intake (confirm) |
| Inventory | Stock days (total, by plant) | Stock days × None / Plant × KPI / Bar | `stock/`, `cells/` |
| Inventory | Stock sheets, stock value | Stock, Stock value × None × KPI + sparkline | `stock/` |
| Inventory | Stock by thickness | Stock × Thickness × Donut | `stock/`, `items/` |
| Planning | Targets and potential by state | Sheets × State × Table (value, QoQ, target, Ach %, potential, share) | `cells/`, `potential/` |
| Planning | Share of potential by plant | Share × Plant × Bar | `cells/`, `potential/` |
| Planning | Target phasing | Target × None × Line by month | `potential/`, `phasing/` |
| Planning | Gap to target | Sheets still to target × Plant × Ranked | `potential/`, `cells/` |
| Planning | Potential vs target vs actual | Potential, Target, Sheets × Zone × Bullet | `potential/`, `cells/` |
| Benchmarking | Plant vs plant | Ach × Plant × Benchmark | `cells/`, `potential/` |
| Benchmarking | Zone vs zone | Sheets × Zone × Benchmark | `cells/`, `plants/` |
| Benchmarking | Collections vs best and median | Efficiency × Plant × Benchmark | `collections/` |
| Benchmarking | Stock days vs best and median | Stock days × Plant × Benchmark (low is best) | `stock/` |
| Benchmarking | QoQ movers | Sheets × Plant × Ranked by QoQ | `cells/` |
| Rating | Branch rating | Rating × Plant × Table or Ranked | `cells/`, `collections/`, `stock/` |
| Rating | Person scorecard | Sheets × Salesperson × Table (value, QoQ, share), on-time closure | `cells/`, `users/`, `actions/` |
| Credit notes | Credit-note ratio | CN ratio × None × KPI + sparkline | `cells/` |
| Credit notes | CN ratio by plant, CN by customer | CN ratio × Plant × Bar; CN × Customer × Ranked | `cells/`, `inv/` |
| Actions | Open actions, Overdue, Follow-ups waiting | Counts × None/Plant × KPI / Bar | `actions/` |
| Actions | On-time closure % | Closure % × Plant × Bullet | `actions/` |
| Data health | Coverage grid and last upload | Entity × quarter, loaded / partial / missing | upload history, coverage grid |

Library screen: grouped by module with module icons, a search box, category chips; each card has Add and Customise. Cards the role cannot see are locked, not hidden.

## 4. Data source note on each card
Footer line: `Binds to: <collection> · <measure rule>`, e.g. "cells/ sheets ÷ potential/ approved target". The same line shows in the builder under Measure. On a card using demo plans it also shows DEMO; D55's rule (no DEMO target against real sales) applies to every card. The cards read the live collections already in the Desk; nothing new is loaded for this feature.

## 5. Builder interactions
"+ Add card" opens a panel: tab 1 Starter library, tab 2 Build your own. Build: Measure, Breakdown, Filters, Period, Visual, Title and width, with a **live preview** and a one-line plain-language read ("Sheets, by Zone, for QTD Q3 FY27 · 1 of 3 months, compared QoQ with Q2 FY27 · first 1 of 3, drawn as bar"). Changing the measure or breakdown auto-picks the first visual that fits. Edit reopens the same panel. Esc closes.

## 6. Grid, drag, resize, phone
- 4 columns at 1100 px and above, 2 below, 1 at 620 px and below. Width 1/2/3/4 (3 and 4 become 2 on tablet).
- **Customise** mode shows each card's handle, up/down, width 1–4, Edit, Copy, Remove; reading mode is clean. Remove offers Undo.
- Drag by handle with pointer events (mouse, pen, touch); a dashed placeholder shows the drop spot; the page auto-scrolls near edges. Alt + arrow keys move a focused handle. Resize by the corner grip on desktop.
- **Phone (360 px):** one column, width controls hidden, reorder by handle drag or ↑ ↓ buttons (36 px targets), builder opens full-screen with the preview first, heatmap and tables scroll inside their card, never the page.

## 7. Layouts, role defaults, cap
- **My layout** is saved per user (shared database in build); **Role default** is published by Super admin for Management/HO, HOD, Branch manager, Sales executive, Accounts, Plant. Any edit shows "Unsaved changes"; Save writes My layout; **Reset to role default** returns to the published layout and keeps My layout so the user can switch back.
- Super admin has "view as role" and the Publish button; no one else sees Publish.
- **Cap (gentle):** a note when cards exceed the role's cap; never a block. Suggested defaults, **assumed (Q2)**: Management/HO 12, HOD 10, Branch manager 8, Sales executive 6, Accounts 6, Plant 6. Separate from the Today cap of 5 ([Role matrix](role-matrix.md)).
- Role measure limits: Accounts sees collections, receivables, credit notes and net sales; Plant sees sheets, stock and actions for its plant; Rating only for Management, HOD and (own plant) Branch manager; Data health for Super admin, Management, HOD.

## 8. Drill-down
Click a bar, donut slice, legend item, stacked segment, tile, table name or heatmap row: the card filters and re-breaks-down by the next level (Zone to Plant to Customer to Item; Brand and Thickness swap; Salesperson to Customer), with breadcrumb chips (click to go back) and a "SAP documents" list (system, doc type, number, date, plant, customer, sheets, net ₹). Click a line point to pin the card to that quarter or month. A document spanning two groups sits once with its full total, as in Role matrix D9.

## 9. Infographic style rules
Big tabular numbers; module icon chip on each card header; band-coloured bullet and progress bars with target tick and dashed last-quarter marker; zone and small-multiple tiles with band tint and sparkline; stars for rating; values printed on bars and points; hatched partial, dashed missing. Tokens, fonts and dark mode as in the Overview infographic; no horizontal page scroll at 360 px.

## 10. Build checks for QA
Layout reorder, resize and phone reorder work; each role sees only its scope on every card; QoQ basis text matches the period rule; Ach above 300% shows Check target; partial and not-loaded states never show zero; Branch manager cap note appears at 9 cards; Reset returns the published layout; no AI call anywhere; every figure matches the same Overview figure on real data.

## Open questions for Vijay
1. Role card caps (12 / 10 / 8 / 6 / 6 / 6): keep? Recommendation: keep; they only warn.
2. Who can publish a role default: Super admin only (drawn), or Management too? Recommendation: Super admin only.
3. Person scorecard: salesperson targets are not in the data, so the card shows sheets, QoQ and share, not Ach %. Recommendation: accept until salesperson plans exist.
