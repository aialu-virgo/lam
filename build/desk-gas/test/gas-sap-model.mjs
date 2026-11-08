// gas-sap-model: modelled timing of the October S/4 shadow read, released reader (5db7cfe) against the new one, on a synthetic month of ~108,000 billing lines.
// The mock S/4 server adds a fixed time per SAP call to a virtual clock (a parallel group of calls costs the slowest one), so the run limit (SAP_BUDGET_MS, 5 minutes) behaves as it would;
// nothing here measures the real tenant. Usage: node gas-sap-model.mjs   (prints a table; exits 1 only if the two readers disagree on totals)
import { makeEnv } from './gas-env.mjs';
import { makeS4, synthDocs, synthMasters } from './mock-s4.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const OLD = path.join(here, 'fixtures/sap.gs.5db7cfe.js');
const masters = synthMasters(7), PLANTS = ['1001', '1013', '1021'], SUPER = 'data@virgoasia.com';
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const docs = synthDocs({ masters, from: '2026-10-01', to: '2026-10-31', perDayPerPlant: 460, extras: true });
const lines = docs.reduce((n, d) => n + d.to_Item.results.length, 0);
console.log('synthetic October: ' + docs.length + ' documents, ' + lines + ' billing lines (' + (lines / docs.length).toFixed(2) + ' per document)');
function run({ old, msPerCall, msPerItem = 0, props = {} }) {
  const S = makeS4({ docs, products: masters.products, customers: masters.customers, msPerCall, msPerItem });
  const env = makeEnv({ fetch: (u, o, st) => S.fetch(u, o, st), sapFile: old ? OLD : undefined });
  env.call('deskWrite', [[set('users', 'u1', { email: SUPER, role: 'Super admin', active: true, name: 'V' }), ...PLANTS.map(p => set('plants', p, { plant_code: p, plant_name: 'D' + p, plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'D' + p, business: 'laminates', active: true }))]]);
  Object.assign(env.props, { SAP_BASE_URL: S.host, SAP_USER: S.user, SAP_PASSWORD: S.password, SAP_SYNC_ENABLED: 'yes' }, props);
  env.props.SAP_STATUS = JSON.stringify({ verify: { at: '2026-11-08T06:00:00.000Z', ok: true, failed: false, gaps: 0, optionalGaps: 0, checked: 29, shape: 'A' } });
  env.setEmail(SUPER);
  const t0 = env.state.skew; let r, runs = 0, runSecs = [];
  do { const s0 = env.state.skew; r = env.call('sapShadowRun'); runs++; runSecs.push(Math.round((env.state.skew - s0) / 1000)); } while (r.ok && r.done === false && runs < 80);
  const billing = S.calls.filter(c => /\/A_BillingDocument(Item)?$/.test(c.path)).length, lookups = S.calls.filter(c => /A_Product|A_Customer/.test(c.path)).length;
  return { ok: r.ok && r.done, runs, secs: Math.round((env.state.skew - t0) / 1000), runSecs, calls: S.calls.length, billing, lookups, fetchAll: env.state.fetchAllCalls || 0, feed: JSON.stringify((r.differences || []).map(d => [d.plant, d.feed])) };
}
const rows = []; let bad = false;
for (const [label, msPerCall, msPerItem] of [['1 s per call', 1000, 0], ['2 s per call', 2000, 0], ['3 s per call', 3000, 0], ['1 s + 2 ms per document returned (bigger pages cost more)', 1000, 2], ['3 s + 5 ms per document returned', 3000, 5]]) {
  const o = run({ old: true, msPerCall, msPerItem }), n = run({ old: false, msPerCall, msPerItem });
  if (o.feed !== n.feed || !o.ok || !n.ok) bad = true;
  rows.push([label, o, n]);
}
const pad = (s, w) => String(s).padEnd(w);
console.log('\n' + pad('model', 56) + pad('released reader', 40) + 'new reader (page 500, 4 at once)');
for (const [label, o, n] of rows) console.log(pad(label, 56) + pad(o.runs + ' runs, ' + o.secs + ' s, ' + o.calls + ' calls (' + o.billing + ' pages)', 40) + n.runs + ' run' + (n.runs === 1 ? '' : 's') + ', ' + n.secs + ' s, ' + n.calls + ' calls (' + n.billing + ' pages, ' + n.lookups + ' lookups, ' + n.fetchAll + ' parallel groups)');
console.log('\nper-run seconds, new reader: ' + rows.map(([l, o, n]) => l.split(' ')[0] + 's: ' + n.runSecs.join('+')).join(' | '));
console.log('totals identical between the two readers in every row: ' + !bad);
process.exitCode = bad ? 1 : 0;
