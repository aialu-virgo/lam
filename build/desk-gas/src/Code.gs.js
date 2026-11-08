/* Virgo Laminates Performance Desk: Apps Script server (file Code.gs).
 * Serves the page (HTML file "Index") and keeps the shared database in one Google Spreadsheet created on first use (ID in Script Property DESK_SHEET_ID).
 * Storage: ONE SHEET PER COLLECTION, named c_<collection>. Row = one part of one document:
 *   A id, B part "i/n/token" (part number, parts in the document, write token), C len (characters in D), D json (<= 45,000 characters), E updatedAt, F updatedBy.
 * All parts of a document are appended together, so they sit in adjacent rows. An update appends the new parts under a new token and only then deletes the old rows,
 * so the old complete version stays readable until the new one is complete. A reader takes the newest token whose parts are all present.
 * Revisions: Script Property DESK_REVS = {"revs":{collection:n},"wts":ms}. n is odd while a write to that collection is in progress and even otherwise; every write adds 2.
 * LOCKS: the script lock is taken in exactly three places (the third is deskLease, below) and never while it is already held: database creation (ssId_, its own short lock) and the write section of
 * deskWrite / deskWipe. The SAP feed (sap.gs.js, joined to this file by build-gas.mjs) takes it only for its run flag and for its staging write section, the same way. The database is created BEFORE any write lock is taken (setup(), doGet, or the first step of deskWrite).
 * A read is accepted only when the revision was even and unchanged from before to after the read (sequence lock), so a page never mixes two versions. */
var SEED_SUPER = ['data@virgoasia.com', 'spa@virgoasia.com', 'ai.acp@virgoasia.com'];
var PART_CHARS = 45000;          // Google Sheets allows 50,000 characters per cell
var MAX_DOC_CHARS = 262144;      // 256 KiB per document, as the page assumes
var PAGE_CHARS = 2500000;        // characters per page read (one getValues)
var PAGE_ROWS = 4000;            // rows per page read
var STALE_WRITE_MS = 150000;     // an odd revision whose heartbeat (wts) is older than this is a crashed write and is ignored; a live writer refreshes wts before every step
var ADMIN_COLLECTIONS = ['periods', 'audit', 'settings', 'users', 'plants', 'cells', 'inv', 'roll', 'mappings', 'transfers', 'uploads', 'rejects', 'items', 'itemmeta', 'salesmaster', 'orders', 'deliveries', 'receivables', 'collections', 'stock', 'backups', 'customers', 'creditnotes', 'sapstage', 'geography', 'dashroles', 'jobs'];
var SHARED_COLLECTIONS = ['potential', 'phasing', 'actions', 'followups', 'log', 'planlocks', 'dashlayouts'];
var HEADER = ['id', 'part', 'len', 'json', 'updatedAt', 'updatedBy'];

/* Run once from the editor (select setup, Run). Creates the database spreadsheet and triggers the permission prompt. Safe to run again.
 * It is also reachable through google.script.run, so it works only for the project owner (the editor run) or an active Super admin. */
function setup() {
  return wrap_(function () {
    var email = activeEmail_(), eff = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    if (!email || !(email === eff || isAdmin_(resolveUser_(email)))) fail_('permission_denied', 'Only the project owner or a Super admin may run setup.');
    var id = ssId_(true);
    SpreadsheetApp.openById(id);
    PropertiesService.getScriptProperties().getProperty('DESK_REVS');
    CacheService.getScriptCache().get('setup');
    ScriptApp.getService().getUrl();
    Logger.log('Desk database ready: ' + id);
    return { ok: true, id: id };
  });
}

