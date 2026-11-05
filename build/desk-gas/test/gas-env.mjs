// In-memory Apps Script environment: loads src/Code.gs.js into a vm with mocks of SpreadsheetApp, LockService, CacheService, PropertiesService, Session, HtmlService, ScriptApp, Utilities.
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
export function makeEnv(opts = {}) {
  const MAXROWS0 = 1000, CELL_LIMIT = 50000, state = { email: opts.email || 'data@virgoasia.com', locks: 0, calls: 0 };
  const sheets = {}, props = {}, cache = {};
  function mkSheet(name) {
    const s = { name, rows: [], maxRows: MAXROWS0 };
    s.api = {
      setName(n) { delete sheets[s.name]; s.name = n; sheets[n] = s; return s.api; },
      getRange(r, c, nr = 1, nc = 1) {
        const rg = {
          setValues(v) { if (r + nr - 1 > s.maxRows) throw new Error('Range exceeds grid limits'); v.forEach((row, i) => row.forEach((x, j) => { if (String(x).length > CELL_LIMIT) throw new Error('Cell over 50000 chars'); (s.rows[r - 1 + i] = s.rows[r - 1 + i] || [])[c - 1 + j] = x; })); return rg; },
          setValue(x) { return rg.setValues([[x]]); },
          getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const x = (s.rows[r - 1 + i] || [])[c - 1 + j]; row.push(x === undefined ? '' : x); } out.push(row); } return out; },
          getValue() { return rg.getValues()[0][0]; },
          setNumberFormat() { return rg; },
        };
        return rg;
      },
      getLastRow() { let l = 0; s.rows.forEach((row, i) => { if (row && row.some(x => x !== undefined && x !== '')) l = i + 1; }); return l; },
      getMaxRows() { return s.maxRows; },
      insertRowsAfter(after, n) { s.maxRows += n; },
      deleteRows(start, n) { s.rows.splice(start - 1, n); s.maxRows -= 0; },
    };
    sheets[name] = s; return s.api;
  }
  const ss = { id: 'SHEET1', sheetsList: [], getSheets() { return [ss.first]; }, getSheetByName(n) { return sheets[n] ? sheets[n].api : null; }, insertSheet(n) { return mkSheet(n); }, getId() { return ss.id; } };
  const ctx = {
    console,
    SpreadsheetApp: { create() { ss.first = mkSheet('Sheet1'); return ss; }, openById(id) { if (id !== ss.id) throw new Error('no such sheet'); return ss; } },
    LockService: { getScriptLock() { return { waitLock() { state.locks++; if (state.lockFail) throw new Error('Could not obtain lock after 30000 ms'); }, releaseLock() {} }; } },
    CacheService: { getScriptCache() { return { get(k) { return k in cache ? cache[k] : null; }, put(k, v) { cache[k] = v; } }; } },
    PropertiesService: { getScriptProperties() { return { getProperty(k) { return k in props ? props[k] : null; }, setProperty(k, v) { props[k] = v; } }; } },
    Session: { getActiveUser() { return { getEmail() { return state.email; } }; } },
    ScriptApp: { getService() { return { getUrl() { return 'https://script.google.com/a/macros/virgoasia.com/s/XYZ/exec'; } }; } },
    Utilities: { newBlob(str) { return { getBytes() { return Array.from(Buffer.from(str, 'utf8')).map(b => (b > 127 ? b - 256 : b)); } }; } },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT' },
      createHtmlOutputFromFile(n) { return { getContent() { return fs.readFileSync(opts.indexFile || path.join(here, '../out/Desk-Index.txt'), 'utf8'); } }; },
      createHtmlOutput(h) { const o = { html: h, title: null, meta: [], setTitle(t) { o.title = t; return o; }, addMetaTag(a, b) { o.meta.push([a, b]); return o; }, setXFrameOptionsMode() { return o; } }; return o; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(here, '../src/Code.gs.js'), 'utf8'), ctx, { filename: 'Code.gs' });
  return { ctx, state, sheets, setEmail(e) { state.email = e; }, call(fn, args = []) { state.calls++; return JSON.parse(JSON.stringify(ctx[fn](...args))); }, stored() { // {col/id: json}
      const db = sheets.db; const out = {}; if (!db) return out; const parts = {};
      db.rows.slice(1).forEach(r => { if (!r || r[0] === undefined || r[0] === '') return; const k = r[0] + '/' + r[1]; (parts[k] = parts[k] || []).push(r); });
      Object.keys(parts).forEach(k => { const ps = parts[k].map(r => ({ i: +String(r[2]).split('/')[0], j: r[3] })).sort((a, b) => a.i - b.i); out[k] = ps.map(p => p.j).join(''); }); return out; } };
}
