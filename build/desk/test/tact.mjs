/* Activity indicator: appears during a slow load, a save, an upload; shows counts; hides when idle; shows errors in red with Details; accessible.
 * Uses the demo store from mkstore (SP/store-demo.json) and a generated CSV. Screenshots: SHOTS=/dir node tact.mjs */
import { chromium, open } from './run.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('../../demo-data/generator.js');
const SP = '/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const base = JSON.parse(fs.readFileSync(SP + 'store-demo.json'));
const SHOTS = process.env.SHOTS;
const res = []; process.on('exit', () => console.log(res.join('\n')));
const ok = (n, c, d) => res.push([c ? 'PASS' : 'FAIL', n, d || ''].join(' | '));
const init = () => { window.__ah = []; setInterval(() => { const c = document.getElementById('act-chip'), b = document.getElementById('act-bar'); if (!c) return; window.__ah.push({ t: Math.round(performance.now()), hidden: c.hidden, txt: c.querySelector('.act-txt').textContent, bar: b.className, w: b.firstChild.style.width, err: c.classList.contains('act-err') }) }, 50) };
const hist = p => p.evaluate(() => window.__ah.slice());
const browser = await chromium.launch();

/* 1. slow initial load: counts, bar, then hides */
{
  const { page, errs } = await open(browser, { store: JSON.parse(JSON.stringify(base)), mode: { delay: 1500 }, init });
  await page.waitForTimeout(2200);
  const mid = await hist(page);
  const seen = mid.filter(h => !h.hidden && /Loading data \d+ of \d+|Opening the Desk/.test(h.txt));
  ok('slow load: chip names the task with a count', seen.some(h => /Loading data \d+ of \d+/.test(h.txt)), seen.slice(0, 3).map(h => h.txt).join(' / '));
  ok('slow load: the top bar is on', mid.some(h => /\bon\b/.test(h.bar)), mid.find(h => /\bon\b/.test(h.bar)) ? 'yes' : 'never');
  const a11y = await page.evaluate(() => { const c = document.getElementById('act-chip'); return { role: c.getAttribute('role'), live: c.getAttribute('aria-live'), barHidden: document.getElementById('act-bar').getAttribute('aria-hidden') } });
  ok('chip is role=status, aria-live=polite; the bar is decorative', a11y.role === 'status' && a11y.live === 'polite' && a11y.barHidden === 'true', JSON.stringify(a11y));
  await page.waitForFunction(() => document.getElementById('act-chip').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const end = await page.evaluate(() => ({ hidden: document.getElementById('act-chip').hidden, bar: document.getElementById('act-bar').className, txt: document.querySelector('#act-chip .act-txt').textContent }));
  ok('hides when all work is idle (chip hidden, bar off, no text)', end.hidden && !/\bon\b|err/.test(end.bar) && end.txt === '', JSON.stringify(end));
  ok('no page errors', errs.filter(e => /PAGEERROR/.test(e)).length === 0);
  await page.context().close();
}

/* 2. saves: "Saving 2 changes" while two slow writes run, then idle */
{
  const { page } = await open(browser, { store: JSON.parse(JSON.stringify(base)), init });
  await page.waitForFunction(() => window.__dbg && window.__dbg.S.loaded.users && window.__dbg.S.loaded.roll, null, { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('act-chip').hidden, null, { timeout: 60000 });
  await page.evaluate(() => { const S = window.__dbg.S, o = S.db.doc; S.db.doc = p => { const d = o.call(S.db, p), s = d.set; d.set = async v => { await new Promise(r => setTimeout(r, 1200)); return s.call(d, v) }; return d }; window.__w = Promise.all([window.__dbg.dset('log/a1', { t: 1 }), window.__dbg.dset('log/a2', { t: 2 })]) });
  await page.waitForTimeout(900);
  const t = await page.evaluate(() => ({ hidden: document.getElementById('act-chip').hidden, txt: document.getElementById('act-chip').innerText }));
  ok('two writes in flight: chip says "Saving 2 changes"', !t.hidden && /Saving 2 changes/.test(t.txt), JSON.stringify(t));
  await page.evaluate(() => window.__w); await page.waitForFunction(() => document.getElementById('act-chip').hidden, null, { timeout: 20000 });
  ok('after the saves the chip hides', true);
  await page.context().close();
}

/* 3. upload: "Checking file" then "Uploading file" with progress, then idle */
{
  const plants = Object.keys(base).filter(k => /^plants\//.test(k) && base[k].plant_name && /^DEMO/.test(base[k].plant_name)).slice(0, 2).map(k => ({ code: k.slice(7), name: base[k].plant_name }));
  const g = G.invoices({ shape: 'B1', plants, months: ['2026-10', '2026-11'], docsPerPlantMonth: 60, seed: 9, dateStyle: 'iso', withLineNum: true });
  const csv = [g.headers.join(',')].concat(g.rows.map(r => r.map(v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }).join(','))).join('\n');
  const f = path.join(os.tmpdir(), 'tact-up-' + process.pid + '.csv'); fs.writeFileSync(f, csv);
  const st = JSON.parse(JSON.stringify(base)); Object.keys(st).forEach(k => { if (/^(cells|inv|roll|uploads)\//.test(k)) delete st[k] });
  const { page } = await open(browser, { store: st, init });
  await page.waitForTimeout(3000); await page.evaluate(() => { location.hash = '#/intake' }); await page.waitForTimeout(800);
  await (await page.$('input[type=file]')).setInputFiles(f); await page.waitForTimeout(1500);
  await page.click('[data-act="u-validate"]'); await page.waitForFunction(() => window.__desk.U && window.__desk.U.stage === 'validated', null, { timeout: 120000 });
  if (await page.$('[data-act="u-confrep"]')) await page.click('[data-act="u-confrep"]');
  await page.evaluate(() => { const S = window.__dbg.S, o = S.db.doc; S.db.doc = p => { const d = o.call(S.db, p), s = d.set; d.set = async v => { await new Promise(r => setTimeout(r, 250)); return s.call(d, v) }; return d } }); /* a real upload takes seconds; slow the writes so the sampler can see it */
  await page.click('[data-act="u-load"]'); await page.waitForFunction(() => window.__desk.U.stage === 'done', null, { timeout: 240000 });
  await page.waitForTimeout(2000);
  const h = await hist(page), tx = h.filter(x => !x.hidden).map(x => x.txt);
  ok('upload: chip named the upload task', tx.some(x => /Checking file|Reading file|Uploading file/.test(x)), [...new Set(tx)].slice(0, 6).join(' / '));
  ok('upload: chip showed "Uploading file" with a filled bar', h.some(x => /Uploading file/.test(x.txt) && /%/.test(x.w)), [...new Set(tx)].slice(0, 8).join(' / '));
  ok('upload: hidden again when finished', await page.evaluate(() => document.getElementById('act-chip').hidden));
  fs.unlinkSync(f); await page.context().close();
}

/* 4. errors: a collection that cannot be read turns the chip red with Details */
{
  const { page } = await open(browser, { store: JSON.parse(JSON.stringify(base)), mode: { err: 'plants' }, init });
  await page.waitForTimeout(3500);
  const e = await page.evaluate(() => { const c = document.getElementById('act-chip'); return { hidden: c.hidden, err: c.classList.contains('act-err'), txt: c.innerText, det: !c.querySelector('.act-det').hidden, bar: document.getElementById('act-bar').className } });
  ok('a read error: chip is red, names it, offers Details, bar is red', !e.hidden && e.err && /Could not read plants/.test(e.txt) && e.det && /err/.test(e.bar), JSON.stringify(e));
  await page.click('#act-chip .act-det'); await page.waitForTimeout(300);
  ok('Details moves focus to the existing message area', await page.evaluate(() => document.activeElement && document.activeElement.id === 'banners'));
  const shots = SHOTS && [];
  if (SHOTS) {
    for (const [w, hh, s] of [[1440, 900, 'light'], [1440, 900, 'dark'], [360, 740, 'light'], [360, 740, 'dark']]) {
      await page.setViewportSize({ width: w, height: hh }); await page.emulateMedia({ colorScheme: s }); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, `activity-error-${w}-${s}.png`) });
    }
  }
  await page.click('#act-chip .act-x'); await page.waitForTimeout(600);
  ok('Dismiss hides the error chip', await page.evaluate(() => document.getElementById('act-chip').hidden));
  await page.context().close();
}

/* 5. screenshots of the busy chip (slow load), 4 variants */
if (SHOTS) {
  for (const [w, h, s] of [[1440, 900, 'light'], [1440, 900, 'dark'], [360, 740, 'light'], [360, 740, 'dark']]) {
    const { page } = await open(browser, { store: JSON.parse(JSON.stringify(base)), mode: { delay: 6000 }, init, size: { width: w, height: h }, scheme: s });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(SHOTS, `activity-busy-${w}-${s}.png`) }); await page.context().close();
  }
}
await browser.close();
