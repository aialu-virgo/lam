---
title: Target model
summary: Target = market potential x share % per state and district (D77, was plant) and product group, phased to months, with the state/district sum rule, revision workflow, approvers, Stretch flag and hand-calculable examples for QA checks 11 and 12.
status: approved (interim, Vijay, D13); geography basis D77 proposed, awaiting mock-up and approval
updated: 2026-11-08
related:
  - data-map/geography.md
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
- **Leaf target** = `round(potential × share_pct ÷ 100, 2)` for one key: quarter × **state × district (or `_state`)** × product group × customer segment ([Geography basis](#geography-basis-d77); D77 replaced plant with geography). Product groups: Laminate, Door, PVC sheet, Compact board ([Decisions](../decisions.md) D6). Segments: configurable master (Q5; `All` when not split).
- **Higher levels are sums of leaf targets**, never potential × one share. State, responsible plant, product group, segment and total all sum the leaves; the blended share at a level = target ÷ potential and is display only. This is what makes the totals add up (QA check 11).
- **Plant is no longer a key.** A plant's target is the roll-up of the districts whose responsible plant it is ([Geography](../data-map/geography.md)); the old territory leaf is replaced by the state record.
- **Share % can be set at a coarser level** (per plant, product group or segment); a more specific setting wins. Missing share → leaf has no target and rule R6 ([Check rules](check-rules.md)) raises "missing plan".
- **Default share (Assumed (Q4)):** `last quarter's actual ÷ last quarter's potential` for the same leaf, **plus 2 points** (`default_share_uplift_pts`, editable), created as a **Draft** revision. No prior potential → no default; a person enters it.
- **Actual** for a leaf is the aggregate sum of Sales (laminate product groups, internal transfers excluded) for that plant, product group and the customers in that segment ([Canonical data model](canonical-data-model.md)). Segment is a customer attribute joined at read time. Salesperson targets: see [Plan model](plan-model.md).

## Geography basis (D77)
Home of the geography rules; the master is [Geography](../data-map/geography.md). Added 8 Nov 2026 under D77 (Vijay): State is the macro level, District the micro level.

**Keys.** A potential or target record is keyed by (`fy_quarter`, `state_code`, `district_id` or the literal `_state`, `product_group`, `customer_segment`). The caller's tuple (state, district | `_state`, product group, quarter) keeps today's segment as the fifth part (`All` when not split) because D77 keeps the same measures and levels. Record `_id` = `slug(geo_<quarter>_<state>_<district|_state>_<group>_<segment>)`; phasing `_id` = the same without segment. The `geo_` prefix cannot collide with legacy plant-keyed ids.
- `_state` record = the **state total** (macro): potential ₹, sheets, sq ft, share %. District record = that district's slice (micro). Nothing else is stored; **unallocated is derived, never stored**.

**Sum rule** (per quarter × state × product group × segment, checked separately for ₹, sheets and sq ft):
`unallocated = state total − Σ district values`.
- Σ districts ≤ state total: allowed. The tab shows the remainder as **"Unallocated to districts"** on the state row, in the pending (orange) style, until it is zero.
- Σ districts > state total: **Draft can be saved, Submit is refused** ("districts exceed the state by x"). Nobody's number is silently changed.
- No `_state` record, districts only: state total is **derived** = Σ districts, unallocated 0, labelled "derived".
- `_state` record, no districts: the whole total is unallocated.
- Tolerance ±0.01, as the P2 rule. If a state uses segments on one side and `All` on the other, the check runs on the total across segments.

**Targets and the unallocated slice.** District leaf target = district potential × district share. The unallocated slice is a virtual leaf: target = `unallocated potential × share_pct` of the `_state` record; blank share means no target on that slice (shown "no target on unallocated"). **State target = Σ district leaf targets + unallocated leaf target.** Actuals of customers whose district cannot be resolved ("<State> – unassigned") are compared with the unallocated slice, so the state row always compares like with like.
- The unallocated target is derived from currently Approved values (approved state total − Σ approved district totals, × approved state share). When a district is approved with more potential, the unallocated slice shrinks automatically; each change was approved on its own record.
- **Default share (Q4)** is computed per leaf as before from last quarter's actual and potential for the same key. For a district with no prior potential there is no default. For the `_state` record the default uses the state's last quarter actual ÷ potential and applies to the unallocated slice only.

**Phasing.** Key becomes (quarter, state, district | `_state`, product group). A district row overrides the `_state` row, which overrides "all"; the unallocated slice uses the `_state` row. Months 1 and 2 round, month 3 takes the remainder, as before.

**Revisions and approval.** Unchanged (D70, D71): every record has its own revision trail; Draft → Discussed → Approved → Locked; approver is never the proposer; HOD view only; locked quarters read-only. Stored `status` is per record, so the state row's status is the roll-up of its records (as the product-group row is today).

**Who edits (changed by D77 only in scope).** A Branch manager edits potential, share, target and phasing for the **districts whose responsible plant is in their `plant_codes`**, and cannot edit the `_state` record or another plant's districts. Management / HO and Super admin edit all, including `_state` and the geography master. A district with no responsible plant is editable by Management / HO and Super admin only. See [Role matrix](role-matrix.md).

### How actuals reach a district
1. Take the invoice aggregate's `customer_code` (the aggregates hold customer; [Plan model](plan-model.md) D9 effects). Internal transfers stay excluded.
2. **State** = the customer master's `state_code` (B1 state name via the alias table, or S/4 GST code). If the customer is not in the master or has no state, use the invoice row's State (`customer_state`). If neither, the row goes to the **"State not known"** bucket (`state_code` 00). Place of Supply is not used (it is a tax field).
3. **District** = PIN master lookup of the customer master's PIN, accepted only if the PIN's state equals step 2's state. Otherwise the customer is **"<State> – unassigned"**. Reasons are counted in Admin: no PIN, PIN not in master, PIN state differs, PIN has no district.
4. **Responsible plant** = the district's `responsible_plant_code`. The state's unassigned actuals and unallocated potential go to the state's `default_plant_code` if set, else show under "No responsible branch".
5. Attribution is by **customer**, not invoice, using the master at read time. **Rule: a locked quarter's attributed actuals must not move when the master is later edited.** Recommendation: snapshot the attributed actuals per (state, district, group, segment, month) when the quarter is locked (Assumed (new); build choice for the Full-Stack Engineer).
6. Credit notes (net basis, D40) attribute the same way through the customer on each credit-note line. The stored credit-note aggregate is plant-month × group, so the lines (which carry the customer) must be read; net at district level is possible but costs a read of the line chunks. Until then district achievement uses invoiced sales and says so.

**Two plant views, not one.** The existing Sales, Overview and Receivables pages keep **invoicing plant** (where the goods were billed from). Target achievement, share of potential and plant roll-ups in Plan use **responsible plant** (customer geography). They differ when a plant bills a customer in another plant's district; the page labels each view. Stretch and QoQ are computed on the series of the level shown, attributed the same way, so history re-attributes with the master.

## Phasing
- Quarter target is split into months 1, 2, 3 by `phasing_pct` ([Target phasing](../data-map/target-phasing.md)); default **equal thirds**. Months 1 and 2 are rounded to 2 decimals and **month 3 takes the remainder**, so months always sum to the quarter.
- To-date plan inside the open month is pro-rated by working days ([Comparison basis](comparison-basis.md)): `month target × N ÷ WD(month)`.
- Phasing applies at leaf level; a more specific phasing row overrides a broader one. Changing it is a revision.

## Revisions
Every change to a potential figure, share %, or phasing creates a **revision**: old → new, reason (mandatory), discussion date (mandatory from Discussed), participants (mandatory from Discussed), changed by, timestamps, status.

| State | Meaning | Who can move it here | Counts for achievement? |
|---|---|---|---|
| **Draft** | Proposed or default; being worked on | Proposer: Branch manager (own districts), Management / HO, Super admin. HOD is view only ([who edits](#who-edits-potential-and-targets)) | Shown as "Draft target" only if no approved one exists |
| **Discussed** | Discussion held and recorded | The proposer, once reason, discussion date and participants are filled | No |
| **Approved** | Accepted as the working target | **SP Sir or a Management / HO user. Never the proposer of that revision** | **Yes: the current approved target** |
| **Locked** | Quarter frozen | Management / HO or Super admin, "Lock quarter" for all Approved revisions of the quarter | Yes, no edits |

- **Original target** = the first Approved revision for the key. **Current target** = the latest Approved or Locked. Tables show achievement against the current; "Original" is one tap away on every target cell. Achievement is never shown against a Draft or Discussed revision except the labelled Draft case above.
- A **locked quarter cannot be edited** by anyone, including Super admin (QA check 11). No unlock is provided in v1.0 (**Assumed (new)**: see report; a correction needs SP Sir's instruction). Locking a quarter also sets `plan_locked` in `periods`.
- A new revision on an Approved key goes back to Draft; the current target stays the last approved until the new one is approved.
- Potential edits carry the same flow. A change to potential re-computes the Draft target; it does not alter an Approved target (the Approved revision stores the potential and share it used).
- Approval of mass changes: a batch (file upload) is one revision set, approved key by key or as a batch with one click that writes one revision per key.

## Who edits potential and targets
Home of this fact (D70, D71). Potential, share % and monthly phasing are filled in the **Plan > Targets & Potential** tab ([Wireframes](wireframes.md)); the non-admin Plans screen is replaced and Admin's Market potential links to the tab.
- **Propose, edit or upload:** Branch manager (own districts only: those whose responsible plant is one of theirs, D77), Management / HO, Super admin. **HOD: view only.** **HOD does not approve P1** (target values). Others: no access.
- **Approve target values:** SP Sir (or a Management / HO user who is not the proposer), as in the table above.
- **Locked quarters are read-only** for everyone.
- **UI label "Proposed" = stored status `Discussed`.** Submit needs reason, discussion date and participants.
- **Server vs page:** monthly `phasing` is writable by any active user on the Apps Script server, the same as `potential`; the page enforces who may edit ([Decisions](../decisions.md) D71). The server is not the access control for these two collections.

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

## Worked example for QA check 12 (invented numbers, ₹ lakh, one leaf, product group Laminate; written on the plant basis, read "Plant A" as one district leaf: the arithmetic is unchanged by D77)
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
- Revision walk-through for QA check 11: proposer Branch manager A (of the leaf's responsible plant) moves case A to case B (Draft, reason "dealer survey up"); moving to Discussed without participants is refused; approving as the same proposer is refused; SP Sir approves → current = 620.00, original stays 550.00 if 550 was Approved first; Lock → edit refused.

## Worked example for QA check 11, geography basis (D77; invented numbers, ₹ lakh, DEMO state S, Laminate, segment All, one quarter)
| Record | Potential | Share % | Leaf target |
|---|---|---|---|
| `_state` S (state total) | 1,200 | 30 | applies to unallocated only |
| District D1 | 500 | 50 | 250.00 |
| District D2 | 300 | 40 | 120.00 |
| **Unallocated** (1,200 − 500 − 300) | 400 | 30 (state share) | 120.00 |
| **State S target** | 1,200 | blended 40.83 | **490.00** |

- Actuals: D1 customers 230, D2 customers 100, customers of S with no resolvable district 90 ("S – unassigned") → state actual **420**; achievement 420 ÷ 490 = **85.71%** (red under Q13). Unassigned 90 against the unallocated target 120 = 75.00%.
- Roll-up by plant: D1 → Plant A, D2 → Plant B, S default plant → Plant A: Plant A target 250 + 120 = 370, Plant B 120; sum 490.
- Edits: D1 to 800 → Σ districts 1,100, unallocated 100, unallocated target 30.00, state target 400 + 120 + 30 = 550. D1 to 1,000 → Σ 1,300 > 1,200: Submit refused, Draft saved. State total changed to 1,100 with D1 500, D2 300 → unallocated 300, target 90, state target 460.
- Branch manager of Plant B edits D2, cannot edit D1 or `_state` S; Management edits all.
- A locked quarter: master edit moving D2's customers to D1 does not change the locked snapshot.

## D9 effects
Targets are plan entities, outside D9. Actuals at leaf level need customer × product group × month (for district and segment through the customer master): all present in the aggregates, so no history reload is needed for D77. The read must cross every invoicing plant's chunks for a state's customers (a build cost, not a data gap). Item- or line-level targets **cannot** be tracked and are not offered. Documents spanning two product groups sit in one aggregate row per group, so group actuals are exact; the document index shows document totals only.

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
