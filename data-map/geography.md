---
title: Data map — Geography master
summary: States, optional districts, PIN to district and district to responsible branch/plant for the state-first target model (D77), with a draft branch map derived from sales history, the recommended public source, upload templates and today's state/PIN coverage.
status: draft
updated: 2026-11-08
related:
  - data-map/_index.md
  - data-map/market-potential.md
  - data-map/target-phasing.md
  - data-map/customer.md
  - data-map/plant-master.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/s4-odata-feed.md
  - data-map/templates/geography-state.csv
  - data-map/templates/geography-district.csv
  - data-map/templates/geography-pin.csv
  - design/canonical-data-model.md
  - design/target-model.md
  - design/plan-model.md
  - design/role-matrix.md
  - open-questions.md
---

# Geography master (master file, Admin)
**Owner:** Data Architect · **Decision:** D77 (8 Nov 2026) · **Input:** Vijay, 8 Nov: **State is the only required level; districts are optional and later.** No district → branch list exists at Virgo. · **Status:** nothing loaded.

**Short version.** Potential and targets are set per **state** × product group. A **district** layer (and a PIN → district lookup, and a district → one responsible plant) can be added later; until it exists nothing warns or blocks. States are needed now: they carry the alias table (B1 writes state names, S/4 writes GST codes) and an optional default plant. Rules for sums and actuals: [Target model](../design/target-model.md#geography-basis-d77). Nothing here is Virgo data except the plant mapping the Desk derives or a person enters, and that lives in the Desk database, not in this repo.

## Three tables
| Table | Key | Needed when | Template (header only) |
|---|---|---|---|
| **State** | `state_code` (GST code, 2 digits; `00` = "State not known") | **Now** | [geography-state.csv](templates/geography-state.csv) |
| **District** | `district_id` (LGD district code, text) | When a district split is used | [geography-district.csv](templates/geography-district.csv) |
| **PIN → district** | `pin` (6 digits) | When districts are used and customers carry a PIN | [geography-pin.csv](templates/geography-pin.csv) |

### Columns
**State** `state_code, state_name, aliases, default_plant_code, active`
| Column | Rule |
|---|---|
| `state_code` | GST state code, 2 digits, unique. Standard codes (**Assumed**, as in [S/4 register](invoice-s4-register.md)). |
| `state_name` | Official name. |
| `aliases` | `|`-separated spellings seen in B1 (`State`, 26 distinct values in the Sep 2026 file); matched after trimming and lower-casing. Unknown B1 spelling → warn, row goes to "State not known". |
| `default_plant_code` | Optional. In [Plant master](plant-master.md). Owner of the state's figures when no district decides: Branch manager of that plant may edit the state's potential and targets (Assumed (new), [Target model](../design/target-model.md#geography-basis-d77)). Can be filled by the derived draft below. |
| `active` | Y/N. |

**District** `district_id, state_code, district_name, responsible_plant_code, map_source, active`
| Column | Rule |
|---|---|
| `district_id` | LGD district code from the public list; stable when a name changes. |
| `state_code` | Must exist in State. |
| `district_name` | As in the public list; editable. |
| `responsible_plant_code` | **Exactly one** plant (never blank for a district that has potential, never two). Laminates plants only. |
| `map_source` | `derived` (from the draft below) or `entered` (a person set it). A re-run of the draft replaces only `derived` rows. |
| `active` | Y/N. |

**PIN → district** `pin, state_code, district_id, source, multi_district`
| Column | Rule |
|---|---|
| `pin` | 6 digits, first digit 1–9, unique (one district per PIN). |
| `state_code`, `district_id` | Must exist; the PIN's state is what a customer's state is checked against. |
| `source` | `public list` or `entered`. |
| `multi_district` | Y when the public list gives the PIN more than one district; the loader keeps the district with the most post offices and flags the rest for review. |

## Source
- **Recommended public source (not downloaded; named only).**
  - **States and districts:** the **Local Government Directory (LGD)**, Ministry of Panchayati Raj (lgdirectory.gov.in), which publishes state and district lists with stable numeric codes as downloadable spreadsheets.
  - **PIN → district (and post-office / locality names for city matching):** the **All India Pincode Directory** published by India Post on the Open Government Data Platform (data.gov.in), under the Government Open Data Licence, India (GODL). Rows are post offices (many per PIN); district and state are columns.
  - **Verified or assumed:** both names and the licence are from memory (**Assumed**, not checked this session, nothing fetched). Before use, someone confirms the current download page, file date and licence terms, and the real row and PIN counts. Known quirks to expect: postal districts can differ from revenue districts, spellings differ between the two lists, and a PIN can cross districts. District names from the two lists are reconciled to the LGD name through an alias column during load.
- **Offline, nothing of Virgo's goes anywhere:** a person downloads the public files once on a Virgo machine and loads them through the templates. No Virgo data is sent to either site. The public lists are not Virgo data, but they are loaded into the Desk database, not committed here (size, and one home).
- **Customer side:** state, PIN, city and district text per customer come from the SAP connector ([Customer](customer.md), [feed 1.4](s4-odata-feed.md)); B1 `ZipCode` from OCRD as fallback.

## Derived draft: branch map from sales history
Vijay has no district → branch list, so the Desk drafts one for him to correct. Built in the Desk, from data already loaded; **no file, no AI call, nothing written to SAP, no Virgo rows in this repo.**

**Run.** Admin › Geography › **Derive branch map** (Super admin only). Needs the State and District public list loaded first. Stores its result as the `derived` rows of the District table (and `default_plant_code` on States) in the Desk database. Shows a review table; Vijay changes any plant, which turns the row to `entered`. A re-run replaces only `derived` rows and keeps `entered` ones.

**Inputs (all already loaded; fields named):**
| Input | Field | Source |
|---|---|---|
| Net sales by customer and invoicing plant | invoice aggregates: `customer_code`, `plant_code`, month, net ₹, sheets, internal-transfer flag | [Invoice](invoice.md), [S/4 register](invoice-s4-register.md), feed |
| Credit notes | lines with `customer_code`, plant-month ([Credit note](credit-note.md)) | where covered |
| State | customer master `state_code`, else invoice `State` (B1 name via aliases; S/4 GST code) | [Customer](customer.md) |
| City | B1 invoice `CITY` (748 spellings), customer master `CityName` | free text |
| S/4 `Sales District` (ZONE01…) | register column 14 | **cross-check of state only: it is a zone, not a district** ([S/4 register](invoice-s4-register.md)) |
| PIN | customer master `PostalCode` / `ZipCode`, once loaded | not in any invoice file today |
| District list, PIN directory | the public lists above | Geography master |

**Step 1: customer → district** (first rule that gives one answer wins; the method is stored per customer):
1. **PIN:** customer PIN found in the PIN table and its state equals the customer's state.
2. **District text:** S/4 address `District`, normalised, equal to a district name (or alias) of that state.
3. **City:** the customer's city, normalised, equal to a district name or alias of that state, or equal to exactly one post-office / locality name in that state's PIN-directory rows.
4. Otherwise **unresolved**: left out of district votes, still counted for the state.

Normalising a city or district text = trim, lower-case, drop punctuation and the words "district", "dist", "city", "urban", "rural", apply the alias list (for example the old and new spelling of a city). Exact match only; no fuzzy match, so a wrong district is never created by guesswork. Near misses are listed for a person as suggestions.

**Step 2: district → plant** (per district, over the **last 4 closed quarters** of loaded sales; as of 8 Nov 2026 that is Q3 FY26 to Q2 FY27, if all four are loaded: **not verified** against the live Desk, the milestones list the restore as open):
- Net sales of the resolved customers of the district, by **invoicing plant**: invoiced less credit notes where credit-note coverage of that plant-quarter is complete (D40), else invoiced; the basis is stored on the row. Internal transfers and ACP plants (1050+) excluded.
- **Winner = the plant with the highest net ₹.**
- **Tie rule** (exactly equal net ₹): the plant with more net sheets; still equal: the plant with more net ₹ in the latest quarter of the window; still equal: the lower plant code. A tie is flagged "tie" for review.
- **Evidence flags:** "low evidence" when the district has fewer than `geo_min_customers` (default 3) or less than `geo_min_net_inr` (default ₹5 lakh) in the window; "split" when the winner has less than 50% of the district's net sales. Both are **Assumed (new)**, editable in Admin. Flagged rows are still proposed.
- A district with no resolved sales gets no plant (blank), shown "no history".
- **State default plant** = the same vote at state level, over all customers of the state, including unresolved ones.

**Output per district:** plant, share of the district's net sales won, customers resolved, net ₹, method mix (PIN / district text / city), flags. **Expected today:** the Sep 2026 B1 file carries city but no PIN, and S/4 rows carry a 3-character city key; so until the customer master brings PIN, District text and city names, only the city route works and many customers will stay unresolved. The review table states the resolved share so nobody mistakes a thin draft for a full map.

**Why not simply the invoicing plant?** Because D77 makes the responsible plant a property of the district: the plant that bills most of a district's customers is the best first guess and is cheap to correct. It is a draft, not a decision; it needs Vijay's correction and, for targets, the normal approvals.

## B1 ↔ S/4HANA mapping
| Canonical | B1 | S/4 |
|---|---|---|
| `state_code` | invoice `State` (name) or customer `State`, through `aliases` | register `State` (GST code); connector address `Region` (candidate, feed 1.4) |
| `pin` | OCRD / CRD1 `ZipCode` (fallback upload) | connector address `PostalCode` (candidate — verify against $metadata) |
| `district_text` | none | connector address `District` (candidate — verify against $metadata) |
| `responsible_plant_code` | none; derived or entered | none; derived or entered |

## Validation
- State: unique 2-digit code; `default_plant_code` exists and is a laminates plant.
- District: unique `district_id`; known state; exactly one existing laminates plant; a district edit never changes a Locked quarter's stored attribution ([Target model](../design/target-model.md#how-actuals-reach-a-district)).
- PIN: 6 digits; unique; district belongs to the stated state. A customer PIN whose state differs from the customer's state is not used and is counted.
- Admin report (counts only): customers with no state, no PIN, PIN not in table, PIN state differs, unresolved by every route.

## Coverage today (from existing data-map facts, 8 Nov 2026)
| Source | State | PIN | Where it comes from |
|---|---|---|---|
| **B1** (Sep 2026 sales file, 139,598 rows, 3,696 customer codes) | Present on **99.99% of rows** (null 0.01% ≈ 14 rows), 26 distinct spellings. **Customers with a state: not known**; no per-customer count was recorded. | **None.** No PIN column in the sales export; customer master with `ZipCode` is requested but no real customer file is recorded as loaded; the Desk's customer intake has no PIN field. **0 known.** | [Invoice](invoice.md) column 37 and header; [Customer](customer.md); `69-cust.js` |
| **S/4** (register 4–19 Oct 2026, plant 1013 only, 92 customers) | Present on **100%** of rows (null 0), **4 distinct** GST state codes; 92 customers all with a state. | **None** for customers. Register `Postal Code` is the plant's (1 distinct value); `City` is a 3-character key with no name. **0 known.** | [S/4 register](invoice-s4-register.md) columns 15, 16, 56 |
| **S/4 live feed** | Not read yet (reads name, group and sales district only) | Not read yet | [S/4 feed](s4-odata-feed.md); extended by section 1.4 |
- **Consequence:** state-level potential, targets and actuals work from B1 and S/4 invoice data now; every district-level actual would sit in "<State> – unassigned" until the customer master with PIN is loaded. The S/4 sample is one plant and four states, so it says little about the whole tenant.
- Not verified: B1 state spellings may include duplicates or typos among the 26 values; the invoice `State` is assumed to be the customer's bill-to state.

## Coverage (12 quarters)
Master, not a time series. Nothing loaded. History attribution is by customer at read time, so no sales history needs reloading when the master is loaded.

## Open items
Questions only Vijay can answer: Q34 to Q36 in [Open questions](../open-questions.md).
