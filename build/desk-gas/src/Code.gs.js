/* Virgo Laminates Performance Desk: Apps Script server (file Code.gs).
 * Serves the page (HTML file "Index") and keeps the shared database in one Google Spreadsheet created on first use.
 * Sheet "db": A collection, B docId, C part ("i/n/v": part number, parts in doc, write token), D json (<= 45,000 characters), E updatedAt, F updatedBy.
 * Sheet "meta": B1 holds {"revs":{collection: counter}} (bumped on every write to that collection).
 * Script Properties: DESK_SHEET_ID. Identity is Session.getActiveUser().getEmail(). */
var SEED_SUPER = ['data@virgoasia.com', 'spa@virgoasia.com'];
var PART_CHARS = 45000;          // Google Sheets allows 50,000 characters per cell
var MAX_DOC_CHARS = 262144;      // 256 KiB per document, as the page assumes
var READ_PAGE_CHARS = 3000000;   // one deskRead page
var ADMIN_COLLECTIONS = ['periods', 'audit', 'settings', 'users', 'plants', 'cells', 'inv', 'roll', 'mappings', 'transfers', 'uploads', 'rejects', 'items', 'itemmeta', 'salesmaster', 'phasing', 'orders', 'deliveries', 'receivables', 'collections', 'stock', 'backups', 'customers', 'creditnotes'];
var SHARED_COLLECTIONS = ['potential', 'actions', 'followups', 'log', 'planlocks'];
var DB_HEADER = ['collection', 'docId', 'part', 'json', 'updatedAt', 'updatedBy'];

function doGet(e) {
  var email = activeEmail_();
  var boot = { email: email, url: ScriptApp.getService().getUrl(), h: (e && e.parameter && e.parameter.h) || '', owner: false, name: '' };
  try { var who = resolveUser_(email); boot.owner = who.role === 'Super admin'; boot.name = who.name || ''; } catch (err) { boot.err = String(err && err.message || err); }
  var html = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var json = JSON.stringify(boot).replace(/</g, '\\u003c');
  html = html.split('/*@@GAS_BOOT@@*/').join('window.__GAS_BOOT=' + json + ';');
  return HtmlService.createHtmlOutput(html)
    .setTitle('Virgo Laminates Performance Desk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
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

/* ---------- storage ---------- */
function sheetId_(create) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DESK_SHEET_ID');
  if (id) return id;
  if (!create) return null;
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    id = props.getProperty('DESK_SHEET_ID');
    if (!id) {
      var ss = SpreadsheetApp.create('Virgo Desk database (do not edit)');
      var db = ss.getSheets()[0]; db.setName('db');
      db.getRange(1, 1, 1, 6).setValues([DB_HEADER]);
      db.getRange(1, 1, db.getMaxRows(), 4).setNumberFormat('@');
      var meta = ss.insertSheet('meta'); meta.getRange(1, 1, 1, 2).setNumberFormat('@').setValues([['state', '{"revs":{}}']]);
      props.setProperty('DESK_SHEET_ID', ss.getId()); id = ss.getId();
    }
  } finally { lock.releaseLock(); }
  return id;
}
function book_() { return SpreadsheetApp.openById(sheetId_(true)); }
function dbSheet_() { return book_().getSheetByName('db'); }
function readMeta_(ss) {
  var cache = CacheService.getScriptCache(), c = cache.get('desk_meta');
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  var m = readMetaFresh_(ss); cache.put('desk_meta', JSON.stringify(m), 300); return m;
}
function readMetaFresh_(ss) {
  var v = (ss || book_()).getSheetByName('meta').getRange(1, 2).getValue();
  try { var m = JSON.parse(v); if (!m.revs) m.revs = {}; return m; } catch (e) { return { revs: {} }; }
}
function writeMeta_(ss, m) {
  var s = JSON.stringify(m);
  ss.getSheetByName('meta').getRange(1, 2).setValue(s);
  CacheService.getScriptCache().put('desk_meta', s, 300);
}
/* key index: rows of the db sheet as {col, id, part:"i/n/v", row} */
function keyRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var v = sheet.getRange(2, 1, last - 1, 3).getValues(), out = [];
  for (var i = 0; i < v.length; i++) if (v[i][0] !== '') out.push({ col: String(v[i][0]), id: String(v[i][1]), part: String(v[i][2]), row: i + 2 });
  return out;
}
function parsePart_(p) { var a = String(p).split('/'); return { i: +a[0], n: +a[1], v: a[2] || '' }; }
/* group rows of one doc into a complete part list, or null when the doc is mid-write or damaged */
function completeParts_(rows) {
  var best = null, byV = Object.create(null);
  rows.forEach(function (r) { var p = parsePart_(r.part); r.p = p; (byV[p.v] = byV[p.v] || []).push(r); });
  var vs = Object.keys(byV);
  for (var k = 0; k < vs.length; k++) {
    var list = byV[vs[k]], n = list[0].p.n, seen = Object.create(null), ok = true;
    list.forEach(function (r) { if (r.p.n !== n) ok = false; seen[r.p.i] = r; });
    for (var i = 0; i < n; i++) if (!seen[i]) ok = false;
    if (ok && list.length === n) { best = []; for (var j = 0; j < n; j++) best.push(seen[j]); break; }
  }
  return best;
}
function runs_(rowNums) { // sorted ascending -> [[start,len]]
  var out = [];
  rowNums.forEach(function (r) { var l = out[out.length - 1]; if (l && l[0] + l[1] === r) l[1]++; else out.push([r, 1]); });
  return out;
}
function readJson_(sheet, rows) { // rows: [{row}] -> {row: string}
  var res = Object.create(null), nums = rows.map(function (r) { return r.row; }).sort(function (a, b) { return a - b; });
  runs_(nums).forEach(function (r) { var v = sheet.getRange(r[0], 4, r[1], 1).getValues(); for (var i = 0; i < r[1]; i++) res[r[0] + i] = String(v[i][0]); });
  return res;
}
function groupDocs_(rows, col) { // -> {id: [rows]}
  var g = Object.create(null);
  rows.forEach(function (r) { if (r.col === col) (g[r.id] = g[r.id] || []).push(r); });
  return g;
}

