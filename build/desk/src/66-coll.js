/* ================= Collections intake: B1 "Incoming Payment Report" (D38, Vijay, 23 Oct 2026) =================
 * One file spans many months. A collection is a DOCTYPE C row (customer receipt); A (account) and S (supplier) rows are skipped and counted.
 * amount = CHECKSUM + TRANSFERSUM + CASHSUM. DOCDATE is dd/mm/yyyy text and is never swapped.
 * Stored in collections/{plant}-{ym}: {plant, ym, total, n, rows:[[doc, day, cust, amount, name]], z (gzip of all rows when too many), plan, upload}. */
var COLL_FIELDS=[
 {k:'branch',label:'Branch',canon:'plant_code',req:1,c:['BRANCHNAME','Branch Name','Branch']},
 {k:'doc',label:'Receipt number',canon:'source_doc_no',req:1,c:['DOCNUM','Doc Num','DocNum']},
 {k:'date',label:'Receipt date',canon:'doc_date',req:1,c:['DOCDATE','Doc Date','DocDate']},
 {k:'type',label:'Document type (C customer, A account, S supplier)',canon:'doc_type',req:1,c:['DOCTYPE','Doc Type']},
 {k:'cust',label:'Customer code',canon:'customer_code',req:1,c:['CARDCODE','Card Code','CardCode']},
 {k:'name',label:'Customer name',canon:'customer_name',c:['CARDNAME','Card Name','CardName']},
 {k:'chk',label:'Cheque amount',canon:'check_sum',c:['CHECKSUM','Check Sum','CheckSum']},
 {k:'trf',label:'Bank transfer amount',canon:'transfer_sum',c:['TRANSFERSUM','Transfer Sum','TrsfrSum']},
 {k:'cash',label:'Cash amount',canon:'cash_sum',c:['CASHSUM','Cash Sum','CashSum']},
 {k:'means',label:'Payment means',canon:'payment_means',c:['PAYMENTMEANS','Payment Means']}];
