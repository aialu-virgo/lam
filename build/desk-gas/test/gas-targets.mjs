/* Targets & Potential by State on the Apps Script build (D70, D71, D77-D80): the server's write rules allow the tab's saves
   (potential and phasing: any active user, page-enforced; planlocks: Management / Super admin), the geography master is an admin collection
   (Super admin and Management / HO write), unknown and inactive users are refused, and the SAP customer feed hook loads staged customers. */
import { makeEnv } from './gas-env.mjs';
import { chromium, openGas } from './gas-page.mjs';
const res = []; const ok = (n, c, d) => { const l = (c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || '')); console.log(l); res.push(l); if (!c) process.exitCode = 1; };
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const browser = await chromium.launch(); const env = makeEnv();
env.setEmail('data@virgoasia.com');
const usr = (email, name, role, plants) => set('users', email.replace(/[^a-z0-9]/g, '_'), { email, name, role, department: 'Sales', plant_codes: plants, reports_to_email: '', whatsapp_number: '', today_cap: 5, active: true, sales_employee_code: '' });
let A = await openGas(browser, env, 'data@virgoasia.com'); await A.page.waitForTimeout(6000);
let r = env.call('deskWrite', [[usr('bm@virgoasia.com', 'Branch Mgr', 'Branch / depot manager', '1012'), usr('mg@virgoasia.com', 'Mgmt', 'Management / HO', ''), usr('hod@virgoasia.com', 'Hod', 'HOD', ''),
  set('plants', '1012', { plant_code: '1012', plant_name: 'Depot 1012', plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'Depot 1012', business: 'laminates', active: true }),
  set('geography', 'st_27', { kind: 'state', state_code: '27', state_name: 'Maharashtra', aliases: 'MH|SAP:13', default_plant_code: '1012', active: true, map_source: 'entered' }),
  set('geography', 'di_mh_pune', { kind: 'district', district_id: 'MH-PUNE', state_code: '27', district_name: 'Pune', responsible_plant_code: '1012', map_source: 'entered', active: true })]]);
