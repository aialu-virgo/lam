import { makeEnv } from './gas-env.mjs';
import { chromium, openGas } from './gas-page.mjs';
import { open as openClaude } from '../../desk/test/run.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
const FX = process.env.FX || '/tmp/claude-0/-home-user-lam/cc66010f-b189-5207-a8a3-0de9659c9226/scratchpad/fx';
const res = []; const ok = (n, c, d) => { const l = (c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || '')); console.log(l); res.push(l); if (!c) process.exitCode = 1; };

const CRCT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crcOf = (s) => { let c = 0xFFFFFFFF; for (const b of Buffer.from(s, 'utf8')) c = CRCT[(c ^ b) & 255] ^ (c >>> 8); return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0'); };
const docCrcN = (id, js) => { let c = 0xFFFFFFFF; for (const b of Buffer.from(id + '\n' + js + '\n', 'utf8')) c = CRCT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
/* rewrite a backup folder so that mutate(parts) changes the data AND the manifest is made consistent again (so only the id/size rules can catch it) */
function forgeBackup(srcDir, dstDir, mutate) {
  fs.mkdirSync(dstDir, { recursive: true });
  const names = fs.readdirSync(srcDir), mf = names.find(n => /manifest/.test(n)), man = JSON.parse(fs.readFileSync(path.join(srcDir, mf), 'utf8'));
  const parts = {}; man.files.forEach(f => { parts[f.name] = JSON.parse(fs.readFileSync(path.join(srcDir, f.name), 'utf8')); });
  mutate(parts);
  const per = {}; Object.values(parts).forEach(p => p.docs.forEach(d => { const o = per[d[0]] || (per[d[0]] = { docs: 0, chars: 0, sum: 0 }); const js = JSON.stringify(d[2]); o.docs++; o.chars += js.length; o.sum = (o.sum + docCrcN(d[1], js)) % 4294967296; }));
  Object.keys(man.collections).forEach(c => { const o = per[c] || { docs: 0, chars: 0, sum: 0 }; man.collections[c].docs = o.docs; man.collections[c].chars = o.chars; man.collections[c].sumcrc32 = o.sum.toString(16).padStart(8, '0'); });
  man.files.forEach(f => { const t = JSON.stringify(parts[f.name]); fs.writeFileSync(path.join(dstDir, f.name), t); f.bytes = Buffer.byteLength(t); f.crc32 = crcOf(t); });
  fs.writeFileSync(path.join(dstDir, mf), JSON.stringify(man));
  return fs.readdirSync(dstDir).map(n => path.join(dstDir, n));
}
const pick = async (page, files) => { for (let a = 0; a < 4; a++) { await page.waitForTimeout(1500); const n0 = await page.evaluate(() => window.__gasRestoreState().n); await page.setInputFiles('#gr-files', []); await page.waitForTimeout(500); await page.setInputFiles('#gr-files', files); for (let w = 0; w < 20; w++) { await page.waitForTimeout(250); if ((await page.evaluate(() => window.__gasRestoreState().n)) > n0) return; } } };
const browser = await chromium.launch();
const env = makeEnv();
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });

