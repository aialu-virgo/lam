/* Virgo Laminates Performance Desk: read-only SAP S/4HANA sales feed (D73). Part of Code.gs (build-gas.mjs joins this file after Code.gs.js).
 * Mapping, filters, incremental rule, paging and the day-one checklist: data-map/s4-odata-feed.md (every SAP name below is a candidate until sapVerifyMetadata says ok).
 *
 * WHAT IT DOES
 *   The server only READS (HTTP GET, HTTP Basic over HTTPS, UrlFetchApp, muteHttpExceptions) billing documents dated on or after SAP_FEED_FROM and STAGES the rows in the
 *   admin-only collection "sapstage", in the column layout of the S/4 Sales Register export. It computes no figures. The page turns the staged rows into cells when a Super admin
 *   clicks "Load SAP feed" (Data Intake > SAP S/4HANA live feed): the rows go through the page's own register intake (same mapping, same replace-a-plant-month), so the stored cells,
 *   inv chunks and upload entry are made by the same code as a file upload.
 * SETTINGS (Script Properties only; never in code, the sheet, the backup, a log or the page):
 *   SAP_BASE_URL (https host, e.g. https://tenant-api.s4hana.cloud.sap), SAP_USER, SAP_PASSWORD, SAP_COMPANY_CODE (default SAP_DEFAULT_COMPANY), CANCEL_MODE (exclude | mirror, default exclude).
 * STATE (Script Properties): SAP_STATUS (what the card shows), SAP_CURSOR (resume point of a sync cut at the time limit), SAP_CURSOR_SHADOW (the same for a shadow run), SAP_OPT_SKIP (optional names left out), SAP_WM (watermark), SAP_RUN (run flag), SAP_SHADOW (last shadow result).
 * ACCESS: every function below is refused unless the caller is the project owner or an active Super admin. The time trigger runs sapSyncTrigger_ / sapContinueTrigger_ as the owner.
 * LOCKS: the script lock is taken here only for (a) the short run-flag test-and-set and (b) the staging write section, exactly as deskWrite does; never while it is held, never across a SAP call. */
var SAP_FEED_FROM = '2026-10-01';        // billing documents dated before this are never read or written (data to 30 Sep 2026 stays as uploaded)
var SAP_DEFAULT_COMPANY = '1000';        // Assumed laminates company code; replaced by the SAP_COMPANY_CODE property
var SAP_SVC = { billing: 'API_BILLING_DOCUMENT_SRV', product: 'API_PRODUCT_SRV', partner: 'API_BUSINESS_PARTNER' };
var SAP_ROOT = '/sap/opu/odata/sap/';
var SAP_SALES_TYPES = ['F2'];
var SAP_CN_TYPES = ['G2', 'RE'];
var SAP_CANCEL_TYPES = ['S1', 'S2'];     // S1 cancels an invoice, S2 cancels a credit memo
var SAP_SHEET_UNITS = ['PC', 'ST'];      // unit of a sheet; any other unit is flagged and not staged
var SAP_PLANT_LAST = 1049;               // plants from 1050 up are ACP and skipped, as the register intake does
var SAP_PAGE_TOP = 200;
var SAP_LOOKUP_BATCH = 20;
var SAP_BUDGET_MS = 300000;              // stop reading after 5 minutes; Apps Script ends a run at 6
var SAP_RUN_STALE_MS = 480000;           // a run flag older than this belongs to a crashed run
var SAP_CHUNK_ROWS = 2500;
var SAP_RETRIES = 3;
var SAP_STAGE_COLS = ['Invoice Document Number', 'Invoice Document item', 'Invoice Date', 'Plant', 'Sold-to-Party Number', 'Sold-to-Party Description', 'Product Code', 'Invoice Qty', 'Total Amount (Item)', 'Billing Type', 'Product Type', 'Material Group 3', 'Material Group 4', 'Sales District', 'Reference Document', 'Sales Executive'];
/* Billing read shape (mapping 1.1): A = header A_BillingDocument with $expand=to_Item; B = item set A_BillingDocumentItem carrying the header fields (how the group's existing connector reads).
 * SAP_BILLING_SHAPE (Script Property) forces one; otherwise sapVerifyMetadata picks B only when A is incomplete and B is complete (saved as SAP_SHAPE); default A. */
var SAP_ITEM_FIELDS = ['BillingDocument', 'BillingDocumentItem', 'Plant', 'Material', 'BillingQuantity', 'BillingQuantityUnit', 'NetAmount', 'TransactionCurrency', 'AdditionalMaterialGroup3', 'AdditionalMaterialGroup4', 'ReferenceSDDocument'];
var SAP_HDR_FIELDS = ['BillingDocumentType', 'BillingDocumentDate', 'CompanyCode', 'SoldToParty', 'BillingDocumentIsCancelled', 'CancelledBillingDocument', 'LastChangeDate'];
/* OPTIONAL marks (opt): a property that net sales, sheets and sq ft do not need. If sapVerifyMetadata finds an optional property missing on the tenant (GAP) it is left out of every later read
 * (list kept in the Script Property SAP_OPT_SKIP) and the run goes on with a warning. A required property that is a GAP blocks the shadow run and the sync, with a message naming it.
 * Marked optional: ReferenceSDDocument (staged column "Reference Document": a link to the order, not used for any figure) and CustomerName (staged column "Sold-to-Party Description": a label only).
 * Sales District was dropped (D77): the tenant has no such property on the billing item; the staged column stays and is blank; district and geography come from the customer master later (D78). */
var SAP_META_B = [{ svc: 'billing', set: 'A_BillingDocumentItem', nav: [], props: SAP_ITEM_FIELDS.concat(SAP_HDR_FIELDS), opt: ['ReferenceSDDocument'] }];
var SAP_META = [
  { svc: 'billing', set: 'A_BillingDocument', nav: ['to_Item'], props: ['BillingDocument', 'BillingDocumentType', 'BillingDocumentDate', 'CompanyCode', 'SoldToParty', 'BillingDocumentIsCancelled', 'CancelledBillingDocument', 'LastChangeDate', 'TransactionCurrency'] },
  { svc: 'billing', set: 'A_BillingDocumentItem', nav: [], props: ['BillingDocument', 'BillingDocumentItem', 'Plant', 'Material', 'BillingQuantity', 'BillingQuantityUnit', 'NetAmount', 'TransactionCurrency', 'AdditionalMaterialGroup3', 'AdditionalMaterialGroup4', 'ReferenceSDDocument'], opt: ['ReferenceSDDocument'] },
  { svc: 'product', set: 'A_Product', nav: [], props: ['Product', 'ProductType'] },
  { svc: 'partner', set: 'A_Customer', nav: [], props: ['Customer', 'CustomerName'], opt: ['CustomerName'] }];

