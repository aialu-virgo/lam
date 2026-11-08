// Page served from Google Drive (desk-page-<build>.html): newest file chosen, integrity, api, pin, cache, fallback, errors, pageDiag. Needs build-gas.mjs to have run.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { makeEnv } from './gas-env.mjs';
import { indexSum } from '../split-lib.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, '../out');
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log('FAIL', n, d || ''); } };
const pageFile = fs.readdirSync(out).find(f => /^desk-page-.+\.html$/.test(f));
const raw = fs.readFileSync(path.join(out, pageFile), 'utf8');
const m = /^<!--DESK-PAGE build=(\S+) api=(\d+) chars=(\d+) sum=([0-9a-f]{8})-->\n/.exec(raw);
ok('the build wrote desk-page-<build>.html with a header on line 1', !!m && pageFile === 'desk-page-' + m[1] + '.html');
const body = raw.slice(raw.indexOf('\n') + 1);
ok('header chars and sum describe the text after it; page ends with </html>', +m[3] === body.length && m[4] === indexSum(body) && /<\/html>\n$/.test(body) && body.startsWith('<!DOCTYPE html>'));
ok('the header api equals DESK_API in Code.gs', +m[2] === +/var DESK_API = (\d+);/.exec(fs.readFileSync(path.join(out, 'Desk-Code.gs.txt'), 'utf8'))[1]);
ok('the Drive page equals the Index parts joined ', body === ['', 2, 3, 4].map(n => fs.readFileSync(path.join(out, 'Desk-Index' + n + '.txt'), 'utf8')).join(''));
const withHeader = (build, api, text) => '<!--DESK-PAGE build=' + build + ' api=' + api + ' chars=' + text.length + ' sum=' + indexSum(text) + '-->\n' + text;
const mkf = (id, name, content, updated = 1000) => ({ id, name, content, updated });
const NOW = Date.now();
const setup = (files, extra = {}, props = { DESK_PAGE_FOLDER_ID: 'FOLD' }) => { const e = makeEnv({ drive: { folders: { FOLD: files }, files: {} }, ...extra }); Object.assign(e.props, props); return e; };
const html = e => e.ctx.doGet({ parameter: {} });
const marker = b => body.replace('<title>', '<title>') + b; // unused helper kept simple
const mk = (build, text = body, api = m[2]) => withHeader(build, api, text);
const bodyTag = tag => body.replace('</html>', '<!--' + tag + '--></html>'); // same page, different identity

// newest file by name, regardless of order and upload time
let e = setup([mkf('a', 'desk-page-202611010000-aaa.html', mk('202611010000-aaa', bodyTag('OLD'))), mkf('b', 'desk-page-202611080900-bbb.html', mk('202611080900-bbb', bodyTag('NEW')), 500), mkf('c', 'desk-page-202611050000-ccc.html', mk('202611050000-ccc', bodyTag('MID'), m[2])), mkf('x', 'notes.txt', 'ignore me'), mkf('y', 'desk-page-zzz.txt', 'wrong extension')]);
let r = html(e);
ok('the newest file by build name is served, whatever the upload time or listing order', r.html.includes('<!--NEW-->') && !r.html.includes('<!--OLD-->') && r.html.includes('window.__GAS_BOOT=') && !r.html.includes('DESK-PAGE build='), r.html.slice(0, 200));
ok('served page starts with the doctype (header line removed) and has the boot data', r.html.startsWith('<!DOCTYPE html>'));
ok('files not matching the name pattern are ignored', !r.html.includes('ignore me'));
// same name twice: newest date wins
e = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('EARLY')), 100), mkf('b', 'desk-page-202611010001-a1.html', mk('1', bodyTag('LATE')), 900)]);
ok('same name: the later updated file wins', html(e).html.includes('<!--LATE-->'));

