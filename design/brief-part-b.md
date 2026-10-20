---
title: Brief Part B — design inputs
summary: The Principals' design inputs for the Desk as received on 20 Oct 2026; frozen record, not edited.
status: frozen
updated: 2026-10-20
related:
  - design/_index.md
---

# Brief Part B — the artifact (design inputs for Milestones 1–5)

Received from the Principals on Tue 20 Oct 2026. Frozen record: do not edit. Once a design file is approved it becomes the home of the facts it covers.

## 1. Look and structure — copy the Virgo ACP Sales Desk
Reference: https://claude.ai/artifact/MBR7mmdEwR7sHZaVyNVKBv. Study it in Milestone 0 and keep its structure and view; only business, data and the new modules change.
- **Layout:** left sidebar (brand circle + name, nav grouped under small uppercase headings, current-user box at the bottom, Share button); on phones it becomes a horizontal top strip.
- **Top bar:** title + sub-line, period segmented control (MTD · QTD · YTD · custom), branch / plant / salesperson selects, search, toggles.
- **Cards:** soft lavender-grey ground, white 18px-radius cards, soft shadow, uppercase card headings.
- **KPI row:** 4 cards (2 tablet, 1 phone), each with its own colour chip, big tabular number, status pill (up · down · neutral · pending), foot with label/value rows, progress bar, mini bar strip.
- **Body:** 2/3-column card grids, donut + legend, leaderboard with gold/silver/bronze medals, sortable tables with sticky header and sticky indigo total row, orange pending cells, clickable alert cards, classification tiles with coloured left border, breadcrumb chips for drill-down, dashed empty-state panels.
- **Type and colour:** Plus Jakarta Sans + JetBrains Mono; indigo leads, violet second, orange/green/red/sky/pink/teal for status; full dark mode via tokens on :root; no horizontal scroll at 360px.

## 2. Architecture inside the page
- Shared database (load the artifact-capabilities skill before any runtime code) holds: canonical SAP data, plans, users, actions, threads, follow-up queue, upload history, rule settings.
- Rules engine in the page computes Today, checks and escalations on load and on each upload.
- Every number drills down to source SAP documents (system, doc type, doc no, date).
- Ships empty; "Load demo data" fills synthetic data labelled DEMO; "Clear demo" removes it.

## 3. Roles and access (individual resources)
User master: email, name, role, department, branch/plant codes, reports-to, WhatsApp number, Today cap, active flag.

| Role | Sees | Can do |
|---|---|---|
| Super admin | Everything | Users, roles, rules, masters, plan & data upload |
| Management / HO | All branches | Plans, reassign, approve closures, escalations |
| HOD | Own department, all branches | Assign/close dept actions, dept plans |
| Branch / depot manager | Own branch/depot | Branch plans, assign within branch, respond |
| Sales executive | Own customers and targets | Respond to own actions and follow-ups |
| Coordinator (sales / CRR) | Orders, dispatch, customer queries | Raise and track actions |
| Accounts | Receivables, collections | Respond on collection actions |
| Plant | Own plant | Respond on plant actions |

Row-level filtering before rendering. Unknown viewer → "Ask your admin for access". Super admin has a labelled "view as role" preview. Default plant master: factories 1001–1006, HO 1011, depots 1012–1049 (editable).

## 4. Market potential, target vs actual, growth over last quarters — everywhere
### Market potential → target
- **Market potential master** (Admin, editable): quarter × branch/territory × product group × customer segment (segments configurable). Values are in ₹ and quantity (sheets, sq ft). Each figure records its source (dealer/market survey, branch estimate, industry data) and its owner.
- **Target = market potential × target share %.** Share % is set per branch, product group or segment, and the quarter target is phased into months (equal by default, or by uploaded phasing %).
- **Editable through discussion:** every change to a potential figure or share % creates a revision. The revision records old → new, reason, discussion date, participants, who changed it and the status (Draft → Discussed → Approved → Locked for the quarter). Approval is by SP Sir or a Management role. Original and current approved targets are both kept; achievement is shown against the current approved target, with the original one tap away.
- **History as a sense-check, not the source:** beside each target the page shows last quarter's actual, the 12-quarter trend projection and the QoQ growth the target needs. Example: "Target needs +18% QoQ; 12-qtr avg is +6%". A target needing more than 2× the average QoQ is flagged **Stretch** for discussion.
- **Share of potential** (actual ÷ potential) is a KPI at every level, with its own QoQ change.
- Every KPI card: Potential, Target, Actual, Variance (₹, %), Achievement %, Share of potential, required vs current run-rate, **QoQ growth %**, 12-qtr trend arrow, status pill.
- Every table: Potential · Target · Actual · Var · Ach % · Share % · Last Qtr · QoQ % · Trend columns, sorted by variance, total row. Every chart: actual bars, plan line, previous-quarter marker; to-date plan pro-rated by working days.
- Also for collections, dispatch TAT, stock days, new customers and each person's KPIs.