/* ---------- access and settings ---------- */
function sapAuth_() {
  var email = activeEmail_(), eff = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!email) fail_('unauthenticated', 'Your Google account email is not visible to this web app.');
  if (email === eff || isAdmin_(resolveUser_(email))) return email;
  fail_('permission_denied', 'Only the project owner or a Super admin may use the SAP feed.');
}
function sapProps_() { return PropertiesService.getScriptProperties(); }
function sapGetJson_(key, dflt) { var v = sapProps_().getProperty(key); if (!v) return dflt; try { return JSON.parse(v); } catch (e) { return dflt; } }
function sapSetJson_(key, o) { var s = JSON.stringify(o); if (s.length > 9000) fail_('unavailable', 'Feed state too large (' + key + ').'); sapProps_().setProperty(key, s); }
/* the settings, or a clear error naming the missing ones; nothing is sent to SAP before this passes */
function sapCfg_() {
  var p = sapProps_(), miss = [];
  ['SAP_BASE_URL', 'SAP_USER', 'SAP_PASSWORD'].forEach(function (k) { if (!String(p.getProperty(k) || '').trim()) miss.push(k); });
  if (miss.length) fail_('sap_not_configured', 'The SAP connection is not set up. Missing Script Properties: ' + miss.join(', ') + '. Nothing was read and nothing was changed.');
  var base = String(p.getProperty('SAP_BASE_URL')).trim().replace(/\/+$/, '').replace(/\/sap\/opu\/odata\/sap$/i, '');
  if (!/^https:\/\/[A-Za-z0-9.\-]+(:\d+)?$/.test(base)) fail_('sap_not_configured', 'SAP_BASE_URL must be an https address such as https://tenant-api.s4hana.cloud.sap (no path). Nothing was read.');
  var company = String(p.getProperty('SAP_COMPANY_CODE') || '').trim() || SAP_DEFAULT_COMPANY;
  if (!/^[A-Za-z0-9]{1,4}$/.test(company)) fail_('sap_not_configured', 'SAP_COMPANY_CODE must be 1 to 4 letters or digits. Nothing was read.');
  var cancel = String(p.getProperty('CANCEL_MODE') || '').trim().toLowerCase() || 'exclude';
  if (cancel !== 'exclude' && cancel !== 'mirror') fail_('sap_not_configured', 'CANCEL_MODE must be exclude or mirror. Nothing was read.');
  var user = String(p.getProperty('SAP_USER')), pass = String(p.getProperty('SAP_PASSWORD'));
  var shape = String(p.getProperty('SAP_BILLING_SHAPE') || p.getProperty('SAP_SHAPE') || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A';
  return { base: base, company: company, cancel: cancel, shape: shape, auth: 'Basic ' + Utilities.base64Encode(user + ':' + pass), skip: sapGetJson_('SAP_OPT_SKIP', []), secrets: [user, pass, p.getProperty('SAP_BASE_URL')] };
}
function sapSkipped_(cfg, set, prop) { return !!(cfg && cfg.skip && cfg.skip.indexOf(set + '.' + prop) >= 0); }
function sapRedact_(cfg, s) {
  s = String(s == null ? '' : s);
  (cfg && cfg.secrets || []).forEach(function (x) { x = String(x || ''); if (x.length >= 3) s = s.split(x).join('***'); });
  return s.replace(/Basic [A-Za-z0-9+\/=]{8,}/g, 'Basic ***').replace(/\s+/g, ' ').slice(0, 220);
}

/* ---------- HTTP (GET only) ---------- */
function sapQs_(params) {
  var out = [];
  Object.keys(params || {}).forEach(function (k) { out.push(k + '=' + encodeURIComponent(String(params[k]))); });
  return out.join('&');
}
/* returns {code, text}; retries timeouts, 408, 429 and 5xx with growing waits; never retries 401, 403, 404; a failed read raises a coded error and the caller writes nothing */
function sapHttp_(cfg, service, path, params, accept) {
  var url = cfg.base + SAP_ROOT + service + '/' + path + (params && Object.keys(params).length ? '?' + sapQs_(params) : '');
  var opts = { method: 'get', muteHttpExceptions: true, headers: { Authorization: cfg.auth, Accept: accept || 'application/json' } };
  var resp = null, code = 0, text = '', lastErr = '';
  for (var a = 0; a <= SAP_RETRIES; a++) {
    try { resp = UrlFetchApp.fetch(url, opts); code = resp.getResponseCode(); text = String(resp.getContentText() || ''); lastErr = ''; }
    catch (e) { code = 0; text = ''; lastErr = sapRedact_(cfg, e && e.message || e); }
    if ((code === 0 || code === 408 || code === 429 || code >= 500) && a < SAP_RETRIES) { Utilities.sleep(1000 * Math.pow(2, a)); continue; }
    break;
  }
  if (code === 200) return { code: code, text: text };
  var detail = '';
  try { var j = JSON.parse(text); var m = j && j.error && j.error.message; detail = typeof m === 'string' ? m : (m && m.value) || ''; } catch (e) { detail = ''; }
  detail = sapRedact_(cfg, detail);
  var ipNote = ' If the address and user are right, SAP may only accept calls from allow-listed IP addresses. Apps Script calls come from Google addresses that are not fixed, so ask the SAP team whether an IP allow-list is in force (open question Q31).';
  if (code === 0) fail_('sap_unreachable', 'SAP could not be reached (' + (lastErr || 'no answer') + '). Check SAP_BASE_URL.' + ipNote + ' Nothing was changed.');
  if (code === 401) fail_('sap_auth', 'SAP refused the user name or password (HTTP 401). Check SAP_USER and SAP_PASSWORD. Nothing was changed.');
  if (code === 403) fail_('sap_forbidden', 'The SAP user is not allowed to read this service (HTTP 403)' + (detail ? ': ' + detail : '') + '. The user may lack the read role for this service, or an IP allow-list may be blocking the call.' + ipNote + ' Nothing was changed.');
  if (code === 404) fail_('sap_not_found', 'SAP does not know this service or entity (HTTP 404) in ' + service + '.' + (detail ? ' ' + detail : '') + ' Run sapVerifyMetadata. Nothing was changed.');
  fail_('sap_error', 'SAP answered HTTP ' + code + (detail ? ': ' + detail : '') + '. Nothing was changed.');
}
function sapJson_(cfg, r) {
  var o; try { o = JSON.parse(r.text); } catch (e) { fail_('sap_error', 'SAP sent an answer that is not JSON. Nothing was changed.'); }
  var d = o && o.d; if (!d) fail_('sap_error', 'SAP sent an answer without data. Nothing was changed.');
  var res = Array.isArray(d.results) ? d.results : Array.isArray(d) ? d : [d];
  return { results: res, count: d.__count !== undefined ? +d.__count : null, next: d.__next || null, d: d };
}

/* ---------- small helpers ---------- */
function sapDate_(v) {
  if (v == null || v === '') return '';
  var s = String(v), m = /\/Date\((-?\d+)/.exec(s);
  if (m) return new Date(+m[1]).toISOString().slice(0, 10);      // the UTC date, never shifted to IST
  return /^\d{4}-\d\d-\d\d/.test(s) ? s.slice(0, 10) : '';
}
function sapTrim0_(v) { var s = String(v == null ? '' : v).trim(); var t = s.replace(/^0+/, ''); return t === '' && s !== '' ? '0' : t; }
function sapNum_(v) { if (typeof v === 'number') return isFinite(v) ? v : NaN; var s = String(v == null ? '' : v).replace(/,/g, '').trim(); if (s === '') return NaN; var n = Number(s); return isFinite(n) ? n : NaN; }
function sapIstToday_() { return new Date(Date.now() + 19800000).toISOString().slice(0, 10); }
function sapYm_(iso) { return String(iso).slice(0, 7); }
function sapNextYm_(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + '-' + (m < 10 ? '0' : '') + m; }
function sapPrevYm_(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1; if (m < 1) { m = 12; y--; } return y + '-' + (m < 10 ? '0' : '') + m; }
function sapYmRange_(a, b) { var out = []; while (a <= b && out.length < 36) { out.push(a); a = sapNextYm_(a); } return out; }
function sapQuarterOf_(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7), fy = m >= 4 ? y + 1 : y, q = Math.floor(((m - 4 + 12) % 12) / 3) + 1; return 'FY' + ('0' + (fy % 100)).slice(-2) + '-Q' + q; }
function sapDtLit_(iso) { return "datetime'" + iso + "T00:00:00'"; }
function sapQ_(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function sapAddDays_(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function sapBool_(v) { return v === true || v === 'X' || v === 'true' || v === 'TRUE'; }

/* ---------- status shown on the Data Intake card (no credentials, no addresses) ---------- */
function sapStatusGet_() { return sapGetJson_('SAP_STATUS', {}); }
function sapStatusPatch_(patch) { var s = sapStatusGet_(); Object.keys(patch).forEach(function (k) { s[k] = patch[k]; }); sapSetJson_('SAP_STATUS', s); return s; }
function sapErrPush_(cfg, msg) {
  var s = sapStatusGet_(), e = s.errors || [];
  e.unshift({ at: new Date(Date.now()).toISOString(), msg: sapRedact_(cfg, msg).slice(0, 200) });
  sapStatusPatch_({ errors: e.slice(0, 3) });
}
function sapMissing_() { var p = sapProps_(), m = []; ['SAP_BASE_URL', 'SAP_USER', 'SAP_PASSWORD'].forEach(function (k) { if (!String(p.getProperty(k) || '').trim()) m.push(k); }); return m; }
function sapTriggerOn_() { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sapSyncTrigger_'; }); }
function sapNext_(s, missing, trig) {
  if (missing.length) return 'Set ' + missing.join(', ') + ' in the Apps Script project (Project Settings, Script properties). Then run sapVerifyMetadata.';
  if (s.resume) return 'The last run stopped at the 6-minute limit. Run sapSync again (the daily trigger also continues it).';
  if (!s.verify || !s.verify.ok) return s.verify && s.verify.failed ? 'The last sapVerifyMetadata did not finish. Run it again.' : s.verify ? 'SAP lacks ' + s.verify.gaps + ' required name(s) (' + (s.verify.blocking || []).join(', ') + '). Send the sapVerifyMetadata result to the Delivery Lead.' : 'Run sapVerifyMetadata once to check the SAP service names.';
  if (!s.shadow) return 'Run sapShadowRun (October 2026, writes nothing) and show Vijay the differences. The first real run needs his OK.';
  if (s.unresolved && s.unresolved.rows) return 'Credit memos for ' + s.unresolved.months.join(', ') + ' are not loaded: ' + s.unresolved.rows + ' lines use product codes that are not in the item master. Load the item master with the S/4 codes (Q18). Credit coverage stays off until this is zero.';
  var pend = Object.keys(s.staged || {}).filter(function (k) { return s.staged[k].status !== 'loaded'; });
  if (String(sapProps_().getProperty('SAP_SYNC_ENABLED') || '').trim().toLowerCase() !== 'yes') return 'sapSync is off. After Vijay accepts the shadow run, the Delivery Lead tells you when to set the Script Property SAP_SYNC_ENABLED to yes.';
  if (!s.lastSync) return 'Run sapSync to fetch the SAP rows. They wait here until a Super admin clicks Load SAP feed.';
  if (pend.length) return 'Click Load SAP feed to put ' + pend.join(', ') + ' into the Desk.';
  return trig ? 'Up to date. The daily run keeps it so.' : 'Up to date. Run sapInstallDailyTrigger to switch on the daily run.';
}
function sapStatusView_() {
  var s = sapStatusGet_(), miss = sapMissing_(), trig = false;
  try { trig = sapTriggerOn_(); } catch (e) {}
  s.resume = !!sapGetJson_('SAP_CURSOR', null);
  return { configured: !miss.length, missing: miss, connected: !miss.length && !!(s.conn && s.conn.ok), trigger: trig,
    lastAt: s.lastAt || '', lastKind: s.lastKind || '', lastOk: s.lastOk !== false, message: s.message || '',
    read: s.read || { headers: 0, lines: 0 }, staged: s.staged || {}, stagedRows: s.stagedRows || 0, loaded: s.loaded || { rows: 0, at: '' },
    errors: s.errors || [], shadow: s.shadow || null, verify: s.verify || null, unresolved: s.unresolved || null, skippedMonths: s.skippedMonths || [], resume: s.resume,
    feedFrom: SAP_FEED_FROM, cancelMode: String(sapProps_().getProperty('CANCEL_MODE') || 'exclude').toLowerCase() === 'mirror' ? 'mirror' : 'exclude',
    next: sapNext_(s, miss, trig) };
}

/* ---------- run flag ---------- */
function sapAcquire_() {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var r = sapGetJson_('SAP_RUN', null);
    if (r && Date.now() - (r.at || 0) < SAP_RUN_STALE_MS) fail_('unavailable', 'Another SAP run is in progress. Try again in a few minutes.');
    sapSetJson_('SAP_RUN', { at: Date.now() });
  } finally { lock.releaseLock(); }
}
function sapBeat_() { sapSetJson_('SAP_RUN', { at: Date.now() }); }
function sapRelease_() { try { sapProps_().deleteProperty ? sapProps_().deleteProperty('SAP_RUN') : sapProps_().setProperty('SAP_RUN', ''); } catch (e) {} }

/* ---------- staging writes (collection sapstage, admin-only) ---------- */
function sapWho_() { return { email: 'sap-feed', role: 'Super admin', active: true }; }
function sapStageWrite_(ops) {
  if (!ops.length) return;
  book_(true);
  var final = Object.create(null), order = [], failed = Object.create(null);
  ops.forEach(function (o) { var k = o.col + '/' + o.id; if (!(k in final)) order.push(k); final[k] = o; });
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { applyOps_(sapWho_(), final, order, failed); } finally { lock.releaseLock(); }
  var bad = Object.keys(failed); if (bad.length) fail_('unavailable', 'Staging write refused: ' + failed[bad[0]].message);
}
function sapGz_(o) { return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(o), 'application/x-gzip')).getBytes()); }
function sapUngz_(z) { return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(z), 'application/x-gzip')).getDataAsString(); }
function sapChunkId_(ym, run, seq) { return 'c_' + ym + '_' + run + '_' + seq; }
/* one gzip chunk document per call; halves the rows when the document would be over the store limit */
function sapChunkOps_(ym, run, seq, rows, out) {
  var z = sapGz_(rows);
  if (z.length > 200000 && rows.length > 1) { var h = Math.ceil(rows.length / 2); seq = sapChunkOps_(ym, run, seq, rows.slice(0, h), out); return sapChunkOps_(ym, run, seq, rows.slice(h), out); }
  out.push({ op: 'set', col: 'sapstage', id: sapChunkId_(ym, run, seq), json: JSON.stringify({ ym: ym, run: run, seq: seq, n: rows.length, z: z }) });
  return seq + 1;
}

