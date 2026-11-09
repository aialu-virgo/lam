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
 * STATE (Script Properties): SAP_STATUS (what the card shows), SAP_CURSOR (resume point of a sync cut at the time limit), SAP_CURSOR_SHADOW (the same for a shadow run), SAP_OPT_SKIP (optional names left out), SAP_WM (watermark), SAP_RUN (run flag), SAP_SHADOW (last shadow result), SAP_PAGE_EFF (page size learned from a refusal or a server cap), SAP_AUTO (an automatic chain in progress).
 *   SPEED (all optional Script Properties): SAP_PAGE_TOP (rows per page, default 500), SAP_CONCURRENCY (pages read at once, default 4), SAP_LOOKUP_BATCH (keys per lookup call, default 40), SAP_RUN_BUDGET_MS, SAP_AUTO_MAX_RUNS (default 8).
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
var SAP_PAGE_TOP = 500;                  // default page size ($top); the Script Property SAP_PAGE_TOP overrides it (10 to 5000)
var SAP_PAGE_MIN = 50;                   // the page never falls back below this (unless SAP_PAGE_TOP itself is lower)
var SAP_PAGE_MAX = 5000;
var SAP_CONCURRENCY = 4;                 // pages fetched at once (UrlFetchApp.fetchAll); Script Property SAP_CONCURRENCY (1 to 10)
var SAP_CONCURRENCY_MAX = 10;
var SAP_LOOKUP_BATCH = 40;               // keys per product / customer lookup call; Script Property SAP_LOOKUP_BATCH (5 to 40); halved automatically if SAP refuses the long address
var SAP_AUTO_DELAY_MS = 60000;           // sapShadowRunAuto / sapSyncAuto: the next run starts about this long after one stops
var SAP_AUTO_MAX_RUNS = 8;               // an automatic chain stops after this many runs (Script Property SAP_AUTO_MAX_RUNS, 1 to 30)
var SAP_AUTO_BUSY_MAX = 6;               // an automatic run that finds another run in progress waits and tries again this many times
var SAP_BUDGET_MS = 300000;              // stop reading after 5 minutes; Apps Script ends a run at 6
var SAP_RUN_STALE_MS = 480000;           // a run flag older than this belongs to a crashed run
var SAP_CHUNK_ROWS = 2500;
var SAP_RETRIES = 3;
var SAP_STAGE_COLS = ['Invoice Document Number', 'Invoice Document item', 'Invoice Date', 'Plant', 'Sold-to-Party Number', 'Sold-to-Party Description', 'Product Code', 'Invoice Qty', 'Total Amount (Item)', 'Billing Type', 'Product Type', 'Material Group 3', 'Material Group 4', 'Sales District', 'Reference Document', 'Sales Executive'];
/* Billing read shape (mapping 1.1): A = header A_BillingDocument with $expand=to_Item; B = item set A_BillingDocumentItem carrying the header fields (how the group's existing connector reads).
 * SAP_BILLING_SHAPE (Script Property) forces one; otherwise sapVerifyMetadata picks B only when A is incomplete and B is complete (saved as SAP_SHAPE); default A. */
var SAP_ITEM_FIELDS = ['BillingDocument', 'BillingDocumentItem', 'Plant', 'Material', 'BillingQuantity', 'BillingQuantityUnit', 'NetAmount', 'TransactionCurrency', 'AdditionalMaterialGroup3', 'AdditionalMaterialGroup4', 'ReferenceSDDocument'];
/* diagnostic item fields (item category, higher-level item): read ONLY when the last sapVerifyMetadata found them on the tenant (verify.diagOk), and used only to explain why a line is left out; no figure depends on them */
var SAP_DIAG_FIELDS = ['SalesDocumentItemCategory', 'HigherLevelItem'];
var SAP_TYPE_TARGETS_ = { 'LAM': 'ZABLAM', 'LAMINATE': 'ZABLAM', 'LAMINATES': 'ZABLAM', 'PVC': 'ZCBPVC', 'PVC SHEET': 'ZCBPVC', 'ZABLAM': 'ZABLAM', 'ZCRLAM': 'ZCRLAM', 'ZCBPVC': 'ZCBPVC' };
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
  { svc: 'partner', set: 'A_Customer', nav: [], props: ['Customer', 'CustomerName', 'CustomerAccountGroup', 'DeletionIndicator', 'PostingIsBlocked', 'LegacyB1Code'], opt: ['CustomerName', 'CustomerAccountGroup', 'DeletionIndicator', 'PostingIsBlocked', 'LegacyB1Code'], custOnly: ['CustomerAccountGroup', 'DeletionIndicator', 'PostingIsBlocked', 'LegacyB1Code'] },
  /* customer master read (D78, spec 1.4). scope 'cust': a GAP here blocks only the customer read, never the billing reads. Required: what the geography figures need (the in-scope test, state, PIN).
   * Optional: what no figure depends on (name, groups, terms, salesperson, sales district, city, district text, GSTIN, blocked flags, legacy code). An optional entity set (optSet) that is missing is skipped whole. */
  { svc: 'partner', set: 'A_CustomerCompany', nav: [], props: ['Customer', 'CompanyCode'], scope: 'cust' },
  { svc: 'partner', set: 'A_CustomerSalesArea', nav: [], props: ['Customer', 'CustomerGroup', 'SalesGroup', 'CustomerPaymentTerms', 'SalesDistrict'], opt: ['CustomerGroup', 'SalesGroup', 'CustomerPaymentTerms', 'SalesDistrict'], optSet: true, scope: 'cust' },
  { svc: 'partner', set: 'A_BusinessPartnerAddress', nav: [], props: ['BusinessPartner', 'AddressID', 'Region', 'PostalCode', 'CityName', 'District'], opt: ['AddressID', 'CityName', 'District'], scope: 'cust' },
  { svc: 'partner', set: 'A_BusinessPartnerTax', nav: [], props: ['BusinessPartner', 'BPTaxType', 'BPTaxNumber'], opt: ['BPTaxType', 'BPTaxNumber'], optSet: true, scope: 'cust' }];

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
  var typeMap = { Z3LM: 'ZABLAM', Z3PC: 'ZCBPVC' }, tmRaw =   /* confirmed by Vijay 9 Nov 2026: Z3LM is laminates, doors and compact boards (Material Group 3 decides which, as for ZABLAM/ZCRLAM); Z3PC is PVC sheet (as ZCBPVC). The register codes stay; the Script Property SAP_TYPE_MAP adds to or overrides these. */  String(p.getProperty('SAP_TYPE_MAP') || '').trim();
  if (tmRaw) {   // SAP_TYPE_MAP: {"<tenant ProductType>": "LAM" | "PVC"}; applied to the shadow tally and to the staged rows alike (column Product Type becomes ZABLAM or ZCBPVC, which the page's register intake already understands)
    var tm = null; try { tm = JSON.parse(tmRaw); } catch (e) { tm = null; }
    if (!tm || typeof tm !== 'object' || Array.isArray(tm)) fail_('sap_not_configured', 'SAP_TYPE_MAP must be JSON like {"ZNEW":"LAM","ZNEW2":"PVC"} (it adds to the built-in Z3LM and Z3PC). Nothing was read.');
    Object.keys(tm).forEach(function (k) {
      var key = String(k).trim().toUpperCase(), tg = SAP_TYPE_TARGETS_[String(tm[k]).trim().toUpperCase()];
      if (!key || key.length > 18) fail_('sap_not_configured', 'SAP_TYPE_MAP has an empty or too long product type. Nothing was read.');
      if (!tg) fail_('sap_not_configured', 'SAP_TYPE_MAP maps ' + key + ' to "' + String(tm[k]).slice(0, 20) + '", which is not one of LAM, PVC (or ZABLAM, ZCRLAM, ZCBPVC). Nothing was read.');
      typeMap[key] = tg;
    });
  }
  var vv = sapStatusGet_().verify, diag = (vv && vv.diagOk) || [];
  return { base: base, company: company, cancel: cancel, shape: shape, auth: 'Basic ' + Utilities.base64Encode(user + ':' + pass), skip: sapGetJson_('SAP_OPT_SKIP', []), typeMap: typeMap, diag: diag, secrets: [user, pass, p.getProperty('SAP_BASE_URL')] };
}
/* the staged / compared Product Type: the tenant's ProductType, or the register code it stands for (built-in Z3LM and Z3PC, plus SAP_TYPE_MAP). Shadow tally and staged rows both use this value, so the page's register intake, which reads ZABLAM, ZCRLAM and ZCBPVC, classifies every line exactly as the shadow does. */
function sapMapType_(cfg, t) { var k = String(t == null ? '' : t).trim().toUpperCase(); return cfg && cfg.typeMap && cfg.typeMap[k] ? cfg.typeMap[k] : t; }
function sapDiagFields_(cfg) { return SAP_DIAG_FIELDS.filter(function (f) { return (cfg.diag || []).indexOf(f) >= 0 && !sapSkipped_(cfg, 'A_BillingDocumentItem', f); }); }
function sapSkipped_(cfg, set, prop) { return !!(cfg && cfg.skip && (cfg.skip.indexOf(set + '.' + prop) >= 0 || cfg.skip.indexOf(set + '.(entity set)') >= 0)); }
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
/* the request object for one GET (UrlFetchApp.fetch and fetchAll take the same shape) */
function sapReq_(cfg, service, path, params, accept) {
  return { url: cfg.base + SAP_ROOT + service + '/' + path + (params && Object.keys(params).length ? '?' + sapQs_(params) : ''), method: 'get', muteHttpExceptions: true, headers: { Authorization: cfg.auth, Accept: accept || 'application/json' } };
}
function sapRetryable_(code) { return code === 0 || code === 408 || code === 429 || code >= 500; }
/* a refusal or a timeout that a smaller page may cure (not 401, 403, 404, 429) */
function sapShrinkable_(code) { return code === 0 || code === 400 || code === 408 || code === 413 || code === 414 || code >= 500; }
function sapThrow_(deskCode, message, httpCode, shrink) { var e = new Error(message); e.deskCode = deskCode; e.sapCode = httpCode; e.sapShrink = !!shrink; throw e; }
/* returns {code, text}; retries timeouts, 408, 429 and 5xx with growing waits (`retries` more tries, default SAP_RETRIES); never retries 401, 403, 404; a failed read raises a coded error and the caller writes nothing */
function sapHttp_(cfg, service, path, params, accept, retries) {
  var req = sapReq_(cfg, service, path, params, accept), nTry = retries === undefined || retries === null ? SAP_RETRIES : retries;
  var resp = null, code = 0, text = '', lastErr = '';
  for (var a = 0; a <= nTry; a++) {
    try { resp = UrlFetchApp.fetch(req.url, req); code = resp.getResponseCode(); text = String(resp.getContentText() || ''); lastErr = ''; }
    catch (e) { code = 0; text = ''; lastErr = sapRedact_(cfg, e && e.message || e); }
    if (sapRetryable_(code) && a < nTry) { Utilities.sleep(1000 * Math.pow(2, a)); continue; }
    break;
  }
  if (code === 200) return { code: code, text: text };
  sapHttpFail_(cfg, service, code, text, lastErr);
}
/* the coded error for a non-200 answer (same messages for a single call and a parallel one) */
function sapHttpFail_(cfg, service, code, text, lastErr) {
  var detail = '', sh = sapShrinkable_(code);
  try { var j = JSON.parse(text); var m = j && j.error && j.error.message; detail = typeof m === 'string' ? m : (m && m.value) || ''; } catch (e) { detail = ''; }
  detail = sapRedact_(cfg, detail);
  var ipNote = ' If the address and user are right, SAP may only accept calls from allow-listed IP addresses. Apps Script calls come from Google addresses that are not fixed, so ask the SAP team whether an IP allow-list is in force (open question Q31).';
  if (code === 0) sapThrow_('sap_unreachable', 'SAP could not be reached (' + (lastErr || 'no answer') + '). Check SAP_BASE_URL.' + ipNote + ' Nothing was changed.', code, sh);
  if (code === 401) sapThrow_('sap_auth', 'SAP refused the user name or password (HTTP 401). Check SAP_USER and SAP_PASSWORD. Nothing was changed.', code, sh);
  if (code === 403) sapThrow_('sap_forbidden', 'The SAP user is not allowed to read this service (HTTP 403)' + (detail ? ': ' + detail : '') + '. The user may lack the read role for this service, or an IP allow-list may be blocking the call.' + ipNote + ' Nothing was changed.', code, sh);
  if (code === 404) sapThrow_('sap_not_found', 'SAP does not know this service or entity (HTTP 404) in ' + service + '.' + (detail ? ' ' + detail : '') + ' Run sapVerifyMetadata. Nothing was changed.', code, sh);
  sapThrow_('sap_error', 'SAP answered HTTP ' + code + (detail ? ': ' + detail : '') + '. Nothing was changed.', code, sh);
}
/* several GETs at once (UrlFetchApp.fetchAll). Never retries and never throws: every entry is {code, text, err}; if fetchAll itself fails (a timeout or network error fails the whole call) every entry is code 0 and the caller decides. */
function sapFetchMany_(cfg, reqs) {
  var rs = reqs.map(function (r) { return sapReq_(cfg, r.svc, r.path, r.params, r.accept); });
  try {
    return UrlFetchApp.fetchAll(rs).map(function (x) {
      try { return { code: x.getResponseCode(), text: String(x.getContentText() || ''), err: '' }; } catch (e) { return { code: 0, text: '', err: sapRedact_(cfg, e && e.message || e) }; }
    });
  } catch (e) {
    var m = sapRedact_(cfg, e && e.message || e);
    return reqs.map(function () { return { code: 0, text: '', err: m }; });
  }
}
function sapJson_(cfg, r) {
  var o; try { o = JSON.parse(r.text); } catch (e) { sapThrow_('sap_error', 'SAP sent an answer that is not JSON. Nothing was changed.', 200, true); }   // a cut-off answer: a smaller page may cure it
  var d = o && o.d; if (!d) sapThrow_('sap_error', 'SAP sent an answer without data. Nothing was changed.', 200, true);
  var res = Array.isArray(d.results) ? d.results : Array.isArray(d) ? d : [d];
  return { results: res, count: d.__count !== undefined ? +d.__count : null, next: d.__next || null, d: d };
}

