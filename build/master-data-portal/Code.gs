/**
 * Virgo Asia Master Data Portal - server side (Google Apps Script, V8).
 * Deploy as a web app, "Execute as: Me (deployer)", "Who has access: Anyone within virgoasia.com".
 * Every public function called from the browser returns {ok:true, data:...} or {ok:false, error:'...'}.
 * Functions whose names end in "_" are private (not callable from the browser).
 */

/* =====================================================================
 * CONFIG - the only place admins need to edit lists, e-mail and limits.
 * The option lists below are PLACEHOLDERS: replace them with the real lists.
 * ===================================================================== */
var CONFIG = {
  APP_TITLE: 'Virgo Asia Master Data Portal',
  LOGO_URL: '',                          // https URL of a logo image; blank shows a text badge
  NOTIFY_EMAIL: 'data@virgoasia.com',    // receives every new request
  SEED_ADMIN: 'data@virgoasia.com',      // always an admin, cannot be removed

  SPREADSHEET_ID: '',                    // optional: existing spreadsheet; blank = auto-create on first run
  SPREADSHEET_NAME: 'Virgo Asia Master Data Requests',
  REQUEST_SHEET: 'Item Master Requests',
  ADMIN_SHEET: 'Admins',
  DRIVE_FOLDER_ID: '',                   // optional: existing root folder; blank = auto-create on first run
  DRIVE_FOLDER_NAME: 'Virgo Asia Master Data Attachments',
  REQUEST_PREFIX: 'VIR-MAT-',            // numbers look like VIR-MAT-00001

  STRICT_EMAIL_SEARCH: true,             // non-admins may search only their own signed-in e-mail
  SHARE_FOLDER_WITH_DOMAIN: true,        // request folders viewable by anyone in the domain who has the link
  NOTIFY_REQUESTER_ON_STATUS_CHANGE: true,

  MAX_FILE_MB: 10,
  MAX_FILES: 5,
  MAX_TOTAL_MB: 25,
  ALLOWED_FILE_EXT: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'dwg', 'dxf'],

  STATUSES: ['Submitted', 'Under Review', 'Clarification Required', 'Approved', 'Rejected', 'Created in ERP'],
  PENDING_STATUSES: ['Submitted', 'Under Review', 'Clarification Required'],

  REQUIRED_FIELDS: ['requestorName', 'department', 'email', 'mobile', 'itemDescription', 'finish',
    'thickness', 'thicknessType', 'size', 'brand', 'hsnCode', 'factory', 'plantCode', 'purchaseGroup',
    'itemCategory', 'baseUom', 'materialGroup', 'gstPercent'],

  OPTIONS: {
    department: ['Sales', 'Purchase', 'Production', 'Quality', 'Finance', 'IT', 'Other'],
    finish: ['Gloss', 'Matt', 'Suede', 'Texture', 'Woodgrain'],
    thicknessType: ['Nominal', 'Actual'],
    size: ['8 x 4 ft', '7 x 4 ft', '6 x 4 ft', 'Custom'],
    brand: ['Brand A', 'Brand B', 'Brand C'],
    factory: ['Factory 1', 'Factory 2', 'Factory 3'],
    plantCode: ['1000', '1100', '1200'],
    purchaseGroup: ['PG1', 'PG2', 'PG3'],
    itemCategory: ['Finished Goods', 'Semi-Finished', 'Raw Material', 'Packing Material', 'Trading Goods'],
    priceGroupName: ['Price Group 1', 'Price Group 2', 'Price Group 3'],
    baseUom: ['Sheet', 'Piece', 'Sq.m', 'Kg', 'Nos'],
    materialGroup: ['Group 1', 'Group 2', 'Group 3'],
    gstPercent: ['0', '0.25', '3', '5', '12', '18', '28']
  }
};

