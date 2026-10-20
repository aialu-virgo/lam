// Builds dist/index.html: a separate DEMO copy of the Desk (reads build/desk/src and build/demo-data/generator.js, changes neither).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const desk = path.join(here, '../desk');
let src = fs.readFileSync(path.join(desk, 'index.src.html'), 'utf8');
const gen = fs.readFileSync(path.join(here, '../demo-data/generator.js'), 'utf8');
const mods = fs.readdirSync(path.join(desk, 'src')).filter(f => f.endsWith('.js')).sort().map(f => '/* ---- src/' + f + ' ---- */\n' + fs.readFileSync(path.join(desk, 'src', f), 'utf8')).join('\n');
const css = fs.readFileSync(path.join(desk, 'src/styles.css'), 'utf8');
const dcss = fs.readFileSync(path.join(here, 'demo.css'), 'utf8');
const dhtml = fs.readFileSync(path.join(here, 'demo-html.html'), 'utf8');
const rt = fs.readFileSync(path.join(here, 'runtime.js'), 'utf8');
const PAGE_URL = process.env.DEMO_URL || '';
let out = src.replace('/*@@DEMO_GENERATOR@@*/', () => gen).replace('/*@@V09_MODULES@@*/', () => mods).replace('/*@@V09_CSS@@*/', () => css);
let LOGO = '';
for (const ext of ['svg', 'png']) { const f = path.join(desk, 'assets', 'virgo-logo.' + ext); if (fs.existsSync(f)) { LOGO = 'data:' + (ext === 'svg' ? 'image/svg+xml' : 'image/png') + ';base64,' + fs.readFileSync(f).toString('base64'); break; } }
out = out.replace('/*@@LOGO@@*/', () => LOGO);
const LOGO_HTML = '<span class="brandmark">' + (LOGO ? '<img class="brandlogo" src="' + LOGO + '" alt="Virgo">' : '<span class="brandtext">Virgo</span>') + '</span>';
function rep(a, b, all) {
  if (!out.includes(a)) throw new Error('missing anchor: ' + a.slice(0, 60));
  out = all ? out.split(a).join(b) : out.replace(a, () => b);
}
rep('<title>Virgo Lam Performance Desk</title>', '<title>Desk Demo</title>');
rep('</style>\n<script src="https://cdnjs', dcss + '\n</style>\n<script src="https://cdnjs');
rep('<div id="root"></div>', dhtml.replace('<div class="logo">V</div>', () => LOGO_HTML) + '<div id="root"></div>');
rep("var SEED_SUPER=['data@virgoasia.com','spa@virgoasia.com'];", "var SEED_SUPER=['demo.super@demo'];");
rep("(e.indexOf('data@')===0?'Vijay':'SP Sir')", "'Demo Super Admin'");
rep("var PAGE_URL='https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx';", "var PAGE_URL=" + JSON.stringify(PAGE_URL) + "||location.href;");
rep('<small>desk-v1.0</small>', '<small>Demo copy of desk-v1.0</small>');
rep('<b>Lam Performance Desk</b>', '<b>Lam Desk · DEMO</b>');
rep('Approval is by SP Sir or a Management / HO user', 'Approval is by a Super admin or a Management / HO user');
// demo logins: renamed demo users (same scoping as the generator)
const map = { 'super@demo': 'demo.super@demo', 'mgmt@demo': 'demo.mgmt@demo', 'hod.sales@demo': 'demo.hod@demo', 'bm.a@demo': 'demo.branchmgr@demo', 'bm.b@demo': 'demo.branchmgr2@demo', 'se.s1@demo': 'demo.salesexec@demo', 'se.s2@demo': 'demo.salesexec2@demo', 'coord.a@demo': 'demo.coordinator@demo', 'acc.ab@demo': 'demo.accounts@demo', 'plant.b@demo': 'demo.plant@demo' };
out = out.replace(/(?<![\w.@-])(super|mgmt|hod\.sales|bm\.a|bm\.b|se\.s1|se\.s2|coord\.a|acc\.ab|plant\.b)@demo/g, (m) => map[m]);
rep("Sign in to claude.ai and open this page again. The Desk stores its data in the shared database.", "The demo store could not start in this browser. Reload the page.");
// Data Intake note
rep("function renderBanner(){\n  var el=$('#i-banner');if(!el)return;\n  var h='';", "function renderBanner(){\n  var el=$('#i-banner');if(!el)return;\n  var h='<div class=\"banner warn\"><span><b>Uploads here are not saved anywhere.</b> Files you add are read inside this browser tab only and are gone when you reload. Nothing is sent to any server.</span></div>';");
rep("The file is read in this browser; nothing is sent anywhere else.", "The file is read in this browser; nothing is sent anywhere else and nothing is saved.");
// boot: runtime replaces the platform boot call
rep('window.__desk={S:S,', 'window.__desk={S:S,');
rep('boot();\n})();', rt + '\n})();');
out = out.replace(/window\.claude\.use\(/g, 'window.__demoStore.open(').replace(/window\.claude/g, 'window.__demoStore').replace('!window.__demoStore.use','!window.__demoStore.open');
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
fs.writeFileSync(path.join(here, 'dist/index.html'), out);
const bad = out.match(/virgoasia|Virgo@2026|spa@|GZei5qVx/g);
if (bad) throw new Error('forbidden strings in output: ' + [...new Set(bad)].join(','));
console.log('dist/index.html', out.length, 'bytes');
