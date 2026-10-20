---
title: Architecture
summary: How the page stores, computes and drills down: shared database limits, storage grain for 12 quarters of invoices, intake pipeline, demo mode.
status: draft
updated: 2026-10-20
related:
  - design/_index.md
  - design/canonical-data-model.md
  - build/desk/_index.md
  - build/demo-data/_index.md
  - data-map/invoice.md
---

# Architecture
**Owner:** Full-Stack Engineer · **Milestone:** M1 (v0.1 part written for M3) · **Approval:** not submitted; Data Architect review pending
**Input:** [Brief Part B — design inputs](brief-part-b.md) §2, §7

**Done when:** stores, rules-engine triggers, drill-down path and approved external services are named, reviewed by the Data Architect. This revision covers storage and intake for desk-v0.1 only; rules engine, actions and drill-down views are open for v0.9.

## Shared database limits (quoted from the artifact-capabilities skill, runtime contract 0.2.87)
- "DOCUMENT BODIES are plain-JSON OBJECTS ... at most 256 KiB serialized and 32 levels deep."
- "CAPACITY: an artifact's database holds at most 25,000 documents in total. Don't map an unbounded, growing stream (events, log lines, messages) to one document per item — aggregate many items into one document or prune old ones."
- `quota_exceeded`: caps on "documents in the collection, documents in this artifact's database, ... or the total size of this artifact's database". The total-size figure is **not stated** in the skill; the page therefore shows live usage and stops with a clear message when the store refuses a write.
- Queries scan the collection; keep queried collections to "hundreds to low thousands of documents". Per-viewer call rate is limited (`resource_exhausted`); the page retries with back-off.

## Constraint: do 12 quarters of line-level invoices fit?
No. Source volume ([Data map — Invoice](../data-map/invoice.md)): about 140,000 lines and 36,000 documents a month. Twelve quarters is 36 months: about 5 million lines and 1.3 million documents. One document per line or per invoice exceeds the 25,000-document cap by two orders of magnitude.

## Decision: storage grain
**One database document per plant × month × chunk** (`inv/{system}-{plant}-{YYYY-MM}-{n}`), holding two lists, gzip-compressed and base64-encoded inside the JSON body:
1. **Aggregate rows**: customer × salesperson × product group × internal-transfer flag, each with documents, lines, sheets, sq ft and net ₹. Feeds every KPI, QoQ and trend.
2. **Document index**: one short row per invoice (document no, day, customer, lines, sheets, net ₹, sq ft, transfer flag). This is the drill-down path from a figure to the source document.

A chunk is split in halves until it fits 190,000 base64 characters (the cap is 256 KiB). A coverage document per month (`cells/INV_{YYYY-MM}`) records per plant: chunk count, documents, lines, bytes, upload id and system. Re-loading a plant-month replaces its chunks and deletes stale ones.

Measured on synthetic data shaped like the real file (139,446 lines, 42 plants, one month): 42 documents, 2.5 MB, largest chunk 63 KB. Estimate for 36 months: about 1,500 documents and 60 to 90 MB. Document count is safe (6% of the cap); **total size is the unknown**. A checkbox in the intake ("Keep the document index") lets the uploader drop the index, which is the larger part, if the size cap bites.

**Traded away**
- **No line-level rows in the database.** Item, size, brand and price per line are not stored; analysis by item or by SKU needs another aggregate or a reload. Item-level views (stock days, item mix) are not possible from this grain.
- **Drill-down stops at the document** (system, doc type, doc no, date, customer, totals). Lines inside a document come from the SAP export or the later S/4 OData call. Row key (system, doc type, doc no, line) is checked at upload, not kept after it.
- **No rows outside scope**: base paper, consumables and the like are counted in the upload record (rows, ₹) only.
- Duplicate lines are detected within one file, not across files; cross-file safety comes from replacing a plant-month as a whole.
- Documents spanning two product groups appear once in the index, with the doc's totals.
- Raw SAP text fields (PO number, remarks) are never stored.

## Scope rule (Vijay, 20 Oct)
In scope: Laminate, Door, PVC sheet, Compact board. B1 `Catagory` normalised; S/4 `Product Type` ZABLAM, ZCRLAM, ZCBPVC. Out: everything else. Internal transfer = customer code in Admin "Internal transfer customers" **or** `AcctName` = "Sales GST - Stock Outward" **or** Zone BRANCH/FACTORY (B1 only; not derivable in S/4). Internal rows are stored with the flag and excluded from sales at read time.

## Intake pipeline (all in the browser)
Read (CSV own parser; XLSX by SheetJS 0.18.5 from cdnjs, the data sheet only) → detect B1 or S/4 from headers → confirm mapping (saved per file type in `mappings/`) → validate (mandatory, duplicate doc+line, unknown plant, date outside period, non-positive quantity, wrong document type; S/4 fan-out de-duplicated; mixed date cells repaired and confirmed) → split by document date → write chunks → update coverage → upload record. Rejected rows: first 20,000 in the page, first 1,500 stored per upload.
Parse time on a synthetic 140k-row, 41-column XLSX: 12 to 16 s; validate 2 s; load 1 s on a mock store (real store writes are slower).

## Collections
`users`, `plants`, `transfers` (Internal transfer customers), `potential` (revisions inside the doc), `periods` (closed, plan locked), `cells`, `inv`, `uploads`, `rejects`, `mappings`, `log` (closed-quarter reloads, closes, edits).

## Access
Viewer email decides the role. v0.1 opens only for Super admin (seed: Vijay and SP Sir); anyone else sees "Ask your admin for access". This is enforced in the page. Database rules are the artifact default (contributors and up can write), so access is **not** enforced at database level.

## Demo mode
"Load demo data" runs the synthetic generator ([demo-data generator](../build/demo-data/_index.md)) through the same validate and load path; every record carries `demo: true`; "Clear demo" deletes them. Ships empty.

## Not built yet
Rules engine, drill-down views, action store, row-level filtering, S/4 OData connector (card shown, disabled).
