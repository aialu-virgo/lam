// Page parts (Index, Index2 ...): split/join byte for byte, exact raw read, length + checksum check, the old HTML-parsing call fails on fragments, indexDiag. Needs build-gas.mjs to have run.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { splitAtBoundaries, indexSum, MAX_PART_BYTES } from '../split-lib.mjs';
import { makeEnv } from './gas-env.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, '../out');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const files = fs.readdirSync(out).filter(f => /^Desk-Index\d*\.txt$/.test(f)).sort((a, b) => (+a.replace(/\D/g, '') || 1) - (+b.replace(/\D/g, '') || 1));
const bufs = files.map(f => fs.readFileSync(path.join(out, f)));
const names = files.map((f, i) => i === 0 ? 'Index' : 'Index' + (i + 1));
const texts = Object.fromEntries(bufs.map((b, i) => [names[i], b.toString('utf8')]));
ok('parts are numbered Index, Index2, ... in order', files.every((f, i) => f === 'Desk-' + names[i] + '.txt'));
ok('more than one part', files.length > 1);
ok('every part <= 700000 bytes (the configured cap, default 700 KB)', bufs.every(b => b.length <= MAX_PART_BYTES) && MAX_PART_BYTES <= 700000);
const joined = Buffer.concat(bufs).toString('utf8');
ok('every part decodes as UTF-8 and re-encodes to the same bytes (no cut inside a character)', bufs.every(b => Buffer.from(b.toString('utf8'), 'utf8').equals(b)));
ok('joined parts start with the head and end with </html>', joined.startsWith('<!DOCTYPE html>') && joined.endsWith('</html>\n'));
const dist = fs.readFileSync(path.join(here, '../../desk/dist/index.html'), 'utf8');
const swapped = dist.replace("var PAGE_URL='https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx'", "var PAGE_URL=(window.__GAS_BOOT&&window.__GAS_BOOT.url)||''").replace("PAGE_URL+'#/action/'+a.id", "PAGE_URL+'?h=/action/'+a.id").replace("gate('Database not available','Sign in to claude.ai and open this page again. The Desk stores its data in the shared database.')", "gate('Database not available','The Desk could not reach its database. Reload this page. If it still fails, tell your admin (the Apps Script project may need setup() run once).')");
ok('the joined parts are the built dist after the three build swaps, byte for byte (no sentinels, no comment removal)', joined.endsWith(swapped + '\n</html>\n') && !joined.includes('@@PART'));
ok('the page still carries its boot marker comment exactly once', joined.split('/*@@GAS_BOOT@@*/').length === 2);

// splitting properties on awkward input
const mk = n => '\n/* ---- src/m' + n + '.js ---- */\nvar a' + n + "='" + 'é€😀'.repeat(20) + "';";
const synth = '<!DOCTYPE html><html><script>(function(){' + [1, 2, 3, 4, 5, 6, 7, 8].map(mk).join('') + '\n})();</script>\n</html>\n';
for (const max of [400, 600, 900, 3000]) {
  const ps = splitAtBoundaries(synth, max);
  ok('synthetic: split joins back byte for byte, max=' + max, ps.join('') === synth);
  ok('synthetic: every part <= cap, max=' + max, ps.every(p => Buffer.byteLength(p, 'utf8') <= max));
  ok('synthetic: no lone surrogate, max=' + max, ps.every(p => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(p)));
}
let thrown = false; try { splitAtBoundaries(synth, 150); } catch (e) { thrown = true; } ok('a module larger than the cap makes the build fail loudly', thrown);
ok('cap is configurable: a smaller cap gives more parts', splitAtBoundaries(synth, 700).length > splitAtBoundaries(synth, 3000).length);

// the HtmlService mimic matches what the tenant did: the old call refuses fragments, the raw call is exact
const E = o => makeEnv(o);
const tpl = name => E().ctx.HtmlService.createTemplateFromFile(name).getRawContent();
const old = name => E().ctx.HtmlService.createHtmlOutputFromFile(name).getContent();
ok('createTemplateFromFile(...).getRawContent() returns every part exactly', names.every(n => tpl(n) === texts[n]));
ok('the OLD call, createHtmlOutputFromFile(...).getContent(), fails on every fragment (Index2 to Index4): "Malformed HTML content"', names.slice(1).every(n => { try { old(n); return false; } catch (e) { return /Malformed HTML content/.test(e.message); } }));
ok('the old call still works on Index (it starts the document)', old('Index') === texts.Index);
ok('the manifest in Code.gs matches the files (name, chars, checksum)', (() => { const m = E().ctx.INDEX_MANIFEST; return m.length === names.length && m.every((x, i) => x.name === names[i] && x.chars === texts[names[i]].length && x.sum === indexSum(texts[names[i]])); })());
ok('JS checksum in Code.gs equals the build checksum', E().ctx.indexSum_(texts.Index2) === indexSum(texts.Index2));

