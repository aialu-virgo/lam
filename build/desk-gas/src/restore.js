/* Admin > Tools > "Restore from backup" (Apps Script build only). Reads the files of a "Download full backup" in this browser, checks the manifest and checksums,
 * then writes the documents to the Sheet store through google.script.run in batches. Nothing leaves the browser except those writes to this Apps Script project. */
(function () {
  var R = { stage: 'idle', msg: '', pct: 0, replace: false, files: [], rows: null, report: null, err: '', docs: null, man: null };
  var BATCH_CHARS = 900000, BATCH_DOCS = 60;
  var X = (window.__deskExt = window.__deskExt || {});
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function refresh() { if (X.refresh) X.refresh(); }
  function sup() { return !!(X.isSuper && X.isSuper()); }
  function crcStr(s) { return X.crc(s); }
  function fmtN(n) { return Number(n).toLocaleString('en-IN'); }
  X.toolsHtml = function () {
    if (!sup()) return '';
    var h = '<section class="card"><div class="hd"><h2>Restore from backup</h2></div>'
      + '<p class="note">Loads a "Download full backup" (the manifest file and every part file) into this database. The files are read and checked in this browser. It refuses when the database already holds data, unless you tick "Replace everything".</p>'
      + '<div class="row"><input type="file" id="gr-files" multiple accept=".json,application/json"></div>';
    if (R.err) h += '<div class="banner warn"><span>' + esc(R.err) + '</span></div>';
    if (R.rows) {
      h += '<div class="tw"><table><thead><tr><th>Collection</th><th class="num">Documents</th><th>Checksum</th></tr></thead><tbody>';
      R.rows.forEach(function (r) { h += '<tr><td>' + esc(r.c) + '</td><td class="num">' + fmtN(r.docs) + '</td><td>' + (r.ok ? 'matches the manifest' : '<b>does not match</b>') + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    if (R.stage === 'verified' || R.stage === 'error' || R.stage === 'done')
      h += '<div class="row"><label><input type="checkbox" id="gr-replace"' + (R.replace ? ' checked' : '') + '> Replace everything (first deletes all data now in this database)</label></div>'
        + '<div class="row"><button class="btn pri" data-gr="run"' + (R.stage === 'verified' ? '' : ' disabled') + '>Restore now</button></div>';
    if (R.stage === 'working') h += '<div class="row"><progress max="100" value="' + R.pct + '" style="width:260px"></progress> <span class="note">' + esc(R.msg) + '</span></div>';
    if (R.report) {
      h += '<h3 style="margin:10px 0 4px;font-size:13px">Result against the manifest</h3><div class="tw"><table><thead><tr><th>Collection</th><th class="num">Manifest</th><th class="num">Restored</th><th>Checksum</th></tr></thead><tbody>';
      R.report.forEach(function (r) { h += '<tr><td>' + esc(r.c) + '</td><td class="num">' + fmtN(r.want) + '</td><td class="num">' + fmtN(r.got) + '</td><td>' + (r.ok ? 'ok' : '<b>mismatch</b>') + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    return h + '</section>';
  };
  async function readFiles(list) {
    R.err = ''; R.rows = null; R.report = null; R.docs = null; R.man = null; R.stage = 'working'; R.msg = 'Reading files'; R.pct = 0; refresh();
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
      var known = X.cols || [];
      Object.keys(man.collections).forEach(function (c) { if (known.indexOf(c) < 0) throw new Error('The manifest names a collection this page does not know: ' + c); });
      man.files.forEach(function (mf) {
        var t = texts[mf.name]; if (!t) throw new Error('Missing file ' + mf.name + '.');
        if (t.size !== mf.bytes) throw new Error(mf.name + ' has the wrong size (' + t.size + ', manifest says ' + mf.bytes + ').');
        if (crcStr(t.text) !== mf.crc32) throw new Error(mf.name + ' fails its checksum.');
      });
      var docs = {}; Object.keys(man.collections).forEach(function (c) { docs[c] = []; });
      man.files.forEach(function (mf) { texts[mf.name].j.docs.forEach(function (d) { if (!docs[d[0]]) throw new Error('A file holds a collection the manifest does not list: ' + d[0]); docs[d[0]].push({ id: d[1], json: JSON.stringify(d[2]) }); }); });
      var rows = [], allOk = true;
      Object.keys(man.collections).forEach(function (c) {
        var want = man.collections[c], list2 = docs[c].sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }), crc = 0xFFFFFFFF;
        list2.forEach(function (d) { crc = X.crcAdd(crc, d.id + '\n' + d.json + '\n'); });
        var ok = list2.length === want.docs && X.hex(crc) === want.crc32; if (!ok) allOk = false;
        rows.push({ c: c, docs: list2.length, ok: ok });
      });
      R.rows = rows; R.docs = docs; R.man = man;
      if (!allOk) throw new Error('At least one collection does not match the manifest. Nothing was written.');
      R.stage = 'verified';
    } catch (e) { R.stage = 'error'; R.err = e.message || String(e); }
    refresh();
  }
  async function run() {
    if (!sup()) return;
    if (R.stage !== 'verified') return;
    var call = window.__gasCall;
    R.err = ''; R.report = null; R.stage = 'working'; R.msg = 'Checking the database'; R.pct = 1; window.__gasPause = true; refresh();
    try {
      var st = await call('deskStats', []);
      if (!st.empty && !st.seedOnly && !R.replace) throw new Error('The database already holds data. Nothing was written. Tick "Replace everything" to overwrite it.');
      var cols = Object.keys(R.man.collections);
      if (!st.empty) { R.msg = 'Clearing the database'; refresh(); await call('deskWipe', [(X.cols || cols)]); }
      var order = ['users', 'plants'].concat(cols.filter(function (c) { return c !== 'users' && c !== 'plants'; })), total = 0, done = 0;
      order.forEach(function (c) { if (R.docs[c]) total += R.docs[c].length; });
      for (var ci = 0; ci < order.length; ci++) {
        var c = order[ci], list = R.docs[c] || [], batch = [], chars = 0;
        for (var i = 0; i <= list.length; i++) {
          var d = list[i];
          if (d === undefined || (batch.length && (batch.length >= BATCH_DOCS || chars + d.json.length > BATCH_CHARS))) {
            if (batch.length) { await call('deskWrite', [batch]); done += batch.length; R.pct = Math.min(95, 2 + Math.round(done / Math.max(1, total) * 90)); R.msg = 'Writing ' + c + ' (' + fmtN(done) + ' of ' + fmtN(total) + ')'; refresh(); batch = []; chars = 0; }
          }
          if (d !== undefined) { batch.push({ op: 'set', col: c, id: d.id, json: d.json }); chars += d.json.length; }
        }
      }
      var counts = (await call('deskStats', [])).counts, rep = [];
      for (var k = 0; k < cols.length; k++) {
        R.msg = 'Verifying ' + cols[k]; R.pct = 95 + Math.round(k / cols.length * 5); refresh();
        var want = R.man.collections[cols[k]], dg = await call('deskDigest', [cols[k]]);
        rep.push({ c: cols[k], want: want.docs, got: dg.docs, ok: dg.docs === want.docs && dg.crc32 === want.crc32 && (counts[cols[k]] || 0) === want.docs });
      }
      R.report = rep; R.stage = 'done'; R.pct = 100;
      if (X.toast) X.toast(rep.every(function (r) { return r.ok; }) ? 'Restore complete and verified' : 'Restore finished with mismatches: see the table');
    } catch (e) { R.stage = 'error'; R.err = (e && e.message) || String(e); R.stage = R.man ? 'verified' : 'error'; }
    window.__gasPause = false; if (window.__gasPoll) window.__gasPoll(); refresh();
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
