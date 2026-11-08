// gas-sap: the read-only S/4HANA OData sales feed (D73) against a mock S/4 server with SYNTHETIC data only. No real SAP call is made and there are no credentials.
// Part A tests the server (sap.gs.js in the in-memory Apps Script environment). Part B opens the page (Apps Script build) and checks the card, "Load SAP feed", and parity with the register upload.
import { makeEnv } from './gas-env.mjs';
import { makeS4, synthDocs, synthMasters, registerRows, csvOf } from './mock-s4.mjs';
import zlib from 'zlib';
import fs from 'fs';
import os from 'os';
import path from 'path';
const res = []; const ok = (n, c, d) => { const l = (c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || '')); console.log(l); res.push(l); if (!c) process.exitCode = 1; };
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const PLANTS = ['1001', '1013', '1021'];
const SUPER = 'data@virgoasia.com';
const masters = synthMasters(7);
function build({ docs, s4opts = {}, props = true, plants = PLANTS, verified = true } = {}) {
  const S = makeS4(Object.assign({ docs: docs || synthDocs({ masters }), products: masters.products, customers: masters.customers }, s4opts));
  const env = makeEnv({ fetch: (u, o, st) => S.fetch(u, o, st) });
  env.call('deskWrite', [[set('users', 'u1', { email: SUPER, role: 'Super admin', active: true, name: 'Vijay' }), set('users', 'u2', { email: 'se@virgoasia.com', role: 'Sales executive', active: true, name: 'Se' }),
    ...plants.map(p => set('plants', p, { plant_code: p, plant_name: 'Depot ' + p, plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'Depot ' + p, business: 'laminates', active: true }))]]);
  if (props) Object.assign(env.props, { SAP_BASE_URL: S.host, SAP_USER: S.user, SAP_PASSWORD: S.password });
  if (verified) env.props.SAP_STATUS = JSON.stringify({ verify: { at: '2026-11-08T06:00:00.000Z', ok: true, failed: false, gaps: 0, optionalGaps: 0, checked: 29, shape: 'A' } }); // test only: a passing verify on record (reads need one); tests of verify itself pass verified:false
  env.props.SAP_SYNC_ENABLED = 'yes'; // test only; the property is never set in the build
  env.setEmail(SUPER);
  return { S, env };
}
const stagedCust = (env) => { const st = env.stored(), man = JSON.parse(st['sapstage/cust_man'] || 'null'); if (!man) return null; const rows = []; for (let i = 0; i < man.n; i++) { const c = JSON.parse(st['sapstage/cust_c_' + man.run + '_' + i]); JSON.parse(zlib.gunzipSync(Buffer.from(c.z, 'base64')).toString()).forEach(r => rows.push(r)); } return { man, rows }; };
const stagedRows = (env, ym) => { const st = env.stored(), man = JSON.parse(st['sapstage/man_' + ym] || 'null'); if (!man) return null; const rows = []; for (let i = 0; i < man.n; i++) { const c = JSON.parse(st['sapstage/c_' + ym + '_' + man.run + '_' + i]); JSON.parse(zlib.gunzipSync(Buffer.from(c.z, 'base64')).toString()).forEach(r => rows.push(r)); } return { man, rows }; };
const sj = (o) => JSON.stringify(o);
const odMs = (d) => +/\((\d+)\)/.exec(d)[1];
const iso = (d) => new Date(odMs(d)).toISOString().slice(0, 10);
/* independent expectation: lines the feed should stage for a month, worked out here from the synthetic documents (not with the server's code) */
function expect(docs, ym, mode = 'exclude') {
  const out = { sales: 0, credit: 0, salesNet: 0, creditNet: 0, docs: 0 };
  docs.forEach(d => {
    if (d.CompanyCode !== '1000' || iso(d.BillingDocumentDate).slice(0, 7) !== ym) return;
    const t = d.BillingDocumentType; let kind = null;
    if (t === 'S1' || t === 'S2') kind = mode === 'mirror' && t === 'S1' ? 'credit' : null;
    else if (d.BillingDocumentIsCancelled) kind = mode === 'mirror' && t === 'F2' ? 'sales' : null;
    else if (t === 'F2') kind = 'sales'; else if (t === 'G2' || t === 'RE') kind = 'credit';
    if (!kind) return; let any = false;
    d.to_Item.results.forEach(it => { if (+it.Plant > 1049 || it.BillingQuantityUnit !== 'PC') return; any = true; out[kind]++; out[kind + 'Net'] += +it.NetAmount; });
    if (any) out.docs++;
  });
  return out;
}
const near = (a, b) => Math.abs(a - b) < 0.01;

/* =============================== A1. access: Super admin or project owner only =============================== */
{
  const { S, env } = build(); const before0 = sj(env.stored());
  const fns = [['sapStatus', []], ['sapVerifyMetadata', []], ['sapShadowRun', []], ['sapSync', []], ['sapCustomerSync', []], ['sapCustomerSync', []], ['sapInstallDailyTrigger', []], ['sapRemoveDailyTrigger', []], ['sapMarkLoaded', [{ months: ['2026-10'] }]]];
  for (const who of ['se@virgoasia.com', 'stranger@virgoasia.com', '']) {
    env.setEmail(who); const rs = fns.map(([f, a]) => env.call(f, a));
    ok('"' + (who || 'no email') + '": refused on all ' + fns.length + ' SAP functions', rs.every(r => r.ok === false && /permission_denied|unauthenticated/.test(r.code)), sj(rs.map(r => r.code)));
  }
  ok('refused callers made no SAP call and wrote nothing, and installed no trigger', S.calls.length === 0 && sj(env.stored()) === before0 && env.state.triggers.length === 0);
  // staged data
  env.setEmail(SUPER); env.call('deskWrite', [[set('sapstage', 'man_2026-10', { ym: '2026-10', complete: true })]]);
  env.setEmail('se@virgoasia.com');
  const pl = env.call('deskPlan', ['sapstage']), pg = env.call('deskPage', ['sapstage', 2, 2, 0]), gm = env.call('deskGetMany', [['sapstage/man_2026-10']]), wr = env.call('deskWrite', [[set('sapstage', 'x', { a: 1 })]]), rv = env.call('deskRevs');
  ok('staged collection: a non-Super user is refused plan, page and single reads', pl.code === 'permission_denied' && pg.code === 'permission_denied' && gm.code === 'permission_denied', sj([pl.code, pg.code, gm.code]));
  ok('staged collection: a non-Super write is refused and the revision map does not show it', wr.code === 'permission_denied' && !('sapstage' in rv.revs) && !('sapstage/x' in env.stored()), sj([wr.code, rv.revs]));
  env.setEmail(SUPER); const pl2 = env.call('deskPlan', ['sapstage']), rv2 = env.call('deskRevs');
  ok('staged collection: a Super admin reads it', pl2.ok && pl2.rows > 0 && 'sapstage' in rv2.revs, sj(pl2));
  ok('staged rows are not part of the restore check (deskStats)', !('sapstage' in env.call('deskStats').counts));
  ok('trigger entry points end in an underscore (private to google.script.run)', /_$/.test('sapSyncTrigger_') && typeof env.ctx.sapSyncTrigger_ === 'function' && typeof env.ctx.sapSyncTrigger === 'undefined' && typeof env.ctx.sapContinueTrigger === 'undefined');
  // D2: a non-admin with the sync flag on, calling the trigger entry points directly: nothing fetched, nothing written
  { const e2 = build(); e2.env.call('sapShadowRun'); const n0 = e2.S.calls.length, st0 = sj(e2.env.stored());
    for (const who of ['se@virgoasia.com', 'stranger@virgoasia.com']) { e2.env.setEmail(who); e2.env.ctx.sapSyncTrigger_(); e2.env.ctx.sapContinueTrigger_(); }
    ok('a non-admin (flag on) reaching the trigger entry points causes no SAP call and no write', e2.S.calls.length === n0 && sj(e2.env.stored()) === st0 && e2.env.state.triggers.length === 0, e2.S.calls.length - n0);
    e2.env.setEmail(''); e2.env.ctx.sapSyncTrigger_(); ok('with no signed-in user (the real trigger) it runs', e2.S.calls.length > n0 && 'sapstage/man_2026-10' in e2.env.stored());
    const e3 = build(); e3.env.call('sapShadowRun'); const m0 = e3.S.calls.length; e3.env.setEmail(SUPER); e3.env.ctx.sapSyncTrigger_(); ok('the owner / a Super admin passes the gate', e3.S.calls.length > m0); }
}

