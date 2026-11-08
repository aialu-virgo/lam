// Mock S/4HANA OData v2 server for the SAP feed tests. SYNTHETIC DATA ONLY (no Virgo data): invented plants, customers, products and documents from a seeded generator.
// Serves $metadata and the entity sets the feed reads (A_BillingDocument with to_Item, A_Product, A_Customer) with HTTP Basic auth, $filter (eq ge gt le lt, and / or), $select, $expand, $orderby,
// $top, $skip, $inlinecount, a server page cap with __next, key reads, and injectable failures. It records every request so tests can check GET-only and that no password sits in a URL.
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pad = (n, w) => String(n).padStart(w, '0');
const msOf = (iso) => Date.parse(iso + 'T00:00:00Z');
const odDate = (iso) => '/Date(' + msOf(iso) + ')/';
export const PRODUCT_TYPES = ['ZABLAM', 'ZCRLAM', 'ZCBPVC', 'ZOTHER'];
export function synthMasters(seed = 7) {
  const r = rng(seed), products = {}, customers = {};
  for (let i = 0; i < 60; i++) { const code = String(32000100 + i), t = PRODUCT_TYPES[i % 4 === 3 ? 3 : (i % 7 === 0 ? 2 : i % 2)]; products[code] = { type: t, mg3: ['LAM', 'DOOR', 'COMPACT', 'MICA'][i % 4], mg4: i % 5 === 0 ? '7X3' : '8X4' }; }
  for (let i = 0; i < 25; i++) customers[String(50001000 + i)] = 'Synthetic Customer ' + (i + 1) + ' Traders';
  return { products, customers };
}
/* docs for each day in [from, to] at the given plants; ids are 10-digit padded as OData returns them; items numbered 000010, 000020 ... */
export function synthDocs({ seed = 1, from = '2026-10-01', to = '2026-10-10', plants = ['1001', '1013', '1021'], perDayPerPlant = 2, extras = true, masters = synthMasters(), startNo = 90000001, company = '1000' } = {}) {
  const r = rng(seed), docs = [], prods = Object.keys(masters.products), custs = Object.keys(masters.customers); let no = startNo;
  const days = []; for (let t = msOf(from); t <= msOf(to); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  const mk = (day, plant, type, over = {}) => {
    const n = 1 + Math.floor(r() * 4), items = [];
    for (let k = 0; k < n; k++) {
      const m = prods[Math.floor(r() * prods.length)], P = masters.products[m], q = 1 + Math.floor(r() * 40), net = Math.round((q * (500 + r() * 900)) * 100) / 100;
      items.push({ BillingDocumentItem: pad((k + 1) * 10, 6), Plant: plant, Material: pad(m, 18), BillingQuantity: q.toFixed(3), BillingQuantityUnit: 'PC', NetAmount: net.toFixed(2), TransactionCurrency: 'INR', AdditionalMaterialGroup3: P.mg3, AdditionalMaterialGroup4: P.mg4, ReferenceSDDocument: '' });
    }
    return Object.assign({ BillingDocument: pad(no++, 10), BillingDocumentType: type, BillingDocumentDate: odDate(day), CompanyCode: company, SoldToParty: pad(custs[Math.floor(r() * custs.length)], 10), BillingDocumentIsCancelled: false, CancelledBillingDocument: '', LastChangeDate: odDate(day), TransactionCurrency: 'INR', to_Item: { results: items } }, over);
  };
  days.forEach(day => plants.forEach(p => { for (let i = 0; i < perDayPerPlant; i++) docs.push(mk(day, p, 'F2')); }));
  if (extras) {
    const d1 = days[Math.min(2, days.length - 1)], d2 = days[Math.min(4, days.length - 1)];
    const inv = docs.find(d => d.BillingDocument && d.to_Item.results[0].Plant === plants[0]);
    // a credit memo (G2) and a returns credit (RE); a debit memo (L2, not loaded); an ACP plant line (1050, skipped); a KG unit line (flagged); a foreign company document
    docs.push(mk(d1, plants[0], 'G2', { LastChangeDate: odDate(d1) }), mk(d2, plants[1] || plants[0], 'RE'), mk(d1, plants[0], 'L2'), mk(d1, '1050', 'F2'), mk(d2, plants[0], 'F2', { CompanyCode: '2000' }));
    const kg = mk(d1, plants[0], 'F2'); kg.to_Item.results[0].BillingQuantityUnit = 'KG'; docs.push(kg);
    // a cancelled invoice and its S1 cancellation (S1 dated a day later)
    const ca = mk(d1, plants[0], 'F2', { BillingDocumentIsCancelled: true }); const cn = mk(days[Math.min(3, days.length - 1)], plants[0], 'S1', { CancelledBillingDocument: ca.BillingDocument });
    cn.to_Item = JSON.parse(JSON.stringify(ca.to_Item)); cn.SoldToParty = ca.SoldToParty; ca.LastChangeDate = cn.BillingDocumentDate; docs.push(ca, cn);   // the cancellation repeats the cancelled lines
    void inv;
  }
  return docs;
}
const META = {
  API_BILLING_DOCUMENT_SRV: { A_BillingDocument: { type: 'A_BillingDocumentType', props: ['BillingDocument', 'BillingDocumentType', 'BillingDocumentDate', 'CompanyCode', 'SoldToParty', 'BillingDocumentIsCancelled', 'CancelledBillingDocument', 'LastChangeDate', 'TransactionCurrency', 'SDDocumentCategory'], nav: ['to_Item'] },
    A_BillingDocumentItem: { type: 'A_BillingDocumentItemType', props: ['BillingDocument', 'BillingDocumentItem', 'Plant', 'Material', 'BillingQuantity', 'BillingQuantityUnit', 'NetAmount', 'TransactionCurrency', 'AdditionalMaterialGroup3', 'AdditionalMaterialGroup4', 'ReferenceSDDocument', 'TaxAmount', 'BillingDocumentType', 'BillingDocumentDate', 'CompanyCode', 'SoldToParty', 'BillingDocumentIsCancelled', 'CancelledBillingDocument', 'LastChangeDate'], nav: [] } },
  API_PRODUCT_SRV: { A_Product: { type: 'A_ProductType', props: ['Product', 'ProductType', 'BaseUnit'], nav: [] } },
  API_BUSINESS_PARTNER: { A_Customer: { type: 'A_CustomerType', props: ['Customer', 'CustomerName', 'CustomerAccountGroup', 'DeletionIndicator', 'PostingIsBlocked', 'LegacyB1Code'], nav: [] },
    A_CustomerCompany: { type: 'A_CustomerCompanyType', props: ['Customer', 'CompanyCode'], nav: [] },
    A_CustomerSalesArea: { type: 'A_CustomerSalesAreaType', props: ['Customer', 'SalesOrganization', 'CustomerGroup', 'SalesGroup', 'CustomerPaymentTerms', 'SalesDistrict'], nav: [] },
    A_BusinessPartnerAddress: { type: 'A_BusinessPartnerAddressType', props: ['BusinessPartner', 'AddressID', 'Region', 'PostalCode', 'CityName', 'District', 'StreetName'], nav: [] },
    A_BusinessPartnerTax: { type: 'A_BusinessPartnerTaxType', props: ['BusinessPartner', 'BPTaxType', 'BPTaxNumber'], nav: [] } } };
/* customer master for the mock tenant: the 25 synthetic customers (company 1000) with addresses, sales areas and GSTIN, plus 5 customers of another company (ignored), and addresses of a non-customer partner.
 * Deliberate cases: one customer with two addresses (listed highest first; the lowest AddressID must win), one with none, one 4-digit PIN, one blank PIN, one with two sales areas, one 14-character GSTIN, one blocked, one other-type tax row. */
export function synthBP(masters = synthMasters()) {
  const codes = Object.keys(masters.customers), regions = ['GJ', 'MH', 'RJ'], bp = { customers: [], company: [], salesAreas: [], addresses: [], taxes: [] };
  codes.forEach((k, i) => {
    const id = pad(k, 10);
    bp.customers.push({ Customer: id, CustomerName: masters.customers[k], CustomerAccountGroup: 'ZSD1', DeletionIndicator: false, PostingIsBlocked: i % 11 === 10, LegacyB1Code: i % 2 === 0 ? 'C' + pad(i, 5) : '' });
    bp.company.push({ Customer: id, CompanyCode: '1000' });
    bp.salesAreas.push({ Customer: id, SalesOrganization: '1000', CustomerGroup: i % 2 ? 'C2' : 'C1', SalesGroup: i % 3 ? 'SG' + (i % 3) : '', CustomerPaymentTerms: 'Z030', SalesDistrict: 'ZONE0' + (1 + i % 3) });
    if (i === 4) bp.salesAreas.push({ Customer: id, SalesOrganization: '2000', CustomerGroup: 'C9', SalesGroup: 'SGX', CustomerPaymentTerms: 'Z090', SalesDistrict: 'ZONE09' });
    const adr = (aid, region, pin, city, district) => ({ BusinessPartner: id, AddressID: pad(aid, 10), Country: 'IN', Region: region, PostalCode: pin, CityName: city, District: district, StreetName: 'Synthetic Road ' + i });
    if (i === 9) { /* no address */ }
    else if (i === 7) { bp.addresses.push(adr(2, 'MH', '400001', 'Mumbai', 'Mumbai'), adr(1, 'GJ', '380007', 'Ahmedabad', 'Ahmedabad')); }
    else bp.addresses.push(adr(1, regions[i % 3], i === 3 ? '3800' : i === 5 ? '' : '3800' + pad(i, 2), 'City ' + (i % 6), i % 4 === 0 ? '' : 'District ' + (i % 5)));
    if (i % 5 !== 0) bp.taxes.push({ BusinessPartner: id, BPTaxType: 'IN3', BPTaxNumber: i === 6 ? '24AAAAA0006A1Z' : '24AAAAA' + pad(i, 4) + 'A1Z5' });
    if (i === 1) bp.taxes.push({ BusinessPartner: id, BPTaxType: 'IN4', BPTaxNumber: 'PANONLY123' });
  });
  for (let j = 0; j < 5; j++) { const id = pad(60000000 + j, 10); bp.customers.push({ Customer: id, CustomerName: 'Other Company Customer ' + j, CustomerAccountGroup: 'ZSD1', DeletionIndicator: false, PostingIsBlocked: false, LegacyB1Code: '' }); bp.company.push({ Customer: id, CompanyCode: '2000' }); bp.addresses.push({ BusinessPartner: id, AddressID: pad(1, 10), Region: 'KA', PostalCode: '560001', CityName: 'Bengaluru', District: 'Bengaluru', StreetName: 'x' }); }
  bp.addresses.push({ BusinessPartner: pad(70000001, 10), AddressID: pad(1, 10), Region: 'TN', PostalCode: '600001', CityName: 'Chennai', District: 'Chennai', StreetName: 'supplier' });
  return bp;
}
export function makeS4(cfg = {}) {
  const S = { user: 'svc_reader', password: 'S3cret-pw-9', host: 'https://mock-tenant-api.s4hana.test', docs: cfg.docs || [], products: cfg.products || synthMasters().products, customers: cfg.customers || synthMasters().customers,
    bp: cfg.bp || synthBP(cfg.customers ? { products: {}, customers: cfg.customers } : synthMasters()), pageCap: cfg.pageCap || null, msPerCall: cfg.msPerCall || 0, msPerItem: cfg.msPerItem || 0, items: 0, calls: [], fails: [], metaGaps: cfg.metaGaps || [], noCount: !!cfg.noCount, miscount: 0, leak: !!cfg.leak };
  const res = (code, body, headers) => ({ code, body: typeof body === 'string' ? body : JSON.stringify(body), headers: headers || {} });
  const strip = (s) => String(s).replace(/^0+/, '');
  function lit(v) { v = v.trim(); let m; if ((m = /^datetime'([^']+)'$/.exec(v))) return { t: 'd', v: Date.parse(m[1] + 'Z') }; if ((m = /^'(.*)'$/.exec(v))) return { t: 's', v: m[1].replace(/''/g, "'") }; if (v === 'true' || v === 'false') return { t: 'b', v: v === 'true' }; return { t: 'n', v: +v }; }
  function fv(o, f) { const x = o[f]; if (x == null) return null; const m = /^\/Date\((-?\d+)\)\/$/.exec(String(x)); return m ? +m[1] : x; }
  function test(o, clause) {
    const m = /^(\w+) (eq|ge|gt|le|lt) (.+)$/.exec(clause.trim()); if (!m) throw new Error('mock: cannot read filter clause ' + clause);
    const a = fv(o, m[1]), b = lit(m[3]).v; if (a === null) return false;
    return m[2] === 'eq' ? a === b : m[2] === 'ge' ? a >= b : m[2] === 'gt' ? a > b : m[2] === 'le' ? a <= b : a < b;
  }
  function filt(rows, f) { if (!f) return rows; if (S.leak) f = f.split(' and ').filter(c => !/BillingDocumentDate/.test(c)).join(' and '); if (!f) return rows; if (/ or /.test(f)) { const cl = f.split(' or '); return rows.filter(o => cl.some(c => test(o, c))); } const cl = f.split(' and '); return rows.filter(o => cl.every(c => test(o, c))); }
  function pick(o, sel, nav) { if (!sel) return o; const want = sel.split(','), out = {}; want.forEach(w => { if (w.indexOf('/') < 0 && w in o) out[w] = o[w]; });
    if (nav && o[nav]) { const ip = want.filter(w => w.startsWith(nav + '/')).map(w => w.slice(nav.length + 1)); out[nav] = { results: o[nav].results.map(it => { const x = {}; ip.forEach(p => { if (p in it) x[p] = it[p]; }); return x; }) }; } return out; }
  function list(rows, q, key, nav, selDefault) {
    let r = filt(rows, q.get('$filter'));
    const ob = q.get('$orderby'); if (ob) { const f = ob.split(' ')[0], dir = /\bdesc$/i.test(ob.split(',')[0].trim()) ? -1 : 1; r = r.slice().sort((a, b) => dir * (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0)); }
    const total = r.length, skip = +(q.get('$skip') || 0); let top = q.get('$top') != null ? +q.get('$top') : total, capped = false;
    if (S.pageCap && top > S.pageCap) { top = S.pageCap; capped = true; }
    const page = r.slice(skip, skip + top).map(o => pick(o, q.get('$select'), q.get('$expand') === nav ? nav : null)); S.items += page.reduce((n, o) => n + (nav && o[nav] ? o[nav].results.length : 1), 0);
    const d = { results: page }; if (q.get('$inlinecount') === 'allpages' && !S.noCount) d.__count = String(total + S.miscount);
    if (capped && skip + top < total) d.__next = S.host + '/next?skip=' + (skip + top);
    return { d };
  }
  function metaXml(svc) {
    const sets = META[svc]; let types = '', es = '';
    Object.keys(sets).forEach(n => { const e = sets[n]; if (S.metaGaps.includes(svc + '.' + n)) return;
      const props = e.props.filter(p => !S.metaGaps.includes(n + '.' + p)).map(p => '<Property Name="' + p + '" Type="Edm.String"/>').join(''), navs = e.nav.filter(p => !S.metaGaps.includes(n + '.' + p)).map(p => '<NavigationProperty Name="' + p + '" Relationship="x" FromRole="a" ToRole="b"/>').join('');
      types += '<EntityType Name="' + e.type + '"><Key><PropertyRef Name="' + e.props[0] + '"/></Key>' + props + navs + '</EntityType>'; es += '<EntitySet Name="' + n + '" EntityType="' + svc + '.' + e.type + '"/>'; });
    return '<?xml version="1.0"?><edmx:Edmx xmlns:edmx="x"><edmx:DataServices><Schema Namespace="' + svc + '">' + types + '<EntityContainer Name="c">' + es + '</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
  }
  S.fetch = (url, o, env) => {
    const method = (o && o.method) || 'get', u = new URL(url); S.calls.push({ method: method.toLowerCase(), url, path: u.pathname, query: u.search, headers: Object.assign({}, o && o.headers) });
    if (env && S.msPerCall) env.skew += S.msPerCall;
    S.items = 0;
    if (u.origin !== S.host) throw new Error('getaddrinfo ENOTFOUND ' + u.host);
    const f = S.fails.find(x => x.times > 0 && x.when.test(u.pathname + u.search)); if (f) { f.times--; if (f.throw) throw new Error('Exception: Timeout: ' + url); return res(f.code, f.body || { error: { message: { value: f.msg || 'injected failure' } } }); }
    const auth = (o && o.headers && o.headers.Authorization) || '', want = 'Basic ' + Buffer.from(S.user + ':' + S.password).toString('base64');
    if (auth !== want) return res(401, { error: { message: { value: 'Authentication failed for ' + S.user } } });
    const m = /^\/sap\/opu\/odata\/sap\/([A-Z_]+)\/(.+)$/.exec(u.pathname); if (!m || !META[m[1]]) return res(404, { error: { message: { value: 'Service not found' } } });
    const svc = m[1], rest = decodeURIComponent(m[2]), q = u.searchParams;
    // like the real tenant: a $select naming a property the entity does not have (or that metaGaps removes) is HTTP 404 "Resource not found for the segment '<name>'"
    if (q.get('$select') && rest !== '$metadata') {
      const es = /^(A_\w+)/.exec(rest), has = (set, p) => !!META[svc][set] && META[svc][set].props.includes(p) && !S.metaGaps.includes(set + '.' + p);
      if (es && META[svc][es[1]]) {
        const bad = q.get('$select').split(',').find(w => w.startsWith('to_Item/') ? !has('A_BillingDocumentItem', w.slice(8)) : !has(es[1], w));
        if (bad) return res(404, { error: { message: { value: "Resource not found for the segment '" + bad.replace(/^to_Item\//, '') + "'." } } });
      }
    }
    if (rest === '$metadata') return res(200, metaXml(svc), { 'content-type': 'application/xml' });
    { const esn = /^(A_\w+)/.exec(rest); if (esn && S.metaGaps.includes(svc + '.' + esn[1])) return res(404, { error: { message: { value: "Resource not found for the segment '" + esn[1] + "'." } } }); }
    let mm;
    if (svc === 'API_BILLING_DOCUMENT_SRV') {
      if ((mm = /^A_BillingDocument\('([^']*)'\)$/.exec(rest))) { const d = S.docs.find(x => x.BillingDocument === mm[1]); return d ? res(200, { d: pick(d, q.get('$select')) }) : res(404, { error: { message: { value: 'Resource not found' } } }); }
      if (rest === 'A_BillingDocumentItem') { const flat = []; S.docs.forEach(d => d.to_Item.results.forEach(it => flat.push(Object.assign({}, it, { BillingDocument: d.BillingDocument, BillingDocumentType: d.BillingDocumentType, BillingDocumentDate: d.BillingDocumentDate, CompanyCode: d.CompanyCode, SoldToParty: d.SoldToParty, BillingDocumentIsCancelled: d.BillingDocumentIsCancelled, CancelledBillingDocument: d.CancelledBillingDocument, LastChangeDate: d.LastChangeDate, TransactionCurrency: it.TransactionCurrency || d.TransactionCurrency })))); return res(200, list(flat, q, 'BillingDocument', null)); }
      if (rest === 'A_BillingDocument') return res(200, list(S.docs, q, 'BillingDocument', 'to_Item'));
    }
    if (svc === 'API_PRODUCT_SRV' && rest === 'A_Product') return res(200, list(Object.keys(S.products).map(k => ({ Product: k, ProductType: S.products[k].type, BaseUnit: 'PC' })).concat(Object.keys(S.products).map(k => ({ Product: pad(k, 18), ProductType: S.products[k].type, BaseUnit: 'PC' }))), q, 'Product'));
    if (svc === 'API_BUSINESS_PARTNER') { const set = { A_Customer: S.bp.customers, A_CustomerCompany: S.bp.company, A_CustomerSalesArea: S.bp.salesAreas, A_BusinessPartnerAddress: S.bp.addresses, A_BusinessPartnerTax: S.bp.taxes }[rest]; if (set) return res(200, list(set, q, 'Customer')); }
    return res(404, { error: { message: { value: 'Entity set not found' } } });
  };
  { const inner = S.fetch; S.fetch = (url, o, env) => { const r = inner(url, o, env); if (env && S.msPerItem) env.skew += S.msPerItem * S.items; return r; }; }   // optional cost per row returned (bigger pages take longer)
  S.failNext = (when, code, times = 1, extra = {}) => S.fails.push(Object.assign({ when, code, times }, extra));
  S.strip = strip;
  return S;
}
/* the same lines as the S/4 Sales Register export would show them (register column names), for the parity test. Lines the feed flags (not a sheet unit, not INR) and plants 1050 and up are kept: the feed skips them and the intake does the same. */
export function registerRows(S, { types = ['F2'], includeCancelled = false } = {}) {
  const hdr = ['Invoice Document Number', 'ODN', 'Invoice Document item', 'Invoice Date', 'Plant', 'Sold-to-Party Number', 'Sold-to-Party Description', 'Sales District', 'Sales Executive', 'Product Type', 'Product Code', 'Material Group 3', 'Material Group 4', 'Invoice Qty', 'Total Amount (Item)', 'Billing Type'], rows = [hdr];
  const strip = S.strip;
  S.docs.filter(d => d.CompanyCode === '1000' && types.includes(d.BillingDocumentType) && (includeCancelled || !d.BillingDocumentIsCancelled)).forEach(d => d.to_Item.results.forEach(it => {
    if (it.BillingQuantityUnit !== 'PC') return;
    const mat = strip(it.Material), cust = strip(d.SoldToParty), date = new Date(+/\((\d+)\)/.exec(d.BillingDocumentDate)[1]).toISOString().slice(0, 10);
    rows.push([strip(d.BillingDocument), '', strip(it.BillingDocumentItem), date, it.Plant, cust, S.customers[cust] || '', '', '', (S.products[mat] || {}).type || '', mat, it.AdditionalMaterialGroup3, it.AdditionalMaterialGroup4, +it.BillingQuantity, +it.NetAmount, d.BillingDocumentType]);
  }));
  return rows;
}
export const csvOf = (rows) => rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n');
