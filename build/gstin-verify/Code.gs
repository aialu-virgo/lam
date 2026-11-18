/**
 * GSTIN Verify — Google Apps Script for sheet "Data" (GSTIN in column A, header in row 1).
 * Fills B:I per row: GST Verification, Firm Name, State, District, City, Pincode, Address, Checked.
 * Free local checksum first; only well-formed GSTINs go to the paid API.
 * Resumable: a row with a value in column I ("Checked") is skipped, so it is safe to re-run.
 *
 * Setup: Extensions > Apps Script > paste this file > Project Settings > Script Properties:
 *   GST_API_URL  e.g. https://sheet.gstincheck.co.in/check/{KEY}/{GSTIN}   ({KEY} and {GSTIN} are replaced)
 *   GST_API_KEY  your provider key
 *   GST_API_HEADERS  optional JSON of request headers, e.g. {"client_id":"...","client_secret":"..."}
 * Then reload the sheet, run "GST Verify > Test first GSTIN" (grant access when asked; it shows the raw
 * API reply so you can confirm the provider's format), then "GST Verify > Start". It runs every 10 min until done.
 * To re-check a row (e.g. after correcting its GSTIN), clear its cell in column I.
 */
var SHEET = 'Data';
var HEADERS = ['GST Verification', 'Firm Name', 'State', 'District', 'City', 'Pincode', 'Address', 'Checked'];
var CHECKED_COL = 1 + HEADERS.length; // column I
var MAX_TRIES = 3;
var BATCH = 10;              // parallel requests per fetchAll
var MAX_RUN_MS = 4.5 * 60e3; // stop before the 6-min Apps Script limit; the trigger resumes
// shortcut: keyword match on the provider's error text; adjust if your provider words it differently
var ACCOUNT_ERROR = /api ?key|unauthori[sz]ed|credit|balance|subscription|quota|expired/i;
var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GST Verify')
    .addItem('Test first GSTIN', 'testOne').addItem('Start', 'start').addItem('Stop', 'stop').addToUi();
}

function start() {
  stop();
  ScriptApp.newTrigger('run').timeBased().everyMinutes(10).create();
  run();
}

function testOne() {
  var g = String(SpreadsheetApp.getActive().getSheetByName(SHEET).getRange('A2').getValue()).trim().toUpperCase();
  var r = UrlFetchApp.fetch(apiUrl(g), { muteHttpExceptions: true, headers: apiHeaders() });
  var parsed = '';
  try { parsed = JSON.stringify(parseResponse(JSON.parse(r.getContentText())).row); } catch (e) {}
  SpreadsheetApp.getUi().alert('GSTIN ' + g + '\nHTTP ' + r.getResponseCode() + '\n' +
    redact(r.getContentText()).slice(0, 1500) + '\n\nParsed: ' + parsed);
}

function apiUrl(g) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('GST_API_URL'), key = props.getProperty('GST_API_KEY');
  if (!url || !key) throw new Error('Set GST_API_URL and GST_API_KEY in Script Properties.');
  return url.replace('{KEY}', encodeURIComponent(key)).replace('{GSTIN}', g);
}

function apiHeaders() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('GST_API_HEADERS') || '{}');
}

function redact(text) {
  var key = PropertiesService.getScriptProperties().getProperty('GST_API_KEY');
  if (!key) return String(text);
  return String(text).split(key).join('***').split(encodeURIComponent(key)).join('***');
}

function stop() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t);
  });
}

