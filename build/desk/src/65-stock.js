/* ================= Stock intake and Inventory (D35, Vijay: "build stock data intake", 21 Oct 2026) =================
 * Stock is a SNAPSHOT as on a date, never a period sum. Per snapshot the `stock` collection holds:
 *   stock/snap_YYYYMMDD            index + aggregates per plant x product group (small)
 *   stock/it_YYYYMMDD_<plant>_<n>  per-item rows of one plant, gzipped, chunked like inv
 * Kept: the last 6 snapshots plus the latest snapshot of each month since history start (D28). Same as_of replaces. */
S.stockRaw=[];S.stockSnaps=[];S.stockAsOf='';S.itemIdx=null;S.itemIdxKey='';
var STK_KINDS={
 oitw:{label:'B1 inventory status (OITW)',sys:'B1',fields:[
  {k:'item',label:'Item code',canon:'item_code',req:1,c:['ItemCode','Item No.','Item Code']},
  {k:'wh',label:'Warehouse',canon:'warehouse_code',req:1,c:['WhsCode','Warehouse','Whs Code','Warehouse Code']},
  {k:'qty',label:'On hand (sheets)',canon:'qty_sheets',req:1,c:['OnHand','On Hand','In Stock','Quantity']},
  {k:'value',label:'Stock value (₹)',canon:'value_inr',c:['StockValue','Stock Value','Value','InvntryVal','Inventory Value']},
  {k:'price',label:'Average price (₹)',canon:'avg_price',c:['AvgPrice','Avg Price','Average Price']},
  {k:'name',label:'Item name',canon:'item_name',c:['ItemName','Item Name','Dscription','Description']}]},
 batch:{label:'B1 batch stock (OIBT / OBTN)',sys:'B1',fields:[
  {k:'item',label:'Item code',canon:'item_code',req:1,c:['ItemCode','Item No.','Item Code']},
  {k:'wh',label:'Warehouse',canon:'warehouse_code',req:1,c:['WhsCode','Warehouse','Whs Code','Warehouse Code']},
  {k:'qty',label:'Batch quantity (sheets)',canon:'qty_sheets',req:1,c:['Quantity','OnHand','Qty']},
  {k:'batch',label:'Batch number',canon:'batch_no',c:['BatchNum','Batch No.','Batch Number','DistNumber','Batch']},
  {k:'indate',label:'Batch in date',canon:'in_date',req:1,c:['InDate','In Date','AdmissionDate','Admission Date','Batch In Date','CreateDate']},
  {k:'value',label:'Stock value (₹)',canon:'value_inr',c:['StockValue','Stock Value','Value']},
  {k:'price',label:'Average price (₹)',canon:'avg_price',c:['AvgPrice','Avg Price']},
  {k:'name',label:'Item name',canon:'item_name',c:['ItemName','Item Name','Description']}]},
 s4tot:{label:'S/4 Stock Overview Totals (by material, plant, batch)',sys:'S4',fields:[
  {k:'item',label:'Old material number (B1 item code)',canon:'item_code',c:['Old Material Number','Old Material No.','Old material number']},
  {k:'material',label:'Material (S/4 number)',canon:'material',req:1,c:['Material','Material Number']},
  {k:'wh',label:'Plant',canon:'plant_code',req:1,c:['Plant']},
  {k:'sloc',label:'Storage location',canon:'storage_location',c:['Storage Location']},
  {k:'batch',label:'Batch',canon:'batch_no',c:['Batch']},
  {k:'qty',label:'Stock quantity on period end (sheets)',canon:'qty_sheets',req:1,c:['Stock Quantity on Period End']},
  {k:'value',label:'Stock value on period end (₹)',canon:'value_inr',c:['Stock Value on Period End']},
  {k:'qs',label:'Stock quantity on period start',canon:'qty_start',c:['Stock Quantity on Period Start']},
  {k:'gr',label:'Total goods receipt quantity',canon:'qty_gr',c:['Total Goods Receipt Quantity']},
  {k:'gi',label:'Total goods issue quantity',canon:'qty_gi',c:['Total Goods Issue Quantity']},
  {k:'mg',label:'Material group',canon:'material_group',c:['Material Group']},
  {k:'name',label:'Material description',canon:'item_name',c:['Material Description']}]},
 s4:{label:'S/4 stock (MB52 / API_MATERIAL_STOCK_SRV)',sys:'S4',fields:[
  {k:'item',label:'Material',canon:'item_code',req:1,c:['Material','Material Number','Product','MATNR']},
  {k:'wh',label:'Plant',canon:'plant_code',req:1,c:['Plant','WERKS']},
  {k:'sloc',label:'Storage location',canon:'storage_location',c:['Storage Location','Stor. Loc.','Storage Loc','LGORT']},
  {k:'qty',label:'Unrestricted stock (sheets)',canon:'qty_sheets',req:1,c:['Unrestricted','Unrestricted-Use Stock','Unrestricted Use','Unrestricted Stock','Unrestricted Qty','LABST']},
  {k:'qi',label:'Quality inspection',canon:'qty_quality',c:['Quality Inspection','In Quality Insp.','Quality Insp.','Quality','INSME']},
  {k:'blocked',label:'Blocked',canon:'qty_blocked',c:['Blocked','Blocked Stock','SPEME']},
  {k:'value',label:'Value (₹)',canon:'value_inr',c:['Value Unrestricted','Value','Stock Value','Total Value']},
  {k:'indate',label:'Batch / first receipt date',canon:'in_date',c:['Batch Creation Date','Goods Receipt Date','Last Goods Receipt','Created On']},
  {k:'name',label:'Material description',canon:'item_name',c:['Material Description','Description','Product Description']}]}
};
function stockDetect(headers){
  var set={};headers.forEach(function(h){set[norm(h)]=1});var has=function(a){return a.some(function(x){return set[norm(x)]})};
  if(set['docnum']||set['invoice document number'])return null;
  if(has(['itemcode','item code','item no.'])&&has(['whscode','warehouse','whs code','warehouse code'])){
    if(has(['batchnum','batch no.','batch number','distnumber'])&&has(['indate','in date','admissiondate','admission date','batch in date']))return {kind:'batch',sys:'B1'};
    if(has(['onhand','on hand','in stock']))return {kind:'oitw',sys:'B1'};
  }
  if(set['stock quantity on period end']&&set['plant']&&(set['material']||set['material number']))return {kind:'s4tot',sys:'S4'};
  if(has(['material','material number','matnr'])&&has(['plant','werks'])&&headers.some(function(h){return /unrestricted|labst/.test(norm(h))}))return {kind:'s4',sys:'S4'};
  return null;
}
function stockDefaultMap(kind,headers){
  var ix=headerIndex(headers),m={};STK_KINDS[kind].fields.forEach(function(f){m[f.k]=-1;for(var i=0;i<f.c.length;i++){var k=norm(f.c[i]);if(k in ix){m[f.k]=ix[k];break}}});return m;
}
function asOfFromName(name){
  var n=String(name||''),m=/(20\d{2})[-_. ]?(0[1-9]|1[0-2])[-_. ]?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(n);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=/(0[1-9]|[12]\d|3[01])[-_.](0[1-9]|1[0-2])[-_.](20\d{2})/.exec(n);if(m)return m[3]+'-'+m[2]+'-'+m[1];
  return '';
}
function compactYmd(iso){return iso.replace(/-/g,'')}