/* Sheet columns in their required order. Audit columns come last. */
var COLS = [
  ['Request Number', 'requestNumber'], ['Request Date', 'requestDate'], ['Requestor Name', 'requestorName'],
  ['Department', 'department'], ['Email', 'email'], ['Mobile', 'mobile'], ['Item Description', 'itemDescription'],
  ['Design', 'design'], ['Finish', 'finish'], ['Thickness', 'thickness'], ['Thickness Type', 'thicknessType'],
  ['Size', 'size'], ['Length', 'length'], ['Width', 'width'], ['Brand', 'brand'], ['HSN Code', 'hsnCode'],
  ['Factory', 'factory'], ['Plant Code', 'plantCode'], ['Purchase Group', 'purchaseGroup'],
  ['Item Category', 'itemCategory'], ['Price Group Name', 'priceGroupName'], ['Material Group', 'materialGroup'],
  ['Base UOM', 'baseUom'], ['GST %', 'gstPercent'], ['Preferred Vendor', 'preferredVendor'], ['Remarks', 'remarks'],
  ['Attachment Link', 'attachmentLink'], ['Status', 'status'], ['Admin Comments', 'adminComments'],
  ['Last Updated', 'lastUpdated'], ['Updated By', 'updatedBy']
];
var NUMERIC_KEYS = ['thickness', 'length', 'width', 'gstPercent'];
var DATE_KEYS = ['requestDate', 'lastUpdated'];
var FORM_KEYS = ['requestorName', 'department', 'email', 'mobile', 'itemDescription', 'design', 'finish',
  'thickness', 'thicknessType', 'size', 'length', 'width', 'brand', 'hsnCode', 'factory', 'plantCode',
  'purchaseGroup', 'itemCategory', 'priceGroupName', 'baseUom', 'materialGroup', 'gstPercent',
  'preferredVendor', 'remarks'];
var MAX_LEN = { itemDescription: 200, remarks: 1000, email: 254, requestorName: 100 };
var DATE_FMT = 'dd-MMM-yyyy HH:mm';
var VIEWS = ['home', 'item', 'status', 'users', 'reports'];

/* ============================ Web app entry ============================ */

function doGet(e) {
  try {
    var t = HtmlService.createTemplateFromFile('Index');
    var page = (e && e.parameter && e.parameter.page) || 'home';
    t.initialView = VIEWS.indexOf(page) >= 0 ? page : 'home';
    return t.evaluate()
      .setTitle(CONFIG.APP_TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    console.error(err && err.stack || err);
    return HtmlService.createHtmlOutput('<p>The portal could not start: ' + esc_(err && err.message) + '</p>');
  }
}

/** Private (trailing underscore: not callable from the browser). Used by Index.html: <?!= include_('Styles') ?> */
var INCLUDE_ALLOW = ['Styles', 'JavaScript', 'ItemForm', 'StatusTracking', 'Admin'];
function include_(name) {
  if (INCLUDE_ALLOW.indexOf(name) < 0) throw new Error('Include not allowed: ' + name);
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ============================ Helpers ============================ */

function UserError(message, fieldErrors) {
  var e = new Error(message);
  e.name = 'UserError';
  e.isUserError = true;
  e.fieldErrors = fieldErrors || null;
  return e;
}

function run_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e && e.isUserError) {
      var out = { ok: false, error: e.message };
      if (e.fieldErrors) out.fieldErrors = e.fieldErrors;
      return out;
    }
    console.error(e && e.stack || e);
    return { ok: false, error: 'Unexpected error: ' + (e && e.message ? e.message : e) };
  }
}

/** Neutralise spreadsheet formulas: a leading = + - @ (or tab/CR) gets an apostrophe prefix. */
function safeCell_(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}
function unsafeCell_(v) {
  return (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v)) ? v.slice(1) : v;
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tz_() { return Session.getScriptTimeZone() || 'Asia/Kolkata'; }
function fmt_(d, pattern) { return Utilities.formatDate(d, tz_(), pattern || DATE_FMT); }
function colIndex_(key) { for (var i = 0; i < COLS.length; i++) if (COLS[i][1] === key) return i + 1; return -1; }
function label_(key) { for (var i = 0; i < COLS.length; i++) if (COLS[i][1] === key) return COLS[i][0]; return key; }

function activeEmail_() {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) { e = ''; }
  return String(e || '').trim().toLowerCase();
}

/* ---------- Spreadsheet, sheets, folder (auto-created, IDs in Script Properties) ---------- */

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = CONFIG.SPREADSHEET_ID || props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    id = props.getProperty('SPREADSHEET_ID');
    if (id) return SpreadsheetApp.openById(id);
    var ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
    props.setProperty('SPREADSHEET_ID', ss.getId());
    return ss;
  } finally {
    lock.releaseLock();
  }
}

function getRequestSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.REQUEST_SHEET);
  var headers = COLS.map(function (c) { return c[0]; });
  if (!sh) {
    sh = ss.insertSheet(CONFIG.REQUEST_SHEET);
    var def = ss.getSheetByName('Sheet1');
    if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    // Text format on every text column so typed values (HSN, mobile, '=...') are never interpreted.
    COLS.forEach(function (c, i) {
      var k = c[1];
      var range = sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
      if (DATE_KEYS.indexOf(k) >= 0) range.setNumberFormat('dd-mmm-yyyy hh:mm');
      else if (NUMERIC_KEYS.indexOf(k) < 0) range.setNumberFormat('@');
    });
  } else {
    var existing = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (String(existing[i]).trim() !== headers[i]) {
        throw UserError('Sheet "' + CONFIG.REQUEST_SHEET + '" has an unexpected header in column ' + (i + 1) +
          ' (expected "' + headers[i] + '"). Do not rename or reorder the first ' + headers.length + ' columns.');
      }
    }
  }
  return sh;
}

function getAdminSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.ADMIN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.ADMIN_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['Email', 'Added By', 'Added On']]).setFontWeight('bold');
    sh.getRange(2, 1, sh.getMaxRows() - 1, 3).setNumberFormat('@');
    sh.setFrozenRows(1);
    sh.appendRow([CONFIG.SEED_ADMIN.toLowerCase(), 'system', fmt_(new Date())]);
  }
  return sh;
}

function getRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = CONFIG.DRIVE_FOLDER_ID || props.getProperty('DRIVE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var f = DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
  props.setProperty('DRIVE_FOLDER_ID', f.getId());
  return f;
}

/** Run once from the editor: creates sheet + folder, seeds admin, triggers the authorisation prompt. */
function setup() {
  requireAdmin_();   // public functions are callable from the page: only an authorised admin may run setup
  var sh = getRequestSheet_();
  getAdminSheet_();
  var folder = getRootFolder_();
  var quota = MailApp.getRemainingDailyQuota();
  var ss = getSpreadsheet_();
  var msg = 'Setup OK. Spreadsheet: ' + ss.getUrl() + ' | Requests sheet rows: ' + (sh.getLastRow() - 1) +
    ' | Drive folder: ' + folder.getUrl() + ' | Mail quota left today: ' + quota;
  Logger.log(msg);
  return msg;
}

/* ---------- Admin list ---------- */

function listAdmins_() {
  var sh = getAdminSheet_();
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
  var out = [], seen = {};
  rows.forEach(function (r) {
    var e = unsafeCell_(String(r[0] || '')).trim().toLowerCase();
    if (e && !seen[e]) { seen[e] = true; out.push({ email: e, addedBy: String(r[1] || ''), addedOn: String(r[2] || '') }); }
  });
  var seed = CONFIG.SEED_ADMIN.toLowerCase();
  if (!seen[seed]) out.unshift({ email: seed, addedBy: 'system', addedOn: '' });
  return out;
}

function isAdmin_(email) {
  if (!email) return false;
  email = String(email).trim().toLowerCase();
  if (email === CONFIG.SEED_ADMIN.toLowerCase()) return true;
  return listAdmins_().some(function (a) { return a.email === email; });
}

/** Server-side authorisation check; every admin function calls this first. */
function requireAdmin_() {
  var email = activeEmail_();
  if (!email) throw UserError('Your Google account could not be identified. Open the portal while signed in with your virgoasia.com account.');
  if (!isAdmin_(email)) throw UserError('Access denied: ' + email + ' is not an authorised admin.');
  return email;
}

/* ============================ Validation ============================ */

