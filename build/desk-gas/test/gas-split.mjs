// Split / join and truncation checks for the page parts (Index, Index2 ...). Needs build-gas.mjs to have run.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { splitPage, indexSum, MAX_PART_BYTES } from '../split-lib.mjs';
import { makeEnv } from './gas-env.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, '../out');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const files = fs.readdirSync(out).filter(f => /^Desk-Index\d*\.txt$/.test(f)).sort((a, b) => (+a.replace(/\D/g, '') || 1) - (+b.replace(/\D/g, '') || 1));
const bufs = files.map(f => fs.readFileSync(path.join(out, f)));
const names = files.map((f, i) => i === 0 ? 'Index' : 'Index' + (i + 1));
ok('parts are numbered Index, Index2, ... in order', files.every((f, i) => f === 'Desk-' + names[i] + '.txt'));
ok('more than one part', files.length > 1);
ok('every part <= 700000 bytes', bufs.every(b => b.length <= MAX_PART_BYTES) && MAX_PART_BYTES <= 700000);
const joined = Buffer.concat(bufs);
const dist = fs.readFileSync(path.join(here, '../../desk/dist/index.html'), 'utf8');
ok('joined parts start with the head and end with </html>', joined.toString('utf8').startsWith('<!DOCTYPE html>') && joined.toString('utf8').endsWith('</html>\n'));
ok('every part decodes as UTF-8 without replacement characters it did not have', bufs.every(b => Buffer.from(b.toString('utf8'), 'utf8').equals(b)));
ok('parts other than the last end at a line end', bufs.slice(0, -1).filter(b => b[b.length - 1] !== 10).length <= 1);

// splitPage: byte-for-byte round trip on awkward input, never inside a character
const nasty = ['ab\n', 'é€😀'.repeat(50) + '\n', 'x'.repeat(95) + '\n', '😀'.repeat(60), '\n\n', 'tail-no-newline'].join('');
for (const max of [7, 10, 13, 64, 100, 1000]) {
  const ps = splitPage(nasty, max);
  ok('round trip max=' + max, ps.join('') === nasty);
  ok('size cap max=' + max, ps.every(p => Buffer.byteLength(p, 'utf8') <= max));
  ok('no lone surrogate max=' + max, ps.every(p => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(p)));
}
ok('empty page gives no parts', splitPage('').length === 0);
ok('a short page is one part', splitPage('a\nb\n').length === 1);

// doGet joins the parts and checks them
const env = makeEnv(), page = f => env.ctx.doGet({ parameter: {} }).html;
const good = env.ctx.doGet({ parameter: {} });
ok('doGet serves the joined page (boot marker replaced)', good.html.includes('window.__GAS_BOOT=') && !good.html.includes('/*@@GAS_BOOT@@*/'));
ok('doGet page equals joined parts apart from the boot marker', good.html.replace(/window\.__GAS_BOOT=\{.*?\};/, '/*@@GAS_BOOT@@*/') === joined.toString('utf8'));
const texts = Object.fromEntries(bufs.map((b, i) => [names[i], b.toString('utf8')]));
const run = over => makeEnv({ htmlFiles: { ...texts, ...over } }).ctx.doGet({ parameter: {} });
const del = n => { const t = { ...texts }; delete t[n]; return t; };
let r = makeEnv({ htmlFiles: del('Index3') }).ctx.doGet({ parameter: {} });
ok('missing Index3 shows an error page naming Index3', /Desk setup problem/.test(r.title || '') && r.html.includes('<b>Index3</b>') && r.html.includes('missing'));
r = makeEnv({ htmlFiles: del('Index') }).ctx.doGet({ parameter: {} });
ok('missing Index shows an error page naming Index', r.html.includes('<b>Index</b>'));
r = run({ Index2: texts.Index2.slice(0, texts.Index2.length - 1000) });
ok('truncated Index2 is named, with both lengths', r.html.includes('<b>Index2</b>') && r.html.includes('incomplete') && r.html.includes(String(texts.Index2.length - 1000)) && r.html.includes(String(texts.Index2.length)));
r = run({ Index3: texts.Index3.slice(0, -1) + (texts.Index3.slice(-1) === 'x' ? 'y' : 'x') });
ok('same-length altered part fails the checksum, names the file', r.html.includes('<b>Index3</b>') && r.html.includes('checksum'));
r = run({ Index2: texts.Index2 + 'junk' });
ok('stale/longer part is rejected', r.html.includes('<b>Index2</b>'));
r = run({ Index: '' });
ok('blank part is rejected (no blank page)', r.html.includes('<b>Index</b>') && r.html.includes('incomplete'));
ok('error page never contains the page body', !r.html.includes('window.claude'));
ok('JS checksum in Code.gs equals the build checksum', env.ctx.indexSum_(texts.Index2).padStart(8, '0') === indexSum(texts.Index2) && env.ctx.INDEX_MANIFEST.length === files.length);
ok('manifest lengths and sums match the written files', env.ctx.INDEX_MANIFEST.every((m, i) => m.chars === texts[names[i]].length && m.sum === indexSum(texts[names[i]])));
console.log('gas-split: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