ok('seed users, a plant and the geography master (Super admin)', r.ok && r.results.every(x => x.ok), JSON.stringify(r));
env.setEmail('mg@virgoasia.com');
ok('Management / HO writes the geography master (Admin › Geography, D80)', env.call('deskWrite', [[set('geography', 'st_24', { kind: 'state', state_code: '24', state_name: 'Gujarat', default_plant_code: '', active: true })]]).ok);
env.setEmail('bm@virgoasia.com');
ok('a Branch manager cannot write the geography master (admin collection)', env.call('deskWrite', [[set('geography', 'st_29', { kind: 'state' })]]).code === 'permission_denied' && !('geography/st_29' in env.stored()));
env.setEmail('data@virgoasia.com');
const K = 'geo_fy27_q3_27_state_laminate_all';
const D = (st, k) => (st[k] ? JSON.parse(st[k]) : null);
const fill = async (page, f, v) => { const s = '#tp-' + f + '-' + K; await page.fill(s, v); await page.dispatchEvent(s, 'change'); await page.waitForTimeout(250); };
env.setEmail('bm@virgoasia.com');
const B = await openGas(browser, env, 'bm@virgoasia.com'); await B.page.waitForTimeout(6000);
await B.page.evaluate(() => { location.hash = '#/targets'; }); await B.page.waitForTimeout(1500);
ok('Branch manager opens Targets & Potential by state on Apps Script (Maharashtra, default plant 1012: inputs)', await B.page.evaluate((k) => !!document.querySelector('#tp-pot-' + k), K));
await fill(B.page, 'pot', '2,00,00,000'); await fill(B.page, 'share', '50');
await B.page.click('[data-act="tp-save"]'); await B.page.waitForTimeout(2500);
let st = env.stored();
ok('Save draft writes the state record to potential (open to active users): Draft, state 27, by the Branch manager', D(st, 'potential/' + K) && D(st, 'potential/' + K).status === 'Draft' && D(st, 'potential/' + K).state_code === '27' && D(st, 'potential/' + K).revisions[0].by === 'bm@virgoasia.com', st['potential/' + K]);
await B.page.click('[data-act="tp-submit"]'); await B.page.waitForSelector('#tp-s-reason');
await B.page.fill('#tp-s-reason', 'Dealer survey'); await B.page.fill('#tp-s-part', 'Branch team'); await B.page.click('[data-act="tp-submit-go"]'); await B.page.waitForTimeout(2500);
st = env.stored();
ok('Submit writes the revision (Proposed = Discussed) through the same rule', D(st, 'potential/' + K).status === 'Discussed');
/* phasing: shared collection, a Branch manager's save succeeds */
await B.page.evaluate(() => { document.querySelector('details.tp-row').open = true; }); await B.page.waitForTimeout(300);
await B.page.check('input[name^="tp-ph-"][value="custom"]'); await B.page.waitForTimeout(300);
for (const [i, v] of [['0', '30'], ['1', '30'], ['2', '40']]) { const s = '[id^="tp-phc-"][data-i="' + i + '"]'; await B.page.fill(s, v); await B.page.dispatchEvent(s, 'change'); await B.page.waitForTimeout(150); }
await B.page.click('[data-act="tp-save"]'); await B.page.waitForTimeout(2500);
const msg = await B.page.innerText('#tp-msg'); st = env.stored();
ok('Phasing by a Branch manager is saved (shared collection): custom 30/30/40 written, potential untouched', !/Phasing not saved/.test(msg) && D(st, 'phasing/geo_fy27_q3_27_state_laminate') && D(st, 'phasing/geo_fy27_q3_27_state_laminate').pct.join() === '30,30,40' && D(st, 'potential/' + K).status === 'Discussed', msg);
env.setEmail('stranger@virgoasia.com');
const ur = env.call('deskWrite', [[set('phasing', 'zz', { pct: [1, 1, 98] }), set('potential', 'zz', { v: 1 })]]);
ok('Unknown user is refused on phasing and potential; nothing written', !ur.ok && !('phasing/zz' in env.stored()) && !('potential/zz' in env.stored()), JSON.stringify(ur));
env.call('deskWrite', [[]]);
env.setEmail('data@virgoasia.com');
env.call('deskWrite', [[usr('off@virgoasia.com', 'Off', 'Branch / depot manager', '1012')]]);
const offU = JSON.parse(env.stored()['users/off_virgoasia_com']); offU.active = false;
env.call('deskWrite', [[set('users', 'off_virgoasia_com', offU)]]);
env.setEmail('off@virgoasia.com');
const ir = env.call('deskWrite', [[set('phasing', 'yy', { pct: [1, 1, 98] })]]);
ok('Inactive user is refused on phasing; nothing written', !ir.ok && !('phasing/yy' in env.stored()), JSON.stringify(ir));
/* Management approves and locks */
env.setEmail('mg@virgoasia.com');
const M = await openGas(browser, env, 'mg@virgoasia.com'); await M.page.waitForTimeout(6000);
await M.page.evaluate(() => { location.hash = '#/targets'; }); await M.page.waitForTimeout(1500);
await M.page.check('[data-tp="sel"][data-key="' + K + '"]'); await M.page.click('[data-act="tp-approve"]'); await M.page.waitForTimeout(2500);
st = env.stored();
ok('Management approves (shared write); approver differs from proposer', D(st, 'potential/' + K).status === 'Approved' && D(st, 'potential/' + K).approved.by === 'mg@virgoasia.com');
await M.page.click('[data-act="tp-lock-open"]'); await M.page.waitForSelector('[data-act="tp-lock-go"]'); await M.page.click('[data-act="tp-lock-go"]'); await M.page.waitForTimeout(3500);
st = env.stored();
ok('Management lock writes planlocks with the attributed-actuals snapshot (allowed for Management); the state record becomes Locked', !!st['planlocks/FY27-Q3'] && !!D(st, 'planlocks/FY27-Q3').geo_snap && D(st, 'potential/' + K).status === 'Locked', st['planlocks/FY27-Q3']);
/* HOD: view only, and the server would also let it write potential, so the page rule is the guard */
env.setEmail('hod@virgoasia.com');
const H = await openGas(browser, env, 'hod@virgoasia.com'); await H.page.waitForTimeout(6000);
await H.page.evaluate(() => { location.hash = '#/targets'; }); await H.page.waitForTimeout(1500);
const hv = await H.page.evaluate(() => ({ inputs: document.querySelectorAll('[data-tp="pot"]').length, bar: document.querySelector('.tp-sticky').innerText, guard: window.__dbg.planGuard({ state_code: '27', district_id: '_state' }) }));
ok('HOD sees the tab view-only; the page guard refuses a HOD proposal (server rule stays open for potential: page-enforced, as for actions)', hv.inputs === 0 && /locked|View only/.test(hv.bar) && /cannot propose/.test(hv.guard), JSON.stringify(hv));
/* SAP customer feed hook (D78): staged customers load through the page's customer intake; B1 customers survive; PIN and district reach the attribution */
env.setEmail('data@virgoasia.com');
const H2 = ['Customer', 'Name', 'Customer Group', 'City', 'Region', 'Postal Code', 'District', 'GSTIN', 'Sales Executive', 'Payment Terms', 'Sales District', 'Blocked', 'Legacy Code', 'Address Count'];
const crow = [['50001000', 'Synthetic Customer 1 Traders', '01', 'PUNE', '13', '411001', 'Pune', '27ABCDE1234F1Z5', 'S01', '0001', '', '', 'VRGLCU000001', 1], ['50001001', 'Synthetic Customer 2 Traders', '01', 'X', '99', '', '', '', '', '', '', '', '', 1]];
const run = 'mockrun1';
r = env.call('deskWrite', [[set('sapstage', 'cust_c_' + run + '_0', { ym: 'cust', run, seq: 0, n: crow.length, z: env.ctx.sapGz_(crow) }), set('sapstage', 'cust_man', { run, at: new Date().toISOString(), complete: true, cols: H2, n: 1, rows: crow.length, status: 'staged', counts: { pin6: 1, noRegion: 0 } })]]);
env.ctx.sapStatusPatch_({ cust: { run, rows: crow.length, at: new Date().toISOString(), status: 'staged', counts: { pin6: 1, noRegion: 0 } } });
ok('staged mock customer set written to sapstage (Super admin)', r.ok);
A = await openGas(browser, env, 'data@virgoasia.com'); await A.page.waitForTimeout(6000);
const b1 = await A.page.evaluate(async () => window.__dbg.custFeedLoad({ sys: 'B1', headers: ['CardCode', 'CardName', 'CardType', 'State', 'ZipCode'], rows: [['VRGLCU000009', 'B1 Customer', 'C', 'Maharashtra', '411001']], name: 'b1 file' }));
await A.page.waitForTimeout(2500);
await A.page.evaluate(() => { location.hash = '#/intake'; }); await A.page.waitForTimeout(3000);
const card = await A.page.evaluate(() => (document.querySelector('#i-feed') || {}).innerText || '');
await A.page.evaluate(async () => window.__dbg.sapFeedLoad()); await A.page.waitForTimeout(4000);
st = env.stored();
const after = await A.page.evaluate(() => { const D = window.__dbg; return { s4: D.custInfo('50001000'), b1: !!D.custInfo('VRGLCU000009'), g: D.custGeo('50001000', ''), gaps: D.custRegionGaps(), msg: window.__sapf.msg, err: window.__sapf.err, card: (document.querySelector('#i-feed') || {}).innerText || '' }; });
const stat = env.call('sapStatus').status;
ok('B1 file loaded first (customers/main_B1)', b1.ok && !!st['customers/main_B1'], JSON.stringify(b1));
ok('the SAP card shows the staged customer master and enables Load SAP feed', /Customer master/i.test(card) && /staged/.test(card), card.slice(0, 400));
ok('Load SAP feed loads the staged customers through the page intake (customers/main_S4), B1 customers survive', !!st['customers/main_S4'] && after.s4 && after.b1 && /Customer master loaded: 2/.test(after.msg), JSON.stringify([after.msg, after.err, !!after.s4, after.b1]));
ok('sapMarkLoaded marks the customer run loaded on the server', stat.cust && stat.cust.status === 'loaded' && JSON.parse(st['sapstage/cust_man']).status === 'loaded', JSON.stringify(stat.cust));
ok('Region SAP:13 maps to Maharashtra through the state alias; PIN 411001 reaches district Pune', after.g.st === '27' && after.g.dist === 'MH-PUNE', JSON.stringify(after.g));
ok('an unmapped region (99) counts as state unknown and shows on the SAP card', after.gaps.n === 1 && /region with no state/.test(after.card) && /99 \(1\)/.test(after.card), JSON.stringify(after.gaps) + after.card.slice(0, 300));
console.log('TOTAL', res.length, 'PASS', res.filter(x => x.startsWith('PASS')).length, 'FAIL', res.filter(x => x.startsWith('FAIL')).length);
await browser.close();
