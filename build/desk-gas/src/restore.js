/* Admin > Tools > "Restore from backup" (Apps Script build only). Reads the files of a "Download full backup" in this browser, checks EVERYTHING (files, ids, sizes, counts, checksums)
 * before any write, then clears the database and writes the documents through google.script.run in batches. Nothing leaves the browser except those writes to this Apps Script project. */
(function () {
  var R = { stage: 'idle', msg: '', pct: 0, replace: false, rows: null, report: null, err: '', docs: null, man: null, started: false, written: {} };
  var BATCH_CHARS = 900000, BATCH_DOCS = 60, MAX_DOC = 262144;
  var X = (window.__deskExt = window.__deskExt || {});
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function refresh() { if (X.refresh) X.refresh(); }
  function sup() { return !!(X.isSuper && X.isSuper()); }
  function fmtN(n) { return Number(n).toLocaleString('en-IN'); }
  function guard(ev) { ev.preventDefault(); ev.returnValue = ''; return ''; }
  X.toolsHtml = function () {
    if (!sup()) return '';
    var h = '<section class="card"><div class="hd"><h2>Restore from backup</h2></div>'
      + '<p class="note">Loads a "Download full backup" (the manifest file and every part file) into this database. Everything is checked in this browser before anything is written. It refuses when the database already holds data, unless you tick "Replace everything".</p>'
      + '<div class="row"><input type="file" id="gr-files" multiple accept=".json,application/json"></div>';
    if (R.stage === 'incomplete') h += '<div class="banner warn"><span><b>Restore incomplete.</b> The database holds only part of the backup. Tick "Replace everything" and run Restore again; a re-run clears the database first, so it is safe.</span></div>';
    if (R.err && R.stage !== 'incomplete') h += '<div class="banner warn"><span>' + esc(R.err) + '</span></div>';
    if (R.err && R.stage === 'incomplete') h += '<p class="note">Cause: ' + esc(R.err) + '</p>';
    if (R.rows && R.stage !== 'done' && R.stage !== 'incomplete') {
      h += '<div class="tw"><table><thead><tr><th>Collection</th><th class="num">Documents</th><th>Check</th></tr></thead><tbody>';
      R.rows.forEach(function (r) { h += '<tr><td>' + esc(r.c) + '</td><td class="num">' + fmtN(r.docs) + '</td><td>' + (r.ok ? 'matches the manifest' : '<b>does not match</b>') + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    if (R.stage === 'verified' || R.stage === 'incomplete' || R.stage === 'done')
      h += '<div class="row"><label><input type="checkbox" id="gr-replace"' + (R.replace ? ' checked' : '') + '> Replace everything (first deletes all data now in this database)</label></div>'
        + '<div class="row"><button class="btn pri" data-gr="run"' + (R.stage === 'done' ? ' disabled' : '') + '>' + (R.stage === 'incomplete' ? 'Run Restore again' : 'Restore now') + '</button></div>';
    if (R.stage === 'working') h += '<div class="banner warn"><span><b>Keep this tab open</b> until the restore finishes.</span></div><div class="row"><progress max="100" value="' + R.pct + '" style="width:260px"></progress> <span class="note">' + esc(R.msg) + '</span></div>';
    if (R.report) {
      h += '<h3 style="margin:10px 0 4px;font-size:13px">' + (R.stage === 'incomplete' ? 'Written so far, against the manifest' : 'Result against the manifest') + '</h3><div class="tw"><table><thead><tr><th>Collection</th><th class="num">Manifest</th><th class="num">' + (R.stage === 'incomplete' ? 'Written' : 'Restored') + '</th><th>Checksum</th></tr></thead><tbody>';
      R.report.forEach(function (r) { h += '<tr><td>' + esc(r.c) + '</td><td class="num">' + fmtN(r.want) + '</td><td class="num">' + fmtN(r.got) + '</td><td>' + (r.ok ? 'ok' : r.pending ? 'not checked' : '<b>mismatch</b>') + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    return h + '</section>';
  };
  function badId(id) { return typeof id !== 'string' || !id || id.length > 300 || id.indexOf('/') >= 0; }
  async function readFiles(list) {
    R.err = ''; R.rows = null; R.report = null; R.docs = null; R.man = null; R.started = false; R.written = {}; R.stage = 'working'; R.msg = 'Reading files'; R.pct = 0; refresh();
    try {
      var texts = {}, man = null;
      for (var i = 0; i < list.length; i++) {
        var f = list[i], t = await f.text(), j;
        try { j = JSON.parse(t); } catch (e) { throw new Error(f.name + ' is not a JSON file.'); }
        if (j && j.kind === 'virgo-desk-backup-manifest') { if (man) throw new Error('More than one manifest file was selected.'); man = j; }
        else if (j && j.kind === 'virgo-desk-backup-part') texts[f.name] = { text: t, j: j, size: f.size };
        else throw new Error(f.name + ' is not a Desk backup file.');
        R.pct = Math.round((i + 1) / list.length * 60); refresh();
      }
      if (!man) throw new Error('The manifest file is missing. Select it together with the part files.');
      if (man.changedDuringExport && man.changedDuringExport.length) throw new Error('This backup was made while data was changing (' + man.changedDuringExport.map(function (c) { return c.collection; }).join(', ') + '). Make a new backup and restore that one.');
      var known = X.cols || [];
      Object.keys(man.collections).forEach(function (c) { if (known.indexOf(c) < 0) throw new Error('The manifest names a collection this page does not know: ' + c); });
      man.files.forEach(function (mf) {
        var t = texts[mf.name]; if (!t) throw new Error('Missing file ' + mf.name + '.');
        if (t.size !== mf.bytes) throw new Error(mf.name + ' has the wrong size (' + t.size + ', manifest says ' + mf.bytes + ').');
        if (X.crc(t.text) !== mf.crc32) throw new Error(mf.name + ' fails its checksum.');
      });
      var docs = {}; Object.keys(man.collections).forEach(function (c) { docs[c] = []; });
      man.files.forEach(function (mf) { texts[mf.name].j.docs.forEach(function (d) {
        if (!docs[d[0]]) throw new Error('A file holds a collection the manifest does not list: ' + d[0]);
        if (badId(d[1])) throw new Error('Invalid document id in ' + d[0] + ': ' + JSON.stringify(String(d[1]).slice(0, 40)));
        var js = JSON.stringify(d[2]);
        if (!d[2] || typeof d[2] !== 'object' || Array.isArray(d[2])) throw new Error(d[0] + '/' + d[1] + ' is not a document.');
        if (js.length > MAX_DOC) throw new Error(d[0] + '/' + d[1] + ' is larger than the ' + MAX_DOC + '-character limit.');
        docs[d[0]].push({ id: d[1], json: js });
      }); });
      var rows = [], allOk = true;
      Object.keys(man.collections).forEach(function (c) {
        var want = man.collections[c], seen = {}, sum = 0, chars = 0, dup = null;
        docs[c].forEach(function (d) { if (seen[d.id]) dup = d.id; seen[d.id] = 1; sum = (sum + X.docCrc(d.id, d.json)) % 4294967296; chars += d.json.length; });
        if (dup) throw new Error('Duplicate document id in ' + c + ': ' + dup);
        var ok = docs[c].length === want.docs && chars === want.chars && X.sumHex(sum) === want.sumcrc32; if (!ok) allOk = false;
        rows.push({ c: c, docs: docs[c].length, ok: ok });
      });
      R.rows = rows; R.docs = docs; R.man = man;
      if (!allOk) throw new Error('At least one collection does not match the manifest. Nothing was written.');
      R.stage = 'verified';
    } catch (e) { R.stage = 'error'; R.err = e.message || String(e); }
    refresh();
  }
  async function digestOf(call, col) {
    var plan = await call('deskPlan', [col]), docs = 0, chars = 0, sum = 0, skipped = 0;
    for (var i = 0; i < plan.pages.length; i++) { var d = await call('deskDigestPage', [col, plan.pages[i][0], plan.pages[i][1], plan.rev]); docs += d.docs; chars += d.chars; sum = (sum + d.sum) % 4294967296; skipped += d.skipped; }
    return { docs: docs, chars: chars, sum: sum, skipped: skipped };
  }
  async function run() {
    if (!sup()) return;
    if (R.stage !== 'verified' && R.stage !== 'incomplete') return;
    var call = window.__gasCall, cols = Object.keys(R.man.collections), wiping = false;
    R.err = ''; R.report = null; R.stage = 'working'; R.msg = 'Checking the database'; R.pct = 1; R.written = {}; window.__gasPause = true; window.addEventListener('beforeunload', guard); refresh();
    try {
      var st = await call('deskStats', []);
      if (!st.empty && !st.seedOnly && !R.replace) { R.stage = R.started ? 'incomplete' : 'verified'; throw new Error('The database already holds data. Nothing was written. Tick "Replace everything" to overwrite it.'); }
      if (!st.empty) { R.msg = 'Clearing the database'; refresh(); wiping = true; R.started = true; await call('deskWipe', [(X.cols || cols)]); }
      var order = ['users', 'plants'].concat(cols.filter(function (c) { return c !== 'users' && c !== 'plants'; })), total = 0, done = 0;
      order.forEach(function (c) { if (R.docs[c]) total += R.docs[c].length; });
      for (var ci = 0; ci < order.length; ci++) {
        var c = order[ci], list = R.docs[c] || [], batch = [], chars = 0; R.written[c] = 0; R.started = true;
        for (var i = 0; i <= list.length; i++) {
          var d = list[i];
          if (d === undefined || (batch.length && (batch.length >= BATCH_DOCS || chars + d.json.length > BATCH_CHARS))) {
            if (batch.length) { await call('deskWrite', [batch]); done += batch.length; R.written[c] += batch.length; R.pct = Math.min(95, 2 + Math.round(done / Math.max(1, total) * 90)); R.msg = 'Writing ' + c + ' (' + fmtN(done) + ' of ' + fmtN(total) + ')'; refresh(); batch = []; chars = 0; }
          }
          if (d !== undefined) { batch.push({ op: 'set', col: c, id: d.id, json: d.json }); chars += d.json.length; }
        }
      }
      var counts = (await call('deskStats', [])).counts, rep = [];
      for (var k = 0; k < cols.length; k++) {
        R.msg = 'Verifying ' + cols[k]; R.pct = 95 + Math.round(k / cols.length * 5); refresh();
        var want = R.man.collections[cols[k]], dg = await digestOf(call, cols[k]);
        rep.push({ c: cols[k], want: want.docs, got: dg.docs, ok: dg.docs === want.docs && dg.chars === want.chars && X.sumHex(dg.sum) === want.sumcrc32 && !dg.skipped && (counts[cols[k]] || 0) === want.docs });
      }
      R.report = rep; R.stage = 'done'; R.pct = 100;
      if (X.toast) X.toast(rep.every(function (r) { return r.ok; }) ? 'Restore complete and verified' : 'Restore finished with mismatches: see the table');
    } catch (e) {
      if (R.stage !== 'verified' && R.stage !== 'incomplete') R.stage = R.started ? 'incomplete' : 'verified';
      R.err = (e && e.message) || String(e);
      if (R.stage === 'incomplete') { R.replace = true; R.report = cols.map(function (c) { return { c: c, want: R.man.collections[c].docs, got: R.written[c] || 0, ok: false, pending: true }; }); }
    }
    window.removeEventListener('beforeunload', guard); window.__gasPause = false; if (window.__gasPoll) window.__gasPoll(); refresh();
  }
  document.addEventListener('change', function (ev) {
    var t = ev.target; if (!t) return;
    if (t.id === 'gr-files') { if (!sup()) return; var picked = Array.from(t.files || []); try { t.value = ''; } catch (e) {} if (picked.length) readFiles(picked); }
    else if (t.id === 'gr-replace') { R.replace = !!t.checked; }
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest && ev.target.closest('[data-gr="run"]'); if (t) run();
  });
  window.__gasRestoreState = function () { return R; };
})();
