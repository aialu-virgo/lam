// gas-sap-model: modelled timing of the October S/4 shadow read, released reader (5db7cfe) against the new one, on a synthetic month of ~108,000 billing lines
// with realistic masters (800 products, 3,000 customers; product and customer lookups cost calls too).
// The mock S/4 server adds a fixed time per SAP call to a virtual clock (a parallel group of calls costs the slowest one), so the 5-minute run budget behaves as it would.
// Released reader: the runs are clicked back to back (best case). New reader: sapShadowRunAuto, and the trigger fires 60 s after each run stops (and after every run the 60 s are counted).
// Nothing here measures the real tenant. Usage: node gas-sap-model.mjs   (prints a table; exits 1 if the two readers disagree on totals or a run exceeds 330 s)
import { makeEnv } from './gas-env.mjs';
import { makeS4, synthDocs, synthMasters } from './mock-s4.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const OLD = path.join(here, 'fixtures/sap.gs.5db7cfe.js');
const masters = synthMasters(7, 800, 3000), PLANTS = ['1001', '1013', '1021'], SUPER = 'data@virgoasia.com';
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const docs = synthDocs({ masters, from: '2026-10-01', to: '2026-10-31', perDayPerPlant: 460, extras: true });
const lines = docs.reduce((n, d) => n + d.to_Item.results.length, 0);
console.log('synthetic October: ' + docs.length + ' documents, ' + lines + ' billing lines (' + (lines / docs.length).toFixed(2) + ' per document), 800 products, 3000 customers');
function mk({ old, msPerCall, props = {} }) {
  const S = makeS4({ docs, products: masters.products, customers: masters.customers, msPerCall });
  const env = makeEnv({ fetch: (u, o, st) => S.fetch(u, o, st), sapFile: old ? OLD : undefined });
  env.call('deskWrite', [[set('users', 'u1', { email: SUPER, role: 'Super admin', active: true, name: 'V' }), ...PLANTS.map(p => set('plants', p, { plant_code: p, plant_name: 'D' + p, plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'D' + p, business: 'laminates', active: true }))]]);
  Object.assign(env.props, { SAP_BASE_URL: S.host, SAP_USER: S.user, SAP_PASSWORD: S.password, SAP_SYNC_ENABLED: 'yes', SAP_AUTO_MAX_RUNS: '30' }, props);
  env.props.SAP_STATUS = JSON.stringify({ verify: { at: '2026-11-08T06:00:00.000Z', ok: true, failed: false, gaps: 0, optionalGaps: 0, checked: 29, shape: 'A' } });
  env.setEmail(SUPER); return { S, env };
}
function runOld(msPerCall) {
  const { S, env } = mk({ old: true, msPerCall }); const t0 = env.state.skew; let r, runs = 0; const secs = [];
  do { const s0 = env.state.skew; r = env.call('sapShadowRun'); runs++; secs.push(Math.round((env.state.skew - s0) / 1000)); } while (r.ok && r.done === false && runs < 200);
  return { ok: r.ok && r.done, runs, secs, minutes: (env.state.skew - t0) / 60000, calls: S.calls.length, max: Math.max(...secs), feed: JSON.stringify((r.differences || []).map(d => [d.plant, d.feed])) };
}
function runNew(msPerCall, props) {
  const { S, env } = mk({ old: false, msPerCall, props }); const t0 = env.state.skew; const secs = []; let runs = 0, r;
  const s0 = env.state.skew; r = env.call('sapShadowRunAuto'); runs++; secs.push(Math.round((env.state.skew - s0) / 1000));
  env.setEmail('');
  while (env.state.triggers.some(x => x.fn === 'sapShadowAutoTrigger_') && runs < 100) {
    env.state.skew += 60000;   // the one-off trigger fires about a minute after the run stopped
    const a = env.state.skew; env.ctx.sapShadowAutoTrigger_(); runs++; secs.push(Math.round((env.state.skew - a) / 1000));
  }
  env.setEmail(SUPER); const st = env.call('sapStatus').status;
  const sh = JSON.parse(env.props.SAP_SHADOW || 'null');
  return { ok: !!(st.progress && st.progress.done), runs, secs, minutes: (env.state.skew - t0) / 60000, calls: S.calls.length, max: Math.max(...secs), pages: S.calls.filter(c => /\/A_BillingDocument(Item)?$/.test(c.path)).length, lookups: S.calls.filter(c => /A_Product|A_Customer/.test(c.path)).length, shadow: sh };
}
let bad = false; const rows = [];
for (const [label, ms] of [['25 s per call (what Vijay sees, lookups included)', 25000], ['10 s per call', 10000], ['3 s per call', 3000], ['1 s per call', 1000]]) {
  const o = runOld(ms), n = runNew(ms);
  // totals: the released reader's feed vs the new reader's feed (the new reader stored the differences list in SAP_SHADOW; compare through a second plain run on the same data)
  rows.push([label, o, n]); if (!o.ok || !n.ok || n.max > 330) bad = true;
}
// totals check once, with no time model (fast)
{
  const a = mk({ old: true, msPerCall: 0 }), b = mk({ old: false, msPerCall: 0 }); let ra, rb, k = 0;
  do { ra = a.env.call('sapShadowRun'); } while (ra.ok && !ra.done && k++ < 50); k = 0; do { rb = b.env.call('sapShadowRun'); } while (rb.ok && !rb.done && k++ < 50);
  const f = (r) => JSON.stringify((r.differences || []).map(d => [d.plant, d.feed]));
  if (f(ra) !== f(rb)) bad = true; console.log('totals identical between the two readers: ' + (f(ra) === f(rb)));
}
const pad = (s, w) => String(s).padEnd(w);
console.log('\n' + pad('model', 52) + pad('released reader (re-run by hand, no gaps)', 46) + 'new reader, sapShadowRunAuto (60 s gaps counted)');
for (const [label, o, n] of rows) console.log(pad(label, 52) + pad(o.runs + ' runs, ' + o.minutes.toFixed(1) + ' min, ' + o.calls + ' calls', 46) + n.runs + ' run' + (n.runs === 1 ? '' : 's') + ', ' + n.minutes.toFixed(1) + ' min, ' + n.calls + ' calls (' + n.pages + ' pages, ' + n.lookups + ' lookups), longest run ' + n.max + ' s');
console.log('\nseconds per run, new reader: ' + rows.map(([l, o, n]) => l.split(' ')[0] + ' s: ' + n.secs.join('+')).join(' | '));
console.log('every new-reader run under 330 s and every read finished: ' + !bad);
process.exitCode = bad ? 1 : 0;