/* ---------- paging: page size, fallback to a smaller page, pages read in parallel ---------- */
function sapIntProp_(key, lo, hi, dflt) {
  var v = parseInt(String(sapProps_().getProperty(key) || '').trim(), 10);
  return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
}
/* the page settings for one run. SAP_PAGE_EFF holds a smaller size learned earlier (a refused or timed-out page, or a server that caps its pages); it applies only while SAP_PAGE_TOP is unchanged. Delete SAP_PAGE_EFF to try the full size again. */
function sapPager_() {
  var want = sapIntProp_('SAP_PAGE_TOP', 10, SAP_PAGE_MAX, SAP_PAGE_TOP), eff = sapGetJson_('SAP_PAGE_EFF', null), top = want;
  if (eff && eff.want === want && eff.top >= 1 && eff.top < want) top = eff.top;
  return { want: want, top: top, min: Math.min(SAP_PAGE_MIN, want), conc: sapIntProp_('SAP_CONCURRENCY', 1, SAP_CONCURRENCY_MAX, SAP_CONCURRENCY), notes: [], lb: sapIntProp_('SAP_LOOKUP_BATCH', 5, 40, SAP_LOOKUP_BATCH), lg: 0, groupMs: 0 };
}
function sapPageLearn_(pg, top, why) {
  pg.top = top; pg.notes.push(why + ': page size now ' + top);
  try { sapSetJson_('SAP_PAGE_EFF', { want: pg.want, top: top, at: new Date(Date.now()).toISOString(), why: why }); } catch (e) {}
}
/* SAP refused or timed out: halve the page (never below the minimum). false when it cannot go lower or the error is not one a smaller page can cure. */
function sapShrink_(pg, e) {
  if (!e || !e.sapShrink || pg.top <= pg.min) return false;
  sapPageLearn_(pg, Math.max(pg.min, Math.floor(pg.top / 2)), e.sapCode ? 'SAP answered HTTP ' + e.sapCode : 'SAP timed out');
  return true;
}
/* the server returned fewer rows than asked although more exist: it caps its pages; use its size */
function sapCap_(pg, got) { if (got >= 1 && got < pg.top) sapPageLearn_(pg, got, 'SAP caps its pages'); }
/* one page; mk(skip, top) builds the query. A first try at a larger page is retried once, then the page is halved and the same rows asked again. */
function sapPage_(cfg, pg, svc, path, mk, skip) {
  for (;;) {
    var top = pg.top;
    try { return { skip: skip, top: top, res: sapJson_(cfg, sapHttp_(cfg, svc, path, mk(skip, top), null, top > pg.min ? 1 : SAP_RETRIES)) }; }
    catch (e) { if (!sapShrink_(pg, e)) throw e; }
  }
}
/* the next run of pages starting at skip, in order, as [{skip, top, res}]. With the count known and concurrency above 1 up to pg.conc pages go out together; a page that comes back short (a server cap) or failed ends the run of pages there, so what is returned is always contiguous from skip. Pages are never skipped or read twice. */
function sapBatch_(cfg, pg, svc, path, mk, skip, total) {
  var n = 1;
  if (total !== null && total !== undefined && pg.conc > 1) n = Math.min(pg.conc, Math.ceil((total - skip) / pg.top));
  if (!(n > 1)) return [sapPage_(cfg, pg, svc, path, mk, skip)];
  var top = pg.top, reqs = [], k;
  for (k = 0; k < n; k++) reqs.push({ svc: svc, path: path, params: mk(skip + k * top, top) });
  var ents = sapFetchMany_(cfg, reqs), out = [];
  for (k = 0; k < n; k++) {
    var ent = ents[k], res = null, bad = null, at = skip + k * top;
    try { if (ent.code === 200) res = sapJson_(cfg, ent); else sapHttpFail_(cfg, svc, ent.code, ent.text, ent.err); } catch (e) { bad = e; }
    if (bad) {
      if (!bad.sapShrink && ent.code !== 429) throw bad;   // 401, 403, 404 and the like: stop with the same message as a single call
      pg.conc = Math.max(1, Math.floor(pg.conc / 2)); pg.notes.push('a parallel read failed: reading ' + pg.conc + ' page(s) at a time');
      if (k === 0) return [sapPage_(cfg, pg, svc, path, mk, skip)];   // one page, with its own retries and smaller pages
      break;
    }
    out.push({ skip: at, top: top, res: res });
    if (res.results.length < Math.min(top, total - at)) { sapCap_(pg, res.results.length); break; }
  }
  return out;
}
/* a parallel answer as parsed JSON; null when it should be tried again on its own (timeout, 408, 429, 5xx, cut-off answer); throws at once for 401, 403, 404 and the like with the same message a single call gives */
function sapEntJson_(cfg, svc, ent) {
  try { if (ent.code === 200) return sapJson_(cfg, ent); sapHttpFail_(cfg, svc, ent.code, ent.text, ent.err); }
  catch (e) { if (e.sapShrink || ent.code === 429) return null; throw e; }
  return null;
}
var SAP_MONTHS_ = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function sapMonthName_(ym) { var m = /^(\d{4})-(\d\d)$/.exec(String(ym || '')); return m && SAP_MONTHS_[+m[2] - 1] ? SAP_MONTHS_[+m[2] - 1] + ' ' + m[1] : String(ym || ''); }
function sapFeedMonthName_() { return sapMonthName_(sapYm_(SAP_FEED_FROM)); }
function sapFmt_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

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
/* the card state must never be the reason a finished result is lost: when it would pass the 9,000-character limit the least important parts are cut first (older run log, warnings, notes) */
function sapStatusSave_(s) {
  var cuts = [function () {}, function () { s.runLog = (s.runLog || []).slice(-2); s.warnings = (s.warnings || []).slice(-1); s.errors = (s.errors || []).slice(0, 1); if (s.progress) s.progress.notes = []; },
    function () { delete s.runLog; delete s.warnings; if (s.progress) { delete s.progress.resume; } }, function () { s.errors = []; if (s.shadow && s.shadow.top) delete s.shadow.top; }];
  for (var i = 0; i < cuts.length; i++) { cuts[i](); if (JSON.stringify(s).length <= 9000) break; }
  sapSetJson_('SAP_STATUS', s);
}
function sapStatusPatch_(patch) { var s = sapStatusGet_(); Object.keys(patch).forEach(function (k) { s[k] = patch[k]; }); sapStatusSave_(s); return s; }
function sapErrPush_(cfg, msg) {
  var s = sapStatusGet_(), e = s.errors || [];
  e.unshift({ at: new Date(Date.now()).toISOString(), msg: sapRedact_(cfg, msg).slice(0, 200) });
  sapStatusPatch_({ errors: e.slice(0, 3) });
}
function sapMissing_() { var p = sapProps_(), m = []; ['SAP_BASE_URL', 'SAP_USER', 'SAP_PASSWORD'].forEach(function (k) { if (!String(p.getProperty(k) || '').trim()) m.push(k); }); return m; }
function sapTriggerOn_() { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sapSyncTrigger_'; }); }
function sapNext_(s, missing, trig) {
  if (missing.length) return 'Set ' + missing.join(', ') + ' in the Apps Script project (Project Settings, Script properties). Then run sapVerifyMetadata.';
  if (s.resume) return 'The last sync stopped at its 5-minute run limit (SAP_RUN_BUDGET_MS). Run sapSyncAuto once to finish it without more clicks (the daily trigger also continues it).';
  if (!s.verify || s.verify.failed || (s.verify.blockingSales !== undefined ? s.verify.blockingSales.length : !s.verify.ok)) return s.verify && s.verify.failed ? 'The last sapVerifyMetadata did not finish. Run it again.' : s.verify ? 'SAP lacks ' + s.verify.gaps + ' required name(s) (' + (s.verify.blockingSales || s.verify.blocking || []).join(', ') + '). Send the sapVerifyMetadata result to the Delivery Lead.' : 'Run sapVerifyMetadata once to check the SAP service names.';
  if (!s.shadow) return 'Run sapShadowRunAuto (' + sapFeedMonthName_() + ', writes nothing; it continues by itself if one run is not enough) and show Vijay the differences. The first real run needs his OK.';
  if (s.unresolved && s.unresolved.rows) return 'Credit memos for ' + s.unresolved.months.join(', ') + ' are not loaded: ' + s.unresolved.rows + ' lines use product codes that are not in the item master. Load the item master with the S/4 codes (Q18). Credit coverage stays off until this is zero.';
  var pend = Object.keys(s.staged || {}).filter(function (k) { return s.staged[k].status !== 'loaded'; });
  if (String(sapProps_().getProperty('SAP_SYNC_ENABLED') || '').trim().toLowerCase() !== 'yes') return 'sapSync is off. After Vijay accepts the shadow run, the Delivery Lead tells you when to set the Script Property SAP_SYNC_ENABLED to yes.';
  if (!s.lastSync) return 'Run sapSync to fetch the SAP rows. They wait here until a Super admin clicks Load SAP feed.';
  if (pend.length) return 'Click Load SAP feed to put ' + pend.join(', ') + ' into the Desk.';
  return trig ? 'Up to date. The daily run keeps it so.' : 'Up to date. Run sapInstallDailyTrigger to switch on the daily run.';
}
function sapAutoView_() {
  var a = sapGetJson_('SAP_AUTO', null); if (!a) return null;
  try { var K = SAP_AUTO_KINDS[a.kind] || SAP_AUTO_KINDS.shadow, waiting = sapAutoTriggers_(a.kind || 'shadow').length > 0; a.waiting = waiting; a.stale = !waiting && !sapRunBusy_(); if (a.stale) a.note = 'An automatic ' + K.label + ' was cut off and no trigger is waiting. Run ' + K.name + ' to carry on from the saved position.'; } catch (e) {}
  return a;
}
function sapPagingView_() {
  var pg = sapPager_(); return { pageTop: pg.top, pageTopSet: pg.want, concurrency: pg.conc, lookupBatch: sapIntProp_('SAP_LOOKUP_BATCH', 5, 40, SAP_LOOKUP_BATCH), learned: pg.top < pg.want };
}
function sapStatusView_() {
  var s = sapStatusGet_(), miss = sapMissing_(), trig = false;
  try { trig = sapTriggerOn_(); } catch (e) {}
  s.resume = !!sapGetJson_('SAP_CURSOR', null); var shCur = sapGetJson_('SAP_CURSOR_SHADOW', null);
  return { configured: !miss.length, missing: miss, connected: !miss.length && !!(s.conn && s.conn.ok), trigger: trig,
    lastAt: s.lastAt || '', lastKind: s.lastKind || '', lastOk: s.lastOk !== false, message: s.message || '',
    read: s.read || { headers: 0, lines: 0 }, staged: s.staged || {}, stagedRows: s.stagedRows || 0, loaded: s.loaded || { rows: 0, at: '' },
    errors: s.errors || [], shadow: s.shadow || null, verify: s.verify || null, unresolved: s.unresolved || null, skippedMonths: s.skippedMonths || [], resume: s.resume,
    feedFrom: SAP_FEED_FROM, cancelMode: String(sapProps_().getProperty('CANCEL_MODE') || 'exclude').toLowerCase() === 'mirror' ? 'mirror' : 'exclude',
    cust: s.cust || null, progress: s.progress || null, runLog: s.runLog || [], warnings: s.warnings || [], paging: sapPagingView_(), auto: sapAutoView_(),
    next: ((sapAutoView_() || {}).stale ? sapAutoView_().note + ' ' : '') + (shCur && s.progress && s.progress.kind === 'shadow' && !s.progress.done ? 'The shadow run is part-way (' + s.progress.text + ') Run sapShadowRunAuto to finish it without more clicks. ' : '') + sapNext_(s, miss, trig) + (s.cust && s.cust.status === 'staged' ? ' Customer master: ' + (s.cust.rows || 0) + ' customers are staged; click Load SAP feed to put them into the Desk.' : '') };
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
function sapChunkOps_(ym, run, seq, rows, out, idFn) {
  var z = sapGz_(rows);
  if (z.length > 200000 && rows.length > 1) { var h = Math.ceil(rows.length / 2); seq = sapChunkOps_(ym, run, seq, rows.slice(0, h), out, idFn); return sapChunkOps_(ym, run, seq, rows.slice(h), out, idFn); }
  out.push({ op: 'set', col: 'sapstage', id: (idFn || sapChunkId_)(ym, run, seq), json: JSON.stringify({ ym: ym, run: run, seq: seq, n: rows.length, z: z }) });
  return seq + 1;
}

/* ---------- classification of one billing document and its items ---------- */
function sapNewCnt_() { return { headers: 0, lines: 0, sales: 0, credit: 0, salesValue: 0, creditValue: 0, cancelledDropped: 0, cancelDocs: 0, otherTypes: {}, acp: 0, noPlant: 0, flagged: 0, flaggedValue: 0, otherCompany: 0, beforeCutoff: 0, plants: {}, cancelLines: 0, cancelledLines: 0, otherCompanyLines: 0, beforeCutoffLines: 0, kept: 0, dupItems: 0, maxItems: 0, hist: {}, byPlant: {} }; }
var SAP_CNT_NUMS_ = ['headers', 'lines', 'sales', 'credit', 'salesValue', 'creditValue', 'cancelledDropped', 'cancelDocs', 'acp', 'noPlant', 'flagged', 'flaggedValue', 'otherCompany', 'beforeCutoff', 'cancelLines', 'cancelledLines', 'otherCompanyLines', 'beforeCutoffLines', 'kept', 'dupItems'];
/* adds the counts of one month (c) to a running total (sum) */
function sapCntAdd_(sum, c) {
  SAP_CNT_NUMS_.forEach(function (k) { sum[k] = (sum[k] || 0) + (c[k] || 0); });
  sum.maxItems = Math.max(sum.maxItems || 0, c.maxItems || 0);
  ['hist', 'byPlant'].forEach(function (m) { var t = sum[m] || (sum[m] = {}); Object.keys(c[m] || {}).forEach(function (k) { if (k in t || Object.keys(t).length < 12) t[k] = (t[k] || 0) + c[m][k]; }); });
  var ot = sum.otherTypes || (sum.otherTypes = {}); Object.keys(c.otherTypes || {}).forEach(function (k) { var o = ot[k] || (ot[k] = { n: 0, v: 0 }); o.n += c.otherTypes[k].n; o.v += c.otherTypes[k].v; });
  return sum;
}
/* where every line SAP sent went. kept = lines that became register-layout rows; the others are left out by rule and counted by reason; unexplained must be 0 */
function sapLineBreakdown_(c) {
  var ot = 0; Object.keys(c.otherTypes || {}).forEach(function (k) { ot += c.otherTypes[k].n; });
  var b = { lines: c.lines, headers: c.headers, perDocument: c.headers ? Math.round(100 * c.lines / c.headers) / 100 : 0, mostInOneDocument: c.maxItems || 0, docsByItemCount: c.hist || {}, repeatedItemNumbersInADocument: c.dupItems || 0, kept: c.kept, acpPlants1050Up: c.acp, noPlant: c.noPlant, notSheetUnitOrNotINR: c.flagged, cancelledInvoices: c.cancelledLines, cancellationDocuments: c.cancelLines, otherDocumentTypes: ot, otherCompany: c.otherCompanyLines, beforeFeedStart: c.beforeCutoffLines, linesByPlant: c.byPlant || {} };
  b.unexplained = c.lines - (c.kept + c.acp + c.noPlant + c.flagged + c.cancelledLines + c.cancelLines + ot + c.otherCompanyLines + c.beforeCutoffLines);
  return b;
}
function sapLineText_(b) {
  return 'SAP sent ' + sapFmt_(b.lines) + ' lines for ' + sapFmt_(b.headers) + ' documents (' + b.perDocument + ' per document, most in one document ' + b.mostInOneDocument + '). Where they went: made into rows ' + sapFmt_(b.kept) + '; plants 1050 and up (ACP) ' + sapFmt_(b.acpPlants1050Up) + '; no plant ' + sapFmt_(b.noPlant) + '; not a sheet unit or not INR ' + sapFmt_(b.notSheetUnitOrNotINR) + '; cancelled invoices ' + sapFmt_(b.cancelledInvoices) + '; cancellation documents ' + sapFmt_(b.cancellationDocuments) + '; other document types ' + sapFmt_(b.otherDocumentTypes) + '; other company ' + sapFmt_(b.otherCompany) + '; before the feed start ' + sapFmt_(b.beforeFeedStart) + '; unexplained ' + sapFmt_(b.unexplained) + (b.repeatedItemNumbersInADocument ? '; ' + sapFmt_(b.repeatedItemNumbersInADocument) + ' item numbers repeat inside their document' : '') + '.';
}
/* returns rows (register layout, product type and customer name still blank) with the raw lookup keys, for one header */
function sapDocRows_(cfg, h, cnt) {
  cnt.headers++;
  var type = String(h.BillingDocumentType || '').trim().toUpperCase(), date = sapDate_(h.BillingDocumentDate), cancelled = sapBool_(h.BillingDocumentIsCancelled);
  var items = (h.to_Item && (h.to_Item.results || h.to_Item)) || [];
  if (!Array.isArray(items)) items = [];
  cnt.lines += items.length;
  var nIt = items.length, hb = nIt <= 1 ? '1' : nIt <= 3 ? '2-3' : nIt <= 10 ? '4-10' : nIt <= 50 ? '11-50' : '51+', seenIt = {};
  if (nIt > cnt.maxItems) cnt.maxItems = nIt; cnt.hist[hb] = (cnt.hist[hb] || 0) + 1;
  items.forEach(function (it) { var ik = String(it.BillingDocumentItem == null ? '' : it.BillingDocumentItem); if (seenIt[ik]) cnt.dupItems++; seenIt[ik] = 1; });
  if (h.CompanyCode && String(h.CompanyCode).trim() !== cfg.company) { cnt.otherCompany++; cnt.otherCompanyLines += nIt; return []; }
  if (!date || date < SAP_FEED_FROM) { cnt.beforeCutoff++; cnt.beforeCutoffLines += nIt; return []; }
  var kind = '';
  if (SAP_CANCEL_TYPES.indexOf(type) >= 0) {
    cnt.cancelDocs++;
    if (cfg.cancel === 'mirror' && type === 'S1') kind = 'credit'; else { cnt.cancelLines += nIt; return []; }   // exclude: the cancellation and the document it cancels both stay out
  } else if (cancelled) {
    if (cfg.cancel === 'mirror' && SAP_SALES_TYPES.indexOf(type) >= 0) kind = 'sales'; else { cnt.cancelledDropped++; cnt.cancelledLines += nIt; return []; }
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
    if (plant && (plant in cnt.byPlant || Object.keys(cnt.byPlant).length < 12)) cnt.byPlant[plant] = (cnt.byPlant[plant] || 0) + 1;
    if (!plant) { cnt.noPlant++; return; }
    if (/^\d+$/.test(plant) && +plant > SAP_PLANT_LAST) { cnt.acp++; return; }
    var unit = String(it.BillingQuantityUnit || '').trim().toUpperCase(), cur = String(it.TransactionCurrency || h.TransactionCurrency || 'INR').trim().toUpperCase();
    if ((unit && SAP_SHEET_UNITS.indexOf(unit) < 0) || cur !== 'INR') { cnt.flagged++; cnt.flaggedValue += isNaN(net) ? 0 : net; return; }
    var qty = sapNum_(it.BillingQuantity);
    out.push({ rawMat: String(it.Material == null ? '' : it.Material).trim(), rawCust: String(h.SoldToParty == null ? '' : h.SoldToParty).trim(), kind: kind, u: unit, ic: String(it.SalesDocumentItemCategory == null ? '' : it.SalesDocumentItemCategory).trim(), hl: String(it.HigherLevelItem == null ? '' : it.HigherLevelItem).trim().replace(/^0+/, ''), hasDiag: it.SalesDocumentItemCategory !== undefined || it.HigherLevelItem !== undefined,
      row: [doc, sapTrim0_(it.BillingDocumentItem), date, plant, cust, '', sapTrim0_(it.Material), isNaN(qty) ? String(it.BillingQuantity == null ? '' : it.BillingQuantity) : qty, isNaN(net) ? String(it.NetAmount == null ? '' : it.NetAmount) : net,
        type, '', String(it.AdditionalMaterialGroup3 == null ? '' : it.AdditionalMaterialGroup3).trim(), String(it.AdditionalMaterialGroup4 == null ? '' : it.AdditionalMaterialGroup4).trim(), '', sapTrim0_(it.ReferenceSDDocument), ''] });   // column 14 (Sales District) stays blank
  });
  cnt.kept += out.length;
  return out;
}
/* product type and customer name: read by key in batches (parallel, pg.lb keys per call), cached for the run and in the script cache (in bulk, after every group, so a run stopped by the time budget keeps what it has fetched). `stop()` says the run budget cannot take another group: the function then throws a stop signal, never before one group has been fetched in this run (so every run makes progress). */
function sapStopSignal_() { var e = new Error('run budget used'); e.deskCode = 'sap_budget_stop'; e.sapStop = true; return e; }
function sapLookups_(cfg, ctx, entries, pg, stop) {
  var cache = CacheService.getScriptCache(), conc = pg ? pg.conc : 1;
  function cacheGet(prefix, ids) {   // one call for up to 100 keys (a call per key costs tens of milliseconds each)
    var out = {};
    if (typeof cache.getAll === 'function') { for (var i = 0; i < ids.length; i += 100) { try { var g = cache.getAll(ids.slice(i, i + 100).map(function (x) { return prefix + x; })) || {}; Object.keys(g).forEach(function (k) { if (g[k] !== null && g[k] !== undefined) out[k.slice(prefix.length)] = g[k]; }); } catch (e) {} } return out; }
    ids.forEach(function (id) { var c = cache.get(prefix + id); if (c !== null && c !== undefined) out[id] = c; }); return out;
  }
  function cachePut(prefix, map, ids) {
    if (typeof cache.putAll === 'function') { for (var i = 0; i < ids.length; i += 100) { var o = {}; ids.slice(i, i + 100).forEach(function (x) { o[prefix + x] = map[x]; }); try { cache.putAll(o, 21600); } catch (e) {} } return; }
    ids.forEach(function (x) { try { cache.put(prefix + x, map[x], 21600); } catch (e) {} });
  }
  function need(map, prefix, ids) {
    var miss = [], want = ids.filter(function (id) { return id !== '' && !(id in map); }), hit = cacheGet(prefix, want);
    ids.forEach(function (id) { if (id === '' || id in map) return; var c = hit[id]; if (c !== null && c !== undefined) { map[id] = c; return; } if (/^[A-Za-z0-9_\-\/ ]{1,40}$/.test(id)) { if (miss.indexOf(id) < 0) miss.push(id); } else map[id] = ''; });
    return miss;
  }
  function fetchSet(svc, set, key, field, map, prefix, miss) {
    var queue = miss.slice();
    function params(part, skip) {
      var p = { '$filter': part.map(function (x) { return key + ' eq ' + sapQ_(x); }).join(' or '), '$select': key + ',' + field, '$top': String(part.length * 2), '$orderby': key + ' asc' };
      p['$skip'] = String(skip); if (skip === 0) p['$inlinecount'] = 'allpages'; return p;
    }
    while (queue.length) {
      if (stop && pg.lg > 0 && stop()) throw sapStopSignal_();
      var grp = [], gi, tg = Date.now(), back = [];
      for (gi = 0; gi < conc && queue.length; gi++) grp.push(queue.splice(0, pg.lb));
      var ents = grp.length > 1 ? sapFetchMany_(cfg, grp.map(function (part) { return { svc: svc, path: set, params: params(part, 0) }; })) : null;
      grp.forEach(function (part, jx) {
        var r = null;
        try {
          if (ents) r = sapEntJson_(cfg, svc, ents[jx]);
          if (!r) r = sapJson_(cfg, sapHttp_(cfg, svc, set, params(part, 0), null, pg.lb > 5 ? 1 : SAP_RETRIES));   // a single call: retries and the same messages
          var got = 0, total = r.count;
          for (;;) {   // a server may cap the page size: keep reading until the count is reached or a page is empty
            r.results.forEach(function (o) { map[String(o[key])] = String(o[field] == null ? '' : o[field]); });
            got += r.results.length;
            if (!r.results.length || (total !== null && got >= total)) break;
            r = sapJson_(cfg, sapHttp_(cfg, svc, set, params(part, got)));
          }
        } catch (e) {
          if (e.sapShrink && pg.lb > 5) { pg.lb = Math.max(5, Math.floor(pg.lb / 2)); pg.notes.push('a lookup call was refused: ' + pg.lb + ' keys per call now'); back = back.concat(part); return; }   // a long address may be the cause: smaller batches, same keys
          throw e;
        }
        part.forEach(function (x) { if (!(x in map)) map[x] = ''; }); cachePut(prefix, map, part);
      });
      if (back.length) queue = back.concat(queue);
      pg.lg++; pg.groupMs = Math.max(pg.groupMs, Date.now() - tg);
    }
  }
  var mats = [], custs = [], seenM = Object.create(null), seenC = Object.create(null);
  entries.forEach(function (e) { if (!seenM[e.rawMat]) { seenM[e.rawMat] = 1; mats.push(e.rawMat); } if (!seenC[e.rawCust]) { seenC[e.rawCust] = 1; custs.push(e.rawCust); } });
  fetchSet(SAP_SVC.product, 'A_Product', 'Product', 'ProductType', ctx.prod, 'sapp_', need(ctx.prod, 'sapp_', mats));
  if (!sapSkipped_(cfg, 'A_Customer', 'CustomerName')) fetchSet(SAP_SVC.partner, 'A_Customer', 'Customer', 'CustomerName', ctx.cust, 'sapc_', need(ctx.cust, 'sapc_', custs));
  entries.forEach(function (e) { e.row[10] = sapMapType_(cfg, ctx.prod[e.rawMat] || ''); e.row[5] = String(ctx.cust[e.rawCust] || '').slice(0, 60); });
}

/* ---------- reading one month of headers (with items), page by page ---------- */
var SAP_HDR_SEL_ = ['BillingDocument', 'BillingDocumentType', 'BillingDocumentDate', 'CompanyCode', 'SoldToParty', 'BillingDocumentIsCancelled', 'CancelledBillingDocument', 'LastChangeDate', 'TransactionCurrency'];
function sapHdrSelect_(cfg) {
  return SAP_HDR_SEL_.concat(SAP_ITEM_FIELDS.filter(function (f) { return f !== 'BillingDocument' && !sapSkipped_(cfg, 'A_BillingDocumentItem', f); }).concat(sapDiagFields_(cfg)).map(function (f) { return 'to_Item/' + f; })).join(',');
}
function sapMonthFilter_(cfg, ym, extra) {
  return 'CompanyCode eq ' + sapQ_(cfg.company) + ' and BillingDocumentDate ge ' + sapDtLit_(ym + '-01') + ' and BillingDocumentDate lt ' + sapDtLit_(sapNextYm_(ym) + '-01') + (extra ? ' and ' + extra : '');
}
function sapItemSelect_(cfg) { return SAP_ITEM_FIELDS.filter(function (f) { return !sapSkipped_(cfg, 'A_BillingDocumentItem', f); }).concat(sapDiagFields_(cfg)).concat(SAP_HDR_FIELDS).join(','); }
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
/* what to ask for one month. Paging is by KEY, never by $skip: a slice of the month is a range of BillingDocument numbers read in order, each page asking for "BillingDocument gt <last one read>". Documents added, changed or cancelled between pages or between runs therefore cannot shift what is read (with $skip they did). mk(slice, top) is the query for one page; plan(order, withCount) the one-row query that finds the first / last document and the count. */
function sapMonthSpec_(cfg, ym) {
  var path, sel, ord;
  if (cfg.shape === 'B') { path = 'A_BillingDocumentItem'; sel = sapItemSelect_(cfg); ord = 'BillingDocument asc,BillingDocumentItem asc'; }
  else { path = 'A_BillingDocument'; sel = sapHdrSelect_(cfg); ord = 'BillingDocument asc'; }
  function filt(sl, noLast) {
    var x = [];
    if (sl) { if (sl.last && !noLast) x.push('BillingDocument gt ' + sapQ_(sl.last)); else if (sl.lo) x.push('BillingDocument ge ' + sapQ_(sl.lo)); if (sl.hi) x.push('BillingDocument lt ' + sapQ_(sl.hi)); }
    return sapMonthFilter_(cfg, ym, x.join(' and '));
  }
  return { path: path,
    mk: function (sl, top) { var p = { '$filter': filt(sl) }; if (cfg.shape !== 'B') p['$expand'] = 'to_Item'; p['$select'] = sel; p['$orderby'] = ord; p['$top'] = String(top); return p; },
    count: function (sl) { return { '$filter': filt(sl, true), '$select': 'BillingDocument', '$orderby': 'BillingDocument asc', '$top': '1', '$inlinecount': 'allpages' }; },
    doc: function (id, skip, top) { return { '$filter': sapMonthFilter_(cfg, ym, 'BillingDocument eq ' + sapQ_(id)), '$select': sel, '$orderby': ord, '$top': String(top), '$skip': String(skip) }; },
    plan: function (order, withCount) { var p = { '$filter': filt(null), '$select': 'BillingDocument', '$orderby': 'BillingDocument ' + order, '$top': '1' }; if (withCount) p['$inlinecount'] = 'allpages'; return p; } };
}
/* the slices of a month: the count and the first and last document number come from two one-row calls (together); when the month needs more than one page it is cut into up to pg.conc equal ranges of document numbers (the first has no lower bound and the last no upper bound, so nothing can fall outside) */
function sapPlanSlices_(cfg, pg, spec, job) {
  var reqs = [{ svc: SAP_SVC.billing, path: spec.path, params: spec.plan('asc', true) }, { svc: SAP_SVC.billing, path: spec.path, params: spec.plan('desc', false) }], rs = [null, null];
  var ents = pg.conc > 1 ? sapFetchMany_(cfg, reqs) : null;
  reqs.forEach(function (rq, k) {
    if (ents) rs[k] = sapEntJson_(cfg, rq.svc, ents[k]);
    if (!rs[k]) rs[k] = sapJson_(cfg, sapHttp_(cfg, rq.svc, rq.path, rq.params));
  });
  var total = rs[0].count, first = rs[0].results.length ? String(rs[0].results[0].BillingDocument) : '', lastDoc = rs[1].results.length ? String(rs[1].results[0].BillingDocument) : '';
  job.total = total;
  if (!first) { job.sl = []; return; }
  var n = total !== null ? Math.max(1, Math.min(pg.conc, Math.ceil(total / pg.top))) : 1, sl = [];
  if (n > 1 && /^\d+$/.test(first) && /^\d+$/.test(lastDoc) && first.length === lastDoc.length && +lastDoc > +first) {
    var a = +first, span = +lastDoc - a + 1, edges = [];
    for (var k = 1; k < n; k++) edges.push(String(a + Math.floor(k * span / n)).padStart(first.length, '0'));
    for (var q = 0; q < n; q++) sl.push({ lo: q === 0 ? '' : edges[q - 1], hi: q === n - 1 ? '' : edges[q], last: '', n: 0, done: false });
  } else sl.push({ lo: '', hi: '', last: '', n: 0, done: false });
  job.sl = sl;
}
/* shape B: all the items of one document (a full page that was one document: the rest of its items cannot be reached by "after this document") */
function sapDocItems_(cfg, pg, spec, id) {
  var out = [], skip = 0, top = Math.max(pg.top, 200), r;
  for (;;) {
    r = sapJson_(cfg, sapHttp_(cfg, SAP_SVC.billing, spec.path, spec.doc(id, skip, top)));
    r.results.forEach(function (x) { out.push(x); }); skip += r.results.length;
    if (!r.results.length || (r.results.length < top && !r.next)) break;
  }
  return out;
}
/* at the end of a month: what SAP counts now in each range, against what was read. Documents numbered behind the read position (or removed) while a month took several runs are not re-read; this finds them by count and says so, with both numbers. Never throws. */
function sapMonthEndCheck_(cfg, pg, spec, job) {
  try {
    var reqs = job.sl.map(function (sl) { return { svc: SAP_SVC.billing, path: spec.path, params: spec.count(sl) }; }), ents = reqs.length > 1 ? sapFetchMany_(cfg, reqs) : null, diffs = [], live = 0, known = true;
    reqs.forEach(function (rq, k) {
      var r = null; if (ents) r = sapEntJson_(cfg, rq.svc, ents[k]);
      if (!r) r = sapJson_(cfg, sapHttp_(cfg, rq.svc, rq.path, rq.params));
      if (r.count === null) { known = false; return; }
      live += r.count; var sl = job.sl[k];
      if (r.count !== sl.n) diffs.push('numbers ' + (sl.lo || 'first') + ' to ' + (sl.hi || 'last') + ': SAP counts ' + r.count + ', read ' + sl.n);
    });
    return { known: known, live: live, diffs: diffs };
  } catch (e) { return null; }
}
/* one page for each slice in `pass`, together when there is more than one; a slice whose page failed is read again on its own (full retries, then smaller pages). Returns [{res, top}] in the order of pass. */
function sapRound_(cfg, pg, spec, pass) {
  var ents = pass.length > 1 ? sapFetchMany_(cfg, pass.map(function (sl) { return { svc: SAP_SVC.billing, path: spec.path, params: spec.mk(sl, pg.top) }; })) : null, top0 = pg.top, out = [];
  pass.forEach(function (sl, k) {
    var res = null;
    if (ents) {
      var ent = ents[k];
      try { if (ent.code === 200) res = sapJson_(cfg, ent); else sapHttpFail_(cfg, SAP_SVC.billing, ent.code, ent.text, ent.err); }
      catch (e) { if (!e.sapShrink && ent.code !== 429) throw e; res = null; pg.conc = Math.max(1, Math.floor(pg.conc / 2)); pg.notes.push('a parallel read failed: reading ' + pg.conc + ' at a time'); }
    }
    if (res) out.push({ res: res, top: top0 });
    else { var one = sapPage_(cfg, pg, SAP_SVC.billing, spec.path, function (skip, top) { return spec.mk(sl, top); }, 0); out.push({ res: one.res, top: one.top }); }
  });
  return out;
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
      '$orderby': 'BillingDocument asc', '$inlinecount': 'allpages' }, skip = 0, cancelled = [], pages = 0, big = false, pgp = sapPager_();
    var mkp = function (sk, top) { var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; }); q['$top'] = String(top); q['$skip'] = String(sk); return q; };
    for (;;) {
      var r = sapPage_(cfg, pgp, SAP_SVC.billing, cfg.shape === 'B' ? 'A_BillingDocumentItem' : 'A_BillingDocument', mkp, skip).res; pages++;
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
  var j = { job: kind, run: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4), months: months, i: 0, skip: 0, total: null, seq: 0, cnt: sapNewCnt_(), maxChange: '', at: new Date(Date.now()).toISOString(), runs: 0, lines0: 0, units0: 0 };
  Object.keys(extra || {}).forEach(function (k) { j[k] = extra[k]; });
  return j;
}
/* the saved read position. An unreadable value is an error that keeps it (the old reader treated it as "no position" and started the month again without a word); a missing one says why. */
function sapCursorGet_(key) {
  var v = sapProps_().getProperty(key);
  if (!v) return { job: null, why: 'no saved read position' };
  try { var j = JSON.parse(v); if (j && typeof j === 'object' && j.months && j.months.length) return { job: j, why: '' }; } catch (e) { /* falls through */ }
  fail_('unavailable', 'The saved read position (' + key + ', ' + String(v).length + ' characters) cannot be read. It was left as it is and nothing was read. Send this message to the Delivery Lead; run sapResetCursors only if told to discard it.');
}
function sapResumeInfo_(job, kind, why) {   // what the run line says about resuming: true or false, why, and where from
  var legacy = job && job.skip > 0 && !job.sl;
  return { resumed: !!job && !legacy, reason: job ? (legacy ? 'a position saved by the older $skip paging cannot be continued by key; the month starts again with clean counts' : 'continuing the saved position') : why, skip: job ? job.skip : 0, total: job ? job.total : null, run: job ? (job.runs || 0) + 1 : 1, kind: kind };
}
function sapCursorKey_(kind) { return kind === 'shadow' ? 'SAP_CURSOR_SHADOW' : 'SAP_CURSOR'; }   // a shadow run never touches a paused sync's cursor
function sapSaveCursor_(job) { sapSetJson_(sapCursorKey_(job.job), job); }
/* runs until every month is done or the time budget is used. Returns {done}. Staged chunks are written before the cursor moves past them. */
function sapRunJob_(cfg, job, t0, budget, handlers) {
  var ctx = { prod: Object.create(null), cust: Object.create(null) }, buf = [], pg = sapPager_(), spec = null, specYm = '', slowest = 0;
  job.runs = (job.runs || 0) + 1; job.lines0 = job.lines0 || 0; job.units0 = job.units0 || 0;
  var u0 = job.units0 + job.skip;
  function flush() {
    if (!buf.length || !handlers.stage) { buf = []; return; }
    var ops = [], seq = job.seq; for (var i = 0; i < buf.length; i += SAP_CHUNK_ROWS) seq = sapChunkOps_(job.months[job.i], job.run, seq, buf.slice(i, i + SAP_CHUNK_ROWS), ops);
    sapStageWrite_(ops); job.seq = seq; buf = [];
  }
  if (job.skip > 0 && !job.sl) {   // a read position saved by the older $skip paging cannot be continued by key: that month starts again with clean counts
    job.skip = 0; job.seq = 0; job.cnt = sapNewCnt_(); job.total = null; if (job.tally) job.tally = {}; job.drops = {}; job.dropEx = {};
  }
  while (job.i < job.months.length) {
    var ym = job.months[job.i];
    if (specYm !== ym) { spec = sapMonthSpec_(cfg, ym); specYm = ym; }
    if (!job.sl) { sapBeat_(); sapPlanSlices_(cfg, pg, spec, job); sapSaveCursor_(job); }
    for (;;) {
      var active = job.sl.filter(function (x) { return !x.done; });
      if (!active.length) break;
      if (Date.now() - t0 + slowest * 1.25 > budget) { flush(); sapSaveCursor_(job); sapProgress_(job, t0, budget, u0, false, pg); return { done: false }; }   // not when the slowest round so far would not fit: a run killed at 6 minutes leaves its run flag set for 8 minutes
      sapBeat_(); var tb = Date.now();
      var bak = JSON.stringify({ sl: job.sl, cnt: job.cnt, mc: job.maxChange });   // the state before this round: a stop in the lookups puts it back, so nothing is half counted
      var pass = active.slice(0, pg.conc), rr = sapRound_(cfg, pg, spec, pass), hdrs = [], newRead = 0;
      pg.groupMs = Math.max(pg.groupMs, Date.now() - tb);
      rr.forEach(function (x, k) {
        var sl = pass[k], items = x.res.results;
        if (!items.length) { sl.done = true; return; }
        if (items.length < x.top && x.res.next) sapCap_(pg, items.length);   // the server caps its pages
        var hs = items, got = items.length;
        if (cfg.shape === 'B') {
          var one = (items.length >= x.top || !!x.res.next) && items.every(function (it) { return it.BillingDocument === items[0].BillingDocument; });
          if (one) { items = sapDocItems_(cfg, pg, spec, items[0].BillingDocument); got = items.length; hs = sapItemsToHeaders_(items, true).headers; }   // a page that is one whole document and full: its other items are read by document number, never skipped
          else { var g = sapItemsToHeaders_(items, items.length < x.top && !x.res.next); hs = g.headers; got = items.length - g.drop; }
        }
        var lastDoc = String(hs[hs.length - 1].BillingDocument);
        if (sl.last && lastDoc <= sl.last) fail_('sap_error', 'SAP paging by document number did not move forward in ' + ym + ' (stuck at ' + sl.last + '). Nothing was staged for the month.');
        sl.last = lastDoc; sl.n += got; newRead += got; hs.forEach(function (h) { hdrs.push(h); });
      });
      var entries = [];
      hdrs.forEach(function (h) {
        var lc = sapDate_(h.LastChangeDate); if (lc && lc > job.maxChange) job.maxChange = lc;
        sapDocRows_(cfg, h, job.cnt).forEach(function (e) { entries.push(e); });
      });
      if (entries.length) {
        try { sapLookups_(cfg, ctx, entries, pg, function () { return Date.now() - t0 + pg.groupMs * 1.25 > budget; }); }
        catch (e) {
          if (!e.sapStop) throw e;
          var b0 = JSON.parse(bak); job.sl = b0.sl; job.cnt = b0.cnt; job.maxChange = b0.mc;   // put the round back; what the lookups fetched is already in the cache for the next run
          flush(); sapSaveCursor_(job); sapProgress_(job, t0, budget, u0, false, pg); return { done: false };
        }
      }
      handlers.rows(job, ym, entries);
      entries.forEach(function (e) { if (handlers.stage) buf.push(e.row); });
      job.skip += newRead;
      if (handlers.stage ? buf.length >= SAP_CHUNK_ROWS : true) { flush(); sapSaveCursor_(job); }   // the cursor only ever points at a place whose rows are already staged
      slowest = Math.max(slowest, Date.now() - tb);
    }
    flush();
    var mc = sapMonthEndCheck_(cfg, pg, spec, job), moved = job.total !== null && job.skip !== job.total;
    if ((mc && mc.diffs.length) || moved) {   // documents were added, cancelled or numbered behind the read position while the month was read: a warning with the numbers, never a reason to throw the reading away
      var w = 'Month ' + ym + ': SAP counted ' + (job.total === null ? '?' : job.total) + ' when the month was started' + (mc && mc.known ? ' and counts ' + mc.live + ' now' : '') + '; read ' + job.skip + '.' + (mc && mc.diffs.length ? ' Differs in ' + mc.diffs.slice(0, 4).join('; ') + '.' : '') + ' Kept as read. A document numbered behind the read position is not re-read in this run; the next daily read re-checks changed documents.';
      job.warns = (job.warns || []).concat([w]).slice(-3);
      var sw = sapStatusGet_(); sapStatusPatch_({ warnings: ((sw.warnings || []).concat([{ at: new Date(Date.now()).toISOString(), msg: w.slice(0, 600) }])).slice(-3) });
    }
    handlers.month(job, ym);
    job.lines0 += job.cnt.lines; job.hdrs0 = (job.hdrs0 || 0) + job.cnt.headers; job.units0 += job.skip; job.cntSum = sapCntAdd_(job.cntSum || {}, job.cnt);
    job.i++; job.skip = 0; job.total = null; job.sl = null; job.seq = 0; job.cnt = sapNewCnt_();
    sapSaveCursor_(job);
  }
  sapProgress_(job, t0, budget, u0, true, pg);
  return { done: true };
}
/* progress for the card, the log and the result: months done, lines read so far, and an estimate of the runs still needed (from this run's speed; the size of months not yet started is guessed from the ones read). Estimates are labelled as such. */
function sapProgress_(job, t0, budget, u0, done, pg) {
  try {
    var nm = job.months.length, units = job.units0 + job.skip, lines = job.lines0 + (done ? 0 : job.cnt.lines), cur = done ? null : job.total;
    var nd = done ? nm : job.i, avg = job.i ? job.units0 / job.i : (cur || 0);
    var est = done ? units : job.units0 + (cur !== null && cur !== undefined ? cur : avg) + Math.max(0, nm - job.i - 1) * avg, secs = (Date.now() - t0) / 1000, rate = secs > 0 ? (units - u0) / secs : 0;
    var left = done ? 0 : (rate > 0 && est > units ? Math.max(1, Math.ceil((est - units) / rate / (budget / 1000))) : null);
    var estLines = done ? lines : (units > 0 ? Math.round(lines * est / units) : null), pct = done ? 100 : (est > 0 ? Math.min(99, Math.floor(100 * units / est)) : 0);
    var label = job.job === 'shadow' ? 'Shadow run' : 'Sync';
    var text = label + (done ? ' finished: ' : ': ') + nd + ' of ' + nm + ' month(s) done; ' + sapFmt_(lines) + (done || !estLines ? '' : ' of about ' + sapFmt_(estLines)) + ' lines read' + (done ? '' : ' (' + pct + '%)') + '; run ' + job.runs + ';' +
      (done ? ' nothing left to read.' : left === null ? ' runs left: cannot estimate yet.' : ' about ' + left + ' more run' + (left === 1 ? '' : 's') + ' (estimate).');
    var pr = { kind: job.job, text: text, monthsDone: nd, months: nm, lines: lines, estLines: estLines, pct: pct, run: job.runs, runsLeft: done ? 0 : left, done: !!done, at: new Date(Date.now()).toISOString(), page: pg ? pg.top : null, conc: pg ? pg.conc : null, notes: pg ? pg.notes.slice(0, 4) : [], resume: job.resumeInfo || null, from: u0, to: units, total: job.total };
    var hist = (sapStatusGet_().runLog || []).concat([{ at: pr.at, kind: job.job, run: job.runs, resumed: !!(job.resumeInfo && job.resumeInfo.resumed), from: u0, to: units, total: job.total, done: !!done, ms: Date.now() - t0 }]).slice(-6);
    sapStatusPatch_({ progress: pr, runLog: hist });
    try { Logger.log('SAP-PROGRESS ' + text + ' resumed=' + !!(job.resumeInfo && job.resumeInfo.resumed) + ' (' + ((job.resumeInfo && job.resumeInfo.reason) || '') + ') from ' + u0 + ' to ' + units + ' of ' + (job.total === null ? '?' : job.total) + ' units.' + (pg && pg.notes.length ? ' [' + pg.notes.slice(0, 4).join('; ') + ']' : '')); } catch (e) {}
    return pr;
  } catch (e) { return null; }
}

