---
title: Target model
summary: Target = market potential x share %, phased to months, with the revision workflow, approvers, original vs current target, and the Stretch flag, with a hand-calculable example for QA check 12.
status: approved (interim, Vijay, D13)
updated: 2026-10-21
related:
  - design/_index.md
  - data-map/target-phasing.md
  - data-map/market-potential.md
  - design/canonical-data-model.md
  - design/comparison-basis.md
  - design/plan-model.md
  - design/role-matrix.md
  - design/kra-kpi.md
  - design/check-rules.md
  - open-questions.md
---

# Target model
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §4 Market potential → target

**Done when:** formula, levels, phasing, revision states (Draft → Discussed → Approved → Locked) and Stretch flag are specified with a worked example.

## Formula and levels
- **Leaf target** = `round(potential × share_pct ÷ 100, 2)` for one key: quarter × plant (or territory) × product group × customer segment. Product groups: Laminate, Door, PVC sheet, Compact board ([Decisions](../decisions.md) D6). Segments: configurable master (Q5).
- **Higher levels are sums of leaf targets**, never potential × one share. Plant, territory, product group, segment and total all sum the leaves; the blended share at a level = target ÷ potential and is display only. This is what makes the totals add up (QA check 11).
- **Territory** rows (potential not tied to a plant) are leaves of their own; a plant-to-territory map in Admin rolls actuals up to them.
- **Share % can be set at a coarser level** (per plant, product group or segment); a more specific setting wins. Missing share → leaf has no target and rule R6 ([Check rules](check-rules.md)) raises "missing plan".
- **Default share (Assumed (Q4)):** `last quarter's actual ÷ last quarter's potential` for the same leaf, **plus 2 points** (`default_share_uplift_pts`, editable), created as a **Draft** revision. No prior potential → no default; a person enters it.
- **Actual** for a leaf is the aggregate sum of Sales (laminate product groups, internal transfers excluded) for that plant, product group and the customers in that segment ([Canonical data model](canonical-data-model.md)). Segment is a customer attribute joined at read time. Salesperson targets: see [Plan model](plan-model.md).

## Phasing
- Quarter target is split into months 1, 2, 3 by `phasing_pct` ([Target phasing](../data-map/target-phasing.md)); default **equal thirds**. Months 1 and 2 are rounded to 2 decimals and **month 3 takes the remainder**, so months always sum to the quarter.
- To-date plan inside the open month is pro-rated by working days ([Comparison basis](comparison-basis.md)): `month target × N ÷ WD(month)`.
- Phasing applies at leaf level; a more specific phasing row overrides a broader one. Changing it is a revision.

## Revisions
Every change to a potential figure, share %, or phasing creates a **revision**: old → new, reason (mandatory), discussion date (mandatory from Discussed), participants (mandatory from Discussed), changed by, timestamps, status.

| State | Meaning | Who can move it here | Counts for achievement? |
|---|---|---|---|
| **Draft** | Proposed or default; being worked on | Proposer: Branch manager (own plants), HOD (own department), Management / HO, Super admin | Shown as "Draft target" only if no approved one exists |
| **Discussed** | Discussion held and recorded | The proposer, once reason, discussion date and participants are filled | No |
| **Approved** | Accepted as the working target | **SP Sir or a Management / HO user. Never the proposer of that revision** | **Yes: the current approved target** |
| **Locked** | Quarter frozen | Management / HO or Super admin, "Lock quarter" for all Approved revisions of the quarter | Yes, no edits |