// refused files, each named
const one = (content, name = 'desk-page-202611010009-a9.html', extra) => html(setup([mkf('f', name, content)], extra));
const named = (r, needle) => /Desk setup problem/.test(r.title || '') && r.html.includes('<b>desk-page-202611010009-a9.html</b>') && (!needle || r.html.includes(needle)) && !r.html.includes('window.claude');
ok('truncated file refused, with both lengths', named(one(mk('9').slice(0, -3000)), 'incomplete') );
ok('tampered file (same length) refused on checksum', (() => { const t = mk('9'); const i = t.indexOf('Desk'); return named(one(t.slice(0, i) + 'Dusk' + t.slice(i + 4)), 'checksum'); })());
ok('extra text refused', named(one(mk('9') + 'x'), 'extra text'));
ok('wrong api refused, naming both versions', named(one(mk('9', body, 999)), 'api=999'));
ok('no header refused (converted or edited file)', named(one(body), 'header'));
ok('a BOM before the header is tolerated', !/Desk setup problem/.test(one('﻿' + mk('9')).title || ''));
ok('empty file refused', named(one(''), 'header'));
ok('a file whose page does not end with </html> refused', named(one(withHeader('9', m[2], body.replace(/<\/html>\s*$/, ''))), '</html>'));
ok('unreadable file (Drive error) refused with the reason', (() => { const r = html(setup([{ ...mkf('f', 'desk-page-202611010009-a9.html', mk('9')), readError: 'Service error: Drive' }])); return named(r, 'Service error: Drive'); })());
r = html(setup([mkf('x', 'readme.txt', 'x')]));
ok('a folder with no page file gives an error naming the folder', /Desk setup problem/.test(r.title) && r.html.includes('desk-page-&lt;yyyymmddhhmm&gt;'));
r = html(setup([], {}, { DESK_PAGE_FOLDER_ID: 'NOPE' }));
ok('unknown folder id gives an error naming DESK_PAGE_FOLDER_ID and the Drive message', r.html.includes('<b>DESK_PAGE_FOLDER_ID</b>') && r.html.includes('No item with the given ID'));
ok('an error never falls back to the Index files', !r.html.includes('window.claude') && /Desk setup problem/.test(r.title));

// a refused newest file is not skipped for an older good one
r = html(setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('OLD'))), mkf('b', 'desk-page-202611010002-a2.html', mk('2').slice(0, -50))]));
ok('newest file bad: refused, the older good file is NOT served', r.html.includes('<b>desk-page-202611010002-a2.html</b>') && !r.html.includes('<!--OLD-->'));

