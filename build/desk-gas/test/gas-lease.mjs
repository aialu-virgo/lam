// Document leases for the admin job queue: ref.acquire({holder, ttlMs}) -> deskLease. Two tabs contend, expiry, admin only, shim wiring.
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { fileURLToPath } from 'url';
import { makeEnv } from './gas-env.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log('FAIL', n, d || ''); } };
const E = makeEnv();
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
E.call('deskWrite', [[set('users', 'u1', { email: 'data@virgoasia.com', role: 'Super admin', active: true }), set('users', 'u2', { email: 'se@virgoasia.com', role: 'Sales executive', active: true, name: 'Se' }), set('jobs', 'j1', { type: 'clear_demo', status: 'queued' })]]);
const lease = (h, ttl, id = 'j1', col = 'jobs') => E.call('deskLease', [col, id, h, ttl]);
let a = lease('tabA', 600000);
ok('first tab gets the lease, with an expiry about 10 minutes out', a.ok && a.acquired === true && a.holder === 'tabA' && Math.abs(new Date(a.expiresAt).getTime() - Date.now() - 600000) < 5000, JSON.stringify(a));
let b = lease('tabB', 600000);
ok('second tab is refused while the first holds it, and is told who and until when', b.ok && b.acquired === false && b.holder === 'tabA' && b.expiresAt === a.expiresAt, JSON.stringify(b));
ok('the same holder asking again is granted (renewed)', lease('tabA', 600000).acquired === true);
ok('a different document is independent: tab B gets jobs/j2', lease('tabB', 600000, 'j2').acquired === true);
// two tabs race, only one runs: both ask for a fresh document, exactly one is granted
const winners = ['tabA', 'tabB', 'tabC'].map(h => lease(h, 60000, 'race')).filter(r => r.acquired);
ok('three tabs ask for the same fresh job: exactly one is granted', winners.length === 1);
// expiry
lease('tabA', 1000, 'short');
ok('before expiry another tab is refused', lease('tabB', 1000, 'short').acquired === false);
E.state.skew += 2500;
ok('after the lease expires another tab gets it', lease('tabB', 1000, 'short').acquired === true);
ok('ttl is clamped to 10 minutes at most and 1 second at least', (() => { const x = lease('t1', 99999999, 'c1'), y = lease('t1', 1, 'c2'); return new Date(x.expiresAt) - E.ctx.Date.now() <= 600500 && new Date(y.expiresAt) - E.ctx.Date.now() >= 500; })());
ok('missing ttl defaults to 30 seconds', (() => { const x = lease('t1', undefined, 'c3'); const d = new Date(x.expiresAt) - E.ctx.Date.now(); return d > 25000 && d <= 30500; })());
ok('expired leases are dropped from the stored property (it stays small)', (() => { E.state.skew += 700000; lease('t9', 1000, 'c9'); return Object.keys(JSON.parse(E.props.DESK_LEASES)).join() === 'jobs/c9'; })());
// access
E.setEmail('se@virgoasia.com'); let r = lease('tabS', 1000, 'sx');
ok('a non-admin (Sales executive) is refused', r.ok === false && r.code === 'permission_denied', JSON.stringify(r));
E.setEmail('stranger@virgoasia.com'); r = lease('tabS', 1000, 'sx');
ok('an unknown user is refused', r.ok === false, JSON.stringify(r));
E.setEmail('data@virgoasia.com');
ok('a non-admin collection is refused (leases are for admin collections)', lease('t', 1000, 'x', 'actions').code === 'invalid_argument' && lease('t', 1000, 'x', 'nonesuch').code === 'invalid_argument');
ok('bad ids and holders are refused', lease('t', 1000, 'a/b').code === 'invalid_argument' && lease('', 1000, 'ok').code === 'invalid_argument' && lease('t', 1000, '').code === 'invalid_argument');
ok('a refusal by another holder does not change the stored lease', (() => { lease('h1', 600000, 'keep'); const before = E.props.DESK_LEASES; lease('h2', 600000, 'keep'); return E.props.DESK_LEASES === before; })());
ok('the script lock was never re-entered (mock throws on re-entry) and was taken per call', E.state.locks > 5 && E.state.held === 0);
// the shim: ref.acquire calls deskLease and returns {acquired,...}
{ const code = fs.readFileSync(path.join(here, '../src/shim.js'), 'utf8'); const calls = [];
  const win = { __GAS_BOOT: { email: 'data@virgoasia.com' }, google: { script: { run: { withSuccessHandler(ok) { const h = { withFailureHandler() { return new Proxy({}, { get: (t, fn) => (...args) => { calls.push([fn, args]); setTimeout(() => ok(fn === 'deskLease' ? { ok: true, acquired: true, version: 1, holder: args[2], expiresAt: 'x' } : { ok: true, rev: 0, pages: [] }), 0); } }); } }; return h; } } } }, addEventListener() {}, document: { addEventListener() {}, hidden: false } };
  win.window = win; win.setTimeout = setTimeout; win.clearTimeout = clearTimeout; win.console = console; win.Promise = Promise; win.JSON = JSON; win.Map = Map; win.Date = Date; win.Math = Math; win.Object = Object; win.Array = Array; win.String = String; win.Number = Number; win.Error = Error; win.localStorage = undefined;
  try { vm.runInNewContext(code, win); const db = await win.claude.use('db'); const x = await db.doc('jobs/j7').acquire({ holder: 'tabZ', ttlMs: 5000 });
    ok('shim: ref.acquire calls deskLease(col, id, holder, ttl) and returns acquired', calls.some(c => c[0] === 'deskLease' && c[1].join('|') === 'jobs|j7|tabZ|5000') && x.acquired === true && x.holder === 'tabZ'); }
  catch (e) { ok('shim acquire test ran: ' + e.message, false); } }
console.log('gas-lease: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
