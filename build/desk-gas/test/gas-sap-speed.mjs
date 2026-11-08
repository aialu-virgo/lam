// gas-sap-speed: the faster, restart-proof S/4 reader (m8-sap-speed) against the mock S/4 server with SYNTHETIC data only. No real SAP call, no credentials.
// Covers: page size by Script Property and its default, fallback to a smaller page, pages read in parallel (bounded), key paging that survives documents
// being added / removed / cancelled between runs, a count mismatch that is a warning, automatic continuation by a one-off trigger, progress, drop reasons,
// and identical totals against the reader of the released build (test/fixtures/sap.gs.5db7cfe.js).
import { makeEnv } from './gas-env.mjs';
import { makeS4, synthDocs, synthMasters } from './mock-s4.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const OLD = path.join(here, 'fixtures/sap.gs.5db7cfe.js');
const res = []; const ok = (n, c, d) => { const l = (c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || '')); console.log(l); res.push(l); if (!c) process.exitCode = 1; };
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const PLANTS = ['1001', '1013', '1021'];
const SUPER = 'data@virgoasia.com';
const masters = synthMasters(7);
const sj = (o) => JSON.stringify(o);
function build({ docs, s4opts = {}, plants = PLANTS, old = false, props = {} } = {}) {
  const S = makeS4(Object.assign({ docs, products: masters.products, customers: masters.customers }, s4opts));
  const env = makeEnv({ fetch: (u, o, st) => S.fetch(u, o, st), sapFile: old ? OLD : undefined });
  env.call('deskWrite', [[set('users', 'u1', { email: SUPER, role: 'Super admin', active: true, name: 'Vijay' }), set('users', 'u2', { email: 'se@virgoasia.com', role: 'Sales executive', active: true, name: 'Se' }),
    ...plants.map(p => set('plants', p, { plant_code: p, plant_name: 'Depot ' + p, plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'Depot ' + p, business: 'laminates', active: true }))]]);
  Object.assign(env.props, { SAP_BASE_URL: S.host, SAP_USER: S.user, SAP_PASSWORD: S.password, SAP_SYNC_ENABLED: 'yes' }, props);
  env.props.SAP_STATUS = JSON.stringify({ verify: { at: '2026-11-08T06:00:00.000Z', ok: true, failed: false, gaps: 0, optionalGaps: 0, checked: 29, shape: 'A' } });
  env.setEmail(SUPER);
  return { S, env };
}
const feedOf = (r) => sj((r.differences || []).map(d => [d.plant, d.feed]));
const dq = (c) => decodeURIComponent(c.query);
const topOf = (c) => +new URLSearchParams(c.query).get('$top');
const isPage = (c) => /A_BillingDocument\?/.test(c.path + c.query) && /expand|BillingDocumentItem/.test(c.query + c.path) || /A_BillingDocumentItem\?/.test(c.path + c.query);
const billingPages = (S, from = 0) => S.calls.slice(from).filter(c => /\/A_BillingDocument(Item)?$/.test(c.path) && !/\$top=1(&|$)/.test(c.query));
const runAll = (env, fn, args = [], max = 60) => { let r = env.call(fn, args), n = 1; while (r.ok && r.done === false && n < max) { r = env.call(fn, args); n++; } r.runs = n; return r; };
/* a month of invoices: about 1,900 documents across three plants */
const docs0 = () => synthDocs({ masters, from: '2026-10-01', to: '2026-10-31', perDayPerPlant: 20 });
const base = (() => { const d = docs0(); const { env } = build({ docs: d, old: true }); const r = runAll(env, 'sapShadowRun'); return { r, feed: feedOf(r), n: d.length }; })();
ok('baseline: the released reader finishes the synthetic October', base.r.ok && base.r.done && base.n > 1800, base.n + ' ' + sj(base.r).slice(0, 200));

/* ---------- 1. identical totals ---------- */
for (const [name, props, s4] of [['defaults (page 500, 4 at once)', {}, {}], ['page 50, one at a time', { SAP_PAGE_TOP: '50', SAP_CONCURRENCY: '1' }, {}], ['page 40, 10 at once', { SAP_PAGE_TOP: '40', SAP_CONCURRENCY: '10' }, {}],
  ['server caps pages at 17', {}, { pageCap: 17 }], ['page 1000', { SAP_PAGE_TOP: '1000' }, {}], ['page 10 (tiny)', { SAP_PAGE_TOP: '10', SAP_CONCURRENCY: '3' }, {}]]) {
  const { env } = build({ docs: docs0(), props, s4opts: s4 }); const r = runAll(env, 'sapShadowRun');
  ok('identical totals vs the released reader (shape A, ' + name + ')', r.ok && r.done && feedOf(r) === base.feed, feedOf(r).slice(0, 160) + ' vs ' + base.feed.slice(0, 160));
}
{
  const baseB = (() => { const { env } = build({ docs: docs0(), old: true, props: { SAP_BILLING_SHAPE: 'B' } }); const r = runAll(env, 'sapShadowRun'); return feedOf(r); })();
  ok('shape B: the old reader gives the same totals as shape A (reference)', baseB === base.feed);
  for (const [name, props, s4] of [['defaults', {}, {}], ['page 40, 4 at once, server cap 33', { SAP_PAGE_TOP: '40' }, { pageCap: 33 }], ['page 25, 10 at once', { SAP_PAGE_TOP: '25', SAP_CONCURRENCY: '10' }, {}]]) {
    const { env } = build({ docs: docs0(), props: Object.assign({ SAP_BILLING_SHAPE: 'B' }, props), s4opts: s4 }); const r = runAll(env, 'sapShadowRun');
    ok('identical totals vs the released reader (shape B, ' + name + ')', r.ok && r.done && feedOf(r) === baseB, feedOf(r).slice(0, 120));
  }
}
{ // staged rows (sync) equal the old reader's rows, order-independent
  const rowsOf = (env) => { const st = env.stored(), man = JSON.parse(st['sapstage/man_2026-10']); return { man, n: man.rows }; };
  const { env: eo } = build({ docs: docs0(), old: true }); runAll(eo, 'sapShadowRun'); const ro = runAll(eo, 'sapSync');
  const { env: en } = build({ docs: docs0() }); runAll(en, 'sapShadowRun'); const rn = runAll(en, 'sapSync');
  ok('sapSync stages the same rows and totals as the released reader', ro.ok && rn.ok && rowsOf(eo).n === rowsOf(en).n && sj(rowsOf(eo).man.counts.plants) === sj(rowsOf(en).man.counts.plants) && Math.round(rowsOf(eo).man.counts.salesValue) === Math.round(rowsOf(en).man.counts.salesValue), sj([rowsOf(eo).n, rowsOf(en).n]));
}