### Historic data and the comparison basis
- **Historic data is loaded** through the same intake (§7) for the previous 12 quarters (FY April–March, Q1 = Apr–Jun). It is stored in the same canonical model with period_status = closed. A closed quarter is locked; re-loading it needs Super admin and is logged.
- **The comparison basis is sequential growth over the last quarter.** Same month last FY, same quarter last FY and YoY are **not shown anywhere**. The period control has no "vs last year" option, and the rules engine never uses them.
  - Quarter view: current quarter vs previous quarter (Q3 FY27 vs Q2 FY27; Q1 vs Q4 of the prior FY).
  - Month view: month vs the same position in the previous quarter (Oct vs Jul, Nov vs Aug, Dec vs Sep), shown next to the quarter's QoQ.
  - Quarter-to-date: QTD vs the previous quarter's same working-day count, pro-rated by working days.
  - YTD: cumulative quarters of the current FY, shown as a quarter-by-quarter trend with QoQ steps. It is not compared with the last FY's YTD.
- **Trend card** on Overview, Sales and each person's scorecard: the last 12 quarters as bars with target markers, a QoQ % line, a 4-quarter moving average and a trend line (average QoQ growth and direction: rising / flat / falling). Achievement % per quarter is shown under each bar. Drill-down goes to the quarter → month → document.
- **Rules use QoQ:** a QoQ decline beyond a threshold (default −5%, editable) for a branch, customer, product group or person creates an action for its owner, with the decline and the last-quarter figure on the card.
- **New entities:** a customer, item or person with no last-quarter data shows "New, no prior quarter" rather than a growth figure. Growth is not computed on a zero base.

## 5. Pages (sidebar)
**Overview** · **Sales** (branch → salesperson → customer → invoice; A/B/C customer tiles) · **Orders & Dispatch** (open orders, O2D days vs plan TAT) · **Receivables** (ageing 0–30/31–60/61–90/90+, collection plan vs actual) · **Inventory** (stock vs plan, stock days, ageing) · **Action Center** · **Team & Scorecard** (KRA/KPI plan vs actual per person/role, on-time closure %, data errors) · **Data Intake** · **Admin**.

## 6. Action Center and follow-ups
- **Today** is the landing page for non-admin roles: top N (role cap) actions ranked by due-date urgency + value at risk + customer impact + ageing + dependency (weights editable; card shows why it ranked).
- **Created by** rules (plan shortfall, overdue receivable, order beyond TAT, ageing stock, rejected upload row, missing plan) or manually by a manager. Each: ID, title, source link, one owner, one due date, one next step, priority, status, creator, timestamps.
- **Statuses:** Open → Acknowledged → In progress → Done (closure note required) → Verified closed (by assigner); side states Blocked (reason) and Reassign requested.
- **Owner responses in page:** Acknowledge · Update (comment + new ETA) · Mark done · Need help · Request reassign — each a timestamped thread entry.
- **Escalation ladder:** due tomorrow → reminder; overdue 1 day → L1 to owner; 3 days → L2 to reports-to; 7 days → L3 to HOD/HO. Each step drafts an email + WhatsApp message (template + action link) into "Follow-ups to send"; the sender uses Copy / Open mail / Open WhatsApp and marks Sent.
- **Action log:** every ask, response, decision and closure; filters; CSV export.

