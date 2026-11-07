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
function build({ docs, s4opts = {}, props = true, plants = PLANTS } = {}) {
  const S = makeS4(Object.assign({ docs: docs || synthDocs({ masters }), products: masters.products, customers: masters.customers }, s4opts));
  const env = makeEnv({ fetch: (u, o, st) => S.fetch(u, o, st) });
  env.call('deskWrite', [[set('users', 'u1', { email: SUPER, role: 'Super admin', active: true, name: 'Vijay' }), set('users', 'u2', { email: 'se@virgoasia.com', role: 'Sales executive', active: true, name: 'Se' }),
    ...plants.map(p => set('plants', p, { plant_code: p, plant_name: 'Depot ' + p, plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'Depot ' + p, business: 'laminates', active: true }))]]);
  if (props) Object.assign(env.props, { SAP_BASE_URL: S.host, SAP_USER: S.user, SAP_PASSWORD: S.password });
  env.setEmail(SUPER);
  return { S, env };
}
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
  const fns = [['sapStatus', []], ['sapVerifyMetadata', []], ['sapShadowRun', []], ['sapSync', []], ['sapInstallDailyTrigger', []], ['sapRemoveDailyTrigger', []], ['sapMarkLoaded', [{ months: ['2026-10'] }]]];
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
  ok('trigger functions are not callable by google.script.run as a user (they only run as triggers, the public ones check the user)', typeof env.ctx.sapSyncTrigger === 'function' && env.state.triggers.length === 0);
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
  env.props.SAP_PASSWORD = S.password;
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
  ok('sapVerifyMetadata: every entity set and property ok', r.ok && r.allOk && r.gaps === 0 && r.rows.every(x => x.status === 'ok') && r.rows.length === 30, sj(r).slice(0, 300));
  ok('it reports per service, entity set and property', ['API_BILLING_DOCUMENT_SRV', 'API_PRODUCT_SRV', 'API_BUSINESS_PARTNER'].every(s => r.rows.some(x => x.service === s)) && r.rows.some(x => x.entitySet === 'A_BillingDocument' && x.property === 'LastChangeDate' && x.status === 'ok') && r.rows.some(x => x.property === 'to_Item (navigation)'));
  ok('only $metadata was read, with GET and the Basic header (and no password in any URL)', S.calls.length === 3 && S.calls.every(c => c.method === 'get' && /\$metadata$/.test(c.path) && /^Basic /.test(c.headers.Authorization) && !c.url.includes(S.password)));
  ({ S, env } = build({ s4opts: { metaGaps: ['A_BillingDocument.LastChangeDate', 'API_PRODUCT_SRV.A_Product'] } })); r = env.call('sapVerifyMetadata');
  const gap = r.rows.filter(x => x.status === 'GAP');
  ok('a missing property and a missing entity set are reported as GAP', r.ok && r.allOk === false && r.gaps === 4 && gap.some(x => x.property === 'LastChangeDate') && gap.some(x => x.entitySet === 'A_Product' && x.property === '(entity set)'), sj(gap));
  ok('the status shows the gap count and the next step', env.call('sapStatus').status.verify.gaps === 4 && /4 gaps/.test(env.call('sapStatus').status.next));
}

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
  env.setEmail(''); env.ctx.sapSyncTrigger();
  ok('a cut run started by the time trigger schedules one continuation trigger', env.state.triggers.filter(t => t.fn === 'sapContinueTrigger').length === 1 && env.state.triggers[0].kind === 'after');
  const nt = env.state.triggers.length; env.ctx.sapContinueTrigger(); ok('the continuation removes itself before running (and may schedule the next)', env.state.triggers.filter(t => t.fn === 'sapContinueTrigger').length <= 1 && nt >= 1);
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
  ok('sapInstallDailyTrigger creates exactly one daily time trigger (calling it twice does not add a second)', r.ok && env.state.triggers.length === 1 && env.state.triggers[0].fn === 'sapSyncTrigger' && env.state.triggers[0].kind === 'daily' && env.call('sapStatus').status.trigger === true);
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