// recovery text is specific to the reason
const fixOf = r => (r.html.match(/<\/p><p>([\s\S]*)<\/p><\/body>/) || [])[1] || '';
r = one(mk('9').slice(0, -3000));
ok('a bad file says the Delivery Lead re-uploads, and never mentions pasting Index files', /Delivery Lead: upload the page file again/.test(fixOf(r)) && !/Desk-desk-page|Desk-Index|paste the matching/.test(r.html));
r = one(mk('9', body, 999));
ok('wrong api says to paste the new Code.gs and make a New version', /paste the newer Desk-Code\.gs\.txt/.test(fixOf(r)) && /New version/.test(fixOf(r)));
r = html(setup([], {}, { DESK_PAGE_FOLDER_ID: 'NOPE' }));
ok('a folder that does not open says to share the folder with the deploying account', /share the folder/.test(fixOf(r)) && /deployed this web app/.test(fixOf(r)));
r = html(setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1'))], {}, { DESK_PAGE_FILE_ID: 'ZZ' }));
ok('a pin that does not open says to share / check the properties', /share the folder/.test(fixOf(r)));
r = html(setup([mkf('x', 'readme.txt', 'x')]));
ok('an empty folder says to upload', /Delivery Lead: upload the page file/.test(fixOf(r)));
r = one(mk('9'), 'desk-page-202611010009-a9.html', {});
ok('a read error says to reload and check access', (() => { const rr = html(setup([{ ...mkf('f', 'desk-page-202611010009-a9.html', mk('9')), readError: 'Service error: Drive' }])); return /Reload in a minute/.test(fixOf(rr)); })());
// file name must be fixed-width build order
for (const bad of ['desk-page-9.html', 'desk-page-2026110800-ab.html', 'desk-page-202611081200-A1.html', 'desk-page-20261108120000-ab.html']) {
  r = html(setup([mkf('g', 'desk-page-202611010001-a1.html', mk('1')), mkf('h', bad, mk('2'))]));
  ok('a badly named page file is rejected, named: ' + bad, r.html.includes('<b>' + bad + '</b>') && /valid name/.test(r.html));
}
r = html(setup([mkf('g', 'desk-page-202611091200-ab.html', mk('1', bodyTag('JUST')), 1), mkf('h', 'desk-page-202611081200-zz.html', mk('2', bodyTag('LATE')), 9999)]));
ok('order is by build time then hash, not by upload time or plain file name luck', r.html.includes('<!--JUST-->') && !r.html.includes('<!--LATE-->'));

// pin
e = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('PINNED'))), mkf('b', 'desk-page-202611010002-a2.html', mk('2', bodyTag('NEWER')))], {}, { DESK_PAGE_FOLDER_ID: 'FOLD', DESK_PAGE_FILE_ID: 'a' });
r = html(e);
ok('DESK_PAGE_FILE_ID pins one exact file even when a newer one exists', r.html.includes('<!--PINNED-->') && !r.html.includes('<!--NEWER-->'));
r = html(setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1'))], {}, { DESK_PAGE_FOLDER_ID: 'FOLD', DESK_PAGE_FILE_ID: 'ZZ' }));
ok('a wrong pin gives an error naming DESK_PAGE_FILE_ID', r.html.includes('<b>DESK_PAGE_FILE_ID</b>'));
r = html(setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1').slice(0, -9))], {}, { DESK_PAGE_FILE_ID: 'a' }));
ok('a pinned file is checked like any other', r.html.includes('<b>desk-page-202611010001-a1.html</b>'));

// cache: miss then hit, chunks under 100 KB, new release picked up when the pointer expires, failure falls back to Drive
e = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('V1')), 100)]);
html(e); const afterMiss = { reads: e.drive.reads, listings: e.drive.listings, puts: e.cacheStats.puts };
r = html(e);
ok('first request lists the folder, reads Drive once and fills the cache', afterMiss.reads === 1 && afterMiss.listings === 1 && afterMiss.puts > 10);
ok('second request is a cache hit: one cheap listing, no file read, same page', e.drive.reads === 1 && e.drive.listings === 2 && r.html.includes('<!--V1-->') && r.html.includes('window.__GAS_BOOT='));
ok('cache values are chunks under 100 KB', e.cacheStats.maxBytes <= 100 * 1024 && e.cacheStats.maxBytes > 1000);
ok('a cache hit still starts with the doctype and replaces the boot marker per request', r.html.startsWith('<!DOCTYPE html>') && !r.html.includes('/*@@GAS_BOOT@@*/'));
e.clearCache(); html(e);
ok('after the cache is cleared (expiry) Drive is read again', e.drive.reads === 2);
const e2 = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('V1')))], { cacheFail: true });
r = html(e2); const r2 = html(e2);
ok('cache failure: every request falls back to Drive and still serves the checked page', r.html.includes('<!--V1-->') && r2.html.includes('<!--V1-->') && e2.drive.reads === 2);
const e3 = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('V1')))]); html(e3);
const k = e3.cacheKeys().find(x => x.endsWith(':3')); // corrupt one chunk: must not be served
e3.ctx.CacheService.getScriptCache().put(k, 'garbage'); r = html(e3);
ok('a damaged cache entry is not served: Drive is re-read and the page is intact', r.html.includes('<!--V1-->') && e3.drive.reads === 2);
const e4 = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('V1')))]); html(e4);
e4.drive.folders.FOLD.push(mkf('b', 'desk-page-202611010002-a2.html', mk('2', bodyTag('V2'))));
ok('a new good release is served at once, not after the cache expires (newest file is looked up every request)', html(e4).html.includes('<!--V2-->'));
e4.drive.folders.FOLD.push(mkf('c', 'desk-page-202611010003-a3.html', mk('3', bodyTag('V3')).slice(0, -40)));
r = html(e4);
ok('a bad newest upload shows its error at once even though a good page is cached', r.html.includes('<b>desk-page-202611010003-a3.html</b>') && !r.html.includes('<!--V2-->'));
e4.props.DESK_PAGE_FILE_ID = 'a';
ok('changing the pin takes effect at once (the cache key is the chosen file)', html(e4).html.includes('<!--V1-->') && (e4.props.DESK_PAGE_FILE_ID = 'b', html(e4).html.includes('<!--V2-->')));
const e7 = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('V1')), 100)]); html(e7);
e7.drive.folders.FOLD[0].updated = 200; e7.drive.folders.FOLD[0].content = mk('1', bodyTag('V1b'));
ok('a file re-uploaded under the same name (new updated time) is re-read', html(e7).html.includes('<!--V1b-->') && e7.drive.reads === 2);
const e8 = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1', bodyTag('V1')))]); html(e8);
{ const c = e8.ctx.CacheService.getScriptCache(), k8 = e8.cacheKeys().find(x => x.endsWith(':3')), v = c.get(k8);
  c.put(k8, v.slice(0, 5) + (v[5] === 'x' ? 'y' : 'x') + v.slice(6)); // same length, one character different: the length check alone would pass it
  r = html(e8);
  ok('a cached page damaged without changing its length is caught by the checksum: Drive is re-read', r.html.includes('<!--V1-->') && e8.drive.reads === 2); }