/* ---------- 2. page size by Script Property; large default ---------- */
{
  const { S, env } = build({ docs: docs0() }); env.call('sapShadowRun'); const pages = billingPages(S);
  ok('the default page is 500 (larger than the old 200)', pages.length > 0 && pages.every(c => topOf(c) === 500), sj(pages.map(topOf)));
  ok('status shows the page size and concurrency in use', env.call('sapStatus').status.paging.pageTop === 500 && env.call('sapStatus').status.paging.concurrency === 4);
  let t = build({ docs: docs0(), props: { SAP_PAGE_TOP: '75' } }); t.env.call('sapShadowRun'); ok('SAP_PAGE_TOP=75 is used', billingPages(t.S).every(c => topOf(c) === 75));
  t = build({ docs: docs0(), props: { SAP_PAGE_TOP: 'abc' } }); t.env.call('sapShadowRun'); ok('a bad SAP_PAGE_TOP falls back to the default', billingPages(t.S).every(c => topOf(c) === 500));
  t = build({ docs: docs0(), props: { SAP_PAGE_TOP: '999999', SAP_CONCURRENCY: '99' } }); t.env.call('sapShadowRun');
  ok('SAP_PAGE_TOP and SAP_CONCURRENCY are clamped (5000 and 10)', billingPages(t.S).every(c => topOf(c) <= 5000) && t.env.state.fetchAllMax <= 10 && t.env.call('sapStatus').status.paging.pageTop === 5000, sj(t.env.call('sapStatus').status.paging));
  const n200 = (() => { const t2 = build({ docs: docs0(), props: { SAP_PAGE_TOP: '200', SAP_CONCURRENCY: '1' } }); t2.env.call('sapShadowRun'); return billingPages(t2.S).length; })();
  ok('a larger page needs fewer billing calls than the old 200', billingPages(S).length < n200, billingPages(S).length + ' vs ' + n200);
}

/* ---------- 3. parallel fetch ---------- */
{
  const run = (conc, extra = {}) => { const t = build({ docs: docs0(), props: Object.assign({ SAP_PAGE_TOP: '60', SAP_CONCURRENCY: String(conc) }, extra) }); const r = runAll(t.env, 'sapShadowRun'); return { t, r }; };
  const a = run(1), b = run(3), c = run(6);
  ok('concurrency 1: no fetchAll', !a.t.env.state.fetchAllCalls && a.r.done);
  ok('concurrency 3: pages go out together, never more than 3 in one fetchAll', b.t.env.state.fetchAllCalls > 3 && b.t.env.state.fetchAllMax === 3, b.t.env.state.fetchAllMax);
  ok('concurrency 6 is bounded by 6', c.t.env.state.fetchAllMax <= 6 && c.t.env.state.fetchAllMax >= 4, c.t.env.state.fetchAllMax);
  ok('all three give the same totals', feedOf(a.r) === feedOf(b.r) && feedOf(b.r) === feedOf(c.r) && feedOf(a.r) === base.feed);
  ok('every request is a GET with the Basic header and no password in a URL (parallel ones too)', b.t.S.calls.every(x => x.method === 'get' && /^Basic /.test(x.headers.Authorization || '') && !x.url.includes(b.t.S.password)));
  ok('parallel reading is faster in modelled time (2 s per call): same data, less waiting', (() => { const f = (cc) => { const t = build({ docs: docs0(), s4opts: { msPerCall: 2000 }, props: { SAP_PAGE_TOP: '60', SAP_CONCURRENCY: String(cc), SAP_RUN_BUDGET_MS: '99999999' } }); const t0 = t.env.state.skew; t.env.call('sapShadowRun'); return t.env.state.skew - t0; }; const s1 = f(1), s4 = f(4); return s4 < s1 / 2; })());
  // 401 / 403 / 404 keep their messages in parallel mode and are not retried or turned into a smaller page
  for (const [code, re, key] of [[401, /HTTP 401/, 'sap_auth'], [403, /HTTP 403/, 'sap_forbidden'], [404, /HTTP 404/, 'sap_not_found']]) {
    const t = build({ docs: docs0(), props: { SAP_PAGE_TOP: '60' } }); t.env.call('sapShadowRun'); t.S.calls.length = 0; t.S.failNext(/BillingDocument/, code, 99); const r = t.env.call('sapShadowRun');
    ok(code + ' in a parallel read: code ' + key + ', same message, not retried, no smaller page tried', r.code === key && re.test(r.message) && t.S.calls.length <= 3 && !t.env.props.SAP_PAGE_EFF, sj([r.code, t.S.calls.length]));
  }
}

/* ---------- 4. fallback to a smaller page ---------- */
{
  for (const [name, inject] of [['HTTP 500', (S) => S.failNext(/\$top=500(&|$)/, 500, 9999)], ['HTTP 413', (S) => S.failNext(/\$top=500(&|$)/, 413, 9999)], ['a timeout (exception)', (S) => S.failNext(/\$top=500(&|$)/, 0, 9999, { throw: true })], ['a cut-off answer', (S) => S.failNext(/\$top=500(&|$)/, 200, 9999, { body: '{"d":{"results":[{"BillingDoc' })]]) {
    const t = build({ docs: docs0() }); inject(t.S); const r = runAll(t.env, 'sapShadowRun'); const eff = JSON.parse(t.env.props.SAP_PAGE_EFF || 'null');
    ok('refused page (' + name + '): the run falls back to a smaller page and still gives identical totals', r.ok && r.done && feedOf(r) === base.feed && eff && eff.top < 500, sj([r.code, r.message, eff]).slice(0, 250));
    const sizes = billingPages(t.S).map(topOf);
    ok('  ...it halved (500, 250, ...) and did not give up before the minimum', sizes.includes(250) && sizes.every(x => x >= 50), sj([...new Set(sizes)]));
    ok('  ...the progress notes say so', /page size now/.test(sj(t.env.call('sapStatus').status.progress || {})), sj(t.env.call('sapStatus').status.progress));
    const n0 = t.S.calls.length; t.env.call('sapShadowRun'); const next = billingPages(t.S, n0).map(topOf);
    ok('  ...the next run starts at the size that worked (no repeat of the refusal)', next.length > 0 && next.every(x => x <= eff.top), sj(next.slice(0, 5)));
    t.env.props.SAP_PAGE_TOP = '400'; ok('  ...a changed SAP_PAGE_TOP is respected again (the learned size belongs to the old setting)', JSON.parse(t.env.props.SAP_PAGE_EFF).want === 500 && (() => { const n1 = t.S.calls.length; t.S.fails = []; t.env.call('sapShadowRun'); return billingPages(t.S, n1).every(c => topOf(c) <= 400); })());
  }
  { // refused at every size: ends with the real error after trying the ladder, nothing written
    const t = build({ docs: docs0() }); const before = sj(t.env.stored()); t.S.failNext(/A_BillingDocument\?.*\$expand/, 500, 99999); const r = t.env.call('sapShadowRun');
    ok('refused at every size: HTTP 500 message, nothing written, run flag released', r.code === 'sap_error' && /HTTP 500/.test(r.message) && sj(t.env.stored()) === before && !t.env.props.SAP_RUN, sj(r).slice(0, 200));
  }
  { // a server that caps pages at 17: learned, persisted
    const t = build({ docs: docs0(), s4opts: { pageCap: 17 } }); const r = runAll(t.env, 'sapShadowRun');
    ok('a server page cap is learned (17) and kept for the next runs', r.done && JSON.parse(t.env.props.SAP_PAGE_EFF).top === 17 && feedOf(r) === base.feed, t.env.props.SAP_PAGE_EFF);
  }
}