function run() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a previous run is still going
  try {
    var t0 = Date.now();
    apiUrl('X'); // fails fast if setup is missing
    var headers = apiHeaders();
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
    sh.getRange(1, 2, 1, HEADERS.length).setValues([HEADERS]);
    var last = sh.getLastRow();
    if (last < 2) return stop();
    var gstins = sh.getRange(2, 1, last - 1, 1).getValues();
    var checked = sh.getRange(2, CHECKED_COL, last - 1, 1).getValues();

    var todo = [], tries = {};
    for (var i = 0; i < gstins.length; i++) {
      if (String(gstins[i][0]).trim() && !checked[i][0]) todo.push(i);
    }

    // network error / 429 / 5xx: retry up to MAX_TRIES with a pause, then mark "Error" so the job never stalls
    function retryLater(rows, why) {
      var again = [];
      rows.forEach(function (i) {
        tries[i] = (tries[i] || 0) + 1;
        if (tries[i] >= MAX_TRIES) writeRow(sh, i, ['Error'], why + '; clear column I to retry', gstins[i][0]);
        else again.push(i);
      });
      if (again.length) { Utilities.sleep(20e3); todo = again.concat(todo); }
    }

    while (todo.length) {
      if (Date.now() - t0 > MAX_RUN_MS) return; // trigger picks up the rest
      var chunk = todo.splice(0, BATCH), calls = [], callRows = [], failed = [], why = '';
      chunk.forEach(function (i) {
        var g = String(gstins[i][0]).trim().toUpperCase();
        if (!isValidGstin(g)) return writeRow(sh, i, ['Invalid GSTIN'], 'format/checksum wrong, not sent to API', gstins[i][0]);
        calls.push({ url: apiUrl(g), muteHttpExceptions: true, headers: headers });
        callRows.push(i);
      });
      if (!calls.length) continue;
      var res;
      try { res = UrlFetchApp.fetchAll(calls); }
      catch (e) { retryLater(callRows, 'network: ' + redact(e.message).slice(0, 80)); continue; }
      for (var k = 0; k < res.length; k++) {
        var code = res[k].getResponseCode(), body = res[k].getContentText();
        if (code === 429 || code >= 500) { failed.push(callRows[k]); why = 'HTTP ' + code; continue; }
        var out;
        try { out = parseResponse(JSON.parse(body)); }
        catch (e) { out = { found: false, row: ['Error'], note: 'HTTP ' + code + ': ' + body.slice(0, 100) }; }
        if (!out.found && (code === 401 || code === 402 || code === 403 || ACCOUNT_ERROR.test(out.note))) {
          stop(); // key/credit problem: halt instead of marking every row "Not found"
          throw new Error('API account problem, verification stopped: HTTP ' + code + ' ' + redact(body).slice(0, 200));
        }
        writeRow(sh, callRows[k], out.row, redact(out.note), gstins[callRows[k]][0]);
      }
      if (failed.length) retryLater(failed, why);
    }
    stop(); // every row has a result
  } finally {
    lock.releaseLock();
  }
}

function writeRow(sh, i, values, note, expectedGstin) {
  // rows may have been sorted/deleted since the run started: write only if column A still holds this GSTIN
  if (sh.getRange(i + 2, 1).getValue() !== expectedGstin) return;
  var row = values.slice();
  while (row.length < HEADERS.length - 1) row.push('');
  row.push(new Date().toISOString() + (note ? ' | ' + note : ''));
  sh.getRange(i + 2, 2, 1, HEADERS.length).setValues([row]);
}

/** GSTIN checksum (GSTN mod-36 algorithm). */
function isValidGstin(g) {
  if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(g)) return false;
  var st = +g.slice(0, 2);
  if (!((st >= 1 && st <= 38) || st === 97 || st === 99)) return false; // valid GST state codes
  var sum = 0;
  for (var i = 0; i < 14; i++) {
    var p = CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}

/** Reads the standard GSTN taxpayer-search object (lgnm, tradeNam, sts, pradr.addr), wherever the provider wraps it. */
function parseResponse(j) {
  var d = j && (j.data || j.result || j.taxpayerInfo || j);
  if (d && d.data) d = d.data; // some providers nest twice
  if (!d || !d.lgnm) {
    return { found: false, row: ['Not found'], note: String((j && (j.message || j.error || j.msg)) || 'no taxpayer data') };
  }
  var a = (d.pradr && d.pradr.addr) || {};
  var address = (d.pradr && d.pradr.adr) ||
    [a.flno, a.bno, a.bnm, a.st, a.loc, a.city, a.dst, a.stcd, a.pncd].filter(Boolean).join(', ');
  return {
    found: true,
    // Firm Name = trade name, else legal name; City falls back to locality when GST leaves city blank
    row: ['Valid - ' + (d.sts || 'status unknown'), d.tradeNam || d.lgnm, a.stcd || '', a.dst || '',
          a.city || a.loc || '', a.pncd || '', address],
    note: ''
  };
}