- **Original target** = the first Approved revision for the key. **Current target** = the latest Approved or Locked. Tables show achievement against the current; "Original" is one tap away on every target cell. Achievement is never shown against a Draft or Discussed revision except the labelled Draft case above.
- A **locked quarter cannot be edited** by anyone, including Super admin (QA check 11). No unlock is provided in v1.0 (**Assumed (new)**: see report; a correction needs SP Sir's instruction). Locking a quarter also sets `plan_locked` in `periods`.
- A new revision on an Approved key goes back to Draft; the current target stays the last approved until the new one is approved.
- Potential edits carry the same flow. A change to potential re-computes the Draft target; it does not alter an Approved target (the Approved revision stores the potential and share it used).
- Approval of mass changes: a batch (file upload) is one revision set, approved key by key or as a batch with one click that writes one revision per key.

## History as a sense-check
Beside every target the page shows: last closed quarter's actual (`A_prev`), the quarter trend since history start (up to 12 quarters; D28) and the **required QoQ** = `target ÷ A_prev − 1`. Text: "Target needs +x% QoQ; average of the quarters loaded is +y%".

## Stretch flag
Definitions (one series: the actuals of the level shown, closed quarters since `history_start` (D28; default Q1 FY26), at most 12; on 21 Oct 2026 that is 6 closed quarters, Q1 FY26 to Q2 FY27):
- `QoQ_i = (A_i − A_{i−1}) ÷ A_{i−1}`, n−1 steps for n quarters.
- **Average QoQ over the quarters available** = arithmetic mean of the QoQ steps (`avg`). **Assumed (new):** arithmetic, not compound; flagged here for SP Sir.
- **Stretch** when `required QoQ > 2 × avg` (`stretch_multiple` = 2, editable). If `avg ≤ 0` the threshold is `2 × max(avg, stretch_floor_pct)` with `stretch_floor_pct` default **0%**, meaning any target above last quarter is flagged. Open question O-T1.
- Needs at least `min_pairs` = 4 consecutive loaded QoQ steps (**Assumed (new)**); otherwise "n/a: history too short" and no flag.
- **4-quarter moving average** `MA4_q` = mean of A_q and the three before; first value at quarter 4 (n−3 values for n quarters; shown only once 4 quarters exist).
- **Trend line:** least-squares line through the quarters available, numbered from 1; drawn only once at least 4 quarters exist. **Direction** from `avg`: rising if > +1%, falling if < −1%, flat between (`trend_band_pct` = 1, **Assumed (new)**).
- Stretch is for discussion only. It never blocks approval.

## Worked example for QA check 12 (invented numbers, ₹ lakh, DEMO Plant A, product group Laminate)
Closed-quarter actuals:

| # | Quarter | Actual | QoQ % | MA4 |
|---|---|---|---|---|
| 1 | Q3 FY24 | 400 | — | — |
| 2 | Q4 FY24 | 420 | +5.00 | — |
| 3 | Q1 FY25 | 410 | −2.38 | — |
| 4 | Q2 FY25 | 430 | +4.88 | 415.00 |
| 5 | Q3 FY25 | 450 | +4.65 | 427.50 |
| 6 | Q4 FY25 | 445 | −1.11 | 433.75 |
| 7 | Q1 FY26 | 465 | +4.49 | 447.50 |
| 8 | Q2 FY26 | 480 | +3.23 | 460.00 |
| 9 | Q3 FY26 | 470 | −2.08 | 465.00 |
| 10 | Q4 FY26 | 500 | +6.38 | 478.75 |
| 11 | Q1 FY27 | 520 | +4.00 | 492.50 |
| 12 | Q2 FY27 | 540 | +3.85 | 507.50 |

- Sum of the 11 QoQ steps = 30.91 → **avg QoQ = 2.81%** (30.91 ÷ 11 = 2.8094). Direction: rising (> +1%). **2 × avg = 5.62%.**
- Trend line slope = **+11.82 per quarter**, intercept 384.02 (x = 1..12).
- Q3 FY27 potential: segment S1 700, S2 500 (total 1,200). Q2 FY27 potential: S1 650, S2 500 (1,150); Q2 actuals S1 330, S2 210 (540).

| Case | Shares | Leaf targets | Plant A Laminate target | Required QoQ vs 540 | Stretch? |
|---|---|---|---|---|---|
| **A, entered** | S1 50%, S2 40% | 350.00 + 200.00 | **550.00** | +1.85% | No |
| **B, entered** | S1 60%, S2 40% | 420.00 + 200.00 | **620.00** | +14.81% | **Yes** (> 5.62%) |
| **Edge** | total 570 | n/a | 570.00 | +5.56% | No (just under 5.62%) |
| **Edge** | total 572 | n/a | 572.00 | +5.93% | Yes |
| **Default (Q4)** | S1 330 ÷ 650 = 50.77% + 2 = 52.77%; S2 210 ÷ 500 = 42.00% + 2 = 44.00% | 369.38 + 220.00 | 589.38 | +9.14% | Yes |

- Case A phased 30 / 30 / 40: S1 105.00, 105.00, 140.00; S2 60.00, 60.00, 80.00 → **Oct 165.00, Nov 165.00, Dec 220.00** (sum 550.00). Equal phasing would give 183.33, 183.33, 183.34.
- Case A blended share = 550 ÷ 1,200 = **45.83%**; Q2 FY27 share of potential = 540 ÷ 1,150 = **46.96%**, so the Q3 target share is **1.12 points below** Q2's actual share.
- To-date plan on 20 Oct (15 of 25 working days): 165.00 × 15 ÷ 25 = **99.00**.
- Achievement example: Oct actual 150.00 ÷ 165.00 = **90.91%** (orange under Q13).
- Q3 FY26 (470) must not appear next to Q3 FY27 anywhere.
- Revision walk-through for QA check 11: proposer Branch manager A moves case A to case B (Draft, reason "dealer survey up"); moving to Discussed without participants is refused; approving as the same proposer is refused; SP Sir approves → current = 620.00, original stays 550.00 if 550 was Approved first; Lock → edit refused.

## D9 effects
Targets are plan entities, outside D9. Actuals at leaf level need plant × product group × customer (for the segment): all present in the aggregates. Item- or line-level targets **cannot** be tracked and are not offered. Documents spanning two product groups sit in one aggregate row per group, so group actuals are exact; the document index shows document totals only.

## Settings (Admin, all editable, each change logged)
| Key | Default | Label |
|---|---|---|
| `default_share_uplift_pts` | 2 | Assumed (Q4) |
| `stretch_multiple` | 2 | Brief §4 |
| `stretch_floor_pct` | 0 | Assumed (new) |
| `min_pairs` | 4 | Assumed (new) |
| `trend_band_pct` | 1 | Assumed (new) |
| `status_green_pct` / `status_orange_pct` | 100 / 90 | Assumed (Q13) |

## Open
- **O-T1 (SP Sir):** when the 12-quarter average QoQ is zero or negative, should any target above last quarter be Stretch? Recommendation: keep it (flag for discussion) until a floor of 2% is set.
- **O-T2 (SP Sir):** should the average QoQ be arithmetic (used here) or compound? Recommendation: arithmetic; simpler to check by hand.
- **O-T3 (SP Sir):** the default share (+2 points) tends to produce Stretch targets (case Default above). Recommendation: keep +2 as Draft only, discuss every one.