/* ---- item master in memory (code -> [group, sqft per sheet]); read from the stored chunks once ---- */
async function loadItemIdx(){
  var key=S.itemMeta?(S.itemMeta.upload||'')+'|'+(S.itemMeta.at||'')+'|'+(S.itemMeta.chunks||0):'';
  if(S.itemIdx&&S.itemIdxKey===key)return S.itemIdx;
  var idx=new Map();
  if(S.itemMeta){var n=S.itemMeta.chunks||1;
    for(var i=0;i<n;i++){var snap=await dget('items/c'+i);if(!snap.exists)continue;var arr=JSON.parse(await ungz(snap.data().z));
      arr.forEach(function(a){idx.set(String(a[0]).toUpperCase(),[ITEM_GROUPS[a[1]]||'Laminate',+a[2]||0,a[5]!==0])})}}
  S.itemIdx=idx;S.itemIdxKey=key;return idx;
}

/* ---- warehouse -> plant (plant master, then the editable alias table) ---- */
function whResolver(){
  var byCode={},byName={};S.plants.forEach(function(p){byCode[p.plant_code]=p;[p.b1_bpl_name,p.plant_name].forEach(function(n){if(n)byName[akey(n)]=p})});
  return function(raw){
    var s=String(raw==null?'':raw).trim();if(!s)return null;
    var al=aliasGet('warehouse',s);if(al){var p0=byCode[String(al).trim()];if(p0)return {p:p0,how:'alias'}}
    var c=s.replace(/\.0$/,'');if(/^\d{1,4}$/.test(c)){c=pad(c,4);if(byCode[c])return {p:byCode[c],how:''}}
    var m=/^(\d{4})\b/.exec(s);if(m&&byCode[m[1]])return {p:byCode[m[1]],how:'code prefix'};
    var k=akey(s);if(byName[k])return {p:byName[k],how:'plant name'};
    var best=null;Object.keys(byName).forEach(function(n){if(n.length>=4&&k.indexOf(n)===0&&(!best||n.length>best.length))best=n});
    if(best)return {p:byName[best],how:'plant name prefix'};
    return null;
  };
}

/* ---- file -> snapshot (pure) ---- */
async function stockParse(){
  var kind=U.sk,F=STK_KINDS[kind],map=U.map,rows=U.rows,asOf=U.asOf,idx=await loadItemIdx(),wr=whResolver();
  var res={kind:kind,sys:F.sys,asOf:asOf,read:rows.length,good:0,rejected:0,rejects:[],zero:0,other:{rows:0,sheets:0,items:{}},unknownWh:{},plants:{},hasAge:false,warn:{futureBatch:0,noPrice:0,mismatch:0,noSize:0},fx:{whMapped:0,viaGroup:0},itemMaster:idx.size>0};
  var col=function(k){return map[k]==null?-1:map[k]};var cMat=col('material'),cMG=col('mg'),cQs=col('qs'),cGr=col('gr'),cGi=col('gi'),cI=col('item'),cW=col('wh'),cQ=col('qty'),cV=col('value'),cP=col('price'),cD=col('indate'),cB=col('batch'),cQi=col('qi'),cBl=col('blocked'),cS=col('sloc');
  var rej=function(i,item,field,reason,val){res.rejected++;res.reasons=res.reasons||{};res.reasons[reason]=(res.reasons[reason]||0)+1;if(res.rejects.length<20000)res.rejects.push([i+2,item,'',field,reason,val==null?'':val])};
  var T0=Date.now(),thr=CFG.stock_age_days,hasIn=cD>=0;
  for(var i=0;i<rows.length;i++){
    if(Date.now()-T0>40){T0=Date.now();U.progress=Math.round(i/rows.length*100);U.progressMsg='Checking row '+fmtN(i)+' of '+fmtN(rows.length);var bar=$('#i-upload .bar i');if(bar)bar.style.width=U.progress+'%';await tick()}
    var r=rows[i],item=String(r[cI]==null?'':r[cI]).trim().replace(/\.0$/,''),matRef='';
    if(kind==='s4tot'){matRef=String(r[cMat]==null?'':r[cMat]).trim().replace(/\.0$/,'');if(!item)item=matRef}
    if(!item){rej(i,'','Item code','Item code is empty','');continue}
    var q=toNum(r[cQ]);
    if(kind==='s4'){var qi=cQi>=0?toNum(r[cQi]):0,bl=cBl>=0?toNum(r[cBl]):0;q=(isNaN(q)?0:q)+(isNaN(qi)?0:qi)+(isNaN(bl)?0:bl);if(r[cQ]===''&&(cQi<0||r[cQi]==='')&&(cBl<0||r[cBl]===''))q=NaN}
    if(isNaN(q)){rej(i,item,'Quantity','Quantity is not a number',r[cQ]);continue}
    if(q<0){rej(i,item,'Quantity','Negative stock',q);continue}
    if(kind==='s4tot'&&q>0&&cQs>=0&&cGr>=0&&cGi>=0){var a0=toNum(r[cQs])||0,a1=toNum(r[cGr])||0,a2=toNum(r[cGi])||0;if(Math.abs(a0+a1-a2-q)>0.5)res.warn.mismatch++}
    var plant=null,whRaw=String(r[cW]==null?'':r[cW]).trim();
    var rs=wr(whRaw);if(!rs){res.unknownWh[whRaw||'(blank)']=(res.unknownWh[whRaw||'(blank)']||0)+1;rej(i,item,kind==='s4'?'Plant':'Warehouse','Unknown warehouse or plant',whRaw);continue}
    if(rs.p.active===false){rej(i,item,'Plant','Plant is switched off in Admin',rs.p.plant_code);continue}
    plant=rs.p.plant_code;if(rs.how==='alias')res.fx.whMapped++;
    if(q===0){res.zero++;continue}
    var it=idx.get(item.toUpperCase());
    if(!it&&kind==='s4tot'){var mgr=cMG>=0?String(r[cMG]==null?'':r[cMG]).trim().toUpperCase():'';if(/^Z[A-Z0-9]{2,5}(LAM|PVC)$/.test(mgr)){it=[/PVC$/.test(mgr)?'PVC sheet':'Laminate',0,true];res.fx.viaGroup++;res.warn.noSize++}}
    if(!it){res.other.rows++;res.other.sheets+=q;var oi=res.other.items;if(Object.keys(oi).length<2000||oi[item])oi[item]=(oi[item]||0)+q;continue}
    var g=it[0],sq=Math.round(q*it[1]*100)/100,val=cV>=0?toNum(r[cV]):NaN;
    if(isNaN(val)&&cP>=0){var pr=toNum(r[cP]);if(!isNaN(pr))val=Math.round(pr*q*100)/100}
    if(isNaN(val))val=null;
    var inD=null,age=null;
    if(hasIn&&r[cD]!==''&&r[cD]!=null){var dd=parseDateCell(r[cD]);if(dd&&validYMD(dd)){inD=dd.y+'-'+pad(dd.m)+'-'+pad(dd.d);age=diffDays(asOf,inD);if(age<0){res.warn.futureBatch++;age=0}}}
    var P=res.plants[plant]||(res.plants[plant]={groups:{},rows:[]});
    var G=P.groups[g]||(P.groups[g]={sheets:0,sqft:0,value:0,hasValue:false,items:new Set(),age:[0,0,0,0],over:0,ageKnown:0});
    G.sheets+=q;G.sqft+=sq;G.items.add(item);if(val!=null){G.value+=val;G.hasValue=true}
    if(age!=null){res.hasAge=true;G.ageKnown+=q;G.age[age<=30?0:age<=60?1:age<=90?2:3]+=q;if(age>thr)G.over+=q}
    P.rows.push([item,(kind==='s4tot'&&cS>=0?String(r[cS]==null?'':r[cS]):whRaw).slice(0,20),ITEM_GROUPS.indexOf(g),q,sq,val==null?'':val,inD||'',cB>=0?String(r[cB]==null?'':r[cB]).slice(0,30):'',matRef]);
    res.good++;
  }
  return res;
}

