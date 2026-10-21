/* ================= v0.9+ Admin masters: item master and sales-employee master (D18, D18 follow-up: B1 name, SlpCode, reports-to, EndDate) ================= */
S.itemMeta=null;S.salesMaster=null;S.mst={items:null,semp:null};
var SM={list:[],byCode:{},byName:{},byBase:{},byB1:{},cache:{},ready:false};
var ZONE_SHEET_RE=/^zone\s*\d/i;
function nameKey(s){return norm(String(s==null?'':s).replace(/\./g,' ').replace(/[^\w\s\-\/&']/g,' ').replace(/\s+/g,' '))}
function splitSuffix(s){s=String(s==null?'':s);var i=s.indexOf(' - ');return i>0?[s.slice(0,i),s.slice(i+3)]:[s,'']}
function roleFromDesignation(d){
  var x=norm(d);if(!x)return '';
  if(/branch (manager|head)|depot manager/.test(x))return 'Branch / depot manager';
  if(/coordinator/.test(x))return 'Coordinator (sales / CRR)';
  if(/area sales manager|\basm\b|\bnbd\b|business development/.test(x))return '';/* no matching role (Q-D11) */
  if(/sale[s]? exec|sales officer|sales representative/.test(x))return 'Sales executive';
  return '';
}
function buildSM(list){
  SM.list=list||[];SM.byCode={};SM.byName={};SM.byBase={};SM.byB1={};SM.cache={};
  SM.list.forEach(function(p){
    SM.byCode[norm(p.code)]=p;if(p.alt&&!SM.byCode[norm(p.alt)])SM.byCode[norm(p.alt)]=p;
    if(p.b1name){var k1=nameKey(p.b1name);(SM.byB1[k1]=SM.byB1[k1]||[]).push(p)}
    var k=nameKey(p.name);(SM.byName[k]=SM.byName[k]||[]).push(p);
    var b=nameKey(splitSuffix(p.name)[0]);if(b!==k)(SM.byBase[b]=SM.byBase[b]||[]).push(p);else(SM.byBase[b]=SM.byBase[b]||[]).push(p);
  });
  SM.ready=SM.list.length>0;
}
/* match a B1 Salesemployee text to the master: exact FullName, then without the " - <branch>" suffix; a duplicate name is settled by the branch suffix or left unmatched */
function spMatch(raw){
  if(!SM.ready||!raw)return null;
  var hit=SM.cache[raw];if(hit!==undefined)return hit;
  var k=nameKey(raw),sp=splitSuffix(raw),base=nameKey(sp[0]),suf=nameKey(sp[1]),res=null,how='';
  var pick=function(arr){
    if(!arr||!arr.length)return null;if(arr.length===1)return arr[0];
    if(suf){var m=arr.filter(function(p){var pn=nameKey(p.plantRaw||'');return pn&&(pn.indexOf(suf)>=0||suf.indexOf(pn)>=0)});if(m.length===1)return m[0]}
    return 'ambiguous';
  };
  var c=pick(SM.byB1[k]);if(c){res=c;how='B1 name column'}
  else if(c=pick(SM.byName[k])){res=c;how='exact'}
  else{c=pick(SM.byName[base]);if(c){res=c;how='suffix removed'}else{c=pick(SM.byBase[base]);if(c){res=c;how='suffix removed'}}}
  if(res==='ambiguous')res={ambiguous:true};else if(res)res=Object.assign({how:how},res);
  SM.cache[raw]=res;return res;
}
function spCanon(raw){var m=spMatch(raw);return m&&!m.ambiguous?m.name:raw}
function spMeta(canonName){var m=SM.byName[nameKey(canonName)];return m&&m.length===1?m[0]:null}
function unmatchedSp(){
  var out=[];Object.keys(DS.spRaw||{}).forEach(function(raw){if(!raw)return;var m=spMatch(raw);if(!m||m.ambiguous)out.push({name:raw,lines:DS.spRaw[raw],why:m&&m.ambiguous?'Several people share this name; the branch suffix does not settle it':'Not in the sales-employee master'})});
  return out.sort(function(a,b){return b.lines-a.lines});
}
function matchStats(){
  var names=Object.keys(DS.spRaw||{}).filter(Boolean),tot=0,mt=0,ln=0,lm=0;
  names.forEach(function(n){var m=spMatch(n),l=DS.spRaw[n];tot++;ln+=l;if(m&&!m.ambiguous){mt++;lm+=l}});
  return {names:tot,matched:mt,lines:ln,linesMatched:lm,rate:tot?mt/tot*100:null,lineRate:ln?lm/ln*100:null};
}
function onSalesMaster(doc){
  if(!doc||!doc.z){S.salesMaster=null;buildSM([]);S.smReady=true;DS.sig='';ingestRoll();return Promise.resolve()}
  return ungz(doc.z).then(function(t){
    var arr=JSON.parse(t).map(function(a){return {code:a[0],name:a[1],zone:a[2],plant:a[3],plantRaw:a[4],designation:a[5],role:a[6],email:a[7],wa:a[8],slp:a[9],b1name:a[10],reportsTo:a[11],ended:a[12],alt:a[13]}});
    S.salesMaster=Object.assign({},doc,{n:arr.length});buildSM(arr);S.smReady=true;
    /* decode again so a Sales executive's rows that only match through the master are kept */
    if(SC().sp)DS.sig='';
    if(DS.ready){rebuildMaps();DS.ver++;DS.cache={};S.lastHtml='';S.engSig=null}
    ingestRoll();schedule();
  }).catch(function(e){S.err=(S.err||'')+'sales master: '+((e&&e.message)||e)+' '});
}

/* ---- reading files ---- */
async function listSheets(file){
  if(/\.(xlsx|xls)$/i.test(file.name)){
    if(typeof XLSX==='undefined')throw new Error('The spreadsheet reader did not load. Check the connection, or save the sheet as CSV.');
    var buf=await file.arrayBuffer();await tick();
    var names=XLSX.read(buf,{type:'array',bookSheets:true}).SheetNames||[];
    return {buf:buf,names:names,csv:false};
  }
  var rows=parseCSV(await file.text());
  return {csvRows:rows,names:['CSV'],csv:true};
}
async function sheetRows(src,name){
  if(src.csv)return src.csvRows;
  await tick();
  var wb=XLSX.read(src.buf,{type:'array',sheets:name,dense:true,cellDates:false,cellNF:false,cellStyles:false,cellFormula:false,cellHTML:false});
  return XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:'',blankrows:false});
}
function cellStr(v){return v==null?'':String(v).trim()}

/* ---- item master ---- */
var ITEM_GROUPS=['Laminate','Door','PVC sheet','Compact board'];
function parseThickness(v){var m=/(\d+(?:\.\d+)?)/.exec(String(v==null?'':v));return m?+m[1]:null}
function normUom(u){var x=cellStr(u).toLowerCase();return x==='pcs'||x==='pc'||x==='nos'?'Pcs':x==='sqm'?'SQM':x==='sqf'||x==='sqft'?'SQF':x==='mtr'||x==='m'?'Mtr':x?cellStr(u):''}
async function itemParse(){
  var st=S.mst.items;st.stage='working';st.msg='Reading the item sheet...';schedule();await tick();
  try{
    var names=st.src.names,pick=names.find(function(n){return /^fg$/i.test(n)})||names.find(function(n){return !/^filter$/i.test(n)})||names[0];
    var rows=await sheetRows(st.src,pick);
    if(!rows.length)throw new Error('The sheet is empty.');
    var hd=rows[0].map(function(x){return norm(x)}),ix=function(n){return hd.indexOf(norm(n))};
    var cCode=ix('Item No.'),cCat=ix('Item Category');
    if(cCode<0||cCat<0)throw new Error('Columns "Item No." and "Item Category" were not found in sheet "'+pick+'". Expected the item master (sheet FG).');
    var cUom=ix('Inventory UoM'),cAct=ix('Active'),cThk=ix('Thickness'),cSize=ix('Size');
    var res={sheet:pick,read:rows.length-1,loaded:0,rejected:0,warned:0,outOfScope:0,byGroup:{},rejects:[],warn:{noSize:0,notPcs:0,dupCode:0},items:[],cats:{}};
    var seen={},T0=Date.now();
    for(var i=1;i<rows.length;i++){
      if(Date.now()-T0>40){T0=Date.now();st.msg='Checking item '+fmtN(i)+' of '+fmtN(rows.length-1);schedule();await tick()}
      var r=rows[i],code=cellStr(r[cCode]).toUpperCase();
      if(!code){res.rejected++;if(res.rejects.length<20000)res.rejects.push([i+1,'','','Item No.','Mandatory field empty','']);continue}
      if(seen[code]){res.rejected++;if(res.rejects.length<20000)res.rejects.push([i+1,code,'','Item No.','Duplicate item code in file','']);continue}
      seen[code]=1;
      var cat=cellStr(r[cCat]),grp=groupOf('B1',cat,'');
      res.cats[cat||'(blank)']=(res.cats[cat||'(blank)']||0)+1;
      if(!grp){res.outOfScope++;continue}
      var size=cSize>=0?cellStr(r[cSize]):'',sq=sqftOf(size,1);
      if(sq==null){res.warn.noSize++;res.warned++;sq=0}
      var uom=cUom>=0?normUom(r[cUom]):'';if(uom&&uom!=='Pcs'){res.warn.notPcs++;res.warned++}
      var thk=cThk>=0?parseThickness(r[cThk]):null,act=cAct>=0?(/^y/i.test(cellStr(r[cAct]))?1:0):1;
      res.items.push([code,ITEM_GROUPS.indexOf(grp),Math.round(sq*1000)/1000,thk,uom,act,size.slice(0,20)]);
      res.byGroup[grp]=(res.byGroup[grp]||0)+1;res.loaded++;
    }
    st.res=res;st.stage='checked';st.msg='';
  }catch(e){st.stage='idle';st.msg='Could not read the file: '+((e&&e.message)||e);st.res=null}
  S.lastHtml='';schedule();
}
async function itemLoad(){
  if(!superOnly('load the item master'))return;
  var st=S.mst.items,r=st.res;if(!r||st.stage!=='checked')return;
  st.stage='loading';st.msg='Writing items...';schedule();await tick();
  var uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),by=whoAmI(),failed=null,chunks=0;
  try{
    var per=3000,n=Math.ceil(r.items.length/per);
    for(var i=0;i<n;i++){var part=r.items.slice(i*per,(i+1)*per);st.msg='Writing chunk '+(i+1)+' of '+n;schedule();
      await dset('items/c'+i,{z:await gz(JSON.stringify(part)),n:part.length,i:i,at:nowISO(),by:by,fmt:'gz-json v1: [code,group 0 Laminate 1 Door 2 PVC sheet 3 Compact board,sqft per sheet,thickness mm,uom,active,size]',demo:st.demo||undefined});chunks++}
    /* remove chunks left over from a longer earlier load */
    var old=(S.itemMeta&&S.itemMeta.chunks)||0;for(var j=n;j<old;j++)await ddel('items/c'+j);
    await dset('itemmeta/main',{at:nowISO(),by:by,file:st.name,sheet:r.sheet,read:r.read,loaded:r.loaded,out_of_scope:r.outOfScope,rejected:r.rejected,warned:r.warned,by_group:r.byGroup,chunks:n,upload:uid,demo:st.demo||undefined});
    await dset('uploads/'+uid,{at:nowISO(),by:by,sys:'B1',entity:'IT',file:st.name,size:st.size||0,mode:'master',periodLabel:'Item master snapshot',read:r.read,loaded:r.loaded,rejected:r.rejected,warned:r.warned,status:r.rejected?'Partial':'Loaded',demo:st.demo||undefined,out_of_scope:{rows:r.outOfScope,value:0}});
    if(r.rejects.length){var rr=r.rejects.slice(0,1500);await dset('rejects/'+uid,{z:await gz(JSON.stringify(rr)),n:rr.length,total:r.rejected,demo:st.demo||undefined})}
    await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:by,event:'item master loaded',rows:r.loaded});
  }catch(e){failed=e}
  st.stage=failed?'checked':'done';st.msg=failed?('Load stopped: '+dbErrText(failed)):('Loaded '+fmtN(r.loaded)+' in-scope items in '+chunks+' document'+(chunks===1?'':'s')+'. '+fmtN(r.outOfScope)+' out-of-scope items were counted, not stored.');
  S.lastHtml='';schedule();
}
function itemsHtml(){
  var st=S.mst.items,m=S.itemMeta,h='<section class="card"><div class="hd"><h2>Item master &middot; '+(m?fmtN(m.loaded)+' items':'not loaded')+'</h2><div class="row"><label class="btn pri sm" for="up-item" style="cursor:pointer">Upload item master (XLSX or CSV)</label><input id="up-item" data-mfile="items" type="file" accept=".xlsx,.xls,.csv" style="position:absolute;opacity:0;width:1px;height:1px"><button class="btn sm" data-act="mst-tmpl" data-t="items">Download template</button></div></div>';
  h+='<p class="note" style="margin:0">Sheet <b>FG</b> of "Item master data" (B1 OITM). The Desk keeps, per in-scope item: code, product group, size in feet and sq ft per sheet, thickness, unit and active flag. Item category decides the group: Decorative laminate(s) → Laminate, "… door" → Door, PVC sheet, Compact board. ACP and other categories are counted and not stored. No descriptions are kept (decision D9: item detail is not needed below the document).</p>';
  if(m)h+='<div class="kpis"><div class="kpi"><small>Items stored</small><b>'+fmtN(m.loaded)+'</b><small>'+Object.keys(m.by_group||{}).map(function(g){return g+' '+fmtN(m.by_group[g])}).join(' · ')+'</small></div><div class="kpi"><small>Out of scope (counted)</small><b>'+fmtN(m.out_of_scope)+'</b></div><div class="kpi"><small>Rejected rows</small><b>'+fmtN(m.rejected)+'</b></div><div class="kpi"><small>Loaded</small><b style="font-size:14px;font-family:var(--font)">'+esc(istStr(m.at))+'</b><small>'+esc((m.by||'').split('@')[0])+' · '+esc(m.file||'')+'</small></div></div>';
  else h+='<div class="empty">No item master yet. Upload the item master workbook.</div>';
  if(st&&st.msg&&st.stage==='idle')h+='<div class="banner err">'+esc(st.msg)+'</div>';
  if(st&&st.stage==='working')h+='<div><div class="bar"><i style="width:60%"></i></div><div class="note">'+esc(st.msg)+'</div></div>';
  if(st&&st.res&&(st.stage==='checked'||st.stage==='loading'||st.stage==='done')){
    var r=st.res;
    h+='<div class="hd"><h2>Check result · '+esc(st.name)+' · sheet '+esc(r.sheet)+'</h2><span class="pill '+(r.rejected?'part':'ok')+'">'+(r.rejected?'Some rows rejected':'All rows pass')+'</span></div>'
     +'<div class="kpis"><div class="kpi"><small>Rows read</small><b>'+fmtN(r.read)+'</b></div><div class="kpi"><small>In scope, loading</small><b>'+fmtN(r.loaded)+'</b></div><div class="kpi"><small>Out of scope</small><b>'+fmtN(r.outOfScope)+'</b></div><div class="kpi"><small>Rows rejected</small><b>'+fmtN(r.rejected)+'</b></div><div class="kpi"><small>Warnings</small><b>'+fmtN(r.warned)+'</b><small>'+r.warn.noSize+' without a readable size · '+r.warn.notPcs+' unit not Pcs</small></div></div>'
     +'<div class="tw"><table><thead><tr><th>Item category (as in the file)</th><th class="num">Items</th><th>Group</th></tr></thead><tbody>'+Object.keys(r.cats).sort(function(a,b){return r.cats[b]-r.cats[a]}).slice(0,30).map(function(c){var g=groupOf('B1',c==='(blank)'?'':c,'');return '<tr><td>'+esc(c)+'</td><td class="num">'+fmtN(r.cats[c])+'</td><td>'+(g?'<span class="pill ok">'+g+'</span>':'<span class="pill mute">out of scope</span>')+'</td></tr>'}).join('')+'</tbody></table></div>';
    if(r.rejected)h+='<div class="tw" style="max-height:240px;overflow:auto"><table><thead><tr><th class="num">Row</th><th>Item</th><th>Field</th><th>Reason</th></tr></thead><tbody>'+r.rejects.slice(0,100).map(function(x){return '<tr><td class="num mono">'+x[0]+'</td><td class="mono">'+esc(x[1])+'</td><td>'+esc(x[3])+'</td><td>'+esc(x[4])+'</td></tr>'}).join('')+'</tbody></table></div><div class="row"><button class="btn sm" data-act="mst-rejcsv" data-k="items">Download rejected rows (CSV)</button></div>';
    if(st.stage==='checked')h+='<div class="row"><button class="btn pri" data-act="mst-item-load"'+(r.loaded>0&&!readOnly()?'':' disabled')+'>Load '+fmtN(r.loaded)+' items</button><button class="btn" data-act="mst-reset" data-k="items">Cancel</button></div>'+(st.msg?'<div class="banner err">'+esc(st.msg)+'</div>':'');
    if(st.stage==='loading')h+='<div><div class="bar"><i style="width:60%"></i></div><div class="note">'+esc(st.msg)+'</div></div>';
    if(st.stage==='done')h+='<div class="banner ok"><span>'+esc(st.msg)+'</span><button class="btn sm" data-act="mst-reset" data-k="items">Upload another file</button></div>';
  }
  return h+'<div id="up-msg"></div></section>';
}