/* ---------- classification of one billing document and its items ---------- */
function sapNewCnt_() { return { headers: 0, lines: 0, sales: 0, credit: 0, salesValue: 0, creditValue: 0, cancelledDropped: 0, cancelDocs: 0, otherTypes: {}, acp: 0, noPlant: 0, flagged: 0, flaggedValue: 0, otherCompany: 0, beforeCutoff: 0, plants: {} }; }
/* returns rows (register layout, product type and customer name still blank) with the raw lookup keys, for one header */
function sapDocRows_(cfg, h, cnt) {
  cnt.headers++;
  var type = String(h.BillingDocumentType || '').trim().toUpperCase(), date = sapDate_(h.BillingDocumentDate), cancelled = sapBool_(h.BillingDocumentIsCancelled);
  var items = (h.to_Item && (h.to_Item.results || h.to_Item)) || [];
  if (!Array.isArray(items)) items = [];
  cnt.lines += items.length;
  if (h.CompanyCode && String(h.CompanyCode).trim() !== cfg.company) { cnt.otherCompany++; return []; }
  if (!date || date < SAP_FEED_FROM) { cnt.beforeCutoff++; return []; }
  var kind = '';
  if (SAP_CANCEL_TYPES.indexOf(type) >= 0) {
    cnt.cancelDocs++;
    if (cfg.cancel === 'mirror' && type === 'S1') kind = 'credit'; else return [];   // exclude: the cancellation and the document it cancels both stay out
  } else if (cancelled) {
    if (cfg.cancel === 'mirror' && SAP_SALES_TYPES.indexOf(type) >= 0) kind = 'sales'; else { cnt.cancelledDropped++; return []; }
  } else if (SAP_SALES_TYPES.indexOf(type) >= 0) kind = 'sales';
  else if (SAP_CN_TYPES.indexOf(type) >= 0) kind = 'credit';
  else {
    var ot = cnt.otherTypes[type || '(blank)'] || (cnt.otherTypes[type || '(blank)'] = { n: 0, v: 0 });
    items.forEach(function (it) { ot.n++; var v = sapNum_(it.NetAmount); if (!isNaN(v)) ot.v += v; });
    return [];
  }
  var out = [], doc = sapTrim0_(h.BillingDocument), cust = sapTrim0_(h.SoldToParty);
  items.forEach(function (it) {
    var plant = String(it.Plant == null ? '' : it.Plant).trim(), net = sapNum_(it.NetAmount);
    if (!plant) { cnt.noPlant++; return; }
    if (/^\d+$/.test(plant) && +plant > SAP_PLANT_LAST) { cnt.acp++; return; }
    var unit = String(it.BillingQuantityUnit || '').trim().toUpperCase(), cur = String(it.TransactionCurrency || h.TransactionCurrency || 'INR').trim().toUpperCase();
    if ((unit && SAP_SHEET_UNITS.indexOf(unit) < 0) || cur !== 'INR') { cnt.flagged++; cnt.flaggedValue += isNaN(net) ? 0 : net; return; }
    var qty = sapNum_(it.BillingQuantity);
    out.push({ rawMat: String(it.Material == null ? '' : it.Material).trim(), rawCust: String(h.SoldToParty == null ? '' : h.SoldToParty).trim(), kind: kind,
      row: [doc, sapTrim0_(it.BillingDocumentItem), date, plant, cust, '', sapTrim0_(it.Material), isNaN(qty) ? String(it.BillingQuantity == null ? '' : it.BillingQuantity) : qty, isNaN(net) ? String(it.NetAmount == null ? '' : it.NetAmount) : net,
        type, '', String(it.AdditionalMaterialGroup3 == null ? '' : it.AdditionalMaterialGroup3).trim(), String(it.AdditionalMaterialGroup4 == null ? '' : it.AdditionalMaterialGroup4).trim(), '', sapTrim0_(it.ReferenceSDDocument), ''] });   // column 14 (Sales District) stays blank
  });
  return out;
}
/* product type and customer name: read by key in batches, cached for the run and in the script cache */
function sapLookups_(cfg, ctx, entries) {
  var cache = CacheService.getScriptCache();
  function need(map, prefix, ids) {
    var miss = [];
    ids.forEach(function (id) { if (id === '' || id in map) return; var c = cache.get(prefix + id); if (c !== null && c !== undefined) { map[id] = c; return; } if (/^[A-Za-z0-9_\-\/ ]{1,40}$/.test(id)) { if (miss.indexOf(id) < 0) miss.push(id); } else map[id] = ''; });
    return miss;
  }
  function fetchSet(svc, set, key, field, map, prefix, miss) {
    for (var i = 0; i < miss.length; i += SAP_LOOKUP_BATCH) {
      var part = miss.slice(i, i + SAP_LOOKUP_BATCH), p = { '$filter': part.map(function (x) { return key + ' eq ' + sapQ_(x); }).join(' or '), '$select': key + ',' + field, '$top': String(part.length * 2), '$orderby': key + ' asc' }, got = 0, total = null;
      for (;;) {   // a server may cap the page size: keep reading until the count is reached or a page is empty
        p['$skip'] = String(got); if (got === 0) p['$inlinecount'] = 'allpages'; else delete p['$inlinecount'];
        var r = sapJson_(cfg, sapHttp_(cfg, svc, set, p)); if (got === 0) total = r.count;
        r.results.forEach(function (o) { map[String(o[key])] = String(o[field] == null ? '' : o[field]); });
        got += r.results.length;
        if (!r.results.length || (total !== null && got >= total)) break;
      }
      part.forEach(function (x) { if (!(x in map)) map[x] = ''; try { cache.put(prefix + x, map[x], 21600); } catch (e) {} });
    }
  }
  var mats = [], custs = [];
  entries.forEach(function (e) { if (mats.indexOf(e.rawMat) < 0) mats.push(e.rawMat); if (custs.indexOf(e.rawCust) < 0) custs.push(e.rawCust); });
  fetchSet(SAP_SVC.product, 'A_Product', 'Product', 'ProductType', ctx.prod, 'sapp_', need(ctx.prod, 'sapp_', mats));
  if (!sapSkipped_(cfg, 'A_Customer', 'CustomerName')) fetchSet(SAP_SVC.partner, 'A_Customer', 'Customer', 'CustomerName', ctx.cust, 'sapc_', need(ctx.cust, 'sapc_', custs));
  entries.forEach(function (e) { e.row[10] = ctx.prod[e.rawMat] || ''; e.row[5] = String(ctx.cust[e.rawCust] || '').slice(0, 60); });
}