/* ---- write a snapshot, replace the same as_of, prune ---- */
async function stockWrite(res,meta){
  var d8=compactYmd(res.asOf),id='snap_'+d8,old=S.stockRaw.find(function(x){return x._id===id}),plants={},uid=meta.uid,ci=0;
  var pk=Object.keys(res.plants).sort();
  for(var pi=0;pi<pk.length;pi++){
    var p=pk[pi],P=res.plants[p],rows=P.rows,per=1500,n=Math.max(1,Math.ceil(rows.length/per)),groups={};
    Object.keys(P.groups).forEach(function(g){var G=P.groups[g];groups[g]={sheets:Math.round(G.sheets),sqft:Math.round(G.sqft),value:G.hasValue?Math.round(G.value):null,items:G.items.size,age:G.ageKnown>0?G.age.map(Math.round):null,over:G.ageKnown>0?Math.round(G.over):null,ageKnown:Math.round(G.ageKnown)}});
    for(var c=0;c<n;c++){await dset('stock/it_'+d8+'_'+p+'_'+c,{z:await gz(JSON.stringify(rows.slice(c*per,(c+1)*per))),as_of:res.asOf,plant:p,i:c,n:rows.length,upload:uid,demo:meta.demo||undefined,fmt:'gz-json v1: [item,warehouse,group 0 Laminate 1 Door 2 PVC sheet 3 Compact board,sheets,sqft,value,in_date,batch]'});ci++}
    plants[p]={chunks:n,rows:rows.length,groups:groups};
  }
  await dset('stock/'+id,{as_of:res.asOf,kind:res.kind,sys:res.sys,file:meta.file,upload:uid,at:nowISO(),by:meta.by,plants:plants,hasAge:res.hasAge,thr:CFG.stock_age_days,read:res.read,loaded:res.good,skipped:res.rejected,other_rows:res.other.rows,demo:meta.demo||undefined});
  /* the same as_of is replaced: chunks of the old snapshot beyond the new ones are removed */
  if(old){var ops=old.plants||{};for(var q in ops){var oc=ops[q].chunks||0,nc=plants[q]?plants[q].chunks:0;for(var j=nc;j<oc;j++)await ddel('stock/it_'+d8+'_'+q+'_'+j)}}
  await stockPrune(res.asOf);
  return {chunks:ci,plants:pk.length};
}
function snapsSorted(){return S.stockSnaps.slice().sort(function(a,b){return a.as_of<b.as_of?1:-1})}
function stockKeepSet(extraAsOf){
  var all=snapsSorted().map(function(s){return s.as_of});if(extraAsOf&&all.indexOf(extraAsOf)<0)all.unshift(extraAsOf);all.sort().reverse();
  var keep={},lo=histLoYm();all.slice(0,6).forEach(function(a){keep[a]=1});
  var latestOfMonth={};all.forEach(function(a){var m=a.slice(0,7);if(!latestOfMonth[m]||a>latestOfMonth[m])latestOfMonth[m]=a});
  Object.keys(latestOfMonth).forEach(function(m){if(m>=lo)keep[latestOfMonth[m]]=1});
  return keep;
}
async function stockPrune(newAsOf){
  var keep=stockKeepSet(newAsOf);
  for(var i=0;i<S.stockSnaps.length;i++){var s=S.stockSnaps[i];if(keep[s.as_of]||s.as_of===newAsOf)continue;await stockDeleteSnap(s)}
}
async function stockDeleteSnap(s){
  var d8=compactYmd(s.as_of),ps=s.plants||{};
  for(var p in ps){for(var j=0;j<(ps[p].chunks||0);j++)await ddel('stock/it_'+d8+'_'+p+'_'+j)}
  await ddel('stock/snap_'+d8);
}

