// QA pass 4 simulations (sim4, sim5, batch4) kept as tests: the page's own engine and responses must all be accepted by the server (parity with claude.ai, D21).
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ok = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (c ? '' : ' | ' + (d || ''))); if (!c) process.exitCode = 1; };
const run = (f) => execFileSync('node', [path.join(here, 'qa4', f)], { encoding: 'utf8', timeout: 120000 });
const s4 = run('sim4.mjs'); const s5 = run('sim5.mjs'); const b4 = run('batch4.mjs');
const lines4 = s4.split('\n').filter(Boolean);
ok('sim4: ' + lines4.length + ' engine, follow-up and response writes, none refused', lines4.length > 20 && !/REFUSED/.test(s4), lines4.filter(l => /REFUSED/.test(l)).join('\n'));
ok('sim4: the HOD auto-clear loop runs to the end for every viewer', lines4.filter(l => /auto-clear/.test(l)).every(l => !/REFUSED/.test(l) && /r_ops:ok ; r_p1:ok/.test(l)), lines4.filter(l => /auto-clear/.test(l)).join('\n'));
ok('sim5: the coordinator can dismiss an engine draft', /ok/.test(s5) && !/REFUSED/.test(s5), s5);
ok('batch4: a legitimate create and a clear in the same tick are both applied and stored', /legit create: fulfilled/.test(b4) && /refused clear: fulfilled/.test(b4) && /new_rule stored on server: true/.test(b4), b4);