/* ---------- access ---------- */
function resolveUser_(email) {
  var out = { email: email, role: null, active: false, name: '', seed: SEED_SUPER.indexOf(email) >= 0 };
  if (!email) return out;
  var ss = sheetId_(false) ? book_() : null, u = null;
  if (ss) {
    var meta = readMeta_(ss), ck = 'acl_' + (meta.revs.users || 0) + '_' + email, cache = CacheService.getScriptCache(), c = cache.get(ck);
    if (c) { try { u = JSON.parse(c).u; } catch (e) {} }
    if (!c) {
      var sheet = ss.getSheetByName('db'), rows = keyRows_(sheet), g = groupDocs_(rows, 'users'), ids = Object.keys(g);
      var all = [];
      ids.forEach(function (id) { var p = completeParts_(g[id]); if (p) all = all.concat(p); });
      var js = readJson_(sheet, all);
      ids.forEach(function (id) {
        var p = completeParts_(g[id]); if (!p) return;
        try { var d = JSON.parse(p.map(function (r) { return js[r.row]; }).join('')); if (String(d.email || '').toLowerCase() === email) u = { role: d.role, active: d.active !== false, name: d.name || '' }; } catch (e) {}
      });
      cache.put(ck, JSON.stringify({ u: u }), 120);
    }
  }
  if (u) { out.role = u.role; out.active = u.active; out.name = u.name; }
  if (out.seed && !(u && u.active === false)) { out.role = 'Super admin'; out.active = true; }
  if (out.seed && u && u.active === false) { out.role = 'Super admin'; out.active = true; } // seed admins cannot be locked out, as in the page
  return out;
}
function requireUser_() {
  var email = activeEmail_();
  if (!email) fail_('unauthenticated', 'Your Google account email is not visible to this web app.');
  return resolveUser_(email);
}
function canWrite_(who, col) {
  if (ADMIN_COLLECTIONS.indexOf(col) >= 0) return who.role === 'Super admin' && who.active;
  if (SHARED_COLLECTIONS.indexOf(col) >= 0) return !!who.role && who.active;
  return false;
}
function knownCol_(col) { return ADMIN_COLLECTIONS.indexOf(col) >= 0 || SHARED_COLLECTIONS.indexOf(col) >= 0; }
function checkId_(id) { if (typeof id !== 'string' || !id || id.length > 300 || id.indexOf('/') >= 0) fail_('invalid_argument', 'Bad document id.'); }
/* a registered, active user reads everything (no row filter, as on claude.ai). An inactive user sees only their own user record; an unknown email sees nothing, so the page shows "Ask your admin for access". */
function readFilter_(who, col, id) {
  if (who.role && who.active) return true;
  return false;
}