// doGet joins the parts exactly and checks each one
const get = o => E(o).ctx.doGet({ parameter: {} });
const good = get();
ok('doGet serves the whole page (boot marker replaced), no error page', good.html.includes('window.__GAS_BOOT=') && !good.html.includes('/*@@GAS_BOOT@@*/') && !/Desk setup problem/.test(good.title || ''));
ok('doGet page equals the joined parts apart from the boot marker', good.html.replace(/window\.__GAS_BOOT=\{.*?\};/, '/*@@GAS_BOOT@@*/') === joined);
const del = n => { const t = { ...texts }; delete t[n]; return t; };
let r = get({ htmlFiles: del('Index3') });
ok('missing Index3 gives an error page naming Index3', /Desk setup problem/.test(r.title || '') && r.html.includes('<b>Index3</b>') && r.html.includes('missing'));
r = get({ htmlFiles: del('Index') });
ok('missing Index gives an error page naming Index', r.html.includes('<b>Index</b>'));
r = get({ htmlFiles: { ...texts, Index2: texts.Index2.slice(0, texts.Index2.length - 1000) } });
ok('truncated Index2 is named, with both lengths', r.html.includes('<b>Index2</b>') && r.html.includes('incomplete') && r.html.includes(String(texts.Index2.length - 1000)) && r.html.includes(String(texts.Index2.length)));
r = get({ htmlFiles: { ...texts, Index3: texts.Index3.slice(0, -1) + (texts.Index3.slice(-1) === 'x' ? 'y' : 'x') } });
ok('same-length altered part fails the checksum, names the file', r.html.includes('<b>Index3</b>') && r.html.includes('checksum'));
r = get({ htmlFiles: { ...texts, Index2: texts.Index2 + 'junk' } });
ok('longer (stale) part is rejected', r.html.includes('<b>Index2</b>'));
r = get({ htmlFiles: { ...texts, Index: '' } });
ok('a blank part is rejected, no blank page', r.html.includes('<b>Index</b>') && r.html.includes('incomplete'));
r = get({ htmlFiles: { ...texts, Index2: texts.Index3, Index3: texts.Index2 } });
ok('parts pasted into the wrong files are rejected', r.html.includes('<b>Index2</b>'));
ok('error page never contains the page body', !r.html.includes('window.claude'));

// stopgap: INDEX_MANIFEST = null joins until the first missing file, unchecked
const nullCode = fs.readFileSync(path.join(out, 'Desk-Code.gs.txt'), 'utf8').replace(/var INDEX_MANIFEST = \[[^\n]*\];/, 'var INDEX_MANIFEST = null;');
ok('stopgap text replaced', nullCode.includes('var INDEX_MANIFEST = null;'));
const tmp = path.join(out, '_null-code.txt'); fs.writeFileSync(tmp, nullCode);
try { r = E({ codeFile: tmp }).ctx.doGet({ parameter: {} }); ok('INDEX_MANIFEST = null serves all parts (raw read), unchecked', r.html.includes('window.__GAS_BOOT=') && r.html.length > joined.length - 5000); } finally { fs.unlinkSync(tmp); }

// indexDiag
const env = E(); const diag = env.ctx.indexDiag();
ok('indexDiag logs per part: raw length, checksum, first/last 80, and what the old call does', names.every((n, i) => diag.includes(n + ': raw length ' + texts[n].length) && diag.includes('checksum ' + indexSum(texts[n]))) && (diag.match(/first 80:/g) || []).length === names.length && (diag.match(/last 80:/g) || []).length === names.length && (diag.match(/createHtmlOutputFromFile FAILS: Malformed HTML content/g) || []).length === names.length - 1);
ok('indexDiag writes the same lines to the log', (env.state.logs || []).join('\n').includes('INDEX_MANIFEST'));
const env2 = E({ htmlFiles: del('Index3') });
ok('indexDiag reports a missing file and carries on', /Index3: MISSING/.test(env2.ctx.indexDiag()) && /Index4: raw length/.test(env2.ctx.indexDiag()));
const env3 = E(); env3.setEmail('someone@virgoasia.com'); const refused = env3.ctx.indexDiag();
ok('indexDiag and pageDiag refuse everyone but the owner or a Super admin, and say nothing about the setup', refused === 'Only the project owner or a Super admin may run this.' && env3.ctx.pageDiag() === refused && !(env3.state.logs || []).length);
console.log('gas-split: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
