import { makeEnv } from './gas-env.mjs';
const ok = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || ''))); if (!c) process.exitCode = 1; };
const E = makeEnv();
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
/* read a whole collection the way the page does: plan, then one page call per page */
function readAll(env, col) {
  const plan = env.call('deskPlan', [col]); if (!plan.ok) return { err: plan };
  let docs = []; let skipped = 0;
  for (const p of plan.pages) { const r = env.call('deskPage', [col, p[0], p[1], plan.rev]); if (!r.ok) return { err: r }; docs = docs.concat(r.docs); skipped += r.skipped; }
  return { docs, skipped, plan };
}
const ids = x => (x.docs || []).map(d => d.id).sort();
const crc = (s) => { let c = 0xFFFFFFFF; const t = []; for (let n = 0; n < 256; n++) { let v = n; for (let k = 0; k < 8; k++) v = v & 1 ? 0xEDB88320 ^ (v >>> 1) : v >>> 1; t[n] = v >>> 0; } for (const b of Buffer.from(s, 'utf8')) c = t[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

let r = E.call('deskWrite', [[set('users', 'u1', { email: 'data@virgoasia.com', role: 'Super admin', active: true }), set('users', 'u2', { email: 'se@virgoasia.com', role: 'Sales executive', active: true, name: 'Se' }), set('users', 'u3', { email: 'gone@virgoasia.com', role: 'Sales executive', active: false }), set('users', 'u4', { email: 'adm2@virgoasia.com', role: 'Super admin', active: true })]]);
ok('seed Super admin can write users on an empty store (revision +2)', r.ok && r.revs.users === 2, JSON.stringify(r));
ok('one sheet per collection was created', !!E.sheets.c_users && !!E.sheets.info);
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
ok('non-admin refused deskStats', E.call('deskStats').code === 'permission_denied');
r = E.call('deskWipe', [['log']]); ok('non-admin refused deskWipe', r.code === 'permission_denied' && 'log/l1' in E.stored());
ok('non-admin refused deskDigestPage', E.call('deskDigestPage', ['log', 2, 2, 0]).code === 'permission_denied');
ok('registered non-admin reads users', readAll(E, 'users').docs.length === 4);
E.setEmail('gone@virgoasia.com'); ok('inactive user reads nothing', readAll(E, 'users').docs.length === 0);
ok('inactive user cannot write', !E.call('deskWrite', [[set('log', 'l3', { t: 1 })]]).ok);
ok('inactive user: single-doc read returns nothing', E.call('deskGetMany', [['users/u1']]).docs[0].json === null);
E.setEmail('stranger@virgoasia.com'); ok('unknown email reads nothing', readAll(E, 'users').docs.length === 0);
r = E.call('deskWrite', [[set('log', 'l3', { t: 1 })]]); ok('unknown email cannot write', !r.ok && r.code === 'permission_denied');
E.setEmail(''); ok('blank email refused', E.call('deskPlan', ['users']).code === 'unauthenticated');
E.setEmail('adm2@virgoasia.com'); ok('second Super admin (from users collection) writes periods', E.call('deskWrite', [[set('periods', 'FY27-Q2', { status: 'closed' })]]).ok);
E.setEmail('data@virgoasia.com'); E.call('deskWrite', [[set('users', 'u4', { email: 'adm2@virgoasia.com', role: 'Sales executive', active: true })]]);
E.setEmail('adm2@virgoasia.com'); ok('demoted admin refused at once (ACL cache keyed on users revision)', !E.call('deskWrite', [[set('periods', 'FY27-Q2', { status: 'open' })]]).ok);
E.setEmail('spa@virgoasia.com'); ok('SEED list admin works without a users record', E.call('deskWrite', [[set('periods', 'p', { a: 1 })]]).ok);
E.setEmail('data@virgoasia.com');

/* big documents across parts */
const big = { z: 'é₹abc'.repeat(30000) }, bigJ = JSON.stringify(big);
ok('fixture over 50,000 chars and under 256 KiB', bigJ.length > 50000 && bigJ.length < 262144, bigJ.length);
ok('big doc written', E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'INV-big', json: bigJ }]]).ok);
let rows = E.rawRows('inv').slice(1); ok('big doc split over rows of <= 45,000 characters, len column matches', rows.length === Math.ceil(bigJ.length / 45000) && rows.every(x => x[3].length <= 45000 && x[2] === x[3].length), rows.length);
r = E.call('deskGetMany', [['inv/INV-big', 'inv/none']]); ok('big doc round-trips exactly (single get)', r.docs[0].json === bigJ && r.docs[1].json === null);
r = readAll(E, 'inv'); ok('big doc round-trips exactly (plan + page)', r.docs.length === 1 && r.docs[0].json === bigJ);
E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'INV-big', json: '{"s":1}' }]]); ok('shrinking leaves only the new version', E.rawRows('inv').length === 2 && E.call('deskGetMany', [['inv/INV-big']]).docs[0].json === '{"s":1}');
E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'INV-big', json: bigJ }]]); ok('growing again works', E.call('deskGetMany', [['inv/INV-big']]).docs[0].json === bigJ);
ok('document over 256 KiB refused', E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'huge', json: JSON.stringify({ z: 'x'.repeat(262200) }) }]]).code === 'invalid_argument');
ok('non-object document refused', !E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'bad', json: '[1]' }]]).ok);
ok('unknown collection refused', !E.call('deskWrite', [[{ op: 'set', col: 'nothere', id: 'bad', json: '{}' }]]).ok);
ok('id with slash refused', !E.call('deskWrite', [[{ op: 'set', col: 'inv', id: 'a/b', json: '{}' }]]).ok);