// only checked pages are cached
const e5 = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1').slice(0, -20))]); html(e5);
ok('a file that fails its check is never cached', e5.cacheKeys().filter(k => k.startsWith('pg')).length === 0);

// speed in the mock (Drive and cache calls per request)
const e6 = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1'))]); const t0 = Date.now(); html(e6); const miss = Date.now() - t0; const t1 = Date.now(); for (let i = 0; i < 5; i++) html(e6); const hit = (Date.now() - t1) / 5;
console.log('speed (mock, Node): miss ' + miss + ' ms (1 Drive read, ' + e6.cacheStats.puts + ' cache puts), hit ' + hit.toFixed(0) + ' ms (0 Drive calls, ' + Math.round((e6.cacheStats.gets) / 6) + ' cache gets)');

// fallback: neither property set serves the Index files, with the sentinel check
e = makeEnv(); r = html(e);
ok('no DESK_PAGE_FOLDER_ID: the Index files are served as before', r.html.includes('window.__GAS_BOOT=') && e.drive.reads === 0 && e.drive.listings === 0);

// pageDiag
e = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1')), mkf('b', 'desk-page-202611010002-a2.html', mk('2', body, 999))]);
let d = e.ctx.pageDiag();
ok('pageDiag logs folder, chosen file, build, chars, check result and api', d.includes('DESK_API (Code.gs) = ' + m[2]) && d.includes('FOLD') && d.includes('chosen file: desk-page-202611010002-a2.html') && d.includes('build 2') && d.includes('api 999') && d.includes('header chars ' + body.length) && d.includes('Check: FAILED') && (e.state.logs || []).some(l => l.includes('chosen file')));
e = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1'))]); d = e.ctx.pageDiag();
ok('pageDiag reports a pass', d.includes('Check: passed'));
ok('pageDiag reads Drive, not the cache', (html(e), e.drive.reads, e.ctx.pageDiag(), e.drive.reads === 3));
{ const g = setup([mkf('a', 'desk-page-202611010001-a1.html', mk('1'))]); g.setEmail('someone@virgoasia.com'); const o = g.ctx.pageDiag();
  ok('pageDiag refuses anyone but the owner or a Super admin and reveals nothing', o === 'Only the project owner or a Super admin may run this.' && !o.includes('FOLD')); }
d = makeEnv().ctx.pageDiag(); ok('pageDiag says the Index files are in use when no property is set', d.includes('not set') && d.includes('Index HTML files'));
d = setup([], {}, { DESK_PAGE_FOLDER_ID: 'NOPE' }).ctx.pageDiag(); ok('pageDiag reports an unknown folder', d.includes('ERROR') && d.includes('DESK_PAGE_FOLDER_ID'));
ok('appsscript.json has the drive.readonly scope and nothing else new', (() => { const j = JSON.parse(fs.readFileSync(path.join(out, 'appsscript.json.txt'), 'utf8')); return j.oauthScopes.includes('https://www.googleapis.com/auth/drive.readonly') && j.oauthScopes.length === 5; })());
console.log('gas-drive: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
