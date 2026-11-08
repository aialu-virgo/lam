/* Figures identical before and after the staged roll-up read.
 * BASE_DIST = dist/index.html built from the commit before the change; DIST (default) = the new build.
 * Compares, on one synthetic store: the whole roll-up maps (key order included) and the visible text of Overview, Sales, My Dashboard and a drill-down,
 * for (a) the old build, (b) the new build in one pass, (c) the new build forced into the staged path.
 * Usage: BIGSTORE=store.json BASE_DIST=/path/old.html node tperf-figs.mjs */
import { chromium, open, dist } from './run.mjs';
import fs from 'fs';
import crypto from 'crypto';
const store = JSON.parse(fs.readFileSync(process.env.BIGSTORE));
const base = process.env.BASE_DIST;
if (!base) throw new Error('set BASE_DIST to the old build');
const res = []; process.on('exit', () => console.log(res.join('\n')));
const ok = (n, c, d) => res.push([c ? 'PASS' : 'FAIL', n, d || ''].join(' | '));
const browser = await chromium.launch();
async function snap(file, stageRows) {
  const { page, errs } = await open(browser, { store, today: '2026-10-23', distFile: file, init: stageRows == null ? undefined : `window.__STAGE_ROWS=${stageRows}` });
  await page.waitForFunction(() => window.__dbg && window.__dbg.DS.ready && window.__dbg.DS.spReady !== false && window.__dbg.DS.status === 'ready', null, { timeout: 400000 });
  await page.waitForTimeout(1500);
  const maps = await page.evaluate(() => { const D = window.__dbg.DS; return JSON.stringify([D.pg, D.spk, D.spIdx, D.xf, D.ptot, D.spRaw, D.plants, D.months]) });
  const out = { maps: crypto.createHash('sha1').update(maps).digest('hex'), mapBytes: maps.length, pages: {} };
  const txt = async (h, wait) => { await page.evaluate(h => { location.hash = h }, h); await page.waitForTimeout(wait || 2500); return page.evaluate(() => document.getElementById('pg').innerText) };
  out.pages.overview = await txt('#/overview');
  out.pages.sales = await txt('#/sales');
  out.pages.dashboard = await txt('#/dashboard', 6000);
  out.pages.team = await txt('#/team');
  const click = async sel => { const r = await page.evaluate(sel => { const b = document.querySelector(sel); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true }, sel); await page.waitForTimeout(2500); return r };
  await page.evaluate(() => { location.hash = '#/sales' }); await page.waitForTimeout(2500);
  const c1 = await click('[data-act="trend-q"]');
  out.pages.drill = c1 ? await page.evaluate(() => (document.getElementById('drillp') || {}).innerText || '') : '(no trend bar)';
  await page.evaluate(() => { location.hash = '#/sales' }); await page.waitForTimeout(1500);
  const c2 = await click('[data-act="dd"]');
  out.pages.drilldown = c2 ? await page.evaluate(() => document.getElementById('pg').innerText) : '(no branch row)';
  out.errs = errs.filter(e => /PAGEERROR/.test(e)).length;
  await page.context().close();
  return out;
}
const A = await snap(base);
const NEW = process.env.NEW_DIST || dist;
const B = await snap(NEW, 1e12);
const C = await snap(NEW, 1000);
ok('roll-up maps: old = new one-pass', A.maps === B.maps, A.maps + ' ' + B.maps + ' bytes ' + A.mapBytes);
ok('roll-up maps: old = new staged', A.maps === C.maps, A.maps + ' ' + C.maps);
for (const p of Object.keys(A.pages)) {
  const dif = (x, y) => { if (x === y) return 'len ' + x.length; let i = 0; while (i < x.length && x[i] === y[i]) i++; return 'first difference at ' + i + ': old [' + x.slice(Math.max(0, i - 40), i + 60).replace(/\n/g, ' / ') + '] new [' + y.slice(Math.max(0, i - 40), i + 60).replace(/\n/g, ' / ') + ']' };
  ok('page text identical, one-pass: ' + p, A.pages[p] === B.pages[p], dif(A.pages[p], B.pages[p]));
  ok('page text identical, staged: ' + p, A.pages[p] === C.pages[p], dif(A.pages[p], C.pages[p]));
}
ok('quarter drill-down was opened and has figures', /\d/.test(A.pages.drill) && A.pages.drill.length > 40, 'len ' + A.pages.drill.length);
ok('branch drill-down was opened and has figures', /\d/.test(A.pages.drilldown) && A.pages.drilldown.length > 200 && !/no branch row/.test(A.pages.drilldown), 'len ' + A.pages.drilldown.length);
ok('dashboard has cards', /Sales|sheets/i.test(A.pages.dashboard) && A.pages.dashboard.length > 200, 'len ' + A.pages.dashboard.length);
ok('no page errors in any run', A.errs + B.errs + C.errs === 0, [A.errs, B.errs, C.errs].join(','));
await browser.close();