function doGet(e) {
  try { book_(true); } catch (err) { /* reported by the page as a database error */ }
  var email = activeEmail_();
  var boot = { email: email, url: ScriptApp.getService().getUrl(), h: (e && e.parameter && e.parameter.h) || '', owner: false, name: '' };
  try { var who = resolveUser_(email); boot.owner = who.role === 'Super admin'; boot.name = who.name || ''; } catch (err) { boot.err = String(err && err.message || err); }
  var loaded = loadPage_();
  if (loaded.error) return indexErrorPage_(loaded.error);
  var html = loaded.html;
  var json = JSON.stringify(boot).replace(/</g, '\\u003c');
  html = html.split('/*@@GAS_BOOT@@*/').join('window.__GAS_BOOT=' + json + ';');
  return HtmlService.createHtmlOutput(html)
    .setTitle('Virgo Laminates Performance Desk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* ---------- the page ----------
 * Preferred: from Google Drive (DESK_PAGE_FOLDER_ID, below). Fallback: the HTML files Index, Index2, Index3 ... in this project, joined in order.
 * Project HTML files are read with HtmlService.createTemplateFromFile(name).getRawContent(): exact text. createHtmlOutputFromFile(name).getContent() parses the file as HTML and refuses
 * a fragment ("Malformed HTML content"), which is what Index2 to Index4 are, so it must NOT be used for them.
 * INDEX_MANIFEST = [{name, chars, sum}] per part, written by build-gas.mjs; raw content is exact, so each part is checked by length and checksum.
 * null (unbuilt source, or set by hand as a stopgap) = join until the first missing file, unchecked. */
var INDEX_MANIFEST = /*@@INDEX_MANIFEST@@*/null;
function indexPartName_(i) { return i === 0 ? 'Index' : 'Index' + (i + 1); }
/* The text that is measured: CRLF as LF, no trailing whitespace (the editor changes the very end of a file by a newline). The page itself is served as read. */
function indexNorm_(s) { return String(s).replace(/\r\n/g, '\n').replace(/\s+$/, ''); }
function indexRaw_(name) { return HtmlService.createTemplateFromFile(name).getRawContent(); }
function loadIndex_() {
  var out = [], i, text;
  if (!INDEX_MANIFEST) {
    for (i = 0; i < 50; i++) { try { text = indexRaw_(indexPartName_(i)); } catch (err) { if (i === 0) return { error: { file: 'Index', problem: 'is missing' } }; break; } out.push(text); }
    return { html: out.join('') };
  }
  for (i = 0; i < INDEX_MANIFEST.length; i++) {
    var m = INDEX_MANIFEST[i];
    try { text = indexRaw_(m.name); }
    catch (err) { return { error: { file: m.name, problem: 'is missing (the Desk has ' + INDEX_MANIFEST.length + ' page files, Index to ' + indexPartName_(INDEX_MANIFEST.length - 1) + ')' } }; }
    var nt = indexNorm_(text);
    if (nt.length !== m.chars) return { error: { file: m.name, problem: 'is incomplete or out of date: it has ' + nt.length + ' characters, it must have ' + m.chars + (nt.length < m.chars ? ' (it was cut short when saved, or an older version is still there)' : ' (it is from another Desk version, or has extra text)') } };
    var sum = indexSum_(nt);
    if (sum !== m.sum) return { error: { file: m.name, problem: 'has the right length but different content (checksum ' + sum + ', expected ' + m.sum + '): it is from another Desk version or was edited' } };
    out.push(text);
  }
  return { html: out.join('') };
}
function indexErrorPage_(e) {
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var fix = e.fix || ('Admin: open the Apps Script project, open <b>' + esc(e.file) + '</b>, select all, paste the matching Desk-' + esc(e.file) + '.txt, save, check its last line (see README), then Deploy &gt; Manage deployments &gt; New version.');
  return HtmlService.createHtmlOutput('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Desk setup problem</title></head><body style="font-family:sans-serif;max-width:640px;margin:48px auto;padding:0 16px">'
    + '<h2>The Desk page is not fully installed</h2><p>' + (e.drive ? 'The page file' : 'The HTML file') + ' <b>' + esc(e.file) + '</b> ' + esc(e.problem) + '.</p><p>' + fix + '</p></body></html>')
    .setTitle('Desk setup problem');
}
/* Only the project owner (editor run) or a Super admin may run the diagnostics; anyone else gets one line and nothing about the setup. */
function diagGate_() {
  try { var email = activeEmail_(), eff = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); if (email && (email === eff || isAdmin_(resolveUser_(email)))) return ''; } catch (err) {}
  return 'Only the project owner or a Super admin may run this.';
}

/* ---------- page from Google Drive (preferred): folder DESK_PAGE_FOLDER_ID holds desk-page-<yyyymmddhhmm>-<hash>.html, one per release ----------
 * Line 1 of each file is <!--DESK-PAGE build=<id> api=<n> chars=<n> sum=<hex>-->; chars and sum cover the text after that line and are checked on the raw Drive text.
 * A file that fails any check is never served. Script Properties: DESK_PAGE_FOLDER_ID (turns this path on), DESK_PAGE_FILE_ID (optional: pin one exact file, for rollback).
 * Neither property set = the Index files above. The newest file is looked up on EVERY request (one Drive listing); only its content is cached (10 minutes, CacheService, chunks under
 * 100 KB, key = file id + updated time, re-checked against the header checksum), so a new upload, good or bad, is acted on at once. */
var DESK_API = 1;                // bump only when server functions change in a way an older page cannot work with
var PAGE_NAME_RE = /^desk-page-(\d{12})-([0-9a-z]+)\.html$/;   // the build id is a fixed-width UTC timestamp, then the git hash: plain name order is build order
var PAGE_NAME_LOOSE_RE = /^desk-page-.*\.html$/i;
var PAGE_CACHE_SECS = 600;
var PAGE_CHUNK_CHARS = 30000;    // 3 bytes per character at worst = 90 KB, under the 100 KB cache value limit
var FIX_UPLOAD = 'Delivery Lead: upload the page file again (Drive, plain text, no conversion; the file name is desk-page-&lt;yyyymmddhhmm&gt;-&lt;hash&gt;.html). Nothing else needs to change.';
var FIX_ACCESS = 'Admin: share the folder "Virgo Desk page (do not edit)" with the Google account that deployed this web app (Deploy &gt; Manage deployments &gt; Execute as), then check DESK_PAGE_FOLDER_ID in Project Settings &gt; Script properties.';
function indexSum_(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return ('00000000' + (h >>> 0).toString(16)).slice(-8); }
function pageErr_(file, problem, fix) { return { error: { file: file, problem: problem, drive: true, fix: fix || FIX_UPLOAD } }; }
/* checks the raw text of a page file; returns {html, build, sum} or {error} */
function pageCheck_(name, raw) {
  var nl = raw.indexOf('\n'), head = nl < 0 ? raw : raw.slice(0, nl);
  var m = /^<!--DESK-PAGE build=(\S+) api=(\d+) chars=(\d+) sum=([0-9a-f]{8})-->$/.exec(head.replace(/^\uFEFF/, '').replace(/\r$/, ''));
  if (!m) return pageErr_(name, 'has no valid DESK-PAGE header on line 1 (it is not a Desk page file, or it was converted or edited)');
  var body = raw.slice(nl + 1), nb = indexNorm_(body);
  if (nb.length !== +m[3]) return pageErr_(name, 'is incomplete or was changed: it has ' + nb.length + ' characters after the header, it must have ' + m[3] + (nb.length < +m[3] ? ' (the upload was cut short)' : ' (extra text)'));
  var sum = indexSum_(nb);
  if (sum !== m[4]) return pageErr_(name, 'has the right length but its content does not match the build (checksum ' + sum + ', expected ' + m[4] + '): it was edited or converted');
  if (+m[2] !== DESK_API) return pageErr_(name, 'is for server version api=' + m[2] + ' but Code.gs is api=' + DESK_API, 'Admin: paste the newer Desk-Code.gs.txt into Code.gs and make a New version (Deploy &gt; Manage deployments &gt; New version). To go back to an older page instead, ask the Delivery Lead to set DESK_PAGE_FILE_ID.');
  if (!/<\/html>\s*$/.test(body)) return pageErr_(name, 'does not end with </html>');
  return { html: body, build: m[1], sum: m[4] };
}
function pageFind_(props) {
  var pin = props.getProperty('DESK_PAGE_FILE_ID'), folderId = props.getProperty('DESK_PAGE_FOLDER_ID'), file = null;
  if (pin) {
    try { file = DriveApp.getFileById(pin); } catch (err) { return pageErr_('DESK_PAGE_FILE_ID', 'does not open (' + String(err && err.message || err) + '): the pinned file id is wrong, or this account cannot see the file', FIX_ACCESS); }
    return { file: file, name: file.getName() };
  }
  var folder;
  try { folder = DriveApp.getFolderById(folderId); } catch (err) { return pageErr_('DESK_PAGE_FOLDER_ID', 'does not open (' + String(err && err.message || err) + '): the folder id is wrong, or this account cannot see the folder', FIX_ACCESS); }
  var best = null, bestName = '', it = folder.getFiles(), ties = [];
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (!PAGE_NAME_LOOSE_RE.test(n)) continue;
    if (!PAGE_NAME_RE.test(n)) return pageErr_(n, 'does not have a valid name: it must be desk-page-<yyyymmddhhmm>-<hash>.html (12-digit UTC build time, then the git hash), so the newest file can be told from the name', 'Delivery Lead: rename or delete that file in the Drive folder.');
    if (!best || n > bestName) { best = f; bestName = n; ties = [f]; } else if (n === bestName) ties.push(f);
  }
  if (!best) return pageErr_('the Desk page folder', 'holds no file named desk-page-<yyyymmddhhmm>-<hash>.html');
  if (ties.length > 1) { var bt = 0; for (var i = 0; i < ties.length; i++) { var t = ties[i].getLastUpdated().getTime(); if (t >= bt) { bt = t; best = ties[i]; } } }
  return { file: best, name: bestName };
}
function pageCachePut_(cache, key, html, sum) {
  try {
    var n = Math.ceil(html.length / PAGE_CHUNK_CHARS);
    for (var i = 0; i < n; i++) cache.put(key + ':' + i, html.substr(i * PAGE_CHUNK_CHARS, PAGE_CHUNK_CHARS), PAGE_CACHE_SECS);
    cache.put(key + ':n', n + ':' + html.length + ':' + sum, PAGE_CACHE_SECS);
  } catch (err) { /* cache is an optimisation only */ }
}
function pageCacheGet_(cache, key) {
  try {
    var meta = cache.get(key + ':n'); if (!meta) return null;
    var p = meta.split(':'), n = +p[0], out = [];
    for (var i = 0; i < n; i++) { var c = cache.get(key + ':' + i); if (c === null || c === undefined) return null; out.push(c); }
    var html = out.join('');
    return (html.length === +p[1] && indexSum_(indexNorm_(html)) === p[2]) ? html : null;
  } catch (err) { return null; }
}
function loadPageDrive_(props) {
  var cache = null; try { cache = CacheService.getScriptCache(); } catch (err) {}
  var found = pageFind_(props);
  if (found.error) return found;
  var key = 'pgc:' + found.file.getId() + ':' + found.file.getLastUpdated().getTime() + ':' + DESK_API;
  if (cache) { var hit = pageCacheGet_(cache, key); if (hit !== null) return { html: hit, cached: true, name: found.name }; }
  var raw;
  try { raw = found.file.getBlob().getDataAsString('UTF-8'); }
  catch (err) { return pageErr_(found.name, 'could not be read from Drive (' + String(err && err.message || err) + ')', 'Reload in a minute. If it keeps failing: ' + FIX_ACCESS); }
  var checked = pageCheck_(found.name, raw);
  if (checked.error) return checked;
  if (cache) pageCachePut_(cache, key, checked.html, checked.sum);
  return { html: checked.html, build: checked.build, name: found.name };
}
function loadPage_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('DESK_PAGE_FOLDER_ID') || props.getProperty('DESK_PAGE_FILE_ID')) return loadPageDrive_(props);
  return loadIndex_();
}
/* Run from the editor (select pageDiag, Run, then Execution log): which page source is in use and whether the chosen file passes its checks. Reads Drive directly, never the cache. Owner / Super admin only. */
function pageDiag() {
  var gate = diagGate_(); if (gate) return gate;
  var props = PropertiesService.getScriptProperties(), lines = [];
  lines.push('DESK_API (Code.gs) = ' + DESK_API);
  lines.push('DESK_PAGE_FOLDER_ID = ' + (props.getProperty('DESK_PAGE_FOLDER_ID') || '(not set)') + ' | DESK_PAGE_FILE_ID = ' + (props.getProperty('DESK_PAGE_FILE_ID') || '(not set)'));
  if (!props.getProperty('DESK_PAGE_FOLDER_ID') && !props.getProperty('DESK_PAGE_FILE_ID')) lines.push('Page source: the Index HTML files (run indexDiag for detail). Set DESK_PAGE_FOLDER_ID to serve from Drive.');
  else {
    var found = pageFind_(props);
    if (found.error) lines.push('ERROR: ' + found.error.file + ' ' + found.error.problem);
    else {
      lines.push('Folder: ' + (props.getProperty('DESK_PAGE_FILE_ID') ? '(pinned file)' : 'ok') + ' | chosen file: ' + found.name + ' | id ' + found.file.getId() + ' | updated ' + found.file.getLastUpdated());
      try {
        var raw = found.file.getBlob().getDataAsString('UTF-8'), h = /^<!--DESK-PAGE build=(\S+) api=(\d+) chars=(\d+) sum=([0-9a-f]{8})-->/.exec(raw.replace(/^\uFEFF/, '')), r = pageCheck_(found.name, raw);
        lines.push('Raw length ' + raw.length + (h ? ' | build ' + h[1] + ' | api ' + h[2] + ' | header chars ' + h[3] + ' | header sum ' + h[4] : ' | no header found'));
        lines.push('Check: ' + (r.error ? 'FAILED: ' + r.error.problem : 'passed'));
      } catch (err) { lines.push('Read failed: ' + String(err && err.message || err)); }
    }
  }
  lines.forEach(function (l) { Logger.log(l); });
  return lines.join('\n');
}
/* Run from the editor (select indexDiag, Run, then Execution log): for each Index file, the exact (raw) content and what the old HTML-parsing call returns. Owner / Super admin only. */
function indexDiag() {
  var gate = diagGate_(); if (gate) return gate;
  var n = INDEX_MANIFEST ? INDEX_MANIFEST.length : 12, lines = [];
  lines.push('INDEX_MANIFEST = ' + JSON.stringify(INDEX_MANIFEST));
  for (var i = 0; i < n; i++) {
    var name = indexPartName_(i), text, m = INDEX_MANIFEST ? INDEX_MANIFEST[i] : null, old;
    try { text = indexRaw_(name); }
    catch (err) { lines.push(name + ': MISSING (' + String(err && err.message || err) + ')'); if (!INDEX_MANIFEST) break; continue; }
    try { old = 'ok, ' + HtmlService.createHtmlOutputFromFile(name).getContent().length + ' characters'; } catch (err) { old = 'FAILS: ' + String(err && err.message || err); }
    lines.push(name + ': raw length ' + text.length + (m ? ' (expected ' + m.chars + ')' : '') + ' | checksum ' + indexSum_(text) + (m ? ' (expected ' + m.sum + ')' : '') + ' | createHtmlOutputFromFile ' + old);
    lines.push('  first 80: ' + JSON.stringify(text.slice(0, 80)));
    lines.push('  last 80: ' + JSON.stringify(text.slice(-80)));
  }
  lines.forEach(function (l) { Logger.log(l); });
  return lines.join('\n');
}