/* ---------- sapSync ---------- */
/* every reason to refuse a shadow run, checked WITHOUT any side effect (nothing cleared, scheduled, acquired or read); the automatic chain calls it before it touches its trigger, record or position */
function sapShadowPre_(ymArg) {
  var cfg = sapCfg_(), ss = book_(false);
  if (!ss) fail_('unavailable', 'The database is not set up yet. Run setup() once.');
  sapVerifyGate_('sales');
  var firstYm = sapYm_(SAP_FEED_FROM), ym = ymArg || firstYm;
  if (!/^\d{4}-\d\d$/.test(ym) || ym < firstYm) fail_('invalid_argument', 'The shadow run reads ' + firstYm + ' or later only.');
  sapCursorGet_('SAP_CURSOR_SHADOW');   // an unreadable saved position is a refusal too
  sapShadowMonthGuard_(ymArg);
  sapRequirePlants_(ss, 'the comparison would be empty');
  return { cfg: cfg, ss: ss, ym: ym };
}
/* the same for the sync */
function sapSyncPre_() {
  if (String(sapProps_().getProperty('SAP_SYNC_ENABLED') || '').trim().toLowerCase() !== 'yes') fail_('sap_sync_disabled', 'sapSync is switched off. It stays off until the Script Property SAP_SYNC_ENABLED is set to yes (after the shadow run is accepted). Nothing was read.');
  var cfg = sapCfg_(), st = sapStatusGet_();
  sapVerifyGate_('sales');
  if (!st.shadow) fail_('sap_shadow_first', 'Run sapShadowRun first and have Vijay accept the ' + sapFeedMonthName_() + ' comparison. Nothing was read.');
  var ss = book_(true); sapRequirePlants_(ss, 'the staged month would hold no rows');
  sapCursorGet_('SAP_CURSOR');
  return { cfg: cfg, st: st, ss: ss };
}
function sapSyncRun_(source) {
  var pre = sapSyncPre_(), cfg = pre.cfg, st = pre.st, ss = pre.ss;
  sapAcquire_();
  var contOff = function () { try { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sapContinueTrigger_') ScriptApp.deleteTrigger(t); }); } catch (e) {} };
  if (source === 'trigger') sapContinueLater_(SAP_RUN_STALE_MS + 30000);   // a watchdog: if Google kills this run, this trigger (after the run flag has gone stale) carries on from the saved position
  var t0 = Date.now(), budget = +sapProps_().getProperty('SAP_RUN_BUDGET_MS') || SAP_BUDGET_MS, job = null, resumed = false, res = null, info = null;
  try {
    var cur = sapCursorGet_('SAP_CURSOR'); job = cur.job;
    if (job && job.job === 'sync') { resumed = true; info = sapResumeInfo_(job, 'sync'); }
    else {
      info = sapResumeInfo_(null, 'sync', job ? 'the saved position was not a sync position' : cur.why);
      var plan = sapPlanMonths_(cfg, ss);
      sapStatusPatch_({ skippedMonths: plan.skipped });
      job = sapNewJob_('sync', plan.months, { totals: { headers: 0, lines: 0, rows: 0 } });
    }
    job.resumeInfo = info;
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
      contOff();
      if (job.maxChange && job.maxChange > (sapProps_().getProperty('SAP_WM') || '')) sapProps_().setProperty('SAP_WM', job.maxChange);
      sapProps_().setProperty('SAP_CURSOR', '');
      var stg = sapStatusGet_(), n = 0; Object.keys(stg.staged || {}).forEach(function (k) { n += stg.staged[k].rows; });
      sapStatusPatch_({ lastAt: new Date(Date.now()).toISOString(), lastKind: 'sync', lastOk: true, lastSync: new Date(Date.now()).toISOString(), message: 'Read ' + tot.headers + ' documents and ' + tot.lines + ' lines; staged ' + tot.rows + ' rows in ' + months.length + ' month(s).', read: { headers: tot.headers, lines: tot.lines }, stagedRows: n, conn: { ok: true, at: new Date(Date.now()).toISOString() } });
    } else {
      sapStatusPatch_({ lastAt: new Date(Date.now()).toISOString(), lastKind: 'sync', lastOk: true, message: 'Stopped at the run time limit after month ' + (job.i + 1) + ' of ' + months.length + '; run sapSyncAuto once to finish it (or sapSync again). ' + ((sapStatusGet_().progress || {}).text || ''), conn: { ok: true, at: new Date(Date.now()).toISOString() } });
      if (source === 'trigger') sapContinueLater_();
    }
    return { ok: true, done: res.done, resumed: resumed, resume: info, months: months, monthsDone: Math.min(job.i, months.length), read: { headers: tot.headers, lines: tot.lines }, stagedRows: tot.rows, skippedMonths: (sapStatusGet_().skippedMonths || []), message: sapStatusGet_().message };
  } catch (e) {
    var conn = e.deskCode === 'sap_auth' || e.deskCode === 'sap_forbidden' || e.deskCode === 'sap_unreachable' || e.deskCode === 'sap_error' || e.deskCode === 'sap_not_found';
    sapErrPush_(cfg, e.message || e);
    var patch = { lastAt: new Date(Date.now()).toISOString(), lastKind: 'sync', lastOk: false, message: sapRedact_(cfg, e.message || e) };
    if (conn) patch.conn = { ok: false, at: new Date(Date.now()).toISOString() };
    sapStatusPatch_(patch);
    if (source === 'trigger') contOff();   // an error ends the chain
    throw e;
  } finally { sapRelease_(); }
}
function sapContinueLater_(delayMs) {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sapContinueTrigger_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('sapContinueTrigger_').timeBased().after(delayMs || 60 * 1000).create();
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
function sapRequirePlants_(ss, what) {
  var n = 0; readAll_(ss, 'plants').docs.forEach(function (d) { try { var o = JSON.parse(d.json); if (o && o.plant_code && o.active !== false) n++; } catch (e) {} });
  if (!n) fail_('unavailable', 'The Desk has no active plants in its plants list (Admin > Plants), so SAP lines for every plant would be left out and ' + what + '. Nothing was read from SAP and nothing was changed. If this Desk was just restored, finish the restore first (a stale page may have refused it), then run this again.');
}
function sapDropText_(job) {
  var D = job.drops || {}, ex = job.dropEx || {}, parts = Object.keys(D).filter(function (k) { return k !== 'counted'; }).map(function (k) {
    var e = ex[k] ? ' (' + Object.keys(ex[k]).map(function (v) { return v + ' x' + ex[k][v]; }).join(', ') + ')' : ''; return k + ' ' + D[k] + e; });
  return 'Lines counted ' + (D.counted || 0) + (parts.length ? '; left out: ' + parts.join('; ') : '; none left out') + '.';
}
function sapShadowRun_(ymArg) {
  var pre = sapShadowPre_(ymArg), cfg = pre.cfg, ss = pre.ss, firstYm = sapYm_(SAP_FEED_FROM), ym = pre.ym;
  sapAcquire_();
  var t0 = Date.now(), budget = +sapProps_().getProperty('SAP_RUN_BUDGET_MS') || SAP_BUDGET_MS, job = null, resumed = false, info = null;
  try {
    var cur = sapCursorGet_('SAP_CURSOR_SHADOW'); job = cur.job;
    if (job && job.job === 'shadow' && (!ymArg || job.months[0] === ym)) { ym = job.months[0]; resumed = true; info = sapResumeInfo_(job, 'shadow'); }
    else { info = sapResumeInfo_(null, 'shadow', job ? 'a different month was asked for (' + ym + '; the saved position was for ' + (job.months && job.months[0]) + ')' : cur.why); job = sapNewJob_('shadow', [ym], { tally: {}, seen: 0 }); }
    if (!info.resumed) resumed = false; job.resumeInfo = info;
    var plants = Object.create(null); readAll_(ss, 'plants').docs.forEach(function (d) { try { var o = JSON.parse(d.json); if (o && o.plant_code) plants[String(o.plant_code)] = o; } catch (e) {} });
    var today = sapIstToday_(), seenKeys = {};
    var handlers = { stage: false, month: function () {},
      rows: function (j, m, entries) {
        var docsPage = {}, D = j.drops || (j.drops = {}), S = j.dropEx || (j.dropEx = {});
        function drop(why, sample) {   // every line the comparison leaves out is counted by reason; the first few distinct values are kept so the cause can be read from the log
          D[why] = (D[why] || 0) + 1;
          if (sample !== undefined) { var m2 = S[why] || (S[why] = {}); sample = String(sample).slice(0, 18); if (sample in m2) m2[sample]++; else if (Object.keys(m2).length < 6) m2[sample] = 1; }
        }
        entries.forEach(function (e) {
          if (e.kind !== 'sales') { drop('notSales'); return; }
          var r = e.row, qty = sapNum_(r[7]), net = sapNum_(r[8]);
          var why = isNaN(qty) || isNaN(net) ? 'notANumber' : qty === 0 ? 'qtyZero' : qty < 0 ? 'qtyNegative' : net < 0 ? 'netNegative' : '';
          if (why) {   // why a line is left out, with proof: the first lines seen (document, item, qty, unit, net, item category, higher-level item) and how the reason splits by item category and higher-level item
            var DL = j.dropLines || (j.dropLines = {}), arr = DL[why] || (DL[why] = []);
            if (arr.length < 2) arr.push(r[0] + '/' + r[1] + ' qty=' + r[7] + ' ' + (e.u || '') + ' net=' + r[8] + (e.hasDiag ? ' cat=' + (e.ic || '-') + ' higher=' + (e.hl || '-') : ''));
            drop(why, e.hasDiag ? 'cat=' + (e.ic || '-') + ' higher=' + (e.hl ? 'yes' : 'no') : (why === 'qtyZero' ? 'net=' + (net === 0 ? '0' : 'not 0') : undefined)); return;
          }
          if (!r[0] || !r[1]) { drop('noDocOrItem'); return; }
          if (r[2] > today) { drop('futureDate', r[2]); return; }
          var pl = plants[/^\d{1,4}$/.test(r[3]) ? ('0000' + r[3]).slice(-4) : r[3]]; if (!pl) { drop('plantNotInStore', r[3]); return; } if (pl.active === false) { drop('plantInactive', r[3]); return; }
          var key = r[0] + '|' + r[1]; if (seenKeys[key]) { drop('duplicateLine'); return; } seenKeys[key] = 1;
          var grp = sapGroupOf_(r[10], r[11]); if (!grp) { drop('noProductGroup', r[10] === '' ? '(no product type)' : r[10]); return; }
          var pk = pl.plant_code, T = j.tally[pk] || (j.tally[pk] = [0, 0, 0, 0, 0]);
          D.counted = (D.counted || 0) + 1;
          T[1]++; T[2] += qty; T[3] += sapSize_(r[12], qty); T[4] += net; (docsPage[pk] = docsPage[pk] || {})[r[0]] = 1;
        });
        Object.keys(docsPage).forEach(function (pk) { j.tally[pk][0] += Object.keys(docsPage[pk]).length; });
      } };
    var res = sapRunJob_(cfg, job, t0, budget, handlers);
    if (!res.done) {
      sapStatusPatch_({ lastAt: new Date(Date.now()).toISOString(), lastKind: 'shadow', message: 'The shadow run stopped at the run time limit; run sapShadowRun again (or sapShadowRunAuto once) to continue. ' + ((sapStatusGet_().progress || {}).text || ''), conn: { ok: true, at: new Date(Date.now()).toISOString() } });
      return { ok: true, done: false, resumed: resumed, resume: info, message: 'Stopped at the run time limit. Run sapShadowRun again to continue; nothing was written. ' + ((sapStatusGet_().progress || {}).text || '') + ' ' + sapDropText_(job), drops: job.drops || {}, progress: sapStatusGet_().progress || null };
    }
    try { Logger.log('SAP-SHADOW-FEED ' + JSON.stringify({ ym: ym, tally: job.tally, drops: job.drops || {} })); } catch (e00) {}   // the raw feed totals, in case the comparison below cannot be made
    var diffs = sapCompare_(ss, ym, job.tally), dropTxt = sapDropText_(job), noneCounted = job.lines0 > 0 && ((job.drops && job.drops.counted) || 0) * 4 < job.lines0;
    var bad = diffs.filter(function (d) { return !d.equal; }), now = new Date(Date.now()).toISOString();
    var lb = sapLineBreakdown_(sapCntAdd_(JSON.parse(JSON.stringify(job.cntSum || {})), job.cnt));
    var top5 = bad.slice().sort(function (a, b) { return Math.abs(b.diff.net) - Math.abs(a.diff.net) || Math.abs(b.diff.lines) - Math.abs(a.diff.lines); }).slice(0, 5).map(function (d) { return { plant: d.plant, docs: d.diff.docs, lines: d.diff.lines, sheets: d.diff.sheets, sqft: d.diff.sqft, net: d.diff.net, note: d.note }; });
    var lbTxt = sapLineText_(lb), cmpTxt = diffs.length + ' plant-months compared, ' + bad.length + ' differ';
    // 1. the result is written to the execution log FIRST, before any state write, so a failed write can never lose it
    try { Logger.log('SAP-SHADOW ' + JSON.stringify({ ym: ym, plantMonths: diffs.length, differ: bad.length, top5: top5, lines: lb, drops: job.drops || {}, dropEx: job.dropEx || {}, dropLines: job.dropLines || {} })); } catch (e0) {}
    // 2. the full comparison goes to the admin-only collection sapstage (doc shadow_<ym>); a short summary to SAP_SHADOW. The saved read position is cleared only after the full result is stored.
    var saveErr = [], savedDoc = false;
    try { sapStageWrite_([{ op: 'set', col: 'sapstage', id: 'shadow_' + ym, json: JSON.stringify({ ym: ym, at: now, run: job.run, plantMonths: diffs.length, differ: bad.length, rows: diffs, lineBreakdown: lb, drops: job.drops || {}, dropEx: job.dropEx || {}, dropLines: job.dropLines || {} }) }]); savedDoc = true; }
    catch (e1) { saveErr.push('full result (sapstage/shadow_' + ym + '): ' + sapRedact_(cfg, e1 && e1.message || e1)); }
    try { sapSetJson_('SAP_SHADOW', { at: now, ym: ym, plantMonths: diffs.length, differ: bad.length, top: top5, doc: savedDoc ? 'shadow_' + ym : '' }); }
    catch (e2) { saveErr.push('summary (SAP_SHADOW): ' + sapRedact_(cfg, e2 && e2.message || e2)); }
    if (savedDoc) { try { sapProps_().setProperty('SAP_CURSOR_SHADOW', ''); } catch (e3) { saveErr.push('could not clear the read position'); } }
    var msg = 'Shadow run for ' + ym + ': ' + cmpTxt + '. Nothing was written to the Desk. ' + dropTxt + ' ' + lbTxt + (lb.unexplained ? ' WARNING: ' + lb.unexplained + ' lines are not explained by any rule.' : '') +
      (noneCounted ? ' WARNING: only ' + ((job.drops && job.drops.counted) || 0) + ' of the ' + job.lines0 + ' lines SAP sent were counted (less than a quarter); the comparison is not valid, read the reasons above.' : '') +
      (savedDoc ? '' : ' WARNING: the comparison was finished but could not be saved (' + saveErr.join('; ') + '). It is in the execution log line "SAP-SHADOW" and in this result. The read position was kept in its finished state: run sapShadowRun again to save it without reading SAP again.');
    try { sapStatusPatch_({ lastAt: now, lastKind: 'shadow', lastOk: true, message: msg.slice(0, 1500), conn: { ok: true, at: now },
      shadow: { at: now, ym: ym, plantMonths: diffs.length, differ: bad.length, clean: bad.length === 0, saved: savedDoc, top: top5.slice(0, 3) }, read: { headers: job.hdrs0 || 0, lines: job.lines0 || 0 } }); }
    catch (e4) { saveErr.push('card state: ' + sapRedact_(cfg, e4 && e4.message || e4)); }
    return { ok: true, done: true, saved: savedDoc, saveErrors: saveErr, resume: info, drops: job.drops || {}, dropExamples: job.dropEx || {}, dropLines: job.dropLines || {}, lineBreakdown: lb, top5: top5, ym: ym, resumed: resumed, progress: (function () { try { return sapStatusGet_().progress || null; } catch (e5) { return null; } })(), plantMonths: diffs.length, differ: bad.length, clean: bad.length === 0, differences: diffs, message: msg };
  } catch (e) {
    var conn = /^sap_/.test(e.deskCode || '');
    sapErrPush_(cfg, e.message || e);
    var patch = { lastAt: new Date(Date.now()).toISOString(), lastKind: 'shadow', lastOk: false, message: sapRedact_(cfg, e.message || e) };
    if (conn) patch.conn = { ok: false, at: new Date(Date.now()).toISOString() };
    sapStatusPatch_(patch);
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
function sapVerifyGate_(scope) {
  var v = sapStatusGet_().verify;
  if (!v) fail_('sap_verify_first', 'Run sapVerifyMetadata first. Nothing was read and nothing was changed. The shadow run, the sync and the customer read need a passing verify on record.');
  if (v.failed) fail_('sap_verify_gap', 'The last sapVerifyMetadata did not finish (' + (v.error || 'error') + '). Nothing was read and nothing was changed. Run sapVerifyMetadata again and read the result before reading from SAP.');
  var list = scope === 'cust' ? v.blockingCust : v.blockingSales;   // a missing customer-master name blocks the customer read only; billing names block the billing reads
  if (list === undefined) list = v.ok === true ? [] : ['(see sapVerifyMetadata)'];
  if (list.length) fail_('sap_verify_gap', 'SAP does not offer ' + (scope === 'cust' ? 'these names the customer read needs' : (v.gaps || 0) + ' required name(s)') + ': ' + list.join(', ') + '. Nothing was read and nothing was changed. Send the sapVerifyMetadata result to the Delivery Lead; run sapVerifyMetadata again once it is fixed.');
}
function sapVerifyRun_() {
  var cfg = sapCfg_(), rows = [], gaps = 0, ogaps = 0, seen = {}, sets = {}, forced = String(sapProps_().getProperty('SAP_BILLING_SHAPE') || '').trim().toUpperCase(), shape = forced === 'B' ? 'B' : 'A';
  function check(list) {
    var rr = [], g = 0, og = 0;
    list.forEach(function (e) {
      if (!(e.svc in seen)) { seen[e.svc] = sapParseMeta_(sapHttp_(cfg, SAP_SVC[e.svc], '$metadata', null, 'application/xml').text); }
      sets = seen[e.svc]; var t = sets[e.set], opt = e.opt || [], custOnly = e.custOnly || [];
      function scoped(r, prop) { if (e.scope === 'cust' || custOnly.indexOf(prop) >= 0) r.scope = 'cust'; return r; }
      function row(prop, ok) {
        var isOpt = !!e.optSet || opt.indexOf(prop) >= 0, r = scoped({ service: SAP_SVC[e.svc], entitySet: e.set, property: prop, status: ok ? 'ok' : 'GAP' }, prop);
        if (isOpt) r.optional = true;
        if (!ok) { if (isOpt) og++; else g++; }
        rr.push(r);
      }
      if (!t) {   // a missing entity set cannot be read at all: it is required, unless the set is marked optSet (then the whole set is left out of the reads)
        var setRow = scoped({ service: SAP_SVC[e.svc], entitySet: e.set, property: '(entity set)', status: 'GAP' }, '');
        if (e.optSet) { setRow.optional = true; og++; } else g++;
        rr.push(setRow);
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
  var itemT = seen.billing && seen.billing['A_BillingDocumentItem'], diagOk = itemT ? SAP_DIAG_FIELDS.filter(function (f) { return !!itemT.props[f]; }) : [];
  var reqGap = rows.filter(function (r) { return r.status === 'GAP' && !r.optional; }), nm = function (r) { return r.entitySet + '.' + r.property; };
  var blocking = reqGap.map(nm), blockingCust = reqGap.filter(function (r) { return r.scope === 'cust'; }).map(nm), blockingSales = reqGap.filter(function (r) { return r.scope !== 'cust'; }).map(nm);
  var skip = rows.filter(function (r) { return r.status === 'GAP' && r.optional; }).map(function (r) { return r.entitySet + '.' + r.property; });
  sapSetJson_('SAP_OPT_SKIP', skip);   // optional GAPs are left out of every later read; an empty list clears an old one
  var nOk = rows.length - gaps - ogaps, msg = 'SAP names checked: ' + nOk + ' ok, ' + gaps + ' required GAP, ' + ogaps + ' optional GAP.';
  if (!okAll) msg += ' Blocking (required, missing on SAP): ' + blocking.slice(0, 8).join(', ') + '.' + (blockingSales.length ? ' The shadow run and sync are blocked until this is fixed.' : '') + (blockingCust.length ? ' The customer read is blocked until this is fixed' + (blockingSales.length ? '.' : '; billing reads are not affected.') : '');
  else if (ogaps) msg += ' Warning: optional ' + skip.join(', ') + ' not on this tenant; left out of the reads, its column stays blank. Nothing else is affected.';
  var warning = okAll && ogaps ? msg : '';
  sapStatusPatch_({ lastAt: now, lastKind: 'verify', lastOk: okAll, message: msg, conn: { ok: true, at: now }, verify: { at: now, ok: okAll, failed: false, gaps: gaps, optionalGaps: ogaps, checked: rows.length, shape: shape, blocking: blocking.slice(0, 10), blockingSales: blockingSales.slice(0, 10), blockingCust: blockingCust.slice(0, 10), optionalSkipped: skip, diagOk: diagOk } });
  var out = { ok: okAll, allOk: gaps + ogaps === 0, gaps: gaps, optionalGaps: ogaps, optionalSkipped: skip, shape: shape, checked: rows.length, rows: rows, message: msg };
  if (warning) out.warning = warning;
  if (!okAll) { out.code = 'sap_verify_gap'; out.blocking = blocking; out.blockingSales = blockingSales; out.blockingCust = blockingCust; }
  return out;
}

/* ---------- customer master read (D78, spec 1.4): staged for the page's customer intake ---------- */
/* Columns of the staged customer rows. The names are the ones the page's customer intake maps (Customer, Name, Customer Group, City, Region, Sales Executive, Payment Terms) plus the new
 * ones the page adds for D78 (Postal Code, District, GSTIN). Region is the SAP region code. Postal Code is blank unless it is 6 digits. Sales Executive is the sales group code (a suggestion).
 * Credit limit and balance are NOT read (credit management is a separate API, spec row 15). */
var SAP_CUST_COLS = ['Customer', 'Name', 'Customer Group', 'City', 'Region', 'Postal Code', 'District', 'GSTIN', 'Sales Executive', 'Payment Terms', 'Sales District', 'Blocked', 'Legacy Code', 'Address Count'];
function sapCustChunkId_(x, run, seq) { return 'cust_c_' + run + '_' + seq; }   // never starts with c_ or man_: the page's billing loader reads those prefixes
/* reads every page of one entity set and hands each row to each(); stops with nothing staged at the time budget; checks the count when the server gives one */
function sapReadAll_(cfg, t0, budget, svc, set, p, each) {
  var got = 0, total = null, pg = sapPager_();
  function mk(skip, top) { var q = {}; Object.keys(p).forEach(function (k) { if (k !== '$top' && k !== '$skip' && k !== '$inlinecount') q[k] = p[k]; }); q['$top'] = String(top); q['$skip'] = String(skip); if (skip === 0) q['$inlinecount'] = 'allpages'; return q; }
  for (;;) {
    if (Date.now() - t0 > budget) fail_('sap_timeout', 'The customer read stopped at the run time limit while reading ' + set + '. Nothing was staged. Run sapCustomerSync again.');
    sapBeat_();
    var pages = sapBatch_(cfg, pg, svc, set, mk, got, got === 0 ? null : total), lastN = 0;
    if (got === 0) total = pages[0].res.count;
    pages.forEach(function (pp) { pp.res.results.forEach(function (o) { each(o); }); got += pp.res.results.length; lastN = pp.res.results.length; });   // in order, so "the first one read" rules behave as before
    if (!lastN || (total !== null && got >= total)) break;
  }
  if (total !== null && got !== total) fail_('sap_error', 'The read of ' + set + ' returned ' + got + ' rows but SAP counted ' + total + '. Nothing was staged.');
  return got;
}
function sapSel_(cfg, set, fields) { return fields.filter(function (f) { return !sapSkipped_(cfg, set, f); }).join(','); }
function sapStr_(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 200); }
function sapCustomerRun_() {
  var cfg = sapCfg_(); sapVerifyGate_('cust'); sapAcquire_();
  var t0 = Date.now(), budget = +sapProps_().getProperty('SAP_RUN_BUDGET_MS') || SAP_BUDGET_MS, P = SAP_SVC.partner;
  try {
    var inScope = Object.create(null), cust = Object.create(null), order = [], c = { read: 0, inScope: 0, outOfScope: 0, notCustomerGroup: 0, blocked: 0, salesAreas: 0, severalSalesAreas: 0, addresses: 0, severalAddresses: 0, noAddress: 0, pin6: 0, pinBad: 0, noRegion: 0, withDistrict: 0, withCity: 0, withGstin: 0, gstinNot15: 0, withGroup: 0, withSalesGroup: 0, withLegacy: 0 };
    var cc = { '$filter': 'CompanyCode eq ' + sapQ_(cfg.company), '$select': 'Customer,CompanyCode', '$orderby': 'Customer asc' };
    sapReadAll_(cfg, t0, budget, P, 'A_CustomerCompany', cc, function (o) { inScope[sapTrim0_(o.Customer)] = 1; });
    var cf = ['Customer', 'CustomerName', 'CustomerAccountGroup', 'DeletionIndicator', 'PostingIsBlocked', 'LegacyB1Code'];
    sapReadAll_(cfg, t0, budget, P, 'A_Customer', { '$select': sapSel_(cfg, 'A_Customer', cf), '$orderby': 'Customer asc' }, function (o) {
      c.read++; var k = sapTrim0_(o.Customer); if (!k) return;
      if (!inScope[k]) { c.outOfScope++; return; }
      if (cust[k]) return;
      var blocked = sapBool_(o.DeletionIndicator) || sapBool_(o.PostingIsBlocked);
      cust[k] = { code: k, name: sapStr_(o.CustomerName, 60), blocked: blocked, legacy: sapStr_(o.LegacyB1Code, 30), group: '', city: '', region: '', pin: '', district: '', gstin: '', sg: '', terms: '', sd: '', addr: 0, aid: null, sa: 0 };
      order.push(k); c.inScope++; if (blocked) c.blocked++; if (cust[k].legacy) c.withLegacy++;
    });
    if (!sapSkipped_(cfg, 'A_CustomerSalesArea', '(entity set)')) {
      var sf = ['Customer', 'CustomerGroup', 'SalesGroup', 'CustomerPaymentTerms', 'SalesDistrict'];
      sapReadAll_(cfg, t0, budget, P, 'A_CustomerSalesArea', { '$select': sapSel_(cfg, 'A_CustomerSalesArea', sf), '$orderby': 'Customer asc' }, function (o) {
        var u = cust[sapTrim0_(o.Customer)]; if (!u) return; c.salesAreas++; u.sa++;
        if (u.sa > 1) return;   // several sales areas: the first read is kept, the customer is counted
        u.group = sapStr_(o.CustomerGroup, 24); u.sg = sapStr_(o.SalesGroup, 30); u.terms = sapStr_(o.CustomerPaymentTerms, 20); u.sd = sapStr_(o.SalesDistrict, 20);
      });
    }
    var af = ['BusinessPartner', 'AddressID', 'Region', 'PostalCode', 'CityName', 'District'], hasAid = !sapSkipped_(cfg, 'A_BusinessPartnerAddress', 'AddressID');
    sapReadAll_(cfg, t0, budget, P, 'A_BusinessPartnerAddress', { '$select': sapSel_(cfg, 'A_BusinessPartnerAddress', af), '$orderby': hasAid ? 'BusinessPartner asc,AddressID asc' : 'BusinessPartner asc' }, function (o) {
      var u = cust[sapTrim0_(o.BusinessPartner)]; if (!u) return; c.addresses++; u.addr++;
      var id = sapTrim0_(o.AddressID), lower = u.aid === null || (hasAid && id !== '' && (/^\d+$/.test(id) && /^\d+$/.test(u.aid) ? +id < +u.aid : id < u.aid));
      if (!lower) return;   // address rule (spec 1.4, candidate): the lowest address number; the bill-to usage test waits for checklist 21
      u.aid = id; u.region = sapStr_(o.Region, 6); u.pin = sapStr_(o.PostalCode, 12).replace(/\s+/g, ''); u.city = sapStr_(o.CityName, 24); u.district = sapStr_(o.District, 40);
    });
    if (!sapSkipped_(cfg, 'A_BusinessPartnerTax', '(entity set)')) {
      sapReadAll_(cfg, t0, budget, P, 'A_BusinessPartnerTax', { '$filter': 'BPTaxType eq ' + sapQ_('IN3'), '$select': sapSel_(cfg, 'A_BusinessPartnerTax', ['BusinessPartner', 'BPTaxType', 'BPTaxNumber']), '$orderby': 'BusinessPartner asc' }, function (o) {
        var u = cust[sapTrim0_(o.BusinessPartner)]; if (u && !u.gstin) u.gstin = sapStr_(o.BPTaxNumber, 20).toUpperCase();
      });
    }
    var rows = order.map(function (k) {
      var u = cust[k];
      if (u.addr === 0) c.noAddress++; if (u.addr > 1) c.severalAddresses++; if (u.sa > 1) c.severalSalesAreas++;
      if (/^\d{6}$/.test(u.pin)) c.pin6++; else { if (u.pin) c.pinBad++; u.pin = ''; }
      if (!u.region) c.noRegion++; if (u.district) c.withDistrict++; if (u.city) c.withCity++; if (u.group) c.withGroup++; if (u.sg) c.withSalesGroup++;
      if (u.gstin) { c.withGstin++; if (u.gstin.length !== 15) c.gstinNot15++; }
      return [u.code, u.name, u.group, u.city, u.region, u.pin, u.district, u.gstin, u.sg, u.terms, u.sd, u.blocked ? 'Y' : '', u.legacy, u.addr];
    });
    var run = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4), ops = [], seq = 0, now = new Date(Date.now()).toISOString();
    for (var i = 0; i < rows.length; i += SAP_CHUNK_ROWS) seq = sapChunkOps_('cust', run, seq, rows.slice(i, i + SAP_CHUNK_ROWS), ops, sapCustChunkId_);
    var man = { run: run, at: now, complete: true, cols: SAP_CUST_COLS, n: seq, rows: rows.length, status: 'staged', company: cfg.company, counts: c, skippedOptional: (cfg.skip || []).slice(0, 12) };
    var prev = null; try { var raw = docsRaw_(colSheet_(book_(false), 'sapstage', false), ['cust_man']); prev = raw['cust_man'] ? JSON.parse(raw['cust_man']) : null; } catch (e) {}
    ops.push({ op: 'set', col: 'sapstage', id: 'cust_man', json: JSON.stringify(man) });
    if (prev && prev.run && prev.run !== run) for (var s2 = 0; s2 < (prev.n || 0); s2++) ops.push({ op: 'delete', col: 'sapstage', id: sapCustChunkId_('cust', prev.run, s2) });
    sapStageWrite_(ops);
    var msg = 'Customer read: ' + c.inScope + ' customers in company ' + cfg.company + ' staged (' + c.outOfScope + ' of ' + c.read + ' read are outside it); ' + c.pin6 + ' with a 6-digit PIN, ' + c.noRegion + ' without a region, ' + c.severalAddresses + ' with several addresses.';
    sapStatusPatch_({ lastAt: now, lastKind: 'customers', lastOk: true, message: msg, conn: { ok: true, at: now }, cust: { run: run, rows: rows.length, at: now, status: 'staged', counts: c } });
    return { ok: true, customers: rows.length, read: c.read, inScope: c.inScope, outOfScope: c.outOfScope, counts: c, message: msg };
  } catch (e) {
    var conn = /^sap_/.test(e.deskCode || '') && e.deskCode !== 'sap_timeout';
    sapErrPush_(cfg, e.message || e);
    var patch = { lastAt: new Date(Date.now()).toISOString(), lastKind: 'customers', lastOk: false, message: sapRedact_(cfg, e.message || e) };
    if (conn) patch.conn = { ok: false, at: new Date(Date.now()).toISOString() };
    sapStatusPatch_(patch);
    throw e;
  } finally { sapRelease_(); }
}

/* ---------- public functions (owner or Super admin) ---------- */
/* every public function writes ONE line to the execution log, success or failure: function, ok, code, counts, short message. Never a credential, the user name or the SAP address (redacted from the settings). */
function sapLogLine_(fn, r, ms) {
  try {
    var p = sapProps_(), line = {};
    line.fn = fn; line.ok = !!(r && r.ok); if (r && r.code) line.code = String(r.code);
    ['done', 'gaps', 'optionalGaps', 'differ', 'plantMonths', 'stagedRows', 'removed', 'customers', 'inScope', 'outOfScope'].forEach(function (k) { if (r && r[k] !== undefined) line[k] = r[k]; });
    if (r && r.status && r.status.lastKind) line.last = r.status.lastKind;
    var pr = (r && (r.progress || (r.status && r.status.progress))) || null; if (pr && pr.text) line.progress = String(pr.text).slice(0, 200);
    if (r && r.resume) { line.resumed = !!r.resume.resumed; line.skip = r.resume.skip; line.total = r.resume.total; line.run = r.resume.run; if (!r.resume.resumed) line.why = String(r.resume.reason || '').slice(0, 120); }
    if (r && r.top5) { line.compared = r.plantMonths; line.top5 = r.top5; }
    if (r && r.lineBreakdown) { var q = r.lineBreakdown; line.lines = { sent: q.lines, docs: q.headers, kept: q.kept, acp: q.acpPlants1050Up, other: q.otherDocumentTypes, cancelled: q.cancelledInvoices + q.cancellationDocuments, flagged: q.notSheetUnitOrNotINR, unexplained: q.unexplained, perDoc: q.perDocument }; }
    if (r && r.saved === false) line.saved = false;
    if (r && r.dropLines && Object.keys(r.dropLines).length) line.dropLines = r.dropLines;
    if (r && r.drops) line.drops = r.drops; if (r && r.dropExamples) line.dropEx = r.dropExamples;
    if (r && r.auto) line.auto = String(r.auto.state || '').slice(0, 40);
    line.ms = ms;
    var rawMsg = String(r && r.message || ''), wi = rawMsg.indexOf('WARNING'); if (wi >= 0) line.warn = sapRedact_({ secrets: [p.getProperty('SAP_USER'), p.getProperty('SAP_PASSWORD'), p.getProperty('SAP_BASE_URL')] }, rawMsg.slice(wi)).slice(0, 200);   // never cut off by the short msg below
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
/* ---------- automatic continuation (no manual re-runs) ---------- */
/* sapShadowRunAuto(ym): runs the shadow read; if the run limit stops it, installs ONE one-off trigger that continues it about a minute later, and so on until it is finished. The trigger is removed when the run is done, on any error, when another run holds the run flag too often, or after SAP_AUTO_MAX_RUNS runs. Nothing is written to the Desk store. A time trigger cannot call sapShadowRun(ym) directly (it passes an event object), so the trigger calls sapShadowAutoTrigger_, which reads the month from SAP_AUTO. */
var SAP_AUTO_KINDS = { shadow: { fn: 'sapShadowAutoTrigger_', name: 'sapShadowRunAuto', label: 'shadow run' }, sync: { fn: 'sapSyncAutoTrigger_', name: 'sapSyncAuto', label: 'sync' } };
function sapAutoTriggers_(kind) { return ScriptApp.getProjectTriggers().filter(function (t) { var f = t.getHandlerFunction(); return kind ? f === SAP_AUTO_KINDS[kind].fn : (f === SAP_AUTO_KINDS.shadow.fn || f === SAP_AUTO_KINDS.sync.fn); }); }
function sapAutoClear_() { try { sapAutoTriggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); }); } catch (e) {} try { sapProps_().deleteProperty ? sapProps_().deleteProperty('SAP_AUTO') : sapProps_().setProperty('SAP_AUTO', ''); } catch (e2) {} }
function sapAutoSchedule_(st, delayMs) {
  sapAutoTriggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(SAP_AUTO_KINDS[st.kind].fn).timeBased().after(delayMs || SAP_AUTO_DELAY_MS).create();
  st.at = new Date(Date.now()).toISOString(); sapSetJson_('SAP_AUTO', st);
}
function sapRunBusy_() { var r = sapGetJson_('SAP_RUN', null); return !!(r && Date.now() - (r.at || 0) < SAP_RUN_STALE_MS); }
/* the shadow position belongs to one month. Asking for another month while one is part-way is refused, never allowed to overwrite it. */
function sapShadowMonthGuard_(ymArg) {
  if (!ymArg) return;
  var cur = sapCursorGet_('SAP_CURSOR_SHADOW'), j = cur.job;
  if (j && j.job === 'shadow' && j.months[0] !== ymArg) fail_('invalid_argument', 'A shadow run for ' + j.months[0] + ' is part-way' + (j.total ? ' (' + sapFmt_(j.skip) + ' of about ' + sapFmt_(j.total) + ' read)' : '') + ', so ' + ymArg + ' was not started and nothing was changed. Finish it first with sapShadowRunAuto() (no month), or discard it on purpose with sapResetCursors and then ask for ' + ymArg + '.');
}
/* one step of an automatic chain: kind 'shadow' or 'sync'. Same rules for both: a watchdog trigger before the run, one one-off trigger after a run that is not finished, a cap on runs, an SAP_AUTO record that sapStatus reports as stale when its trigger is gone, and an end (trigger and record removed) on done, error or the cap. */
function sapAutoStep_(kind, ymArg, first) {
  var K = SAP_AUTO_KINDS[kind], max = sapIntProp_('SAP_AUTO_MAX_RUNS', 1, 30, SAP_AUTO_MAX_RUNS), st = sapGetJson_('SAP_AUTO', null), ym = ymArg;
  if (first) {
    if (sapRunBusy_()) fail_('unavailable', 'Another SAP run is in progress. If it is an automatic one it carries on by itself; check sapStatus in a few minutes.');   // never take over a run that is going
    if (st && st.kind && st.kind !== kind && sapAutoTriggers_(st.kind).length) fail_('unavailable', 'An automatic ' + SAP_AUTO_KINDS[st.kind].label + ' is waiting for its next run. Let it finish, or stop it with sapStopAuto, before starting an automatic ' + K.label + '.');
    if (kind === 'shadow') sapShadowPre_(ymArg); else sapSyncPre_();   // every refusal (gate, settings, plants, month, unreadable position) BEFORE anything is cleared or scheduled
    sapAutoClear_(); st = { kind: kind, ym: ymArg || '', runs: 0, busy: 0, since: new Date(Date.now()).toISOString() };
  } else {
    if (!st || st.kind !== kind) { sapAutoTriggers_(kind).forEach(function (t) { ScriptApp.deleteTrigger(t); }); return { ok: true, done: false, auto: { state: 'cancelled' }, message: 'The automatic ' + K.label + ' was cancelled; nothing was read.' }; }
    sapAutoTriggers_(kind).forEach(function (t) { ScriptApp.deleteTrigger(t); });   // this trigger has fired; a new one is made only if more is needed
    ym = st.ym || undefined;
  }
  sapAutoSchedule_(st, SAP_RUN_STALE_MS + 30000);   // a watchdog: if Google kills this run at 6 minutes nothing below runs, and this trigger (after the run flag has gone stale) carries on from the saved position
  var r;
  try { r = kind === 'shadow' ? sapShadowRun_(ym || undefined) : sapSyncRun_('auto'); }
  catch (e) {
    if (e.deskCode === 'unavailable' && /Another SAP run/.test(String(e.message)) && !first && st.busy < SAP_AUTO_BUSY_MAX) {   // two runs at once is refused by the run flag; wait and try again
      st.busy++; sapAutoSchedule_(st);
      return { ok: true, done: false, auto: { state: 'waiting', busy: st.busy }, message: 'Another SAP run is in progress; the automatic run will try again in about a minute (' + st.busy + ' of ' + SAP_AUTO_BUSY_MAX + ').' };
    }
    sapAutoClear_(); throw e;   // an error ends the chain; the read position is kept, so ' + K.name + ' or the plain function resumes it
  }
  st.runs++;
  if (r.done) { sapAutoClear_(); r.auto = { state: 'finished', runs: st.runs }; r.message = (r.message || '') + ' Finished in ' + st.runs + ' run' + (st.runs === 1 ? '' : 's') + '. No trigger is left.'; return r; }
  if (st.runs >= max) { sapAutoClear_(); r.auto = { state: 'stopped', runs: st.runs }; r.message = 'Stopped after ' + st.runs + ' automatic runs without finishing (limit SAP_AUTO_MAX_RUNS). The read position is kept; run ' + K.name + ' again to carry on. ' + ((sapStatusGet_().progress || {}).text || ''); sapStatusPatch_({ message: r.message.slice(0, 400) }); return r; }
  sapAutoSchedule_(st); r.auto = { state: 'continuing', runs: st.runs, next: 'in about a minute' };
  r.message = 'Not finished yet; the next run starts by itself in about a minute (no need to click again). ' + ((sapStatusGet_().progress || {}).text || '');
  return r;
}
function sapShadowRunAuto(ym) { return sapPub_('sapShadowRunAuto', function () { return sapAutoStep_('shadow', ym, true); }); }
/* the same chain for the sync (SAP_SYNC_ENABLED and a finished shadow run are still required, as for sapSync) */
function sapSyncAuto() { return sapPub_('sapSyncAuto', function () { return sapAutoStep_('sync', undefined, true); }); }
/* stops an automatic chain: removes its trigger and state; the read position is kept */
function sapResetCursors() {
  return sapPub_('sapResetCursors', function () { var n = 0; ['SAP_CURSOR', 'SAP_CURSOR_SHADOW'].forEach(function (k) { if (sapProps_().getProperty(k)) { sapProps_().setProperty(k, ''); n++; } });
    sapAutoClear_(); return { ok: true, removed: n, message: n ? 'The saved read position was discarded on request; the next run starts from the beginning.' : 'There was no saved read position.' }; });
}
function sapStopAuto() {
  return sapPub_('sapStopAuto', function () { var n = sapAutoTriggers_().length + ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'sapContinueTrigger_'; }).length;
    sapAutoClear_(); ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sapContinueTrigger_') ScriptApp.deleteTrigger(t); });
    return { ok: true, removed: n, message: n ? 'The automatic run is stopped. The read position is kept.' : 'No automatic run was waiting.' }; });
}
function sapCustomerSync() { return sapPub_('sapCustomerSync', sapCustomerRun_); }
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
    ScriptApp.getProjectTriggers().forEach(function (t) { var f = t.getHandlerFunction(); if (f === 'sapSyncTrigger_' || f === 'sapContinueTrigger_' || f === 'sapShadowAutoTrigger_') { ScriptApp.deleteTrigger(t); n++; } });
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
    var patch = { staged: staged, loaded: { rows: Math.max(0, +s.rows | 0), at: at, months: months }, unresolved: un, message: String(s.message || '').slice(0, 200) };
    if (s.customers) {   // the page reports the customer master it loaded: { run, rows }
      var cu = st.cust || {}, cr = docsRaw_(colSheet_(book_(true), 'sapstage', false), ['cust_man']), cm = cr['cust_man'] ? JSON.parse(cr['cust_man']) : null;
      if (cm && String(cm.run) === String(s.customers.run)) {
        sapStageWrite_([{ op: 'merge', col: 'sapstage', id: 'cust_man', json: JSON.stringify({ status: 'loaded', loadedAt: at }) }]);
        cu.status = 'loaded'; cu.loadedAt = at; cu.loadedRows = Math.max(0, +s.customers.rows | 0); patch.cust = cu;
      }
      if (!months.length && !(+s.rows > 0)) { delete patch.staged; delete patch.loaded; delete patch.unresolved; if (!s.message) delete patch.message; }   // a customers-only report leaves the billing counts alone
    }
    sapStatusPatch_(patch);
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
function sapShadowAutoTrigger_() {
  if (!sapTriggerGate_()) { sapLogLine_('sapShadowAutoTrigger_', { ok: false, code: 'permission_denied', message: 'Refused: not the owner or a Super admin.' }, 0); return; }
  var t0 = Date.now(), r = wrap_(function () { return sapAutoStep_('shadow', undefined, false); });
  sapLogLine_('sapShadowAutoTrigger_', r, Date.now() - t0);
}
function sapSyncAutoTrigger_() {
  if (!sapTriggerGate_()) { sapLogLine_('sapSyncAutoTrigger_', { ok: false, code: 'permission_denied', message: 'Refused: not the owner or a Super admin.' }, 0); return; }
  var t0 = Date.now(), r = wrap_(function () { return sapAutoStep_('sync', undefined, false); });
  sapLogLine_('sapSyncAutoTrigger_', r, Date.now() - t0);
}
function sapContinueTrigger_() {
  if (!sapTriggerGate_()) { sapLogLine_('sapContinueTrigger_', { ok: false, code: 'permission_denied', message: 'Refused: not the owner or a Super admin.' }, 0); return; }
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sapContinueTrigger_') ScriptApp.deleteTrigger(t); });
  sapSyncTrigger_();
}