/* ---------- 5. progress ---------- */
{
  const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); const r1 = t.env.call('sapShadowRun');
  ok('a run that stops at the limit reports months done, lines read so far and the runs still needed', r1.ok && r1.done === false && r1.progress && /0 of 1 month\(s\) done; [\d,]+ of about [\d,]+ lines read \(\d+%\); run 1; about \d+ more runs? \(estimate\)/.test(r1.progress.text) && r1.progress.runsLeft >= 1, sj(r1.progress));
  const st = t.env.call('sapStatus').status;
  ok('sapStatus shows the same progress text', st.progress && st.progress.text === r1.progress.text && /part-way/.test(st.next), sj(st.progress) + st.next);
  ok('the run message and the log line carry it', /lines read/.test(r1.message) && (t.env.state.logs || []).some(l => /^SAP-PROGRESS Shadow run: 0 of 1/.test(l)) && (t.env.state.logs || []).some(l => /^SAP \{.*"progress":"Shadow run: 0 of 1/.test(l)));
  const r2 = runAll(t.env, 'sapShadowRun');
  ok('the last run says finished, with the run number', r2.done && /^Shadow run finished: 1 of 1 month\(s\) done; [\d,]+ lines read; run \d+; nothing left to read\./.test(r2.progress.text), sj(r2.progress));
  ok('lines read equal the lines SAP sent for the month', r2.progress.lines === docs0().reduce((n, d) => n + (iso(d) === '2026-10' && d.CompanyCode === '1000' ? d.to_Item.results.length : 0), 0), r2.progress.lines);
}
function iso(d) { return new Date(+/\((\d+)\)/.exec(d.BillingDocumentDate)[1]).toISOString().slice(0, 7); }

/* ---------- 6. automatic continuation ---------- */
{
  const mk = (extra = {}, props = {}) => build({ docs: docs0(), s4opts: Object.assign({ msPerCall: 20000, pageCap: 25 }, extra), props: Object.assign({ SAP_RUN_BUDGET_MS: '170000' }, props) });
  const ours = (env) => env.state.triggers.filter(x => x.fn === 'sapShadowAutoTrigger_');
  const fire = (env, max = 60) => { let n = 0; env.setEmail(''); while (ours(env).length && n++ < max) { env.ctx.sapShadowAutoTrigger_(); } env.setEmail(SUPER); return n; };
  { const t = mk(); const before = sj(t.env.stored()); const r = t.env.call('sapShadowRunAuto');
    ok('sapShadowRunAuto: not done in one run, so exactly one one-off trigger is installed (after about a minute) and the state is kept', r.ok && r.done === false && r.auto.state === 'continuing' && ours(t.env).length === 1 && ours(t.env)[0].kind === 'after' && ours(t.env)[0].ms === 60000 && !!t.env.props.SAP_AUTO, sj([r.auto, t.env.state.triggers]));
    ok('...a time trigger cannot pass the month, so it calls a function without arguments (trailing underscore: not callable from the page)', typeof t.env.ctx.sapShadowAutoTrigger_ === 'function' && typeof t.env.ctx.sapShadowAutoTrigger === 'undefined');
    ok('...the message tells Vijay he need not click again', /by itself in about a minute/.test(r.message));
    const n = fire(t.env); const st = t.env.call('sapStatus').status;
    ok('the trigger chain finishes the month with no clicks, then removes the trigger and the state', n >= 1 && ours(t.env).length === 0 && !t.env.props.SAP_AUTO && st.shadow && st.shadow.ym === '2026-10' && st.progress.done, sj([n, t.env.state.triggers, st.progress]));
    const last = JSON.parse(t.env.props.SAP_SHADOW);
    ok('...with identical totals to the released reader', (() => { const o = build({ docs: docs0(), old: true }); const ro = runAll(o.env, 'sapShadowRun'); return sj(last.rows) === sj((ro.differences || []).filter(d => !d.equal).slice(0, 40)); })());
    ok('nothing was written to the Desk store by the whole chain', sj(t.env.stored()) === before);
    ok('every run of the chain logged one SAP line and a progress line', (t.env.state.logs || []).filter(l => /^SAP \{"fn":"sapShadowAutoTrigger_"/.test(l)).length === n);
  }
  { const t = mk(); t.env.call('sapShadowRunAuto'); t.S.failNext(/BillingDocument/, 500, 99999);
    t.env.setEmail(''); t.env.ctx.sapShadowAutoTrigger_(); t.env.setEmail(SUPER);
    ok('an error in a continued run removes the trigger and the state (no endless retry), and keeps the read position', ours(t.env).length === 0 && !t.env.props.SAP_AUTO && t.env.call('sapStatus').status.lastOk === false && !!t.env.props.SAP_CURSOR_SHADOW, sj([t.env.state.triggers, t.env.props.SAP_AUTO]));
    t.S.fails = []; const r = runAll(t.env, 'sapShadowRun'); ok('...and sapShadowRun resumes from it', r.done && r.resumed !== undefined && feedOf(r) === base.feed);
  }
  { const t = mk(); const r = t.env.call('sapShadowRunAuto'); t.env.props.SAP_RUN = JSON.stringify({ at: Date.now() + t.env.state.skew });   // another run holds the run flag
    const c0 = t.S.calls.length; t.env.setEmail(''); t.env.ctx.sapShadowAutoTrigger_(); t.env.setEmail(SUPER);
    ok('two runs at once: a trigger that finds the run flag held makes no SAP call, waits and tries again (state and one trigger kept)', t.S.calls.length === c0 && ours(t.env).length === 1 && JSON.parse(t.env.props.SAP_AUTO).busy === 1, sj([t.S.calls.length - c0, t.env.props.SAP_AUTO]));
    const r2 = t.env.call('sapShadowRunAuto'); ok('a manual sapShadowRunAuto while a run holds the flag is refused and does not touch the waiting trigger', r2.ok === false && /in progress/.test(r2.message) && ours(t.env).length === 1);
    const r3 = t.env.call('sapShadowRun'); ok('a manual sapShadowRun is refused too', r3.ok === false && /in progress/.test(r3.message));
    delete t.env.props.SAP_RUN; fire(t.env); ok('when the flag is released the chain carries on and finishes', ours(t.env).length === 0 && !t.env.props.SAP_AUTO && t.env.call('sapStatus').status.progress.done);
    void r;
  }
  { const t = mk({}, { SAP_AUTO_BUSY_MAX: '1' }); t.env.call('sapShadowRunAuto'); t.env.props.SAP_RUN = JSON.stringify({ at: Date.now() + 1e9 });
    t.env.setEmail(''); for (let i = 0; i < 12 && ours(t.env).length; i++) t.env.ctx.sapShadowAutoTrigger_(); t.env.setEmail(SUPER);
    ok('a run flag that never clears does not keep a trigger alive forever', ours(t.env).length === 0 && !t.env.props.SAP_AUTO); }
  { const t = mk({}, { SAP_AUTO_MAX_RUNS: '2' }); const r = t.env.call('sapShadowRunAuto'); fire(t.env);
    ok('the chain stops after SAP_AUTO_MAX_RUNS runs, removes its trigger and says how to carry on', ours(t.env).length === 0 && !t.env.props.SAP_AUTO && /Stopped after 2 automatic runs/.test((t.env.call('sapStatus').status.message || '')) , sj([r.auto, t.env.call('sapStatus').status.message]));
  }
  { const t = mk(); t.env.call('sapShadowRunAuto'); const r = t.env.call('sapStopAuto'); ok('sapStopAuto removes the trigger and the state', r.ok && r.removed === 1 && ours(t.env).length === 0 && !t.env.props.SAP_AUTO);
    t.env.setEmail(''); const c0 = t.S.calls.length; t.env.ctx.sapShadowAutoTrigger_(); t.env.setEmail(SUPER); ok('a trigger that fires after the chain was stopped reads nothing', t.S.calls.length === c0); }
  { const t = mk(); for (const who of ['se@virgoasia.com', 'stranger@virgoasia.com', '']) { t.env.setEmail(who); const rs = ['sapShadowRunAuto', 'sapSyncAuto', 'sapStopAuto'].map(f => t.env.call(f)); ok('"' + (who || 'no email') + '": the new public functions are refused', rs.every(r => r.ok === false && /permission_denied|unauthenticated/.test(r.code)), sj(rs.map(r => r.code))); }
    ok('...and made no SAP call and installed no trigger', t.S.calls.length === 0 && t.env.state.triggers.length === 0);
    t.env.setEmail(SUPER); t.env.setEmail('se@virgoasia.com'); t.env.ctx.sapShadowAutoTrigger_(); ok('a signed-in non-admin reaching the trigger entry point does nothing', t.S.calls.length === 0); }
  { // done in one run: no trigger at all
    const t = build({ docs: docs0() }); const r = t.env.call('sapShadowRunAuto'); ok('finished in one run: no trigger is left behind', r.ok && r.done && r.auto.state === 'finished' && t.env.state.triggers.length === 0 && !t.env.props.SAP_AUTO && /Finished in 1 run\./.test(r.message), sj(r.auto)); }
  { // sync: the same chain as the shadow, with its own SAP_AUTO record
    const t = mk(); runAll(t.env, 'sapShadowRun'); const sy = (env) => env.state.triggers.filter(x => x.fn === 'sapSyncAutoTrigger_'); const r = t.env.call('sapSyncAuto');
    ok('sapSyncAuto: a cut run leaves ONE one-off trigger (60 s) and an SAP_AUTO record of kind sync', r.ok && r.done === false && r.auto.state === 'continuing' && sy(t.env).length === 1 && sy(t.env)[0].ms === 60000 && JSON.parse(t.env.props.SAP_AUTO).kind === 'sync', sj([r.auto, t.env.state.triggers.map(x => x.fn), t.env.props.SAP_AUTO]));
    ok('...it does not use the daily-run continue trigger', !t.env.state.triggers.some(x => x.fn === 'sapContinueTrigger_'));
    ok('...sapStatus reports it as waiting, not stale', (() => { const a = t.env.call('sapStatus').status.auto; return a && a.kind === 'sync' && a.waiting === true && a.stale === false; })());
    t.env.setEmail(''); let n = 0; while (sy(t.env).length && n++ < 80) t.env.ctx.sapSyncAutoTrigger_(); t.env.setEmail(SUPER);
    ok('...the chain finishes the sync, removes its trigger and record, and nothing is left behind', 'sapstage/man_2026-10' in t.env.stored() && sy(t.env).length === 0 && !t.env.props.SAP_AUTO && !t.env.props.SAP_CURSOR && t.env.state.triggers.length === 0, sj([t.env.state.triggers, t.env.props.SAP_AUTO]));
    const u = mk({}, { SAP_AUTO_MAX_RUNS: '2' }); runAll(u.env, 'sapShadowRun'); u.env.call('sapSyncAuto'); u.env.setEmail(''); let m = 0; while (sy(u.env).length && m++ < 40) u.env.ctx.sapSyncAutoTrigger_(); u.env.setEmail(SUPER);
    ok('the sync chain stops after SAP_AUTO_MAX_RUNS runs, removes its trigger and says how to carry on (the position is kept)', sy(u.env).length === 0 && !u.env.props.SAP_AUTO && /Stopped after 2 automatic runs.*sapSyncAuto/.test(u.env.call('sapStatus').status.message) && !!u.env.props.SAP_CURSOR, u.env.call('sapStatus').status.message);
    const v = mk(); runAll(v.env, 'sapShadowRun'); v.env.call('sapSyncAuto'); v.env.state.triggers = [];
    const sv = v.env.call('sapStatus').status; ok('a killed sync chain (record, no trigger, no run) is reported stale and names sapSyncAuto', sv.auto && sv.auto.stale === true && /sapSyncAuto/.test(sv.next), sj(sv.auto));
    const w = mk(); runAll(w.env, 'sapShadowRun'); w.env.call('sapSyncAuto'); w.S.failNext(/BillingDocument/, 500, 9999); w.env.setEmail(''); w.env.ctx.sapSyncAutoTrigger_(); w.env.setEmail(SUPER);
    ok('an error in a continued sync removes the trigger and the record and keeps the position', sy(w.env).length === 0 && !w.env.props.SAP_AUTO && !!w.env.props.SAP_CURSOR);
    const x2 = mk(); x2.env.call('sapShadowRunAuto'); const rr = x2.env.call('sapSyncAuto'); ok('a sync chain cannot be started over a waiting shadow chain', rr.ok === false && /automatic shadow run is waiting/.test(rr.message) && x2.env.state.triggers.filter(y => y.fn === 'sapShadowAutoTrigger_').length === 1);
    const y2 = mk(); runAll(y2.env, 'sapShadowRun'); y2.env.call('sapSyncAuto'); const r4 = y2.env.call('sapShadowRunAuto'); ok('...and the other way round', r4.ok === false && /automatic sync is waiting/.test(r4.message));
    const z = build({ docs: docs0(), plants: [] }); z.env.props.SAP_STATUS = JSON.stringify({ verify: JSON.parse(z.env.props.SAP_STATUS).verify, shadow: { at: 'x', ym: '2026-10', clean: true } }); const c0 = z.S.calls.length;
    const q1 = z.env.call('sapSync'), q2 = z.env.call('sapSyncAuto');
    ok('sapSync and sapSyncAuto refuse to start when the Desk has no active plants: no SAP call, nothing staged, no trigger', q1.ok === false && /no active plants/.test(q1.message) && q2.ok === false && /no active plants/.test(q2.message) && z.S.calls.length === c0 && z.env.state.triggers.length === 0 && !z.env.props.SAP_RUN && !Object.keys(z.env.stored()).some(k => k.startsWith('sapstage/')), sj([q1, q2]).slice(0, 300));
  }
}

/* ---------- 7. paging that survives documents changing between runs ---------- */
{
  for (const conc of ['1', '4']) {
    const docs = docs0(); const { S, env } = build({ docs, s4opts: { pageCap: 20, msPerCall: 20000 }, props: { SAP_RUN_BUDGET_MS: '170000', SAP_CONCURRENCY: conc } });
    runAll(env, 'sapShadowRun');
    const oct = docs.filter(d => iso(d) === '2026-10' && d.BillingDocumentType === 'F2' && !d.BillingDocumentIsCancelled && d.CompanyCode === '1000');
    const keep = new Set(oct.filter(d => d.to_Item.results.some(it => +it.Plant <= 1049 && it.BillingQuantityUnit === 'PC')).filter((d, i) => i % 5 !== 1 && i % 7 !== 2).map(d => d.BillingDocument));      // documents that stay untouched the whole time
    let step = 0, r = env.call('sapSync'); const seenStates = [];
    while (r.ok && r.done === false && step < 40) {
      step++; seenStates.push(!!env.call('sapStatus').status.resume);
      // between runs: remove some low-numbered documents (already read), cancel some, add new ones above the highest number, add one below
      const low = docs.findIndex(d => iso(d) === '2026-10' && !keep.has(d.BillingDocument) && d.BillingDocumentType === 'F2' && !d.BillingDocumentIsCancelled);
      if (low >= 0 && step % 2) docs.splice(low, 1);
      const cand = docs.find(d => d.BillingDocumentType === 'F2' && !keep.has(d.BillingDocument) && !d.BillingDocumentIsCancelled && iso(d) === '2026-10'); if (cand) { cand.BillingDocumentIsCancelled = true; cand.LastChangeDate = cand.BillingDocumentDate; }
      const extra = synthDocs({ masters, from: '2026-10-20', to: '2026-10-20', plants: PLANTS, perDayPerPlant: 2, extras: false, startNo: 95000000 + step * 100 }); extra.forEach(d => docs.push(d));
      r = env.call('sapSync');
    }
    const st = env.stored(), man = JSON.parse(st['sapstage/man_2026-10'] || 'null');
    const rows = (() => { const out = []; for (let i = 0; i < man.n; i++) { const c = JSON.parse(st['sapstage/c_2026-10_' + man.run + '_' + i]); out.push(...JSON.parse(zl(c.z))); } return out; })();
    const keys = rows.map(x => x[0] + '|' + x[1]);
    ok('documents added, removed and cancelled between runs (concurrency ' + conc + '): the run never errors, keeps its position through ' + step + ' runs and finishes', r.ok && r.done && step >= 2 && seenStates.every(Boolean), sj([r.code, r.message, step]));
    ok('  ...no line is staged twice', new Set(keys).size === keys.length, keys.length + ' vs ' + new Set(keys).size);
    const have = new Set(rows.map(x => x[0]));
    const lost = [...keep].filter(id => !have.has(id.replace(/^0+/, '')));
    ok('  ...every document that stayed untouched was read (none skipped by the changes)', lost.length === 0, lost.length + ' missing, e.g. ' + lost.slice(0, 3));
    const w = env.call('sapStatus').status.warnings;
    ok('  ...if the count moved, it is a warning with both numbers, not an error', (w || []).length === 0 || /SAP counted \d+ when the month was started.*read \d+\./.test(w[w.length - 1].msg), sj(w));
    // the released reader on the same scenario, for the record (not asserted to fail: it depends on where the cuts fall)
    const d2 = docs0(); const o = build({ docs: d2, old: true, s4opts: { pageCap: 20, msPerCall: 20000 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); runAll(o.env, 'sapShadowRun');
    let ro = o.env.call('sapSync'), k = 0; while (ro.ok && ro.done === false && k++ < 40) { const low = d2.findIndex(d => iso(d) === '2026-10' && !keep.has(d.BillingDocument) && d.BillingDocumentType === 'F2' && !d.BillingDocumentIsCancelled); if (low >= 0 && k % 2) d2.splice(low, 1); ro = o.env.call('sapSync'); }
    console.log('INFO | released reader, same removals: ok=' + ro.ok + ' code=' + (ro.code || '') + (ro.message ? ' msg=' + String(ro.message).slice(0, 110) : ''));
  }
  { // a count mismatch alone (documents appear while a month is read) never wipes the cursor of a shadow run
    const docs = docs0(); const { env } = build({ docs, s4opts: { pageCap: 20, msPerCall: 20000 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); let r = env.call('sapShadowRun'); const cur0 = env.props.SAP_CURSOR_SHADOW;
    ok('a stopped shadow run keeps a cursor', r.done === false && !!cur0);
    docs.splice(0, 40); r = env.call('sapShadowRun'); ok('documents removed in between: the cursor is still used (resumed), not cleared', r.ok && (r.resumed === true || r.done === false), sj(r).slice(0, 200));
    let n = 0; while (r.ok && !r.done && n++ < 40) r = env.call('sapShadowRun'); ok('...and it finishes with a warning, not an error', r.ok && r.done);
  }
  { // a read position saved by the older $skip paging cannot be continued by key: the month starts again with clean counts (no double counting)
    const docs = docs0(); const o = build({ docs, old: true, s4opts: { pageCap: 20, msPerCall: 20000 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); const r0 = o.env.call('sapShadowRun'); const legacy = o.env.props.SAP_CURSOR_SHADOW;
    const { env } = build({ docs: docs0(), props: {} }); env.props.SAP_CURSOR_SHADOW = legacy; const r = runAll(env, 'sapShadowRun');
    ok('an older cursor (skip paging, partial tally) is not continued: same totals as a clean read, no double counting', r0.done === false && JSON.parse(legacy).skip > 0 && r.ok && r.done && feedOf(r) === base.feed, feedOf(r).slice(0, 120));
  }
}
import zlib from 'zlib';
function zl(z) { return zlib.gunzipSync(Buffer.from(z, 'base64')).toString(); }

/* ---------- 8. why would a shadow run count nothing? per-reason drop counts ---------- */
{
  let t = build({ docs: docs0(), plants: ['1001'] }); let r = t.env.call('sapShadowRun');
  ok('plants missing from the store: counted per reason with the plant codes seen', r.done && r.drops.plantNotInStore > 0 && r.drops.counted > 0 && r.dropExamples.plantNotInStore['1013'] > 0 && r.dropExamples.plantNotInStore['1021'] > 0 && /plantNotInStore \d+ \(/.test(r.message), sj([r.drops, r.dropExamples]));
  ok('the log line carries the reasons', (t.env.state.logs || []).some(l => /^SAP \{"fn":"sapShadowRun".*"drops":\{/.test(l)));
  t = build({ docs: docs0(), plants: [] }); const c0 = t.S.calls.length; r = t.env.call('sapShadowRun');
  ok('an empty Desk plants list: the shadow run refuses to start, says why, reads nothing and writes nothing', r.ok === false && /no active plants/.test(r.message) && t.S.calls.length === c0 && !t.env.props.SAP_RUN && !t.env.props.SAP_CURSOR_SHADOW, sj(r).slice(0, 250));
  ok('...also through the automatic run: no trigger is installed', t.env.call('sapShadowRunAuto').ok === false && t.env.state.triggers.length === 0);
  t = build({ docs: docs0(), plants: ['1001'] }); t.env.call('deskWrite', [[set('plants', '1001', { plant_code: '1001', plant_name: 'x', plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'x', business: 'laminates', active: false })]]);
  ok('only inactive plants counts as empty too', t.env.call('sapShadowRun').ok === false);
  const m2 = { products: Object.fromEntries(Object.keys(masters.products).map(k => [k, { type: 'FERT', mg3: 'LAM', mg4: '8X4' }])), customers: masters.customers };
  t = build({ docs: docs0(), s4opts: { products: m2.products } }); r = t.env.call('sapShadowRun');
  ok('product types that are not sheet groups: noProductGroup with the type seen (FERT)', r.done && r.drops.noProductGroup > 1000 && r.dropExamples.noProductGroup.FERT > 1000 && !r.drops.counted && /WARNING/.test(r.message), sj([r.drops, r.dropExamples]));
  t = build({ docs: docs0(), s4opts: { products: {} } }); r = t.env.call('sapShadowRun');
  ok('product lookups that return nothing: shown as "(no product type)"', r.done && r.dropExamples.noProductGroup && r.dropExamples.noProductGroup['(no product type)'] > 1000, sj(r.dropExamples));
  t = build({ docs: docs0() }); const lines0 = (() => { const rr = t.env.call('sapShadowRun'); return rr; })();
  ok('a normal run: counted lines match the register rows and nothing unexplained is left out', lines0.drops.counted > 3000 && !lines0.dropExamples.plantNotInStore && !/WARNING/.test(lines0.message), sj(lines0.drops));
  ok('the cursor of a stopped run holds the drop counts so far', (() => { const q = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); q.env.call('sapShadowRun'); const c = JSON.parse(q.env.props.SAP_CURSOR_SHADOW); return c.drops && c.drops.counted > 0 && c.sl && c.sl.length >= 1 && q.env.props.SAP_CURSOR_SHADOW.length < 3000; })());
}

/* ---------- 9. lookups: cache in bulk, parallel batches ---------- */
{
  const t = build({ docs: docs0(), props: { SAP_LOOKUP_BATCH: '10' } }); t.env.call('sapShadowRun');
  const lk = t.S.calls.filter(c => /A_Product|A_Customer/.test(c.path));
  ok('lookups: SAP_LOOKUP_BATCH keys per call (10 here), at most 2x rows asked', lk.length > 0 && lk.every(c => (dq(c).match(/ eq /g) || []).length <= 10), lk.length);
  ok('the script cache is read and written in bulk (getAll / putAll), 100 keys at most', t.env.state.cacheGetAll > 0 && t.env.state.cachePutAll > 0);
  const n0 = t.S.calls.length; t.env.call('sapShadowRun'); ok('a second run finds the lookups in the cache: no product or customer call', t.S.calls.slice(n0).filter(c => /A_Product|A_Customer/.test(c.path)).length === 0);
}

/* ---------- 10. a read position can never be lost without a word ---------- */
{
  const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } });
  const rs = []; for (let i = 0; i < 4; i++) rs.push(t.env.call('sapShadowRun'));
  const lines = (t.env.state.logs || []).filter(l => /^SAP \{"fn":"sapShadowRun"/.test(l)).map(l => JSON.parse(l.slice(4)));
  ok('every run line says resumed true/false with skip, total and run number', lines.length === 4 && lines.every(l => typeof l.resumed === 'boolean' && 'skip' in l && 'total' in l && typeof l.run === 'number'), sj(lines.slice(0, 2)));
  ok('the first run says resumed=false and why; later runs say resumed=true, from the place the last one ended, run 2, 3, 4', lines[0].resumed === false && /no saved read position/.test(lines[0].why) && lines.slice(1).every((l, i) => l.resumed === true && l.run === i + 2 && l.skip > (i ? lines[i].skip : 0)), sj(lines.map(l => [l.resumed, l.skip, l.total, l.run])));
  const rl = t.env.call('sapStatus').status.runLog;
  ok('sapStatus keeps a run log: from, to, total, resumed for the last runs, and each "from" is the previous "to"', rl.length === 4 && rl.slice(1).every((e, i) => e.resumed && e.from === rl[i].to), sj(rl));
  ok('the progress log line also states resumed and the range', (t.env.state.logs || []).some(l => /^SAP-PROGRESS .* resumed=true \(continuing the saved position\) from \d+ to \d+ of \d+ units/.test(l)));
}
{
  const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); t.env.call('sapShadowRun'); const cur = t.env.props.SAP_CURSOR_SHADOW;
  t.env.props.SAP_CURSOR_SHADOW = cur.slice(0, 120); const c0 = t.S.calls.length; const r = t.env.call('sapShadowRun');
  ok('an unreadable saved position is an error that keeps it, never a silent fresh start', r.ok === false && /cannot be read/.test(r.message) && t.env.props.SAP_CURSOR_SHADOW === cur.slice(0, 120) && t.S.calls.length === c0, sj(r).slice(0, 250));
  ok('...the same for the sync position', (() => { const u = build({ docs: docs0() }); runAll(u.env, 'sapShadowRun'); u.env.props.SAP_CURSOR = '{oops'; const x = u.env.call('sapSync'); return x.ok === false && /cannot be read/.test(x.message) && u.env.props.SAP_CURSOR === '{oops'; })());
  const rr = t.env.call('sapResetCursors'); ok('sapResetCursors discards it on request, and says so', rr.ok && rr.removed === 1 && /discarded on request/.test(rr.message) && !t.env.props.SAP_CURSOR_SHADOW);
  const r2 = t.env.call('sapShadowRun'); ok('then the run starts from the beginning and says why', r2.ok && r2.resume.resumed === false && /no saved read position/.test(r2.resume.reason));
  t.env.setEmail('se@virgoasia.com'); ok('sapResetCursors is refused for a non-admin', t.env.call('sapResetCursors').ok === false);
}
{
  const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); t.env.call('sapShadowRun');
  const r = t.env.call('sapShadowRun'); ok('sapShadowRun() with no month resumes the saved month', r.resume.resumed === true);
  const before = t.env.props.SAP_CURSOR_SHADOW, c0 = t.S.calls.length, r3 = t.env.call('sapShadowRun', ['2026-11']);
  ok('asking for another month while one is part-way is refused, names the month in progress, says how to reset, and keeps the position untouched', r3.ok === false && r3.code === 'invalid_argument' && /shadow run for 2026-10 is part-way/.test(r3.message) && /sapResetCursors/.test(r3.message) && /sapShadowRunAuto\(\)/.test(r3.message) && t.env.props.SAP_CURSOR_SHADOW === before && t.S.calls.length === c0, sj(r3).slice(0, 300));
  const ra = t.env.call('sapShadowRunAuto', ['2026-11']); ok('...also through sapShadowRunAuto, which then installs no trigger and leaves the position alone', ra.ok === false && /part-way/.test(ra.message) && t.env.props.SAP_CURSOR_SHADOW === before && t.env.state.triggers.length === 0 && !t.env.props.SAP_AUTO);
  { const u = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); u.env.call('sapShadowRunAuto'); const trig = u.env.state.triggers.length, au = u.env.props.SAP_AUTO; u.env.call('sapShadowRunAuto', ['2026-11']);
    ok('...and an automatic chain that is waiting is not disturbed by the refused call', u.env.state.triggers.length === trig && u.env.props.SAP_AUTO === au); }
  const rs = t.env.call('sapResetCursors'); const r5 = t.env.call('sapShadowRun', ['2026-11']); ok('after sapResetCursors the other month can be started', rs.ok && r5.ok && r5.resume.resumed === false, sj(r5.resume));
  { const u = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); u.env.call('sapShadowRun'); const r6 = u.env.call('sapShadowRun', ['2026-10']); ok('asking for the month in progress by name resumes it', r6.ok && r6.resume.resumed === true, sj(r6.resume)); }
}
{ // errors never touch the saved position
  const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); t.env.call('sapShadowRun'); const cur = t.env.props.SAP_CURSOR_SHADOW;
  for (const [code, thr] of [[500, false], [401, false], [403, false], [404, false], [0, true]]) { t.S.fails = []; t.S.failNext(/BillingDocument/, code, 9999, thr ? { throw: true } : {}); const r = t.env.call('sapShadowRun'); ok('a failed run (' + (thr ? 'timeout' : 'HTTP ' + code) + ') leaves the saved position exactly as it was', r.ok === false && t.env.props.SAP_CURSOR_SHADOW === cur, r.code); }
  t.S.fails = []; const r = t.env.call('sapShadowRun'); ok('and the next run resumes from it', r.ok && r.resume.resumed === true && r.resume.skip === JSON.parse(cur).skip);
}

/* ---------- 11. QA round: lookups respect the run budget; watchdog; shape B whole-document page; documents behind the cursor; few-lines warning ---------- */
{ // 11a. realistic masters (800 products, 3,000 customers), 25 s per call: no run goes near Google's 6 minutes, every run makes progress, totals match the released reader
  const big = synthMasters(7, 800, 3000);
  const dBig = synthDocs({ masters: big, from: '2026-10-01', to: '2026-10-31', perDayPerPlant: 90, extras: true });
  const mk = (old, extra = {}) => { const S = makeS4(Object.assign({ docs: dBig, products: big.products, customers: big.customers }, extra)); const env = makeEnv({ fetch: (u, o, st) => S.fetch(u, o, st), sapFile: old ? OLD : undefined });
    env.call('deskWrite', [[set('users', 'u1', { email: SUPER, role: 'Super admin', active: true, name: 'V' }), ...PLANTS.map(p => set('plants', p, { plant_code: p, plant_name: 'D', plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'D', business: 'laminates', active: true }))]]);
    Object.assign(env.props, { SAP_BASE_URL: S.host, SAP_USER: S.user, SAP_PASSWORD: S.password, SAP_SYNC_ENABLED: 'yes' }); env.props.SAP_STATUS = JSON.stringify({ verify: { at: '2026-11-08T06:00:00.000Z', ok: true, failed: false, gaps: 0, optionalGaps: 0, checked: 29, shape: 'A' } }); env.setEmail(SUPER); return { S, env }; };
  const n = mk(false, { msPerCall: 25000 }), secs = []; let r, k = 0;
  do { const s0 = n.env.state.skew; r = n.env.call('sapShadowRun'); secs.push(Math.round((n.env.state.skew - s0) / 1000)); k++; } while (r.ok && !r.done && k < 40);
  ok('25 s per call, 800 products, 3,000 customers: finishes, and no run is longer than 330 s (Google ends a run at 360 s)', r.ok && r.done && Math.max(...secs) <= 330 && k >= 2, sj(secs));
  ok('...every run before the last stopped with the read position saved (lookups cached across runs)', secs.length > 1 && n.env.state.cachePutAll > 5);
  const o = mk(true); const ro = runAll(o.env, 'sapShadowRun', [], 60);
  ok('...and the totals equal the released reader on the same data', ro.ok && ro.done && feedOf(r) === feedOf(ro), feedOf(r).slice(0, 100));
  console.log('INFO | 25 s per call, realistic masters, one month of ' + dBig.length + ' documents: ' + k + ' runs, seconds per run ' + secs.join('+'));
  // a round whose lookups cannot be finished is put back whole: counts not half added
  const q = mk(false, { msPerCall: 25000 }); q.env.props.SAP_RUN_BUDGET_MS = '60000'; let rr = q.env.call('sapShadowRun'); const c1 = JSON.parse(q.env.props.SAP_CURSOR_SHADOW);
  ok('a run whose first round needs more lookups than the budget allows saves a clean position (no half-counted round) and says not done', rr.ok && rr.done === false && c1.cnt.headers === 0 && c1.skip === 0 && (c1.sl || []).every(s => s.n === 0 && !s.last), sj(c1).slice(0, 300));
  q.env.props.SAP_RUN_BUDGET_MS = '300000'; let j = 0; while (rr.ok && !rr.done && j++ < 60) rr = q.env.call('sapShadowRun'); ok('...and later runs finish it with the same totals', rr.ok && rr.done && feedOf(rr) === feedOf(r), j);
}
{ // 11b. watchdog and stale auto state
  const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); let during = null; const orig = t.S.fetch;
  t.S.fetch = (u, o, e) => { if (!during) during = t.env.state.triggers.filter(x => x.fn === 'sapShadowAutoTrigger_').map(x => x.ms); return orig(u, o, e); };
  const r = t.env.call('sapShadowRunAuto');
  ok('while a run is going, a watchdog trigger is already waiting (after the run flag would have gone stale), so a run killed by Google is continued', sj(during) === sj([510000]), sj(during));
  ok('when the run ends normally the watchdog is replaced by the 60 s trigger', r.done === false && t.env.state.triggers.filter(x => x.fn === 'sapShadowAutoTrigger_').length === 1 && t.env.state.triggers[0].ms === 60000);
  // simulate a kill: the trigger fired (removed) and the run never finished
  t.env.state.triggers = []; const st = t.env.call('sapStatus').status;
  ok('a SAP_AUTO left with no trigger and no run is reported as stale, with what to do', st.auto && st.auto.stale === true && /sapShadowRunAuto/.test(st.next), sj(st.auto) + st.next);
  const r2 = t.env.call('sapShadowRunAuto'); ok('sapShadowRunAuto then carries on from the saved position', r2.ok && r2.resume.resumed === true, sj(r2.resume));
  // sync watchdog
  const u = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); runAll(u.env, 'sapShadowRun'); let dur2 = null; const o2 = u.S.fetch;
  u.S.fetch = (url, o, e) => { if (!dur2) dur2 = u.env.state.triggers.filter(x => x.fn === 'sapSyncAutoTrigger_').map(x => x.ms); return o2(url, o, e); };
  u.env.call('sapSyncAuto'); ok('sapSyncAuto also has a watchdog while it runs', sj(dur2) === sj([510000]), sj(dur2));
  u.S.fails = []; const v = build({ docs: docs0(), props: {} }); runAll(v.env, 'sapShadowRun'); v.S.failNext(/BillingDocument/, 500, 9999); v.env.call('sapSyncAuto');
  ok('an error in the sync chain removes the watchdog too', !v.env.state.triggers.some(x => x.fn === 'sapSyncAutoTrigger_'));
}
{ // 11c. shape B: a page that is one whole document is read completely
  const d = docs0(); const bigDoc = JSON.parse(JSON.stringify(d.find(x => x.CompanyCode === '1000' && x.BillingDocumentType === 'F2' && !x.BillingDocumentIsCancelled && iso(x) === '2026-10')));
  bigDoc.BillingDocument = '0090900001'; const it0 = bigDoc.to_Item.results[0]; bigDoc.to_Item.results = Array.from({ length: 35 }, (_, i) => Object.assign({}, it0, { BillingDocumentItem: String((i + 1) * 10).padStart(6, '0') }));
  const exact = JSON.parse(JSON.stringify(bigDoc)); exact.BillingDocument = '0090900002'; exact.to_Item.results = exact.to_Item.results.slice(0, 10);
  d.push(bigDoc, exact);
  const A = build({ docs: d, props: {} }); const ra = runAll(A.env, 'sapShadowRun');
  for (const [name, props, s4] of [['page 10', { SAP_PAGE_TOP: '10', SAP_CONCURRENCY: '1' }, {}], ['page 10, 4 at once', { SAP_PAGE_TOP: '10' }, {}], ['page 10, server cap 7', { SAP_PAGE_TOP: '10' }, { pageCap: 7 }]]) {
    const B = build({ docs: d, props: Object.assign({ SAP_BILLING_SHAPE: 'B' }, props), s4opts: s4 }); const rb = runAll(B.env, 'sapShadowRun');
    ok('shape B, a 35-item document and a 10-item one on pages of 10 (' + name + '): same totals as shape A, no item skipped', rb.ok && rb.done && feedOf(rb) === feedOf(ra), feedOf(rb).slice(0, 100) + ' vs ' + feedOf(ra).slice(0, 100));
  }
}
{ // 11d. a document numbered behind the cursor while a month takes several runs
  const docs = docs0(); const { env } = build({ docs, s4opts: { pageCap: 20, msPerCall: 20000 }, props: { SAP_RUN_BUDGET_MS: '170000', SAP_CONCURRENCY: '1' } });
  runAll(env, 'sapShadowRun'); env.call('sapShadowRun'); let r = env.call('sapShadowRun');
  const late = JSON.parse(JSON.stringify(docs.find(x => x.CompanyCode === '1000' && x.BillingDocumentType === 'F2' && !x.BillingDocumentIsCancelled && iso(x) === '2026-10'))); late.BillingDocument = '0010000007'; docs.push(late);   // lower than everything read so far
  let n = 0; while (r.ok && !r.done && n++ < 40) r = env.call('sapShadowRun');
  const w = env.call('sapStatus').status.warnings;
  ok('a document numbered behind the read position is not read, and the month-end check warns with the counts (SAP counts N, read N-1)', r.ok && r.done && w.length >= 1 && /Differs in numbers first to last: SAP counts (\d+), read (\d+)/.test(w[w.length - 1].msg) && (() => { const m = /SAP counts (\d+), read (\d+)/.exec(w[w.length - 1].msg); return +m[1] === +m[2] + 1; })(), sj(w));
}
{ // 11e. very few lines counted also warns
  const m = synthMasters(7); const d5 = synthDocs({ masters: m, from: '2026-10-01', to: '2026-10-31', plants: ['1001', '1002', '1003', '1004', '1005'], perDayPerPlant: 8 });
  const t = build({ docs: d5, plants: ['1001'] }); const r = t.env.call('sapShadowRun');
  ok('under a quarter of the lines counted: WARNING with both numbers (not only when zero)', r.done && /WARNING: only \d+ of the \d+ lines SAP sent were counted/.test(r.message), r.message.slice(0, 400));
  const t2 = build({ docs: docs0() }); ok('...and a normal run does not warn', !/WARNING/.test(t2.env.call('sapShadowRun').message));
}

{ // the WARNING survives the 160-character msg cut of the log line: own field
  const m = synthMasters(7); const d5 = synthDocs({ masters: m, from: '2026-10-01', to: '2026-10-31', plants: ['1001', '1002', '1003', '1004', '1005'], perDayPerPlant: 8 });
  const t = build({ docs: d5, plants: ['1001'] }); const r = t.env.call('sapShadowRun'); const line = (t.env.state.logs || []).filter(l => /^SAP \{"fn":"sapShadowRun"/.test(l)).map(l => JSON.parse(l.slice(4))).pop();
  ok('the log line carries the low-count WARNING in its own field (not cut by msg)', /WARNING/.test(r.message) && line && /^WARNING: only \d+ of the \d+ lines SAP sent were counted/.test(line.warn) && line.msg.length <= 160, sj(line).slice(0, 400));
  const t2 = build({ docs: docs0() }); t2.env.call('sapShadowRun'); const l2 = (t2.env.state.logs || []).filter(l => /^SAP \{"fn":"sapShadowRun"/.test(l)).map(l => JSON.parse(l.slice(4))).pop(); ok('a normal run has no warn field', l2 && !('warn' in l2));
}
{ // wording: 5-minute budget, the auto function named
  const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: { SAP_RUN_BUDGET_MS: '170000' } }); runAll(t.env, 'sapShadowRun'); t.env.call('sapSync');
  const nx = t.env.call('sapStatus').status.next, msg = t.env.call('sapStatus').status.message;
  ok('a sync cut at the run limit: sapStatus names the 5-minute run limit (not 6 minutes) and sapSyncAuto', /5-minute run limit/.test(nx) && /sapSyncAuto/.test(nx) && !/6-minute/.test(nx) && /sapSyncAuto/.test(msg), nx + ' | ' + msg);
}

{ // round 3: a refused automatic call never touches a waiting chain, its record or the saved position
  const snap = (env) => sj([env.state.triggers.map(y => [y.fn, y.ms]), env.props.SAP_AUTO, env.props.SAP_CURSOR_SHADOW, env.props.SAP_CURSOR || '', env.props.SAP_RUN || '']);
  const off = (t) => t.env.call('deskWrite', [PLANTS.map(p => set('plants', p, { plant_code: p, plant_name: 'x', plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'x', business: 'laminates', active: false }))]);
  const live = (extra = {}) => { const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: Object.assign({ SAP_RUN_BUDGET_MS: '170000' }, extra) }); const r = t.env.call('sapShadowRunAuto'); if (!(r.ok && r.done === false)) throw new Error('setup of the waiting chain failed'); return t; };
  const cases = [
    ['no active plants', off, /no active plants/],
    ['a month in progress (different month asked)', null, /part-way/, ['2026-11']],
    ['an invalid month', null, /or later only/, ['2025-01']],
    ['the verify gate failing', (t) => { t.env.props.SAP_STATUS = JSON.stringify({ verify: { at: 'x', ok: false, failed: true, error: 'x' } }); }, /did not finish/],
    ['a missing SAP setting', (t) => { delete t.env.props.SAP_PASSWORD; }, /Missing Script Properties/],
    ['an unreadable saved position', (t) => { t.env.props.SAP_CURSOR_SHADOW = '{broken'; }, /cannot be read/],
  ];
  for (const [name, pre, re, args] of cases) {
    const t = live(); if (pre) pre(t); const before = snap(t.env), c0 = t.S.calls.length;
    const r = t.env.call('sapShadowRunAuto', args || []); const r2 = t.env.call('sapSyncAuto');
    ok('refused sapShadowRunAuto (' + name + '): triggers, SAP_AUTO, cursor and run flag exactly as before; no SAP call', r.ok === false && re.test(r.message) && snap(t.env) === before && t.S.calls.length === c0, sj([r.code, r.message, r2.code]).slice(0, 300));
    ok('  ...the waiting chain still has its one trigger and its record', t.env.state.triggers.filter(y => y.fn === 'sapShadowAutoTrigger_').length === 1 && JSON.parse(t.env.props.SAP_AUTO).kind === 'shadow');
    ok('  ...and sapSyncAuto in the same state is refused too without touching them', r2.ok === false && snap(t.env) === before);
  }
  { // sync side: a waiting sync chain, then each refusal
    const mkSync = (extra = {}) => { const t = build({ docs: docs0(), s4opts: { msPerCall: 20000, pageCap: 25 }, props: Object.assign({ SAP_RUN_BUDGET_MS: '170000' }, extra) }); runAll(t.env, 'sapShadowRun'); const r = t.env.call('sapSyncAuto'); if (!(r.ok && r.done === false)) throw new Error('sync chain setup failed'); return t; };
    for (const [name, pre, re] of [['no active plants', off, /no active plants/], ['sync switched off', (t) => { t.env.props.SAP_SYNC_ENABLED = 'no'; }, /switched off/], ['an unreadable sync position', (t) => { t.env.props.SAP_CURSOR = '{broken'; }, /cannot be read/]]) {
      const t = mkSync(); pre(t); const before = snap(t.env), c0 = t.S.calls.length; const r = t.env.call('sapSyncAuto');
      ok('refused sapSyncAuto (' + name + '): the waiting sync chain, its record and the position are untouched; no SAP call', r.ok === false && re.test(r.message) && snap(t.env) === before && t.S.calls.length === c0 && t.env.state.triggers.filter(y => y.fn === 'sapSyncAutoTrigger_').length === 1, sj([r.code, r.message]).slice(0, 300));
    }
  }
  { // the month is named from the feed start, not hard-coded
    const t = build({ docs: docs0() }); t.env.props.SAP_STATUS = JSON.stringify({ verify: JSON.parse(t.env.props.SAP_STATUS).verify });
    const a = t.env.call('sapStatus').status.next; t.env.ctx.SAP_FEED_FROM = '2027-01-01'; const b = t.env.call('sapStatus').status.next; t.env.ctx.SAP_FEED_FROM = '2026-10-01';
    ok('sapStatus names the month from the feed start (October 2026 now, January 2027 if the start moves)', /\(October 2026,/.test(a) && /\(January 2027,/.test(b), a.slice(0, 120) + ' | ' + b.slice(0, 120));
  }
}

console.log('TOTAL ' + res.filter(l => l.startsWith('PASS')).length + ' PASS ' + res.filter(l => l.startsWith('FAIL')).length + ' FAIL');