var EMAIL_RE = /^[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"']{2,}$/;

function normaliseMobile_(raw) {
  var s = String(raw || '').replace(/[\s\-().]/g, '');
  if (/^\+91\d{10}$/.test(s)) s = s.slice(3);
  else if (/^91\d{10}$/.test(s)) s = s.slice(2);
  else if (/^0\d{10}$/.test(s)) s = s.slice(1);
  return s;
}

function validateItem_(d) {
  d = d || {};
  var errors = {}, clean = {};
  FORM_KEYS.forEach(function (k) {
    var v = d[k];
    clean[k] = (v === null || v === undefined) ? '' : String(v).trim();
  });
  CONFIG.REQUIRED_FIELDS.forEach(function (k) {
    if (!clean[k]) errors[k] = 'This field is required.';
  });
  FORM_KEYS.forEach(function (k) {
    var max = MAX_LEN[k] || 100;
    if (clean[k].length > max && !errors[k]) errors[k] = 'Maximum ' + max + ' characters.';
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean[k]) && !errors[k]) errors[k] = 'Contains invalid characters.';
  });
  if (clean.email && !errors.email && !EMAIL_RE.test(clean.email)) errors.email = 'Enter a valid e-mail address.';
  if (clean.mobile && !errors.mobile) {
    clean.mobile = normaliseMobile_(clean.mobile);
    if (!/^[6-9]\d{9}$/.test(clean.mobile)) errors.mobile = 'Enter a 10-digit Indian mobile number (starts with 6-9).';
  }
  if (clean.hsnCode && !errors.hsnCode && !/^(\d{4}|\d{6}|\d{8})$/.test(clean.hsnCode)) {
    errors.hsnCode = 'HSN code must be 4, 6 or 8 digits.';
  }
  ['thickness', 'length', 'width'].forEach(function (k) {
    if (clean[k] && !errors[k]) {
      if (!/^\d+(\.\d{1,4})?$/.test(clean[k]) || parseFloat(clean[k]) <= 0) errors[k] = 'Enter a number greater than 0.';
    }
  });
  Object.keys(CONFIG.OPTIONS).forEach(function (k) {
    var list = CONFIG.OPTIONS[k];
    if (clean[k] && !errors[k] && list.length && list.indexOf(clean[k]) < 0) errors[k] = 'Choose a value from the list.';
  });
  return { clean: clean, errors: errors };
}

function extOf_(name) {
  var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

function validateFiles_(files) {
  var problems = [];
  files = files || [];
  if (!Array.isArray(files)) return ['Attachments are malformed.'];
  if (files.length > CONFIG.MAX_FILES) problems.push('At most ' + CONFIG.MAX_FILES + ' files are allowed.');
  var total = 0, maxBytes = CONFIG.MAX_FILE_MB * 1024 * 1024;
  files.forEach(function (f) {
    var name = f && f.name ? String(f.name) : '(unnamed)';
    var data = f && typeof f.data === 'string' ? f.data : '';
    if (!data) { problems.push(name + ': file is empty.'); return; }
    if (CONFIG.ALLOWED_FILE_EXT.indexOf(extOf_(name)) < 0) {
      problems.push(name + ': type not allowed (allowed: ' + CONFIG.ALLOWED_FILE_EXT.join(', ') + ').');
    }
    var pad = data.slice(-2) === '==' ? 2 : (data.slice(-1) === '=' ? 1 : 0);
    var bytes = Math.floor(data.length * 3 / 4) - pad;
    total += bytes;
    if (bytes > maxBytes) problems.push(name + ': larger than ' + CONFIG.MAX_FILE_MB + ' MB.');
  });
  if (total > CONFIG.MAX_TOTAL_MB * 1024 * 1024) problems.push('Total attachments exceed ' + CONFIG.MAX_TOTAL_MB + ' MB.');
  return problems;
}

/* ============================ Public API: config ============================ */

function getAppConfig() {
  return run_(function () {
    var email = activeEmail_();
    return {
      title: CONFIG.APP_TITLE,
      logoUrl: CONFIG.LOGO_URL,
      user: { email: email, isAdmin: isAdmin_(email) },
      statuses: CONFIG.STATUSES,
      options: CONFIG.OPTIONS,
      required: CONFIG.REQUIRED_FIELDS,
      limits: {
        maxFileMb: CONFIG.MAX_FILE_MB, maxFiles: CONFIG.MAX_FILES, maxTotalMb: CONFIG.MAX_TOTAL_MB,
        allowedExt: CONFIG.ALLOWED_FILE_EXT
      },
      now: fmt_(new Date())
    };
  });
}

/* ============================ Public API: submit ============================ */

function allocateRequestNumber_(sheet) {
  var props = PropertiesService.getScriptProperties();
  var counter = parseInt(props.getProperty('REQ_COUNTER') || '0', 10) || 0;
  var last = sheet.getLastRow(), maxSheet = 0;
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      var m = /(\d+)$/.exec(String(r[0]));
      if (m) maxSheet = Math.max(maxSheet, parseInt(m[1], 10));
    });
  }
  var next = Math.max(counter, maxSheet) + 1;
  props.setProperty('REQ_COUNTER', String(next));
  var s = String(next);
  while (s.length < 5) s = '0' + s;
  return CONFIG.REQUEST_PREFIX + s;
}

function findRow_(sheet, requestNumber) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var vals = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === requestNumber) return i + 2;
  return -1;
}

function safeName_(name) {
  return String(name).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').slice(-120);
}

