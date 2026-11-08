/* ================= My Dashboard, part 4: card library, role defaults, caps, layout model ================= */
var D_CAP={'Super admin':12,'Management / HO':12,'HOD':10,'Branch / depot manager':8,'Sales executive':6,'Accounts':6,'Plant':6,'Coordinator (sales / CRR)':6};
function dCapFor(role){return D_CAP[role]||6}
/* library: id, module, title, one line, saved-card spec. A spec is plain data; the page draws it by rules. */
var D_LIB=[
 {id:'sales_sheets',mod:'Sales',title:'Sheets against target',desc:'Sheets, target tick, band, QoQ and a 7-quarter sparkline',s:{measure:'sheets',by:'none',visual:'kpi',span:2}},
 {id:'sales_net',mod:'Sales',title:'Net sales (₹)',desc:'Value net of credit notes, QoQ',s:{measure:'value_net',by:'none',visual:'kpi',span:1}},
 {id:'sales_inv',mod:'Sales',title:'Value invoiced (₹)',desc:'Invoiced value, external customers',s:{measure:'value_inv',by:'none',visual:'kpi',span:1}},
 {id:'sales_zone',mod:'Sales',title:'Sheets by zone',desc:'One tile per zone with band tint and sparkline',s:{measure:'sheets',by:'zone',visual:'kpi',span:2}},
 {id:'sales_thk',mod:'Sales',title:'Thickness split',desc:'Share of sheets by thickness',s:{measure:'sheets',by:'thickness',visual:'donut',span:2}},
 {id:'sales_brand',mod:'Sales',title:'Brand split',desc:'Sheets by brand, top 8',s:{measure:'sheets',by:'brand',visual:'bar',n:8,span:2}},
 {id:'sales_mix',mod:'Sales',title:'Product-group mix by quarter',desc:'Sheets by group, stacked over 7 quarters',s:{measure:'sheets',by:'group',visual:'stacked',span:2}},
 {id:'sales_trend',mod:'Sales',title:'Sheets trend, 7 quarters',desc:'Line of sheets per quarter, current quarter to date',s:{measure:'sheets',by:'none',visual:'line',span:2}},
 {id:'sales_heat',mod:'Sales',title:'Plant by month heatmap',desc:'Sheets, plant x last 8 months',s:{measure:'sheets',by:'plant',visual:'heat',n:15,span:4}},
 {id:'sales_cust',mod:'Sales',title:'Top 5 customers',desc:'Invoiced value by customer, ranked',s:{measure:'value_inv',by:'customer',visual:'ranked',n:5,span:2}},
 {id:'sales_state',mod:'Sales',title:'Sheets by state',desc:'State of the plant, with QoQ',s:{measure:'sheets',by:'state',visual:'table',span:2}},
 {id:'sales_price',mod:'Sales',title:'Average price per sheet',desc:'Invoiced value ÷ sheets',s:{measure:'avgprice',by:'none',visual:'kpi',span:1}},
 {id:'plan_ach',mod:'Planning',title:'Achievement by plant',desc:'Ach % of sheet target, band-coloured',s:{measure:'ach',by:'plant',visual:'bar',n:12,span:2}},
 {id:'plan_share',mod:'Planning',title:'Share of potential by plant',desc:'Sheets ÷ market potential',s:{measure:'share',by:'plant',visual:'bar',n:12,span:2}},
 {id:'plan_phase',mod:'Planning',title:'Target phasing',desc:'Monthly target from the phasing percentages',s:{measure:'phasing',by:'month',visual:'line',span:2}},
 {id:'plan_gap',mod:'Planning',title:'Gap to target',desc:'Sheets still to go, by plant (furthest first)',s:{measure:'gap',by:'plant',visual:'ranked',n:8,dir:'bottom',span:2}},
 {id:'plan_pvt',mod:'Planning',title:'Potential, target and actual by zone',desc:'Bullet per zone: actual, target tick, potential track',s:{measure:'sheets',by:'zone',visual:'bullet',span:2}},
 {id:'coll_kpi',mod:'Collections',title:'Collections (₹)',desc:'Collected in the period, QoQ',s:{measure:'coll',by:'none',visual:'kpi',span:1}},
 {id:'coll_eff',mod:'Collections',title:'Collection efficiency by plant',desc:'Collected ÷ invoiced',s:{measure:'coll_eff',by:'plant',visual:'bar',n:12,span:2}},
 {id:'coll_zone',mod:'Collections',title:'Collections by zone',desc:'Small multiples with sparkline',s:{measure:'coll',by:'zone',visual:'multiples',span:2}},
 {id:'recv_age',mod:'Receivables',title:'Receivables ageing',desc:'Open items by days past due',s:{measure:'recv_age',by:'ageing',visual:'bar',span:2}},
 {id:'recv_top',mod:'Receivables',title:'Top 5 receivable customers',desc:'Outstanding by customer',s:{measure:'recv_out',by:'customer',visual:'ranked',n:5,span:2}},
 {id:'stock_kpi',mod:'Inventory',title:'Stock on hand',desc:'Sheets in stock on the latest snapshot',s:{measure:'stock_sh',by:'none',visual:'kpi',span:1}},
 {id:'stock_val',mod:'Inventory',title:'Stock value',desc:'Value on the latest snapshot',s:{measure:'stock_val',by:'none',visual:'kpi',span:1}},
 {id:'stock_days',mod:'Inventory',title:'Stock days by plant',desc:'Lower is better; bar colour = plan ÷ actual',s:{measure:'stock_days',by:'plant',visual:'bar',n:12,span:2}},
 {id:'cn_kpi',mod:'Credit notes',title:'Credit-note ratio',desc:'Credit notes ÷ invoiced value',s:{measure:'cn_ratio',by:'none',visual:'kpi',span:1}},
 {id:'cn_plant',mod:'Credit notes',title:'Credit-note ratio by plant',desc:'Lower is better',s:{measure:'cn_ratio',by:'plant',visual:'bar',n:12,span:2}},
 {id:'bn_plant',mod:'Benchmarking',title:'Plant vs plant (Ach %)',desc:'Each plant against the best and the median',s:{measure:'bench_pct',base:'ach',by:'plant',visual:'bench',span:2}},
 {id:'bn_zone',mod:'Benchmarking',title:'Zone vs zone (sheets)',desc:'Zones against the best and the median',s:{measure:'bench_idx',base:'sheets',by:'zone',visual:'bench',span:2}},
 {id:'bn_coll',mod:'Benchmarking',title:'Collections vs best and median',desc:'Collection efficiency by plant',s:{measure:'bench_pct',base:'coll_eff',by:'plant',visual:'bench',span:2}},
 {id:'bn_stock',mod:'Benchmarking',title:'Stock days vs best and median',desc:'Lowest stock days is best',s:{measure:'bench_pct',base:'stock_days',by:'plant',visual:'bench',span:2}},
 {id:'bn_movers',mod:'Benchmarking',title:'QoQ movers',desc:'Plants ranked by sheets QoQ %',s:{measure:'sheets',by:'plant',visual:'ranked',n:5,sortBy:'qoq',dir:'top',span:2}},
 {id:'rate_branch',mod:'Rating',title:'Branch rating',desc:'Stars from sales 50, collections 30, stock days 20. Informational only',s:{measure:'rating',by:'plant',visual:'table',span:4}},
 {id:'rate_person',mod:'Rating',title:'Person scorecard',desc:'Sheets, QoQ, share and on-time closure per salesperson',s:{measure:'person',by:'salesperson',visual:'table',n:12,span:4}},
 {id:'act_open',mod:'Actions',title:'Open actions',desc:'Live actions in your scope',s:{measure:'act_open',by:'none',visual:'kpi',span:1}},
 {id:'act_over',mod:'Actions',title:'Overdue actions',desc:'Past their due date',s:{measure:'act_over',by:'none',visual:'kpi',span:1}},
 {id:'act_fu',mod:'Actions',title:'Follow-ups waiting',desc:'Drafts a person still has to send',s:{measure:'act_fu',by:'none',visual:'kpi',span:1}},
 {id:'act_close',mod:'Actions',title:'On-time closure by plant',desc:'Closed by the due date ÷ closed',s:{measure:'act_close',by:'plant',visual:'bar',n:10,span:2}},
 {id:'dh_cov',mod:'Data health',title:'Data coverage',desc:'Export x quarter grid: loaded, partial, missing',s:{measure:'dh_cov',by:'none',visual:'coverage',span:4}},
 {id:'dh_last',mod:'Data health',title:'Last uploads',desc:'When each SAP export was last loaded',s:{measure:'dh_last',by:'none',visual:'kpi',span:2}},
 {id:'dh_rej',mod:'Data health',title:'Rejected rows',desc:'Rows skipped in the latest loads',s:{measure:'dh_rej',by:'none',visual:'kpi',span:2}}
];
function dLibById(id){return D_LIB.find(function(x){return x.id===id})||null}
function dLibLocked(e,role){var m=MEAS[e.s.measure];if(!m)return 'Unknown measure';if(!dRoleOk(role,m))return dRoleWhy(role,m);if(m.kind==='bench'&&e.s.base&&MEAS[e.s.base]&&!dRoleOk(role,MEAS[e.s.base]))return dRoleWhy(role,MEAS[e.s.base]);return ''}
/* built-in role defaults (used until a Super admin publishes one); never more than the role's cap */
var D_DEFAULTS={
 'Super admin':['sales_sheets','sales_net','coll_kpi','stock_kpi','sales_zone','sales_trend','plan_ach','coll_eff','bn_plant','rate_branch','sales_thk','sales_brand'],
 'Management / HO':['sales_sheets','sales_net','coll_kpi','stock_kpi','sales_zone','sales_trend','plan_ach','coll_eff','bn_plant','rate_branch','sales_thk','sales_brand'],
 'HOD':['sales_sheets','sales_zone','sales_trend','plan_ach','sales_thk','sales_brand','bn_movers','bn_plant','act_open','act_over'],
 'Branch / depot manager':['sales_sheets','sales_mix','sales_trend','sales_thk','coll_kpi','stock_kpi','recv_age','act_open'],
 'Sales executive':['sales_sheets','sales_trend','sales_cust','sales_mix','act_open','act_over'],
 'Coordinator (sales / CRR)':['sales_sheets','sales_cust','sales_mix','sales_trend','act_open','act_over'],
 'Accounts':['coll_kpi','coll_eff','recv_age','recv_top','cn_kpi','sales_net'],
 'Plant':['stock_kpi','stock_days','sales_sheets','sales_trend','act_open','act_over']
};
function dUid(){return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function dSan(c){
  /* whitelist and clamp: a saved layout is data from a database, never trusted as code */
  if(!c||typeof c!=='object')return null;
  var meas=String(c.measure||'');if(!MEAS[meas])return null;
  var o={id:/^[A-Za-z0-9_-]{1,40}$/.test(c.id||'')?c.id:dUid(),lib:c.lib&&dLibById(c.lib)?c.lib:undefined,title:String(c.title||'').slice(0,80),measure:meas,base:MEAS[c.base]&&MEAS[c.base].kind!=='bench'?c.base:'sheets',
    by:D_BY[c.by]&&c.by!=='item'?c.by:'none',filters:[],period:{k:'follow'},visual:D_VIS[c.visual]?c.visual:'',n:Math.max(0,Math.min(50,parseInt(c.n,10)||0)),dir:c.dir==='bottom'?'bottom':'top',sortBy:['value','qoq','label'].indexOf(c.sortBy)>=0?c.sortBy:'value',span:Math.max(1,Math.min(4,parseInt(c.span,10)||1))};
  (Array.isArray(c.filters)?c.filters:[]).slice(0,3).forEach(function(f){if(f&&D_FILTER_DIMS.indexOf(f.dim)>=0&&Array.isArray(f.vals)){var v=f.vals.map(function(x){return String(x).slice(0,60)}).filter(Boolean).slice(0,40);if(v.length)o.filters.push({dim:f.dim,vals:v})}});
  var p=c.period;if(p&&D_PERK[p.k]){o.period={k:p.k};['m','q','from','to'].forEach(function(k){if(p[k]&&/^[A-Za-z0-9-]{4,8}$/.test(String(p[k])))o.period[k]=String(p[k])})}
  if(!o.visual)o.visual=dAutoVisual(o);
  if(MEAS[meas].fixedBy)o.by=MEAS[meas].fixedBy;
  return o;
}
function dSanList(l){var out=[],seen={};(Array.isArray(l)?l:[]).slice(0,60).forEach(function(c){var x=dSan(c);if(x){while(seen[x.id])x.id=dUid();seen[x.id]=1;out.push(x)}});return out}
function dFromLib(id){var e=dLibById(id);if(!e)return null;var c=Object.assign({id:dUid(),lib:id,title:e.title,filters:[],period:{k:'follow'},n:0,dir:'top',sortBy:'value'},e.s);return dSan(c)}
function dBuiltin(role){return (D_DEFAULTS[role]||D_DEFAULTS['Coordinator (sales / CRR)']).map(dFromLib).filter(Boolean)}
function dCardTitle(c){var m=MEAS[c.measure];return c.title||(m?m.label+(c.by&&c.by!=='none'?' by '+D_BY[c.by].toLowerCase():''):'Card')}
function dDefTitle(c){var m=MEAS[c.measure];return m?m.label+(c.by&&c.by!=='none'?' by '+D_BY[c.by].toLowerCase():''):'Card'}
function dClone(x){return JSON.parse(JSON.stringify(x))}
