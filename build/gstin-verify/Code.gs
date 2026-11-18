/**
 * GSTIN Verify — Google Apps Script for sheet "Data" (GSTIN in column A, header in row 1).
 * Fills B:L per row. Free local checksum first; only well-formed GSTINs go to the paid API.
 * Resumable: a row with a value in column L ("Checked") is skipped, so it is safe to re-run.
 *
 * Setup: Extensions > Apps Script > paste this file > Project Settings > Script Properties:
 *   GST_API_URL  e.g. https://sheet.gstincheck.co.in/check/{KEY}/{GSTIN}   ({KEY} and {GSTIN} are replaced)
 *   GST_API_KEY  your provider key
 * Then reload the sheet, run "GST Verify > Test first GSTIN" (grant access when asked; it shows the raw
 * API reply so you can confirm the provider's format), then "GST Verify > Start". It runs every 10 min until done.
 * To re-check a row (e.g. after correcting its GSTIN), clear its cell in column L.
 */
var SHEET = 'Data';
var HEADERS = ['GST Valid', 'GST Status', 'Trade Name', 'Legal Name', 'State', 'District',
               'City', 'Pincode', 'Area', 'Address', 'Checked'];
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
  var r = UrlFetchApp.fetch(apiUrl(g), { muteHttpExceptions: true });
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

function redact(text) {
  var key = PropertiesService.getScriptProperties().getProperty('GST_API_KEY');
  return key ? String(text).split(key).join('***') : String(text);
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
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
    sh.getRange(1, 2, 1, HEADERS.length).setValues([HEADERS]);
    var last = sh.getLastRow();
    if (last < 2) return stop();
    var gstins = sh.getRange(2, 1, last - 1, 1).getValues();
    var checked = sh.getRange(2, 12, last - 1, 1).getValues();

    var todo = [];
    for (var i = 0; i < gstins.length; i++) {
      if (String(gstins[i][0]).trim() && !checked[i][0]) todo.push(i);
    }

    while (todo.length) {
      if (Date.now() - t0 > MAX_RUN_MS) return; // trigger picks up the rest
      var chunk = todo.splice(0, BATCH), calls = [], callRows = [];
      chunk.forEach(function (i) {
        var g = String(gstins[i][0]).trim().toUpperCase();
        if (!isValidGstin(g)) return writeRow(sh, i, ['No', 'Invalid format/checksum'], 'not sent to API', gstins[i][0]);
        calls.push({ url: apiUrl(g), muteHttpExceptions: true });
        callRows.push(i);
      });
      if (!calls.length) continue;
      var res;
      try { res = UrlFetchApp.fetchAll(calls); } catch (e) { return; } // network/timeout: retried next run
      for (var k = 0; k < res.length; k++) {
        var code = res[k].getResponseCode(), body = res[k].getContentText();
        if (code === 429) return; // rate-limited: rest retried next run
        if (code >= 500) continue; // provider error on this row only: left unchecked, retried next run
        if (code === 401 || code === 402 || code === 403 || ACCOUNT_ERROR.test(body)) {
          stop(); // key/credit problem: halt instead of marking every row "Not found"
          throw new Error('API account problem, verification stopped: HTTP ' + code + ' ' + redact(body).slice(0, 200));
        }
        var out;
        try { out = parseResponse(JSON.parse(body)); }
        catch (e) { out = { row: ['Error', ''], note: 'HTTP ' + code + ': ' + redact(body).slice(0, 100) }; }
        writeRow(sh, callRows[k], out.row, redact(out.note), gstins[callRows[k]][0]);
      }
    }
    stop(); // all rows done
  } finally {
    lock.releaseLock();
  }
}

function writeRow(sh, i, values, note, expectedGstin) {
  // rows may have been sorted/deleted since the run started: write only if column A still holds this GSTIN
  if (expectedGstin !== undefined && sh.getRange(i + 2, 1).getValue() !== expectedGstin) return;
  var row = values.slice();
  while (row.length < 10) row.push('');
  row.push(new Date().toISOString() + (note ? ' | ' + note : ''));
  sh.getRange(i + 2, 2, 1, 11).setValues([row]);
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
    return { row: ['No', 'Not found'], note: (j && (j.message || j.error || j.msg)) || 'no taxpayer data' };
  }
  var a = (d.pradr && d.pradr.addr) || {};
  var address = (d.pradr && d.pradr.adr) ||
    [a.flno, a.bno, a.bnm, a.st, a.loc, a.city, a.dst, a.stcd, a.pncd].filter(Boolean).join(', ');
  var active = String(d.sts).toLowerCase() === 'active';
  return {
    row: [active ? 'Yes' : 'No', d.sts || '', d.tradeNam || '', d.lgnm || '', a.stcd || '', a.dst || '',
          a.city || '', a.pncd || '', a.loc || '', address],
    note: ''
  };
}