var MIME_BY_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  dwg: 'application/octet-stream', dxf: 'application/octet-stream'
};

function saveAttachments_(requestNumber, files) {
  if (!files || !files.length) return { folderUrl: '', links: [] };
  var folder = getRootFolder_().createFolder(requestNumber);
  if (CONFIG.SHARE_FOLDER_WITH_DOMAIN) {
    try { folder.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.warn('Folder sharing not applied: ' + e.message); }
  }
  var maxBytes = CONFIG.MAX_FILE_MB * 1024 * 1024, links = [];
  files.forEach(function (f, i) {
    var bytes = Utilities.base64Decode(f.data);
    if (bytes.length > maxBytes) throw UserError(f.name + ' is larger than ' + CONFIG.MAX_FILE_MB + ' MB.');
    var name = (i + 1) + '_' + safeName_(f.name);
    var blob = Utilities.newBlob(bytes, MIME_BY_EXT[extOf_(f.name)] || 'application/octet-stream', name);
    var file = folder.createFile(blob);
    links.push(name + ' - ' + file.getUrl());
  });
  return { folderUrl: folder.getUrl(), links: links };
}

function submitItemRequest(payload) {
  return run_(function () {
    payload = payload || {};
    var v = validateItem_(payload.fields);
    if (Object.keys(v.errors).length) throw UserError('Please correct the highlighted fields.', v.errors);
    var fileProblems = validateFiles_(payload.files);
    if (fileProblems.length) throw UserError(fileProblems.join(' '));
    var d = v.clean;

    var sheet = getRequestSheet_();      // create before taking the lock (script lock is not re-entrant)
    var now = new Date();
    var requestNumber, rowIndex;

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      requestNumber = allocateRequestNumber_(sheet);
      var rec = {};
      FORM_KEYS.forEach(function (k) {
        rec[k] = NUMERIC_KEYS.indexOf(k) >= 0 && d[k] !== '' ? parseFloat(d[k]) : d[k];
      });
      rec.requestNumber = requestNumber;
      rec.requestDate = now;
      rec.attachmentLink = '';
      rec.status = CONFIG.STATUSES[0];
      rec.adminComments = '';
      rec.lastUpdated = now;
      rec.updatedBy = 'Requester';
      var row = COLS.map(function (c) { var x = rec[c[1]]; return x === undefined ? '' : safeCell_(x); });
      sheet.appendRow(row);
      rowIndex = sheet.getLastRow();
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    var result = { requestNumber: requestNumber, attachments: 0, attachmentError: '', mail: { admin: false, requester: false, errors: [] } };

    // Files (after the request is safely saved)
    try {
      var saved = saveAttachments_(requestNumber, payload.files);
      result.attachments = saved.links.length;
      if (saved.links.length) {
        var cell = sheet.getRange(findRow_(sheet, requestNumber), colIndex_('attachmentLink'));
        cell.setValue(safeCell_(saved.folderUrl + '\n' + saved.links.join('\n')));
        d._attachmentText = saved.folderUrl;
      }
    } catch (e) {
      console.error(e && e.stack || e);
      result.attachmentError = 'Request saved, but attachments could not be stored: ' + e.message;
      try { sheet.getRange(findRow_(sheet, requestNumber), colIndex_('attachmentLink')).setValue(safeCell_('UPLOAD FAILED: ' + e.message)); } catch (e2) { /* ignore */ }
    }

    // E-mail (failure must never lose the request)
    var subject = 'New Item Creation Request - ' + requestNumber;
    try {
      if (MailApp.getRemainingDailyQuota() < 2) throw new Error('Daily mail quota exhausted');
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL, replyTo: d.email, subject: subject, name: CONFIG.APP_TITLE,
        body: plainBody_(requestNumber, now, d), htmlBody: htmlBody_(requestNumber, now, d, false)
      });
      result.mail.admin = true;
    } catch (e) {
      result.mail.errors.push('Admin notification failed: ' + e.message);
    }
    try {
      MailApp.sendEmail({
        to: d.email, subject: subject, name: CONFIG.APP_TITLE,
        body: plainBody_(requestNumber, now, d), htmlBody: htmlBody_(requestNumber, now, d, true)
      });
      result.mail.requester = true;
    } catch (e) {
      result.mail.errors.push('Acknowledgement to requester failed: ' + e.message);
    }
    if (result.mail.errors.length) console.error('Mail problems for ' + requestNumber + ': ' + result.mail.errors.join(' | '));
    return result;
  });
}

