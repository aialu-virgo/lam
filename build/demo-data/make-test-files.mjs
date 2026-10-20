// Writes synthetic B1-shaped and S/4-shaped test files to an output folder (default ./out, git-ignored).
// Usage: node make-test-files.mjs <outDir>  (needs the `xlsx` package for .xlsx; CSV always written)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const G = require('./generator.js');
const out = process.argv[2] || './out';
fs.mkdirSync(out, { recursive: true });
const plants = [{ code: '1012', name: 'Demo Depot A - Depot' }, { code: '1013', name: 'Demo Depot B - Depot' }, { code: '1001', name: 'Demo Factory 1 - Factory' }];
const csv = (h, rows) => [h, ...rows].map(r => r.map(v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n');
const b1q = G.invoices({ shape: 'B1', plants, months: ['2025-10', '2025-11', '2025-12'], docsPerPlantMonth: 30, seed: 1, dateStyle: 'iso', withLineNum: true, defects: true });
fs.writeFileSync(path.join(out, 'b1_invoice_Q3FY26.csv'), csv(b1q.headers, b1q.rows));
const b1m = G.invoices({ shape: 'B1', plants, months: ['2026-07', '2026-08', '2026-09'], docsPerPlantMonth: 40, seed: 2, dateStyle: 'b1defect' });
fs.writeFileSync(path.join(out, 'b1_invoice_Q2FY27_datedefect.csv'), csv(b1m.headers, b1m.rows.map(r => r.slice())));
const s4 = G.invoices({ shape: 'S4', plants: [plants[1]], months: ['2026-10'], docsPerPlantMonth: 20, seed: 3, dateStyle: 'iso' });
fs.writeFileSync(path.join(out, 's4_invoice_Oct2026.csv'), csv(s4.headers, s4.rows));
const multi = G.invoices({ shape: 'B1', plants: plants.slice(0, 2), months: ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'], docsPerPlantMonth: 20, seed: 4, dateStyle: 'iso' });
fs.writeFileSync(path.join(out, 'b1_invoice_multi_Q4FY24_Q1FY25.csv'), csv(multi.headers, multi.rows));
try {
  const XLSX = require('xlsx');
  for (const [name, d] of [['b1_invoice_Q2FY27_datedefect.xlsx', b1m]]) {
    const ws = XLSX.utils.aoa_to_sheet([d.headers, ...d.rows]);
    // mark numeric DocDate cells as dates so Excel-shaped files behave like the real export
    const col = d.headers.indexOf('DocDate');
    d.rows.forEach((r, i) => { if (typeof r[col] === 'number') { const c = ws[XLSX.utils.encode_cell({ r: i + 1, c: col })]; c.z = 'dd/mm/yyyy'; } });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'DATA');
    XLSX.writeFile(wb, path.join(out, name));
  }
} catch (e) { console.log('xlsx not available, CSV only:', e.message); }
console.log('written to', out);