/* paging by rows, pages hold whole documents */
const docs = []; for (let i = 0; i < 40; i++) docs.push({ op: 'set', col: 'roll', id: 'r' + String(i).padStart(2, '0'), json: JSON.stringify({ i, pad: 'p'.repeat(200000) }) });
for (let i = 0; i < docs.length; i += 5) E.call('deskWrite', [docs.slice(i, i + 5)]);
E.stats.gv.length = 0; r = readAll(E, 'roll');
ok('8 MB collection: several pages, every document once, in one getValues per page', r.plan.pages.length >= 3 && r.docs.length === 40 && new Set(ids(r)).size === 40 && E.stats.gv.filter(g => g.sheet === 'c_roll').length === 1 + r.plan.pages.length, r.plan.pages.length + '/' + r.docs.length);
ok('each page read stays bounded (<= ~2.7 M characters, one getValues)', Math.max(...E.stats.gv.map(g => g.chars)) < 2800000, Math.max(...E.stats.gv.map(g => g.chars)));
let sum = 0, nd = 0; for (const p of r.plan.pages) { const d = E.call('deskDigestPage', ['roll', p[0], p[1], r.plan.rev]); sum = (sum + d.sum) % 4294967296; nd += d.docs; }
let want = 0; r.docs.forEach(d => { want = (want + crc(d.id + '\n' + d.json + '\n')) % 4294967296; });
ok('server digest equals an independent CRC-32 sum', sum === want && nd === 40, sum + ' vs ' + want);
ok('digest handles non-ASCII (UTF-8) like the browser', (() => { const e2 = makeEnv(); e2.call('deskWrite', [[set('log', 'u', { t: 'é₹😀' })]]); const pl = e2.call('deskPlan', ['log']); const d = e2.call('deskDigestPage', ['log', pl.pages[0][0], pl.pages[0][1], pl.rev]); return d.sum === crc('u\n' + JSON.stringify({ t: 'é₹😀' }) + '\n'); })());

/* sequence lock: reads never mix versions */
const plan0 = E.call('deskPlan', ['roll']);
E.call('deskWrite', [[set('roll', 'r00', { i: 0, changed: true })]]);
r = E.call('deskPage', ['roll', plan0.pages[0][0], plan0.pages[0][1], plan0.rev]); ok('a page read with an out-of-date revision is refused as stale', !r.ok && r.code === 'stale', JSON.stringify(r).slice(0, 100));
E.props.DESK_REVS = JSON.stringify({ revs: { ...JSON.parse(E.props.DESK_REVS).revs, roll: 5 }, wts: Date.now() });
r = E.call('deskPlan', ['roll']); ok('a write in progress (odd revision) makes a read wait (unavailable, busy)', !r.ok && r.code === 'unavailable');
E.props.DESK_REVS = JSON.stringify({ revs: { ...JSON.parse(E.props.DESK_REVS).revs, roll: 5 }, wts: Date.now() - 200000 });
r = E.call('deskPlan', ['roll']); ok('a crashed write (odd revision older than 150 s) is ignored', r.ok);
r = E.call('deskWrite', [[set('roll', 'r00', { i: 0, healed: true })]]); ok('the next write heals the revision to even', r.ok && r.revs.roll % 2 === 0, JSON.stringify(r));

