---
title: S/4HANA switch notes
summary: What changes when S/4HANA replaces B1: source detection, same canonical model, the OData endpoints card, and what S/4 does not carry.
status: draft (go-live date and connector not decided)
updated: 2026-10-20
related:
  - handover/_index.md
  - handover/admin-guide.md
  - systems/sap-s4hana.md
  - systems/sap-b1.md
  - data-map/_index.md
  - data-map/invoice-s4-register.md
  - design/canonical-data-model.md
---

# S/4HANA switch notes
**Short version:** the switch is a source change, not a redesign. Same canonical model, same pages, same rules ([Canonical data model](../design/canonical-data-model.md)).

## What stays the same
- Every loaded row keeps its SAP reference: system (B1 or S4), document type, document number, line. Drill-down to the SAP document works for both.
- Periods can mix: B1 for old months, S/4 for new ones, in one coverage grid. A plant-month is replaced whole when reloaded.
- Read-only: no write-back to SAP ([Data handling](../.claude/rules/data-handling.md)).

## What changes
1. **Source detection.** Intake reads the file headers and labels the upload B1 or S/4; you confirm the column mapping once per file type. S/4 sales register today ([Data map](../data-map/invoice-s4-register.md)).
2. **S/4 repeats rows.** The register repeats each billing item up to 8 times (differing only in Price Group). Intake keeps one row per document and item. A raw sum would overstate value about 2.7x.
3. **Not in the S/4 register as exported:** salesperson, the internal-transfer flag, returns (credit memos not seen). Salesperson then comes from the customer master, so a Sales executive's figures can shift when that master changes. Internal transfers rely on the Admin "Internal transfer customers" list.
4. **Codes differ.** Document numbers differ between systems. Customers are matched by GSTIN and items by description until an S/4 item code is in the item master (both Assumed).
5. **Live feed card.** Data Intake shows "SAP S/4HANA live feed: not connected", with Connect disabled until the Principals approve it. Planned OData services:
| Entity | Endpoint |
|---|---|
| Customer | API_BUSINESS_PARTNER |
| Item | API_PRODUCT_SRV |
| Sales order | API_SALES_ORDER_SRV |
| Delivery | API_OUTBOUND_DELIVERY_SRV |
| Invoice / credit note | API_BILLING_DOCUMENT_SRV |
| Receivable / collection | I_OperationalAcctgDocItem |
| Stock | API_MATERIAL_STOCK_SRV |
The connector is not built in v1.0 ([Architecture](../design/architecture.md)). It needs an approved read-only integration user ([SAP S/4HANA](../systems/sap-s4hana.md)).

## Open before go-live
- Go-live date, SAP partner, periods already live in S/4: open ([Open questions](../open-questions.md)).
- Same-data check (acceptance check 4: a B1 and an S/4 file give identical numbers) cannot run on real data until one plant-period exists in both.
- Whether the register shows credit memos.