/* ---- sales-employee master ---- */
async function sempPick(file){
  var st={stage:'working',name:file.name,size:file.size,msg:'Reading the workbook...',src:null,sheets:[],res:null};S.mst.semp=st;S.lastHtml='';schedule();
  try{
    var src=await listSheets(file);st.src=src;
    st.sheets=src.names.filter(function(n){return !/^\s*read\s*me\s*$/i.test(n)}).map(function(n){return {name:n,ticked:src.csv||ZONE_SHEET_RE.test(n),zone:ZONE_SHEET_RE.test(n)}});
    st.stage='sheets';st.msg='';
    if(src.csv&&isWorkerCsv(src.csvRows)){S.lastHtml='';schedule();return sempCheck()}
  }catch(e){st.stage='idle';st.msg='Could not read the file: '+((e&&e.message)||e)}
  S.lastHtml='';schedule();
}
function isWorkerCsv(rows){return !!(rows&&rows[0]&&rows[0].some(function(x){return norm(x)==='*workerid'}))}
function waFrom(v){var mob=String(v==null?'':v).replace(/\D/g,'');if(mob.length===10)return '91'+mob;if(mob.length===12&&mob.indexOf('91')===0)return mob;if(mob.length===20)return '91'+mob.slice(0,10);return ''}
/* S/4 workforce layout ("Lam Employee Master"): merge into the loaded master by FullName; keep zone, plant, role, B1 name, reports-to */
async function sempCheckS4(st){
  var rows=st.src.csvRows,hd=rows[0].map(function(x){return norm(x)});
  var hx=function(pre){for(var i=0;i<hd.length;i++)if(hd[i].indexOf(pre)===0)return i;return -1};
  var cW=hx('*workerid'),cFull=hx('fullname'),cFn=hx('*firstname'),cLn=hx('*lastname'),cMail=hx('email'),cPh=hx('phonenumber'),cMob=hx('mobilephonenumber'),cEnd=hx('*enddate');
  var old=SM.list.slice(),oldBy=SM.byName,before=matchStats();
  var res={sheets:['CSV (S/4 workforce layout)'],read:0,loaded:0,rejected:0,warned:0,rejects:[],people:[],byZone:{},byRole:{},unmappedDes:{},warn:{noEmail:0,noPlant:0,badMobile:0,badEmail:0,unknownPlant:0},s4:true,needs:[],merge:{matched:0,added:0,kept:0,ambiguous:0}};
  var seen={},used={},oldToNew={};
  for(var i=1;i<rows.length;i++){
    var r=rows[i],code=cellStr(r[cW]),name=cellStr(cFull>=0?r[cFull]:'')||(cellStr(cFn>=0?r[cFn]:'')+' '+cellStr(cLn>=0?r[cLn]:'')).trim();
    if(!code&&!name)continue;res.read++;
    if(!code){res.rejected++;res.rejects.push([i+1,'','CSV','*WorkerID','Mandatory field empty','']);continue}
    if(!name){res.rejected++;res.rejects.push([i+1,code,'CSV','FullName','Mandatory field empty','']);continue}
    var k=norm(code);if(seen[k]){res.rejected++;res.rejects.push([i+1,code,'CSV','*WorkerID','Duplicate WorkerID (already read at row '+seen[k]+')','']);continue}seen[k]=i+1;
    var mailRaw=cMail>=0?cellStr(r[cMail]).toLowerCase():'',mail='';
    if(!mailRaw)res.warn.noEmail++;else if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailRaw))mail=mailRaw;else{res.warn.badEmail++;res.warned++}
    var wa=waFrom(cPh>=0?r[cPh]:'')||waFrom(cMob>=0?r[cMob]:'');if(!wa&&((cPh>=0&&cellStr(r[cPh]))||(cMob>=0&&cellStr(r[cMob])))){res.warn.badMobile++;res.warned++}
    var ed=cEnd>=0?cellStr(r[cEnd]).replace(/\.0$/,''):'';if(/^9999/.test(ed))ed='';
    var cand=oldBy[nameKey(name)]||[],pick=cand.filter(function(c){return !used[norm(c.code)]});
    var o=null;if(pick.length===1)o=pick[0];else if(pick.length>1){var byMail=mail&&pick.filter(function(c){return c.email===mail});o=byMail&&byMail.length===1?byMail[0]:null;if(!o)res.merge.ambiguous++}
    if(o){used[norm(o.code)]=1;res.merge.matched++;oldToNew[norm(o.code)]=code;
      res.people.push([code,o.name,o.zone,o.plant,o.plantRaw,o.designation,o.role,mail||o.email||'',wa||o.wa||'',o.slp||'',o.b1name||'',o.reportsTo||'',ed||o.ended||'',o.code])}
    else{res.merge.added++;res.needs.push([i+1,code,name,pick.length>1?'Several people in the master share this name; add plant and designation':'New person: needs plant and designation']);
      res.people.push([code,name.slice(0,80),'','','','','',mail,wa,'','','',ed,''])}
  }
  /* people in the master but not in the file are kept as they are */
  old.forEach(function(o){if(used[norm(o.code)])return;res.merge.kept++;res.people.push([o.code,o.name,o.zone,o.plant,o.plantRaw,o.designation,o.role,o.email||'',o.wa||'',o.slp||'',o.b1name||'',o.reportsTo||'',o.ended||'',o.alt||''])});
  res.people.forEach(function(a){if(a[11]&&oldToNew[norm(a[11])])a[11]=oldToNew[norm(a[11])]});
  res.people.forEach(function(a){res.byZone[a[2]||'(none)']=(res.byZone[a[2]||'(none)']||0)+1;res.byRole[a[6]||'(no matching role)']=(res.byRole[a[6]||'(no matching role)']||0)+1});
  res.loaded=res.people.length;res.ended=res.people.filter(function(a){return a[12]}).length;res.warned+=res.needs.length;
  var save=SM.list;buildSM(res.people.map(function(a){return {code:a[0],name:a[1],zone:a[2],plant:a[3],plantRaw:a[4],designation:a[5],role:a[6],email:a[7],wa:a[8],slp:a[9],b1name:a[10],reportsTo:a[11],ended:a[12],alt:a[13]}}));
  DS.cache={};res.match=matchStats();res.unmatched=unmatchedSp();res.matchBefore=before;buildSM(save);
  return res;
}
async function sempCheck(){
  var st=S.mst.semp;st.stage='working';st.msg='Reading the ticked sheets...';schedule();await tick();
  try{
    if(st.src.csv&&isWorkerCsv(st.src.csvRows)){st.res=await sempCheckS4(st);st.stage='checked';st.msg='';DS.cache={};S.lastHtml='';schedule();return}
    var ticked=st.sheets.filter(function(s){return s.ticked}).map(function(s){return s.name});
    if(!ticked.length)throw new Error('Tick at least one sheet.');
    var res={sheets:ticked,read:0,loaded:0,rejected:0,warned:0,rejects:[],people:[],byZone:{},byRole:{},unmappedDes:{},warn:{noEmail:0,noPlant:0,badMobile:0,badEmail:0,unknownPlant:0}};
    var seen={},plantsOk={};S.plants.forEach(function(p){plantsOk[p.plant_code]=p});
    for(var si=0;si<ticked.length;si++){
      var rows=await sheetRows(st.src,ticked[si]);if(!rows.length)continue;
      var hd=rows[0].map(function(x){return norm(x)}),ix=function(n){return hd.indexOf(norm(n))};
      var cCode=ix('Employee Code'),cFull=ix('FullName'),cFn=ix('*FirstName'),cLn=ix('*LastName'),cMob=ix('Mobile No.'),cMail=ix('Email'),cDes=ix('Designation'),cZone=ix('Zone'),cPN=ix('Plant Name'),cCC=ix('*CompanyCode'),cSlp=ix('B1 SlpCode'),cB1=ix('B1 Sales Employee Name'),cRep=ix('Reports To (Employee Code)'),cEnd=Math.max(ix('EndDate'),ix('*EndDate'),ix('End Date'));
      if(cCode<0||(cFull<0&&cFn<0)){res.rejects.push([0,ticked[si],'','Sheet','Sheet "'+ticked[si]+'" has no Employee Code and FullName columns; skipped','']);res.rejected++;continue}
      for(var i=1;i<rows.length;i++){
        var r=rows[i],code=cellStr(r[cCode]);
        if(!code&&!cellStr(cFull>=0?r[cFull]:''))continue;/* blank formatted row */
        res.read++;
        var name=cellStr(cFull>=0?r[cFull]:'')||(cellStr(cFn>=0?r[cFn]:'')+' '+cellStr(cLn>=0?r[cLn]:'')).trim();
        if(!code){res.rejected++;res.rejects.push([i+1,'',ticked[si],'Employee Code','Mandatory field empty','']);continue}
        if(!name){res.rejected++;res.rejects.push([i+1,code,ticked[si],'FullName','Mandatory field empty','']);continue}
        var k=norm(code);if(seen[k]){res.rejected++;res.rejects.push([i+1,code,ticked[si],'Employee Code','Duplicate employee code (already read on sheet '+seen[k]+')','']);continue}
        seen[k]=ticked[si];
        var plant=cCC>=0?cellStr(r[cCC]).replace(/\.0$/,''):'';if(plant&&/^\d{1,4}$/.test(plant))plant=pad(plant,4);
        if(!plant){res.warn.noPlant++;res.warned++}else if(!plantsOk[plant]){res.warn.unknownPlant++;res.warned++;plant=''}
        var zone=cZone>=0?cellStr(r[cZone]):'';if(!zone&&ZONE_SHEET_RE.test(ticked[si]))zone=ticked[si];
        var mailRaw=cMail>=0?cellStr(r[cMail]).toLowerCase():'',mail='';
        if(!mailRaw){res.warn.noEmail++}else if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailRaw))mail=mailRaw;else{res.warn.badEmail++;res.warned++}
        var mob=cMob>=0?String(r[cMob]==null?'':r[cMob]).replace(/\D/g,''):'',wa='';
        if(mob.length===10)wa='91'+mob;else if(mob.length===12&&mob.indexOf('91')===0)wa=mob;else if(mob.length===20)wa='91'+mob.slice(0,10);else if(mob){res.warn.badMobile++;res.warned++}
        var des=cDes>=0?cellStr(r[cDes]):'',role=roleFromDesignation(des);
        if(!role&&des){res.unmappedDes[des]=(res.unmappedDes[des]||0)+1}
        res.byRole[role||'(no matching role)']=(res.byRole[role||'(no matching role)']||0)+1;res.byZone[zone||'(none)']=(res.byZone[zone||'(none)']||0)+1;
        var endD=cEnd>=0?cellStr(r[cEnd]):'';if(endD)res.ended=(res.ended||0)+1;
        res.people.push([code,name.slice(0,80),zone,plant,(cPN>=0?cellStr(r[cPN]):'').slice(0,60),des.slice(0,50),role,mail,wa,(cSlp>=0?cellStr(r[cSlp]):'').replace(/\.0$/,''),(cB1>=0?cellStr(r[cB1]):'').slice(0,100),(cRep>=0?cellStr(r[cRep]):'').replace(/\.0$/,''),endD.slice(0,20)]);res.loaded++;
      }
    }
    /* match B1 names (all names in the loaded sales data) with the people just read */
    var save=SM.list;buildSM(res.people.map(function(a){return {code:a[0],name:a[1],zone:a[2],plant:a[3],plantRaw:a[4],designation:a[5],role:a[6],email:a[7],wa:a[8],slp:a[9],b1name:a[10],reportsTo:a[11],ended:a[12],alt:a[13]}}));
    DS.cache={};res.match=matchStats();res.unmatched=unmatchedSp();
    buildSM(save);/* the live master stays until Load */
    st.res=res;st.stage='checked';st.msg='';
  }catch(e){st.stage='sheets';st.msg='Could not read the sheets: '+((e&&e.message)||e);st.res=null}
  DS.cache={};S.lastHtml='';schedule();
}
async function sempLoad(){
  if(!superOnly('load the sales-employee master'))return;
  var st=S.mst.semp,r=st.res;if(!r||st.stage!=='checked')return;
  st.stage='loading';st.msg='Writing the master...';schedule();await tick();
  var uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),by=whoAmI(),failed=null;
  try{
    await dset('salesmaster/main',{z:await gz(JSON.stringify(r.people)),n:r.people.length,at:nowISO(),by:by,file:st.name,sheets:r.sheets,read:r.read,rejected:r.rejected,upload:uid,demo:st.demo||undefined,fmt:'gz-json v3: [code,name,zone,plant,plantRaw,designation,role,email,whatsapp,slpCode,b1Name,reportsToCode,endDate,altCode]'});
    await dset('uploads/'+uid,{at:nowISO(),by:by,sys:'B1',entity:'SE',file:st.name,size:st.size||0,mode:'master',periodLabel:'Sales employees: '+r.sheets.join(', '),read:r.read,loaded:r.loaded,rejected:r.rejected+r.unmatched.length,warned:r.warned,status:(r.rejected||r.unmatched.length)?'Partial':'Loaded',demo:st.demo||undefined,match:{names:r.match.names,matched:r.match.matched,rate:r.match.rate}});
    var rows=[];r.rejects.forEach(function(x){rows.push(x)});r.unmatched.forEach(function(u,i){rows.push([i+1,u.name,'','Salesperson (B1 name)',u.why,u.lines])});(r.needs||[]).forEach(function(n){rows.push([n[0],n[1],'CSV','Plant and designation',n[3],n[2]])});
    if(rows.length){var rr=rows.slice(0,1500);await dset('rejects/'+uid,{z:await gz(JSON.stringify(rr)),n:rr.length,total:rows.length,demo:st.demo||undefined})}
    if(r.unmatched.length&&S.users.length){
      var id='R8_'+uid,now=nowISO(),a={id:id,ref:hashRef(id),rule:'R8',title:'Match '+r.unmatched.length+' salesperson name'+(r.unmatched.length>1?'s':'')+' to the sales-employee master',source:{label:'Rule R8 · Admin › Sales employees · '+r.unmatched.length+' unmatched B1 names',page:'admin'},owner:by,assigner:'Desk rule R8',creator:'Desk rule R8',department:'HO',plant:'',group:'',customer:'',
        due:addWD(TODAY(),1),next_step:'Open Admin › Sales employees, download the unmatched list, and add or correct those people in the master (or fix the name in SAP), then upload the master again.',value:0,status:'Open',created:now,updated:now,dependents:0,period:uid,meta:{unmatched:r.unmatched.length},need_help:false,demo:st.demo||undefined,thread:[{at:now,by:'Desk rule R8',kind:'created',text:'Created after the sales-employee master upload '+uid+'.'}]};
      await dset('actions/'+id,a);
    }
    var byCode={};r.people.forEach(function(p){byCode[norm(p[0])]=p;if(p[13])byCode[norm(p[13])]=p});var filled=0;
    for(var ui=0;ui<S.users.length;ui++){var uu=S.users[ui];if(uu.reports_to_email||uu.pseudo)continue;
      var pp=r.people.find(function(p){return (p[7]&&p[7]===uu.email)||(uu.sales_employee_code&&(norm(uu.sales_employee_code)===norm(p[0])||norm(uu.sales_employee_code)===norm(p[13]||'~')))});
      var mg=pp&&pp[11]?byCode[norm(pp[11])]:null;
      if(mg&&mg[7]&&mg[7]!==uu.email){var ud=Object.assign({},uu,{reports_to_email:mg[7],slp_code:pp[9]||uu.slp_code||'',reports_to_code:pp[11]});delete ud._id;await dset('users/'+uu._id,ud);filled++}}
    await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:by,event:'sales-employee master loaded',users_reports_to_filled:filled,rows:r.loaded,unmatched:r.unmatched.length});
  }catch(e){failed=e}
  st.stage=failed?'checked':'done';st.msg=failed?('Load stopped: '+dbErrText(failed)):('Loaded '+fmtN(r.loaded)+' people. '+(r.match.rate!=null?'Matched '+r.match.matched+' of '+r.match.names+' salesperson names in the sales data ('+r.match.rate.toFixed(1)+'%).':'No sales data to match yet.'));
  S.lastHtml='';schedule();
}
function sempHtml(){
  var st=S.mst.semp,m=S.salesMaster,h='<section class="card"><div class="hd"><h2>Sales employees &middot; '+(m?fmtN(m.n)+' people':'not loaded')+'</h2><div class="row"><label class="btn pri sm" for="up-semp" style="cursor:pointer">Upload sales-employee master (XLSX or CSV)</label><input id="up-semp" data-mfile="semp" type="file" accept=".xlsx,.xls,.csv" style="position:absolute;opacity:0;width:1px;height:1px"><button class="btn sm" data-act="mst-tmpl" data-t="semp">Download template</button></div></div>';
  h+='<p class="note" style="margin:0"><b>S/4 workforce CSV</b> ("Lam Employee Master", *WorkerID header): upload it alone, no sheets to tick. It merges into the loaded master by FullName and adds new people. Otherwise, workbook "Sales Employee Master": the zone sheets (ZONE 1 to ZONE 5) hold the laminate staff and are ticked by default; the product-line sheets (ACP, ALU, PVC, MDF, TAS IND, TAS ALU) repeat one zone-head row, and Plant is a plant list. Each person is linked to a plant and zone. B1 sales rows carry a name only, so names are matched to <b>FullName</b>, first exactly, then without the " - &lt;branch&gt;" suffix; a name shared by two people is matched only when the branch suffix settles it.</p>';
  if(m){var ms=matchStats();h+='<div class="kpis"><div class="kpi"><small>People in the master</small><b>'+fmtN(m.n)+'</b><small>'+esc((m.sheets||[]).join(', '))+'</small></div><div class="kpi"><small>B1 names matched</small><b>'+(ms.rate!=null?ms.matched+' / '+ms.names:'—')+'</b><small>'+(ms.rate!=null?ms.rate.toFixed(1)+'% of names · '+(ms.lineRate||0).toFixed(1)+'% of invoice lines':'no sales data yet')+'</small></div><div class="kpi"><small>Loaded</small><b style="font-size:14px;font-family:var(--font)">'+esc(istStr(m.at))+'</b><small>'+esc((m.by||'').split('@')[0])+' · '+esc(m.file||'')+'</small></div></div>';
    var um=unmatchedSp();
    if(um.length)h+='<details class="strip" open><summary>Unmatched B1 salesperson names · '+um.length+'</summary><div class="tw" style="max-height:260px;overflow:auto"><table><thead><tr><th>Name in the sales data</th><th class="num">Invoice lines</th><th>Why</th></tr></thead><tbody>'+um.slice(0,200).map(function(u){return '<tr><td class="break">'+esc(u.name)+'</td><td class="num">'+fmtN(u.lines)+'</td><td>'+esc(u.why)+'</td></tr>'}).join('')+'</tbody></table></div><div class="row"><button class="btn sm" data-act="mst-unmatched-csv">Download unmatched list (CSV)</button></div><p class="note">Unmatched names keep their own name in every figure; nothing is dropped. The uploader gets action R8 to fix them.</p></details>';
  }else h+='<div class="empty">No sales-employee master yet. Upload the workbook.</div>';
  if(st&&st.msg&&(st.stage==='idle'||st.stage==='sheets'))h+='<div class="banner err">'+esc(st.msg)+'</div>';
  if(st&&st.stage==='working')h+='<div><div class="bar"><i style="width:60%"></i></div><div class="note">'+esc(st.msg)+'</div></div>';
  if(st&&st.stage==='sheets')h+='<div class="hd"><h2>Choose the sheets · '+esc(st.name)+'</h2></div><div class="row">'+st.sheets.map(function(s,i){return '<label class="chip"><input type="checkbox" data-chg="mst-sheet" data-i="'+i+'" '+(s.ticked?'checked':'')+'> '+esc(s.name)+(s.zone?'':' <span class="note">(not laminates)</span>')+'</label>'}).join('')+'</div><div class="row"><button class="btn pri" data-act="mst-semp-check">Read the ticked sheets</button><button class="btn" data-act="mst-reset" data-k="semp">Cancel</button></div>';
  if(st&&st.res&&(st.stage==='checked'||st.stage==='loading'||st.stage==='done')){
    var r=st.res;
    h+='<div class="hd"><h2>Check result · '+esc(st.name)+'</h2><span class="pill '+(r.rejected?'part':'ok')+'">'+(r.rejected?'Some rows rejected':'All rows pass')+'</span></div>'
     +'<div class="kpis"><div class="kpi"><small>People read</small><b>'+fmtN(r.read)+'</b><small>sheets '+esc(r.sheets.join(', '))+'</small></div><div class="kpi"><small>Loading</small><b>'+fmtN(r.loaded)+'</b></div><div class="kpi"><small>Rows rejected</small><b>'+fmtN(r.rejected)+'</b></div><div class="kpi"><small>Warnings</small><b>'+fmtN(r.warned)+'</b><small>'+(r.ended?r.ended+' with an end date (inactive, still matched) · ':'')+r.warn.noPlant+' no plant · '+r.warn.unknownPlant+' plant not in master · '+r.warn.noEmail+' no email · '+r.warn.badMobile+' mobile not 10 digits</small></div>'
     +'<div class="kpi"><small>Match rate to B1 names</small><b>'+(r.match.rate!=null?r.match.rate.toFixed(1)+'%':'—')+'</b><small>'+(r.match.rate!=null?r.match.matched+' of '+r.match.names+' names · '+(r.match.lineRate||0).toFixed(1)+'% of invoice lines':'no sales data loaded to match against')+(r.matchBefore&&r.matchBefore.rate!=null?' · before this file: '+r.matchBefore.rate.toFixed(1)+'% ('+r.matchBefore.matched+' of '+r.matchBefore.names+')':'')+'</small></div></div>'+(r.s4?'<div class="banner info"><span>S/4 workforce layout merged into the loaded master by FullName: <b>'+r.merge.matched+'</b> matched (zone, plant, role, B1 name and reports-to kept; WorkerID is the new code, the old code is kept as alt code; email and phone updated) · <b>'+r.merge.added+'</b> new people · <b>'+r.merge.kept+'</b> in the master but not in this file, kept as they are.</span></div>':'')
     +'<div class="grid2"><div class="tw"><table><thead><tr><th>Zone</th><th class="num">People</th></tr></thead><tbody>'+Object.keys(r.byZone).sort().map(function(z){return '<tr><td>'+esc(z)+'</td><td class="num">'+fmtN(r.byZone[z])+'</td></tr>'}).join('')+'</tbody></table></div><div class="tw"><table><thead><tr><th>Desk role proposed from designation (Assumed)</th><th class="num">People</th></tr></thead><tbody>'+Object.keys(r.byRole).sort().map(function(z){return '<tr><td>'+esc(z)+'</td><td class="num">'+fmtN(r.byRole[z])+'</td></tr>'}).join('')+'</tbody></table></div></div>';
    if(Object.keys(r.unmappedDes).length)h+='<p class="note">Designations with no matching Desk role (set the role in Users when the person needs access): '+Object.keys(r.unmappedDes).map(function(d){return esc(d)+' ('+r.unmappedDes[d]+')'}).join(', ')+'.</p>';
    if(r.needs&&r.needs.length)h+='<details class="strip" open><summary>New people · needs plant and designation · '+r.needs.length+'</summary><div class="tw" style="max-height:220px;overflow:auto"><table><thead><tr><th class="num">Row</th><th>WorkerID</th><th>Name</th><th>Note</th></tr></thead><tbody>'+r.needs.slice(0,200).map(function(x){return '<tr><td class="num mono">'+x[0]+'</td><td class="mono">'+esc(x[1])+'</td><td>'+esc(x[2])+'</td><td>'+esc(x[3])+'</td></tr>'}).join('')+'</tbody></table></div><div class="row"><button class="btn sm" data-act="mst-needs-csv">Download this list (CSV)</button></div><p class="note">They load with a blank zone, plant and role. Add those in a later upload of the zone workbook (same names merge) or set the role in Users.</p></details>';
    if(r.rejected)h+='<div class="tw" style="max-height:220px;overflow:auto"><table><thead><tr><th class="num">Row</th><th>Code</th><th>Sheet</th><th>Field</th><th>Reason</th></tr></thead><tbody>'+r.rejects.slice(0,100).map(function(x){return '<tr><td class="num mono">'+x[0]+'</td><td class="mono">'+esc(x[1])+'</td><td>'+esc(x[2])+'</td><td>'+esc(x[3])+'</td><td>'+esc(x[4])+'</td></tr>'}).join('')+'</tbody></table></div>';
    if(r.unmatched.length)h+='<details class="strip"><summary>Unmatched B1 salesperson names · '+r.unmatched.length+'</summary><div class="tw" style="max-height:220px;overflow:auto"><table><thead><tr><th>Name in the sales data</th><th class="num">Invoice lines</th><th>Why</th></tr></thead><tbody>'+r.unmatched.slice(0,100).map(function(u){return '<tr><td class="break">'+esc(u.name)+'</td><td class="num">'+fmtN(u.lines)+'</td><td>'+esc(u.why)+'</td></tr>'}).join('')+'</tbody></table></div></details>';
    if(st.stage==='checked')h+='<div class="row"><button class="btn pri" data-act="mst-semp-load"'+(r.loaded>0&&!readOnly()?'':' disabled')+'>Load '+fmtN(r.loaded)+' people</button><button class="btn" data-act="mst-reset" data-k="semp">Cancel</button></div>'+(st.msg?'<div class="banner err">'+esc(st.msg)+'</div>':'');
    if(st.stage==='loading')h+='<div><div class="bar"><i style="width:60%"></i></div><div class="note">'+esc(st.msg)+'</div></div>';
    if(st.stage==='done')h+='<div class="banner ok"><span>'+esc(st.msg)+'</span><button class="btn sm" data-act="mst-reset" data-k="semp">Upload another file</button></div>';
  }
  return h+'<div id="up-msg"></div></section>';
}
Object.assign(handlers,{
 'mst-reset':function(t){S.mst[t.getAttribute('data-k')]=null;S.lastHtml='';schedule()},
 'mst-item-load':function(){return itemLoad()},
 'mst-semp-check':function(){return sempCheck()},
 'mst-semp-load':function(){return sempLoad()},
 'mst-tmpl':function(t){var k=t.getAttribute('data-t');return download(k==='items'?'item-master-template.csv':'sales-employee-template.csv',(k==='items'?'Item No.,Item Description,Inventory UoM,Active,Thickness,Size,Item Category':'Employee Code,*FirstName,*LastName,FullName,Mobile No.,Email,Designation,Zone,Plant Name,*CompanyCode,B1 SlpCode,B1 Sales Employee Name,Reports To (Employee Code),EndDate')+'\n')},
 'mst-rejcsv':function(t){var st=S.mst[t.getAttribute('data-k')];return download('rejected-rows.csv',csvLine(['row','code','','field','reason','value'])+'\n'+st.res.rejects.map(csvLine).join('\n'))},
 'mst-needs-csv':function(){var st=S.mst.semp;return download('people-needing-plant-and-designation.csv',csvLine(['row','worker_id','full_name','note'])+'\n'+(st.res.needs||[]).map(function(x){return csvLine([x[0],x[1],x[2],x[3]])}).join('\n'))},
 'mst-unmatched-csv':function(){return download('unmatched-salespeople.csv',csvLine(['b1_salesperson_name','invoice_lines','reason'])+'\n'+unmatchedSp().map(function(u){return csvLine([u.name,u.lines,u.why])}).join('\n'))}
});
document.addEventListener('change',function(ev){
  var t=ev.target;if(!t.getAttribute)return;
  var mf=t.getAttribute('data-mfile');
  if(mf){var f=t.files&&t.files[0];if(!f)return;
    if(readOnly()||effRole()!=='Super admin'){toast('Only a Super admin can upload masters');return}
    if(mf==='items'){S.mst.items={stage:'working',name:f.name,size:f.size,msg:'Reading the workbook...',src:null,res:null};S.lastHtml='';schedule();listSheets(f).then(function(src){S.mst.items.src=src;return itemParse()}).catch(function(e){S.mst.items={stage:'idle',msg:'Could not read the file: '+((e&&e.message)||e)};schedule()})}
    else sempPick(f);
    t.value='';return}
  if(t.getAttribute('data-chg')==='mst-sheet'){var st=S.mst.semp;if(st&&st.sheets[+t.getAttribute('data-i')])st.sheets[+t.getAttribute('data-i')].ticked=t.checked}
});