/* ---- ingest: the stock collection -> snapshots, and a legacy per-plant view for rules and KPIs ---- */
function ingestStock(){
  var snaps=S.stockRaw.filter(function(x){return /^snap_\d{8}$/.test(x._id)});
  S.stockSnaps=snaps;
  var sorted=snapsSorted(),today=TODAY(),latest=sorted.find(function(s){return s.as_of<=today})||sorted[0]||null;
  S.stockAsOf=latest?latest.as_of:'';
  var legacy=[];
  if(latest){Object.keys(latest.plants||{}).forEach(function(p){var gs=latest.plants[p].groups||{};
    legacy.push({_id:'snap-'+p,plant:p,asOn:latest.as_of,hasAge:!!latest.hasAge,rows:Object.keys(gs).map(function(g){var G=gs[g];return [g,G.sheets,G.over==null?0:G.over,G.age||null,G.sqft,G.value]})})})}
  else legacy=S.stockRaw.filter(function(x){return x.rows&&x.plant});
  S.stock=legacy;DS.cache={};S.engSig=null;S.lastHtml='';schedule();
}
function stockSnapAt(asOf){return S.stockSnaps.find(function(s){return s.as_of===asOf})||null}

/* ---- stock days: stock sheets / average daily sheets sold over the last 90 days to the as-of date ---- */
function dailySheets(plant,group,asOf){
  var end=asOf,start=addDays(asOf,-89),sh=0,days=0,ym=start.slice(0,7);
  while(ym<=end.slice(0,7)){
    var first=ym+'-01',last=ym+'-'+pad(ymDays(ym)),a=first>start?first:start,b=last<end?last:end,od=diffDays(b,a)+1;
    var c=S.cells['INV_'+ym];var loaded=c&&c.plants&&(plant?c.plants[plant]:Object.keys(c.plants).length>0);
    if(od>0&&loaded){var x=sumF(group?{plant:plant,group:group}:{plant:plant},[ym]).sh;
      if(ym===end.slice(0,7)&&end<last){sh+=x;days+=od}else{sh+=x*od/ymDays(ym);days+=od}}
    ym=shiftYm(ym,1);
  }
  return days>0&&sh>0?{perDay:sh/days,days:days,sheets:sh}:null;
}
function stockDays(plant,g,onhand,asOf){
  var d=dailySheets(plant,g,asOf||S.stockAsOf||TODAY());if(!d||!(onhand>=0))return null;return onhand/d.perDay;
}

