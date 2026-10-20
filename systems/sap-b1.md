---
title: SAP Business One
summary: Current system of record for laminates transactions; reached only through user-run exports.
status: draft
updated: 2026-10-20
related:
  - systems/sap-s4hana.md
  - .claude/rules/data-handling.md
  - systems/_index.md
---

# SAP Business One (now)
- **Holds:** customers, items, sales employees, warehouses, sales orders, deliveries, invoices, credit notes, receivables, collections, stock. One data-map file per export: [Index — data-map/](../data-map/_index.md).
- **Access:** read only. Saved queries exported to CSV/XLSX by Virgo users and uploaded in Data Intake. No integration user, no write-back.
- **Export notes:** who exports, which queries and how often — open ([Open questions](../open-questions.md)). History depth: target 12 quarters.
