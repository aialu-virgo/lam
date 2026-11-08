/* Performance on the synthetic 45-plant x 19-month store (make it with mkstore.mjs + mkbigstore.mjs).
 * Usage: BIGSTORE=/path/store-big-dash.json node perf-big.mjs [hash=#/overview]
 * Times are measured inside the page from the moment the store is in place (the harness's own store injection is excluded).
 * Reports: first Overview card, DS ready, longest main-thread stall (long tasks), and whether the page answered a click while loading. */
import { chromium, open } from './run.mjs';
import fs from 'fs';
const store = JSON.parse(fs.readFileSync(process.env.BIGSTORE));
const hash = process.argv[2] || '#/overview';
const browser = await chromium.launch();
const t0 = Date.now();
const init = () => { window.__t0 = performance.now(); window.__tCard = null; const mo = new MutationObserver(() => { if (window.__tCard == null && document.querySelector('.ox-card, .dsh-card')) window.__tCard = performance.now() - window.__t0 }); document.addEventListener('DOMContentLoaded', () => mo.observe(document.documentElement, { childList: true, subtree: true })); window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => { window.__lt.push(Math.round(e.duration)); (window.__ltAt = window.__ltAt || []).push([Math.round(e.startTime - window.__t0), Math.round(e.duration)]) })).observe({ entryTypes: ['longtask'] }) } catch (e) { } };
const { page, errs } = await open(browser, { store, today: '2026-10-23', init });
await page.evaluate(h => { location.hash = h }, hash);
const first = await page.waitForSelector('.ox-card, .dsh-card', { timeout: 300000 });
const tFirst = Math.round(await page.evaluate(() => window.__tCard));
const st = await page.evaluate(() => ({ status: window.__dbg.DS.status, ready: !!window.__dbg.DS.ready, plants: window.__dbg.DS.plants.length, months: window.__dbg.DS.months.length }));
await page.waitForFunction(() => window.__dbg.DS.ready && window.__dbg.DS.status === 'ready', null, { timeout: 300000 });
const tReady = Math.round(await page.evaluate(() => performance.now() - window.__t0));
await page.waitForTimeout(1500);
const lt = await page.evaluate(() => window.__lt || []);
const rt = await page.evaluate(() => new Promise(r => { const t = performance.now(); setTimeout(() => r(Math.round(performance.now() - t)), 0) }));
console.log(JSON.stringify({ hash, firstCardMs: tFirst, dsReadyMs: tReady, atFirstCard: st, longestLongTaskMs: Math.max(0, ...lt), longTasksOver500: lt.filter(x => x > 500).length, timerLatencyAfterMs: rt, longTasksAtMs: await page.evaluate(() => window.__ltAt || []), pageErrors: errs.filter(e => /PAGEERROR/.test(e)).length }));
await browser.close();