function emailRows_(d) {
  return FORM_KEYS.map(function (k) { return [label_(k), d[k]]; });
}

function htmlBody_(requestNumber, now, d, ack) {
  var rows = [['Request Number', requestNumber], ['Request Date', fmt_(now)]].concat(emailRows_(d));
  rows.push(['Attachments', d._attachmentText || 'None / see portal']);
  var tr = rows.map(function (r) {
    return '<tr><td style="padding:6px 10px;border:1px solid #d5dbe5;background:#f4f7fb;font-weight:bold;white-space:nowrap">' + esc_(r[0]) +
      '</td><td style="padding:6px 10px;border:1px solid #d5dbe5">' + esc_(r[1]).replace(/\n/g, '<br>') + '</td></tr>';
  }).join('');
  var intro = ack
    ? 'Thank you. Your item creation request has been received. Quote <b>' + esc_(requestNumber) + '</b> to track it in the portal.'
    : 'A new item creation request has been submitted.';
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c2733"><p>' + intro + '</p>' +
    '<table style="border-collapse:collapse;font-size:13px">' + tr + '</table>' +
    '<p style="color:#6b7785;font-size:12px">' + esc_(CONFIG.APP_TITLE) + '</p></div>';
}

function plainBody_(requestNumber, now, d) {
  var lines = ['Request Number: ' + requestNumber, 'Request Date: ' + fmt_(now)];
  emailRows_(d).forEach(function (r) { lines.push(r[0] + ': ' + r[1]); });
  return lines.join('\n');
}

/**
 * Retry attachments for a request whose upload failed. Accepts only the requester's own request:
 * the e-mail given must match the row, and (when the visitor is identified) the signed-in e-mail too.
 * Only allowed while the row's Attachment Link says "UPLOAD FAILED".
 */
function retryAttachments(payload) {
  return run_(function () {
    payload = payload || {};
    var num = String(payload.requestNumber || '').trim().toUpperCase();
    var email = String(payload.email || '').trim().toLowerCase();
    var problems = validateFiles_(payload.files);
    if (!payload.files || !payload.files.length) problems.push('Choose at least one file.');
    if (problems.length) throw UserError(problems.join(' '));
    var sheet = getRequestSheet_();
    var r = findRow_(sheet, num);
    if (r < 0) throw UserError('Request ' + num + ' was not found.');
    var cur = sheet.getRange(r, 1, 1, COLS.length).getValues()[0];
    var rowEmail = unsafeCell_(String(cur[colIndex_('email') - 1])).toLowerCase();
    var me = activeEmail_();
    if (!email || rowEmail !== email || (me && me !== rowEmail)) throw UserError('This request does not belong to you.');
    if (String(cur[colIndex_('attachmentLink') - 1]).indexOf('UPLOAD FAILED') !== 0) {
      throw UserError('Attachments for ' + num + ' do not need a retry.');
    }
    var saved = saveAttachments_(num, payload.files);
    var rr = findRow_(sheet, num);
    sheet.getRange(rr, colIndex_('attachmentLink')).setValue(safeCell_(saved.folderUrl + '\n' + saved.links.join('\n')));
    sheet.getRange(rr, colIndex_('lastUpdated')).setValue(new Date());
    SpreadsheetApp.flush();
    return { requestNumber: num, attachments: saved.links.length };
  });
}

/* ============================ Row reading ============================ */

function readAllRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var vals = sheet.getRange(2, 1, last - 1, COLS.length).getValues();
  var out = [];
  vals.forEach(function (r) {
    if (!r[0]) return;
    var o = {};
    COLS.forEach(function (c, i) {
      var v = r[i];
      if (v instanceof Date) {
        o[c[1]] = fmt_(v);
        if (c[1] === 'requestDate') o._month = fmt_(v, 'yyyy-MM');
      } else {
        o[c[1]] = (v === null || v === undefined) ? '' : unsafeCell_(String(v));
      }
    });
    out.push(o);
  });
  return out;
}

/** Remove admin e-mail addresses from comment history shown to requesters. */
function publicComments_(text) {
  return String(text || '').split('\n').map(function (line) {
    return line.replace(/^(\[[^\]]+\]) [^\s:]+@[^\s:]+: /, '$1 ');
  }).join('\n');
}

/* ============================ Public API: status tracking ============================ */

