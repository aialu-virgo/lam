// Builds the Apps Script deliverables from the live Desk build (build/desk/dist/index.html).
// Usage: node build-gas.mjs   (run build/desk/build.mjs first). Writes out/Desk-Index.txt, Desk-Index2.txt ... (parts <= 700 KB), out/Desk-Code.gs.txt, out/appsscript.json.txt, out/README.md.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = process.env.DIST || path.join(here, '../desk/dist/index.html');
let page = fs.readFileSync(dist, 'utf8');
function swap(from, to) { const n = page.split(from).length - 1; if (n !== 1) throw new Error('expected exactly one "' + from + '", found ' + n); page = page.replace(from, () => to); }
swap("var PAGE_URL='https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx'", "var PAGE_URL=(window.__GAS_BOOT&&window.__GAS_BOOT.url)||''");
swap("PAGE_URL+'#/action/'+a.id", "PAGE_URL+'?h=/action/'+a.id");
swap("gate('Database not available','Sign in to claude.ai and open this page again. The Desk stores its data in the shared database.')", "gate('Database not available','The Desk could not reach its database. Reload this page. If it still fails, tell your admin (the Apps Script project may need setup() run once).')");
const shim = fs.readFileSync(path.join(here, 'src/shim.js'), 'utf8');
const restore = fs.readFileSync(path.join(here, 'src/restore.js'), 'utf8');
const head = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">\n<script>/*@@GAS_BOOT@@*/\n' + shim + '\n' + restore + '\n</script>\n';
if ((head + page).split('/*@@GAS_BOOT@@*/').length !== 2) throw new Error('boot marker must occur once');
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
// ---- split the page into numbered part files, each <= MAX_PART_BYTES UTF-8 bytes (Apps Script editor save limit, see README) ----
import { execSync } from 'child_process';
import { MAX_PART_BYTES, indexSum, splitAtBoundaries, normText } from './split-lib.mjs';
const full = head + page + '\n</html>\n';
const partTexts = splitAtBoundaries(full, MAX_PART_BYTES);
const partName = i => i === 0 ? 'Index' : 'Index' + (i + 1);
const fileName = i => 'Desk-' + partName(i) + '.txt';
for (const f of fs.readdirSync(outDir)) if (/^Desk-Index\d*\.txt$/.test(f)) fs.unlinkSync(path.join(outDir, f)); // no stale parts from an earlier build
const manifest = partTexts.map((t, i) => ({ name: partName(i), file: fileName(i), bytes: Buffer.byteLength(t, 'utf8'), chars: normText(t).length, sum: indexSum(normText(t)), tail: t.replace(/\s+$/, '').split('\n').pop().slice(-70) }));
if (manifest.some(m => m.bytes > MAX_PART_BYTES)) throw new Error('a part is over ' + MAX_PART_BYTES + ' bytes');
partTexts.forEach((t, i) => fs.writeFileSync(path.join(outDir, fileName(i)), t));
let code = fs.readFileSync(path.join(here, 'src/Code.gs.js'), 'utf8');
const MARK = '/*@@INDEX_MANIFEST@@*/null';
if (code.split(MARK).length !== 2) throw new Error('Code.gs needs exactly one ' + MARK);
code = code.replace(MARK, () => JSON.stringify(manifest.map(m => ({ name: m.name, chars: m.chars, sum: m.sum }))));
fs.writeFileSync(path.join(outDir, 'Desk-Code.gs.txt'), code + '\n' + fs.readFileSync(path.join(here, 'src/sap.gs.js'), 'utf8'));
fs.writeFileSync(path.join(outDir, 'appsscript.json.txt'), fs.readFileSync(path.join(here, 'src/appsscript.json'), 'utf8'));
const table = ['| Create this HTML file in the editor | Paste this file | Size | Must end with (last line with text) |', '|---|---|---|---|']
  .concat(manifest.map(m => '| `' + m.name + '` | `' + m.file + '` | ' + Math.round(m.bytes / 1024) + ' KB | `' + m.tail.replace(/`/g, "'") + '` |')).join('\n');
fs.writeFileSync(path.join(outDir, 'README.md'), fs.readFileSync(path.join(here, 'README.md'), 'utf8').replace('<!--@@PARTS_TABLE@@-->', table));
// ---- the Drive page file: desk-page-<build>.html = header line + the exact page (no sentinels), checked by Code.gs pageCheck_ ----
const apiMatch = /var DESK_API = (\d+);/.exec(code); if (!apiMatch) throw new Error('Code.gs has no DESK_API');
let gitHash = 'nogit'; try { gitHash = execSync('git rev-parse --short HEAD', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12); // yyyymmddhhmm UTC: first, so names sort oldest to newest
const pageBuild = process.env.PAGE_BUILD || stamp + '-' + gitHash;
if (!/^\d{12}-[0-9a-z]+$/.test(pageBuild)) throw new Error('PAGE_BUILD must be yyyymmddhhmm-<hash> (fixed-width UTC time first), got ' + pageBuild);
for (const f of fs.readdirSync(outDir)) if (/^desk-page-.*\.html$/.test(f)) fs.unlinkSync(path.join(outDir, f));
const pageFile = 'desk-page-' + pageBuild + '.html';
fs.writeFileSync(path.join(outDir, pageFile), '<!--DESK-PAGE build=' + pageBuild + ' api=' + apiMatch[1] + ' chars=' + normText(full).length + ' sum=' + indexSum(normText(full)) + '-->\n' + full);
console.log('Drive page file:', pageFile);
for (const f of fs.readdirSync(outDir).sort()) console.log(f, fs.statSync(path.join(outDir, f)).size, 'bytes');
console.log('page parts:', manifest.length, 'max', Math.max(...manifest.map(m => m.bytes)), 'bytes');
