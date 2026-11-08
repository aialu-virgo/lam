// In-memory Apps Script environment: loads src/Code.gs.js into a vm with mocks of SpreadsheetApp, LockService, CacheService, PropertiesService, Session, HtmlService, ScriptApp, Utilities.
// Counts getValues calls (rows, cells, characters) so the cost of a read can be measured.
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
/* What the real HtmlService hands back is NOT what was pasted (tenant, 8 Nov 2026: Index came back 31,837 characters shorter; block comments are the suspected cause, unproven).
 * Default mimic: block comments are removed (except the /*@@ ... marker comments, which the real tenant kept: version 11 booted) and trailing whitespace is trimmed.
 * mode 'none' = hand back the text unchanged. */
export function htmlProcess(t, mode = 'strip-comments') {
  if (mode === 'none') return t;
  return t.replace(/\/\*(?!@@)[\s\S]*?\*\//g, '').replace(/\s+$/, '');
}
export function makeEnv(opts = {}) {
  const CELL_LIMIT = 50000, state = { email: opts.email || 'data@virgoasia.com', locks: 0, calls: 0, lockFail: false, failAfterSetValues: null, held: 0, skew: 0, deleteCost: 0, onDelete: null, triggers: [] };
  const stats = { gv: [], sv: 0, byFn: {} };
  const sheets = {}, props = {}, cache = {};
  const drv = opts.drive || { folders: {}, files: {} }; drv.reads = 0; drv.listings = 0; // DriveApp mock: folders { id: [file] }, files { id: file }; file = { id, name, updated (ms), content }
  const mkFile = f => ({ getId() { return f.id; }, getName() { return f.name; }, getLastUpdated() { return new Date(f.updated); }, getBlob() { return { getDataAsString(enc) { if (enc !== 'UTF-8') throw new Error('expected UTF-8'); if (f.readError) throw new Error(f.readError); drv.reads++; return f.content; } }; } });
  const cacheStats = { puts: 0, gets: 0, maxBytes: 0 };
  function mkSheet(name) {
    const s = { name, rows: [], maxRows: 1000, maxCols: 26 };
    s.api = {
      setName(n) { delete sheets[s.name]; s.name = n; sheets[n] = s; return s.api; },
      getRange(r, c, nr = 1, nc = 1) {
        if (typeof r === 'string') return { setNumberFormat() { return this; } };
        const rg = {
          setValues(v) {
            if (r + nr - 1 > s.maxRows) throw new Error('Range exceeds grid limits');
            if (state.failAfterSetValues !== null) { if (state.failAfterSetValues-- <= 0) throw new Error('Service unavailable: injected failure'); }
            stats.sv++;
            v.forEach((row, i) => row.forEach((x, j) => { if (String(x).length > CELL_LIMIT) throw new Error('Cell over 50000 chars'); (s.rows[r - 1 + i] = s.rows[r - 1 + i] || [])[c - 1 + j] = x; })); return rg;
          },
          setValue(x) { return rg.setValues([[x]]); },
          getValues() {
            const out = []; let ch = 0;
            for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const x = (s.rows[r - 1 + i] || [])[c - 1 + j]; row.push(x === undefined ? '' : x); if (typeof x === 'string') ch += x.length; } out.push(row); }
            stats.gv.push({ sheet: s.name, rows: nr, cells: nr * nc, chars: ch }); return out;
          },
          getValue() { return rg.getValues()[0][0]; },
          setNumberFormat() { return rg; },
        };
        return rg;
      },
      getLastRow() { return s.rows.length; },
      getMaxRows() { return s.maxRows; },
      getMaxColumns() { return s.maxCols; },
      deleteColumns(from, n) { s.maxCols -= n; },
      insertRowsAfter(after, n) { s.maxRows += n; },
      deleteRows(start, n) { state.skew += state.deleteCost; if (state.onDelete) state.onDelete(); if (state.failDeleteRows) throw new Error('Service unavailable: injected delete failure'); s.rows.splice(start - 1, n); },
    };
    sheets[name] = s; return s.api;
  }
  const ss = { first: null, getSheets() { return [ss.first]; }, getSheetByName(n) { return sheets[n] ? sheets[n].api : null; }, insertSheet(n) { return mkSheet(n); }, getId() { return 'SHEET1'; } };
  const ctx = {
    console, Math, Date: class extends Date { static now() { return Date.now() + state.skew; } }, JSON, Object, Array, String, Number, Error,
    SpreadsheetApp: { create() { ss.first = mkSheet('Sheet1'); return ss; }, openById(id) { if (id !== 'SHEET1') throw new Error('no such sheet'); return ss; } },
    LockService: { getScriptLock() { return { waitLock() { if (state.held > 0) throw new Error('Lock re-entered: the script lock is already held by this execution'); state.locks++; if (state.lockFail) throw new Error('Could not obtain lock after 30000 ms'); state.held++; }, releaseLock() { if (state.held > 0) state.held--; } }; } },
    CacheService: { getScriptCache() { return { get(k) { cacheStats.gets++; if (opts.cacheFail) throw new Error('cache unavailable'); return k in cache ? cache[k] : null; }, put(k, v) { cacheStats.puts++; const b = Buffer.byteLength(String(v), 'utf8'); if (b > 102400) throw new Error('Argument too large: value'); cacheStats.maxBytes = Math.max(cacheStats.maxBytes, b); if (opts.cacheFail) throw new Error('cache unavailable'); cache[k] = v; }, getAll(ks) { state.cacheGetAll = (state.cacheGetAll || 0) + 1; if (ks.length > 100) throw new Error('getAll: at most 100 keys'); if (opts.cacheFail) throw new Error('cache unavailable'); const o = {}; ks.forEach(k => { if (k in cache) o[k] = cache[k]; }); return o; }, putAll(o) { state.cachePutAll = (state.cachePutAll || 0) + 1; if (Object.keys(o).length > 100) throw new Error('putAll: at most 100 keys'); if (opts.cacheFail) throw new Error('cache unavailable'); Object.keys(o).forEach(k => { if (Buffer.byteLength(String(o[k]), 'utf8') > 102400) throw new Error('Argument too large: value'); cache[k] = o[k]; }); } }; } },
    DriveApp: { getFolderById(id) { const l = drv.folders[id]; if (!l) throw new Error('No item with the given ID could be found. Possibly it has been deleted.'); return { getFiles() { drv.listings++; let i = 0; const a = l.map(mkFile); return { hasNext() { return i < a.length; }, next() { return a[i++]; } }; } }; },
      getFileById(id) { const f = (drv.files || {})[id] || Object.values(drv.folders).flat().find(x => x.id === id); if (!f) throw new Error('No item with the given ID could be found.'); return mkFile(f); } },
    PropertiesService: { getScriptProperties() { return { getProperty(k) { return k in props ? props[k] : null; }, setProperty(k, v) { if (String(v).length > 9216) throw new Error('Property value too large'); props[k] = String(v); }, deleteProperty(k) { delete props[k]; } }; } },
    Session: { getActiveUser() { return { getEmail() { return state.email; } }; }, getEffectiveUser() { return { getEmail() { return state.effective || 'data@virgoasia.com'; } }; } },
    ScriptApp: { getService() { return { getUrl() { return 'https://script.google.com/a/macros/virgoasia.com/s/XYZ/exec'; } }; },
      getProjectTriggers() { return state.triggers.slice(); }, deleteTrigger(t) { state.triggers = state.triggers.filter(x => x !== t); },
      newTrigger(fn) { const t = { fn, kind: null, getHandlerFunction() { return fn; } }; const b = { timeBased() { return b; }, everyDays(n) { t.kind = 'daily'; t.days = n; return b; }, atHour(h) { t.hour = h; return b; }, nearMinute(m) { t.minute = m; return b; }, after(ms) { t.kind = 'after'; t.ms = ms; return b; }, create() { state.triggers.push(t); return t; } }; return b; } },
    Utilities: { sleep() { state.sleeps = (state.sleeps || 0) + 1; }, base64Encode(x) { return Buffer.from(typeof x === 'string' ? x : Buffer.from(x)).toString('base64'); }, base64Decode(s) { return Array.from(Buffer.from(s, 'base64')); },
      newBlob(d) { const buf = typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d); return { getBytes() { return Array.from(buf); }, getDataAsString() { return buf.toString('utf8'); } }; },
      gzip(b) { const z = zlib.gzipSync(Buffer.from(b.getBytes())); return { getBytes() { return Array.from(z); } }; }, ungzip(b) { const z = zlib.gunzipSync(Buffer.from(b.getBytes())); return { getDataAsString() { return z.toString('utf8'); } }; } },
    Logger: { log(m) { (state.logs = state.logs || []).push(String(m)); } },
    UrlFetchApp: { fetch(url, o) { if (!opts.fetch) throw new Error('UrlFetchApp is not available in this test'); const r = opts.fetch(url, o, state); return { getResponseCode() { return r.code; }, getContentText() { return r.body; }, getHeaders() { return r.headers || {}; } }; },
      /* like the real one: all requests go out together (virtual time advances by the slowest), and an exception in any request fails the whole call */
      fetchAll(reqs) { if (!opts.fetch) throw new Error('UrlFetchApp is not available in this test'); state.fetchAllCalls = (state.fetchAllCalls || 0) + 1; state.fetchAllMax = Math.max(state.fetchAllMax || 0, reqs.length); const base = state.skew; let mx = 0;
        const out = reqs.map(q => { state.skew = base; const r = opts.fetch(q.url, q, state); mx = Math.max(mx, state.skew - base); return { getResponseCode() { return r.code; }, getContentText() { return r.body; }, getHeaders() { return r.headers || {}; } }; }); state.skew = base + mx; return out; } },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT' },
      createHtmlOutputFromFile(name) { return { getContent() { // opts.htmlFiles = { Index: text, Index2: text ... } overrides the built parts; a missing name throws like Apps Script
        let t;
        if (opts.htmlFiles) { if (!(name in opts.htmlFiles)) throw new Error('Unknown file: ' + name); t = opts.htmlFiles[name]; }
        else { const f = path.join(here, '../out/Desk-' + name + '.txt'); if (!fs.existsSync(f)) throw new Error('Unknown file: ' + name); t = fs.readFileSync(f, 'utf8'); }
        return htmlProcess(t, opts.htmlProcess); } }; },
      createHtmlOutput(h) { const o = { html: h, title: null, meta: [], setTitle(t) { o.title = t; return o; }, addMetaTag(a, b) { o.meta.push([a, b]); return o; }, setXFrameOptionsMode() { return o; } }; return o; },
    },
  };
  vm.createContext(ctx);
  // the built Code.gs (page manifest filled in by build-gas.mjs) joined with sap.gs, exactly as pasted into the editor; opts.sapFile / SAP_GS_FILE swaps in another sap.gs (the released reader, for comparison tests)
  const sapAlt = opts.sapFile || process.env.SAP_GS_FILE;
  if (sapAlt) { vm.runInContext(fs.readFileSync(path.join(here, '../src/Code.gs.js'), 'utf8'), ctx, { filename: 'Code.gs' }); vm.runInContext(fs.readFileSync(sapAlt, 'utf8'), ctx, { filename: 'sap.gs' }); }
  else vm.runInContext(fs.readFileSync(opts.codeFile || path.join(here, '../out/Desk-Code.gs.txt'), 'utf8'), ctx, { filename: 'Code.gs' });
  function storedAll() { // {col/id: json} using the same rule as the server: newest token with all parts
    const out = {};
    Object.keys(sheets).filter(n => n.startsWith('c_')).forEach(n => {
      const col = n.slice(2), byId = {};
      sheets[n].rows.slice(1).forEach(r => { if (!r || r[0] === undefined || r[0] === '') return; const [i, nn, t] = String(r[1]).split('/'); ((byId[r[0]] = byId[r[0]] || {})[t] = byId[r[0]][t] || { n: +nn, p: {} }).p[+i] = r[3]; });
      Object.keys(byId).forEach(id => { const toks = Object.keys(byId[id]).sort().reverse(); for (const t of toks) { const g = byId[id][t]; if (Object.keys(g.p).length === g.n) { out[col + '/' + id] = Array.from({ length: g.n }, (_, k) => g.p[k]).join(''); break; } } });
    });
    return out;
  }
  return { ctx, state, sheets, stats, props, drive: drv, cacheStats, cacheKeys() { return Object.keys(cache); }, clearCache() { Object.keys(cache).forEach(k => delete cache[k]); }, setEmail(e) { state.email = e; }, stored: storedAll,
    callRaw(fn, args = []) { state.calls++; return JSON.parse(JSON.stringify(ctx[fn](...args))); },
    call(fn, args = []) { state.calls++; stats.byFn[fn] = (stats.byFn[fn] || 0) + 1; const r = JSON.parse(JSON.stringify(ctx[fn](...args)));
      /* deskWrite answers per operation; for convenience r.ok / r.code summarise the batch (ok only if every operation was applied), r.results keeps the detail */
      if (fn === 'deskWrite' && r.ok && Array.isArray(r.results)) { const bad = r.results.find(x => x && x.ok === false); if (bad) { r.callOk = true; r.ok = false; r.code = bad.code; r.message = bad.message; } }
      return r; },
    rawRows(col) { return sheets['c_' + col] ? sheets['c_' + col].rows : []; } };
}
