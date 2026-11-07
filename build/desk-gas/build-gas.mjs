// Builds the Apps Script deliverables from the live Desk build (build/desk/dist/index.html).
// Usage: node build-gas.mjs   (run build/desk/build.mjs first). Writes out/Desk-Index.txt, out/Desk-Code.gs.txt, out/appsscript.json.txt, out/README.md.
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
fs.writeFileSync(path.join(outDir, 'Desk-Index.txt'), head + page + '\n</html>\n');
fs.writeFileSync(path.join(outDir, 'Desk-Code.gs.txt'), fs.readFileSync(path.join(here, 'src/Code.gs.js'), 'utf8') + '\n' + fs.readFileSync(path.join(here, 'src/sap.gs.js'), 'utf8'));
fs.writeFileSync(path.join(outDir, 'appsscript.json.txt'), fs.readFileSync(path.join(here, 'src/appsscript.json'), 'utf8'));
fs.copyFileSync(path.join(here, 'README.md'), path.join(outDir, 'README.md'));
for (const f of fs.readdirSync(outDir)) console.log(f, fs.statSync(path.join(outDir, f)).size, 'bytes');