/* ---------- envelope: every client call returns {ok:true,...} or {ok:false,code,message} ---------- */
function wrap_(fn) {
  try { return fn(); }
  catch (err) {
    if (err && err.deskCode) return { ok: false, code: err.deskCode, message: err.message };
    var m = String(err && err.message || err);
    var code = /lock/i.test(m) ? 'unavailable' : /too many|quota|limit|exceeded|too large|10000000/i.test(m) ? 'quota_exceeded' : 'unavailable';
    return { ok: false, code: code, message: m };
  }
}
function fail_(code, message) { var e = new Error(message); e.deskCode = code; throw e; }
function activeEmail_() { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); }

/* ---------- revisions ---------- */
function revsGet_() {
  var v = PropertiesService.getScriptProperties().getProperty('DESK_REVS'), m = null;
  try { m = JSON.parse(v); } catch (e) {}
  if (!m || !m.revs) m = { revs: {}, wts: 0 };
  return m;
}
function revsSave_(m) { PropertiesService.getScriptProperties().setProperty('DESK_REVS', JSON.stringify(m)); }
function writing_(m, col) { return (m.revs[col] || 0) % 2 === 1 && Date.now() - (m.wts || 0) < STALE_WRITE_MS; }

/* ---------- storage ---------- */
function ssId_(create) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DESK_SHEET_ID');
  if (id || !create) return id;
  var lock = LockService.getScriptLock(); lock.waitLock(10000); // its own short lock; callers never hold the script lock here
  try {
    id = props.getProperty('DESK_SHEET_ID');
    if (!id) {
      var ss = SpreadsheetApp.create('Virgo Desk database (do not edit)');
      ss.getSheets()[0].setName('info');
      ss.getSheetByName('info').getRange(1, 1).setValue('One sheet per collection (c_<name>). Edited only by the Desk web app. Do not edit by hand.');
      props.setProperty('DESK_SHEET_ID', ss.getId()); id = ss.getId();
    }
  } finally { lock.releaseLock(); }
  return id;
}
function book_(create) { var id = ssId_(create); return id ? SpreadsheetApp.openById(id) : null; }
function colSheet_(ss, col, create) {
  var sh = ss.getSheetByName('c_' + col);
  if (sh || !create) return sh;
  sh = ss.insertSheet('c_' + col);
  sh.getRange(1, 1, 1, 6).setValues([HEADER]);
  sh.getRange('A:B').setNumberFormat('@');
  sh.getRange('D:D').setNumberFormat('@');
  if (sh.getMaxColumns() > 6) sh.deleteColumns(7, sh.getMaxColumns() - 6);
  return sh;
}
function partOf_(p) { var a = String(p).split('/'); return { i: +a[0], n: +a[1], t: a[2] || '' }; }
function runs_(nums) { var out = []; nums.forEach(function (r) { var l = out[out.length - 1]; if (l && l[0] + l[1] === r) l[1]++; else out.push([r, 1]); }); return out; }
/* rows: [[id, part, len, json]] (any order) -> {docs:[{id,token,json}], skipped:n}. Per id the newest token whose parts are all present wins. */
function assemble_(rows) {
  var byId = Object.create(null), ids = [];
  rows.forEach(function (r) {
    var p = partOf_(r[1]), g = byId[r[0]];
    if (!g) { g = byId[r[0]] = Object.create(null); ids.push(r[0]); }
    var t = g[p.t] || (g[p.t] = { n: p.n, parts: Object.create(null), c: 0 });
    if (!(p.i in t.parts)) { t.parts[p.i] = String(r[3]); t.c++; }
  });
  var docs = [], skipped = 0;
  ids.forEach(function (id) {
    var toks = Object.keys(byId[id]).sort().reverse(), done = false;
    for (var k = 0; k < toks.length && !done; k++) {
      var t = byId[id][toks[k]];
      if (t.c === t.n) { var s = []; for (var i = 0; i < t.n; i++) s.push(t.parts[i]); docs.push({ id: id, token: toks[k], json: s.join('') }); done = true; }
    }
    if (!done) skipped++;
  });
  return { docs: docs, skipped: skipped };
}
/* pages of whole documents: [[firstRow,lastRow]] from one read of columns A:C */
function plan_(sh) {
  var last = sh ? sh.getLastRow() : 0;
  if (last < 2) return { rows: 0, chars: 0, pages: [] };
  var v = sh.getRange(2, 1, last - 1, 3).getValues(), pages = [], start = 2, chars = 0, n = 0, total = 0;
  for (var i = 0; i < v.length; i++) {
    var p = partOf_(v[i][1]); chars += +v[i][2] || 0; n++; total += +v[i][2] || 0;
    if ((p.i === p.n - 1 || i === v.length - 1) && (chars >= PAGE_CHARS || n >= PAGE_ROWS || i === v.length - 1)) { pages.push([start, i + 2]); start = i + 3; chars = 0; n = 0; }
  }
  return { rows: v.length, chars: total, pages: pages };
}
function readPage_(sh, r1, r2) {
  if (r2 < r1 || r2 - r1 + 1 > 20000) fail_('invalid_argument', 'Bad page.');
  return assemble_(sh.getRange(r1, 1, r2 - r1 + 1, 4).getValues());
}
/* run a read under the sequence lock: the collection's revision must be even and unchanged around fn */
function stable_(col, wantRev, fn) {
  var m0 = revsGet_(), r0 = m0.revs[col] || 0;
  if (wantRev !== undefined && wantRev !== null && wantRev !== r0) fail_('stale', 'The collection changed.');
  if (writing_(m0, col)) fail_('unavailable', 'busy');
  var out = fn(r0);
  var r1 = revsGet_().revs[col] || 0;
  if (r1 !== r0) fail_(wantRev !== undefined && wantRev !== null ? 'stale' : 'unavailable', 'The collection changed during the read.');
  return out;
}
/* whole collection read on the server (small collections only: users, seed check) */
function readAll_(ss, col) {
  for (var a = 0; a < 3; a++) {
    try {
      return stable_(col, null, function () {
        var sh = colSheet_(ss, col, false), pl = plan_(sh), docs = [], skipped = 0;
        pl.pages.forEach(function (p) { var r = readPage_(sh, p[0], p[1]); docs = docs.concat(r.docs); skipped += r.skipped; });
        return { docs: docs, skipped: skipped };
      });
    } catch (e) { if (a === 2 || !e.deskCode) throw e; Utilities.sleep(250); }
  }
}