/* ---------- 1. sign-in as Super admin, registered non-admin, unknown email ---------- */
env.setEmail('data@virgoasia.com');
let A = await openGas(browser, env, 'data@virgoasia.com'); await A.page.waitForTimeout(6000);
let st = await A.page.evaluate(() => ({ role: window.__desk.S.role, email: window.__desk.S.viewer.email, owner: window.__desk.S.viewer.owner, db: window.__desk.S.dbState, users: window.__desk.S.users.length }));
ok('Super admin boots: role, email, owner, database ready, seed users written', st.role === 'Super admin' && st.email === 'data@virgoasia.com' && st.owner && st.db === 'ready' && st.users === 2, JSON.stringify(st));
const sem = await A.page.evaluate(async () => { const base = window.google.script.run; let wrong = 0, right = 0; base.withSuccessHandler(() => { wrong++; }).deskRevs.apply(base, []); await new Promise(r => base.withSuccessHandler(() => { right++; r(); }).deskRevs()); await new Promise(r => setTimeout(r, 400)); return { wrong, right }; });
ok('the google.script.run mock is strict: a method applied to the base runner loses its handlers; a chained call works', sem.wrong === 0 && sem.right === 1, JSON.stringify(sem));
env.call('deskWrite', [[set('users', 'se_virgoasia_com', { email: 'se@virgoasia.com', name: 'Se Exec', role: 'Sales executive', department: 'Sales', plant_codes: '', reports_to_email: '', whatsapp_number: '', today_cap: 5, active: true, sales_employee_code: '' })]]);
let B = await openGas(browser, env, 'se@virgoasia.com'); await B.page.waitForTimeout(6000);
st = await B.page.evaluate(() => ({ role: window.__desk.S.role, owner: window.__desk.S.viewer.owner }));
ok('non-admin boots as Sales executive, not owner', st.role === 'Sales executive' && !st.owner, JSON.stringify(st));
const wr = await B.page.evaluate(async () => { const db = await window.claude.use('db'); const o = {}; try { await db.doc('periods/FY27-Q2').set({ status: 'closed' }); o.periods = 'accepted'; } catch (e) { o.periods = e.code; } try { await db.doc('log/x1').set({ t: 1 }); o.log = 'accepted'; await db.doc('log/x1').delete(); } catch (e) { o.log = e.code; } try { await window.__gasCall('deskWipe', [['log']]); o.wipe = 'accepted'; } catch (e) { o.wipe = e.code; } return o; });
ok('non-admin write to an admin collection is refused through the page runtime; a log write is accepted; wipe refused', wr.periods === 'permission_denied' && wr.log === 'accepted' && wr.wipe === 'permission_denied', JSON.stringify(wr));
ok('no admin doc was created by the refused write', !('periods/FY27-Q2' in env.stored()));
let U = await openGas(browser, env, 'stranger@virgoasia.com'); await U.page.waitForTimeout(6000);
const ut = await U.page.innerText('body');
ok('unknown email sees "Ask your admin for access"', /Ask your admin for access/.test(ut) && /stranger@virgoasia\.com/.test(ut), ut.slice(0, 200));
ok('unknown email received no data', await U.page.evaluate(() => window.__desk.S.users.length === 0 && window.__desk.S.plants.length === 0));
await B.page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-gr', 'run'); b.id = 'fake'; document.body.appendChild(b); b.click(); });
await B.page.waitForTimeout(500);
ok('non-admin cannot trigger Restore (UI path inert; no server call made)', (await B.page.evaluate(() => window.__gasRestoreState().stage)) === 'idle');
ok('non-admin sees no Admin tools', !/Full backup|Restore from backup/i.test(await B.page.innerText('body')));