/* ================= the Stock upload UI (own stages in the intake card) ================= */
function stockStart(file,rows,headers,det,sheetPicked){
  var mode=U.mode;U=newU();U.mode=mode;U.kind='stock';U.entity='ST';U.name=file.name;U.size=file.size;U.headers=headers;U.rows=rows.slice(1);U.sk=det.kind;U.sys=det.sys;U.sheetPicked=sheetPicked;
  U.map=stockDefaultMap(det.kind,headers);
  var sv=S.mappings[det.sys+'_stock_'+det.kind];if(sv&&sv.map){var ix=headerIndex(headers),used=false;Object.keys(sv.map).forEach(function(k){var n=norm(sv.map[k]);if(sv.map[k]===null||sv.map[k]===''){U.map[k]=-1;used=true}else if(n in ix){U.map[k]=ix[n];used=true}});U.savedMap=used}
  U.asOf=asOfFromName(file.name);U.asOfSrc=U.asOf?'file name':'';
  U.stage='mapping';renderUpload();
}
function stockRender(){
  var el=$('#i-upload');if(!el)return;var st=U.stage,F=STK_KINDS[U.sk],locked=st==='validating'||st==='loading';
  var stepIdx={mapping:2,validating:3,validated:3,loading:4,done:4}[st]||1;
  var steps=['Upload','Confirm mapping','Validate','Load'].map(function(s,i){return '<span class="'+(i+1<stepIdx?'ok':i+1===stepIdx?'on':'')+'">'+(i+1)+' '+s+'</span>'}).join('');
  var h='<div class="hd"><h2>Upload a SAP export &middot; Stock</h2><div class="steps">'+steps+'</div></div>';
  h+='<div class="banner info"><span><b>'+esc(U.name)+'</b> &middot; '+fmtN(U.rows.length)+' data rows &middot; '+U.headers.length+' columns &middot; detected <b>'+esc(F.label)+'</b>'+(U.savedMap?' &middot; saved mapping applied':'')+'</span><button class="btn sm" data-act="u-reset" '+(locked?'disabled':'')+'>Choose another file</button></div>';
  var asOfOk=/^\d{4}-\d\d-\d\d$/.test(U.asOf||'')&&U.asOf<=TODAY();
  h+='<div class="row" style="align-items:flex-end"><div class="fld"><label for="stk-asof">Stock as on (required)</label><input id="stk-asof" type="date" class="in" data-chg="stk-asof" value="'+esc(U.asOf||'')+'" max="'+TODAY()+'" '+(locked?'disabled':'')+'></div><div class="note" style="flex:1">'+(U.asOf?(asOfOk?'Read from the '+esc(U.asOfSrc||'picker')+': <b>'+esc(fmtDate(U.asOf))+'</b>. A snapshot for the same date replaces the earlier one.':'<b class="dn">That date is in the future.</b> Pick the date the stock was taken.'):'No date in the file name. <b>Pick the date this stock is as on.</b>')+'</div></div>';
  if(st==='mapping'){
    var rows=F.fields.map(function(f){var cur=U.map[f.k];if(cur==null)cur=-1;
      var opts='<option value="-1"'+(cur<0?' selected':'')+'>unmapped</option>'+U.headers.map(function(hd,i){return '<option value="'+i+'"'+(cur===i?' selected':'')+'>'+esc(hd===''?'(blank header, col '+(i+1)+')':hd)+'</option>'}).join('');
      var sample='';if(cur>=0){for(var r=0;r<Math.min(U.rows.length,50);r++){var v=U.rows[r][cur];if(v!==''&&v!=null){sample=String(v);break}}}
      return '<tr><td><select class="in" data-chg="stk-map" data-k="'+f.k+'" aria-label="File column for '+esc(f.label)+'">'+opts+'</select></td><td><b>'+esc(f.label)+'</b><div class="note mono">'+f.canon+'</div></td><td class="note">'+esc(f.c.slice(0,3).join(', '))+'</td><td>'+(f.req?'<span class="pill info">Required</span>':'<span class="pill mute">Optional</span>')+'</td><td class="mono break" style="max-width:180px">'+esc(sample.slice(0,60))+'</td></tr>'}).join('');
    var miss=F.fields.filter(function(f){return f.req&&(U.map[f.k]==null||U.map[f.k]<0)}).map(function(f){return f.label});
    h+='<div class="hd"><h2>Confirm column mapping</h2><span class="note">Saved per file type when the stock loads.</span></div><div class="tw"><table><thead><tr><th>File column</th><th>Canonical field</th><th>Usual header</th><th>Need</th><th>Sample</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
     +(miss.length?'<div class="banner err">Map these required fields first: '+esc(miss.join(', '))+'</div>':'')
     +'<div class="row"><button class="btn pri" data-act="stk-validate" '+(miss.length||!asOfOk?'disabled':'')+'>Confirm and validate</button></div>';
  }
  if(st==='validating')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='validated'||st==='loading'||st==='done')h+=stockResultHtml(locked||st==='done');
  if(st==='loading')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='done')h+='<div class="banner '+(U.doneOk?'ok':'warn')+'"><span>'+esc(U.doneMsg)+'</span><button class="btn sm" data-act="u-reset">Upload another file</button></div>';
  if(U.msg)h+='<div class="banner err">'+esc(U.msg)+'</div>';
  el.innerHTML=h;
}
function stockResultHtml(locked){
  var r=U.res;if(!r)return '';
  var h='<div class="hd"><h2>Validation result</h2><span class="pill '+(r.rejected?'part':'ok')+'">'+(r.rejected?fmtN(r.rejected)+' rows will be skipped':'All rows pass')+'</span></div>'
   +'<div class="kpis"><div class="kpi"><small>Rows read</small><b>'+fmtN(r.read)+'</b></div><div class="kpi"><small>Stock rows loading</small><b>'+fmtN(r.good)+'</b></div><div class="kpi"><small>Rows skipped (rejected)</small><b>'+fmtN(r.rejected)+'</b></div><div class="kpi"><small>Not laminates / not in item master (counted)</small><b>'+fmtN(r.other.rows)+'</b></div><div class="kpi"><small>Plants</small><b>'+Object.keys(r.plants).length+'</b></div><div class="kpi"><small>Zero-stock rows</small><b>'+fmtN(r.zero)+'</b></div></div>';
  var it=[],tot={sheets:0,sqft:0};Object.keys(r.plants).forEach(function(p){Object.keys(r.plants[p].groups).forEach(function(g){tot.sheets+=r.plants[p].groups[g].sheets;tot.sqft+=r.plants[p].groups[g].sqft})});
  it.push({st:'info',t:'Snapshot',n:null,d:esc('As on '+fmtDate(r.asOf)+'. '+fmtN(Math.round(tot.sheets))+' sheets ('+fmtN(Math.round(tot.sqft))+' sq ft) in '+Object.keys(r.plants).length+' plants. '+(stockSnapAt(r.asOf)?'Replaces the snapshot already held for this date.':'New snapshot.'))});
  if(!r.itemMaster)it.push({st:'need',t:'No item master loaded',n:null,d:'Stock needs the item master to know the product group and sq ft per sheet. Load it in Admin › Item master first.'});
  if(r.fx.whMapped)it.push({st:'fixed',t:'Warehouses mapped to plants through the alias table',n:r.fx.whMapped,d:'Several warehouses of one plant are added together. Edit in Admin › Aliases.'});
  var uw=Object.keys(r.unknownWh);
  if(uw.length)it.push({st:'sugg',t:'Warehouses not matched to a plant (rows skipped)',n:uw.reduce(function(a,k){return a+r.unknownWh[k]},0),d:'<div class="tw" style="max-height:200px;overflow:auto"><table><thead><tr><th>Warehouse in the file</th><th class="num">Rows</th><th>Plant</th><th></th></tr></thead><tbody>'+uw.slice(0,15).map(function(w,i){return '<tr><td class="break">'+esc(w)+'</td><td class="num">'+fmtN(r.unknownWh[w])+'</td><td><select id="stkw-'+i+'" class="in">'+S.plants.slice().sort(function(a,b){return a.plant_code<b.plant_code?-1:1}).map(function(p){return '<option value="'+esc(p.plant_code)+'">'+esc(p.plant_code+' '+(p.plant_name||''))+'</option>'}).join('')+'</select></td><td><button class="btn sm" data-act="stk-whmap" data-i="'+i+'" data-raw="'+esc(w)+'">Save mapping</button></td></tr>'}).join('')+'</tbody></table></div>'});
  if(r.other.rows){var oi=Object.keys(r.other.items).sort(function(a,b){return r.other.items[b]-r.other.items[a]}).slice(0,8);it.push({st:r.itemMaster?'info':'need',t:'Items not in the item master (counted, not stored)',n:Object.keys(r.other.items).length,d:esc(fmtN(Math.round(r.other.sheets))+' sheets. Largest: '+oi.map(function(k){return k+' '+fmtN(Math.round(r.other.items[k]))}).join(', ')+'. The item master holds laminate-scope items only; if these are laminates, add them to it and upload again.')})}
  if(r.warn.mismatch)it.push({st:'info',t:'Rows where start + receipts − issues does not equal the closing quantity',n:r.warn.mismatch,d:'Warned, not rejected: the closing quantity (Stock Quantity on Period End) is used.'});
  if(r.fx.viaGroup)it.push({st:'need',t:'Items with no size: not in the item master, group taken from the material group',n:r.fx.viaGroup,d:'Sheets and stock days are right; sq ft needs the item in the item master (Admin › Item master).'});
  if(r.reasons&&r.reasons['Negative stock'])it.push({st:'need',t:'Negative stock quantities skipped',n:r.reasons['Negative stock'],d:'Correct the negative on-hand in SAP (goods movement posted before receipt).'});
  if((r.kind==='oitw'||r.kind==='s4tot')&&!r.hasAge)it.push({st:'need',t:'No ageing',n:null,d:'This file has no batch dates, so stock age and aged stock % need the batch export (OIBT with InDate). Stock days work.'});
  if(r.hasAge)it.push({st:'info',t:'Ageing from batch dates',n:null,d:esc('Age buckets 0-30 / 31-60 / 61-90 / 90+ days and sheets older than '+CFG.stock_age_days+' days.'+(r.warn.futureBatch?' '+r.warn.futureBatch+' batches dated after the as-of date counted as new.':''))});
  var nv=0;Object.keys(r.plants).forEach(function(p){Object.keys(r.plants[p].groups).forEach(function(g){if(!r.plants[p].groups[g].hasValue)nv++})});
  if(nv&&r.good)it.push({st:'info',t:'No stock value for '+nv+' plant x group lines',n:null,d:'Add StockValue or AvgPrice to the export if you want stock value shown.'});
  var skipped=!!r.rejected;
  h+=fixesPanel(it,'Fixes applied');
  var can=r.good>0&&!locked;
  h+='<div class="row"><button class="btn pri" data-act="stk-load" '+(can?'':'disabled')+'>Load '+fmtN(r.good)+' stock rows</button>'+(skipped?'<button class="btn" data-act="u-rejcsv-stock">Download skipped rows (CSV)</button>':'')+(locked?'':'<button class="btn" data-act="u-reset">Cancel upload</button>')+'</div>';
  return h;
}
async function stockValidate(){
  U.stage='validating';U.progress=0;U.progressMsg='Starting...';stockRender();await tick();
  try{U.res=await stockParse();U.stage='validated';}catch(e){U.stage='mapping';U.msg='Could not check the file: '+((e&&e.message)||e)}
  stockRender();
}
async function stockLoad(){
  if(!superOnly('load stock')||!U||!U.res||U.res.good<=0)return;
  var r=U.res,uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),by=whoAmI(),failed=null,demo=!!U.demoFlag;
  U.stage='loading';U.progressMsg='Writing the snapshot...';stockRender();await tick();
  var info=null;
  try{info=await stockWrite(r,{uid:uid,file:U.name,by:by,demo:demo});
    if(r.rejects.length){var rr=r.rejects.slice(0,1500);await dset('rejects/'+uid,{z:await gz(JSON.stringify(rr)),n:rr.length,total:r.rejected,demo:demo||undefined})}
  }catch(e){failed=e}
  var upl={at:nowISO(),by:by,sys:r.sys,entity:'ST',file:U.name,size:U.size,mode:'snapshot',periodLabel:'Stock as on '+fmtDate(r.asOf),as_of:r.asOf,read:r.read,loaded:failed?0:r.good,rejected:r.rejected,skipped:r.rejected,warned:0,status:failed?'Failed':'Loaded',demo:demo||undefined,
    plants:Object.keys(r.plants).length,other_rows:r.other.rows,fixes:{warehouses_mapped:r.fx.whMapped,zero_rows:r.zero,has_age:r.hasAge},error:failed?dbErrText(failed):undefined};
  try{await dset('uploads/'+uid,upl);if(!failed){var mp={};Object.keys(U.map).forEach(function(k){mp[k]=U.map[k]>=0?U.headers[U.map[k]]:null});await dset('mappings/'+r.sys+'_stock_'+r.kind,{map:mp,sys:r.sys,entity:'ST',kind:r.kind,at:nowISO(),by:by})}}catch(e2){failed=failed||e2}
  U.stage='done';U.doneOk=!failed;
  U.doneMsg=failed?('Load stopped: '+dbErrText(failed)):('Loaded the stock snapshot as on '+fmtDate(r.asOf)+': '+fmtN(r.good)+' rows in '+info.plants+' plants'+(r.rejected?'. '+fmtN(r.rejected)+' rows were skipped; the list is in Upload history':'')+'.');
  stockRender();
}
Object.assign(handlers,{
 'stk-validate':async function(){await stockValidate();if(U&&U.stage==='validated'&&!window.__NOAUTOLOAD&&U.res&&U.res.good>0&&effRole()==='Super admin'&&!readOnly()){toast('Loading '+fmtN(U.res.good)+' stock rows; '+fmtN(U.res.rejected)+' skipped');await stockLoad()}},
 'stk-load':function(){return stockLoad()},
 'stk-whmap':async function(t){
   var raw=t.getAttribute('data-raw'),sel=document.getElementById('stkw-'+t.getAttribute('data-i'));if(!sel)return;
   if(await aliasSave('warehouse',raw,sel.value)){toast('Saved: '+raw+' → '+sel.value);U.stage='validating';stockRender();await stockValidate()}
 },
 'u-rejcsv-stock':function(){var r=U.res;return download('skipped-stock-rows.csv',csvLine(['row','item','line','field','reason','value'])+'\n'+r.rejects.map(csvLine).join('\n'))}
});
document.addEventListener('change',function(ev){
  var t=ev.target,c=t.getAttribute&&t.getAttribute('data-chg');
  if(c==='stk-asof'){U.asOf=t.value;U.asOfSrc='picker';if(U.stage==='validated'||U.stage==='done'){U.stage='mapping';U.res=null}stockRender()}
  else if(c==='stk-map'){U.map[t.getAttribute('data-k')]=+t.value;U.savedMap=false;stockRender()}
});

