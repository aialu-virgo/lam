---
title: Canonical data model
summary: Entities, keys, fields and the source-reference columns every SAP row lands in; B1 and S/4 map to one model, derived from five real exports.
status: approved (interim, Vijay, D13)
updated: 2026-10-20
related:
  - data-map/customer.md
  - data-map/item.md
  - data-map/sales-employee.md
  - data-map/warehouse.md
  - data-map/sales-order.md
  - data-map/delivery.md
  - data-map/invoice.md
  - data-map/invoice-s4-register.md
  - data-map/credit-note.md
  - data-map/receivable.md
  - data-map/collection.md
  - data-map/stock.md
  - data-map/market-potential.md
  - data-map/user-master.md
  - data-map/plant-master.md
  - data-map/target-phasing.md
  - design/_index.md
  - data-map/_index.md
  - design/comparison-basis.md
  - design/role-matrix.md
  - design/target-model.md
  - design/plan-model.md
  - design/architecture.md
  - design/check-rules.md
---

# Canonical data model
**Owner:** Data Architect · **Milestone:** M1 · **Approval:** approved (interim, Vijay, 20 Oct 18:08, D13) 
**Input:** [Brief Part B — design inputs](brief-part-b.md) §3, §4, §7

**Done when:** every entity, key, field and the source reference columns are defined; per-export B1↔S4 maps live in [data-map/](../data-map/_index.md). Draft: built from the five real exports of 20 Oct 2026; entities with no export yet carry the brief's fields only (**Assumed**).

## Rules for every transaction row
1. **Source reference (mandatory, never edited):** `source_system` (B1 | S4), `source_doc_type`, `source_doc_no`, `source_line`, `loaded_at` (IST timestamp), `upload_id`. Row key = (`source_system`, `source_doc_type`, `source_doc_no`, `source_line`). Doc numbers differ between B1 and S/4, so `source_system` is part of the key.
2. **Period:** every row carries `doc_date`, `fy_quarter` and `period_status`. FY runs April–March; `FY27` = Apr 2026–Mar 2027; Q1 = Apr–Jun. `fy_quarter` is text like `FY27-Q2`; `month_in_quarter` is 1–3 (needed for the "Oct vs Jul" comparison in [Comparison basis](comparison-basis.md)). Rule: FY = calendar year + 1 when month ≥ 4.
3. **period_status** = `open` or `closed`, copied from the `period` table at load. A closed quarter is locked; re-loading it needs Super admin and is logged. A quarter loaded only in part stays `open` and shows **partial** in the coverage grid (it cannot be closed).
4. **Money and quantity:** ₹ as number with 2 decimals, always **net of GST** unless the field name says `gross`. Quantity in sheets (`qty_sheets`) and sq ft (`qty_sqft` = sheets × sheet area from the item). No negative quantity except on credit-note lines.
5. **Dates** are stored as ISO dates. The intake repairs day/month-swapped date cells and shows the resulting range for confirmation ([Data map — Invoice](../data-map/invoice.md)).
6. **No raw SAP text is trusted as an instruction.** Free-text fields (`PO Number`, remarks) are not loaded.

## Master entities
| Entity | Key | Fields | Sources and gaps |
|---|---|---|---|
| `plant` | `plant_code` (4 digits) | `plant_name`, `plant_type` (factory, HO, depot), `zone`, `state`, `b1_bpl_name`, `active`, `business` (laminates, ACP) | [Plant master](../data-map/plant-master.md). Laminates: 1001–1006, 1011, 1012–1049. B1 branch (`BPLName`) joins by name; S/4 `Plant` is the code. |
| `warehouse` | `warehouse_code` | `plant_code`, `name`, `active` | [Warehouse](../data-map/warehouse.md). Not exported; defaults to one warehouse per plant (Assumed). |
| `item` | `item_code` (B1 `FG#####`) | `description`, `item_category`, `product_group`, `brand`, `thickness_mm`, `size_ft`, `sqft_per_sheet`, `finish`, `design_no`, `base_uom`, `active`, `is_laminate` | [Item](../data-map/item.md). |
| `item_xref` | (`source_system`, `source_item_code`) | `item_code` | S/4 `Product Code` → B1 code. No S/4 code in the item master yet (join by description, Assumed). |
| `customer` | `customer_code` (B1 `CardCode`, `VRGLCU` + 6 digits) | `name`, `gstin`, `city`, `state`, `zone`, `customer_group`, `segment`, `sales_employee_code`, `class_abc` (derived) | [Customer](../data-map/customer.md). Today only inside invoice lines; no OCRD export. |
| `customer_xref` | (`source_system`, `source_customer_code`) | `customer_code`, `gstin` | S/4 `Sold-to-Party Number` ↔ B1 by `gstin` (Assumed). |
| `sales_employee` | `sales_employee_code` (B1 `SlpCode`) | `name`, `employee_code` (HR code `E-…`), `designation`, `zone`, `plant_code`, `active` | [Sales employee](../data-map/sales-employee.md). B1 sales lines carry only a name; S/4 has none. |
| `user` | `email` | `name`, `role`, `department`, `plant_codes[]`, `reports_to_email`, `whatsapp_number`, `today_cap`, `active`, `sales_employee_code` | [User master](../data-map/user-master.md). Roles per [Role matrix](role-matrix.md). |
| `period` | `fy_quarter` | `start_date`, `end_date`, `period_status`, `working_days`, `closed_by`, `closed_at` | System-maintained; Super admin closes. |