function trackRequest(query) {
  return run_(function () {
    var q = String(query || '').trim();
    if (!q) throw UserError('Enter a Request Number or an E-mail ID.');
    if (q.length > 254) throw UserError('Search text is too long.');
    var rows = readAllRows_(getRequestSheet_());
    var matches;
    if (q.indexOf('@') >= 0) {
      var em = q.toLowerCase();
      if (!EMAIL_RE.test(em)) throw UserError('Enter a valid e-mail address.');
      var me = activeEmail_();
      if (CONFIG.STRICT_EMAIL_SEARCH && me && me !== em && !isAdmin_(me)) {
        throw UserError('You can search by your own e-mail (' + me + ') only. To look up another e-mail, use the Request Number.');
      }
      matches = rows.filter(function (r) { return r.email.toLowerCase() === em; });
    } else {
      var num = q.toUpperCase();
      if (!/^[A-Z]+-[A-Z]+-\d{3,}$/.test(num)) throw UserError('Request Number looks like ' + CONFIG.REQUEST_PREFIX + '00001.');
      matches = rows.filter(function (r) { return r.requestNumber === num; });
    }
    matches.sort(function (a, b) { return a.requestNumber < b.requestNumber ? 1 : -1; });
    return matches.slice(0, 50).map(function (r) {
      return {
        requestNumber: r.requestNumber, requestDate: r.requestDate, itemDescription: r.itemDescription,
        brand: r.brand, status: r.status, comments: publicComments_(r.adminComments), lastUpdated: r.lastUpdated
      };
    });
  });
}

/* ============================ Public API: admin ============================ */

function adminGetDashboard() {
  return run_(function () {
    requireAdmin_();
    var rows = readAllRows_(getRequestSheet_());
    var count = function (st) { return rows.filter(function (r) { return r.status === st; }).length; };
    var kpis = {
      total: rows.length,
      pending: rows.filter(function (r) { return CONFIG.PENDING_STATUSES.indexOf(r.status) >= 0; }).length,
      approved: count('Approved'), rejected: count('Rejected'), createdInErp: count('Created in ERP')
    };
    var group = function (key) {
      var m = {};
      rows.forEach(function (r) { var k = r[key] || '(blank)'; m[k] = (m[k] || 0) + 1; });
      return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (k) { return { label: k, count: m[k] }; });
    };
    var months = {};
    rows.forEach(function (r) { if (r._month) months[r._month] = (months[r._month] || 0) + 1; });
    var monthly = Object.keys(months).sort().slice(-12).map(function (k) { return { label: k, count: months[k] }; });
    return {
      admin: activeEmail_(), statuses: CONFIG.STATUSES, kpis: kpis, monthly: monthly,
      byFactory: group('factory'), byCategory: group('itemCategory'),
      rows: rows.slice().reverse()
    };
  });
}

function adminUpdateRequest(p) {
  return run_(function () {
    var admin = requireAdmin_();
    p = p || {};
    var num = String(p.requestNumber || '').trim();
    var status = String(p.status || '').trim();
    var comment = String(p.comment || '').trim();
    if (CONFIG.STATUSES.indexOf(status) < 0) throw UserError('Choose a valid status.');
    if (comment.length > 1000) throw UserError('Comment is limited to 1000 characters.');
    var sheet = getRequestSheet_();
    var now = new Date(), stamp = fmt_(now), updated, oldStatus, requesterEmail, lines = [];

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var r = findRow_(sheet, num);
      if (r < 0) throw UserError('Request ' + num + ' was not found.');
      var cur = sheet.getRange(r, 1, 1, COLS.length).getValues()[0];
      oldStatus = String(cur[colIndex_('status') - 1]);
      requesterEmail = unsafeCell_(String(cur[colIndex_('email') - 1]));
      var history = String(cur[colIndex_('adminComments') - 1] || '');
      if (status !== oldStatus) lines.push('[' + stamp + '] ' + admin + ': Status changed from ' + oldStatus + ' to ' + status + '.');
      if (comment) lines.push('[' + stamp + '] ' + admin + ': ' + comment.replace(/\r?\n/g, ' '));
      if (!lines.length) throw UserError('Nothing to update: change the status or add a comment.');
      sheet.getRange(r, colIndex_('status')).setValue(status);
      sheet.getRange(r, colIndex_('adminComments')).setValue(safeCell_((history ? history + '\n' : '') + lines.join('\n')));
      sheet.getRange(r, colIndex_('lastUpdated')).setValue(now);
      sheet.getRange(r, colIndex_('updatedBy')).setValue(safeCell_(admin));
      SpreadsheetApp.flush();
      updated = true;
    } finally {
      lock.releaseLock();
    }

    var mail = { sent: false, error: '' };
    var notify = p.notify !== false && CONFIG.NOTIFY_REQUESTER_ON_STATUS_CHANGE;
    if (notify && updated) {
      try {
        var body = '<div style="font-family:Arial,sans-serif;font-size:14px"><p>Your request <b>' + esc_(num) + '</b> has been updated.</p>' +
          '<p>Status: <b>' + esc_(status) + '</b></p>' +
          (comment ? '<p>Comment: ' + esc_(comment) + '</p>' : '') +
          '<p style="color:#6b7785;font-size:12px">' + esc_(CONFIG.APP_TITLE) + '</p></div>';
        MailApp.sendEmail({
          to: requesterEmail, subject: 'Update on Item Creation Request - ' + num, name: CONFIG.APP_TITLE,
          htmlBody: body, body: 'Your request ' + num + ' is now: ' + status + (comment ? '\nComment: ' + comment : '')
        });
        mail.sent = true;
      } catch (e) {
        mail.error = 'Saved, but the requester could not be e-mailed: ' + e.message;
      }
    }
    return { requestNumber: num, status: status, mail: mail };
  });
}