/* ---------- reading one month of headers (with items), page by page ---------- */
var SAP_HDR_SEL_ = ['BillingDocument', 'BillingDocumentType', 'BillingDocumentDate', 'CompanyCode', 'SoldToParty', 'BillingDocumentIsCancelled', 'CancelledBillingDocument', 'LastChangeDate', 'TransactionCurrency'];
function sapHdrSelect_(cfg) {
  return SAP_HDR_SEL_.concat(SAP_ITEM_FIELDS.filter(function (f) { return f !== 'BillingDocument' && !sapSkipped_(cfg, 'A_BillingDocumentItem', f); }).map(function (f) { return 'to_Item/' + f; })).join(',');
}
function sapMonthFilter_(cfg, ym, extra) {
  return 'CompanyCode eq ' + sapQ_(cfg.company) + ' and BillingDocumentDate ge ' + sapDtLit_(ym + '-01') + ' and BillingDocumentDate lt ' + sapDtLit_(sapNextYm_(ym) + '-01') + (extra ? ' and ' + extra : '');
}
function sapItemSelect_(cfg) { return SAP_ITEM_FIELDS.filter(function (f) { return !sapSkipped_(cfg, 'A_BillingDocumentItem', f); }).concat(SAP_HDR_FIELDS).join(','); }
/* shape B: group a page of items into documents; unless this is the last page the trailing document is handed back (drop = its item count) and read again from its first item on the next page */
function sapItemsToHeaders_(items, last) {
  var out = [], cur = null;
  items.forEach(function (it) {
    if (!cur || cur.BillingDocument !== it.BillingDocument) {
      cur = { BillingDocument: it.BillingDocument, BillingDocumentType: it.BillingDocumentType, BillingDocumentDate: it.BillingDocumentDate, CompanyCode: it.CompanyCode, SoldToParty: it.SoldToParty, BillingDocumentIsCancelled: it.BillingDocumentIsCancelled,
        CancelledBillingDocument: it.CancelledBillingDocument, LastChangeDate: it.LastChangeDate, TransactionCurrency: it.TransactionCurrency, to_Item: { results: [] } };
      out.push(cur);
    }
    cur.to_Item.results.push(it);
  });
  var drop = 0;
  if (!last && out.length > 1) drop = out.pop().to_Item.results.length;
  return { headers: out, drop: drop };
}
function sapReadPage_(cfg, ym, skip) {
  if (cfg.shape === 'B') {
    var pb = { '$filter': sapMonthFilter_(cfg, ym), '$select': sapItemSelect_(cfg), '$orderby': 'BillingDocument asc,BillingDocumentItem asc', '$top': String(SAP_PAGE_TOP), '$skip': String(skip) };
    if (skip === 0) pb['$inlinecount'] = 'allpages';
    return sapJson_(cfg, sapHttp_(cfg, SAP_SVC.billing, 'A_BillingDocumentItem', pb));
  }
  var p = { '$filter': sapMonthFilter_(cfg, ym), '$expand': 'to_Item', '$select': sapHdrSelect_(cfg), '$orderby': 'BillingDocument asc', '$top': String(SAP_PAGE_TOP), '$skip': String(skip) };
  if (skip === 0) p['$inlinecount'] = 'allpages';
  return sapJson_(cfg, sapHttp_(cfg, SAP_SVC.billing, 'A_BillingDocument', p));
}