/* ---- Undo for a stock upload ---- */
function stockUndoPlan(uid){var s=S.stockSnaps.find(function(x){return x.upload===uid});return s?{snap:s,as_of:s.as_of,plants:Object.keys(s.plants||{}).length}:null}
async function stockUndo(uid){
  var pl=stockUndoPlan(uid),u=S.uploads.find(function(x){return x._id===uid});
  if(pl)await stockDeleteSnap(pl.snap);
  await ddel('rejects/'+uid);
  if(u){var up=Object.assign({},u);delete up._id;await dset('uploads/'+uid,Object.assign(up,{status:'Undone',undone_at:nowISO(),undone_by:whoAmI(),undone_months:pl?[pl.as_of]:[],undone_plant_months:pl?pl.plants:0}))}
  await auditW('upload undone','',{upload:uid,file:((u&&u.file)||'').slice(0,120),as_of:pl?pl.as_of:'',plants:pl?pl.plants:0});
  await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:whoAmI(),event:'upload undone',upload:uid,as_of:pl?pl.as_of:''});
}

/* ================= Inventory page ================= */
S.inv={plant:'',group:'',items:{}};
function stockScopeSnap(){
  var sn=stockSnapAt(S.stockAsOf);if(!sn)return null;var sc=SC(),ps={};
  Object.keys(sn.plants||{}).forEach(function(p){if(plantInScope(sc,p))ps[p]=sn.plants[p]});
  return {snap:sn,plants:ps};
}
function invLines(ctx,sn){
  var out=[];Object.keys(sn.plants).forEach(function(p){if(ctx.f.plant&&p!==ctx.f.plant)return;var gs=sn.plants[p].groups||{};Object.keys(gs).forEach(function(g){if(ctx.f.group&&g!==ctx.f.group)return;var G=gs[g];
    var d=dailySheets(p,g,sn.as_of),days=d&&d.perDay>0?G.sheets/d.perDay:null;out.push({plant:p,group:g,sheets:G.sheets,sqft:G.sqft,value:G.value,items:G.items,age:G.age,over:G.over,days:days,perDay:d?d.perDay:null})})});
  return out;
}
function pageInventory(){
  var ctx=viewCtx(),sc=stockScopeSnap();
  if(!sc||!Object.keys(sc.plants).length)return needPanel(['stock'],S.stockSnaps.length?'No stock snapshot covers your plants.':'No stock is loaded.')+'<p class="note">Upload the stock export in Data Intake (Super admin). B1: inventory status (OITW) or batch stock (OIBT); S/4: MB52 or Stock Overview Totals.</p>';
  var sn=sc.snap,L=invLines(ctx,{as_of:sn.as_of,plants:sc.plants}),tot={sheets:0,sqft:0,value:0,hasV:false,over:0,ageK:0,days:0};
  L.forEach(function(x){tot.sheets+=x.sheets;tot.sqft+=x.sqft;if(x.value!=null){tot.value+=x.value;tot.hasV=true}if(x.age&&x.over!=null){tot.over+=x.over;tot.ageK+=x.age.reduce(function(a,b){return a+b},0)}});
  var dn=0,dd=0;L.forEach(function(x){if(x.days!=null){dn+=x.days*x.sheets;dd+=x.sheets}});var days=dd>0?dn/dd:null,tgt=CFG.stock_days_target;
  var agedPct=tot.ageK>0?tot.over/tot.ageK*100:null;
  var cards=[kpiCard({color:'indigo',chip:'▦',title:'Stock on hand · as on '+fmtDate(sn.as_of).replace(/^\w+ /,''),value:fmtSheets(tot.sheets),sub:'= '+fmtSqft(tot.sqft)+(tot.hasV?' · '+fmtMoney(tot.value):'')+'.',status:'none',pillTxt:'No plan',rows:[['Plan','—'],['Var','—'],['Ach %','—'],['Snapshots held',String(S.stockSnaps.length)],['QoQ %','—'],['Quarter trend','—']]}),
   kpiCard({color:'violet',chip:'⏳',title:'K15 · Stock days',value:days!=null?days.toFixed(1)+' d':'—',sub:'On hand ÷ average daily sheets sold in the last 90 days to the as-of date.',status:days==null?'none':statusOf(days/tgt*100,true),ach:days!=null?Math.min(100,tgt/Math.max(days,.1)*100):null,rows:[['Plan',tgt+' d'],['Var',days!=null?(days-tgt>=0?'+':'−')+Math.abs(days-tgt).toFixed(1)+' d':'—'],['Ach %',days!=null?fmtAch(tgt/Math.max(days,.1)*100):'—'],['Last Qtr','no prior snapshot'],['QoQ %','—'],['Quarter trend','—']]}),
   agedPct!=null?kpiCard({color:'orange',chip:'%',title:'K16 · Aged stock % (over '+CFG.stock_age_days+' days)',value:agedPct.toFixed(1)+'%',sub:fmtN(Math.round(tot.over))+' aged sheets.',status:statusOf(agedPct/10*100,true),ach:Math.min(100,10/Math.max(agedPct,.1)*100),rows:[['Plan','10% (Assumed)'],['Var',(agedPct-10>=0?'+':'−')+Math.abs(agedPct-10).toFixed(1)+' pt'],['Ach %',fmtAch(10/Math.max(agedPct,.1)*100)],['Last Qtr','no prior snapshot'],['QoQ %','—'],['Quarter trend','—']]}):
    kpiCard({color:'orange',chip:'%',title:'K16 · Aged stock %',value:'—',sub:'Needs the batch export.',pending:true,pendingTxt:'Needs batch export',pendingMsg:'Ageing needs batch dates (B1 OIBT with InDate, or the S/4 batch creation date). The stock file loaded has none.',rows:[['Plan','10% (Assumed)'],['Var','—'],['Ach %','—'],['Last Qtr','—'],['QoQ %','—'],['Quarter trend','—']]})];
  var h='<div class="kpirow">'+cards.join('')+'</div>';
  /* plant x group table */
  var q=(S.f.search||'').toLowerCase(),rows=L.filter(function(r){return !q||(plantShort(r.plant)+r.group).toLowerCase().indexOf(q)>=0}).sort(function(a,b){return (b.days||0)-(a.days||0)});
  h+='<section class="card"><div class="hd"><h2>Stock vs plan · plant × product group</h2><span class="note">As on '+esc(fmtDate(sn.as_of))+' &middot; '+esc(sn.kind==='batch'?'batch export':sn.kind==='s4'?'S/4':'inventory status')+'</span></div><div class="tw tall"><table class="std"><thead><tr><th>Plant</th><th>Group</th><th class="num">On hand (sheets)</th><th class="num">sq ft</th><th class="num">Plan days</th><th class="num">Stock days</th><th class="num">Ach %</th><th>Status</th><th class="num">0–30</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">90+</th></tr></thead><tbody>'
   +rows.map(function(r){var ach=r.days!=null?tgt/Math.max(r.days,.1)*100:null,stt=r.days!=null?statusOf(r.days/tgt*100,true):'none';
     return '<tr class="clk" data-act="inv-drill" data-plant="'+esc(r.plant)+'" data-group="'+esc(r.group)+'"><td>'+esc(plantShort(r.plant))+' ›</td><td>'+esc(r.group)+'</td><td class="num">'+fmtN(r.sheets)+'</td><td class="num">'+fmtN(r.sqft)+'</td><td class="num">'+tgt+'</td><td class="num">'+(r.days!=null?r.days.toFixed(1):'—')+'</td><td class="num">'+fmtAch(ach)+'</td><td>'+statusPill(stt)+'</td>'
     +(r.age?r.age.map(function(b){return '<td class="num">'+fmtN(b)+'</td>'}).join(''):'<td class="num note" colspan="4">needs batch export</td>')+'</tr>'}).join('')
   +'</tbody></table></div><p class="note">Stock days = sheets on hand ÷ average daily sheets sold in the last 90 days to the as-of date, per plant × product group. Click a row for the items. Rule R4 raises an action at '+fmtN(CFG.stock_age_min_sheets)+' aged sheets or '+CFG.stock_over_pct+'% of plan days.</p></section>';
  /* drill */
  if(S.inv.plant){
    var key=sn.as_of+'|'+S.inv.plant,items=S.inv.items[key];
    h+='<section class="card" id="inv-drill"><div class="hd"><h2>Items · '+esc(plantShort(S.inv.plant))+(S.inv.group?' · '+esc(S.inv.group):'')+'</h2><button class="btn sm" data-act="inv-close">Close</button></div>';
    if(!items){h+='<div class="note">Reading the item rows...</div>';loadStockItems(sn,S.inv.plant)}
    else{
      var list=items.filter(function(x){return !S.inv.group||ITEM_GROUPS[x[2]]===S.inv.group});
      var by={};list.forEach(function(x){var o=by[x[0]]||(by[x[0]]={item:x[0],g:ITEM_GROUPS[x[2]],sheets:0,sqft:0,value:0,hv:false,oldest:''});o.sheets+=x[3];o.sqft+=x[4];if(x[5]!==''){o.value+=+x[5];o.hv=true}if(x[6]&&(!o.oldest||x[6]<o.oldest))o.oldest=x[6]});
      var arr=Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return b.sheets-a.sheets});
      h+='<div class="tw tall"><table class="std"><thead><tr><th>Item</th><th>Group</th><th class="num">Sheets</th><th class="num">sq ft</th><th class="num">Value</th><th>Oldest batch</th><th class="num">Age (days)</th></tr></thead><tbody>'+arr.slice(0,200).map(function(o){return '<tr><td class="mono">'+esc(o.item)+'</td><td>'+esc(o.g)+'</td><td class="num">'+fmtN(Math.round(o.sheets))+'</td><td class="num">'+fmtN(Math.round(o.sqft))+'</td><td class="num">'+(o.hv?fmtMoney(o.value):'—')+'</td><td>'+(o.oldest?esc(o.oldest):'—')+'</td><td class="num">'+(o.oldest?diffDays(sn.as_of,o.oldest):'—')+'</td></tr>'}).join('')+'</tbody></table></div><p class="note">'+arr.length+' items'+(arr.length>200?' (top 200 by sheets shown)':'')+'. Item-level stock days are not computed: the invoice store keeps no item (D9).</p>';
    }
    h+='</section>';
  }
  /* snapshots held */
  h+='<section class="card"><div class="hd"><h2>Snapshots held</h2><span class="note">last 6 plus the latest of each month since '+esc(qLabel(histStart()))+'</span></div><div class="tw" style="max-height:220px;overflow:auto"><table><thead><tr><th>As on</th><th>Source</th><th class="num">Plants</th><th class="num">Rows</th><th>Ageing</th><th>File</th></tr></thead><tbody>'
   +snapsSorted().map(function(s){return '<tr><td>'+esc(s.as_of)+(s.as_of===sn.as_of?' <span class="pill ok">shown</span>':'')+(s.demo?' <span class="pill part">DEMO</span>':'')+'</td><td>'+esc(s.sys)+'</td><td class="num">'+Object.keys(s.plants||{}).length+'</td><td class="num">'+fmtN(s.loaded)+'</td><td>'+(s.hasAge?'yes':'no')+'</td><td class="break">'+esc(s.file||'')+'</td></tr>'}).join('')+'</tbody></table></div></section>';
  return h;
}
async function loadStockItems(sn,plant){
  var key=sn.as_of+'|'+plant;if(S.inv.items[key]||S.inv.loading===key)return;S.inv.loading=key;
  try{var ps=sn.plants[plant],rows=[],d8=compactYmd(sn.as_of);for(var i=0;i<(ps?ps.chunks:0);i++){var s=await dget('stock/it_'+d8+'_'+plant+'_'+i);if(!s.exists)continue;JSON.parse(await ungz(s.data().z)).forEach(function(r){rows.push(r)})}
    S.inv.items[key]=rows}catch(e){S.inv.items[key]=[];S.err=(S.err||'')+'stock items: '+((e&&e.message)||e)+' '}
  S.inv.loading='';S.lastHtml='';schedule();
}
Object.assign(handlers,{
 'inv-drill':function(t){S.inv.plant=t.getAttribute('data-plant');S.inv.group=t.getAttribute('data-group');S.lastHtml='';schedule();setTimeout(function(){var e=document.getElementById('inv-drill');if(e&&e.scrollIntoView)e.scrollIntoView({block:'nearest'})},300)},
 'inv-close':function(){S.inv.plant='';S.inv.group='';S.lastHtml='';schedule()}
});

/* ---- coverage: the month-end snapshot of each month ---- */
function stockCov(qkey){
  var months=qMonths(qkey),present=0,detail=[],cur=TODAY().slice(0,7);
  months.forEach(function(ym){var have=S.stockSnaps.filter(function(s){return s.as_of.slice(0,7)===ym}).sort(function(a,b){return a.as_of<b.as_of?1:-1});
    detail.push({ym:ym,plants:have.length?Object.keys(have[0].plants||{}).length:0,asof:have.length?have[0].as_of:''});if(have.length)present++});
  var elig=months.filter(function(m){return m<=cur}).length;
  return {st:present===0?'miss':(present>=elig&&elig>0?'ok':'part'),detail:detail,ref:0,closed:!!(S.periods[qkey]&&S.periods[qkey].status==='closed'),stock:true};
}