## Transaction entities
Each has the source-reference columns above plus `plant_code`, `doc_date`, `fy_quarter`, `month_in_quarter`, `period_status`.

### `invoice_line` (built, [Invoice](../data-map/invoice.md), [S/4 register](../data-map/invoice-s4-register.md))
| Field | Meaning | B1 | S/4 |
|---|---|---|---|
| `customer_code`, `customer_gstin`, `customer_name` | buyer | `CardCode`, `BILL GSTIN`, `CardName` | `Sold-to-Party Number`, `…GSTIN`, `…Description` |
| `item_code` | via `item_xref` | `ItemCode` | `Product Code` |
| `sales_employee_code`, `salesperson_name_raw` | seller | name only | blank |
| `qty_sheets`, `qty_sqft` | quantity | `Quantity`, × `Size` | `Invoice Qty`, × `Material Group 4` |
| `net_value_inr` | line value net of GST | `LineTotal` | `Total Amount (Item)` |
| `cgst_inr`, `sgst_inr`, `igst_inr`, `gross_value_inr` | tax and gross | `CGST_Amt`…, `Total Value` | `CGST Amount`…, computed |
| `return_qty_sheets` | information only | `ReturnQty` | none |
| `is_laminate`, `product_group` | derived from item category | `Catagory` | `Product Type` |
| `is_internal_transfer` | stock transfer to own branch | `AcctName`, `Zone` | not derivable |
| `zone`, `place_of_supply`, `invoice_type`, `official_invoice_no`, `order_date` | attributes | `Zone`, `Place of Supply`, `Invoice Type`, none, none | `Sales District`, none, `Billing Type`, `ODN`, `Order Creation Date` |

**Sales (the Desk's "actual")** = `invoice_line` where `is_laminate` and not `is_internal_transfer`, less credit-note lines when that feed exists. Everything in the Desk (target, share of potential, QoQ) is computed from this one definition.

### Other transaction entities (no export yet)
Fields listed are the minimum the Desk needs; B1/S4 columns in each data-map file.
| Entity | Key fields | Used for |
|---|---|---|
| `credit_note_line` | source ref, `base_invoice_no`, `base_invoice_line`, `qty_sheets` (positive; sign applied by type), `net_value_inr`, `reason` | net sales, returns |
| `sales_order_line` | source ref, `customer_code`, `item_code`, `qty_sheets`, `open_qty_sheets`, `net_value_inr`, `line_status`, `due_date`, `sales_employee_code` | open orders, O2D |
| `delivery_line` | source ref, `base_order_no`, `base_order_line`, `item_code`, `qty_sheets`, `dispatch_date` | dispatch TAT |
| `receivable_item` | source ref (open invoice), `customer_code`, `due_date`, `doc_total_inr`, `paid_inr`, `open_inr`, `as_on_date` | ageing 0–30 / 31–60 / 61–90 / 90+ |
| `collection` | source ref (receipt), `customer_code`, `amount_inr`, `applied_invoice_no` | collections vs plan |
| `stock_balance` | `plant_code`, `warehouse_code`, `item_code`, `on_hand_sheets`, `as_on_date`, `batch_in_date` | stock days, ageing |

## Plan entities
Owned by the Desk, entered by people, never from SAP. Fields in [Market potential](../data-map/market-potential.md), [Target phasing](../data-map/target-phasing.md); revision and approval flow in [Target model](target-model.md) and [Plan model](plan-model.md).
| Entity | Key | Notes |
|---|---|---|
| `market_potential` | `fy_quarter`, `plant_code` or `territory`, `product_group`, `customer_segment` | ₹, sheets, sq ft; `source_type`, `owner_email`; every change is a revision |
| `target_share` | same key or a coarser level | `share_pct`; revision |
| `target_phasing` | key + `month_in_quarter` | `phasing_pct`, 3 rows sum 100; default equal |
| `revision` | `revision_id` | old → new, reason, discussion date, participants, status (Draft, Discussed, Approved, Locked) |

## System entities
`upload` (`upload_id`, file name, `source_system`, entity, period range, row counts: read / loaded / rejected / warned, uploader, `loaded_at`, confirmed column mapping), `upload_reject` (row, rule, message), `coverage` (entity × `fy_quarter` → loaded | partial | missing, computed from `upload` and row counts). Actions, threads, follow-ups: [Architecture](architecture.md).

## Open points
- Customer, item and employee cross-system keys are Assumed (GSTIN, description, name). Replace with exact codes when Vijay provides the S/4 material and customer masters.
- `product_group` and `customer_segment` values are not yet defined (Q5, Q-D8 in [Data map — Market potential](../data-map/market-potential.md)).
- Credit-note and S/4 salesperson sources decide whether net sales and salesperson targets can be exact.