/* ---------- planning: which months to re-read (incremental rule, section 3 of the mapping) ---------- */
function sapPlanMonths_(cfg, ss) {
  var today = sapIstToday_(), curYm = sapYm_(today), firstYm = sapYm_(SAP_FEED_FROM), wm = sapProps_().getProperty('SAP_WM') || '', months = {};
  function add(ym) { if (ym && ym >= firstYm && ym <= curYm) months[ym] = 1; }
  add(curYm); if (+today.slice(8, 10) <= 5) add(sapPrevYm_(curYm));
  var full = function () { sapYmRange_(firstYm, curYm).forEach(add); };
  if (!wm) { full(); }
  else {
    var p = { '$filter': 'CompanyCode eq ' + sapQ_(cfg.company) + ' and BillingDocumentDate ge ' + sapDtLit_(SAP_FEED_FROM) + ' and LastChangeDate ge ' + sapDtLit_(sapAddDays_(wm, -1)), '$select': 'BillingDocument,BillingDocumentType,BillingDocumentDate,CancelledBillingDocument,LastChangeDate',
      '$orderby': 'BillingDocument asc', '$top': String(SAP_PAGE_TOP), '$inlinecount': 'allpages' }, skip = 0, cancelled = [], pages = 0, big = false;
    for (;;) {
      p['$skip'] = String(skip); var r = sapJson_(cfg, sapHttp_(cfg, SAP_SVC.billing, cfg.shape === 'B' ? 'A_BillingDocumentItem' : 'A_BillingDocument', p)); pages++;
      r.results.forEach(function (h) { add(sapYm_(sapDate_(h.BillingDocumentDate))); var c = String(h.CancelledBillingDocument || '').trim(); if (c && cancelled.indexOf(c) < 0 && cancelled.length < 400) cancelled.push(c); });
      skip += r.results.length;
      if (!r.results.length || (r.count !== null && skip >= r.count)) break;
      if (r.count !== null && r.count > 4000 || pages > 40) { big = true; break; }
    }
    if (big) full();
    else cancelled.forEach(function (id) {   // a cancellation also touches the month of the document it cancels
      try {
        var d = cfg.shape === 'B' ? sapJson_(cfg, sapHttp_(cfg, SAP_SVC.billing, 'A_BillingDocumentItem', { '$filter': 'BillingDocument eq ' + sapQ_(id), '$select': 'BillingDocument,BillingDocumentDate', '$top': '1' })).results[0]
          : sapJson_(cfg, sapHttp_(cfg, SAP_SVC.billing, "A_BillingDocument(" + sapQ_(id) + ")", { '$select': 'BillingDocumentDate' })).results[0];
        if (d) add(sapYm_(sapDate_(d.BillingDocumentDate)));
      }
      catch (e) { if (e.deskCode !== 'sap_not_found') throw e; }
    });
  }
  var list = Object.keys(months).sort(), skipped = [], closed = {};
  try { readAll_(ss, 'periods').docs.forEach(function (d) { try { var o = JSON.parse(d.json); if (o && o.status === 'closed') closed[o.fy_quarter || d.id] = 1; } catch (e) {} }); } catch (e) {}
  var keep = list.filter(function (ym) { if (closed[sapQuarterOf_(ym)]) { skipped.push(ym); return false; } return true; });
  return { months: keep, skipped: skipped };
}

/* ---------- the shared reading loop (sync stages rows; shadow tallies them) ---------- */
function sapNewJob_(kind, months, extra) {
  var j = { job: kind, run: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4), months: months, i: 0, skip: 0, total: null, seq: 0, cnt: sapNewCnt_(), maxChange: '', at: new Date(Date.now()).toISOString() };
  Object.keys(extra || {}).forEach(function (k) { j[k] = extra[k]; });
  return j;
}
function sapCursorKey_(kind) { return kind === 'shadow' ? 'SAP_CURSOR_SHADOW' : 'SAP_CURSOR'; }   // a shadow run never touches a paused sync's cursor
function sapSaveCursor_(job) { sapSetJson_(sapCursorKey_(job.job), job); }
/* runs until every month is done or the time budget is used. Returns {done}. Staged chunks are written before the cursor moves past them. */
function sapRunJob_(cfg, job, t0, budget, handlers) {
  var ctx = { prod: Object.create(null), cust: Object.create(null) }, buf = [];
  function flush() {
    if (!buf.length || !handlers.stage) { buf = []; return; }
    var ops = [], seq = job.seq; for (var i = 0; i < buf.length; i += SAP_CHUNK_ROWS) seq = sapChunkOps_(job.months[job.i], job.run, seq, buf.slice(i, i + SAP_CHUNK_ROWS), ops);
    sapStageWrite_(ops); job.seq = seq; buf = [];
  }
  while (job.i < job.months.length) {
    var ym = job.months[job.i];
    for (;;) {
      if (Date.now() - t0 > budget) { flush(); sapSaveCursor_(job); return { done: false }; }
      sapBeat_();
      var r = sapReadPage_(cfg, ym, job.skip);
      if (job.skip === 0) job.total = r.count;
      var entries = [], got = r.results.length, hdrs = r.results;
      if (cfg.shape === 'B') { var g = sapItemsToHeaders_(r.results, got === 0 || (job.total !== null && job.skip + got >= job.total)); hdrs = g.headers; got = got - g.drop; }
      hdrs.forEach(function (h) {
        var lc = sapDate_(h.LastChangeDate); if (lc && lc > job.maxChange) job.maxChange = lc;
        sapDocRows_(cfg, h, job.cnt).forEach(function (e) { entries.push(e); });
      });
      if (entries.length) sapLookups_(cfg, ctx, entries);
      handlers.rows(job, ym, entries);
      entries.forEach(function (e) { if (handlers.stage) buf.push(e.row); });
      job.skip += got;
      if (handlers.stage ? buf.length >= SAP_CHUNK_ROWS : true) { flush(); sapSaveCursor_(job); }   // the cursor only ever points at a place whose rows are already staged
      if (!r.results.length || (job.total !== null && job.skip >= job.total)) break;
    }
    flush();
    if (job.total !== null && job.skip !== job.total) fail_('sap_error', 'The read of ' + ym + ' returned ' + job.skip + ' documents but SAP counted ' + job.total + '. The month was not staged.');
    handlers.month(job, ym);
    job.i++; job.skip = 0; job.total = null; job.seq = 0; job.cnt = sapNewCnt_();
    sapSaveCursor_(job);
  }
  return { done: true };
}