/* ---------- access ---------- */
function resolveUser_(email) {
  var out = { email: email, role: null, active: false, name: '', department: '', plant_codes: '', reports_to_email: '', seed: SEED_SUPER.indexOf(email) >= 0 };
  if (!email) return out;
  var ss = book_(false), u = null;
  if (ss) {
    var rev = revsGet_().revs.users || 0, ck = 'acl_' + rev + '_' + email, cache = CacheService.getScriptCache(), c = cache.get(ck);
    if (c) { try { u = JSON.parse(c).u; } catch (e) {} }
    else {
      readAll_(ss, 'users').docs.forEach(function (d) {
        try { var o = JSON.parse(d.json); if (String(o.email || '').toLowerCase() === email) u = { role: o.role, active: o.active !== false, name: o.name || '', department: o.department || '', plant_codes: o.plant_codes || '', reports_to_email: o.reports_to_email || '' }; } catch (e) {}
      });
      cache.put(ck, JSON.stringify({ u: u }), 120);
    }
  }
  if (u) { out.role = u.role; out.active = u.active; out.name = u.name; out.department = u.department || ''; out.plant_codes = u.plant_codes || ''; out.reports_to_email = u.reports_to_email || ''; }
  if (out.seed) { out.role = 'Super admin'; out.active = true; } // seed admins cannot be locked out, as in the page
  return out;
}
function requireUser_() {
  var email = activeEmail_();
  if (!email) fail_('unauthenticated', 'Your Google account email is not visible to this web app.');
  return resolveUser_(email);
}
function isAdmin_(who) { return who.role === 'Super admin' && who.active; }
/* My Dashboard (M8): dashlayouts/u_<slug of email> is a person's own layout. Only that person or a Super admin writes it; dashroles (role defaults) is admin only. Same slug as the page (slug(): lower case, non-alphanumerics to _, trimmed, 120 characters). */
function dashSlug_(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 120); }
function canWrite_(who, col, id) {
  if (col === 'dashlayouts') return !!who.role && who.active && (isAdmin_(who) || (!!who.email && id === 'u_' + dashSlug_(who.email)));
  if (col === 'geography') return who.active && (who.role === 'Super admin' || who.role === 'Management / HO');   // D80: geography masters, admin collection; Admin › Geography is Super admin and Management / HO
  if (ADMIN_COLLECTIONS.indexOf(col) >= 0) return isAdmin_(who);
  if (col === 'planlocks') return who.active && (who.role === 'Super admin' || who.role === 'Management / HO');
  if (SHARED_COLLECTIONS.indexOf(col) >= 0) return !!who.role && who.active;
  return false;
}
function knownCol_(col) { return ADMIN_COLLECTIONS.indexOf(col) >= 0 || SHARED_COLLECTIONS.indexOf(col) >= 0; }
function checkId_(id) { if (typeof id !== 'string' || !id || id.length > 300 || id.indexOf('/') >= 0) fail_('invalid_argument', 'Bad document id.'); }
/* a registered, active user reads everything (no row filter, as on claude.ai; decision D66). Inactive and unknown emails read nothing. */
function canRead_(who) { return !!(who.role && who.active); }
/* staged SAP feed rows (collection sapstage) are Super-admin-only for reading too (D73) */
var ADMIN_READ_ONLY = ['sapstage'];
function needRead_(who, col) { if (ADMIN_READ_ONLY.indexOf(col) >= 0 && !isAdmin_(who)) fail_('permission_denied', 'Super admin only.'); }

