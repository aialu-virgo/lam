/* Shared by the large-store tests: BIGSTORE=file if given, otherwise a synthetic store is generated in a temp folder (45 plants x 19 months). */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
export function bigStorePath(persons = 80) {
  if (process.env.BIGSTORE) return process.env.BIGSTORE;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bigstore-')), b0 = path.join(d, 'base.json'), out = path.join(d, 'big.json');
  execFileSync('node', [path.join(here, 'mkstore.mjs'), b0], { stdio: 'inherit' });
  execFileSync('node', [path.join(here, 'mkbigstore.mjs'), b0, out, String(persons), '3000'], { stdio: 'inherit' });
  return out;
}