/* ---------- sapSync ---------- */
function sapSyncRun_(source) {
  if (String(sapProps_().getProperty('SAP_SYNC_ENABLED') || '').trim().toLowerCase() !== 'yes') fail_('sap_sync_disabled', 'sapSync is switched off. It stays off until the Script Property SAP_SYNC_ENABLED is set to yes (after the shadow run is accepted). Nothing was read.');
  var cfg = sapCfg_(), st = sapStatusGet_();
  sapVerifyGate_();
  if (!st.shadow) fail_('sap_shadow_first', 'Run sapShadowRun first and have Vijay accept the October comparison. Nothing was read.');
  var ss = book_(true); sapAcquire_();
  var t0 = Date.now(), budget = +sapProps_().getProperty('SAP_RUN_BUDGET_MS') || SAP_BUDGET_MS, job = sapGetJson_('SAP_CURSOR', null), resumed = false, res = null;
  try {
    if (job && job.job === 'sync') resumed = true;
    else {
      var plan = sapPlanMonths_(cfg, ss);
      sapStatusPatch_({ skippedMonths: plan.skipped });
      job = sapNewJob_('sync', plan.months, { totals: { headers: 0, lines: 0, rows: 0 } });
    }
    var months = job.months;
    var handlers = {
      stage: true,
      rows: function (j, ym, entries) { entries.forEach(function (e) { j.cnt[e.kind === 'credit' ? 'credit' : 'sales']++; var v = sapNum_(e.row[8]); if (!isNaN(v)) j.cnt[e.kind === 'credit' ? 'creditValue' : 'salesValue'] += v; j.cnt.plants[e.row[3]] = 1; }); },
      month: function (j, ym) {
        var c = j.cnt, total = j.seq, rowsN = c.sales + c.credit;
        var man = { ym: ym, run: j.run, at: new Date(Date.now()).toISOString(), complete: true, cols: SAP_STAGE_COLS, n: total, rows: rowsN, status: 'staged', from: SAP_FEED_FROM, company: cfg.company, cancelMode: cfg.cancel,
          salesTypes: SAP_SALES_TYPES, creditTypes: SAP_CN_TYPES.concat(cfg.cancel === 'mirror' ? ['S1'] : []), countChecked: j.total !== null, counts: c, plants: Object.keys(c.plants).sort(), maxChange: j.maxChange };
        var ops = [{ op: 'set', col: 'sapstage', id: 'man_' + ym, json: JSON.stringify(man) }];
        var prev = null; try { var raw = docsRaw_(colSheet_(book_(false), 'sapstage', false), ['man_' + ym]); prev = raw['man_' + ym] ? JSON.parse(raw['man_' + ym]) : null; } catch (e) {}
        if (prev && prev.run && prev.run !== j.run) for (var s = 0; s < (prev.n || 0); s++) ops.push({ op: 'delete', col: 'sapstage', id: sapChunkId_(ym, prev.run, s) });
        sapStageWrite_(ops);
        j.totals.headers += c.headers; j.totals.lines += c.lines; j.totals.rows += rowsN;
        var s2 = sapStatusGet_(), staged = s2.staged || {}; staged[ym] = { rows: rowsN, sales: c.sales, credit: c.credit, at: man.at, status: 'staged', run: j.run, cancelled: c.cancelledDropped + c.cancelDocs, other: Object.keys(c.otherTypes).length, flagged: c.flagged, acp: c.acp };
        sapStatusPatch_({ staged: staged });
      } };
    res = sapRunJob_(cfg, job, t0, budget, handlers);
    var tot = job.totals;
    if (res.done) {
      if (job.maxChange && job.maxChange > (sapProps_().getProperty('SAP_WM') || '')) sapProps_().setProperty('SAP_WM', job.maxChange);
      sapProps_().setProperty('SAP_CURSOR', '');
      var stg = sapStatusGet_(), n = 0; Object.keys(stg.staged || {}).forEach(function (k) { n += stg.staged[k].rows; });
      sapStatusPatch_({ lastAt: new Date(Date.now()).toISOString(), lastKind: 'sync', lastOk: true, lastSync: new Date(Date.now()).toISOString(), message: 'Read ' + tot.headers + ' documents and ' + tot.lines + ' lines; staged ' + tot.rows + ' rows in ' + months.length + ' month(s).', read: { headers: tot.headers, lines: tot.lines }, stagedRows: n, conn: { ok: true, at: new Date(Date.now()).toISOString() } });
    } else {
      sapStatusPatch_({ lastAt: new Date(Date.now()).toISOString(), lastKind: 'sync', lastOk: true, message: 'Stopped at the run time limit after month ' + (job.i + 1) + ' of ' + months.length + '; run sapSync again to continue.', conn: { ok: true, at: new Date(Date.now()).toISOString() } });
      if (source === 'trigger') sapContinueLater_();
    }
    return { ok: true, done: res.done, resumed: resumed, months: months, monthsDone: Math.min(job.i, months.length), read: { headers: tot.headers, lines: tot.lines }, stagedRows: tot.rows, skippedMonths: (sapStatusGet_().skippedMonths || []), message: sapStatusGet_().message };
  } catch (e) {
    var conn = e.deskCode === 'sap_auth' || e.deskCode === 'sap_forbidden' || e.deskCode === 'sap_unreachable' || e.deskCode === 'sap_error' || e.deskCode === 'sap_not_found';
    sapErrPush_(cfg, e.message || e);
    var patch = { lastAt: new Date(Date.now()).toISOString(), lastKind: 'sync', lastOk: false, message: sapRedact_(cfg, e.message || e) };
    if (conn) patch.conn = { ok: false, at: new Date(Date.now()).toISOString() };
    sapStatusPatch_(patch);
    if (job && /counted/.test(String(e.message))) sapProps_().setProperty('SAP_CURSOR', '');
    throw e;
  } finally { sapRelease_(); }
}
function sapContinueLater_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sapContinueTrigger_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('sapContinueTrigger_').timeBased().after(60 * 1000).create();
  } catch (e) { /* the daily trigger will continue it */ }
}