function collDetect(headers){
  var set={};headers.forEach(function(h){set[norm(h)]=1});
  return set['branchname']&&set['docnum']&&set['docdate']&&set['doctype']&&set['cardcode']&&(set['checksum']||set['transfersum']||set['cashsum'])?{kind:'coll',sys:'B1'}:null;
}
function collDefaultMap(headers){var ix=headerIndex(headers),m={};COLL_FIELDS.forEach(function(f){m[f.k]=-1;for(var i=0;i<f.c.length;i++){var k=norm(f.c[i]);if(k in ix){m[f.k]=ix[k];break}}});return m}
function periodFromName(name){var m=/(20\d{2}-\d{2}-\d{2})[_ \-]*to[_ \-]*(20\d{2}-\d{2}-\d{2})/i.exec(String(name||''));return m?{from:m[1],to:m[2]}:null}
function collStart(file,rows,headers,sheetPicked){
  var mode=U.mode;U=newU();U.mode=mode;U.kind='coll';U.entity='CL';U.name=file.name;U.size=file.size;U.headers=headers;U.rows=rows.slice(1);U.sys='B1';U.sheetPicked=sheetPicked;
  U.map=collDefaultMap(headers);
  var sv=S.mappings['B1_collection'];if(sv&&sv.map){var ix=headerIndex(headers),used=false;Object.keys(sv.map).forEach(function(k){var n=norm(sv.map[k]);if(sv.map[k]===null||sv.map[k]===''){U.map[k]=-1;used=true}else if(n in ix){U.map[k]=ix[n];used=true}});U.savedMap=used}
  U.period=periodFromName(file.name);
  U.stage='mapping';renderUpload();
}
function parseColDate(v){
  /* as written: text dd/mm/yyyy (day first), ISO text, an Excel serial or a Date. Never swapped. */
  if(v==null||v==='')return null;
  var d=parseDateCell(v);return d&&validYMD(d)?d:null;
}
async function collParse(){
  var map=U.map,rows=U.rows,col=function(k){return map[k]==null?-1:map[k]},cB=col('branch'),cD=col('doc'),cT=col('date'),cTy=col('type'),cC=col('cust'),cN=col('name'),cK=col('chk'),cF=col('trf'),cH=col('cash');
  var resolve=plantResolver(),per=U.period,today=TODAY(),lo=histLoYm();
  var res={read:rows.length,good:0,rejected:0,rejects:[],reasons:{},period:per,notCust:{A:{rows:0,value:0},S:{rows:0,value:0},other:{rows:0,value:0}},acp:{rows:0,value:0,plants:{}},preHist:{rows:0,value:0},zero:0,unknownBranch:{},months:{},pm:new Map(),minDate:null,maxDate:null,total:0,custRows:0,custValue:0};
  var rej=function(i,doc,field,reason,val){res.rejected++;res.reasons[reason]=(res.reasons[reason]||0)+1;if(res.rejects.length<20000)res.rejects.push([i+2,doc,'',field,reason,val==null?'':val])};
  var T0=Date.now();
  for(var i=0;i<rows.length;i++){
    if(Date.now()-T0>40){T0=Date.now();U.progress=Math.round(i/rows.length*100);U.progressMsg='Checking row '+fmtN(i)+' of '+fmtN(rows.length);var bar=$('#i-upload .bar i');if(bar)bar.style.width=U.progress+'%';await tick()}
    var r=rows[i],ty=String(r[cTy]==null?'':r[cTy]).trim().toUpperCase();
    var amt=0,ok=false;[cK,cF,cH].forEach(function(c){if(c>=0){var v=toNum(r[c]);if(!isNaN(v)){amt+=v;ok=true}}});
    if(ty!=='C'){var k=ty==='A'||ty==='S'?ty:'other';res.notCust[k].rows++;res.notCust[k].value+=ok?amt:0;continue}
    var doc=String(r[cD]==null?'':r[cD]).trim().replace(/\.0$/,'');
    if(!doc){rej(i,'','Receipt number','Receipt number is empty','');continue}
    if(!ok){rej(i,doc,'Amount','No amount in cheque, transfer or cash columns','');continue}
    if(amt<0){rej(i,doc,'Amount','Negative receipt amount',amt);continue}
    var dt=parseColDate(r[cT]);if(!dt){rej(i,doc,'Receipt date','Date not readable',r[cT]);continue}
    var ym=dt.y+'-'+pad(dt.m),iso=ym+'-'+pad(dt.d);
    if(!res.minDate||iso<res.minDate)res.minDate=iso;if(!res.maxDate||iso>res.maxDate)res.maxDate=iso;
    if(iso>today){rej(i,doc,'Receipt date','Date in the future',iso);continue}
    if(per&&(iso<per.from||iso>per.to)){rej(i,doc,'Receipt date','Date outside the period in the file name ('+per.from+' to '+per.to+')',iso);continue}
    var bn=String(r[cB]==null?'':r[cB]).trim(),pl=resolve('B1',bn);
    if(!pl){var k2=bn||'(blank)';res.unknownBranch[k2]=(res.unknownBranch[k2]||0)+1;rej(i,doc,'Branch','Unknown plant or branch',bn);continue}
    if(pl.business==='ACP'||+pl.plant_code>=1050){res.acp.rows++;res.acp.value+=amt;res.acp.plants[pl.plant_code]=1;continue}
    if(pl.active===false){rej(i,doc,'Plant','Plant is switched off in Admin',pl.plant_code);continue}
    if(ym<lo){res.preHist.rows++;res.preHist.value+=amt;continue}
    if(amt===0){res.zero++;continue}
    var key=pl.plant_code+'|'+ym,P=res.pm.get(key);if(!P){P={plant:pl.plant_code,ym:ym,rows:[],total:0};res.pm.set(key,P)}
    var cust=String(r[cC]==null?'':r[cC]).trim(),nm=cN>=0?String(r[cN]==null?'':r[cN]).trim().slice(0,30):'';
    P.rows.push([doc,dt.d,cust,Math.round(amt*100)/100,nm]);P.total+=amt;res.good++;res.custRows++;res.custValue+=amt;
    var M=res.months[ym]||(res.months[ym]={rows:0,value:0,plants:new Set()});M.rows++;M.value+=amt;M.plants.add(pl.plant_code);
  }
  return res;
}
function collReplaceRisk(res){
  var out={},list=[];
  res.pm.forEach(function(P){var old=S.coll.find(function(d){return d._id===P.plant+'-'+P.ym});if(!old||old.demo)return;var on=old.n||(old.rows||[]).length;
    if(on>P.rows.length){var o=out[P.ym]||(out[P.ym]={ym:P.ym,plants:0,oldRows:0,newRows:0});o.plants++;o.oldRows+=on;o.newRows+=P.rows.length}});
  Object.keys(out).sort().forEach(function(k){list.push(out[k])});return list;
}
function collCanLoad(){var r=U&&U.res;if(!r||!(r.good>0))return false;if(collReplaceRisk(r).length&&!U.confirmReplace)return false;return true}
function collRender(){
  var el=$('#i-upload');if(!el)return;var st=U.stage,locked=st==='validating'||st==='loading';
  var stepIdx={mapping:2,validating:3,validated:3,loading:4,done:4}[st]||1;
  var steps=['Upload','Confirm mapping','Validate','Load'].map(function(s,i){return '<span class="'+(i+1<stepIdx?'ok':i+1===stepIdx?'on':'')+'">'+(i+1)+' '+s+'</span>'}).join('');
  var h='<div class="hd"><h2>Upload a SAP export &middot; Collections</h2><div class="steps">'+steps+'</div></div>';
  h+='<div class="banner info"><span><b>'+esc(U.name)+'</b> &middot; '+fmtN(U.rows.length)+' data rows &middot; '+U.headers.length+' columns &middot; detected <b>B1 Incoming Payment Report</b>'+(U.savedMap?' &middot; saved mapping applied':'')+'</span><button class="btn sm" data-act="u-reset" '+(locked?'disabled':'')+'>Choose another file</button></div>';
  h+='<div class="note">'+(U.period?'Period in the file name: <b>'+esc(U.period.from)+' to '+esc(U.period.to)+'</b>. ':'No period in the file name. ')+'Receipt dates are read as dd/mm/yyyy and never swapped.</div>';
  if(st==='mapping'){
    var rows=COLL_FIELDS.map(function(f){var cur=U.map[f.k];if(cur==null)cur=-1;
      var opts='<option value="-1"'+(cur<0?' selected':'')+'>unmapped</option>'+U.headers.map(function(hd,i){return '<option value="'+i+'"'+(cur===i?' selected':'')+'>'+esc(hd===''?'(blank header, col '+(i+1)+')':hd)+'</option>'}).join('');
      var sample='';if(cur>=0){for(var r=0;r<Math.min(U.rows.length,50);r++){var v=U.rows[r][cur];if(v!==''&&v!=null){sample=String(v);break}}}
      return '<tr><td><select class="in" data-chg="coll-map" data-k="'+f.k+'" aria-label="File column for '+esc(f.label)+'">'+opts+'</select></td><td><b>'+esc(f.label)+'</b><div class="note mono">'+f.canon+'</div></td><td>'+(f.req?'<span class="pill info">Required</span>':'<span class="pill mute">Optional</span>')+'</td><td class="mono break" style="max-width:180px">'+esc(sample.slice(0,60))+'</td></tr>'}).join('');
    var miss=COLL_FIELDS.filter(function(f){return f.req&&(U.map[f.k]==null||U.map[f.k]<0)}).map(function(f){return f.label});
    if(U.map.chk<0&&U.map.trf<0&&U.map.cash<0)miss.push('at least one amount column');
    h+='<div class="hd"><h2>Confirm column mapping</h2><span class="note">A collection is a customer-receipt row (type C); amount = cheque + transfer + cash.</span></div><div class="tw"><table><thead><tr><th>File column</th><th>Canonical field</th><th>Need</th><th>Sample</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
     +(miss.length?'<div class="banner err">Map these first: '+esc(miss.join(', '))+'</div>':'')+'<div class="row"><button class="btn pri" data-act="coll-validate" '+(miss.length?'disabled':'')+'>Confirm and validate</button></div>';
  }
  if(st==='validating')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='validated'||st==='loading'||st==='done')h+=collResultHtml(st!=='validated');
  if(st==='loading')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='done')h+='<div class="banner '+(U.doneOk?'ok':'warn')+'"><span>'+esc(U.doneMsg)+'</span><button class="btn sm" data-act="u-reset">Upload another file</button></div>';
  if(U.msg)h+='<div class="banner err">'+esc(U.msg)+'</div>';
  el.innerHTML=h;
}
function collResultHtml(locked){
  var r=U.res;if(!r)return '';
  var h='<div class="hd"><h2>Validation result</h2><span class="pill '+(r.rejected?'part':'ok')+'">'+(r.rejected?fmtN(r.rejected)+' rows will be skipped':'All rows pass')+'</span></div>'
   +'<div class="kpis"><div class="kpi"><small>Rows read</small><b>'+fmtN(r.read)+'</b></div><div class="kpi"><small>Customer receipts loading</small><b>'+fmtN(r.good)+'</b><small>'+fmtMoney(r.custValue)+'</small></div><div class="kpi"><small>Rows skipped (rejected)</small><b>'+fmtN(r.rejected)+'</b></div><div class="kpi"><small>Not customer receipts (A, S)</small><b>'+fmtN(r.notCust.A.rows+r.notCust.S.rows+r.notCust.other.rows)+'</b></div><div class="kpi"><small>ACP plants (out of scope)</small><b>'+fmtN(r.acp.rows)+'</b><small>'+fmtMoney(r.acp.value)+'</small></div><div class="kpi"><small>Plant-months to write</small><b>'+fmtN(r.pm.size)+'</b></div></div>';
  var it=[];
  it.push({st:'info',t:'File layout',n:null,d:esc('B1 Incoming Payment Report, '+fmtN(r.read)+' rows. Dates run '+(r.minDate||'-')+' to '+(r.maxDate||'-')+', read as dd/mm/yyyy, never swapped.')});
  it.push({st:'info',t:'Not customer receipts, skipped and counted',n:r.notCust.A.rows+r.notCust.S.rows+r.notCust.other.rows,d:esc('Account (A) '+fmtN(r.notCust.A.rows)+' rows '+fmtMoney(r.notCust.A.value)+'; supplier (S) '+fmtN(r.notCust.S.rows)+' rows '+fmtMoney(r.notCust.S.value)+(r.notCust.other.rows?'; other type '+fmtN(r.notCust.other.rows):'')+'. Only DOCTYPE C counts as a collection.')});
  if(r.acp.rows)it.push({st:'info',t:'ACP plants skipped (not part of this Desk)',n:r.acp.rows,d:esc(Object.keys(r.acp.plants).length+' plants, '+fmtMoney(r.acp.value)+'.')});
  if(r.preHist.rows)it.push({st:'info',t:'Before history start ('+qLabel(histStart())+')',n:r.preHist.rows,d:'Not loaded and not rejected; no action needed (D28).'});
  if(r.zero)it.push({st:'info',t:'Zero-amount receipts skipped',n:r.zero,d:''});
  var ub=Object.keys(r.unknownBranch);
  if(ub.length)it.push({st:'need',t:'Branches not in the plant master (rows skipped)',n:ub.reduce(function(a,k){return a+r.unknownBranch[k]},0),d:esc(ub.slice(0,8).join(', ')+(ub.length>8?' and '+(ub.length-8)+' more':''))+'. Add the plant, or its B1 branch name, in Admin › Plants, then load again.'});
  var rep=collReplaceRisk(r);
  var ms=Object.keys(r.months).sort();
  h+=fixesPanel(it,'Fixes applied');
  h+='<div class="tw hscroll" style="max-height:260px;overflow:auto"><table><thead><tr><th>Month</th><th class="num">Receipts</th><th class="num">Plants</th><th class="num">Amount</th></tr></thead><tbody>'+ms.map(function(m){var M=r.months[m];return '<tr><td>'+esc(ymLabel(m))+'</td><td class="num">'+fmtN(M.rows)+'</td><td class="num">'+M.plants.size+'</td><td class="num">'+fmtMoney(M.value)+'</td></tr>'}).join('')+'</tbody></table></div>';
  if(rep.length)h+='<div class="banner warn" style="display:block"><b>Safety check stopped this file: it would replace '+rep.reduce(function(a,x){return a+x.plants},0)+' plant-months that hold more receipts than the new data.</b> Replaced data cannot be restored by the Desk.<div class="tw hscroll" style="max-height:180px;overflow:auto"><table><thead><tr><th>Month</th><th class="num">Plant-months</th><th class="num">Receipts held now</th><th class="num">In this file</th></tr></thead><tbody>'+rep.map(function(x){return '<tr><td>'+esc(ymLabel(x.ym))+'</td><td class="num">'+x.plants+'</td><td class="num">'+fmtN(x.oldRows)+'</td><td class="num">'+fmtN(x.newRows)+'</td></tr>'}).join('')+'</tbody></table></div><label class="chip" style="margin-top:8px"><input type="checkbox" data-chg="coll-confrep" '+(U.confirmReplace?'checked':'')+' '+(locked?'disabled':'')+'> I confirm: replace these months ('+rep.map(function(x){return ymLabel(x.ym)}).join(', ')+')</label></div>';
  h+='<div class="row"><button class="btn pri" data-act="coll-load" '+(collCanLoad()&&!locked?'':'disabled')+'>Load '+fmtN(r.good)+' receipts</button>'+(r.rejected?'<button class="btn" data-act="u-rejcsv-coll">Download skipped rows (CSV)</button>':'')+(locked?'':'<button class="btn" data-act="u-reset">Cancel upload</button>')+'</div>';
  return h;
}
async function collValidate(){
  U.stage='validating';U.progress=0;U.progressMsg='Starting...';U.confirmReplace=false;collRender();await tick();
  try{U.res=await collParse();U.stage='validated'}catch(e){U.stage='mapping';U.msg='Could not check the file: '+((e&&e.message)||e)}
  collRender();
}
async function collLoad(){
  if(!superOnly('load collections')||!U||!U.res||!collCanLoad())return;
  var r=U.res,uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),by=whoAmI(),failed=null,demo=!!U.demoFlag,done=0,total=r.pm.size;
  U.stage='loading';U.progressMsg='Writing...';collRender();await tick();
  var list=Array.from(r.pm.values()).sort(function(a,b){return a.ym<b.ym?-1:a.ym>b.ym?1:a.plant<b.plant?-1:1}),q=list.slice(),atNow=nowISO(),B=bkNew(uid,'CL',demo);
  try{
    await Promise.all([0,1,2,3].map(async function(){
      while(q.length){var P=q.shift(),old=S.coll.find(function(d){return d._id===P.plant+'-'+P.ym});
        var doc={plant:P.plant,ym:P.ym,total:Math.round(P.total*100)/100,n:P.rows.length,sys:'B1',src:'RCT',upload:uid,at:atNow,demo:demo||undefined};
        if(old&&old.plan!=null)doc.plan=old.plan;
        if(old&&(old.n||0)>0){bkAdd(B,'collections/'+P.plant+'-'+P.ym,old);if(B.items.length>=20)await bkFlush(B)}
        var txt=JSON.stringify(P.rows);
        if(txt.length<=170000)doc.rows=P.rows;
        else{var top=P.rows.slice().sort(function(a,b){return b[3]-a[3]}).slice(0,1500);doc.rows=top;doc.z=await gz(txt);doc.rows_note='top 1500 by amount; all rows in z (gz-json)'}
        await dset('collections/'+P.plant+'-'+P.ym,doc);done++;U.progress=Math.round(done/total*100);U.progressMsg='Writing plant-month '+done+' of '+total;var bar=$('#i-upload .bar i');if(bar)bar.style.width=U.progress+'%'}
    }));
    await bkFlush(B);
    if(r.rejects.length){var rr=r.rejects.slice(0,1500);await dset('rejects/'+uid,{z:await gz(JSON.stringify(rr)),n:rr.length,total:r.rejected,demo:demo||undefined})}
  }catch(e){failed=e}
  var ms=Object.keys(r.months).sort();
  var upl={at:nowISO(),by:by,sys:'B1',entity:'CL',file:U.name,size:U.size,mode:'historic',periodLabel:ms.length?(ymLabel(ms[0])+(ms.length>1?' to '+ymLabel(ms[ms.length-1]):'')):'',read:r.read,loaded:failed?0:r.good,rejected:r.rejected,skipped:r.rejected,warned:0,status:failed?'Failed':'Loaded',demo:demo||undefined,plantMonths:done,months:ms,backup:bkSummary(B),
    fixes:{not_customer_rows:r.notCust.A.rows+r.notCust.S.rows+r.notCust.other.rows,acp_rows:r.acp.rows,acp_value:Math.round(r.acp.value),amount_loaded:Math.round(r.custValue),zero_rows:r.zero,before_history_start:r.preHist.rows},error:failed?dbErrText(failed):undefined};
  try{await dset('uploads/'+uid,upl);if(!failed){var mp={};Object.keys(U.map).forEach(function(k){mp[k]=U.map[k]>=0?U.headers[U.map[k]]:null});await dset('mappings/B1_collection',{map:mp,sys:'B1',entity:'CL',at:nowISO(),by:by})}}catch(e2){failed=failed||e2}
  U.stage='done';U.doneOk=!failed;
  U.doneMsg=failed?('Load stopped: '+dbErrText(failed)+' '+done+' of '+total+' plant-months were stored.'):('Loaded '+fmtN(r.good)+' customer receipts ('+fmtMoney(r.custValue)+') into '+done+' plant-months.'+(r.rejected?' '+fmtN(r.rejected)+' rows were skipped; the list is in Upload history.':''));
  collRender();
}
Object.assign(handlers,{
 'coll-validate':async function(){await collValidate();if(U&&U.stage==='validated'&&!window.__NOAUTOLOAD&&collCanLoad()&&effRole()==='Super admin'&&!readOnly()){toast('Loading '+fmtN(U.res.good)+' receipts; '+fmtN(U.res.rejected)+' skipped');await collLoad()}},
 'coll-load':function(){return collLoad()},
 'u-rejcsv-coll':function(){var r=U.res;return download('skipped-collection-rows.csv',csvLine(['row','receipt','line','field','reason','value'])+'\n'+r.rejects.map(csvLine).join('\n'))}
});
document.addEventListener('change',function(ev){
  var t=ev.target,c=t.getAttribute&&t.getAttribute('data-chg');
  if(c==='coll-map'){U.map[t.getAttribute('data-k')]=+t.value;U.savedMap=false;collRender()}
  else if(c==='coll-confrep'){U.confirmReplace=t.checked;collRender()}
});
/* ---- Undo ---- */
function collUndoPlan(uid){var docs=S.coll.filter(function(d){return d.upload===uid});var ms={};docs.forEach(function(d){ms[d.ym]=1});return {docs:docs,months:Object.keys(ms).sort()}}
async function collUndo(uid){
  var pl=collUndoPlan(uid),u=S.uploads.find(function(x){return x._id===uid}),q=pl.docs.slice();
  await Promise.all([0,1,2,3].map(async function(){while(q.length){var d=q.shift();if(d.plan!=null)await dset('collections/'+d._id,{plant:d.plant,ym:d.ym,total:0,n:0,rows:[],plan:d.plan,sys:'B1',src:'RCT',undone:uid});else await ddel('collections/'+d._id)}}));
  var mine={};pl.docs.forEach(function(d){mine['collections/'+d._id]=1});
  var rs=await bkRestore(uid,function(p){return !!mine[p]});await bkDelete(uid);
  for(var pi=0;pi<pl.docs.length;pi++){var pd=pl.docs[pi];if(pd.plan!=null){var ps=await dget('collections/'+pd._id);if(ps.exists){var px=ps.data();if(px.plan!==pd.plan){px.plan=pd.plan;await dset('collections/'+pd._id,px)}}}}/* a plan entered since the upload is kept */
  await ddel('rejects/'+uid);
  if(u){var up=Object.assign({},u);delete up._id;await dset('uploads/'+uid,Object.assign(up,{status:'Undone',undone_at:nowISO(),undone_by:whoAmI(),undone_months:pl.months,undone_plant_months:pl.docs.length,restored:rs.n||undefined}))}
  await auditW('upload undone','',{upload:uid,file:((u&&u.file)||'').slice(0,120),months:pl.months,plant_months:pl.docs.length});
  await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:whoAmI(),event:'upload undone',upload:uid,months:pl.months,plant_months:pl.docs.length});
  return pl;
}
/* ---- coverage: a month is covered when its plants have collection documents ---- */
function collCov(qkey){
  var months=qMonths(qkey),by={},ref=0;
  S.coll.forEach(function(d){if(d.undone)return;by[d.ym]=(by[d.ym]||0)+1;ref=Math.max(ref,by[d.ym])});
  var present=0,ok=0,detail=[];months.forEach(function(ym){var n=by[ym]||0;detail.push({ym:ym,plants:n});if(n>0)present++;if(n>0&&n>=Math.ceil(ref*0.9))ok++});
  return {st:present===0?'miss':(ok===3?'ok':'part'),detail:detail,ref:ref,closed:!!(S.periods[qkey]&&S.periods[qkey].status==='closed')};
}