## 7. Data intake — SAP Business One now, S/4HANA ready
One canonical model; every row keeps source_system (B1/S4), source_doc_type, source_doc_no, source_line, loaded_at, upload_id. Accept CSV/XLSX, auto-detect source from headers, save confirmed column mapping per file type.

| Canonical entity | SAP B1 (now) | SAP S/4HANA (later) |
|---|---|---|
| Customer | OCRD: CardCode, CardName, GroupCode, SlpCode | KNA1/BUT000: KUNNR, NAME1 · API_BUSINESS_PARTNER |
| Item | OITM: ItemCode, ItemName, ItmsGrpCod, InvntryUom | MARA/MAKT: MATNR, MAKTX, MATKL, MEINS · API_PRODUCT_SRV |
| Sales employee | OSLP: SlpCode, SlpName | VKGRP / partner function |
| Plant / warehouse | OWHS: WhsCode, WhsName | T001W: WERKS · LGORT |
| Sales order | ORDR/RDR1: DocNum, DocDate, CardCode, ItemCode, Quantity, LineTotal, WhsCode | VBAK/VBAP: VBELN, AUDAT, KUNNR, MATNR, KWMENG, NETWR, WERKS · API_SALES_ORDER_SRV |
| Delivery | ODLN/DLN1: DocNum, DocDate, BaseRef | LIKP/LIPS: VBELN, WADAT_IST, VGBEL · API_OUTBOUND_DELIVERY_SRV |
| Invoice | OINV/INV1: DocNum, DocDate, CardCode, ItemCode, Quantity, LineTotal, SlpCode | VBRK/VBRP: VBELN, FKDAT, KUNAG, MATNR, FKIMG, NETWR · API_BILLING_DOCUMENT_SRV |
| Credit note | ORIN/RIN1 | VBRK credit-memo billing type |
| Receivable | Open OINV + JDT1: DocDueDate, DocTotal, PaidToDate | ACDOCA/BSID: BELNR, ZFBDT, WRBTR · I_OperationalAcctgDocItem |
| Collection | ORCT: DocNum, DocDate, CardCode, DocTotal | ACDOCA incoming payment (DZ) |
| Stock | OITW: ItemCode, WhsCode, OnHand | MARD/MATDOC: MATNR, WERKS, LGORT, LABST · API_MATERIAL_STOCK_SRV |

- Validation at upload: mandatory fields, duplicate doc+line, unknown codes, date outside period, negative qty only on credit notes. Bad rows → rejected-rows report + action for the uploader; good rows load.
- Re-upload of an open period replaces that period for that entity. Closed (historic) quarters are locked; see §4. Upload history keeps row counts.
- Historic upload mode: accepts one file per entity per quarter, or a multi-quarter file split by doc date. It shows a coverage grid (entity × quarter: loaded / missing / partial), so gaps in history are visible before any QoQ figure is trusted. A quarter with partial data shows its QoQ figures greyed with "incomplete history".
- Quantity in sheets and sq ft (item-master conversion); values in ₹, shown in lakh/crore with Indian grouping.
- "SAP S/4HANA live feed" card in Data Intake (status: not connected) listing the OData endpoints above, so the later switch is a source change, not a redesign.

## 8. Acceptance checks (Engineering QA)
1. Each role sees only its scope.
2. Today never exceeds the role cap.
3. Every KPI, row and chart point shows plan vs actual and drills to source documents.
4. A B1 file and an S/4 file with the same data give identical numbers.
5. An overdue action produces L1 → L2 → L3 drafts on the right days; nothing auto-sends.
6. Responses appear in the thread and action log; Done requires a closure note.
7. Layout matches the reference at 360px, 768px, 1440px, light and dark.
8. No real Virgo data in the repo or page source.
9. Every growth figure is QoQ against the correct previous quarter, including the Q1 → prior FY Q4 crossover. No view, rule or export compares with the same month or quarter of last FY.
10. Closed quarters cannot be overwritten without Super admin, and the coverage grid flags missing history.
11. Target = potential × share % at every level and sums correctly. Every edit creates a revision with reason and discussion date, and a locked quarter cannot be edited.
12. The 12-quarter trend, moving average and Stretch flag match a hand calculation on demo data.
