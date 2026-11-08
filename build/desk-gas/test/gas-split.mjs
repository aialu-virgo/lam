// Split / join, sentinel and diagnostic checks for the page parts (Index, Index2 ...). Needs build-gas.mjs to have run.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import vm from 'vm'; import { createRequire } from 'module';
import { splitAtBoundaries, addSentinels, stripSentinels, sentinelText, indexSum, MAX_PART_BYTES, BOUNDARY } from '../split-lib.mjs';
import { makeEnv, htmlProcess } from './gas-env.mjs';
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
const original = stripSentinels(joined);
ok('sentinels removed, the joined parts are the whole page: head, script, </html>', original.startsWith('<!DOCTYPE html>') && original.endsWith('</html>\n') && !original.includes('@@PART '));
const dist = fs.readFileSync(path.join(here, '../../desk/dist/index.html'), 'utf8');
const swapped = dist.replace("var PAGE_URL='https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx'", "var PAGE_URL=(window.__GAS_BOOT&&window.__GAS_BOOT.url)||''").replace("PAGE_URL+'#/action/'+a.id", "PAGE_URL+'?h=/action/'+a.id").replace("gate('Database not available','Sign in to claude.ai and open this page again. The Desk stores its data in the shared database.')", "gate('Database not available','The Desk could not reach its database. Reload this page. If it still fails, tell your admin (the Apps Script project may need setup() run once).')");
ok('the parts are the built dist, byte for byte, after the three build swaps (sentinels removed)', original.endsWith(swapped + '\n</html>\n'));
const id = (joined.match(/#([0-9a-f]{8})@@/) || [])[1];
ok('every part ends with its sentinel, and the sentinels count 1..N', bufs.length > 0 && names.every((n, i) => { const t = texts[n]; const s = sentinelText(i + 1, names.length, id); return i < names.length - 1 ? t.endsWith("\n'" + s + "';") : t.includes('<meta name="desk-part" content="' + s + '">\n</html>\n'); }));
ok('the build id is the checksum of the page without sentinels', indexSum(original) === id);

// module boundaries are statement boundaries: the whole script still parses and every cut sits between two top-level statements of the IIFE
let acorn = null; try { acorn = createRequire(import.meta.url)('/opt/node-tools/node_modules/acorn'); } catch (e) { try { acorn = createRequire(import.meta.url)('acorn'); } catch (e2) {} }
if (acorn) {
  const scripts = [...joined.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length);
  let tree = null, err = ''; try { tree = acorn.parse(scripts[0], { ecmaVersion: 'latest' }); } catch (e) { err = e.message; }
  ok('the big script (with sentinel statements in it) parses: ' + err, !!tree);
  const body = tree && tree.body[0].expression.callee.body.body;
  ok('the sentinel statements are top-level statements of the page function', body && names.slice(0, -1).every((n, i) => body.some(st => st.type === 'ExpressionStatement' && st.expression.value === sentinelText(i + 1, names.length, id))));
  const origScript = [...original.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const nodes = s => acorn.parse(s, { ecmaVersion: 'latest' }).body[0].expression.callee.body.body.filter(st => !(st.type === 'ExpressionStatement' && /^@@PART /.test(st.expression.value))).length;
  ok('the same number of statements with and without sentinels', nodes(scripts[0]) === nodes(origScript));
} else console.log('SKIP acorn not found: statement-boundary checks');

// splitting properties on awkward input
const mk = n => '\n/* ---- src/m' + n + '.js ---- */\nvar a' + n + "='" + 'é€😀'.repeat(20) + "';";
const synth = '<!DOCTYPE html><html><script>(function(){' + [1, 2, 3, 4, 5, 6, 7, 8].map(mk).join('') + '\n})();</script>\n</html>\n';
for (const max of [400, 600, 900, 3000]) {
  const ps = splitAtBoundaries(synth, max);
  ok('synthetic: split joins back byte for byte, max=' + max, ps.join('') === synth);
  const withS = addSentinels(ps, 'deadbeef');
  ok('synthetic: sentinels add and strip back, max=' + max, stripSentinels(withS.join('')) === synth);
  ok('synthetic: every part with sentinel <= cap, max=' + max, withS.every(p => Buffer.byteLength(p, 'utf8') <= max));
  ok('synthetic: no lone surrogate, max=' + max, withS.every(p => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(p)));
}
let thrown = false; try { splitAtBoundaries(synth, 150); } catch (e) { thrown = true; } ok('a module larger than the cap makes the build fail loudly', thrown);
ok('cap is configurable: MAX_PART_BYTES from the environment gives more parts', (() => { const sub = splitAtBoundaries(synth, 700); return sub.length > splitAtBoundaries(synth, 3000).length; })());

// the mimic of HtmlService changes the text, as on the real tenant
const raw = texts.Index, proc = htmlProcess(raw);
ok('the HtmlService mimic removes comment text (so a length check would fail) but keeps /*@@ markers and the sentinel', proc.length < raw.length - 1000 && proc.includes('/*@@GAS_BOOT@@*/') && proc.trimEnd().endsWith("@@';"));

// doGet with processing on (the default env) joins and checks
const E = o => makeEnv(o).ctx.doGet({ parameter: {} });
const good = E();
ok('doGet serves the page although every part came back processed', good.html.includes('window.__GAS_BOOT=') && !good.html.includes('/*@@GAS_BOOT@@*/') && !/Desk setup problem/.test(good.title || '') && /<\/html>\s*$/.test(good.html));
ok('doGet with unprocessed parts serves the same page', E({ htmlProcess: 'none' }).html.includes('window.__GAS_BOOT='));
const del = n => { const t = { ...texts }; delete t[n]; return t; };
let r = E({ htmlFiles: del('Index3') });
ok('missing Index3 gives an error page naming Index3', /Desk setup problem/.test(r.title || '') && r.html.includes('<b>Index3</b>') && r.html.includes('missing'));
r = E({ htmlFiles: del('Index') });
ok('missing Index gives an error page naming Index', r.html.includes('<b>Index</b>'));
r = E({ htmlFiles: { ...texts, Index2: texts.Index2.slice(0, texts.Index2.length - 1000) } });
ok('truncated Index2 (sentinel gone) gives an error page naming Index2', r.html.includes('<b>Index2</b>') && r.html.includes('incomplete'));
r = E({ htmlFiles: { ...texts, Index3: texts.Index3.replace(/#[0-9a-f]{8}@@/, '#00000000@@') } });
ok('a part from another build (different id) is named', r.html.includes('<b>Index3</b>') && r.html.includes('another Desk version'));
r = E({ htmlFiles: { ...texts, Index2: texts.Index3, Index3: texts.Index2 } });
ok('parts pasted into the wrong files are named', r.html.includes('<b>Index2</b>'));
r = E({ htmlFiles: { ...texts, Index2: texts.Index2 + texts.Index2 } });
ok('two copies pasted into one file are rejected', r.html.includes('<b>Index2</b>'));
r = E({ htmlFiles: { ...texts, Index: '' } });
ok('a blank part is rejected, no blank page', r.html.includes('<b>Index</b>') && r.html.includes('incomplete'));
ok('error page never contains the page body', !r.html.includes('window.claude'));
r = E({ htmlFiles: { ...texts, Index4: texts.Index4.replace(/<\/html>\s*$/, '') } });
ok('a last part without </html> is rejected', r.html.includes('<b>Index4</b>'));

// stopgap: INDEX_MANIFEST = null joins until the first missing file, unchecked
const nullCode = fs.readFileSync(path.join(out, 'Desk-Code.gs.txt'), 'utf8').replace(/var INDEX_MANIFEST = \{[^;]*\};/, 'var INDEX_MANIFEST = null;');
ok('stopgap text replaced', nullCode.includes('var INDEX_MANIFEST = null;'));
const tmp = path.join(out, '_null-code.txt'); fs.writeFileSync(tmp, nullCode);
try { r = makeEnv({ codeFile: tmp, htmlFiles: { ...texts, Index2: texts.Index2.slice(0, -500) } }).ctx.doGet({ parameter: {} }); ok('INDEX_MANIFEST = null serves without checks', r.html.includes('window.__GAS_BOOT=')); } finally { fs.unlinkSync(tmp); }

// indexDiag
const env = makeEnv(); const diag = env.ctx.indexDiag();
ok('indexDiag logs every part: length, first/last 80, sentinel', names.every((n, i) => diag.includes(n + ': getContent length ' + htmlProcess(texts[n]).length) && diag.includes('found yes')) && (diag.match(/first 80:/g) || []).length === names.length && (diag.match(/last 80:/g) || []).length === names.length);
ok('indexDiag writes the same lines to the log', (env.state.logs || []).join('\n').includes('INDEX_MANIFEST'));
const env2 = makeEnv({ htmlFiles: del('Index3') });
ok('indexDiag reports a missing file and carries on', /Index3: MISSING/.test(env2.ctx.indexDiag()) && /Index4: getContent length/.test(env2.ctx.indexDiag()));
console.log('gas-split: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
