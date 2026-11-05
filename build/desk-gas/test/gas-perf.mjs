// Synthetic store only (random text, no Virgo data). Measures what a page load costs in server calls and getValues volume.
import { makeEnv } from './gas-env.mjs';
const MB = 1024 * 1024;
const rnd = (n) => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < n; i++) s += a[(Math.random() * 64) | 0]; return s; };
const blob = (n) => JSON.stringify({ z: rnd(n - 8) });
function build(spec) {
  const E = makeEnv();
  E.call('deskWrite', [Object.keys(spec).map(c => ({ op: 'set', col: c, id: '_seed', json: '{}' }))]);
  const base = rnd(PART => 0 || 44000); // placeholder to keep a fixed-size chunk
  const revs = JSON.parse(E.props.DESK_REVS);
  for (const [col, [count, size]] of Object.entries(spec)) {
    const rows = E.sheets['c_' + col].rows, parts = Math.ceil(size / 45000), tok = '000000009abc';
    const doc = blob(size);
    for (let d = 0; d < count; d++) for (let p = 0; p < parts; p++) { const s = doc.slice(p * 45000, (p + 1) * 45000); rows.push(['d' + String(d).padStart(6, '0'), p + '/' + parts + '/' + tok, s.length, s, 'x', 'x']); }
    revs.revs[col] = 4;
  }
  E.props.DESK_REVS = JSON.stringify(revs);
  return E;
}
function load(E, cols) { // what the page does for each subscribed collection
  const out = { calls: 0, plan: 0, page: 0, perCall: [], bytes: 0, docs: 0 };
  for (const c of cols) {
    const plan = E.call('deskPlan', [c]); out.calls++; out.plan++;
    for (const p of plan.pages) {
      E.stats.gv.length = 0;
      const r = E.call('deskPage', [c, p[0], p[1], plan.rev]); out.calls++; out.page++;
      const gv = E.stats.gv; out.perCall.push({ col: c, getValues: gv.length, rows: gv[0].rows, cells: gv[0].cells, chars: gv[0].chars, resp: JSON.stringify(r).length });
      out.bytes += JSON.stringify(r).length; out.docs += r.docs.length;
    }
  }
  return out;
}
function report(name, E, cols) {
  const t = Date.now(); const o = load(E, cols); const ms = Date.now() - t;
  const mx = o.perCall.reduce((a, b) => (b.chars > a.chars ? b : a), { chars: 0 });
  console.log(`\n${name}\n  collections read: ${cols.length}, docs ${o.docs}, payload ${(o.bytes / MB).toFixed(1)} MB`);
  console.log(`  server calls: ${o.calls} (${o.plan} plan + ${o.page} page); getValues per page call: exactly 1; largest: ${mx.rows} rows, ${mx.cells} cells, ${(mx.chars / MB).toFixed(2)} M chars; response ${(Math.max(...o.perCall.map(p => p.resp)) / MB).toFixed(2)} MB`);
  console.log(`  mock CPU time (not Apps Script time): ${ms} ms`);
  return o;
}
// A: about 80 MB in total; inv (66 MB) is read by id and is NOT read at page load
const A = build({ inv: [1500, 44000], cells: [80, 4000], roll: [80, 40000], receivables: [20, 200000], stock: [10, 250000], collections: [40, 60000], uploads: [200, 1500], users: [50, 400], plants: [45, 300], customers: [20, 100000], creditnotes: [20, 60000], audit: [300, 600], log: [400, 800], actions: [300, 900] });
const total = Object.values(A.sheets).filter(s => s.name.startsWith('c_')).reduce((n, s) => n + s.rows.reduce((m, r) => m + (+r[2] || 0), 0), 0);
console.log('store A size', (total / MB).toFixed(1), 'MB of JSON text');
const colsA = ['users', 'plants', 'periods', 'cells', 'mappings', 'uploads', 'transfers', 'potential', 'planlocks', 'audit', 'actions', 'followups', 'settings', 'phasing', 'roll', 'receivables', 'collections', 'backups', 'customers', 'creditnotes', 'stock', 'itemmeta', 'salesmaster'];
report('A. realistic: 80 MB store, page load reads the 23 subscribed collections (inv, items, rejects are read by id)', A, colsA);
// B: worst case, the whole 80 MB must be loaded by the page
const B = build({ roll: [1800, 44000] });
report('B. worst case: one subscribed collection of 80 MB', B, ['roll']);
// C: single-document read of one inv chunk in the 66 MB collection
E_c(A);
function E_c(E) { E.stats.gv.length = 0; const r = E.call('deskGetMany', [['inv/d000700', 'inv/d000701', 'inv/d000702']]); console.log('\nC. 3 inv chunks by id in the 66 MB collection: getValues calls', E.stats.gv.length, E.stats.gv.map(g => `${g.rows}x${g.cells / g.rows} cells, ${(g.chars / 1024).toFixed(0)}K chars`).join(' | ')); }
// D: one write batch into the large collection
const E = A; E.stats.gv.length = 0; E.stats.sv = 0;
const t = Date.now(); const w = E.call('deskWrite', [Array.from({ length: 20 }, (_, i) => ({ op: 'set', col: 'inv', id: 'n' + i, json: blob(44000) }))]);
console.log('\nD. write batch of 20 docs (0.9 MB) into the 66 MB inv collection: ok', w.ok, '| getValues', E.stats.gv.map(g => `${g.rows}x${g.cells / g.rows}`).join(','), '| setValues', E.stats.sv);
