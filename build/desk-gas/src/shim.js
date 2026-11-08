/* Apps Script runtime shim: gives the Desk the same window.claude surface it uses on claude.ai (use('user'|'downloads'|'db')),
 * implemented on google.script.run. Reads poll the revision map (30 s visible, 90 s hidden) and refresh at once after this tab's own writes. */
(function () {
  var BOOT = window.__GAS_BOOT || null;
  window.__GAS = true;
  var POLL_MS = 30000, POLL_HIDDEN_MS = 90000, CONC = 4, WRITE_WINDOW = 25;
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* ---- call queue: at most CONC server calls at once ---- */
  var running = 0, waitQ = [];
  function slot() { return new Promise(function (res) { if (running < CONC) { running++; res(); } else waitQ.push(res); }); }
  function release() { running--; var n = waitQ.shift(); if (n) { running++; n(); } }
  function rawCall(fn, args) {
    return new Promise(function (resolve, reject) {
      var gsr = window.google && window.google.script && window.google.script.run;
      if (!gsr) { reject({ code: 'unavailable', message: 'Apps Script runtime is not available' }); return; }
      /* each withX returns a NEW runner that carries the handlers; the method must be called on that runner */
      var runner = gsr.withSuccessHandler(resolve).withFailureHandler(function (e) { reject({ code: 'unavailable', message: (e && e.message) || String(e) }); });
      runner[fn].apply(runner, args);
    });
  }
  window.__gasInflight = 0; /* server calls waiting or running; the activity indicator shows it */
  async function call(fn, args) {
    window.__gasInflight++;
    try { return await call1(fn, args); } finally { window.__gasInflight--; }
  }
  async function call1(fn, args) {
    await slot();
    try {
      for (var i = 0; ; i++) {
        var r;
        try { r = await rawCall(fn, args); } catch (e) { if (i < 3) { await sleep(600 * (i + 1)); continue; } throw e; }
        if (r && r.ok === false) {
          if (r.code === 'unavailable' && i < 5) { await sleep(300 * (i + 1) + Math.random() * 200); continue; }
          var err = { code: r.code, message: r.message }; throw err;
        }
        return r;
      }
    } finally { release(); }
  }
  window.__gasCall = call;
  /* ---- collection cache ---- */
  var cols = {}; /* name -> {rev, docs: Map id -> obj, loaded, subs:[], loading} */
  function C(name) { return cols[name] || (cols[name] = { name: name, rev: -1, docs: new Map(), loaded: false, subs: [], loading: null, stale: true }); }
  function makeSnap(c, q) {
    var arr = []; c.docs.forEach(function (o, id) { arr.push({ id: id, exists: true, data: (function (x) { return function () { return x; }; })(o), metadata: {} }); });
    arr.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    if (q && q.order) { var f = q.order[0], d = q.order[1] === 'desc' ? -1 : 1; arr.sort(function (a, b) { var x = a.data()[f], y = b.data()[f]; return (x < y ? -1 : x > y ? 1 : 0) * d; }); }
    if (q && q.lim) arr = arr.slice(0, q.lim);
    return { docs: arr, size: arr.length, empty: !arr.length, docChanges: function () { return []; }, metadata: {} };
  }
  function emit(c) { c.subs.slice().forEach(function (s) { try { s.next(makeSnap(c, s.q)); } catch (e) { setTimeout(function () { throw e; }); } }); }
  /* a collection is read as: deskPlan (revision + pages of whole documents), then one deskPage per page (one getValues each); a changed revision restarts it */
  async function fetchAll(c) {
    var last = null;
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        var plan = await call('deskPlan', [c.name]);
        var pages = await Promise.all(plan.pages.map(function (p) { return call('deskPage', [c.name, p[0], p[1], plan.rev]); }));
        var best = new Map(), skipped = 0;
        pages.forEach(function (pg) { skipped += pg.skipped || 0; pg.docs.forEach(function (d) { var o = best.get(d.id); if (!o || d.token > o.token) best.set(d.id, d); }); });
        var docs = new Map();
        best.forEach(function (d, id) { try { docs.set(id, JSON.parse(d.json)); } catch (e) { skipped++; } });
        if (skipped) { try { console.warn('Desk: ' + skipped + ' damaged document(s) skipped in ' + c.name); } catch (e) {} }
        return { docs: docs, rev: plan.rev, skipped: skipped };
      } catch (e) { last = e; if (e && (e.code === 'stale' || e.code === 'unavailable')) { await sleep(300 * (attempt + 1)); continue; } throw e; }
    }
    throw last || { code: 'unavailable', message: 'could not read ' + c.name };
  }
  function refresh(c) {
    if (c.loading) { c.again = true; return c.loading; }
    c.loading = (async function () {
      try {
        do { c.again = false; var r = await fetchAll(c); c.docs = r.docs; c.rev = r.rev; c.loaded = true; c.stale = false; emit(c); } while (c.again);
      } catch (e) { c.subs.slice().forEach(function (s) { if (s.err && !c.loaded) s.err(e); }); }
      finally { c.loading = null; }
    })();
    return c.loading;
  }
  var polling = false;
  async function poll() {
    if (polling || window.__gasPause) return; polling = true;
    try {
      var r = await call('deskRevs', []);
      Object.keys(cols).forEach(function (n) { var c = cols[n]; if (!c.subs.length) return; var rv = r.revs[n] || 0; if (c.rev !== rv || c.stale) refresh(c); });
    } catch (e) { /* try again next tick */ } finally { polling = false; }
  }
  window.__gasPoll = function () { return poll(); };
  var timer = null;
  function arm() { clearTimeout(timer); timer = setTimeout(function () { poll().then(arm, arm); }, document.hidden ? POLL_HIDDEN_MS : POLL_MS); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { poll(); arm(); } });
  /* ---- writes: coalesced into one deskWrite per window ---- */
  var wq = [], wtimer = null;
  function flushW() {
    var batch = wq; wq = []; wtimer = null; if (!batch.length) return;
    /* split so no call carries more than ~1.2 MB */
    var groups = [], cur = [], sz = 0;
    batch.forEach(function (w) { var l = (w.op.json || '').length + 100; if (cur.length && sz + l > 1200000) { groups.push(cur); cur = []; sz = 0; } cur.push(w); sz += l; });
    if (cur.length) groups.push(cur);
    groups.forEach(function (g) {
      call('deskWrite', [g.map(function (w) { return w.op; })]).then(function (r) {
        /* per-operation results: only a refused operation rejects its own promise; the others are applied and resolve */
        var bump = {}, okW = [];
        g.forEach(function (w, i) {
          var res = r.results && r.results[i];
          if (res && res.ok === false) { w.rej({ code: res.code, message: res.message }); return; }
          okW.push(w);
          var c = cols[w.op.col]; if (c && c.loaded) { if (w.op.op === 'set') c.docs.set(w.op.id, JSON.parse(w.op.json)); else if (w.op.op === 'delete') c.docs.delete(w.op.id); else c.stale = true; } bump[w.op.col] = 1;
        });
        Object.keys(bump).forEach(function (n) { var c = cols[n]; if (!c) return; var rv = r.revs[n]; if (c.loaded && !c.stale && rv === c.rev + 2) c.rev = rv; else c.stale = true; if (c.subs.length) { if (c.loaded) emit(c); if (c.stale) refresh(c); } });
        okW.forEach(function (w) { w.res(); });
      }, function (e) { g.forEach(function (w) { w.rej(e); }); });
    });
  }
  function write(op) { return new Promise(function (res, rej) { wq.push({ op: op, res: res, rej: rej }); if (!wtimer) wtimer = setTimeout(flushW, WRITE_WINDOW); }); }
  /* ---- reads of single docs: coalesced ---- */
  var gq = [], gtimer = null;
  function flushG() {
    var batch = gq; gq = []; gtimer = null; if (!batch.length) return;
    var keys = Array.from(new Set(batch.map(function (b) { return b.key; })));
    call('deskGetMany', [keys]).then(function (r) {
      var m = {}; r.docs.forEach(function (d) { m[d.key] = d.json; });
      batch.forEach(function (b) { b.res(m[b.key]); });
    }, function (e) { batch.forEach(function (b) { b.rej(e); }); });
  }
  function getDoc(key) { return new Promise(function (res, rej) { gq.push({ key: key, res: res, rej: rej }); if (!gtimer) gtimer = setTimeout(flushG, 15); }); }
  /* ---- db object ---- */
  function query(name, q) {
    q = q || {};
    return {
      orderBy: function (f, d) { return query(name, Object.assign({}, q, { order: [f, d || 'asc'] })); },
      limit: function (n) { return query(name, Object.assign({}, q, { lim: n })); },
      where: function () { return query(name, q); },
      onSnapshot: function (next, err) {
        var c = C(name), s = { q: q, next: next, err: err };
        c.subs.push(s);
        if (c.loaded) setTimeout(function () { if (c.subs.indexOf(s) >= 0) next(makeSnap(c, q)); }, 0); else refresh(c);
        arm();
        return function () { c.subs = c.subs.filter(function (x) { return x !== s; }); };
      },
      /* the cache is used only for a collection that is live-subscribed (kept fresh by polling) AND whose server revision is unchanged; otherwise fetch */
      get: async function () {
        var c = C(name);
        if (c.loaded && c.subs.length && !c.stale) {
          try { var rv = await call('deskRevs', []); if ((rv.revs[name] || 0) === c.rev) return makeSnap(c, q); } catch (e) { /* fall through to a fetch */ }
        }
        await refresh(c);
        if (!c.loaded) throw { code: 'unavailable', message: 'could not read ' + name };
        return makeSnap(c, q);
      }
    };
  }
  function docRef(path) {
    var i = path.indexOf('/'), col = path.slice(0, i), id = path.slice(i + 1);
    return {
      get: async function () { var j = await getDoc(path); var o = j == null ? undefined : JSON.parse(j); return { id: id, exists: j != null, data: function () { return o; } }; },
      set: function (d) { var j = JSON.stringify(d); if (j.length > 262144) return Promise.reject({ code: 'invalid_argument', message: 'Document too large' }); return write({ op: 'set', col: col, id: id, json: j }); },
      update: function (d) { return write({ op: 'merge', col: col, id: id, json: JSON.stringify(d) }); }, /* merged on the server under the write lock */
      delete: function () { return write({ op: 'delete', col: col, id: id }); },
      /* single-writer lease (admin job queue): {acquired, holder, expiresAt}; granted when free, expired or already ours, refused while another holder has it (server: deskLease) */
      acquire: async function (o) { o = o || {}; var r = await call('deskLease', [col, id, o.holder, o.ttlMs]); return { acquired: !!r.acquired, version: r.version, holder: r.holder, expiresAt: r.expiresAt }; }
    };
  }
  var db = {
    collection: function (name) { var q = query(name); q.add = function (d) { var id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); return docRef(name + '/' + id).set(d).then(function () { return { id: id }; }); }; q.doc = function (id) { return docRef(name + '/' + id); }; return q; },
    doc: function (path) { return docRef(path); }
  };
  /* ---- user + downloads ---- */
  var bootP = null;
  function boot() { return bootP || (bootP = BOOT && BOOT.email !== undefined ? Promise.resolve(BOOT) : call('deskBoot', [])); }
  var user = {
    me: async function () { var b = await boot(); return { id: b.email, name: b.name || b.email, email: b.email }; },
    email: async function () { return (await boot()).email; },
    id: async function () { return (await boot()).email; },
    isOwner: async function () { return !!(await boot()).owner; }
  };
  var downloads = {
    save: function (o) { return new Promise(function (res, rej) { try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([o.data], { type: 'text/plain' })); a.download = o.filename; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); res(); } catch (e) { rej(e); } }); }
  };
  window.claude = { use: async function (n) { return n === 'db' ? db : n === 'user' ? user : n === 'downloads' ? downloads : null; } };
  if (BOOT && BOOT.h && !location.hash) { try { location.hash = '#' + BOOT.h; } catch (e) {} }
})();