/* atomic updates */
E.call('deskWrite', [[set('settings', 'main', { v: 1, pad: 'a'.repeat(100000) })]]);
const readMain = () => JSON.parse(E.call('deskGetMany', [['settings/main']]).docs[0].json);
E.state.failAfterSetValues = 0; r = E.call('deskWrite', [[set('settings', 'main', { v: 2, pad: 'b'.repeat(100000) })]]); E.state.failAfterSetValues = null;
ok('a failed append leaves the old complete version readable and the revision even', !r.ok && readMain().v === 1 && JSON.parse(E.props.DESK_REVS).revs.settings % 2 === 0, JSON.stringify(r));
E.state.failDeleteRows = true; r = E.call('deskWrite', [[set('settings', 'main', { v: 3, pad: 'c'.repeat(100000) })]]); E.state.failDeleteRows = false;
ok('a failed delete of the old rows leaves both versions; readers take the newest complete one', !r.ok && readMain().v === 3 && E.rawRows('settings').length > 4);
r = readAll(E, 'settings'); ok('page reads also pick the newest complete version', r.docs.length === 1 && JSON.parse(r.docs[0].json).v === 3);
E.call('deskWrite', [[set('settings', 'main', { v: 4 })]]); ok('the next write removes every older row of the document', readMain().v === 4 && E.rawRows('settings').length === 2);
// orphan: a newer token with missing parts, and a document with no complete version at all
const rr = E.sheets.c_settings.rows; rr.push(['main', '0/3/999999999zzz', 5, '{"v":', 'x', 'x']);
rr.push(['broken', '0/2/000000001aaa', 5, '{"a":', 'x', 'x']);
r = readAll(E, 'settings'); ok('an orphan newer part group is ignored; a broken document is skipped and does not block the collection', r.docs.length === 1 && JSON.parse(r.docs[0].json).v === 4 && r.skipped === 1, JSON.stringify([r.docs.length, r.skipped]));
ok('single-document read of a broken document returns "not found", not an error', E.call('deskGetMany', [['settings/broken']]).docs[0].json === null);

/* delete, revs, wipe, stats */
r = E.call('deskWrite', [[{ op: 'delete', col: 'roll', id: 'r01' }, { op: 'delete', col: 'roll', id: 'r02' }]]); ok('delete removes rows', r.ok && !('roll/r01' in E.stored()) && 'roll/r03' in E.stored());
r = E.call('deskRevs', []); ok('revision map is one cheap call and every write adds 2', r.ok && r.revs.users === 6 && Object.values(r.revs).every(n => n % 2 === 0), JSON.stringify(r.revs));
r = E.call('deskStats', []); ok('stats counts docs per collection', r.ok && r.counts.roll === 38 && !r.empty && !r.seedOnly);
r = E.call('deskWipe', [['roll', 'inv']]); ok('wipe removes the named collections only', r.ok && !Object.keys(E.stored()).some(k => /^(roll|inv)\//.test(k)) && 'users/u1' in E.stored());
E.state.lockFail = true; r = E.call('deskWrite', [[set('log', 'z', { a: 1 })]]); ok('lock timeout maps to unavailable (page retries)', !r.ok && r.code === 'unavailable'); E.state.lockFail = false;
const E2 = makeEnv(); E2.call('deskWrite', [[set('users', 'u1', { email: 'data@virgoasia.com', role: 'Super admin', seed: true }), set('plants', '1001', { seed: true })]]);
r = E2.call('deskStats', []); ok('store holding only seeded users/plants counts as empty for restore', r.ok && r.seedOnly && !r.empty);
const out = E.ctx.doGet({ parameter: { h: '/action/abc' } });
ok('doGet injects boot data, sets title, keeps the marker out', out.title === 'Virgo Laminates Performance Desk' && out.html.includes('window.__GAS_BOOT={"email":"data@virgoasia.com"') && !out.html.includes('/*@@GAS_BOOT@@*/') && out.html.includes('"h":"/action/abc"') && out.meta[0][0] === 'viewport');
