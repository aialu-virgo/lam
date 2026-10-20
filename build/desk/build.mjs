// Inlines build/demo-data/generator.js into index.src.html and writes dist/index.html (the file that is published).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'index.src.html'), 'utf8');
const gen = fs.readFileSync(path.join(here, '../demo-data/generator.js'), 'utf8');
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
const out = src.replace('/*@@DEMO_GENERATOR@@*/', () => gen);
fs.writeFileSync(path.join(here, 'dist/index.html'), out);
console.log('dist/index.html', out.length, 'bytes');
