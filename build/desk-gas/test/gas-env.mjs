// In-memory Apps Script environment: loads src/Code.gs.js into a vm with mocks of SpreadsheetApp, LockService, CacheService, PropertiesService, Session, HtmlService, ScriptApp, Utilities.
// Counts getValues calls (rows, cells, characters) so the cost of a read can be measured.
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
export function makeEnv(opts = {}) {
  const CELL_LIMIT = 50000, state = { email: opts.email || 'data@virgoasia.com', locks: 0, calls: 0, lockFail: false, failAfterSetValues: null };
  const stats = { gv: [], sv: 0, byFn: {} };
  const sheets = {}, props = {}, cache = {};
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
      deleteRows(start, n) { if (state.failDeleteRows) throw new Error('Service unavailable: injected delete failure'); s.rows.splice(start - 1, n); },
    };
    sheets[name] = s; return s.api;
  }
  const ss = { first: null, getSheets() { return [ss.first]; }, getSheetByName(n) { return sheets[n] ? sheets[n].api : null; }, insertSheet(n) { return mkSheet(n); }, getId() { return 'SHEET1'; } };
  const ctx = {
    console, Math, Date, JSON, Object, Array, String, Number, Error,
    SpreadsheetApp: { create() { ss.first = mkSheet('Sheet1'); return ss; }, openById(id) { if (id !== 'SHEET1') throw new Error('no such sheet'); return ss; } },
    LockService: { getScriptLock() { return { waitLock() { state.locks++; if (state.lockFail) throw new Error('Could not obtain lock after 30000 ms'); }, releaseLock() {} }; } },
    CacheService: { getScriptCache() { return { get(k) { return k in cache ? cache[k] : null; }, put(k, v) { cache[k] = v; } }; } },
    PropertiesService: { getScriptProperties() { return { getProperty(k) { return k in props ? props[k] : null; }, setProperty(k, v) { if (String(v).length > 9216) throw new Error('Property value too large'); props[k] = v; } }; } },
    Session: { getActiveUser() { return { getEmail() { return state.email; } }; } },
    ScriptApp: { getService() { return { getUrl() { return 'https://script.google.com/a/macros/virgoasia.com/s/XYZ/exec'; } }; } },
    Utilities: { sleep() {} },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT' },
      createHtmlOutputFromFile() { return { getContent() { return fs.readFileSync(opts.indexFile || path.join(here, '../out/Desk-Index.txt'), 'utf8'); } }; },
      createHtmlOutput(h) { const o = { html: h, title: null, meta: [], setTitle(t) { o.title = t; return o; }, addMetaTag(a, b) { o.meta.push([a, b]); return o; }, setXFrameOptionsMode() { return o; } }; return o; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(here, '../src/Code.gs.js'), 'utf8'), ctx, { filename: 'Code.gs' });
  function storedAll() { // {col/id: json} using the same rule as the server: newest token with all parts
    const out = {};
    Object.keys(sheets).filter(n => n.startsWith('c_')).forEach(n => {
      const col = n.slice(2), byId = {};
      sheets[n].rows.slice(1).forEach(r => { if (!r || r[0] === undefined || r[0] === '') return; const [i, nn, t] = String(r[1]).split('/'); ((byId[r[0]] = byId[r[0]] || {})[t] = byId[r[0]][t] || { n: +nn, p: {} }).p[+i] = r[3]; });
      Object.keys(byId).forEach(id => { const toks = Object.keys(byId[id]).sort().reverse(); for (const t of toks) { const g = byId[id][t]; if (Object.keys(g.p).length === g.n) { out[col + '/' + id] = Array.from({ length: g.n }, (_, k) => g.p[k]).join(''); break; } } });
    });
    return out;
  }
  return { ctx, state, sheets, stats, props, setEmail(e) { state.email = e; }, stored: storedAll,
    call(fn, args = []) { state.calls++; stats.byFn[fn] = (stats.byFn[fn] || 0) + 1; return JSON.parse(JSON.stringify(ctx[fn](...args))); },
    rawRows(col) { return sheets['c_' + col] ? sheets['c_' + col].rows : []; } };
}