/* ---------- 2. upload a demo invoice file as Super admin, see coverage ---------- */
await A.page.evaluate(() => { location.hash = '#/intake'; }); await A.page.waitForTimeout(1000);
await (await A.page.$('input[type=file]')).setInputFiles(FX + '/s4_invoice_Oct2026.csv');
await A.page.waitForFunction(() => window.__desk.U && window.__desk.U.stage === 'mapping', null, { timeout: 60000 });
await A.page.click('[data-act="u-validate"]');
await A.page.waitForFunction(() => ['validated', 'done'].includes(window.__desk.U.stage), null, { timeout: 120000 });
const vs = await A.page.evaluate(() => ({ stage: window.__desk.U.stage, msg: window.__desk.U.msg || '' }));
if (vs.stage === 'validated') { if (await A.page.$('[data-act="u-confrep"]')) await A.page.click('[data-act="u-confrep"]'); await A.page.click('[data-act="u-load"]'); await A.page.waitForFunction(() => window.__desk.U.stage === 'done', null, { timeout: 120000 }); }
await A.page.waitForTimeout(5000);
const cov = await A.page.evaluate(() => ({ cells: Object.keys(window.__desk.S.cells), stage: window.__desk.U.stage, done: window.__desk.U.doneMsg || '' }));
ok('demo invoice file loaded through Data Intake', cov.stage === 'done' && cov.cells.some(k => /INV_2026-10/.test(k)), JSON.stringify(cov));
const stored = env.stored(); const kinds = {}; Object.keys(stored).forEach(k => { const c = k.split('/')[0]; kinds[c] = (kinds[c] || 0) + 1; });
ok('chunks, coverage cells, roll-ups and upload record are in the Sheet store', kinds.inv > 0 && kinds.cells > 0 && kinds.roll > 0 && kinds.uploads > 0, JSON.stringify(kinds));
await A.page.evaluate(() => { location.hash = '#/intake'; }); await A.page.waitForTimeout(800);
ok('coverage grid shows the loaded month', /Oct 2026|FY27-Q3|Q3 FY27/.test(await A.page.innerText('body')));
await B.page.waitForTimeout(38000);
ok('another user sees the new coverage after a poll (poll every 30 s)', (await B.page.evaluate(() => Object.keys(window.__desk.S.cells).length)) > 0);
ok('deep link ?h= sets the route', await (async () => { const L = await openGas(browser, env, 'data@virgoasia.com', { hash: '/actions' }); await L.page.waitForTimeout(3000); const h = await L.page.evaluate(() => location.hash); await L.ctx.close(); return h === '#/actions'; })());
ok('page builds action links from the /exec URL', await A.page.evaluate(() => /\/exec\?h=\/action\//.test(String(window.__GAS_BOOT.url + '?h=/action/'))));
const aerr = A.errs.filter(e => !/ERR_FAILED/.test(e)); ok('no page errors in the Super admin session', !aerr.length, JSON.stringify(aerr.slice(0, 4)));
await A.ctx.close(); await B.ctx.close(); await U.ctx.close();

/* ---------- 3. round trip: claude.ai build (mock runtime) -> backup files -> Apps Script build restore ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
const C = await openClaude(browser, { viewer: { email: 'data@virgoasia.com', name: 'Vijay' }, autoload: false });
await C.page.waitForTimeout(3000);
await C.page.evaluate(() => { location.hash = '#/intake'; }); await C.page.waitForTimeout(800);
await C.page.click('[data-act="demo-load"]'); await C.page.waitForFunction(() => window.__desk.S.uploads.length > 0, null, { timeout: 240000 }); await C.page.waitForTimeout(6000);
// a few non-admin collections so every kind is exercised
await C.page.evaluate(async () => { const db = await window.claude.use('db'); await db.doc('log/rt1').set({ t: 1, txt: 'é₹ "q" \n line' }); await db.doc('planlocks/FY27-Q4').set({ by: 'x' }); await db.doc('settings/main').set({ a: [1, 2, { b: 3 }], n: null }); });
await C.page.waitForTimeout(1500);
await C.page.evaluate(() => { window.__FB_MAX = 300000; });
await C.page.evaluate(() => { location.hash = '#/admin'; }); await C.page.waitForTimeout(600);
await C.page.click('[data-t="tools"]'); await C.page.waitForTimeout(500);
ok('Super admin sees Download full backup (claude.ai build)', /Download full backup/.test(await C.page.innerText('#pg')));
await C.page.click('[data-act="fb-make"]'); await C.page.waitForFunction(() => window.__desk.S.fb && ['ready', 'error'].includes(window.__desk.S.fb.stage), null, { timeout: 240000 });
const fb = await C.page.evaluate(() => ({ stage: window.__desk.S.fb.stage, msg: window.__desk.S.fb.msg, n: window.__desk.S.fb.files && window.__desk.S.fb.files.length, man: window.__desk.S.fb.manifest }));
ok('backup built', fb.stage === 'ready', JSON.stringify(fb.msg));
const mock = await C.page.evaluate(() => window.__mockStore());
await C.page.click('[data-act="fb-size"]'); await C.page.waitForFunction(() => window.__desk.S.fb.size && !window.__desk.S.fb.sizeBusy, null, { timeout: 120000 });
await C.page.waitForTimeout(800);
const csz = await C.page.evaluate(() => ({ rows: window.__desk.S.fb.size.rows, txt: document.querySelector('#pg').innerText, store: window.__mockStore() }));
const expChars = Object.values(csz.store).reduce((n, d) => n + JSON.stringify(d).length, 0), expDocs = Object.keys(csz.store).length;
const perCol = (entries) => { const o = {}; entries.forEach(([k, len]) => { const c = k.split('/')[0]; (o[c] = o[c] || { docs: 0, chars: 0 }); o[c].docs++; o[c].chars += len; }); return o; };
const stable = ['inv', 'cells', 'roll', 'plants', 'uploads', 'mappings'];
const expC = perCol(Object.entries(csz.store).map(([k, d]) => [k, JSON.stringify(d).length]));
ok('claude.ai build: Store size lists documents and characters per collection; the stable collections match the store exactly', stable.every(c => { const r = csz.rows.find(x => x.c === c); return r && r.docs === expC[c].docs && r.chars === expC[c].chars; }) && /Total/.test(csz.txt) && csz.rows.length >= 15, JSON.stringify(csz.rows.filter(r => stable.includes(r.c)).map(r => [r.c, r.docs, r.chars])) + ' vs ' + JSON.stringify(stable.map(c => [c, expC[c]])));
const mockCols = {}; Object.keys(mock).forEach(k => { const c = k.split('/')[0]; mockCols[c] = (mockCols[c] || 0) + 1; });
const manDocs = {}; Object.keys(fb.man.collections).forEach(c => manDocs[c] = fb.man.collections[c].docs);
ok('manifest lists every collection with the right document count', Object.keys(mockCols).every(c => manDocs[c] === mockCols[c]) && Object.keys(manDocs).length === 29, JSON.stringify({ mockCols, manDocs }));
ok('data split over several files (forced small size)', fb.n > 2, fb.n);
await C.page.click('[data-act="fb-saveall"]'); await C.page.waitForTimeout(6000);
const saved = await C.page.evaluate(() => window.__saved);
ok('every file was saved through the downloads capability', saved.length === fb.n && saved.every(s => s.filename && s.data), saved.length + '/' + fb.n);
const maxChars = Math.max(...saved.filter(s => !/manifest/.test(s.filename)).map(s => s.data.length));
saved.forEach(s => fs.writeFileSync(path.join(tmp, s.filename), s.data));
// non-admin on the claude.ai side
const NA = await openClaude(browser, { viewer: { email: 'se.s1@demo', name: 'Demo Sales 1' }, store: JSON.parse(JSON.stringify(mock)), autoload: false }); await NA.page.waitForTimeout(3500);
await NA.page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-act', 'fb-make'); document.body.appendChild(b); b.click(); }); await NA.page.waitForTimeout(800);
ok('claude.ai build: a non-admin cannot make a backup (no files built, nothing saved)', (await NA.page.evaluate(() => ({ s: window.__desk.S.fb.stage, n: (window.__saved || []).length }))).s === 'idle');
await NA.page.evaluate(() => { location.hash = '#/admin'; }); await NA.page.waitForTimeout(500);
ok('claude.ai build: a non-admin sees no backup tool', !/full backup/i.test(await NA.page.innerText('#pg')));
await NA.ctx.close(); await C.ctx.close();

// restore into a fresh Apps Script store
const env2 = makeEnv();
const R = await openGas(browser, env2, 'data@virgoasia.com'); await R.page.waitForTimeout(5000);
await R.page.evaluate(() => { location.hash = '#/admin'; }); await R.page.waitForTimeout(600); await R.page.click('[data-t="tools"]'); await R.page.waitForTimeout(500);
ok('Apps Script build shows Restore from backup to the Super admin', /Restore from backup/i.test(await R.page.innerText("#pg")));
const files = fs.readdirSync(tmp).map(f => path.join(tmp, f));
// tamper check: a part file with one changed character is rejected before anything is written
const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkt-')); files.forEach(f => fs.copyFileSync(f, path.join(tdir, path.basename(f))));
const pf = fs.readdirSync(tdir).find(f => /part-01/.test(f)); const body = fs.readFileSync(path.join(tdir, pf), 'utf8'); fs.writeFileSync(path.join(tdir, pf), body.replace(/"(\w+)"/, (m) => m.toUpperCase() === m ? '"Z"' : m.slice(0, -2) + 'X"'));
await pick(R.page, fs.readdirSync(tdir).map(f => path.join(tdir, f))); await R.page.waitForFunction(() => ['verified', 'error'].includes(window.__gasRestoreState().stage), null, { timeout: 120000 });
const tv = await R.page.evaluate(() => window.__gasRestoreState());
ok('a tampered part file is refused (size or checksum), nothing written', tv.stage === 'error' && !Object.keys(env2.stored()).some(k => k.startsWith('inv/')), tv.err);
await pick(R.page, files); await R.page.waitForFunction(() => ['verified', 'error'].includes(window.__gasRestoreState().stage), null, { timeout: 120000 });
const vr = await R.page.evaluate(() => { const s = window.__gasRestoreState(); return { stage: s.stage, err: s.err, rows: s.rows && s.rows.length }; });
ok('manifest and checksums verified in the browser', vr.stage === 'verified' && vr.rows === 29, JSON.stringify(vr));
await R.page.click('[data-gr="run"]'); await R.page.waitForFunction(() => ['done', 'verified', 'error'].includes(window.__gasRestoreState().stage) && window.__gasRestoreState().stage !== 'working', null, { timeout: 600000 });
const rr = await R.page.evaluate(() => window.__gasRestoreState());
ok('restore finished and every collection matches its manifest count and checksum', rr.stage === 'done' && rr.report.every(r => r.ok), JSON.stringify(rr.err || rr.report.filter(r => !r.ok)));
ok('report lists counts for all 29 collections', rr.report && rr.report.length === 29);
const got = env2.stored(); let bad = 0, miss = 0, extra = 0;
Object.keys(mock).forEach(k => { if (!(k in got)) miss++; else if (got[k] !== JSON.stringify(mock[k])) bad++; });
Object.keys(got).forEach(k => { if (!(k in mock)) extra++; });
ok('every document in the Sheet store matches the claude.ai store exactly (' + Object.keys(mock).length + ' docs)', bad === 0 && miss === 0 && extra === 0, JSON.stringify({ bad, miss, extra }));
ok('doc ids and contents compared as JSON text, including non-ASCII and nested values', got['log/rt1'] === JSON.stringify(mock['log/rt1']) && /é₹/.test(got['log/rt1']));
// second restore: store now has data
await pick(R.page, files); await R.page.waitForFunction(() => ['verified','error'].includes(window.__gasRestoreState().stage), null, { timeout: 120000 }); console.log('state', JSON.stringify(await R.page.evaluate(() => { const s = window.__gasRestoreState(); return { st: s.stage, err: s.err }; })));
const before = JSON.stringify(Object.keys(env2.stored()).length); await R.page.click('[data-gr="run"]'); await R.page.waitForFunction(() => window.__gasRestoreState().stage !== 'working', null, { timeout: 120000 });
const r2 = await R.page.evaluate(() => window.__gasRestoreState());
ok('restore into a store that already has data is refused without "Replace everything"', /already holds data/.test(r2.err) && JSON.stringify(Object.keys(env2.stored()).length) === before, r2.err);
await R.page.check('#gr-replace'); await R.page.click('[data-gr="run"]'); await R.page.waitForFunction(() => window.__gasRestoreState().stage === 'done', null, { timeout: 600000 });
const got2 = env2.stored(); let bad2 = 0; Object.keys(mock).forEach(k => { if (got2[k] !== JSON.stringify(mock[k])) bad2++; });
ok('with "Replace everything" it overwrites and again matches exactly', bad2 === 0 && Object.keys(got2).length === Object.keys(mock).length, bad2);

/* ---- validation happens before anything is wiped ---- */
await R.page.waitForTimeout(3000);
const dataBefore = Object.keys(env2.stored()).length;
const forged1 = forgeBackup(tmp, path.join(tmp + '-f1'), parts => { const f = Object.values(parts).find(p => p.docs.some(d => d[0] === 'log')); f.docs.find(d => d[0] === 'log')[1] = 'bad/id'; });
await pick(R.page, forged1); await R.page.waitForFunction(() => ['verified', 'error'].includes(window.__gasRestoreState().stage), null, { timeout: 120000 });
let fs1 = await R.page.evaluate(() => window.__gasRestoreState());
ok('a backup with an invalid document id is refused before any write, even though its manifest and checksums are consistent', fs1.stage === 'error' && /Invalid document id/.test(fs1.err), fs1.err);
const forged2 = forgeBackup(tmp, path.join(tmp + '-f2'), parts => { const f = Object.values(parts).find(p => p.docs.some(d => d[0] === 'log')); f.docs.find(d => d[0] === 'log')[2].pad = 'x'.repeat(270000); });
await pick(R.page, forged2); await R.page.waitForFunction(() => ['verified', 'error'].includes(window.__gasRestoreState().stage), null, { timeout: 120000 });
fs1 = await R.page.evaluate(() => window.__gasRestoreState());
ok('a backup holding a document over the 256 KiB limit is refused before any write', fs1.stage === 'error' && /limit/.test(fs1.err), fs1.err);
const forged3 = forgeBackup(tmp, path.join(tmp + '-f3'), parts => { const f = Object.values(parts).find(p => p.docs.some(d => d[0] === 'log')); f.docs.push(JSON.parse(JSON.stringify(f.docs.find(d => d[0] === 'log')))); });
await pick(R.page, forged3); await R.page.waitForFunction(() => ['verified', 'error'].includes(window.__gasRestoreState().stage), null, { timeout: 120000 });
fs1 = await R.page.evaluate(() => window.__gasRestoreState());
ok('a backup with a duplicate id is refused before any write', fs1.stage === 'error' && /Duplicate/.test(fs1.err), fs1.err);
ok('the database was not touched by any refused restore (replace was never ticked or reached)', Object.keys(env2.stored()).length === dataBefore);
/* ---- a restore that stops half way: clear incomplete state, safe re-run ---- */
await pick(R.page, files); await R.page.waitForFunction(() => window.__gasRestoreState().stage === 'verified', null, { timeout: 120000 });
await R.page.check('#gr-replace');
env2.state.failAfterSetValues = 12;
await R.page.click('[data-gr="run"]'); await R.page.waitForFunction(() => ['incomplete', 'done', 'verified'].includes(window.__gasRestoreState().stage), null, { timeout: 300000 });
env2.state.failAfterSetValues = null;
const inc = await R.page.evaluate(() => ({ s: window.__gasRestoreState(), txt: document.querySelector('#pg').innerText }));
ok('a restore that stops partway shows "Restore incomplete" with the per-collection table', inc.s.stage === 'incomplete' && /Restore incomplete/i.test(inc.txt) && /Written so far/i.test(inc.txt) && inc.s.report.length === 29 && /Replace everything/.test(inc.txt), inc.s.stage + ' ' + inc.s.err);
ok('the incomplete store really is partial', Object.keys(env2.stored()).length < dataBefore);
await R.page.waitForTimeout(1500);
await R.page.click('[data-gr="run"]'); await R.page.waitForFunction(() => ['done', 'verified', 'incomplete'].includes(window.__gasRestoreState().stage), null, { timeout: 600000 });
const got3 = env2.stored(); let bad3 = 0; Object.keys(mock).forEach(k => { if (got3[k] !== JSON.stringify(mock[k])) bad3++; });
ok('re-running the restore after the failure is safe and ends exactly equal to the backup', (await R.page.evaluate(() => window.__gasRestoreState().stage)) === 'done' && bad3 === 0 && Object.keys(got3).length === Object.keys(mock).length, bad3);
await R.page.waitForTimeout(2500);
await R.page.click('[data-act="fb-size"]'); await R.page.waitForFunction(() => window.__desk.S.fb.size && !window.__desk.S.fb.sizeBusy, null, { timeout: 120000 });
const gsz = await R.page.evaluate(() => ({ rows: window.__desk.S.fb.size.rows, note: window.__desk.S.fb.size.note }));
const gStore = env2.stored(), expG = perCol(Object.entries(gStore).map(([k, js]) => [k, js.length]));
ok('Apps Script build: Store size comes from the server, matches the Sheet store for the stable collections, and carries the PAGE_CHARS note', stable.every(c => { const r = gsz.rows.find(x => x.c === c); return r && r.docs === expG[c].docs && r.chars === expG[c].chars && r.chars === expC[c].chars; }) && /PAGE_CHARS/.test(gsz.note), JSON.stringify(gsz.rows.filter(r => stable.includes(r.c)).map(r => [r.c, r.docs, r.chars])))
// the restored data opens in the page for another user
const V = await openGas(browser, env2, 'data@virgoasia.com'); await V.page.waitForTimeout(9000);
ok('a fresh session on the restored store shows the data (uploads and coverage present)', await V.page.evaluate(() => window.__desk.S.uploads.length > 0 && Object.keys(window.__desk.S.cells).length > 0));
ok('largest backup part is at most the forced size plus one document', maxChars < 300000 + 262144 + 1000, maxChars);

ok('the Apps Script build has no "Sign in to claude.ai" text', !fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../out/Desk-Index.txt'), 'utf8').includes('Sign in to claude.ai'));
/* ---------- 4. backup: data changing during the export is flagged ---------- */
const C2 = await openClaude(browser, { viewer: { email: 'data@virgoasia.com', name: 'Vijay' }, store: JSON.parse(JSON.stringify(mock)), autoload: false }); await C2.page.waitForTimeout(3500);
await C2.page.evaluate(() => { location.hash = '#/admin'; }); await C2.page.waitForTimeout(600); await C2.page.click('[data-t="tools"]'); await C2.page.waitForTimeout(500);
/* the source database answers the FIRST read of each collection from a stale cache (empty, metadata.fromCache true); every read is slowed so the edit lands between the two passes */
await C2.page.evaluate(async () => { const db = await window.claude.use('db'); const oc = db.collection, first = {}; db.collection = (c) => { const q = oc(c); const g = q.get; q.get = async () => { await new Promise(r => setTimeout(r, 120)); if (!first[c]) { first[c] = 1; return { docs: [], size: 0, empty: true, metadata: { fromCache: true, hasPendingWrites: false }, docChanges() { return []; } }; } return g.call(q); }; return q; }; });
await C2.page.click('[data-act="fb-make"]');
await C2.page.waitForFunction(() => /^Reading /.test(window.__desk.S.fb.msg), null, { timeout: 60000 });
ok('a warning banner is shown while the backup is being made', /Do not upload files or edit anything/.test(await C2.page.innerText('#pg')));
await C2.page.waitForFunction(() => /^Checking users again/.test(window.__desk.S.fb.msg), null, { timeout: 240000 });
await C2.page.evaluate(async () => { const db = await window.claude.use('db'); await db.doc('log/rt1').set({ t: 99, txt: 'edited during the export' }); });
await C2.page.waitForFunction(() => ['ready', 'error'].includes(window.__desk.S.fb.stage), null, { timeout: 240000 });
const ch = await C2.page.evaluate(() => ({ changed: window.__desk.S.fb.changed, man: window.__desk.S.fb.manifest.changedDuringExport, txt: document.querySelector('#pg').innerText }));
ok('an EDIT during the export (same document count) is flagged by the second fresh read, while the source first serves a stale fromCache snapshot for every collection (banner and manifest; the backup retried until server-definitive)', ch.changed.length === 1 && ch.changed[0].collection === 'log' && ch.changed[0].kind === 'content' && ch.changed[0].after === ch.changed[0].before && ch.man.length === 1 && /Data changed while the backup was being made/.test(ch.txt) && /log \(edited\)/.test(ch.txt) && /Do not upload files or edit anything/.test(ch.txt), JSON.stringify(ch.changed));
await C2.page.click('[data-act="fb-saveall"]'); await C2.page.waitForTimeout(5000);
const saved2 = await C2.page.evaluate(() => window.__saved); ok('despite the stale-cache first reads, the backup holds every document (582)', (await C2.page.evaluate(() => Object.values(window.__desk.S.fb.manifest.collections).reduce((n, c) => n + c.docs, 0))) >= Object.keys(mock).length, ''); const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bk2-')); saved2.forEach(sv => fs.writeFileSync(path.join(tmp2, sv.filename), sv.data));
await pick(R.page, fs.readdirSync(tmp2).map(f => path.join(tmp2, f))); await R.page.waitForFunction(() => ['verified', 'error'].includes(window.__gasRestoreState().stage), null, { timeout: 40000 }).catch(async () => console.log('DBG', JSON.stringify(await R.page.evaluate(() => { const s = window.__gasRestoreState(); return { st: s.stage, err: s.err, n: document.querySelectorAll('#gr-files').length }; })), fs.readdirSync(tmp2)));
const cr = await R.page.evaluate(() => window.__gasRestoreState());
ok('the restore refuses a backup that was flagged as changed during export', cr.stage === 'error' && /made while data was changing/.test(cr.err), cr.err);
await browser.close();
console.log(res.filter(l => l.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
