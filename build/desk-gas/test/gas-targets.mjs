/* Targets & Potential on the Apps Script build (D70): the server's write rules still allow the tab's saves
   (potential: any active user; planlocks: Management / Super admin) and phasing is shared like potential (D70); unknown users are refused. */
import { makeEnv } from './gas-env.mjs';
import { chromium, openGas } from './gas-page.mjs';
const res = []; const ok = (n, c, d) => { const l = (c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || '')); console.log(l); res.push(l); if (!c) process.exitCode = 1; };
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const browser = await chromium.launch(); const env = makeEnv();
env.setEmail('data@virgoasia.com');
const usr = (email, name, role, plants) => set('users', email.replace(/[^a-z0-9]/g, '_'), { email, name, role, department: 'Sales', plant_codes: plants, reports_to_email: '', whatsapp_number: '', today_cap: 5, active: true, sales_employee_code: '' });
let A = await openGas(browser, env, 'data@virgoasia.com'); await A.page.waitForTimeout(6000);
let r = env.call('deskWrite', [[usr('bm@virgoasia.com', 'Branch Mgr', 'Branch / depot manager', '1012'), usr('mg@virgoasia.com', 'Mgmt', 'Management / HO', ''), usr('hod@virgoasia.com', 'Hod', 'HOD', ''),
  set('plants', '1012', { plant_code: '1012', plant_name: 'Depot 1012', plant_type: 'Depot', zone: '', state: '', b1_bpl_name: 'Depot 1012', business: 'laminates', active: true })]]);
ok('seed users and a plant', r.ok, JSON.stringify(r));
const K = 'fy27_q3_1012_laminate_all';
const D = (st, k) => (st[k] ? JSON.parse(st[k]) : null);
const fill = async (page, f, v) => { const s = '#tp-' + f + '-' + K; await page.fill(s, v); await page.dispatchEvent(s, 'change'); await page.waitForTimeout(250); };
env.setEmail('bm@virgoasia.com');
const B = await openGas(browser, env, 'bm@virgoasia.com'); await B.page.waitForTimeout(6000);
await B.page.evaluate(() => { location.hash = '#/targets'; }); await B.page.waitForTimeout(1500);
ok('Branch manager opens Targets & Potential on Apps Script (own plant row, inputs)', await B.page.evaluate(() => !!document.querySelector('#tp-pot-' + 'fy27_q3_1012_laminate_all')));
await fill(B.page, 'pot', '2,00,00,000'); await fill(B.page, 'share', '50');
await B.page.click('[data-act="tp-save"]'); await B.page.waitForTimeout(2500);
let st = env.stored();
ok('Save draft writes potential (open to active users): Draft, by the Branch manager', D(st, 'potential/' + K) && D(st, 'potential/' + K).status === 'Draft' && D(st, 'potential/' + K).revisions[0].by === 'bm@virgoasia.com', st['potential/' + K]);
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
ok('Phasing by a Branch manager is saved (shared collection): custom 30/30/40 written, potential untouched', !/Phasing not saved/.test(msg) && D(st, 'phasing/fy27_q3_1012_laminate') && D(st, 'phasing/fy27_q3_1012_laminate').pct.join() === '30,30,40' && D(st, 'potential/' + K).status === 'Discussed', msg);
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
ok('Management lock writes planlocks (allowed for Management); the leaf becomes Locked', !!st['planlocks/FY27-Q3'] && D(st, 'potential/' + K).status === 'Locked', 'x');
/* HOD: view only, and the server would also let it write potential, so the page rule is the guard */
env.setEmail('hod@virgoasia.com');
const H = await openGas(browser, env, 'hod@virgoasia.com'); await H.page.waitForTimeout(6000);
await H.page.evaluate(() => { location.hash = '#/targets'; }); await H.page.waitForTimeout(1500);
const hv = await H.page.evaluate(() => ({ inputs: document.querySelectorAll('[data-tp="pot"]').length, bar: document.querySelector('.tp-sticky').innerText, guard: window.__dbg.planGuard({ plant_code: '1012' }) }));
ok('HOD sees the tab view-only; the page guard refuses a HOD proposal (server rule stays open for potential: page-enforced, as for actions)', hv.inputs === 0 && /locked|View only/.test(hv.bar) && /cannot propose/.test(hv.guard), JSON.stringify(hv));
console.log('TOTAL', res.length, 'PASS', res.filter(x => x.startsWith('PASS')).length, 'FAIL', res.filter(x => x.startsWith('FAIL')).length);
await browser.close();