/* ---------- sapShadowRun: read the month, compare with what is loaded, write nothing ---------- */
function sapSize_(txt, qty) {
  var m = /^\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/.exec(String(txt || '')); if (!m) return 0;
  var a = +m[1], b = +m[2]; if (a >= 100 || b >= 100) { a /= 304.8; b /= 304.8; } return qty * a * b;
}
function sapGroupOf_(cat, tt) {   // the S/4 rule of the register intake, without the Admin alias table
  var c = String(cat || '').trim().toUpperCase(); if (c === 'ZCBPVC') return 'PVC sheet';
  if (c === 'ZABLAM' || c === 'ZCRLAM') { var t = String(tt || '').trim().toUpperCase(); return t === 'DOOR' ? 'Door' : t.indexOf('COMPACT') >= 0 ? 'Compact board' : 'Laminate'; }
  return null;
}
function sapShadowRun_(ymArg) {
  var cfg = sapCfg_(), ss = book_(false);
  if (!ss) fail_('unavailable', 'The database is not set up yet. Run setup() once.');
  sapVerifyGate_();
  var firstYm = sapYm_(SAP_FEED_FROM), ym = ymArg || firstYm;
  if (!/^\d{4}-\d\d$/.test(ym) || ym < firstYm) fail_('invalid_argument', 'The shadow run reads ' + firstYm + ' or later only.');
  sapAcquire_();
  var t0 = Date.now(), budget = +sapProps_().getProperty('SAP_RUN_BUDGET_MS') || SAP_BUDGET_MS, job = sapGetJson_('SAP_CURSOR_SHADOW', null), resumed = false;
  try {
    if (job && job.job === 'shadow' && job.months[0] === ym) resumed = true;
    else job = sapNewJob_('shadow', [ym], { tally: {}, seen: 0 });
    var plants = Object.create(null); readAll_(ss, 'plants').docs.forEach(function (d) { try { var o = JSON.parse(d.json); if (o && o.plant_code) plants[String(o.plant_code)] = o; } catch (e) {} });
    var today = sapIstToday_(), seenKeys = {};
    var handlers = { stage: false, month: function () {},
      rows: function (j, m, entries) {
        var docsPage = {};
        entries.forEach(function (e) {
          if (e.kind !== 'sales') return;
          var r = e.row, qty = sapNum_(r[7]), net = sapNum_(r[8]); if (isNaN(qty) || isNaN(net) || qty <= 0 || net < 0) return;
          if (!r[0] || !r[1] || r[2] > today) return;
          var pl = plants[/^\d{1,4}$/.test(r[3]) ? ('0000' + r[3]).slice(-4) : r[3]]; if (!pl || pl.active === false) return;
          var key = r[0] + '|' + r[1]; if (seenKeys[key]) return; seenKeys[key] = 1;
          var grp = sapGroupOf_(r[10], r[11]); if (!grp) return;
          var pk = pl.plant_code, T = j.tally[pk] || (j.tally[pk] = [0, 0, 0, 0, 0]);
          T[1]++; T[2] += qty; T[3] += sapSize_(r[12], qty); T[4] += net; (docsPage[pk] = docsPage[pk] || {})[r[0]] = 1;
        });
        Object.keys(docsPage).forEach(function (pk) { j.tally[pk][0] += Object.keys(docsPage[pk]).length; });
      } };
    var res = sapRunJob_(cfg, job, t0, budget, handlers);
    if (!res.done) {
      sapStatusPatch_({ lastAt: new Date(Date.now()).toISOString(), lastKind: 'shadow', message: 'The shadow run stopped at the run time limit; run sapShadowRun again to continue.', conn: { ok: true, at: new Date(Date.now()).toISOString() } });
      return { ok: true, done: false, resumed: resumed, message: 'Stopped at the run time limit. Run sapShadowRun again to continue; nothing was written.' };
    }
    var diffs = sapCompare_(ss, ym, job.tally);
    sapProps_().setProperty('SAP_CURSOR_SHADOW', '');
    var bad = diffs.filter(function (d) { return !d.equal; }), now = new Date(Date.now()).toISOString();
    sapSetJson_('SAP_SHADOW', { at: now, ym: ym, rows: bad.slice(0, 40) });
    sapStatusPatch_({ lastAt: now, lastKind: 'shadow', lastOk: true, message: 'Shadow run for ' + ym + ': ' + diffs.length + ' plant-months compared, ' + bad.length + ' differ. Nothing was written.', conn: { ok: true, at: now },
      shadow: { at: now, ym: ym, plantMonths: diffs.length, differ: bad.length, clean: bad.length === 0 }, read: { headers: job.cnt.headers, lines: job.cnt.lines } });
    return { ok: true, done: true, ym: ym, resumed: resumed, plantMonths: diffs.length, differ: bad.length, clean: bad.length === 0, differences: diffs, message: sapStatusGet_().message };
  } catch (e) {
    var conn = /^sap_/.test(e.deskCode || '');
    sapErrPush_(cfg, e.message || e);
    var patch = { lastAt: new Date(Date.now()).toISOString(), lastKind: 'shadow', lastOk: false, message: sapRedact_(cfg, e.message || e) };
    if (conn) patch.conn = { ok: false, at: new Date(Date.now()).toISOString() };
    sapStatusPatch_(patch);
    if (/counted/.test(String(e.message))) sapProps_().setProperty('SAP_CURSOR_SHADOW', '');
    throw e;
  } finally { sapRelease_(); }
}
/* what the Desk holds for the month: cells (docs, lines, sheets, value) and roll-ups (sq ft) per plant; compared with the feed's tally. Value within Rs 1, sq ft within 4 (rounding per product group). */
function sapCompare_(ss, ym, tally) {
  var cellRaw = docsRaw_(colSheet_(ss, 'cells', false), ['INV_' + ym]), cell = cellRaw['INV_' + ym] ? JSON.parse(cellRaw['INV_' + ym]) : null, held = (cell && cell.plants) || {}, out = [];
  var codes = {}; Object.keys(held).forEach(function (p) { codes[p] = 1; }); Object.keys(tally).forEach(function (p) { codes[p] = 1; });
  var rollIds = Object.keys(held).map(function (p) { return p + '-' + ym; }), rolls = docsRaw_(colSheet_(ss, 'roll', false), rollIds);
  Object.keys(codes).sort().forEach(function (p) {
    var h = held[p] || null, T = tally[p] || [0, 0, 0, 0, 0], sq = 0;
    if (h && rolls[p + '-' + ym]) { try { JSON.parse(sapUngz_(JSON.parse(rolls[p + '-' + ym]).z)).forEach(function (r) { if (!r[2]) sq += +r[6] || 0; }); } catch (e) {} }
    var f = { docs: T[0], lines: T[1], sheets: T[2], sqft: Math.round(T[3]), net: Math.round(T[4]) }, s = { docs: h ? h.docs || 0 : 0, lines: h ? h.lines || 0 : 0, sheets: h ? h.sheets || 0 : 0, sqft: Math.round(sq), net: h ? h.net || 0 : 0 };
    var equal = f.docs === s.docs && f.lines === s.lines && f.sheets === s.sheets && Math.abs(f.net - s.net) <= 1 && Math.abs(f.sqft - s.sqft) <= 4;
    out.push({ plant: p, ym: ym, feed: f, loaded: s, diff: { docs: f.docs - s.docs, lines: f.lines - s.lines, sheets: f.sheets - s.sheets, sqft: f.sqft - s.sqft, net: f.net - s.net }, equal: equal, note: !h ? 'not loaded in the Desk' : !tally[p] ? 'no lines in the feed' : '' });
  });
  return out;
}

/* ---------- sapVerifyMetadata ---------- */
function sapParseMeta_(xml) {
  var types = {}, sets = {}, m;
  var re = /<EntityType\b[^>]*\bName="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
  while ((m = re.exec(xml))) {
    var props = {}, navs = {}, pr = /<Property\b[^>]*\bName="([^"]+)"/g, nr = /<NavigationProperty\b[^>]*\bName="([^"]+)"/g, x;
    while ((x = pr.exec(m[2]))) props[x[1]] = 1; while ((x = nr.exec(m[2]))) navs[x[1]] = 1;
    types[m[1]] = { props: props, navs: navs };
  }
  var se = /<EntitySet\b([^>]*)>/g;
  while ((m = se.exec(xml))) {
    var n = /\bName="([^"]+)"/.exec(m[1]), t = /\bEntityType="([^"]+)"/.exec(m[1]);
    if (n && t) sets[n[1]] = types[t[1].split('.').pop()] || null;
  }
  return sets;
}
/* the saved verify result blocks reads while a REQUIRED name is a GAP (optional GAPs only warn) */
function sapVerifyGate_() {
  var v = sapStatusGet_().verify;
  if (!v) fail_('sap_verify_first', 'Run sapVerifyMetadata first. Nothing was read and nothing was changed. The shadow run and the sync need a passing verify on record.');
  if (v.failed) fail_('sap_verify_gap', 'The last sapVerifyMetadata did not finish (' + (v.error || 'error') + '). Nothing was read and nothing was changed. Run sapVerifyMetadata again and read the result before the shadow run or the sync.');
  if (v.ok !== true) fail_('sap_verify_gap', 'SAP does not offer ' + (v.gaps || 0) + ' required name(s): ' + (v.blocking || []).join(', ') + '. Nothing was read and nothing was changed. Send the sapVerifyMetadata result to the Delivery Lead; run sapVerifyMetadata again once it is fixed.');
}
function sapVerifyRun_() {
  var cfg = sapCfg_(), rows = [], gaps = 0, ogaps = 0, seen = {}, sets = {}, forced = String(sapProps_().getProperty('SAP_BILLING_SHAPE') || '').trim().toUpperCase(), shape = forced === 'B' ? 'B' : 'A';
  function check(list) {
    var rr = [], g = 0, og = 0;
    list.forEach(function (e) {
      if (!(e.svc in seen)) { seen[e.svc] = sapParseMeta_(sapHttp_(cfg, SAP_SVC[e.svc], '$metadata', null, 'application/xml').text); }
      sets = seen[e.svc]; var t = sets[e.set], opt = e.opt || [];
      function row(prop, ok) {
        var isOpt = opt.indexOf(prop) >= 0, r = { service: SAP_SVC[e.svc], entitySet: e.set, property: prop, status: ok ? 'ok' : 'GAP' };
        if (isOpt) r.optional = true;
        if (!ok) { if (isOpt) og++; else g++; }
        rr.push(r);
      }
      if (!t) {   // a missing entity set cannot be read at all: it is always required
        g++; rr.push({ service: SAP_SVC[e.svc], entitySet: e.set, property: '(entity set)', status: 'GAP' });
        e.nav.forEach(function (n) { row(n + ' (navigation)', false); });
        e.props.forEach(function (p) { row(p, false); });
        return;
      }
      rr.push({ service: SAP_SVC[e.svc], entitySet: e.set, property: '(entity set)', status: 'ok' });
      e.nav.forEach(function (n) { row(n + ' (navigation)', !!t.navs[n]); });
      e.props.forEach(function (p) { row(p, !!t.props[p]); });
    });
    return { rows: rr, gaps: g, ogaps: og };
  }
  var others = SAP_META.filter(function (e) { return e.svc !== 'billing'; }), billA = SAP_META.filter(function (e) { return e.svc === 'billing'; });
  try {
    var chosen = check(shape === 'B' ? SAP_META_B : billA), picked = shape;
    if (!forced && chosen.gaps) { var alt = check(SAP_META_B); if (!alt.gaps) { chosen = alt; picked = 'B'; } }
    shape = picked; rows = chosen.rows; gaps = chosen.gaps; ogaps = chosen.ogaps;
    var rest = check(others); rows = rows.concat(rest.rows); gaps += rest.gaps; ogaps += rest.ogaps;
    if (!forced) sapProps_().setProperty('SAP_SHAPE', shape);
  } catch (e) {
    sapErrPush_(cfg, e.message || e);
    var fAt = new Date(Date.now()).toISOString(), prevV = sapStatusGet_().verify || {};   // a failed verify also voids an earlier OK
    sapStatusPatch_({ lastAt: fAt, lastKind: 'verify', lastOk: false, message: sapRedact_(cfg, e.message || e), conn: { ok: false, at: fAt }, verify: Object.assign({}, prevV, { at: fAt, ok: false, failed: true, error: sapRedact_(cfg, e.message || e).slice(0, 120) }) });
    throw e;
  }
  var now = new Date(Date.now()).toISOString(), okAll = gaps === 0;
  var blocking = rows.filter(function (r) { return r.status === 'GAP' && !r.optional; }).map(function (r) { return r.entitySet + '.' + r.property; });
  var skip = rows.filter(function (r) { return r.status === 'GAP' && r.optional; }).map(function (r) { return r.entitySet + '.' + r.property; });
  sapSetJson_('SAP_OPT_SKIP', skip);   // optional GAPs are left out of every later read; an empty list clears an old one
  var nOk = rows.length - gaps - ogaps, msg = 'SAP names checked: ' + nOk + ' ok, ' + gaps + ' required GAP, ' + ogaps + ' optional GAP.';
  if (!okAll) msg += ' Blocking (required, missing on SAP): ' + blocking.slice(0, 8).join(', ') + '. The shadow run and sync are blocked until this is fixed.';
  else if (ogaps) msg += ' Warning: optional ' + skip.join(', ') + ' not on this tenant; left out of the reads, its column stays blank. Nothing else is affected.';
  var warning = okAll && ogaps ? msg : '';
  sapStatusPatch_({ lastAt: now, lastKind: 'verify', lastOk: okAll, message: msg, conn: { ok: true, at: now }, verify: { at: now, ok: okAll, failed: false, gaps: gaps, optionalGaps: ogaps, checked: rows.length, shape: shape, blocking: blocking.slice(0, 10), optionalSkipped: skip } });
  var out = { ok: okAll, allOk: gaps + ogaps === 0, gaps: gaps, optionalGaps: ogaps, optionalSkipped: skip, shape: shape, checked: rows.length, rows: rows, message: msg };
  if (warning) out.warning = warning;
  if (!okAll) { out.code = 'sap_verify_gap'; out.blocking = blocking; }
  return out;
}

