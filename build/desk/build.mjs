// Inlines build/demo-data/generator.js, the v0.9 modules (src/*.js) and styles (src/styles.css) into index.src.html and writes dist/index.html (the file that is published).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
let src = fs.readFileSync(path.join(here, 'index.src.html'), 'utf8');
const gen = fs.readFileSync(path.join(here, '../demo-data/generator.js'), 'utf8');
const srcDir = path.join(here, 'src');
const mods = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort().map(f => '/* ---- src/' + f + ' ---- */\n' + fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n');
const css = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
function logoSrc() {
  for (const ext of ['svg', 'png']) {
    const f = path.join(here, 'assets', 'virgo-logo.' + ext);
    if (fs.existsSync(f)) return 'data:' + (ext === 'svg' ? 'image/svg+xml' : 'image/png') + ';base64,' + fs.readFileSync(f).toString('base64');
  }
  return '';
}
export const LOGO = logoSrc();
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
const out = src.replace('/*@@DEMO_GENERATOR@@*/', () => gen).replace('/*@@V09_MODULES@@*/', () => mods).replace('/*@@V09_CSS@@*/', () => css).replace('/*@@LOGO@@*/', () => LOGO);
fs.writeFileSync(path.join(here, 'dist/index.html'), out);
console.log('dist/index.html', out.length, 'bytes');
