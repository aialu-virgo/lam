---
title: Escalation ladder
summary: Reminder one day before due, then L1, L2, L3 drafts at 1, 3 and 7 days overdue to owner, reports-to and HOD/HO; drafts only, nothing auto-sends; with a dated worked example for QA check 5.
status: draft
updated: 2026-10-20
related:
  - .claude/rules/boundaries.md
  - design/notification-templates.md
  - design/_index.md
  - design/priority-rules.md
  - design/role-matrix.md
  - design/check-rules.md
  - design/kra-kpi.md
  - data-map/user-master.md
  - open-questions.md
---

# Escalation ladder
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** not submitted
**Input:** [Brief Part B — design inputs](brief-part-b.md) §6 Escalation ladder

**Done when:** each step has day, recipient, template and the rule that nothing auto-sends.

## Nothing auto-sends
The Desk **drafts**; a person sends ([Rules — boundaries](../.claude/rules/boundaries.md)). Each step creates one draft pair (email text and WhatsApp text) in **Follow-ups to send**. The sender uses **Copy**, **Open mail** (`mailto:`) or **Open WhatsApp** (`wa.me` link, **Assumed (Q12)**: links only, no Business API), then marks **Sent**, or **Dismissed** with a reason. The page never calls a mail or WhatsApp service. Message texts are in [Notification templates](notification-templates.md); this file fixes who, when and which placeholders.

## Ladder (calendar days from the due date; **Assumed (Q11)**: 1 / 3 / 7)
| Step | Day | Recipient | Email | WhatsApp |
|---|---|---|---|---|
| **Reminder** | due date − 1 (`remind_days_before` = 1) | Owner | Yes | Yes |
| **L1** | overdue 1 day (due date + 1) | Owner | Yes | Yes |
| **L2** | overdue 3 days | Owner's `reports_to_email`; owner in cc | Yes | Yes |
| **L3** | overdue 7 days | HOD of the action's department; if none, all Management / HO users | Yes | Yes |

`overdue_days = today − due_date` (IST dates). The due day itself is not overdue.

**Recipient rules**
- HOD = active user with role HOD and `department` = the action's department; the department comes from the rule that created the action or from the creator's department for manual actions.
- If a step's recipient is the same person as an earlier step's, it goes one level up (owner reports to the HOD → L3 goes to Management / HO). If the owner has no `reports_to_email`, L2 goes to the HOD.
- If the recipient has no `whatsapp_number`, only the email draft is made and a data error is logged against the user ([User master](../data-map/user-master.md)).

## Who sends
The **assigner** sends drafts for the actions they assigned. For actions created by a rule, the sender is the **Coordinator** whose plants include the action's plant; none → Super admin (**Assumed (new)**). Each sender sees only their drafts. The queue is separate from Today and not counted in its cap ([Priority rules](priority-rules.md)).

## Engine behaviour (no server, no scheduler)
- The engine runs **when someone opens the page and on each upload**. A step is drafted by the first load on or after its day.
- **One step per action per calendar day.** After a gap (nobody opened the page), the lowest step not yet drafted is created at the first load and the next step is created at the next day's load. This avoids jumping an owner straight to the HOD without a first message (**Assumed (new)**).
- A draft is created once per (action, step, due date). It carries the days overdue **at the time it is created**, not the nominal step day.
- The ladder stops at **Done** or **Verified closed** and when the action is cancelled. **Blocked** and **Need help** do **not** stop it; an assigner who agrees a new date edits the due date (logged). A new due date restarts the ladder from that date; drafts already made stay in the log.
- A rule-created action stays with its owner until reassigned; **Request reassign** does not stop the ladder.
- Drafts unsent for more than one day show "waiting {n} days" and are counted in the sender's scorecard ([KRA / KPI set](kra-kpi.md)).

## Draft fields
`action_id`, `step`, `to_name`, `to_email`, `to_whatsapp`, `cc_email`, `subject`, `body`, `link` (to the action in the page), `created_at`, `status` (Drafted / Sent / Dismissed), `sent_by`, `sent_at`. Placeholders in the templates: `{owner}`, `{recipient}`, `{action_id}`, `{title}`, `{due_date}`, `{days_overdue}`, `{next_step}`, `{value_at_risk}`, `{reports_to}`, `{link}`.

## Worked example for QA check 5 (invented)
Action A-1042 "Overdue receivable K1", owner `se.s1@demo` (reports to `bm.a@demo`, who reports to `hod.sales@demo`), due **Thu 22 Oct 2026**, status In progress, nobody closes it. Sender: `coord.a@demo`.

| Date | Overdue days | Page opened? | Draft created | To |
|---|---|---|---|---|
| Wed 21 Oct | −1 | yes | **Reminder** | S1 |
| Thu 22 Oct | 0 | yes | none | — |
| Fri 23 Oct | 1 | yes | **L1** | S1 |
| Sat 24 Oct | 2 | yes | none | — |
| Sun 25 Oct | 3 | **no** | none (nobody opened the page) | — |
| Mon 26 Oct | 4 | yes | **L2** (text says "overdue 4 days") | bm.a, cc S1 |
| Thu 29 Oct | 7 | yes | **L3** | hod.sales |

Variants:
- **Gap:** nobody opens the page from Tue 20 Oct to Thu 5 Nov (overdue 14). Thu 5 Nov: L1 ("overdue 14 days", no Reminder because the due date has passed); Fri 6 Nov: L2; Sat 7 Nov: L3. Nothing is sent without a person.
- **Closed in time:** `se.s1` marks Done on Sat 24 Oct, after L1 → no L2, no L3.
- **New date:** assigner moves due to Mon 2 Nov on Fri 23 Oct → the ladder restarts: Reminder for Sun 1 Nov (drafted at the Mon 2 Nov load as "due today"), L1 on Tue 3 Nov; the Reminder and L1 drafted for 22 Oct stay in the log.

Pass criteria: the drafts above appear exactly on the stated loads; each has the right recipient and the {days_overdue} value; **no message leaves the page**; Mark sent records sender and time; a draft for a recipient without WhatsApp has no WhatsApp text.
Demo mode needs a "set today" control (Full-Stack Engineer) so QA can run this table.

## D9 effects
None on the ladder itself: actions, drafts and users are small collections. The action's **source link** can drill down to the document, not to the line.

## Settings (Admin)
`remind_days_before` 1 · `L1_days` 1 · `L2_days` 3 · `L3_days` 7 (**Assumed (Q11)**) · `one_step_per_day` on (**Assumed (new)**) · WhatsApp as `wa.me` links (**Assumed (Q12)**).