/* ---------- API called by the page ---------- */
function deskBoot() {
  return wrap_(function () {
    var email = activeEmail_(), who = resolveUser_(email);
    return { ok: true, email: email, owner: who.role === 'Super admin', name: who.name, url: ScriptApp.getService().getUrl() };
  });
}
/* cheap poll: the revision map (one Script Property read) */
function deskRevs() {
  return wrap_(function () {
    var who = requireUser_(), revs = revsGet_().revs;
    if (!isAdmin_(who)) { revs = Object.assign({}, revs); ADMIN_READ_ONLY.forEach(function (c) { delete revs[c]; }); }
    return { ok: true, revs: revs };
  });
}
/* step 1 of reading a collection: its revision and the pages (row ranges of whole documents) to fetch with deskPage */
function deskPlan(col) {
  return wrap_(function () {
    var who = requireUser_();
    if (!knownCol_(col)) fail_('invalid_argument', 'Unknown collection.');
    needRead_(who, col);
    var ss = canRead_(who) ? book_(false) : null;
    return stable_(col, null, function (rev) {
      var pl = ss ? plan_(colSheet_(ss, col, false)) : { rows: 0, chars: 0, pages: [] };
      return { ok: true, rev: rev, rows: pl.rows, chars: pl.chars, pages: pl.pages };
    });
  });
}
/* step 2: ONE getValues over rows r1..r2; returns the complete documents in them. rev must still be the plan's revision. */
function deskPage(col, r1, r2, rev) {
  return wrap_(function () {
    var who = requireUser_();
    if (!knownCol_(col) || !canRead_(who)) fail_('invalid_argument', 'Unknown collection.');
    needRead_(who, col);
    var ss = book_(false), sh = ss && colSheet_(ss, col, false);
    return stable_(col, rev, function () { var r = readPage_(sh, r1, r2); return { ok: true, docs: r.docs, skipped: r.skipped }; });
  });
}
/* the documents with these ids: {id: json} (newest complete version); no sequence lock (the caller decides) */
function docsRaw_(sh, ids) {
  var out = Object.create(null), last = sh ? sh.getLastRow() : 0; if (last < 2) return out;
  var v = sh.getRange(2, 1, last - 1, 2).getValues(), want = Object.create(null), rows = [];
  ids.forEach(function (id) { want[id] = 1; });
  for (var i = 0; i < v.length; i++) if (want[v[i][0]]) rows.push({ row: i + 2, id: String(v[i][0]), part: v[i][1] });
  var js = Object.create(null);
  runs_(rows.map(function (r) { return r.row; })).forEach(function (r) { var d = sh.getRange(r[0], 4, r[1], 1).getValues(); for (var k = 0; k < r[1]; k++) js[r[0] + k] = String(d[k][0]); });
  assemble_(rows.map(function (r) { return [r.id, r.part, 0, js[r.row]]; })).docs.forEach(function (d) { out[d.id] = d.json; });
  return out;
}
function deskGetMany(keys) { // keys: ["col/id", ...] -> docs:[{key,json|null}]
  return wrap_(function () {
    var who = requireUser_(), byCol = Object.create(null), out = {};
    keys.forEach(function (k) {
      var i = String(k).indexOf('/'), col = k.slice(0, i);
      if (!knownCol_(col)) fail_('invalid_argument', 'Unknown collection.');
      needRead_(who, col);
      (byCol[col] = byCol[col] || []).push(k.slice(i + 1)); out[k] = null;
    });
    var ss = canRead_(who) ? book_(false) : null;
    Object.keys(byCol).forEach(function (col) {
      var sh = ss && colSheet_(ss, col, false); if (!sh) return;
      stable_(col, null, function () { var m = docsRaw_(sh, byCol[col]); Object.keys(m).forEach(function (id) { out[col + '/' + id] = m[id]; }); });
    });
    return { ok: true, docs: keys.map(function (k) { return { key: k, json: out[k] }; }) };
  });
}
/* ops: [{op:'set', col, id, json}|{op:'merge', col, id, json (a patch)}|{op:'delete', col, id}].
 * Each operation is checked on its own: a refused or invalid operation gets {ok:false, code, message} in results[i] and the allowed operations are still applied.
 * Returns {ok:true, revs, results:[{ok:true}|{ok:false, code, message}] (same order as ops)}. A whole-call failure (not signed in, lock timeout) returns {ok:false, code, message}. */