function adminExportXlsx(requestNumbers) {
  return run_(function () {
    requireAdmin_();
    var rows = readAllRows_(getRequestSheet_());
    if (Array.isArray(requestNumbers) && requestNumbers.length) {
      var want = {};
      requestNumbers.forEach(function (n) { want[String(n)] = true; });
      rows = rows.filter(function (r) { return want[r.requestNumber]; });
    }
    var header = COLS.map(function (c) { return c[0]; });
    var data = [header].concat(rows.map(function (r) { return COLS.map(function (c) { return safeCell_(String(r[c[1]])); }); }));
    var tmp = SpreadsheetApp.create('tmp-export-' + new Date().getTime());
    var id = tmp.getId();
    try {
      var sh = tmp.getSheets()[0];
      sh.setName('Item Master Requests');
      var range = sh.getRange(1, 1, data.length, header.length);
      range.setNumberFormat('@');                 // keep everything as text (no formula/number coercion)
      range.setValues(data);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
      sh.setFrozenRows(1);
      SpreadsheetApp.flush();
      var resp = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) throw new Error('Excel export failed (HTTP ' + resp.getResponseCode() + ').');
      var bytes = resp.getBlob().getBytes();
      return {
        filename: 'Item-Master-Requests-' + fmt_(new Date(), 'yyyyMMdd-HHmm') + '.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: Utilities.base64Encode(bytes), rows: rows.length
      };
    } finally {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.warn('Temp export not trashed: ' + e.message); }
    }
  });
}

function adminListAdmins() {
  return run_(function () {
    requireAdmin_();
    return { seed: CONFIG.SEED_ADMIN.toLowerCase(), me: activeEmail_(), admins: listAdmins_() };
  });
}

function adminAddAdmin(email) {
  return run_(function () {
    var me = requireAdmin_();
    var e = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw UserError('Enter a valid e-mail address.');
    var sh = getAdminSheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (listAdmins_().some(function (a) { return a.email === e; })) throw UserError(e + ' is already an admin.');
      sh.appendRow([safeCell_(e), safeCell_(me), fmt_(new Date())]);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return { seed: CONFIG.SEED_ADMIN.toLowerCase(), me: me, admins: listAdmins_() };
  });
}

function adminRemoveAdmin(email) {
  return run_(function () {
    var me = requireAdmin_();
    var e = String(email || '').trim().toLowerCase();
    if (e === CONFIG.SEED_ADMIN.toLowerCase()) throw UserError('The seed admin cannot be removed (change SEED_ADMIN in CONFIG instead).');
    if (e === me) throw UserError('You cannot remove yourself.');
    var sh = getAdminSheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var last = sh.getLastRow(), removed = false;
      for (var r = last; r >= 2; r--) {
        if (unsafeCell_(String(sh.getRange(r, 1).getValue())).trim().toLowerCase() === e) { sh.deleteRow(r); removed = true; }
      }
      if (!removed) throw UserError(e + ' is not in the admin list.');
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return { seed: CONFIG.SEED_ADMIN.toLowerCase(), me: me, admins: listAdmins_() };
  });
}
