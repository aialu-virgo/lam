import { makeEnv } from './gas-env.mjs';
import assert from 'assert';
const res = []; const ok = (n, c, d) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (c ? "" : " | " + (d || ""))); if (!c) process.exitCode = 1; };
const E = makeEnv();
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
// first run: seed admin creates the store and the user records
let r = E.call('deskWrite', [[set('users', 'u1', { email: 'data@virgoasia.com', role: 'Super admin', active: true }), set('users', 'u2', { email: 'se@virgoasia.com', role: 'Sales executive', active: true, name: 'Se' }), set('users', 'u3', { email: 'gone@virgoasia.com', role: 'Sales executive', active: false }), set('users', 'u4', { email: 'adm2@virgoasia.com', role: 'Super admin', active: true })]]);
ok('seed Super admin can write users on an empty store', r.ok && r.revs.users === 1, JSON.stringify(r));
ok('a sheet was created and its id kept', !!E.sheets.db && !!E.sheets.meta);
// access
E.setEmail('se@virgoasia.com');
r = E.call('deskWrite', [[set('periods', 'FY27-Q2', { status: 'closed' })]]); ok('non-admin write to periods refused', !r.ok && r.code === 'permission_denied', JSON.stringify(r));
const ADMIN = ['periods','audit','settings','users','plants','cells','inv','roll','mappings','transfers','uploads','rejects','items','itemmeta','salesmaster','phasing','orders','deliveries','receivables','collections','stock','backups','customers','creditnotes'];
let refused = 0; ADMIN.forEach(c => { const x = E.call('deskWrite', [[set(c, 'x', { a: 1 })]]); if (!x.ok && x.code === 'permission_denied') refused++; });
ok('non-admin refused on all ' + ADMIN.length + ' admin collections', refused === ADMIN.length, refused);
ok('the 21 named admin collections are all in the list', ['periods','audit','settings','users','plants','cells','inv','roll','mappings','transfers','uploads','rejects','items','itemmeta','salesmaster','phasing','orders','deliveries','receivables','collections','stock'].every(c => ADMIN.includes(c)));
r = E.call('deskWrite', [[set('log', 'l1', { t: 1 }), set('potential', 'p1', { v: 2 }), set('actions', 'a1', { x: 1 }), set('followups', 'f1', { x: 1 }), set('planlocks', 'FY27-Q3', { x: 1 })]]);
ok('non-admin can write the 5 shared collections', r.ok, JSON.stringify(r));
r = E.call('deskWrite', [[set('log', 'l2', { t: 1 }), set('users', 'u9', { email: 'se@virgoasia.com', role: 'Super admin', active: true })]]);
ok('a mixed batch with one refused op writes nothing', !r.ok && !('log/l2' in E.stored()), JSON.stringify(r));
r = E.call('deskWrite', [[set('users', 'u2', { email: 'se@virgoasia.com', role: 'Super admin', active: true })]]); ok('non-admin cannot promote self', !r.ok);
r = E.call('deskStats', []); ok('non-admin refused deskStats', !r.ok && r.code === 'permission_denied');
r = E.call('deskWipe', [['log']]); ok('non-admin refused deskWipe', !r.ok && r.code === 'permission_denied' && 'log/l1' in E.stored());
r = E.call('deskDigest', ['log']); ok('non-admin refused deskDigest', !r.ok);
r = E.call('deskRead', ['users', null]); ok('registered non-admin reads users', r.ok && r.docs.length === 4);
E.setEmail('gone@virgoasia.com'); r = E.call('deskRead', ['users', null]); ok('inactive user reads nothing', r.ok && r.docs.length === 0);
r = E.call('deskWrite', [[set('log', 'l3', { t: 1 })]]); ok('inactive user cannot write', !r.ok);
E.setEmail('stranger@virgoasia.com'); r = E.call('deskRead', ['users', null]); ok('unknown email reads nothing (page shows Ask your admin)', r.ok && r.docs.length === 0);
r = E.call('deskWrite', [[set('log', 'l3', { t: 1 })]]); ok('unknown email cannot write', !r.ok && r.code === 'permission_denied');
E.setEmail(''); r = E.call('deskRead', ['users', null]); ok('blank email refused', !r.ok && r.code === 'unauthenticated');
// promote: acl cache follows users rev
E.setEmail('adm2@virgoasia.com'); r = E.call('deskWrite', [[set('periods', 'FY27-Q2', { status: 'closed' })]]); ok('second Super admin (from users collection) writes periods', r.ok);
E.setEmail('data@virgoasia.com'); E.call('deskWrite', [[set('users', 'u4', { email: 'adm2@virgoasia.com', role: 'Sales executive', active: true })]]);
E.setEmail('adm2@virgoasia.com'); r = E.call('deskWrite', [[set('periods', 'FY27-Q2', { status: 'open' })]]); ok('demoted admin refused at once (ACL cache keyed on users revision)', !r.ok, JSON.stringify(r));
E.setEmail('spa@virgoasia.com'); r = E.call('deskWrite', [[set('periods', 'p', { a: 1 })]]); ok('SEED list admin works without a users record', r.ok);
// big docs across parts
E.setEmail('data@virgoasia.com');
const big = { z: 'é₹'.repeat(1).concat('abc').repeat(30000) }, bigJ = JSON.stringify(big);
ok('fixture over 50,000 chars and under 256 KiB', bigJ.length > 50000 && bigJ.length < 262144, bigJ.length);
r = E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'INV-big', json: bigJ }]]); ok('big doc written', r.ok, JSON.stringify(r));
const rows = E.sheets.db.rows.filter(x => x && x[0] === 'inv'); ok('big doc split over several rows each <= 45,000 chars', rows.length === Math.ceil(bigJ.length / 45000) && rows.every(x => x[3].length <= 45000), rows.length);
r = E.call('deskGetMany', [['inv/INV-big', 'inv/none']]); ok('big doc round-trips exactly (get)', r.docs[0].json === bigJ && r.docs[1].json === null);
r = E.call('deskRead', ['inv', null]); ok('big doc round-trips exactly (read)', r.docs.length === 1 && r.docs[0].json === bigJ);
r = E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'INV-big', json: '{"s":1}' }]]); ok('shrinking removes the extra part rows', E.sheets.db.rows.filter(x => x && x[0] === 'inv').length === 1 && E.call('deskGetMany', [['inv/INV-big']]).docs[0].json === '{"s":1}');
r = E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'INV-big', json: bigJ }]]); ok('growing again works', E.call('deskGetMany', [['inv/INV-big']]).docs[0].json === bigJ);
r = E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'huge', json: JSON.stringify({ z: 'x'.repeat(262200) }) }]]); ok('document over 256 KiB refused', !r.ok && r.code === 'invalid_argument');
r = E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'bad', json: '[1]' }]]); ok('non-object document refused', !r.ok);
r = E.call('deskWrite', [[{ op: 'set', col: 'nothere', id: 'bad', json: '{}' }]]); ok('unknown collection refused', !r.ok);
r = E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'a/b', json: '{}' }]]); ok('id with slash refused', !r.ok);
// paging
const docs = []; for (let i = 0; i < 40; i++) docs.push({ op: 'set', col: 'roll', id: 'r' + String(i).padStart(2, '0'), json: JSON.stringify({ i, pad: 'p'.repeat(200000) }) });
for (let i = 0; i < docs.length; i += 5) E.call('deskWrite', [docs.slice(i, i + 5)]);
let cursor = null, got = [], pages = 0; do { const p = E.call('deskRead', ['roll', cursor]); got = got.concat(p.docs); cursor = p.next; pages++; } while (cursor);
ok('collection of 8 MB reads in several pages, in id order, nothing lost or repeated', pages >= 2 && got.length === 40 && got.every((d, i) => d.id === 'r' + String(i).padStart(2, '0')), pages + '/' + got.length);
r = E.call('deskDigest', ['roll']); ok('digest counts the docs', r.ok && r.docs === 40);
// delete, revs, wipe, stats
r = E.call('deskWrite', [[{ op: 'delete', col: 'roll', id: 'r00' }, { op: 'delete', col: 'roll', id: 'r01' }]]); ok('delete removes rows', r.ok && !('roll/r00' in E.stored()) && 'roll/r02' in E.stored());
r = E.call('deskRevs', []); ok('revisions bump per collection', r.ok && r.revs.roll >= 9 && r.revs.users >= 1, JSON.stringify(r.revs));
r = E.call('deskStats', []); ok('stats counts docs per collection', r.ok && r.counts.roll === 38 && !r.empty && !r.seedOnly);
r = E.call('deskWipe', [['roll', 'inv']]); ok('wipe removes the named collections only', r.ok && !Object.keys(E.stored()).some(k => /^(roll|inv)\//.test(k)) && 'users/u1' in E.stored());
// lock failure -> transient error code the page retries
E.state.lockFail = true; r = E.call('deskWrite', [[set('log', 'z', { a: 1 })]]); ok('lock timeout maps to unavailable (page retries)', !r.ok && r.code === 'unavailable', JSON.stringify(r)); E.state.lockFail = false;
// seed-only store detection
const E2 = makeEnv(); E2.call('deskWrite', [[set('users', 'u1', { email: 'data@virgoasia.com', role: 'Super admin', seed: true }), set('plants', '1001', { seed: true })]]);
r = E2.call('deskStats', []); ok('store holding only seeded users/plants counts as empty for restore', r.ok && r.seedOnly && !r.empty);
// doGet
const out = E.ctx.doGet({ parameter: { h: '/action/abc' } });
ok('doGet injects boot data, sets title, keeps the marker out', out.title === 'Virgo Laminates Performance Desk' && out.html.includes('window.__GAS_BOOT={"email":"data@virgoasia.com"') && !out.html.includes('/*@@GAS_BOOT@@*/') && out.html.includes('"h":"/action/abc"') && out.meta[0][0] === 'viewport');
console.log(res.join('\n'));