function checkOp_(who, o) {
  if (!o || (o.op !== 'set' && o.op !== 'merge' && o.op !== 'delete')) fail_('invalid_argument', 'Bad operation.');
  if (!knownCol_(o.col)) fail_('invalid_argument', 'Unknown collection.');
  checkId_(o.id);
  if (!canWrite_(who, o.col, o.id)) fail_('permission_denied', 'Writing to ' + o.col + (o.col === 'dashlayouts' ? ' is limited to your own layout.' : ' needs ' + ((o.col === 'planlocks' || o.col === 'geography') ? 'Management / HO or Super admin.' : ADMIN_COLLECTIONS.indexOf(o.col) >= 0 ? 'the Super admin role.' : 'an active user.')));
  if (o.op === 'set' || o.op === 'merge') {
    if (typeof o.json !== 'string') fail_('invalid_argument', 'Missing document.');
    if (o.json.length > MAX_DOC_CHARS) fail_('invalid_argument', 'Document too large (' + o.json.length + ' characters, limit ' + MAX_DOC_CHARS + ').');
    var d; try { d = JSON.parse(o.json); } catch (e) { fail_('invalid_argument', 'Document is not valid JSON.'); }
    if (!d || typeof d !== 'object' || Array.isArray(d)) fail_('invalid_argument', 'A document must be an object.');
  }
}
function deskWrite(ops) {
  return wrap_(function () {
    var who = requireUser_(), final = Object.create(null), order = [], results = [], keyOf = [], failed = Object.create(null);
    (ops || []).forEach(function (o, i) {
      try { checkOp_(who, o); } catch (e) { if (!e.deskCode) throw e; results[i] = { ok: false, code: e.deskCode, message: e.message }; keyOf[i] = null; return; }
      var k = o.col + '/' + o.id; keyOf[i] = k; if (!(k in final)) order.push(k); final[k] = o;
    });
    var revs = {};
    if (order.length) {
      book_(true);                                   // create the database first, under its own short lock, BEFORE the write lock
      var lock = LockService.getScriptLock(); lock.waitLock(30000);
      try { revs = applyOps_(who, final, order, failed).revs; } finally { lock.releaseLock(); }
    }
    (ops || []).forEach(function (o, i) { if (keyOf[i] !== null) results[i] = failed[keyOf[i]] ? { ok: false, code: failed[keyOf[i]].code, message: failed[keyOf[i]].message } : { ok: true }; });
    return { ok: true, revs: revs, results: results };
  });
}
function beginWrite_(cols) { // under the lock: make every touched revision odd
  var m = revsGet_();
  cols.forEach(function (c) { var r = m.revs[c] || 0; if (r % 2) r++; m.revs[c] = r + 1; });
  m.wts = Date.now(); revsSave_(m); return m;
}
function beat_() { var m = revsGet_(); m.wts = Date.now(); revsSave_(m); } // heartbeat: tells readers a live writer still holds the odd revision
function endWrite_(cols) {
  var m = revsGet_(); cols.forEach(function (c) { var r = m.revs[c] || 0; m.revs[c] = r % 2 ? r + 1 : r; }); revsSave_(m); return m;
}
/* inside the lock, before anything is written: turn merges into full documents. A merge into a missing document fails for that operation only. Returns {key: {code, message}} for failed operations. */
function prepare_(ss, final, order) {
  var want = Object.create(null), existing = Object.create(null), failed = Object.create(null);
  order.forEach(function (k) { var o = final[k]; if (o.op === 'merge') (want[o.col] = want[o.col] || []).push(o.id); });
  Object.keys(want).forEach(function (c) { existing[c] = docsRaw_(colSheet_(ss, c, false), want[c]); });
  order.forEach(function (k) {
    var o = final[k]; if (o.op !== 'merge') return;
    var j = existing[o.col] && existing[o.col][o.id], cur = null;
    try { cur = j == null ? null : JSON.parse(j); } catch (e) {}
    if (!cur) { failed[k] = { code: 'invalid_argument', message: 'Cannot update ' + o.col + '/' + o.id + ': it does not exist.' }; return; }
    var merged = JSON.stringify(Object.assign(cur, JSON.parse(o.json)));
    if (merged.length > MAX_DOC_CHARS) { failed[k] = { code: 'invalid_argument', message: 'Document too large (' + merged.length + ' characters, limit ' + MAX_DOC_CHARS + ').' }; return; }
    o.json = merged; o.op = 'set';
  });
  return failed;
}
function applyOps_(who, final, order, failed) {
  var ss = book_(false);
  if (!ss) fail_('unavailable', 'The database is not set up yet. Run setup() once from the Apps Script editor.');
  var more = prepare_(ss, final, order); Object.keys(more).forEach(function (k) { failed[k] = more[k]; });
  order = order.filter(function (k) { return !failed[k]; });
  if (!order.length) return { ok: true, revs: {} };
  var cols = [], byCol = Object.create(null), now = new Date().toISOString();
  order.forEach(function (k) { var o = final[k]; if (!byCol[o.col]) { byCol[o.col] = []; cols.push(o.col); } byCol[o.col].push(o); });
  var m = beginWrite_(cols), revs = {};
  try {
    cols.forEach(function (col) {
      beat_();
      var sh = colSheet_(ss, col, true), ops = byCol[col], ids = Object.create(null), old = [], add = [], last = sh.getLastRow();
      ops.forEach(function (o) { ids[o.id] = 1; });
      if (last >= 2) { var v = sh.getRange(2, 1, last - 1, 1).getValues(); for (var i = 0; i < v.length; i++) if (ids[v[i][0]]) old.push(i + 2); }
      var tok = ('000000000' + (m.revs[col] || 0)).slice(-9) + Math.random().toString(36).slice(2, 5);
      ops.forEach(function (o) {
        if (o.op !== 'set') return;
        var n = Math.max(1, Math.ceil(o.json.length / PART_CHARS));
        for (var i = 0; i < n; i++) { var s = o.json.slice(i * PART_CHARS, (i + 1) * PART_CHARS); add.push([o.id, i + '/' + n + '/' + tok, s.length, s, now, who.email]); }
      });
      // 1) append the new versions, 2) only then delete every old row of those ids
      if (add.length) {
        var need = last + add.length - sh.getMaxRows();
        if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need + 500);
        sh.getRange(last + 1, 1, add.length, 6).setValues(add);
      }
      runs_(old.sort(function (a, b) { return a - b; })).reverse().forEach(function (r) { beat_(); sh.deleteRows(r[0], r[1]); });
    });
  } finally {
    m = endWrite_(cols);
  }
  cols.forEach(function (c) { revs[c] = m.revs[c]; });
  return { ok: true, revs: revs };
}
/* ---------- restore support (Super admin only) ---------- */
function deskStats() {
  return wrap_(function () {
    var who = requireUser_();
    if (!isAdmin_(who)) fail_('permission_denied', 'Super admin only.');
    var ss = book_(false), counts = Object.create(null), allCols = ADMIN_COLLECTIONS.concat(SHARED_COLLECTIONS).filter(function (c) { return ADMIN_READ_ONLY.indexOf(c) < 0; }); // staged SAP rows are not part of a backup or restore
    if (ss) allCols.forEach(function (c) {
      var sh = colSheet_(ss, c, false), last = sh ? sh.getLastRow() : 0; if (last < 2) return;
      var v = sh.getRange(2, 1, last - 1, 1).getValues(), seen = Object.create(null), n = 0;
      v.forEach(function (r) { if (!seen[r[0]]) { seen[r[0]] = 1; n++; } });
      if (n) counts[c] = n;
    });
    var cols = Object.keys(counts), seedOnly = cols.every(function (c) { return c === 'users' || c === 'plants'; });
    if (seedOnly && cols.length) ['users', 'plants'].forEach(function (c) {
      if (!counts[c]) return;
      var r = readAll_(ss, c); if (r.skipped) seedOnly = false;
      r.docs.forEach(function (d) { try { if (JSON.parse(d.json).seed !== true) seedOnly = false; } catch (e) { seedOnly = false; } });
    });
    return { ok: true, counts: Object.assign({}, counts), empty: !cols.length, seedOnly: seedOnly, revs: revsGet_().revs };
  });
}
/* remove every document of the named collections (restore with "replace everything") */
function deskWipe(cols) {
  return wrap_(function () {
    var who = requireUser_();
    if (!isAdmin_(who)) fail_('permission_denied', 'Super admin only.');
    (cols || []).forEach(function (c) { if (!knownCol_(c)) fail_('invalid_argument', 'Unknown collection.'); });
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      var ss = book_(false), hit = [];
      if (ss) (cols || []).forEach(function (c) { var sh = colSheet_(ss, c, false); if (sh && sh.getLastRow() >= 2) hit.push(c); });
      if (!hit.length) return { ok: true, removedRows: 0 };
      beginWrite_(hit); var n = 0;
      try { hit.forEach(function (c) { beat_(); var sh = colSheet_(ss, c, false), last = sh.getLastRow(); n += last - 1; sh.deleteRows(2, last - 1); }); }
      finally { endWrite_(hit); }
      return { ok: true, removedRows: n };
    } finally { lock.releaseLock(); }
  });
}
/* ---------- document leases (admin job queue): the page's ref.acquire({holder, ttlMs}) ----------
 * One lease per document path "collection/id", kept in Script Property DESK_LEASES = {path: {h: holder, u: until ms}} (expired ones are dropped on every call).
 * Granted when free, expired, or already held by the same holder (then renewed); refused (acquired:false, with expiresAt) while another holder has it. ttl is clamped to 1 s .. 10 min, default 30 s.
 * Super admin only, admin collections only. The script lock is held only for the read-decide-write of this one property, never while another lock is held. */
