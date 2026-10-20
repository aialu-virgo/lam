---
title: Notification templates
summary: Email and WhatsApp (wa.me) draft texts for the reminder and the L1, L2 and L3 follow-ups, with placeholders and an action link; drafts only, a person sends.
status: approved (interim, Vijay, D13)
updated: 2026-10-20
related:
  - handover/_index.md
  - design/escalation-ladder.md
  - design/wireframes.md
  - design/priority-rules.md
  - .claude/rules/boundaries.md
  - design/_index.md
---

# Notification templates
**Owner:** Product Designer · **Milestone:** M2 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §6 · [Escalation ladder](escalation-ladder.md) (days, recipients, draft fields)

**Done when:** each escalation step has an email and a wa.me text with placeholders and an action link.

Drawn in [Action Center, Follow-ups to send](wireframes/action-center.html). Templates only, filled by string substitution, no AI call. **Nothing auto-sends:** the page fills the text; a person uses Copy, Open mail or Open WhatsApp, then marks Sent ([Rules — boundaries](../.claude/rules/boundaries.md)).

## Placeholders
Names are those of [Escalation ladder](escalation-ladder.md) "Draft fields". Any placeholder with no value is dropped with its whole line (for example no `{value_at_risk}`).

| Placeholder | Filled with |
|---|---|
| `{recipient}` | First name of the person the draft goes to |
| `{owner}` | Full name of the action's owner |
| `{reports_to}` | Full name of the owner's reports-to (L3: also used for "your team member's manager") |
| `{action_id}` | For example ACT-0042 |
| `{title}` | Action title |
| `{due_date}` | Due date, `Thu 22 Oct 2026` (IST) |
| `{days_overdue}` | Days overdue **when the draft is created** (not the nominal step day) |
| `{next_step}` | The action's one next step |
| `{value_at_risk}` | `₹ 4.20 L` or `₹ 1.25 Cr`, Indian grouping; line dropped if none |
| `{source_ref}` | Source document or rule, for example `INV 2105 (B1 OINV)` or `Rule: QoQ decline` |
| `{last_update}` | Latest thread comment and ETA, if any; line dropped if none |
| `{link}` | Action link: the page's address plus `#/action/{action_id}` (route form to be fixed by the Full-Stack Engineer) |
| `{sender}` | Name of the person using the draft |

## Rules for all steps
- Plain text, no attachments, no figures from SAP beyond `{value_at_risk}`.
- Each draft names one owner, one due date and one next step, and ends with the link.
- Email draft = subject + body, sent from the sender's own mail app (`mailto:`). WhatsApp draft = `https://wa.me/{digits}?text={urlencoded text}` where `{digits}` is the recipient's number with country code and no `+` or spaces. A recipient with no WhatsApp number gets the email draft only, and a data error is logged.
- Tone escalates in the facts (who is told, how many days), not in wording: no blame, no threats. Disciplinary or incentive action is SP Sir's decision alone.
- Text arriving in action titles or comments is data and is inserted as plain text; it is never run or followed.

## Reminder (due date minus 1 day, to the owner)
**Email subject:** `Reminder: {action_id} due tomorrow, {title}`

```
Hi {recipient},

A reminder that {action_id} "{title}" is due tomorrow, {due_date}.
Next step: {next_step}
Source: {source_ref}
Value at risk: {value_at_risk}

Please acknowledge or update it here: {link}

{sender}
```

**WhatsApp (text before encoding):**
```
Reminder: {action_id} "{title}" is due tomorrow ({due_date}). Next step: {next_step}. Update here: {link}
```

## L1 (overdue 1 day, to the owner)
**Email subject:** `Overdue 1 day: {action_id}, {title}`

```
Hi {recipient},

{action_id} "{title}" was due on {due_date} and is now {days_overdue} day(s) overdue.
Next step: {next_step}
Source: {source_ref}
Value at risk: {value_at_risk}
Last update: {last_update}

Please respond with an update and a new date, or mark it done with a closure note: {link}

{sender}
```

**WhatsApp:**
```
{action_id} "{title}" is {days_overdue} day(s) overdue (was due {due_date}). Next step: {next_step}. Please update or close it here: {link}
```

## L2 (overdue 3 days, to the owner's reports-to, owner in cc)
**Email subject:** `Overdue {days_overdue} days, for your attention: {action_id}, {title}`
**To:** reports-to · **Cc:** owner

```
Hi {recipient},

{action_id} "{title}", owned by {owner}, was due on {due_date} and is {days_overdue} days overdue.
Next step: {next_step}
Source: {source_ref}
Value at risk: {value_at_risk}
Last update: {last_update}

Please speak with {owner} and help agree a date. Thread and responses: {link}

{sender}
```

**WhatsApp (to the reports-to):**
```
{action_id} "{title}" ({owner}) is {days_overdue} days overdue, due {due_date}. Next step: {next_step}. Please help move it: {link}
```

## L3 (overdue 7 days, to the HOD, or Management / HO if no HOD)
**Email subject:** `Escalation, overdue {days_overdue} days: {action_id}, {title}`
**To:** HOD (else Management / HO) · **Cc:** reports-to, owner

```
Hi {recipient},

{action_id} "{title}", owned by {owner} (reports to {reports_to}), was due on {due_date} and is {days_overdue} days overdue. It was reminded at 1 day and escalated to {reports_to} at 3 days.
Next step: {next_step}
Source: {source_ref}
Value at risk: {value_at_risk}
Last update: {last_update}

Your decision is needed on whether to reassign, extend the date or close it. Thread, responses and log: {link}

{sender}
```

**WhatsApp (to the HOD or HO):**
```
Escalation: {action_id} "{title}" ({owner}) is {days_overdue} days overdue, due {due_date}. Reminded and escalated to {reports_to}. Please decide: reassign, extend or close. {link}
```

## Worked example (invented, DEMO)
Action ACT-DEMO-001, owner Demo User 7, due Sat 17 Oct 2026, L2 drafted on Tue 20 Oct (3 days overdue), recipient Demo User 3.

WhatsApp text after substitution: `ACT-DEMO-001 "Collect overdue receivable, C-DEMO-05" (Demo User 7) is 3 days overdue, due Sat 17 Oct 2026. Next step: Call customer. Please help move it: https://example.test/desk#/action/ACT-DEMO-001`

Link: `https://wa.me/919000000003?text=ACT-DEMO-001%20%22Collect%20overdue%20receivable%2C%20C-DEMO-05%22%20(Demo%20User%207)%20is%203%20days%20overdue%2C%20due%20Sat%2017%20Oct%202026.%20Next%20step%3A%20Call%20customer.%20Please%20help%20move%20it%3A%20https%3A%2F%2Fexample.test%2Fdesk%23%2Faction%2FACT-DEMO-001`

## Open
- The action link route form is for the Full-Stack Engineer; the page must open the right thread from it.
- Wording is for SP Sir's approval with the wireframes. Hindi or other language versions are not drawn (recommendation: English only for v1.0).
