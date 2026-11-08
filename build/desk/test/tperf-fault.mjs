/* A failed stage 2 (staged roll-up read) must never show partial salesperson figures; Today waits during stage 2.
 * Injects a fault into a temporary copy of the build (the shipped code has no hook). BIGSTORE=store.json node tperf-fault.mjs */
import { chromium, open, dist } from './run.mjs';
import fs from 'fs';
import { bigStorePath } from './bigstore-util.mjs';
const store = JSON.parse(fs.readFileSync(bigStorePath(80)));
const res = []; process.on('exit', () => console.log(res.join('\n')));
const ok = (n, c, d) => res.push([c ? 'PASS' : 'FAIL', n, d || ''].join(' | '));
let h = fs.readFileSync(process.env.NEW_DIST || dist, 'utf8');
if (h.split('function rollB(o){').length !== 2) throw new Error('rollB marker');
h = h.replace('function rollB(o){', "function rollB(o){if(window.__FAULT_B)throw new Error('injected fault');");
const tmp = (process.env.TMPDIR || '/tmp') + '/desk-fault-' + process.pid + '.html'; fs.writeFileSync(tmp, h);
const browser = await chromium.launch();
const { page, errs } = await open(browser, { store, today: '2026-10-23', distFile: tmp, init: 'window.__STAGE_ROWS=1000;window.__FAULT_B=1' });
await page.waitForFunction(() => window.__dbg && window.__dbg.DS.spErr, null, { timeout: 300000 });
await page.waitForTimeout(1500);
const txt = async hs => { await page.evaluate(x => { location.hash = x }, hs); await page.waitForTimeout(1500); return page.evaluate(() => document.getElementById('pg').innerText) };
const st = await page.evaluate(() => ({ r: window.__dbg.DS.spReady, idx: Object.keys(window.__dbg.DS.spIdx).length, eng: !!window.__dbg.S.engSig, opts: document.querySelectorAll('#f-sp option').length }));
ok('after the fault: stage 2 not ready, no partial names, engine not run', st.r === false && st.idx === 0 && !st.eng, JSON.stringify(st));
for (const p of ['sales', 'team', 'dashboard', 'today', 'actions']) { const t = await txt('#/' + p); ok(p + ': error and retry shown, no figures', /failed/.test(t) && /Try again/.test(t) && !/Leaderboard|Rs |₹/.test(t), t.slice(0, 80).replace(/\n/g, ' / ')); }
const ov = await txt('#/overview'); ok('overview still shows branch totals, no salesperson dropdown', /K1/.test(ov) && (await page.evaluate(() => document.querySelectorAll('#f-sp option').length)) === 0, 'len ' + ov.length);
await page.evaluate(() => { window.__FAULT_B = 0 });
await page.evaluate(() => { location.hash = '#/sales' }); await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('[data-act="sp-retry"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForFunction(() => window.__dbg.DS.spReady && !window.__dbg.DS.spErr, null, { timeout: 300000 });
await page.waitForTimeout(2500);
const t2 = await page.evaluate(() => document.getElementById('pg').innerText);
ok('retry recovers: Sales shows figures', !/failed|Reading salesperson/.test(t2) && t2.length > 2000, 'len ' + t2.length);
ok('no page errors', errs.filter(e => /PAGEERROR/.test(e)).length === 0);
fs.unlinkSync(tmp); await browser.close();