function deskLease(col, id, holder, ttlMs) {
  return wrap_(function () {
    var who = requireUser_();
    if (!isAdmin_(who)) fail_('permission_denied', 'Super admin only.');
    if (!knownCol_(col) || ADMIN_COLLECTIONS.indexOf(col) < 0) fail_('invalid_argument', 'Leases exist for admin collections only.');
    id = String(id || ''); holder = String(holder || '');
    if (!id || id.length > 200 || id.indexOf('/') >= 0 || !holder || holder.length > 200) fail_('invalid_argument', 'Bad lease request.');
    var ttl = Math.min(600000, Math.max(1000, Number(ttlMs) || 30000)), path = col + '/' + id;
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      var props = PropertiesService.getScriptProperties(), now = Date.now(), m = {}, live = {}, n = 0;
      try { m = JSON.parse(props.getProperty('DESK_LEASES') || '{}') || {}; } catch (e) { m = {}; }
      Object.keys(m).forEach(function (k) { if (m[k] && m[k].u > now) { live[k] = m[k]; n++; } });
      var cur = live[path];
      if (cur && cur.h !== holder) return { ok: true, acquired: false, holder: cur.h, expiresAt: new Date(cur.u).toISOString() };
      if (!cur && n >= 40) fail_('quota_exceeded', 'Too many live leases.');
      live[path] = { h: holder, u: now + ttl };
      props.setProperty('DESK_LEASES', JSON.stringify(live));
      return { ok: true, acquired: true, version: 1, holder: holder, expiresAt: new Date(now + ttl).toISOString() };
    } finally { lock.releaseLock(); }
  });
}
/* checksum of the documents in rows r1..r2 (whole documents): count, characters and the sum of per-document CRC-32 of id + "\n" + json + "\n" (mod 2^32) */
function deskDigestPage(col, r1, r2, rev) {
  return wrap_(function () {
    var who = requireUser_();
    if (!isAdmin_(who)) fail_('permission_denied', 'Super admin only.');
    if (!knownCol_(col)) fail_('invalid_argument', 'Unknown collection.');
    var ss = book_(false), sh = ss && colSheet_(ss, col, false);
    return stable_(col, rev, function () {
      var r = readPage_(sh, r1, r2), sum = 0, chars = 0;
      r.docs.forEach(function (d) { sum = (sum + docCrc_(d.id, d.json)) % 4294967296; chars += d.json.length; });
      return { ok: true, docs: r.docs.length, chars: chars, sum: sum, skipped: r.skipped };
    });
  });
}
var CRC_T_ = null;
function crcTable_() { if (CRC_T_) return CRC_T_; var t = new Int32Array(256), c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? (-306674912 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return (CRC_T_ = t); }
function crcByte_(t, crc, b) { return t[(crc ^ b) & 255] ^ (crc >>> 8); }
/* CRC-32 of id + "\n" + json + "\n" as UTF-8 (lone surrogates become U+FFFD, as TextEncoder does) */
function docCrc_(id, json) {
  var t = crcTable_(), crc = -1, parts = [id, '\n', json, '\n'];
  for (var p = 0; p < 4; p++) {
    var s = parts[p], n = s.length;
    for (var i = 0; i < n; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) { crc = crcByte_(t, crc, c); continue; }
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < n) { var d = s.charCodeAt(i + 1); if (d >= 0xDC00 && d < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } }
      if (c >= 0xD800 && c < 0xE000) c = 0xFFFD;
      if (c < 0x800) { crc = crcByte_(t, crc, 0xC0 | (c >> 6)); crc = crcByte_(t, crc, 0x80 | (c & 63)); }
      else if (c < 0x10000) { crc = crcByte_(t, crc, 0xE0 | (c >> 12)); crc = crcByte_(t, crc, 0x80 | ((c >> 6) & 63)); crc = crcByte_(t, crc, 0x80 | (c & 63)); }
      else { crc = crcByte_(t, crc, 0xF0 | (c >> 18)); crc = crcByte_(t, crc, 0x80 | ((c >> 12) & 63)); crc = crcByte_(t, crc, 0x80 | ((c >> 6) & 63)); crc = crcByte_(t, crc, 0x80 | (c & 63)); }
    }
  }
  return (crc ^ -1) >>> 0;
}

/* Store size readout (Super admin): documents, rows and characters per collection, and the page size in use */
function deskSizes() {
  return wrap_(function () {
    var who = requireUser_();
    if (!isAdmin_(who)) fail_('permission_denied', 'Super admin only.');
    var ss = book_(false), cols = {}, total = 0;
    if (ss) ADMIN_COLLECTIONS.concat(SHARED_COLLECTIONS).forEach(function (c) {
      var sh = colSheet_(ss, c, false), last = sh ? sh.getLastRow() : 0; if (last < 2) return;
      var v = sh.getRange(2, 1, last - 1, 3).getValues(), seen = Object.create(null), docs = 0, chars = 0;
      v.forEach(function (r) { if (!seen[r[0]]) { seen[r[0]] = 1; docs++; } chars += +r[2] || 0; });
      cols[c] = { docs: docs, rows: v.length, chars: chars }; total += chars;
    });
    return { ok: true, cols: cols, totalChars: total, pageChars: PAGE_CHARS, pageRows: PAGE_ROWS };
  });
}