/* ---------- public functions (owner or Super admin) ---------- */
/* every public function writes ONE line to the execution log, success or failure: function, ok, code, counts, short message. Never a credential, the user name or the SAP address (redacted from the settings). */
function sapLogLine_(fn, r, ms) {
  try {
    var p = sapProps_(), line = {};
    line.fn = fn; line.ok = !!(r && r.ok); if (r && r.code) line.code = String(r.code);
    ['done', 'gaps', 'optionalGaps', 'differ', 'plantMonths', 'stagedRows', 'removed'].forEach(function (k) { if (r && r[k] !== undefined) line[k] = r[k]; });
    if (r && r.status && r.status.lastKind) line.last = r.status.lastKind;
    line.ms = ms;
    // only the free-text msg is redacted and cut, so the line is always valid JSON and keeps ms
    line.msg = sapRedact_({ secrets: [p.getProperty('SAP_USER'), p.getProperty('SAP_PASSWORD'), p.getProperty('SAP_BASE_URL')] }, String(r && r.message || '')).slice(0, 160);
    Logger.log('SAP ' + JSON.stringify(line));
  } catch (e) { try { Logger.log('SAP ' + fn + ' (log failed)'); } catch (e2) {} }
}
function sapPub_(fn, body) {
  var t0 = Date.now(), r = wrap_(function () { sapAuth_(); return body(); });
  sapLogLine_(fn, r, Date.now() - t0); return r;
}
function sapVerifyMetadata() { return sapPub_('sapVerifyMetadata', sapVerifyRun_); }
function sapShadowRun(ym) { return sapPub_('sapShadowRun', function () { return sapShadowRun_(ym); }); }
function sapSync() { return sapPub_('sapSync', function () { return sapSyncRun_('manual'); }); }
function sapStatus() { return sapPub_('sapStatus', function () { return { ok: true, status: sapStatusView_() }; }); }
function sapInstallDailyTrigger() {
  return sapPub_('sapInstallDailyTrigger', function () {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sapSyncTrigger_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('sapSyncTrigger_').timeBased().everyDays(1).atHour(2).nearMinute(30).create();
    return { ok: true, message: 'One daily run is on (about 02:30 IST). Run sapRemoveDailyTrigger to switch it off.' };
  });
}
function sapRemoveDailyTrigger() {
  return sapPub_('sapRemoveDailyTrigger', function () { var n = 0;
    ScriptApp.getProjectTriggers().forEach(function (t) { var f = t.getHandlerFunction(); if (f === 'sapSyncTrigger_' || f === 'sapContinueTrigger_') { ScriptApp.deleteTrigger(t); n++; } });
    return { ok: true, removed: n, message: n ? 'The daily run is off.' : 'No daily run was on.' };
  });
}
/* the page reports what it loaded: marks the staged months as loaded and records the counts the card shows */
function sapMarkLoaded(summary) {
  return sapPub_('sapMarkLoaded', function () {
    var s = summary || {}, months = (s.months || []).filter(function (m) { return /^\d{4}-\d\d$/.test(m); }), ops = [], at = new Date(Date.now()).toISOString(), st = sapStatusGet_(), staged = st.staged || {};
    if (months.length) {
      var raw = docsRaw_(colSheet_(book_(true), 'sapstage', false), months.map(function (m) { return 'man_' + m; }));
      months.forEach(function (m) { if (!raw['man_' + m]) return; ops.push({ op: 'merge', col: 'sapstage', id: 'man_' + m, json: JSON.stringify({ status: 'loaded', loadedAt: at }) }); if (staged[m]) { staged[m].status = 'loaded'; staged[m].loadedAt = at; } });
      sapStageWrite_(ops);
    }
    var un = s.unresolved && +s.unresolved.rows > 0 ? { rows: +s.unresolved.rows | 0, codes: +s.unresolved.codes | 0, value: Math.round(+s.unresolved.value || 0), months: (s.unresolved.months || []).filter(function (m) { return /^\d{4}-\d\d$/.test(m); }) } : null;
    sapStatusPatch_({ staged: staged, loaded: { rows: Math.max(0, +s.rows | 0), at: at, months: months }, unresolved: un, message: String(s.message || '').slice(0, 200) });
    return { ok: true };
  });
}
/* time-driven entry points. The trailing underscore keeps them out of google.script.run. They run as the project owner without a signed-in user; if a user IS signed in, that user must be the owner or an active Super admin, else nothing happens. */
function sapTriggerGate_() {
  var email = activeEmail_(); if (!email) return true;
  var eff = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return email === eff || isAdmin_(resolveUser_(email));
}
function sapSyncTrigger_() {
  if (!sapTriggerGate_()) { sapLogLine_('sapSyncTrigger_', { ok: false, code: 'permission_denied', message: 'Refused: not the owner or a Super admin.' }, 0); return; }
  var t0 = Date.now(), r = wrap_(function () { return sapSyncRun_('trigger'); });
  sapLogLine_('sapSyncTrigger_', r, Date.now() - t0);
}
function sapContinueTrigger_() {
  if (!sapTriggerGate_()) { sapLogLine_('sapContinueTrigger_', { ok: false, code: 'permission_denied', message: 'Refused: not the owner or a Super admin.' }, 0); return; }
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sapContinueTrigger_') ScriptApp.deleteTrigger(t); });
  sapSyncTrigger_();
}