/* ---------- API called by the page ---------- */
function deskBoot() {
  return wrap_(function () {
    var email = activeEmail_(), who = resolveUser_(email);
    return { ok: true, email: email, owner: who.role === 'Super admin', name: who.name, url: ScriptApp.getService().getUrl() };
  });
}
function deskRevs() {
  return wrap_(function () {
    requireUser_();
    if (!sheetId_(false)) return { ok: true, revs: {} };
    return { ok: true, revs: readMeta_(book_()).revs };
  });
}
/* one page of a collection, documents in id order; cursor = last docId already returned */
function deskRead(col, cursor) {
  return wrap_(function () {
    var who = requireUser_();
    if (!knownCol_(col)) fail_('invalid_argument', 'Unknown collection.');
    if (!sheetId_(false)) return { ok: true, docs: [], next: null, rev: 0 };
    var ss = book_(), sheet = ss.getSheetByName('db'), rev = readMeta_(ss).revs[col] || 0;
    var g = groupDocs_(keyRows_(sheet), col), ids = Object.keys(g).sort();
    var allowed = readFilter_(who, col);
    if (!allowed) return { ok: true, docs: [], next: null, rev: rev };
    if (cursor) ids = ids.filter(function (id) { return id > cursor; });
    var docs = [], chars = 0, next = null, busy = false;
    for (var i = 0; i < ids.length; i++) {
      var parts = completeParts_(g[ids[i]]);
      if (!parts) { busy = true; continue; }
      if (docs.length && chars >= READ_PAGE_CHARS) { next = docs[docs.length - 1].id; break; }
      var js = readJson_(sheet, parts);
      var json = parts.map(function (r) { return js[r.row]; }).join('');
      docs.push({ id: ids[i], json: json }); chars += json.length;
    }
    if (busy) fail_('unavailable', 'busy');
    return { ok: true, docs: docs, next: next, rev: rev };
  });
}
function deskGetMany(keys) { // keys: ["col/id", ...] -> {docs:[{key,json|null}]}
  return wrap_(function () {
    var who = requireUser_();
    if (!sheetId_(false)) return { ok: true, docs: keys.map(function (k) { return { key: k, json: null }; }) };
    var sheet = dbSheet_(), rows = keyRows_(sheet), idx = Object.create(null);
    rows.forEach(function (r) { (idx[r.col + '/' + r.id] = idx[r.col + '/' + r.id] || []).push(r); });
    var out = [], need = [];
    keys.forEach(function (k) {
      var i = String(k).indexOf('/'), col = k.slice(0, i);
      if (!knownCol_(col)) fail_('invalid_argument', 'Unknown collection.');
      if (!readFilter_(who, col)) { out.push({ key: k, json: null, parts: null }); return; }
      var rs = idx[k]; if (!rs) { out.push({ key: k, json: null, parts: null }); return; }
      var p = completeParts_(rs); if (!p) fail_('unavailable', 'busy');
      out.push({ key: k, parts: p }); need = need.concat(p);
    });
    var js = readJson_(sheet, need);
    return { ok: true, docs: out.map(function (o) { return { key: o.key, json: o.parts ? o.parts.map(function (r) { return js[r.row]; }).join('') : null }; }) };
  });
}
/* ops: [{op:'set', col, id, json}|{op:'delete', col, id}]. All ops are checked before any is applied. */
function deskWrite(ops) {
  return wrap_(function () {
    var who = requireUser_();
    var final = Object.create(null), order = [];
    (ops || []).forEach(function (o) {
      if (!o || (o.op !== 'set' && o.op !== 'delete')) fail_('invalid_argument', 'Bad operation.');
      if (!knownCol_(o.col)) fail_('invalid_argument', 'Unknown collection.');
      checkId_(o.id);
      if (!canWrite_(who, o.col)) fail_('permission_denied', 'Writing to ' + o.col + ' needs ' + (ADMIN_COLLECTIONS.indexOf(o.col) >= 0 ? 'the Super admin role.' : 'an active user.'));
      if (o.op === 'set') {
        if (typeof o.json !== 'string') fail_('invalid_argument', 'Missing document.');
        if (o.json.length > MAX_DOC_CHARS) fail_('invalid_argument', 'Document too large (' + o.json.length + ' characters, limit ' + MAX_DOC_CHARS + ').');
        var d; try { d = JSON.parse(o.json); } catch (e) { fail_('invalid_argument', 'Document is not valid JSON.'); }
        if (!d || typeof d !== 'object' || Array.isArray(d)) fail_('invalid_argument', 'A document must be an object.');
      }
      var k = o.col + '/' + o.id; if (!(k in final)) order.push(k); final[k] = o;
    });
    if (!order.length) return { ok: true, revs: {} };
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try { return applyOps_(who, final, order); } finally { lock.releaseLock(); }
  });
}
function applyOps_(who, final, order) {
  var ss = book_(), sheet = ss.getSheetByName('db'), rows = keyRows_(sheet), idx = Object.create(null);
  rows.forEach(function (r) { (idx[r.col + '/' + r.id] = idx[r.col + '/' + r.id] || []).push(r); });
  var now = new Date().toISOString(), token = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  var updates = Object.create(null), appends = [], dels = [], cols = Object.create(null);
  order.forEach(function (k) {
    var o = final[k], ex = idx[k] || []; cols[o.col] = 1;
    if (o.op === 'delete') { ex.forEach(function (r) { dels.push(r.row); }); return; }
    var n = Math.max(1, Math.ceil(o.json.length / PART_CHARS)), exr = ex.slice().sort(function (a, b) { return a.row - b.row; });
    for (var i = 0; i < n; i++) {
      var vals = [o.col, o.id, i + '/' + n + '/' + token, o.json.slice(i * PART_CHARS, (i + 1) * PART_CHARS), now, who.email];
      if (i < exr.length) updates[exr[i].row] = vals; else appends.push(vals);
    }
    for (var j = n; j < exr.length; j++) dels.push(exr[j].row);
  });
  var rowsSorted = Object.keys(updates).map(Number).sort(function (a, b) { return a - b; });
  // pass 1: new and changed parts, pass 2: removals, so a reader never sees a doc with fewer parts than it should have
  runs_(rowsSorted).forEach(function (r) { var vals = []; for (var i = 0; i < r[1]; i++) vals.push(updates[r[0] + i]); sheet.getRange(r[0], 1, r[1], 6).setValues(vals); });
  if (appends.length) {
    var last = sheet.getLastRow(), need = last + appends.length - sheet.getMaxRows();
    if (need > 0) sheet.insertRowsAfter(sheet.getMaxRows(), need + 500);
    sheet.getRange(last + 1, 1, appends.length, 6).setNumberFormat('@').setValues(appends);
  }
  dels.sort(function (a, b) { return b - a; });
  var asc = dels.slice().sort(function (a, b) { return a - b; }), dr = runs_(asc);
  for (var i = dr.length - 1; i >= 0; i--) sheet.deleteRows(dr[i][0], dr[i][1]);
  var meta = readMetaFresh_(ss), revs = {};
  Object.keys(cols).forEach(function (c) { meta.revs[c] = (meta.revs[c] || 0) + 1; revs[c] = meta.revs[c]; });
  writeMeta_(ss, meta);
  return { ok: true, revs: revs };
}
/* Restore support (Super admin only) */
function deskStats() {
  return wrap_(function () {
    var who = requireUser_();
    if (!(who.role === 'Super admin' && who.active)) fail_('permission_denied', 'Super admin only.');
    if (!sheetId_(false)) return { ok: true, counts: {}, empty: true, seedOnly: true, revs: {} };
    var ss = book_(), sheet = ss.getSheetByName('db'), rows = keyRows_(sheet), seen = Object.create(null), counts = Object.create(null);
    rows.forEach(function (r) { var k = r.col + '/' + r.id; if (!seen[k]) { seen[k] = 1; counts[r.col] = (counts[r.col] || 0) + 1; } });
    var cols = Object.keys(counts), seedOnly = cols.every(function (c) { return c === 'users' || c === 'plants'; });
    if (seedOnly && cols.length) {
      ['users', 'plants'].forEach(function (c) {
        var g = groupDocs_(rows, c), ps = [];
        Object.keys(g).forEach(function (id) { var p = completeParts_(g[id]); if (p) ps = ps.concat(p); else seedOnly = false; });
        var js = readJson_(sheet, ps);
        Object.keys(g).forEach(function (id) { var p = completeParts_(g[id]); if (!p) return; try { if (JSON.parse(p.map(function (r) { return js[r.row]; }).join('')).seed !== true) seedOnly = false; } catch (e) { seedOnly = false; } });
      });
    }
    return { ok: true, counts: Object.assign({}, counts), empty: !cols.length, seedOnly: seedOnly, revs: readMetaFresh_(ss).revs };
  });
}
/* remove every document of the named collections (restore with "replace everything") */
function deskWipe(cols) {
  return wrap_(function () {
    var who = requireUser_();
    if (!(who.role === 'Super admin' && who.active)) fail_('permission_denied', 'Super admin only.');
    (cols || []).forEach(function (c) { if (!knownCol_(c)) fail_('invalid_argument', 'Unknown collection.'); });
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      var ss = book_(), sheet = ss.getSheetByName('db'), rows = keyRows_(sheet), del = [], hit = Object.create(null);
      rows.forEach(function (r) { if (cols.indexOf(r.col) >= 0) { del.push(r.row); hit[r.col] = 1; } });
      var dr = runs_(del.sort(function (a, b) { return a - b; }));
      for (var i = dr.length - 1; i >= 0; i--) sheet.deleteRows(dr[i][0], dr[i][1]);
      var meta = readMetaFresh_(ss); Object.keys(hit).forEach(function (c) { meta.revs[c] = (meta.revs[c] || 0) + 1; });
      writeMeta_(ss, meta);
      return { ok: true, removedRows: del.length };
    } finally { lock.releaseLock(); }
  });
}
/* CRC-32 of one collection, in the same form the backup manifest uses: id + "\n" + json + "\n" per document in id order (Super admin only) */
function deskDigest(col) {
  return wrap_(function () {
    var who = requireUser_();
    if (!(who.role === 'Super admin' && who.active)) fail_('permission_denied', 'Super admin only.');
    if (!knownCol_(col)) fail_('invalid_argument', 'Unknown collection.');
    if (!sheetId_(false)) return { ok: true, docs: 0, crc32: crcHex_(0xFFFFFFFF) };
    var sheet = dbSheet_(), g = groupDocs_(keyRows_(sheet), col), ids = Object.keys(g).sort(), crc = 0xFFFFFFFF, n = 0, tbl = crcTable_();
    var parts = ids.map(function (id) { var p = completeParts_(g[id]); if (!p) fail_('unavailable', 'busy'); return p; });
    var all = []; parts.forEach(function (p) { all = all.concat(p); });
    var js = readJson_(sheet, all);
    ids.forEach(function (id, i) {
      var line = id + '\n' + parts[i].map(function (r) { return js[r.row]; }).join('') + '\n', b = Utilities.newBlob(line).getBytes();
      for (var k = 0; k < b.length; k++) crc = tbl[(crc ^ (b[k] & 255)) & 255] ^ (crc >>> 8);
      n++;
    });
    return { ok: true, docs: n, crc32: crcHex_(crc >>> 0) };
  });
}
function crcTable_() { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; }
function crcHex_(c) { return ('0000000' + ((c ^ 0xFFFFFFFF) >>> 0).toString(16)).slice(-8); }