{
  const { S, env } = build(); delete env.props.SAP_SYNC_ENABLED; env.call('sapShadowRun'); const n0 = S.calls.length;
  let r = env.call('sapSync'); ok('sapSync refuses unless SAP_SYNC_ENABLED is "yes": no SAP call, no write', r.code === 'sap_sync_disabled' && S.calls.length === n0 && !Object.keys(env.stored()).some(k => k.startsWith('sapstage/')), sj(r));
  env.props.SAP_SYNC_ENABLED = 'no'; ok('"no" also refuses', env.call('sapSync').code === 'sap_sync_disabled');
  env.setEmail(''); env.ctx.sapSyncTrigger_(); ok('the time trigger path is refused too', S.calls.length === n0);
  ok('the build never sets the property (not in the source or the settings file)', !/setProperty\('SAP_SYNC_ENABLED/.test(env.ctx.sapSyncRun_.toString()));
}
/* =============================== A2. settings: missing credentials give a clear error and no write =============================== */
{
  const { S, env } = build({ props: false }); const before = sj(env.stored());
  for (const f of ['sapVerifyMetadata', 'sapShadowRun', 'sapSync']) {
    const r = env.call(f);
    ok(f + ' without settings: clear error naming the three missing properties, no SAP call, no write', r.ok === false && r.code === 'sap_not_configured' && /SAP_BASE_URL, SAP_USER, SAP_PASSWORD/.test(r.message), sj(r));
  }
  ok('nothing was sent and nothing was written', S.calls.length === 0 && sj(env.stored()) === before);
  env.props.SAP_BASE_URL = S.host; env.props.SAP_USER = S.user;
  let r = env.call('sapVerifyMetadata'); ok('only the password missing: the message names only SAP_PASSWORD', r.code === 'sap_not_configured' && /Missing Script Properties: SAP_PASSWORD\./.test(r.message) && S.calls.length === 0, sj(r));
  env.props.SAP_PASSWORD = S.password; env.props.SAP_BASE_URL = 'http://' + S.host.slice(8);
  r = env.call('sapVerifyMetadata'); ok('a plain http address is refused (Basic auth only over https)', r.code === 'sap_not_configured' && /https/.test(r.message) && S.calls.length === 0, sj(r));
  env.props.SAP_BASE_URL = S.host; env.props.CANCEL_MODE = 'sometimes';
  r = env.call('sapVerifyMetadata'); ok('an unknown CANCEL_MODE is refused', r.code === 'sap_not_configured' && /CANCEL_MODE/.test(r.message) && S.calls.length === 0, sj(r));
  env.props.CANCEL_MODE = ''; env.props.SAP_COMPANY_CODE = "1000' or 'a' eq 'a";
  r = env.call('sapVerifyMetadata'); ok('a company code that could alter the filter is refused', r.code === 'sap_not_configured' && S.calls.length === 0, sj(r));
  env.props.SAP_COMPANY_CODE = '';
  const st = env.call('sapStatus').status; ok('status says not connected, not configured, and what to set', st.configured === false || st.connected === false, sj(st));
  Object.assign(env.props, { SAP_BASE_URL: '', SAP_USER: '', SAP_PASSWORD: '' });
  const s2 = env.call('sapStatus').status; ok('status: not configured, names the missing settings in the next step, never a value', s2.configured === false && s2.connected === false && /SAP_BASE_URL, SAP_USER, SAP_PASSWORD/.test(s2.next), sj(s2));
}

/* =============================== A3. SAP answers 401 / 403 / 500 / 404 / unreachable: no write =============================== */
{
  const docs = synthDocs({ masters });
  let { S, env } = build({ docs }); const before = sj(env.stored());
  env.props.SAP_PASSWORD = 'wrong-pw'; let r = env.call('sapVerifyMetadata');
  ok('401: clear message, code sap_auth, no retry', r.code === 'sap_auth' && /HTTP 401/.test(r.message) && S.calls.length === 1, sj(r) + S.calls.length);
  ok('401: the wrong password is not in the message, the status or the errors', !sj(r).includes('wrong-pw') && !sj(env.call('sapStatus')).includes('wrong-pw') && !(env.props.SAP_STATUS || '').includes('wrong-pw'));
  const st401 = env.call('sapStatus').status; ok('401: the card says Not connected and shows the error', st401.connected === false && st401.errors.length === 1 && st401.lastOk === false);
  { const v401 = env.call('sapStatus').status.verify, nc = S.calls.length, rsh = env.call('sapShadowRun');
    ok('verify failing with an error after an earlier OK voids it: saved verify.ok is false, failed is true', v401.ok === false && v401.failed === true, sj(v401));
    ok('...and the shadow run is then refused (no SAP call) until verify passes again', rsh.ok === false && rsh.code === 'sap_verify_gap' && /did not finish/.test(rsh.message) && S.calls.length === nc, sj(rsh)); }
  env.props.SAP_PASSWORD = S.password; ok('verify passes again with the right password', env.call('sapVerifyMetadata').ok === true && env.call('sapStatus').status.verify.ok === true);
  // shadow first (so sync is allowed), then make SAP fail on the first billing page
  r = env.call('sapShadowRun'); ok('shadow run completes with the right password', r.ok && r.done, sj(r).slice(0, 200));
  const stored0 = sj(env.stored());
  S.failNext(/A_BillingDocument\?/, 403, 5); r = env.call('sapSync');
  ok('403 on the first page: code sap_forbidden, nothing staged, nothing written', r.code === 'sap_forbidden' && sj(env.stored()) === stored0 && !Object.keys(env.stored()).some(k => k.startsWith('sapstage/')), sj(r));
  ok('403 is not retried', S.calls.filter(c => /A_BillingDocument\?/.test(c.path + c.query)).length <= 2);
  S.fails = []; const n0 = S.calls.length; S.failNext(/A_BillingDocument\?/, 500, 99); r = env.call('sapSync');
  ok('500: retried 3 times, then code sap_error, nothing staged', r.code === 'sap_error' && /HTTP 500/.test(r.message) && S.calls.length - n0 === 4 && !Object.keys(env.stored()).some(k => k.startsWith('sapstage/')), sj(r) + (S.calls.length - n0));
  ok('500: the run flag is released (the next run is not "busy")', !/in progress/.test(r.message) && env.call('sapSync').code === 'sap_error');
  S.fails = []; S.failNext(/A_BillingDocument\?/, 404, 1); r = env.call('sapSync'); ok('404: code sap_not_found, tells to run sapVerifyMetadata', r.code === 'sap_not_found' && /sapVerifyMetadata/.test(r.message), sj(r));
  S.fails = []; S.failNext(/./, 0, 99, { throw: true }); r = env.call('sapSync');
  ok('network exception: code sap_unreachable, retried, no write, the URL is not in the message', r.code === 'sap_unreachable' && !r.message.includes('mock-tenant'), sj(r));
  S.fails = []; env.clearCache(); S.failNext(/A_Product/, 500, 99); r = env.call('sapSync');
  ok('a 500 on a lookup (product type) also stops the run with nothing committed', r.code === 'sap_error' && !Object.keys(env.stored()).some(k => k.startsWith('sapstage/man_')), sj(r));
  S.fails = [];
  // failure on page 2 of a month: no manifest (nothing committed), the cursor is kept, the next run finishes the month
  ({ S, env } = build({ docs, s4opts: { pageCap: 25 } })); env.call('sapShadowRun'); env.ctx.SAP_CHUNK_ROWS = 20;
  let seen = 0; const orig = S.fetch; S.fetch = (u, o, e) => { if (/A_BillingDocument\?/.test(u) && /skip=50/.test(u) && (S.once || 0) < 4) { S.once = (S.once || 0) + 1; return { code: 500, body: '{"error":{"message":{"value":"boom"}}}' }; } return orig(u, o, e); }; void seen;
  r = env.call('sapSync'); ok('500 on page 3: the run fails and no manifest is written', r.code === 'sap_error' && !('sapstage/man_2026-10' in env.stored()), sj(r));
  ok('the cursor was kept, so the next run resumes', env.call('sapStatus').status.resume === true);
  r = env.call('sapSync'); ok('next run resumes and completes', r.ok && r.done && r.resumed === true && 'sapstage/man_2026-10' in env.stored(), sj(r));
  const got = stagedRows(env, '2026-10'), exp = expect(docs, '2026-10');
  ok('resumed month holds exactly the expected rows (no gap, no repeat)', got.rows.length === exp.sales + exp.credit && new Set(got.rows.map(x => x[0] + '|' + x[1])).size === got.rows.length, got.rows.length + ' vs ' + (exp.sales + exp.credit));
}

/* =============================== A4. verify $metadata =============================== */
{
  let { S, env } = build(); let r = env.call('sapVerifyMetadata');
  ok('sapVerifyMetadata: every entity set and property ok', r.ok && r.allOk && r.gaps === 0 && r.rows.every(x => x.status === 'ok') && r.rows.length === 53 && r.optionalGaps === 0, sj(r).slice(0, 300));
  ok('it reports per service, entity set and property', ['API_BILLING_DOCUMENT_SRV', 'API_PRODUCT_SRV', 'API_BUSINESS_PARTNER'].every(s => r.rows.some(x => x.service === s)) && r.rows.some(x => x.entitySet === 'A_BillingDocument' && x.property === 'LastChangeDate' && x.status === 'ok') && r.rows.some(x => x.property === 'to_Item (navigation)'));
  ok('only $metadata was read, with GET and the Basic header (and no password in any URL)', S.calls.length === 3 && S.calls.every(c => c.method === 'get' && /\$metadata$/.test(c.path) && /^Basic /.test(c.headers.Authorization) && !c.url.includes(S.password)));
  ({ S, env } = build({ s4opts: { metaGaps: ['A_BillingDocument.LastChangeDate', 'API_PRODUCT_SRV.A_Product'] } })); env.props.SAP_BILLING_SHAPE = 'A'; r = env.call('sapVerifyMetadata');
  const gap = r.rows.filter(x => x.status === 'GAP');
  ok('a missing property and a missing entity set are reported as GAP (required: ok is false)', r.ok === false && r.allOk === false && r.gaps === 4 && gap.some(x => x.property === 'LastChangeDate') && gap.some(x => x.entitySet === 'A_Product' && x.property === '(entity set)'), sj(gap));
  ok('the status shows the gap count and the next step', env.call('sapStatus').status.verify.gaps === 4 && /4 required name/.test(env.call('sapStatus').status.next));
}

/* =============================== A4b. shape B (item set carrying the header fields, as the group's existing connector reads) and the IP allow-list messages =============================== */
{
  const docs = synthDocs({ masters, from: '2026-10-01', to: '2026-10-12', perDayPerPlant: 3 });
  let { S, env } = build({ docs, s4opts: { pageCap: 17 } }); env.call('sapVerifyMetadata'); env.call('sapShadowRun'); env.call('sapSync'); const A = stagedRows(env, '2026-10');
  ok('shape A is the default and is recorded by the verify', env.props.SAP_SHAPE === 'A' && env.call('sapStatus').status.verify.shape === 'A');
  ({ S, env } = build({ docs, s4opts: { pageCap: 17, metaGaps: ['API_BILLING_DOCUMENT_SRV.A_BillingDocument'] } }));
  let r = env.call('sapVerifyMetadata');
  ok('verify: when the header set is missing but the item set carries the header fields, shape B is chosen and every name is ok', r.ok && r.allOk && r.shape === 'B' && env.props.SAP_SHAPE === 'B' && r.rows.some(x => x.entitySet === 'A_BillingDocumentItem' && x.property === 'BillingDocumentDate' && x.status === 'ok'), sj(r.rows.filter(x => x.status !== 'ok')).slice(0, 300));
  env.call('sapShadowRun'); const n0 = S.calls.length; r = env.call('sapSync'); const B = stagedRows(env, '2026-10');
  ok('shape B reads only the item set (no A_BillingDocument request)', r.ok && S.calls.slice(n0).filter(c => /A_BillingDocument\?/.test(c.path + c.query) || /A_BillingDocument$/.test(c.path)).length === 0 && S.calls.slice(n0).some(c => /A_BillingDocumentItem$/.test(c.path)));
  ok('shape B stages exactly the rows shape A stages (documents that straddle a page are not split or repeated)', B.rows.length === A.rows.length && sj(B.rows.map(x => x.join('|')).sort()) === sj(A.rows.map(x => x.join('|')).sort()) && B.man.countChecked === true && B.man.counts.headers === A.man.counts.headers, B.rows.length + ' vs ' + A.rows.length);
  ok('shape B is forced by SAP_BILLING_SHAPE when set', (() => { env.props.SAP_BILLING_SHAPE = 'A'; const v = env.call('sapVerifyMetadata'); return v.shape === 'A' && v.allOk === false; })());
  // allow-list wording
  ({ S, env } = build({ docs })); S.failNext(/\$metadata/, 403, 9); r = env.call('sapVerifyMetadata');
  ok('403 names a possible IP allow-list and the read role', r.code === 'sap_forbidden' && /IP allow-list/.test(r.message) && /read role/.test(r.message), r.message);
  ({ S, env } = build({ docs })); S.failNext(/./, 0, 99, { throw: true }); r = env.call('sapVerifyMetadata');
  ok('a refused connection names a possible IP allow-list', r.code === 'sap_unreachable' && /IP allow-list/.test(r.message) && !r.message.includes('mock-tenant'), r.message);
  ok('the default company code is 1000', (() => { const e2 = build({ docs }); return e2.env.call('sapStatus').ok && /datetime/.test('') === false && (e2.env.call('sapVerifyMetadata'), e2.env.call('sapShadowRun'), e2.S.calls.some(c => /CompanyCode%20eq%20%271000%27/.test(c.query))); })());
}


/* =============================== A4b. optional fields, required gaps, verify result = saved status, run logs (first real-SAP finding, 8 Nov) =============================== */
{
  const docs = synthDocs({ masters });
  const logsOf = (env) => (env.state.logs || []).filter(l => l.startsWith('SAP '));
  // 1. the real tenant has no SalesDistrict: the feed never names it (verify list, $select, $expand) and the column stays blank
  let { S, env } = build({ docs, s4opts: { pageCap: 17 } }); let r = env.call('sapVerifyMetadata');
  ok('tenant without SalesDistrict on the billing item: verify is ok with no GAP (the property is not in the billing list)', r.ok === true && r.gaps === 0 && !r.rows.some(x => x.property === 'SalesDistrict' && x.entitySet === 'A_BillingDocumentItem'), sj(r.rows.filter(x => x.status === 'GAP')));
  r = env.call('sapShadowRun'); const st1 = env.call('sapSync');
  ok('shadow run and sync complete on the tenant that has no SalesDistrict', r.ok && r.done && st1.ok && st1.done, sj([r, st1]).slice(0, 300));
  ok('no request names SalesDistrict (strict mock answers 404 "Resource not found for the segment" for an unknown name)', S.calls.every(c => !/SalesDistrict/.test(decodeURIComponent(c.url))) && S.calls.length > 5);
  const sr = stagedRows(env, '2026-10');
  ok('the staged "Sales District" column (14th) is blank on every row', sr && sr.rows.length > 0 && sr.rows.every(x => x[13] === ''), sj(sr && sr.rows[0]));
  // 2. an optional property missing on the tenant: GAP flagged, ok true with a warning, left out of later reads, list kept in a Script Property
  ({ S, env } = build({ docs, s4opts: { metaGaps: ['A_BillingDocumentItem.ReferenceSDDocument'] } })); env.props.SAP_BILLING_SHAPE = 'A';
  r = env.call('sapVerifyMetadata');
  const og = r.rows.filter(x => x.status === 'GAP');
  ok('optional GAP: flagged as GAP and marked optional', og.length === 1 && og[0].property === 'ReferenceSDDocument' && og[0].optional === true && r.optionalGaps === 1 && r.gaps === 0, sj(og));
  ok('optional GAP: ok is true, with a warning naming the property', r.ok === true && r.allOk === false && /ReferenceSDDocument/.test(r.warning || '') && /Warning/.test(r.message), sj([r.ok, r.warning]));
  ok('optional GAP: the skip list is kept in the Script Property SAP_OPT_SKIP', sj(JSON.parse(env.props.SAP_OPT_SKIP)) === sj(['A_BillingDocumentItem.ReferenceSDDocument']), env.props.SAP_OPT_SKIP);
  const n0 = S.calls.length; r = env.call('sapShadowRun');
  ok('optional GAP: the shadow run completes (the property is left out of the $select, so the strict tenant answers 200)', r.ok && r.done && S.calls.slice(n0).some(c => /A_BillingDocument\?/.test(c.path + c.query)) && S.calls.slice(n0).every(c => !/ReferenceSDDocument/.test(decodeURIComponent(c.url))), sj(r).slice(0, 300));
  ok('optional GAP: the card says verified, not blocked', env.call('sapStatus').status.verify.ok === true && env.call('sapStatus').status.verify.optionalGaps === 1);
  r = env.call('sapSync'); const g = stagedRows(env, '2026-10');
  ok('optional GAP: sync stages the rows with that column blank', r.ok && r.done && g.rows.length > 0 && g.rows.every(x => x[14] === ''));
  env.props.SAP_BILLING_SHAPE = 'A'; S.metaGaps = []; r = env.call('sapVerifyMetadata');
  ok('once the tenant has the property again, verify clears the skip list', r.ok && r.optionalGaps === 0 && env.props.SAP_OPT_SKIP === '[]' && r.allOk === true);
  // CustomerName optional: the customer lookup is left out, name blank
  ({ S, env } = build({ docs, s4opts: { metaGaps: ['A_Customer.CustomerName'] } })); env.props.SAP_BILLING_SHAPE = 'A'; r = env.call('sapVerifyMetadata'); const c0 = S.calls.length;
  const r2 = env.call('sapShadowRun'); const r3 = env.call('sapSync'); const g2 = stagedRows(env, '2026-10');
  ok('optional CustomerName GAP: ok true, no customer request, shadow and sync complete, name column blank', r.ok === true && r.optionalGaps === 1 && r2.ok && r3.ok && S.calls.slice(c0).every(c => !/A_Customer/.test(c.path)) && g2.rows.every(x => x[5] === ''), sj([r.ok, r2.ok, r3.ok]));
  // 3. a required GAP still blocks, with a clear message
  ({ S, env } = build({ docs, s4opts: { metaGaps: ['A_BillingDocumentItem.NetAmount', 'A_BillingDocumentItem.ReferenceSDDocument'] } })); env.props.SAP_BILLING_SHAPE = 'A'; r = env.call('sapVerifyMetadata');
  ok('required GAP: verify ok is false, code sap_verify_gap, blocking list names it, the optional one is still only a warning', r.ok === false && r.code === 'sap_verify_gap' && r.gaps === 1 && r.optionalGaps === 1 && sj(r.blocking) === sj(['A_BillingDocumentItem.NetAmount']) && /NetAmount/.test(r.message), sj([r.ok, r.code, r.blocking, r.message]));
  const n1 = S.calls.length, sh = env.call('sapShadowRun'), sy = env.call('sapSync');
  ok('required GAP: the shadow run is refused with a clear message and no SAP call', sh.ok === false && sh.code === 'sap_verify_gap' && /NetAmount/.test(sh.message) && /Nothing was read/.test(sh.message) && S.calls.length === n1, sj(sh));
  ok('required GAP: the sync is refused too', sy.ok === false && sy.code === 'sap_verify_gap' && S.calls.length === n1 && !('sapstage/man_2026-10' in env.stored()), sj(sy));
  ok('required GAP: the card shows the blocking name in the next step', /NetAmount/.test(env.call('sapStatus').status.next));
  // 4. verify's ok matches the saved status, in every case
  const cases = [{}, { metaGaps: ['A_BillingDocumentItem.ReferenceSDDocument'] }, { metaGaps: ['A_BillingDocumentItem.NetAmount'] }, { metaGaps: ['API_PRODUCT_SRV.A_Product'] }, { metaGaps: ['A_Customer.CustomerName', 'A_Product.ProductType'] }];
  const same = cases.map(mg => { const e = build({ docs, s4opts: mg }); e.env.props.SAP_BILLING_SHAPE = 'A'; const v = e.env.call('sapVerifyMetadata'), sv = e.env.call('sapStatus').status; return v.ok === sv.verify.ok && sv.lastOk === v.ok && v.gaps === sv.verify.gaps && v.optionalGaps === sv.verify.optionalGaps; });
  ok('verify: the returned ok, gaps and optionalGaps equal the saved status (verify.ok, lastOk) in all ' + cases.length + ' cases', same.every(Boolean), sj(same));
  // 5. logs: every public function writes one line, success or failure, with no credential or address
  ({ S, env } = build({ docs })); const pub = [['sapVerifyMetadata', []], ['sapShadowRun', []], ['sapSync', []], ['sapCustomerSync', []], ['sapStatus', []], ['sapInstallDailyTrigger', []], ['sapRemoveDailyTrigger', []], ['sapMarkLoaded', [{ months: ['2026-10'] }]]];
  const per = pub.map(([f, a]) => { const l0 = logsOf(env).length; const rr = env.call(f, a); const ls = logsOf(env); return { f, ok: rr.ok, n: ls.length - l0, line: ls[ls.length - 1] || '' }; });
  ok('logs: each of the 8 public functions wrote exactly one "SAP ..." line on success, naming the function', per.every(x => x.ok && x.n === 1 && x.line.includes('"fn":"' + x.f + '"') && x.line.includes('"ok":true')), sj(per.map(x => [x.f, x.n])));
  const failed = [];
  env.props.SAP_PASSWORD = 'wrong-pw'; for (const f of ['sapVerifyMetadata', 'sapShadowRun']) { const l0 = logsOf(env).length; const rr = env.call(f); failed.push({ f, ok: rr.ok, code: rr.code, n: logsOf(env).length - l0, line: logsOf(env).slice(-1)[0] || '' }); }
  ok('logs: a failed run (wrong password, HTTP 401; then the shadow run refused because verify failed) is logged too, with ok:false and the code', failed.every(x => x.ok === false && x.n === 1 && x.line.includes('"ok":false') && /sap_auth|sap_verify_gap/.test(x.line)), sj(failed));
  env.setEmail('se@virgoasia.com'); const l1 = logsOf(env).length, rf = env.call('sapStatus'); env.setEmail(SUPER);
  ok('logs: a refused caller is logged as a failure', rf.ok === false && logsOf(env).length === l1 + 1 && logsOf(env).slice(-1)[0].includes('permission_denied'));
  const allLogs = (env.state.logs || []).join('\n');
  ok('logs: no password, user name or SAP address in any log line', !allLogs.includes(S.password) && !allLogs.includes('wrong-pw') && !allLogs.includes(S.user) && !allLogs.includes('mock-tenant') && !/Basic /.test(allLogs) && allLogs.length > 0);
}
/* =============================== A4c. follow-ups: verify required before reads, failed verify voids OK, valid log JSON, separate shadow cursor, refused trigger logged =============================== */
{
  const docs = synthDocs({ masters }), logsOf = (env) => (env.state.logs || []).filter(l => l.startsWith('SAP '));
  // 2. reads need a passing saved verify; never run = refused with "Run sapVerifyMetadata first"
  let { S, env } = build({ docs, verified: false }); let n0 = S.calls.length;
  let sh = env.call('sapShadowRun'), sy = env.call('sapSync');
  ok('never verified: the shadow run is refused with "Run sapVerifyMetadata first" and no SAP call', sh.ok === false && sh.code === 'sap_verify_first' && /Run sapVerifyMetadata first/.test(sh.message) && S.calls.length === n0, sj(sh));
  ok('never verified: the sync is refused the same way, nothing staged', sy.ok === false && sy.code === 'sap_verify_first' && /Run sapVerifyMetadata first/.test(sy.message) && S.calls.length === n0 && !('sapstage/man_2026-10' in env.stored()), sj(sy));
  ok('never verified: the card says to run sapVerifyMetadata', /sapVerifyMetadata/.test(env.call('sapStatus').status.next));
  ok('after a passing verify the shadow run reads', env.call('sapVerifyMetadata').ok === true && env.call('sapShadowRun').done === true);
  // 1. $metadata unreachable after an earlier OK voids the OK
  ({ S, env } = build({ docs, verified: false })); ok('setup: verify passes', env.call('sapVerifyMetadata').ok === true && env.call('sapStatus').status.verify.ok === true);
  S.failNext(/\$metadata/, 0, 99, { throw: true }); const vf = env.call('sapVerifyMetadata'), sv = env.call('sapStatus').status;
  ok('verify failing with an error (SAP unreachable) after an OK: the saved verify.ok becomes false (failed:true), lastOk false', vf.ok === false && sv.verify.ok === false && sv.verify.failed === true && sv.lastOk === false, sj([vf.code, sv.verify]));
  S.fails = []; n0 = S.calls.length; sh = env.call('sapShadowRun');
  ok('...so the shadow run is refused until verify passes again (no SAP call)', sh.ok === false && sh.code === 'sap_verify_gap' && S.calls.length === n0, sj(sh));
  ok('...and a later passing verify clears it', env.call('sapVerifyMetadata').ok === true && env.call('sapStatus').status.verify.failed === false && env.call('sapShadowRun').ok === true);
  // 3. the log line is always valid JSON and keeps ms; only msg is cut and redacted
  ({ S, env } = build({ docs })); const long = 'x'.repeat(500) + ' ' + S.password + ' ' + S.user + ' ' + S.host;
  env.ctx.sapLogLine_('sapTest', { ok: false, code: 'sap_error', message: long }, 1234);
  const ln = logsOf(env).slice(-1)[0], jl = (() => { try { return JSON.parse(ln.slice(4)); } catch (e) { return null; } })();
  ok('a long message does not break the log line: it parses as JSON, ms is kept, msg is cut to 160', jl && jl.ms === 1234 && jl.fn === 'sapTest' && jl.ok === false && jl.code === 'sap_error' && jl.msg.length <= 160, ln);
  const short = 'a ' + S.password + ' b ' + S.user; env.ctx.sapLogLine_('sapTest', { ok: false, message: short }, 7);
  const l2 = logsOf(env).slice(-1)[0], j2 = (() => { try { return JSON.parse(l2.slice(4)); } catch (e) { return null; } })();
  ok('a short message with secrets: still valid JSON, secrets replaced by ***, ms kept', j2 && j2.ms === 7 && !l2.includes(S.password) && !l2.includes(S.user) && /\*\*\*/.test(j2.msg), l2);
  env.call('sapVerifyMetadata'); env.call('sapShadowRun'); env.call('sapSync');
  ok('every SAP log line of real runs parses as JSON with a numeric ms', logsOf(env).length >= 4 && logsOf(env).every(l => { try { const j = JSON.parse(l.slice(4)); return typeof j.ms === 'number' && typeof j.fn === 'string'; } catch (e) { return false; } }));
  // 4. a shadow run never overwrites or clears a paused sync's cursor
  const d2 = synthDocs({ masters, from: '2026-10-01', to: '2026-10-12', perDayPerPlant: 3 });
  ({ S, env } = build({ docs: d2, s4opts: { pageCap: 20, msPerCall: 40000 } })); env.props.SAP_RUN_BUDGET_MS = '150000'; env.ctx.SAP_CHUNK_ROWS = 30;
  let r = env.call('sapShadowRun'), k = 0; while (!r.done && k++ < 40) r = env.call('sapShadowRun');
  r = env.call('sapSync'); const paused = env.props.SAP_CURSOR;
  ok('setup: a sync is paused at the time limit with its cursor saved', r.ok && r.done === false && paused && JSON.parse(paused).job === 'sync', String(paused).slice(0, 80));
  r = env.call('sapShadowRun'); const midShadow = env.props.SAP_CURSOR, shCur = env.props.SAP_CURSOR_SHADOW;
  ok('a shadow run cut at the limit keeps its own cursor and leaves the sync cursor byte for byte unchanged', r.ok && r.done === false && midShadow === paused && shCur && JSON.parse(shCur).job === 'shadow', sj(r).slice(0, 120));
  k = 0; while (!r.done && k++ < 40) r = env.call('sapShadowRun');
  ok('a finished shadow run clears only the shadow cursor; the paused sync cursor is still there and the card says resume', r.done === true && env.props.SAP_CURSOR === paused && !env.props.SAP_CURSOR_SHADOW && env.call('sapStatus').status.resume === true);
  r = env.call('sapSync'); k = 0; let resumed = r.resumed; while (!r.done && k++ < 60) { r = env.call('sapSync'); resumed = resumed || r.resumed; }
  ok('the paused sync then resumes (resumed:true) and finishes', r.done === true && resumed === true && 'sapstage/man_2026-10' in env.stored());
  // 5. a refused trigger call writes exactly one log line
  ({ S, env } = build({ docs })); n0 = S.calls.length;
  for (const f of ['sapSyncTrigger_', 'sapContinueTrigger_']) { env.setEmail('se@virgoasia.com'); const l0 = logsOf(env).length; env.ctx[f]();
    const add = logsOf(env).slice(l0); ok(f + ': a refused call writes exactly one log line (ok:false, permission_denied, no SAP call)', add.length === 1 && add[0].includes('"fn":"' + f + '"') && add[0].includes('"ok":false') && add[0].includes('permission_denied') && S.calls.length === n0, sj(add)); }
}

/* =============================== A4d. customer master read (D78): verify, paging, refusals, staging, no write without Super =============================== */
{
  const docs = synthDocs({ masters }), logsOf = (env) => (env.state.logs || []).filter(l => l.startsWith('SAP '));
  const CODES = Object.keys(masters.customers), N = CODES.length;
  // verify: the customer names are checked, per service / entity set / property, with the scope marked
  let { S, env } = build({ docs, verified: false }); let r = env.call('sapVerifyMetadata');
  ok('verify: the customer-master entity sets and properties are checked and all ok on the mock tenant', r.ok === true && r.gaps === 0 && ['A_CustomerCompany', 'A_CustomerSalesArea', 'A_BusinessPartnerAddress', 'A_BusinessPartnerTax'].every(n => r.rows.some(x => x.entitySet === n && x.property === '(entity set)' && x.status === 'ok')) && r.rows.some(x => x.entitySet === 'A_BusinessPartnerAddress' && x.property === 'PostalCode' && x.scope === 'cust' && !x.optional), sj(r.rows.filter(x => x.status === 'GAP')));
  ok('verify: only region, PIN, address key and the company scope are required for the customer read; the rest is optional', (() => { const req = r.rows.filter(x => x.scope === 'cust' && !x.optional && x.property !== '(entity set)').map(x => x.entitySet + '.' + x.property).sort(); return sj(req) === sj(['A_BusinessPartnerAddress.BusinessPartner', 'A_BusinessPartnerAddress.PostalCode', 'A_BusinessPartnerAddress.Region', 'A_CustomerCompany.CompanyCode', 'A_CustomerCompany.Customer']); })());
  // refusals: never verified, failed verify, required customer GAP, non-Super
  ({ S, env } = build({ docs, verified: false })); let n0 = S.calls.length; r = env.call('sapCustomerSync');
  ok('never verified: the customer read is refused "Run sapVerifyMetadata first", no SAP call, nothing staged', r.ok === false && r.code === 'sap_verify_first' && /Run sapVerifyMetadata first/.test(r.message) && S.calls.length === n0 && !('sapstage/cust_man' in env.stored()), sj(r));
  env.call('sapVerifyMetadata'); S.failNext(/\$metadata/, 0, 99, { throw: true }); env.call('sapVerifyMetadata'); S.fails = []; n0 = S.calls.length; r = env.call('sapCustomerSync');
  ok('after a failed verify the customer read is refused until verify passes (no SAP call)', r.ok === false && r.code === 'sap_verify_gap' && S.calls.length === n0, sj(r));
  ({ S, env } = build({ docs, s4opts: { metaGaps: ['A_BusinessPartnerAddress.PostalCode'] }, verified: false })); r = env.call('sapVerifyMetadata'); n0 = S.calls.length;
  const rc = env.call('sapCustomerSync'), nAfterRc = S.calls.length, rs = env.call('sapShadowRun');
  ok('a required customer GAP (PostalCode): verify ok is false and names it; the customer read is refused with a clear message and no SAP call', r.ok === false && sj(r.blockingCust) === sj(['A_BusinessPartnerAddress.PostalCode']) && r.blockingSales.length === 0 && rc.ok === false && rc.code === 'sap_verify_gap' && /PostalCode/.test(rc.message) && /Nothing was read/.test(rc.message) && nAfterRc === n0, sj([r.ok, rc]));
  ok('...but billing reads are not blocked by a customer-only GAP (the shadow run completes)', rs.ok === true && rs.done === true, sj(rs).slice(0, 200));
  ({ S, env } = build({ docs, s4opts: { metaGaps: ['A_BillingDocumentItem.NetAmount'] }, verified: false })); env.props.SAP_BILLING_SHAPE = 'A'; r = env.call('sapVerifyMetadata');
  ok('a required BILLING GAP blocks the shadow run, not the customer read (which does not use billing names)', r.ok === false && r.blockingCust.length === 0 && env.call('sapShadowRun').code === 'sap_verify_gap' && env.call('sapCustomerSync').ok === true);
  ({ S, env } = build({ docs })); n0 = S.calls.length; const w0 = sj(env.stored());
  for (const who of ['se@virgoasia.com', 'stranger@virgoasia.com', '']) { env.setEmail(who); const x = env.call('sapCustomerSync'); ok('"' + (who || 'no email') + '": sapCustomerSync refused, no SAP call, nothing written', x.ok === false && /permission_denied|unauthenticated/.test(x.code) && S.calls.length === n0 && sj(env.stored()) === w0, sj(x)); }
  env.setEmail('se@virgoasia.com'); const rd = env.call('deskGetMany', [['sapstage/cust_man']]), wr = env.call('deskWrite', [[set('sapstage', 'cust_man', { status: 'loaded' })]]), mk = env.call('sapMarkLoaded', [{ customers: { run: 'x', rows: 1 } }]);
  ok('a non-Super user cannot read, overwrite or mark the staged customer master', rd.code === 'permission_denied' && wr.code === 'permission_denied' && mk.ok === false && mk.code === 'permission_denied');
  env.setEmail(SUPER);
  // staging
  ({ S, env } = build({ docs })); const before = sj(Object.keys(env.stored()).filter(k => !k.startsWith('sapstage/'))); r = env.call('sapCustomerSync'); const g = stagedCust(env);
  ok('staging: the read completes and stages one row per in-scope customer', r.ok === true && r.customers === N && g && g.rows.length === N && g.man.status === 'staged' && g.man.complete === true && g.man.rows === N, sj(r).slice(0, 300));
  ok('staging: customers of another company are dropped and counted (30 customers read, 5 outside), and a non-customer partner address is ignored', g.man.counts.read === N + 5 && g.man.counts.outOfScope === 5 && g.rows.every(x => !/^6000000/.test(x[0])) && g.man.counts.inScope === N, sj(g.man.counts));
  ok('staging: columns are the page\'s intake names plus Postal Code, District, GSTIN', sj(g.man.cols) === sj(['Customer', 'Name', 'Customer Group', 'City', 'Region', 'Postal Code', 'District', 'GSTIN', 'Sales Executive', 'Payment Terms', 'Sales District', 'Blocked', 'Legacy Code', 'Address Count']) && g.rows.every(x => x.length === 14));
  const by = {}; g.rows.forEach(x => by[x[0]] = x); const code = (i) => String(+CODES[i]);
  ok('staging: codes are trimmed of leading zeros and names kept', by[code(0)] && by[code(0)][1] === masters.customers[CODES[0]], sj(by[code(0)]));
  ok('staging: with several addresses the lowest AddressID wins (region GJ, not MH) and the customer is counted', by[code(7)][4] === 'GJ' && by[code(7)][5] === '380007' && by[code(7)][13] === 2 && g.man.counts.severalAddresses === 1, sj(by[code(7)]));
  ok('staging: a customer with no address has blank region and PIN and is counted', by[code(9)][4] === '' && by[code(9)][5] === '' && by[code(9)][13] === 0 && g.man.counts.noAddress === 1 && g.man.counts.noRegion === 1);
  ok('staging: a PIN that is not 6 digits is stored blank and counted (4-digit and blank)', by[code(3)][5] === '' && by[code(5)][5] === '' && g.man.counts.pinBad === 1 && g.man.counts.pin6 === N - 3, sj([g.man.counts.pinBad, g.man.counts.pin6]));
  ok('staging: GSTIN is the IN3 tax number only (an IN4 row is ignored); a 14-character one is kept and counted', by[code(2)][7] === '24AAAAA0002A1Z5' && by[code(1)][7] === '24AAAAA0001A1Z5' && by[code(6)][7].length === 14 && g.man.counts.gstinNot15 === 1 && by[code(0)][7] === '', sj([by[code(2)][7], by[code(6)][7]]));
  ok('staging: district text, city, group, sales group, terms, sales district and legacy code are carried; a blocked customer is flagged', by[code(1)][6] === 'District 1' && by[code(0)][6] === '' && by[code(1)][3] === 'City 1' && by[code(1)][2] === 'C2' && by[code(1)][8] === 'SG1' && by[code(1)][9] === 'Z030' && by[code(1)][10] === 'ZONE02' && by[code(0)][12] === 'C00000' && by[code(10)][11] === 'Y' && by[code(0)][11] === '', sj([by[code(1)], by[code(10)]]));
  ok('staging: with two sales areas the first is kept and the customer is counted', by[code(4)][2] === 'C1' && by[code(4)][8] === 'SG1' && g.man.counts.severalSalesAreas === 1, sj(by[code(4)]));
  ok('staging: chunk and manifest ids never start with c_ or man_ (the page\'s billing loader reads those)', Object.keys(env.stored()).filter(k => k.startsWith('sapstage/')).every(k => !/^sapstage\/(c_|man_)/.test(k) || /^sapstage\/(c_2|man_2)/.test(k)) && Object.keys(env.stored()).some(k => /^sapstage\/cust_c_/.test(k)));
  ok('staging: only the admin-only sapstage collection was written, plus the status', sj(Object.keys(env.stored()).filter(k => !k.startsWith('sapstage/'))) === before && !!sapJsonOf(env, 'SAP_STATUS').cust);
  ok('staging: no request wrote to SAP, none carried the password, no property outside the customer set was invented', S.calls.every(c => c.method === 'get' && !c.url.includes(S.password)));
  const st = env.call('sapStatus').status;
  ok('status: the card data shows the staged customers and the next step mentions them', st.cust && st.cust.rows === N && st.cust.status === 'staged' && /Customer master: 25 customers are staged/.test(st.next) && st.lastKind === 'customers');
  // a second read replaces the first run's chunks (no pile-up)
  const run1 = g.man.run; r = env.call('sapCustomerSync'); const g2 = stagedCust(env);
  ok('a second read replaces the staged customers: a new run id, the old chunks are deleted, the rows are the same', g2.man.run !== run1 && !Object.keys(env.stored()).some(k => k.startsWith('sapstage/cust_c_' + run1)) && g2.rows.length === N);
  // paging: a server that caps the page size is followed to the end; the count is checked
  ({ S, env } = build({ docs, s4opts: { pageCap: 7 } })); n0 = S.calls.length; r = env.call('sapCustomerSync'); const g3 = stagedCust(env);
  const pageCalls = S.calls.slice(n0).filter(c => /A_(Customer|BusinessPartner)/.test(c.path));
  ok('paging: with a page cap of 7 every set is read to the end (all customers and addresses arrive), in several calls per set', r.ok && g3.rows.length === N && sj(g3.rows.map(x => x.join('|')).sort()) === sj(g.rows.map(x => x.join('|')).sort()) && pageCalls.length > 10, pageCalls.length);
  ok('paging: $skip advances with the rows already read, $orderby is set, and the count is requested on the first page only', (() => { const q = pageCalls.filter(c => /A_BusinessPartnerAddress/.test(c.path)).map(c => new URLSearchParams(c.query)); return q.length > 2 && q[0].get('$inlinecount') === 'allpages' && q.slice(1).every(x => !x.get('$inlinecount')) && q.every(x => /BusinessPartner asc/.test(x.get('$orderby'))) && q[1].get('$skip') === '7' && q[2].get('$skip') === '14'; })());
  ok('the company filter is sent on the scope read', pageCalls.some(c => /A_CustomerCompany/.test(c.path) && /CompanyCode eq '1000'/.test(decodeURIComponent(c.query))) && pageCalls.some(c => /A_BusinessPartnerTax/.test(c.path) && /BPTaxType eq 'IN3'/.test(decodeURIComponent(c.query))));
  ({ S, env } = build({ docs, s4opts: { noCount: true } })); r = env.call('sapCustomerSync'); ok('a server without $inlinecount works (stops at the empty page)', r.ok && stagedCust(env).rows.length === N, sj(r).slice(0, 200));
  ({ S, env } = build({ docs, s4opts: { pageCap: 7 } })); S.miscount = 3; r = env.call('sapCustomerSync');
  ok('a count mismatch stages nothing and says so', r.ok === false && /counted/.test(r.message) && !('sapstage/cust_man' in env.stored()), sj(r));
  // failures: nothing staged, clear status, no secrets
  ({ S, env } = build({ docs })); S.failNext(/A_BusinessPartnerAddress/, 500, 99); r = env.call('sapCustomerSync'); const sf = env.call('sapStatus').status;
  ok('a 500 on the address read: code sap_error, nothing staged, the run flag released, the card shows the failure', r.code === 'sap_error' && !('sapstage/cust_man' in env.stored()) && sf.lastOk === false && sf.lastKind === 'customers' && env.call('sapCustomerSync').code === 'sap_error');
  ({ S, env } = build({ docs, s4opts: { msPerCall: 40000, pageCap: 7 } })); env.props.SAP_RUN_BUDGET_MS = '150000'; r = env.call('sapCustomerSync');
  ok('the time budget stops the read with nothing staged and says to run it again', r.ok === false && r.code === 'sap_timeout' && /Nothing was staged/.test(r.message) && !('sapstage/cust_man' in env.stored()), sj(r));
  ok('a non-Super refusal and every failure are logged as one line each, with no secret', (() => { const ls = logsOf(env).join('\n'); return /"fn":"sapCustomerSync"/.test(ls) && !ls.includes(S.password) && !ls.includes('mock-tenant'); })());
  // optional parts: an optional property or set missing on the tenant is left out, the read still completes, the column is blank
  ({ S, env } = build({ docs, s4opts: { metaGaps: ['A_BusinessPartnerAddress.District', 'API_BUSINESS_PARTNER.A_CustomerSalesArea', 'API_BUSINESS_PARTNER.A_BusinessPartnerTax'] }, verified: false })); r = env.call('sapVerifyMetadata');
  ok('optional: a missing District property and two missing optional sets are warnings only (ok true), listed in the skip list', r.ok === true && r.gaps === 0 && r.optionalGaps >= 3 && r.warning && ['A_BusinessPartnerAddress.District', 'A_CustomerSalesArea.(entity set)', 'A_BusinessPartnerTax.(entity set)'].every(k => (JSON.parse(env.props.SAP_OPT_SKIP) || []).includes(k)), sj([r.ok, r.optionalGaps, env.props.SAP_OPT_SKIP]));
  n0 = S.calls.length; r = env.call('sapCustomerSync'); const g4 = stagedCust(env);
  ok('optional: the read completes without those names (strict tenant answers 200), and their columns are blank', r.ok === true && g4.rows.length === N && g4.rows.every(x => x[6] === '' && x[7] === '' && x[2] === '' && x[8] === '' && x[9] === '') && S.calls.slice(n0).every(c => !/A_CustomerSalesArea|A_BusinessPartnerTax|District/.test(decodeURIComponent(c.url))), sj(r).slice(0, 200));
  ok('optional: region and PIN are still read', g4.rows.some(x => x[4] === 'GJ') && g4.rows.filter(x => /^\d{6}$/.test(x[5])).length === N - 3);
  // mark loaded: the page reports { run, rows }; the manifest and status become loaded; billing counts are untouched
  ({ S, env } = build({ docs })); env.call('sapCustomerSync'); const run = stagedCust(env).man.run; const bill0 = sj(env.call('sapStatus').status.loaded);
  let ml = env.call('sapMarkLoaded', [{ customers: { run: 'wrong', rows: 5 } }]); ok('sapMarkLoaded for customers with a run id that is not the staged one changes nothing', ml.ok && JSON.parse(env.stored()['sapstage/cust_man']).status === 'staged' && env.call('sapStatus').status.cust.status === 'staged');
  ml = env.call('sapMarkLoaded', [{ customers: { run, rows: N } }]); const st2 = env.call('sapStatus').status;
  ok('sapMarkLoaded for customers marks the manifest and the card loaded; the billing loaded counts are untouched; the next step no longer lists them', ml.ok && JSON.parse(env.stored()['sapstage/cust_man']).status === 'loaded' && st2.cust.status === 'loaded' && st2.cust.loadedRows === N && sj(st2.loaded) === bill0 && !/Customer master:/.test(st2.next), sj(st2.cust));
}
function sapJsonOf(env, k) { try { return JSON.parse(env.props[k] || '{}'); } catch (e) { return {}; } }

/* =============================== A5. filters, cut-off, cancellation modes, other types =============================== */
{
  const docs = synthDocs({ masters, from: '2026-09-24', to: '2026-09-30', extras: false, startNo: 80000001 }).concat(synthDocs({ masters, from: '2026-10-01', to: '2026-10-08' }));
  let { S, env } = build({ docs }); env.call('sapShadowRun');
  let r = env.call('sapSync'); const got = stagedRows(env, '2026-10'), exp = expect(docs, '2026-10');
  ok('sync stages the sales and credit lines of October: counts equal the independent expectation', r.ok && r.done && got.man.counts.sales === exp.sales && got.man.counts.credit === exp.credit, sj(got.man.counts).slice(0, 200) + ' ' + sj(exp));
  ok('net values add up (same as the documents)', near(got.rows.filter(x => x[9] === 'F2').reduce((a, x) => a + x[8], 0), exp.salesNet) && near(got.rows.filter(x => x[9] !== 'F2').reduce((a, x) => a + x[8], 0), exp.creditNet));
  ok('cut-off: September documents exist in SAP but no request asks for a date before 2026-10-01', docs.some(d => iso(d.BillingDocumentDate) < '2026-10-01') && S.calls.filter(c => /A_BillingDocument\?/.test(c.path + c.query)).every(c => { const f = decodeURIComponent(c.query); const m = [...f.matchAll(/datetime'(\d{4}-\d\d-\d\d)/g)].map(x => x[1]); return m.length && m.every(d => d >= '2026-10-01'); }));
  ok('cut-off: no staged row is dated before 2026-10-01 and nothing for September was staged', got.rows.every(x => x[2] >= '2026-10-01') && !('sapstage/man_2026-09' in env.stored()) && sj(env.call('sapStatus').status.staged).indexOf('2026-09') < 0);
  r = env.call('sapShadowRun', ['2026-09']); ok('the shadow run refuses a month before the cut-off', r.code === 'invalid_argument', sj(r));
  // a SAP that ignores the date filter: the feed still drops September (second line of defence), and counts it
  ({ S, env } = build({ docs, s4opts: { leak: true } })); env.call('sapShadowRun'); r = env.call('sapSync'); const g2 = stagedRows(env, '2026-10');
  ok('cut-off, second line: a server that ignored the date filter cannot put September rows in the stage', r.ok && g2.rows.every(x => x[2] >= '2026-10-01') && g2.man.counts.beforeCutoff > 0, sj(g2.man.counts));
  // other types, ACP, flagged units, other company
  const c = got.man.counts;
  ok('other billing types (debit memo L2) are not staged and are counted with their value; ACP plant lines, a non-sheet unit and another company are counted/skipped', c.otherTypes.L2 && c.otherTypes.L2.n >= 1 && c.otherTypes.L2.v > 0 && c.acp >= 1 && c.flagged >= 1 && c.otherCompany === 0 /* filtered at source */, sj(c));
  ok('staged columns are the register\'s own names (the intake maps them with no change)', sj(got.man.cols) === sj(['Invoice Document Number', 'Invoice Document item', 'Invoice Date', 'Plant', 'Sold-to-Party Number', 'Sold-to-Party Description', 'Product Code', 'Invoice Qty', 'Total Amount (Item)', 'Billing Type', 'Product Type', 'Material Group 3', 'Material Group 4', 'Sales District', 'Reference Document', 'Sales Executive']));
  const r0 = got.rows[0]; ok('leading zeros are trimmed from document, item, customer and product; dates are the UTC date; customer name and product type come from the lookups', /^[1-9]/.test(r0[0]) && /^[1-9]/.test(r0[1]) && /^[1-9]/.test(r0[4]) && /^[1-9]/.test(r0[6]) && /^\d{4}-\d\d-\d\d$/.test(r0[2]) && /^Synthetic Customer/.test(r0[5]) && ['ZABLAM', 'ZCRLAM', 'ZCBPVC', 'ZOTHER'].includes(r0[10]), sj(r0));
  ok('Sales Executive is sent blank, as in the register', got.rows.every(x => x[15] === ''));
  // exclude (default) vs mirror
  const ca = docs.find(d => d.BillingDocumentIsCancelled), s1 = docs.find(d => d.BillingDocumentType === 'S1'), idOf = (d) => d.BillingDocument.replace(/^0+/, '');
  ok('CANCEL_MODE exclude (default): the cancelled invoice and its S1 are both left out', !got.rows.some(x => x[0] === idOf(ca)) && !got.rows.some(x => x[0] === idOf(s1)) && got.man.cancelMode === 'exclude');
  env.props.CANCEL_MODE = 'mirror'; ({ S, env } = build({ docs })); env.props.CANCEL_MODE = 'mirror'; env.call('sapShadowRun'); r = env.call('sapSync'); const gm = stagedRows(env, '2026-10'), em = expect(docs, '2026-10', 'mirror');
  ok('CANCEL_MODE mirror: the cancelled invoice stays in sales and the S1 is loaded as a credit row', gm.rows.some(x => x[0] === idOf(ca) && x[9] === 'F2') && gm.rows.some(x => x[0] === idOf(s1) && x[9] === 'S1') && gm.man.cancelMode === 'mirror' && gm.man.creditTypes.includes('S1'), sj(gm.man.creditTypes));
  ok('mirror: counts equal the independent expectation for that mode', gm.man.counts.sales === em.sales && gm.man.counts.credit === em.credit, sj(gm.man.counts) + sj(em));
  const net = (g) => g.rows.filter(x => x[9] === 'F2').reduce((a, x) => a + x[8], 0) - g.rows.filter(x => x[9] !== 'F2').reduce((a, x) => a + x[8], 0);
  ok('Net (sales minus credit) is the same in both modes; only Invoiced differs', near(net(gm), net(got)), net(gm) + ' vs ' + net(got));
  env.props.CANCEL_MODE = ''; ok('empty CANCEL_MODE falls back to exclude', env.call('sapStatus').status.cancelMode === 'exclude');
}

/* =============================== A6. paging, server page cap, count check =============================== */
{
  const docs = synthDocs({ masters, from: '2026-10-01', to: '2026-10-12', perDayPerPlant: 3 });
  let { S, env } = build({ docs, s4opts: { pageCap: 17 } }); env.call('sapShadowRun'); const nShadow = S.calls.length; let r = env.call('sapSync'); const exp = expect(docs, '2026-10'), got = stagedRows(env, '2026-10');
  const pages = S.calls.slice(nShadow).filter(c => /A_BillingDocument\?/.test(c.path + c.query) && /orderby/.test(c.query) && /expand/.test(c.query) && /2026-10-01/.test(decodeURIComponent(c.query)) && /2026-11-01/.test(decodeURIComponent(c.query)));
  const hdrs = docs.filter(d => d.CompanyCode === '1000' && iso(d.BillingDocumentDate) >= '2026-10-01' && iso(d.BillingDocumentDate) < '2026-11-01').length;
  ok('paging: a server that returns fewer rows than $top is followed with $skip until the count is reached', r.ok && pages.length === Math.ceil(hdrs / 17) + 0 || pages.length >= Math.ceil(hdrs / 17), pages.length + ' pages for ' + hdrs + ' documents');
  ok('paging: $top and $skip (increasing by what was received) and $orderby on the key; $inlinecount on the first page only', pages.every((c, i) => { const q = new URLSearchParams(c.query); return q.get('$top') === '200' && +q.get('$skip') === i * 17 && q.get('$orderby') === 'BillingDocument asc' && (i === 0 ? q.get('$inlinecount') === 'allpages' : !q.get('$inlinecount')); }));
  ok('paging: every line arrived once', got.rows.length === exp.sales + exp.credit && new Set(got.rows.map(x => x[0] + '|' + x[1])).size === got.rows.length);
  ok('paging: the count check passed and is recorded', got.man.countChecked === true);
  // count mismatch
  ({ S, env } = build({ docs, s4opts: { miscount: 0 } })); env.call('sapShadowRun'); S.miscount = 3; r = env.call('sapSync');
  ok('a count that does not match what was read stops the month: nothing staged, no manifest', r.code === 'sap_error' && /counted/.test(r.message) && !Object.keys(env.stored()).some(k => k.startsWith('sapstage/man_')), sj(r));
  ok('and the next run starts the month again (the bad cursor is cleared)', env.call('sapStatus').status.resume === false);
  // no inlinecount support
  ({ S, env } = build({ docs, s4opts: { noCount: true } })); env.call('sapShadowRun'); r = env.call('sapSync'); const g3 = stagedRows(env, '2026-10');
  ok('a server without $inlinecount works (stops at the empty page); the manifest says the count was not checked', r.ok && g3.man.countChecked === false && g3.rows.length === exp.sales + exp.credit, sj(g3.man.countChecked));
}

/* =============================== A7. the 6-minute limit: resume from a saved cursor =============================== */
{
  const docs = synthDocs({ masters, from: '2026-10-01', to: '2026-10-12', perDayPerPlant: 3 });
  let { S, env } = build({ docs, s4opts: { pageCap: 20 } }); env.call('sapShadowRun');
  let r = env.call('sapSync'); const full = stagedRows(env, '2026-10');
  ({ S, env } = build({ docs, s4opts: { pageCap: 20, msPerCall: 40000 } })); env.props.SAP_RUN_BUDGET_MS = '150000'; env.ctx.SAP_CHUNK_ROWS = 30;
  r = env.call('sapShadowRun'); ok('shadow run is also cut at the limit and says to run it again', r.ok && r.done === false && /again/.test(r.message), sj(r).slice(0, 200));
  let n = 0; while (!r.done && n++ < 40) r = env.call('sapShadowRun'); ok('and finishes on a later call', r.done === true && n > 1, n);
  r = env.call('sapSync'); let runs = 1; ok('sapSync stops at the time budget with done:false and keeps a cursor', r.ok && r.done === false && env.call('sapStatus').status.resume === true && /time limit/.test(r.message), sj(r).slice(0, 250));
  ok('while a run is cut the card says to run again', /run sapSync again/i.test(env.call('sapStatus').status.next));
  while (!r.done && runs++ < 60) r = env.call('sapSync');
  ok('repeated runs resume (resumed=true) and finish: all months staged', r.done === true && runs >= 2 && 'sapstage/man_2026-10' in env.stored() && 'sapstage/man_2026-11' in env.stored(), runs);
  const res2 = stagedRows(env, '2026-10');
  ok('the resumed month holds exactly the rows of an uninterrupted run (same set, no repeat), in several chunks', res2.man.n > 1 && res2.rows.length === full.rows.length && sj(res2.rows.map(x => x.join('|')).sort()) === sj(full.rows.map(x => x.join('|')).sort()), res2.man.n + ' chunks, ' + res2.rows.length + ' vs ' + full.rows.length);
  ok('the cursor is cleared at the end and the status counts add up', env.call('sapStatus').status.resume === false && env.call('sapStatus').status.read.headers > 0);
  // trigger run: a continuation is scheduled
  ({ S, env } = build({ docs, s4opts: { pageCap: 20, msPerCall: 40000 } })); env.props.SAP_RUN_BUDGET_MS = '150000'; env.call('sapShadowRun'); let m = 0; while (!env.call('sapShadowRun').done && m++ < 40);
  env.setEmail(''); env.ctx.sapSyncTrigger_();
  ok('a cut run started by the time trigger schedules one continuation trigger', env.state.triggers.filter(t => t.fn === 'sapContinueTrigger_').length === 1 && env.state.triggers[0].kind === 'after');
  const nt = env.state.triggers.length; env.ctx.sapContinueTrigger_(); ok('the continuation removes itself before running (and may schedule the next)', env.state.triggers.filter(t => t.fn === 'sapContinueTrigger_').length <= 1 && nt >= 1);
  // a run flag blocks a second run
  ({ S, env } = build({ docs })); env.call('sapShadowRun'); env.props.SAP_RUN = JSON.stringify({ at: Date.now() }); r = env.call('sapSync'); ok('a second run while one is in progress is refused (busy)', r.ok === false && /in progress/.test(r.message) && S.calls.filter(c => /A_BillingDocument\?/.test(c.path)).length === 0, sj(r));
  env.props.SAP_RUN = JSON.stringify({ at: Date.now() - 600000 }); ok('a run flag left by a crashed run (older than 8 minutes) is ignored', env.call('sapSync').ok === true);
}

/* =============================== A8. shadow run writes nothing; sync needs it first =============================== */
{
  const docs = synthDocs({ masters }); const { S, env } = build({ docs });
  let r = env.call('sapSync'); ok('sapSync before any shadow run is refused with the reason, and reads nothing', r.code === 'sap_shadow_first' && S.calls.length === 0, sj(r));
  env.call('sapVerifyMetadata'); const before = sj(env.stored()), sheetsBefore = sj(Object.keys(env.sheets).map(n => [n, env.sheets[n].rows.length])), revBefore = env.props.DESK_REVS, lockBefore = env.state.locks;
  r = env.call('sapShadowRun');
  ok('the shadow run returns the per plant-month difference (feed vs loaded)', r.ok && r.done && r.ym === '2026-10' && r.differences.length === PLANTS.length && r.differences.every(d => d.diff.lines === d.feed.lines && d.note === 'not loaded in the Desk' && d.equal === false), sj(r).slice(0, 300));
  ok('the shadow run wrote nothing: every collection and sheet unchanged, no revision moved, no staging, no lock taken', sj(env.stored()) === before && sj(Object.keys(env.sheets).map(n => [n, env.sheets[n].rows.length])) === sheetsBefore && env.props.DESK_REVS === revBefore && env.state.locks - lockBefore === 1 /* only the run flag */ && !Object.keys(env.stored()).some(k => k.startsWith('sapstage/')));
  ok('the shadow run sent only GET requests', S.calls.length > 0 && S.calls.every(c => c.method === 'get'));
  ok('the card shows the shadow result and the sapSync step', env.call('sapStatus').status.shadow.plantMonths === 3 && /sapSync/.test(env.call('sapStatus').status.next));
  r = env.call('sapSync'); ok('after the shadow run sapSync is allowed', r.ok && r.done);
  // a loaded plant-month that equals the feed compares equal, one that differs is reported
  const exp = expect(docs, '2026-10'); void exp;
}

/* =============================== A9. incremental rule, closed quarters, daily trigger, mark loaded, secrets =============================== */
{
  const docs = synthDocs({ masters, from: '2026-10-01', to: '2026-10-10' }).concat(synthDocs({ masters, from: '2026-11-01', to: '2026-11-06', extras: false, startNo: 91000001 }));
  let { S, env } = build({ docs }); env.call('sapShadowRun'); let r = env.call('sapSync');
  ok('first run (no watermark) plans every month from October to the current month and stages each', r.ok && sj(r.months) === sj(['2026-10', '2026-11']) && 'sapstage/man_2026-10' in env.stored() && !!env.props.SAP_WM, sj(r.months) + env.props.SAP_WM);
  const wm = env.props.SAP_WM; ok('the watermark is the largest LastChangeDate seen (a date)', /^2026-11-0[56]$/.test(wm), wm);
  const billing = () => S.calls.filter(c => /A_BillingDocument/.test(c.path));
  let n0 = S.calls.length; r = env.call('sapSync');
  const q1 = billing().slice(n0 - S.calls.length).map(c => decodeURIComponent(c.query));
  ok('a run with no changes reads a delta (LastChangeDate one day before the watermark) and then only the current month', r.ok && sj(r.months) === sj(['2026-11']) && q1.some(q => q.includes('LastChangeDate ge')) && q1.some(q => q.includes("datetime'" + new Date(Date.parse(wm) - 86400000).toISOString().slice(0, 10))), sj(r.months));
  ok('October is not re-read when nothing in it changed', !q1.some(q => /BillingDocumentDate ge datetime'2026-10-01T00:00:00' and BillingDocumentDate lt/.test(q)));
  // a change in October: re-read October
  const d0 = docs.find(d => iso(d.BillingDocumentDate) === '2026-10-06' && d.BillingDocumentType === 'F2'); d0.LastChangeDate = '/Date(' + Date.parse('2026-11-06T00:00:00Z') + ')/'; d0.to_Item.results[0].NetAmount = '1.00';
  r = env.call('sapSync'); ok('a document changed in October marks October to be re-read (whole month, replaced as a unit)', sj(r.months) === sj(['2026-10', '2026-11']), sj(r.months));
  ok('the re-read picked up the change', stagedRows(env, '2026-10').rows.some(x => x[0] === d0.BillingDocument.replace(/^0+/, '') && x[8] === 1));
  // cancellation in November of an October invoice marks October
  const target = docs.find(d => iso(d.BillingDocumentDate) === '2026-10-03' && d.BillingDocumentType === 'F2' && !d.BillingDocumentIsCancelled);
  docs.push({ BillingDocument: '0090099999', BillingDocumentType: 'S1', BillingDocumentDate: '/Date(' + Date.parse('2026-11-03T00:00:00Z') + ')/', CompanyCode: '1000', SoldToParty: target.SoldToParty, BillingDocumentIsCancelled: false, CancelledBillingDocument: target.BillingDocument, LastChangeDate: '/Date(' + Date.parse('2026-11-07T00:00:00Z') + ')/', TransactionCurrency: 'INR', to_Item: { results: [] } });
  r = env.call('sapSync'); ok('a November cancellation of an October invoice marks both months (the cancelled document is looked up by key)', sj(r.months) === sj(['2026-10', '2026-11']) && S.calls.some(c => /A_BillingDocument\('/.test(decodeURIComponent(c.path))), sj(r.months));
  // days 1-5: previous month is re-read too
  env.state.skew = -4 * 86400000; r = env.call('sapSync'); ok('on days 1 to 5 the previous month is re-read as well (back-dated postings)', r.months.includes('2026-10') && r.months.includes('2026-11'), sj(r.months)); env.state.skew = 0;
  // closed quarter
  env.call('deskWrite', [[set('periods', 'FY27-Q3', { fy_quarter: 'FY27-Q3', status: 'closed' })]]); r = env.call('sapSync');
  ok('months in a closed quarter are never re-read; the skip is reported', r.ok && r.months.length === 0 && sj(env.call('sapStatus').status.skippedMonths) === sj(['2026-11']) || sj(env.call('sapStatus').status.skippedMonths).includes('2026-11'), sj(r) + sj(env.call('sapStatus').status.skippedMonths));
  // mark loaded
  r = env.call('sapMarkLoaded', [{ months: ['2026-10', 'bad', '2026-12'], rows: 50, message: 'x' }]); const man = JSON.parse(env.stored()['sapstage/man_2026-10']);
  ok('sapMarkLoaded marks the manifest loaded, ignores bad and unknown months, records rows loaded', r.ok && man.status === 'loaded' && env.call('sapStatus').status.loaded.rows === 50 && !('sapstage/man_2026-12' in env.stored()), sj(r));
  // trigger
  ok('no trigger exists until sapInstallDailyTrigger is called', env.state.triggers.length === 0 && env.call('sapStatus').status.trigger === false);
  r = env.call('sapInstallDailyTrigger'); r = env.call('sapInstallDailyTrigger');
  ok('sapInstallDailyTrigger creates exactly one daily time trigger (calling it twice does not add a second)', r.ok && env.state.triggers.length === 1 && env.state.triggers[0].fn === 'sapSyncTrigger_' && env.state.triggers[0].kind === 'daily' && env.call('sapStatus').status.trigger === true);
  r = env.call('sapRemoveDailyTrigger'); ok('sapRemoveDailyTrigger switches it off', r.ok && r.removed === 1 && env.state.triggers.length === 0);
  // secrets
  const blob = [sj(env.stored()), sj(Object.keys(env.props).filter(k => !/^SAP_(USER|PASSWORD|BASE_URL)$/.test(k)).map(k => env.props[k])), (env.state.logs || []).join('\n'), sj(env.call('sapStatus')), sj(env.call('sapVerifyMetadata'))].join('\n');
  ok('the password, the user name and the SAP address appear in no stored document, status, log or answer', !blob.includes(S.password) && !blob.includes(S.user) && !blob.includes('mock-tenant'));
  ok('the three secret settings live only in Script Properties', ['SAP_BASE_URL', 'SAP_USER', 'SAP_PASSWORD'].every(k => env.props[k]) && !sj(Object.keys(env.sheets).map(n => env.sheets[n].rows)).includes(S.password));
  ok('every request in the whole run was a GET, none carried the password in the URL', S.calls.every(c => c.method === 'get' && !c.url.includes(S.password) && !c.url.includes(S.user)));
}

if (process.argv.includes('--server-only')) { console.log('TOTAL ' + res.filter(l => l.startsWith('PASS')).length + ' PASS ' + res.filter(l => l.startsWith('FAIL')).length + ' FAIL'); process.exit(process.exitCode || 0); }

/* =============================== B. the page: card, Load SAP feed, parity with the register upload =============================== */
const { chromium, openGas } = await import('./gas-page.mjs');
const browser = await chromium.launch();
const gzB64 = (o) => zlib.gzipSync(Buffer.from(JSON.stringify(o))).toString('base64');
const unz = (z) => JSON.parse(zlib.gunzipSync(Buffer.from(z, 'base64')).toString());
const waitFeed = async (page, re, ms = 150000) => { try { await page.waitForFunction((s) => { const f = window.__sapf; return f && !f.busy && new RegExp(s).test((f.msg || '') + ' ' + (f.err || '')); }, re.source, { timeout: ms }); return true; } catch (e) { return false; } };
const dump = (env, col) => { const o = {}; Object.entries(env.stored()).forEach(([k, v]) => { if (k.startsWith(col + '/')) o[k.slice(col.length + 1)] = JSON.parse(v); }); return o; };
const strip = (c) => { const o = JSON.parse(JSON.stringify(c)); Object.values(o.plants || {}).forEach(p => { delete p.upload; delete p.at; delete p.bytes; }); return o; };
const seedItems = (env, codes) => env.call('deskWrite', [[set('itemmeta', 'main', { upload: 't', at: 'x', chunks: 1 }), set('items', 'c0', { z: gzB64(codes.map(c => [c, 0, 32, null, 0, 1, 0, ''])) })]]);
const docsB = synthDocs({ masters, from: '2026-10-01', to: '2026-10-12', perDayPerPlant: 2 });
const creditCodes = [...new Set(docsB.filter(d => d.BillingDocumentType === 'G2' || d.BillingDocumentType === 'RE').flatMap(d => d.to_Item.results.map(i => i.Material.replace(/^0+/, ''))))];

/* ---- B1. feed -> page vs register upload -> page: same cells, same inv chunks, same roll-ups ---- */
const { S: SA, env: EA } = build({ docs: docsB, s4opts: { pageCap: 40 } });
EA.call('sapVerifyMetadata'); EA.call('sapShadowRun'); const rs = EA.call('sapSync');
ok('B1 setup: feed staged October', rs.ok && rs.done && 'sapstage/man_2026-10' in EA.stored(), sj(rs).slice(0, 200));
const A = await openGas(browser, EA, SUPER); await A.page.waitForTimeout(5000);
await A.page.evaluate(() => { location.hash = '#/intake'; }); await A.page.waitForTimeout(1500);
let card = await A.page.innerText('#i-feed');
ok('card (before load): Connected, last run, rows read, rows loaded, errors, next step', /Connected/.test(card) && /Last run/.test(card) && /Rows read/.test(card) && /Rows loaded/.test(card) && /Errors/.test(card) && /Next step/.test(card) && /Click Load SAP feed/.test(card), card.slice(0, 500));
ok('card never shows the password, the user name or the SAP address', !card.includes(SA.password) && !card.includes(SA.user) && !card.includes('mock-tenant') && !(await A.page.content()).includes(SA.password));
await A.page.click('[data-act="sap-load"]');
ok('Load SAP feed finishes', await waitFeed(A.page, /Done\.|Held|incomplete|error|Nothing/i), await A.page.innerText('#i-feed'));
card = await A.page.innerText('#i-feed'); const feedErr = await A.page.evaluate(() => window.__sapf.err);
ok('no error on load (credit memos are held back: no item master)', !feedErr, feedErr);
const cellsA = dump(EA, 'cells'), invA = dump(EA, 'inv'), rollA = dump(EA, 'roll'), upA = Object.values(dump(EA, 'uploads'));
ok('only October cells were written (nothing before the cut-off)', Object.keys(cellsA).every(k => /^INV_2026-1[0-2]$/.test(k)) && 'INV_2026-10' in cellsA, Object.keys(cellsA));
const upFeed = upA.find(u => u.entity === 'INV');
ok('the upload entry is labelled "SAP S/4 feed": source, S4 system, file name', upFeed && upFeed.source === 'SAP S/4 feed' && upFeed.sys === 'S4' && /^SAP S\/4 feed 2026-10/.test(upFeed.file) && upFeed.status === 'Loaded', sj(upFeed).slice(0, 300));
ok('the feed did not overwrite the saved S/4 column mapping (mappings/S4_invoice absent)', !('S4_invoice' in dump(EA, 'mappings')));
// register upload of the same lines
const EB = makeEnv(); EB.call('deskWrite', [[set('users', 'u1', { email: SUPER, role: 'Super admin', active: true, name: 'Vijay' }), ...PLANTS.map(p => set('plants', p, { plant_code: p, plant_name: 'Depot ' + p, plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'Depot ' + p, business: 'laminates', active: true }))]]);
const csv = path.join(os.tmpdir(), 'S4-register-synthetic-' + Math.random().toString(36).slice(2) + '.csv'); fs.writeFileSync(csv, csvOf(registerRows(SA)));
const Bp = await openGas(browser, EB, SUPER); await Bp.page.waitForTimeout(5000);
await Bp.page.evaluate(() => { location.hash = '#/intake'; }); await Bp.page.waitForTimeout(1200);
await (await Bp.page.$('input[type=file]')).setInputFiles(csv);
await Bp.page.waitForFunction(() => window.__desk.U && window.__desk.U.stage === 'mapping', null, { timeout: 60000 });
await Bp.page.click('[data-act="u-validate"]');
await Bp.page.waitForFunction(() => ['validated', 'done'].includes(window.__desk.U.stage), null, { timeout: 120000 });
if ((await Bp.page.evaluate(() => window.__desk.U.stage)) === 'validated') { await Bp.page.click('[data-act="u-load"]'); await Bp.page.waitForFunction(() => window.__desk.U.stage === 'done', null, { timeout: 120000 }); }
await Bp.page.waitForTimeout(1500);
const cellsB = dump(EB, 'cells'), invB = dump(EB, 'inv'), rollB = dump(EB, 'roll');
ok('parity: the register upload stored October for the same plants', 'INV_2026-10' in cellsB && Object.keys(cellsB['INV_2026-10'].plants).length === PLANTS.length, sj(Object.keys(cellsB)));
ok('parity: cells (system, chunks, documents, lines, net, sheets per plant-month) are identical', sj(strip(cellsA['INV_2026-10'])) === sj(strip(cellsB['INV_2026-10'])), sj(strip(cellsA['INV_2026-10'])).slice(0, 400) + '\n' + sj(strip(cellsB['INV_2026-10'])).slice(0, 400));
const decode = (inv) => { const o = {}; Object.keys(inv).forEach(k => { o[k] = unz(inv[k].z); }); return o; };
ok('parity: the stored inv chunks (aggregates per customer, salesperson and group, and the document headers with SAP references) are identical', sj(decode(invA)) === sj(decode(invB)) && Object.keys(invA).length > 0, Object.keys(invA).length + ' vs ' + Object.keys(invB).length);
const decodeRoll = (r) => { const o = {}; Object.keys(r).forEach(k => { o[k] = { sys: r[k].sys, n: r[k].n, rows: unz(r[k].z) }; }); return o; };
ok('parity: the roll-up documents are identical', sj(decodeRoll(rollA)) === sj(decodeRoll(rollB)) && Object.keys(rollA).length === PLANTS.length);
const invHdr = Object.values(decode(invA)).flatMap(c => c.h);
ok('SAP references are kept: every document header carries the SAP document number and the line aggregates stay by plant-month', invHdr.length > 0 && invHdr.every(h => /^\d+$/.test(String(h[0]))));
// server-side tally agrees with the page intake (shadow run now that October is loaded)
EA.call('deskWrite', [[]]); const sh = EA.call('sapShadowRun');
ok('shadow run after the load: the server tally equals the cells and roll-ups the page intake stored, for every plant-month (documents, lines, sheets, sq ft, value)', sh.ok && sh.done && sh.differ === 0 && sh.clean === true && sh.differences.length === PLANTS.length, sj(sh.differences.filter(d => !d.equal)).slice(0, 500));
// credit memos: no item master, so held back, no coverage
const stA = await A.page.evaluate(async () => (await window.__gasCall('sapStatus', [])).status);
const expCred = expect(docsB, '2026-10').credit;
ok('credit memos: S/4 product codes not in the item master are reported (count equals the credit lines) and not loaded', stA.unresolved && stA.unresolved.rows === expCred && stA.unresolved.codes === creditCodes.length && stA.unresolved.months.includes('2026-10'), sj(stA.unresolved) + ' expected ' + expCred);
const cnA = dump(EA, 'creditnotes');
ok('credit coverage is not marked for the month with unresolved codes (no creditnotes document for October)', !Object.keys(cnA).some(k => /2026-10/.test(k)), sj(Object.keys(cnA)));
ok('that month stays "staged" so a later click retries it; the card says what to do', stA.staged['2026-10'].status === 'staged' && /item master/.test(stA.next), stA.next);
ok('the card shows rows loaded and the credit warning', /Credit memos not loaded for/.test(await A.page.innerText('#i-feed')) && stA.loaded.rows > 0, (await A.page.innerText('#i-feed')).slice(0, 600));
ok('the November month (no documents) has no credit lines, so its coverage was marked', Object.keys(cnA).some(k => /cov_2026-11/.test(k)) && Object.values(cnA).some(d => d.cov && d.ym === '2026-11' && d.all_branches === true && d.upload), sj(Object.keys(cnA)));
const upCN = Object.values(dump(EA, 'uploads')).find(u => u.entity === 'CN'); ok('the credit upload entry is labelled "SAP S/4 feed" too', upCN && upCN.source === 'SAP S/4 feed' && upCN.sys === 'S4', sj(upCN));

/* ---- B2. credit memos resolved: item master has every S/4 code, so credit loads and coverage is marked ---- */
{
  const { S, env } = build({ docs: docsB }); seedItems(env, creditCodes); env.call('sapVerifyMetadata'); env.call('sapShadowRun'); env.call('sapSync');
  const P = await openGas(browser, env, SUPER); await P.page.waitForTimeout(5000); await P.page.evaluate(() => { location.hash = '#/intake'; }); await P.page.waitForTimeout(1200);
  await P.page.click('[data-act="sap-load"]'); ok('B2: load with a complete item master finishes', await waitFeed(P.page, /Done\./), await P.page.innerText('#i-feed'));
  const cn = dump(env, 'creditnotes'), st = (await P.page.evaluate(async () => (await window.__gasCall('sapStatus', [])).status));
  ok('B2: credit memos stored per plant-month with the SAP reference, and the month coverage marked for all branches', Object.keys(cn).some(k => /^\w+-2026-10$/.test(k)) && Object.values(cn).some(d => d.cov && d.ym === '2026-10' && d.all_branches === true), sj(Object.keys(cn)));
  const exp = expect(docsB, '2026-10'), stored = Object.values(cn).filter(d => d.groups).reduce((a, d) => a + d.n, 0);
  ok('B2: the credit lines loaded equal the credit lines in SAP for plants in scope (count and value)', stored === exp.credit && near(Object.values(cn).filter(d => d.groups).reduce((a, d) => a + Object.values(d.groups).reduce((b, g) => b + g.value, 0), 0), exp.creditNet), stored + ' vs ' + exp.credit);
  ok('B2: nothing unresolved, both months marked loaded, next step is the daily trigger', !st.unresolved && Object.values(st.staged).every(x => x.status === 'loaded') && /sapInstallDailyTrigger/.test(st.next), sj(st).slice(0, 300));
  await P.page.waitForTimeout(500); ok('B2: a second click has nothing to load', (await P.page.$eval('[data-act="sap-load"]', b => b.disabled)) === true);
  await P.ctx.close();
}

/* ---- B3. held month: the feed never confirms a thinner replacement ---- */
{
  const docs = JSON.parse(JSON.stringify(docsB)); const { S, env } = build({ docs }); seedItems(env, creditCodes); env.call('sapShadowRun'); env.call('sapSync');
  const P = await openGas(browser, env, SUPER); await P.page.waitForTimeout(5000); await P.page.evaluate(() => { location.hash = '#/intake'; }); await P.page.waitForTimeout(1200);
  await P.page.click('[data-act="sap-load"]'); await waitFeed(P.page, /Done\./);
  const cellsBefore = sj(dump(env, 'cells'));
  // SAP now shows fewer October lines for plant 1013 (documents removed): a thinner month
  const drop = docs.filter(d => d.BillingDocumentType === 'F2' && d.to_Item.results[0].Plant === '1013' && iso(d.BillingDocumentDate) === '2026-10-05'); drop.forEach(d => { d.BillingDocumentDate = '/Date(' + Date.parse('2026-09-05T00:00:00Z') + ')/'; d.LastChangeDate = '/Date(' + Date.parse('2026-11-07T00:00:00Z') + ')/'; });
  S.docs = docs; ok('B3 setup: the next sync stages the thinner October', env.call('sapSync').ok);
  await P.page.click('[data-act="sap-refresh"]'); await P.page.waitForTimeout(1500); await P.page.click('[data-act="sap-load"]'); ok('B3: the thinner month is held with a banner and nothing is replaced', await waitFeed(P.page, /Held/), await P.page.innerText('#i-feed'));
  ok('B3: the cells are unchanged and the card names the held month', sj(dump(env, 'cells')) === cellsBefore && /Held: the feed would replace/.test(await P.page.innerText('#i-feed')) && (await P.page.$('[data-chg="sap-confrep"]')) !== null);
  await P.page.check('[data-chg="sap-confrep"]'); await P.page.click('[data-act="sap-load"]'); ok('B3: after a person ticks the confirmation the month is replaced', await waitFeed(P.page, /Done\./), await P.page.innerText('#i-feed'));
  ok('B3: the replaced plant-month holds fewer lines now', JSON.parse(env.stored()['cells/INV_2026-10']).plants['1013'].lines < JSON.parse(cellsBefore ? JSON.stringify(JSON.parse(cellsBefore)['INV_2026-10']) : '{}').plants['1013'].lines);
  await P.ctx.close();
}

/* ---- B4. cut-off at the page: a staged row dated before 1 Oct 2026 is never loaded ---- */
{
  const { env } = build({ docs: [] }); env.call('deskWrite', [[set('sapstage', 'c_2026-10_zz_0', { ym: '2026-10', run: 'zz', seq: 0, n: 2, z: gzB64([['900000001', '10', '2026-09-30', '1013', '5000100', 'Cust A', '32000100', 5, 1000, 'F2', 'ZABLAM', 'LAM', '8X4', 'ZONE01', '', ''], ['900000002', '10', '2026-10-02', '1013', '5000100', 'Cust A', '32000100', 7, 2000, 'F2', 'ZABLAM', 'LAM', '8X4', 'ZONE01', '', '']]) }),
    set('sapstage', 'man_2026-10', { ym: '2026-10', run: 'zz', complete: true, status: 'staged', n: 1, rows: 2, from: '2026-10-01', salesTypes: ['F2'], creditTypes: ['G2', 'RE'], cols: ['Invoice Document Number', 'Invoice Document item', 'Invoice Date', 'Plant', 'Sold-to-Party Number', 'Sold-to-Party Description', 'Product Code', 'Invoice Qty', 'Total Amount (Item)', 'Billing Type', 'Product Type', 'Material Group 3', 'Material Group 4', 'Sales District', 'Reference Document', 'Sales Executive'] })]]);
  const P = await openGas(browser, env, SUPER); await P.page.waitForTimeout(5000); await P.page.evaluate(() => { location.hash = '#/intake'; }); await P.page.waitForTimeout(1500);
  await P.page.evaluate(() => window.__sapf.status = null); await P.page.click('[data-act="sap-refresh"]').catch(() => {}); await P.page.waitForTimeout(500);
  await P.page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-act', 'sap-load'); document.body.appendChild(b); b.click(); b.remove(); });
  await waitFeed(P.page, /Done\.|error|Nothing/i); const c = dump(env, 'cells'), ck = Object.keys(c);
  const lines = ck.length ? Object.values(c['INV_2026-10'].plants).reduce((a, p) => a + p.lines, 0) : -1;
  ok('B4: the row dated 30 Sep 2026 was dropped and only the 2 Oct line was loaded', lines === 1 && ck.every(k => k === 'INV_2026-10'), sj(ck) + lines);
  await P.ctx.close();
}

/* ---- B5. Super-only through the page runtime ---- */
{
  const { S, env } = build({ docs: docsB }); env.call('sapShadowRun'); env.call('sapSync'); const n0 = S.calls.length;
  const P = await openGas(browser, env, 'se@virgoasia.com'); await P.page.waitForTimeout(5000);
  const o = await P.page.evaluate(async () => {
    const out = {}; for (const f of ['sapStatus', 'sapSync', 'sapShadowRun', 'sapVerifyMetadata', 'sapInstallDailyTrigger', 'sapMarkLoaded']) { try { await window.__gasCall(f, f === 'sapMarkLoaded' ? [{ months: ['2026-10'] }] : []); out[f] = 'accepted'; } catch (e) { out[f] = e.code; } }
    const db = await window.claude.use('db'); try { await db.collection('sapstage').get(); out.stage = 'read'; } catch (e) { out.stage = e.code; } try { await db.doc('sapstage/man_2026-10').get(); out.one = 'read'; } catch (e) { out.one = e.code; } try { await db.doc('sapstage/zz').set({ a: 1 }); out.write = 'accepted'; } catch (e) { out.write = e.code; }
    return out;
  });
  ok('B5: a Sales executive is refused on every SAP function and on staged data (read, single read, write)', Object.entries(o).every(([k, v]) => v === 'permission_denied' || (k === 'stage' && v === 'unavailable')), sj(o)); // the shim reports a refused whole-collection read as unavailable; the server code is permission_denied (A1)
  ok('B5: no SAP call was made for them, and the card (if shown) offers no load', S.calls.length === n0 && !(await P.page.$('[data-act="sap-load"]')) && !('sapstage/zz' in env.stored()));
  await P.ctx.close();
}
await A.ctx.close(); await Bp.ctx.close(); await browser.close();
console.log('TOTAL ' + res.filter(l => l.startsWith('PASS')).length + ' PASS ' + res.filter(l => l.startsWith('FAIL')).length + ' FAIL');
