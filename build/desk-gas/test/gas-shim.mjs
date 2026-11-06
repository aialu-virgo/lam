// Runs the real shim.js in a vm against the in-memory Code.gs: cache freshness of get(), subscribed collections, server-side merge.
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeEnv } from './gas-env.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const ok = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || ''))); if (!c) process.exitCode = 1; };
const E = makeEnv(), other = (fn, args) => E.call(fn, args);   // "another user" writing straight to the server
const runner = (h = {}) => new Proxy({}, { get(_, fn) {
  if (fn === 'withSuccessHandler') return (s) => runner({ ...h, s });
  if (fn === 'withFailureHandler') return (f) => runner({ ...h, f });
  return (...args) => setTimeout(() => { try { const r = E.callRaw(fn, JSON.parse(JSON.stringify(args))); h.s && h.s(r); } catch (e) { h.f && h.f(e); } }, 0);
} });
const win = { google: { script: { run: runner() } }, __GAS_BOOT: { email: 'data@virgoasia.com', owner: true, name: 'Vijay', url: 'x' }, location: { hash: '' } };
const doc = { hidden: false, addEventListener() {}, createElement() { return { style: {}, click() {}, remove() {} }; }, body: { appendChild() {} } };
const ctx = { window: win, document: doc, location: win.location, setTimeout, clearTimeout, Promise, Map, Set, Blob, URL, TextEncoder, console, JSON, Math, Date, Object, Array, Number, String, Error };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(here, '../src/shim.js'), 'utf8'), ctx);
const db = await win.claude.use('db'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (s) => s.docs.map((d) => d.id + '=' + JSON.stringify(d.data())).join(' ');
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });

other('deskWrite', [[set('inv', 'x1', { v: 1 })]]);
let s = await db.collection('inv').get(); ok('first get loads from the server', show(s) === 'x1={"v":1}', show(s));
other('deskWrite', [[set('inv', 'x1', { v: 9 }), set('inv', 'x2', { v: 2 })]]);
s = await db.collection('inv').get(); ok('a second get of an unsubscribed collection sees the other user\'s change at once (QA repro)', show(s) === 'x1={"v":9} x2={"v":2}', show(s));
await win.__gasPoll(); await sleep(30); s = await db.collection('inv').get(); ok('and still after a poll cycle', show(s) === 'x1={"v":9} x2={"v":2}', show(s));
let seen = null; db.collection('stock').onSnapshot((sn) => { seen = sn.docs.length; }, (e) => console.log('err', e)); await sleep(60);
other('deskWrite', [[set('stock', 's1', { q: 1 })]]);
s = await db.collection('stock').get(); ok('a live-subscribed collection: get() checks the revision and returns the new document without waiting for the poll', s.docs.length === 1, String(s.docs.length));
await win.__gasPoll(); await sleep(60); ok('the subscription also receives it after a poll', seen === 1, String(seen));
E.stats.gv.length = 0; await db.collection('stock').get(); ok('with an unchanged revision a subscribed get() is served from the cache (no page read)', E.stats.gv.length === 0, String(E.stats.gv.length));
// server-side merge
other('deskWrite', [[set('settings', 'main', { a: 1, b: 1 })]]);
await db.collection('settings').get();
other('deskWrite', [[set('settings', 'main', { a: 5, b: 1 })]]);          // another user changes a different field first
await db.doc('settings/main').update({ b: 2 });
const m = await db.doc('settings/main').get(); ok('update() merges on the server: the other user\'s change to "a" survives', JSON.stringify(m.data()) === '{"a":5,"b":2}', JSON.stringify(m.data()));
s = await db.collection('settings').get(); ok('and the collection read after the merge shows it', show(s) === 'settings=undefined' || show(s) === 'main={"a":5,"b":2}', show(s));
let threw = null; try { await db.doc('settings/missing').update({ x: 1 }); } catch (e) { threw = e.code; } ok('update() of a missing document is refused', threw === 'invalid_argument', String(threw));
// per-operation results: a refused operation rejects only its own promise
other('deskWrite', [[set('users', 'se', { email: 'se@virgoasia.com', role: 'Sales executive', active: true })]]);
E.setEmail('se@virgoasia.com');
const rs = await Promise.allSettled([db.doc('actions/n1').set({ id: 'n1' }), db.doc('planlocks/FY27-Q3').set({ by: 'se' }), db.doc('periods/x').set({ a: 1 }), db.doc('log/n2').set({ t: 1 })]);
ok('flushW: in one batch the allowed writes resolve and only the refused ones reject (actions ok, planlocks refused, periods refused, log ok)', rs[0].status === 'fulfilled' && rs[1].status === 'rejected' && rs[1].reason.code === 'permission_denied' && rs[2].status === 'rejected' && rs[3].status === 'fulfilled', JSON.stringify(rs.map(r => r.status)));
ok('and the allowed documents were really stored', 'actions/n1' in E.stored() && 'log/n2' in E.stored() && !('planlocks/FY27-Q3' in E.stored()));
process.exit(process.exitCode || 0);
