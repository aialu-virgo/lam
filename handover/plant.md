---
title: Plant guide
summary: One-page guide for the Plant role: what you see, Today, responding to actions, drilling to the SAP document, follow-up drafts.
status: draft (to check against desk-v1.0 in the page)
updated: 2026-10-20
related:
  - handover/_index.md
  - design/role-matrix.md
  - design/priority-rules.md
  - design/escalation-ladder.md
  - design/notification-templates.md
---

# Plant guide
You see orders, dispatch and stock for your own plant only. All figures in the examples are DEMO.

## What you see
- Orders & Dispatch, Inventory and Action Center, for your plant. Another plant's orders never appear.
- You respond on plant actions (order beyond TAT, ageing stock) and propose P4 and P5.
Every table follows one layout: Potential, Target, Actual, Var, Ach %, Share %, Last Qtr, QoQ %, Trend, with a total row. Growth is quarter on quarter only; there is no last-year comparison. A quarter with partial history shows QoQ greyed with "incomplete history". Achievement is not shown for a target that is not approved.

## Your Today list
Your own plant actions. Default cap 5. Actions are ranked by rules (due date, value at risk, customer class, age, dependency), not by a person or an AI. Each card says why it is ranked, for example "Ranked 1: overdue 2 days (35.0 pts), Rs 8.5 lakh at risk (21.3 pts). Score 77.3." Extra items show as "N more in Action Center".

## Respond to an action
Open the card on Today (or the row in Action Center) and choose one. Every response becomes a timestamped entry in the thread and in the action log.
| Button | Use it when | What it needs |
|---|---|---|
| Acknowledge | You have seen it and own it | Nothing |
| Update + ETA | You are working on it | A comment and a new ETA |
| Mark done | The work is finished | A closure note (required), for example receipt no, amount, date |
| Need help | You are stuck | A comment; it does not stop the ladder |
| Request reassign | It belongs to someone else | A reason; it does not stop the ladder |
Status runs Open, Acknowledged, In progress, Done, Verified closed. The person who assigned it checks your closure note and marks Verified closed, or reopens it with a note. Blocked (with a reason) is a side state. Each action has one owner, one due date and one next step.

## Drill a number down to the SAP document
Tap a figure, chart bar or scorecard number and keep going: branch, salesperson, customer, then the SAP document (system, document type, document number, date, customer, totals). The path stops at the document: lines inside it are in SAP (D9). An action card has "Source" and "open source document" for the same reason. A document covering two product groups appears once with its full total, so a list can total more than the figure above it; the page says so.

## Follow-up drafts
The Desk writes the follow-up text (Reminder one day before due, L1 one day overdue, L2 at 3 days, L3 at 7 days); **nothing sends by itself**. No. You do not send drafts. Texts about your action reach you from your sender. A sender uses Copy, Open mail or Open WhatsApp (a link, no WhatsApp service), then marks Sent or Dismissed with a reason. Texts are in [Notification templates](../design/notification-templates.md).

Orders and stock need their exports; until then the page shows an empty state naming them. Check in the page.
