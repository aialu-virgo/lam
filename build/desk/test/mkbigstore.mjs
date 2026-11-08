/* Synthetic large store for performance tests: 45 plants x 19 months of roll-up documents.
 * Usage: node mkstore.mjs base.json   (demo store, 45 plants)
 *        node mkbigstore.mjs base.json store-big-dash.json [salespeopleCount=30]
 * Synthetic only (names and numbers come from a seeded generator); the output is never committed. */
import fs from 'fs';
import zlib from 'zlib';
const [base, out, spn, mst] = process.argv.slice(2);
const SPN = +(spn || 30);
const MASTER = +(mst || 3000); /* sales-employee master size; names in the roll-ups carry a ' - <plant>' suffix as in B1 */
const s = JSON.parse(fs.readFileSync(base));
let seed = 20261108;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const GROUPS = ['Laminate', 'Door', 'PVC sheet', 'Compact board'];
const plants = Object.keys(s).filter(k => k.startsWith('plants/')).map(k => s[k].plant_code).sort();
const yms = Object.keys(s).filter(k => k.startsWith('cells/INV_')).map(k => s[k].ym).sort();
if (plants.length < 45 || yms.length < 19) throw new Error('base store needs 45 plants and 19 months, has ' + plants.length + 'x' + yms.length);
Object.keys(s).filter(k => k.startsWith('roll/')).forEach(k => delete s[k]);
const tmplCell = Object.values(s[Object.keys(s).find(k => k.startsWith('cells/INV_'))].plants)[0];
yms.forEach(ym => { s['cells/INV_' + ym].plants = {}; });
plants.forEach((p, pi) => {
  yms.forEach((ym, mi) => {
    const rows = [];
    let docs = 0, lines = 0, net = 0, sheets = 0;
    for (let k = 0; k < SPN; k++) {
      const sp = 'DEMO Sales ' + ((pi * 7 + k) % 1500) + ' - P' + p;
      GROUPS.forEach(g => {
        if (rnd() < 0.15) return;
        const d = 1 + Math.floor(rnd() * 6), l = d + Math.floor(rnd() * 8), sh = 20 + Math.floor(rnd() * 400), sq = sh * 32, n = Math.round(sh * (500 + rnd() * 700) * 100) / 100;
        rows.push([g, sp, 0, d, l, sh, sq, n]); docs += d; lines += l; sheets += sh; net += n;
      });
    }
    rows.push(['Laminate', 'DEMO Sales 0 - P' + p, 1, 1, 1, 10, 320, 9000]);
    const at = '2026-11-08T10:00:00.000Z';
    s['roll/' + p + '-' + ym] = { plant: p, ym, sys: 'B1', n: rows.length, z: zlib.gzipSync(JSON.stringify(rows)).toString('base64'), src: at, at, demo: true };
    s['cells/INV_' + ym].plants[p] = Object.assign({}, tmplCell, { chunks: 0, docs, lines, net: Math.round(net), sheets, at });
  });
});
/* sales master: every name the roll-ups use is NOT in it (the usual real-world mix), plus MASTER entries, so name matching does real work */
const list = [];
for (let i = 0; i < MASTER; i++) list.push(['E' + String(i).padStart(5, '0'), 'DEMO Person ' + i, '', plants[i % plants.length], 'DEMO plant ' + plants[i % plants.length], 'Sales Executive', 'Sales executive', 'demo' + i + '@example.invalid', '', i, '', '', '', '']);
const mk = Object.keys(s).find(k => k.startsWith('salesmaster/')) || 'salesmaster/main';
s[mk] = Object.assign({}, s[mk] || {}, { z: zlib.gzipSync(JSON.stringify(list)).toString('base64'), n: list.length, at: '2026-11-08T10:00:00.000Z' });
fs.writeFileSync(out, JSON.stringify(s));
console.log('plants', plants.length, 'months', yms.length, 'roll docs', plants.length * yms.length, 'bytes', fs.statSync(out).size);
