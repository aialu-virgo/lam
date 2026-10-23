/* ================= Receivables intake: open items snapshot (D39, Vijay, 23 Oct 2026) =================
 * A snapshot "as on" a date: one row per open invoice or open item. Stored as
 *   receivables/rsnap_YYYYMMDD            index + aggregates per plant (small)
 *   receivables/ri_YYYYMMDD_<plant>_<n>   open items of one plant, gzipped, 1,200 rows per document
 * Kept: last 6 snapshots plus the latest of each month since history start. The latest snapshot is decoded into S.recv (the shape the
 * Receivables page, K10/K11, rule R2 and the default collection plan already read): [{plant, asOn, rows:[[doc, cust, name, due, open, total, docDate]]}]. */
S.recvRaw=[];S.recvCredit=[];S.recvSnaps=[];S.recvAsOf='';S.recvTok=0;S.recvKey='';
var RC_FIELDS=[
 {k:'branch',label:'Branch / plant',canon:'plant_code',req:1,c:['BRANCHNAME','BPLName','Branch Name','Branch','Plant','Profit Center','BPL']},
 {k:'doc',label:'Document number',canon:'source_doc_no',req:1,c:['DOCNUM','DocNum','BaseRef','BELNR','Document','Document Number','Invoice','Reference']},
 {k:'date',label:'Document date',canon:'doc_date',c:['DOCDATE','DocDate','RefDate','BUDAT','Posting Date','Document Date']},
 {k:'due',label:'Due date',canon:'due_date',req:1,c:['DUEDATE','DocDueDate','DueDate','Net Due Date','FAEDT','Due Date']},
 {k:'cust',label:'Customer code',canon:'customer_code',req:1,c:['CARDCODE','CardCode','ShortName','KUNNR','Customer','Customer Number']},
 {k:'name',label:'Customer name',canon:'customer_name',c:['CARDNAME','CardName','Name','Customer Name','Name 1']},
 {k:'total',label:'Document total',canon:'doc_total',c:['DOCTOTAL','DocTotal','Invoice Amount','Gross Amount']},
 {k:'paid',label:'Paid to date',canon:'paid_to_date',c:['PAIDTODATE','PaidToDate','Paid']},
 {k:'open',label:'Open amount (balance)',canon:'open_amount',c:['BALANCE','Balance','BalDue','Open Amount','Open Balance','Amount in Local Currency','DMBTR']},
 {k:'deb',label:'Balance due debit',canon:'bal_due_debit',c:['BalDueDeb','BalDueDebit']},
 {k:'cred',label:'Balance due credit',canon:'bal_due_credit',c:['BalDueCred','BalDueCredit']}];
function recvDetect(headers){
  var set={};headers.forEach(function(h){set[norm(h)]=1});var has=function(a){return a.some(function(x){return set[norm(x)]})};
  if(has(['itemcode','item code','linetotal','quantity','invoice document item','checksum','transfersum','onhand','whscode','batchnum']))return null;
  var cust=has(['cardcode','shortname','kunnr','customer','customer number']),doc=has(['docnum','baseref','belnr','document','document number','invoice']),due=has(['docduedate','duedate','net due date','faedt','due date']);
  var amt=has(['balance','baldue','open amount','open balance','amount in local currency','dmbtr','baldueded','balduedeb'])||(has(['doctotal'])&&has(['paidtodate']));
  if(!(cust&&doc&&due&&amt))return null;
  var layout='generic';
  if(set['paidtodate']&&set['docduedate'])layout='B1 OINV open invoices';
  else if(set['shortname']&&(set['balduedeb']||set['baldueded']))layout='B1 JDT1 open items';
  else if(set['faedt']||set['net due date']||set['kunnr'])layout='S/4 open items';
  else if(set['branchname']&&set['balance'])layout='B1 custom open-items report';
  return {kind:'recv',sys:(layout.indexOf('S/4')===0?'S4':'B1'),layout:layout};
}
function rcMapKey(sys,layout){return sys+'_receivable_'+String(layout||'').toLowerCase().replace(/[^a-z0-9]+/g,'')}
function recvDefaultMap(headers){var ix=headerIndex(headers),m={};RC_FIELDS.forEach(function(f){m[f.k]=-1;for(var i=0;i<f.c.length;i++){var k=norm(f.c[i]);if(k in ix){m[f.k]=ix[k];break}}});return m}
function recvStart(file,rows,headers,det,sheetPicked){
  var mode=U.mode;U=newU();U.mode=mode;U.kind='recv';U.entity='RC';U.name=file.name;U.size=file.size;U.headers=headers;U.rows=rows.slice(1);U.sys=det.sys;U.layout=det.layout;U.sheetPicked=sheetPicked;
  U.map=recvDefaultMap(headers);
  var sv=S.mappings[rcMapKey(det.sys,det.layout)];if(sv&&sv.map){var ix=headerIndex(headers),used=false;Object.keys(sv.map).forEach(function(k){var n=norm(sv.map[k]);if(sv.map[k]===null||sv.map[k]===''){U.map[k]=-1;used=true}else if(n in ix){U.map[k]=ix[n];used=true}});U.savedMap=used}
  U.asOf=asOfFromName(file.name);U.asOfSrc=U.asOf?'file name':'';
  U.stage='mapping';renderUpload();
}
function recvAmountOk(){var m=U.map;return (m.open>=0)||(m.deb>=0||m.cred>=0)||(m.total>=0&&m.paid>=0)}
async function recvParse(){
  var map=U.map,rows=U.rows,col=function(k){return map[k]==null?-1:map[k]},cB=col('branch'),cD=col('doc'),cDt=col('date'),cDu=col('due'),cC=col('cust'),cN=col('name'),cT=col('total'),cP=col('paid'),cO=col('open'),cDe=col('deb'),cCr=col('cred');
  var resolve=plantResolver(),asOf=U.asOf,res={read:rows.length,good:0,rejected:0,rejects:[],reasons:{},asOf:asOf,layout:U.layout,acp:{rows:0,value:0,plants:{}},zero:0,credit:{rows:0,value:0},unknownBranch:{},plants:{},noDue:0,open:0,notDue:0,minDue:null};
  var rej=function(i,doc,field,reason,val){res.rejected++;res.reasons[reason]=(res.reasons[reason]||0)+1;if(res.rejects.length<20000)res.rejects.push([i+2,doc,'',field,reason,val==null?'':val])};
  var T0=Date.now(),seen=new Set(),dupN=0;res.dup=0;
  for(var i=0;i<rows.length;i++){
    if(Date.now()-T0>40){T0=Date.now();U.progress=Math.round(i/rows.length*100);U.progressMsg='Checking row '+fmtN(i)+' of '+fmtN(rows.length);var bar=$('#i-upload .bar i');if(bar)bar.style.width=U.progress+'%';await tick()}
    var r=rows[i],doc=String(r[cD]==null?'':r[cD]).trim().replace(/\.0$/,''),cust=String(r[cC]==null?'':r[cC]).trim();
    if(!doc&&!cust)continue;
    if(!doc){rej(i,'','Document number','Document number is empty','');continue}
    if(!cust){rej(i,doc,'Customer','Customer code is empty','');continue}
    var open=NaN,total=cT>=0?toNum(r[cT]):NaN;
    if(cO>=0)open=toNum(r[cO]);
    else if(cDe>=0||cCr>=0){var dv=cDe>=0?toNum(r[cDe]):0,cv=cCr>=0?toNum(r[cCr]):0;open=(isNaN(dv)?0:dv)-(isNaN(cv)?0:cv)}
    else if(cT>=0&&cP>=0){var pv=toNum(r[cP]);open=total-(isNaN(pv)?0:pv)}
    if(isNaN(open)){rej(i,doc,'Open amount','Open amount is not a number',r[cO>=0?cO:cT]);continue}
    var bn=String(r[cB]==null?'':r[cB]).trim(),pl=resolve(U.sys,bn);
    if(!pl){var k2=bn||'(blank)';res.unknownBranch[k2]=(res.unknownBranch[k2]||0)+1;rej(i,doc,'Branch','Unknown plant or branch',bn);continue}
    if(pl.business==='ACP'||+pl.plant_code>=1050){res.acp.rows++;res.acp.value+=open;res.acp.plants[pl.plant_code]=1;continue}
    if(pl.active===false){rej(i,doc,'Plant','Plant is switched off in Admin',pl.plant_code);continue}
    if(Math.abs(open)<0.005){res.zero++;continue}
    var dd=cDt>=0?parseColDate(r[cDt]):null,du=cDu>=0?parseColDate(r[cDu]):null,dueIso;
    if(cDt>=0&&r[cDt]!==''&&r[cDt]!=null&&!dd){rej(i,doc,'Document date','Date not readable',r[cDt]);continue}
    if(!du){if(cDu>=0&&r[cDu]!==''&&r[cDu]!=null){rej(i,doc,'Due date','Date not readable',r[cDu]);continue}if(dd){du=dd;res.noDue++}else{rej(i,doc,'Due date','No due date and no document date','');continue}}
    dueIso=du.y+'-'+pad(du.m)+'-'+pad(du.d);var docIso=dd?dd.y+'-'+pad(dd.m)+'-'+pad(dd.d):'';
    var dk=pl.plant_code+'|'+doc+'|'+cust+'|'+open;if(seen.has(dk)){res.dup++;continue}seen.add(dk);
    var P=res.plants[pl.plant_code]||(res.plants[pl.plant_code]={rows:[],open:0,credit:0,notDue:0,b:[0,0,0,0],cust:new Set()});
    var nm=cN>=0?String(r[cN]==null?'':r[cN]).trim().slice(0,30):'';
    P.rows.push([doc,cust,nm,dueIso,Math.round(open*100)/100,isNaN(total)?'':Math.round(total*100)/100,docIso]);P.cust.add(cust);
    if(open<0){P.credit+=-open;res.credit.rows++;res.credit.value+=-open}
    else{var od=asOf?diffDays(asOf,dueIso):0;P.open+=open;res.open+=open;if(od<=0){P.notDue+=open;res.notDue+=open}else P.b[od<=30?0:od<=60?1:od<=90?2:3]+=open}
    res.good++;
  }
  return res;
}
function recvRender(){
  var el=$('#i-upload');if(!el)return;var st=U.stage,locked=st==='validating'||st==='loading';
  var stepIdx={mapping:2,validating:3,validated:3,loading:4,done:4}[st]||1;
  var steps=['Upload','Confirm mapping','Validate','Load'].map(function(s,i){return '<span class="'+(i+1<stepIdx?'ok':i+1===stepIdx?'on':'')+'">'+(i+1)+' '+s+'</span>'}).join('');
  var h='<div class="hd"><h2>Upload a SAP export &middot; Receivables</h2><div class="steps">'+steps+'</div></div>';
  h+='<div class="banner info"><span><b>'+esc(U.name)+'</b> &middot; '+fmtN(U.rows.length)+' data rows &middot; '+U.headers.length+' columns &middot; detected <b>'+esc(U.layout||'open items')+'</b>'+(U.savedMap?' &middot; saved mapping applied':'')+'</span><button class="btn sm" data-act="u-reset" '+(locked?'disabled':'')+'>Choose another file</button></div>';
  var asOfOk=/^\d{4}-\d\d-\d\d$/.test(U.asOf||'')&&U.asOf<=TODAY();
  h+='<div class="row" style="align-items:flex-end"><div class="fld"><label for="rc-asof">Open items as on (required)</label><input id="rc-asof" type="date" class="in" data-chg="rc-asof" value="'+esc(U.asOf||'')+'" max="'+TODAY()+'" '+(locked?'disabled':'')+'></div><div class="note" style="flex:1">'+(U.asOf?(asOfOk?'Read from the '+esc(U.asOfSrc||'picker')+': <b>'+esc(fmtDate(U.asOf))+'</b>. A snapshot for the same date replaces the earlier one. Ageing counts days past due to this date.':'<b class="dn">That date is in the future.</b>'):'No date in the file name. <b>Pick the date these open items are as on.</b>')+'</div></div>';
  if(st==='mapping'){
    var rows=RC_FIELDS.map(function(f){var cur=U.map[f.k];if(cur==null)cur=-1;
      var opts='<option value="-1"'+(cur<0?' selected':'')+'>unmapped</option>'+U.headers.map(function(hd,i){return '<option value="'+i+'"'+(cur===i?' selected':'')+'>'+esc(hd===''?'(blank header, col '+(i+1)+')':hd)+'</option>'}).join('');
      var sample='';if(cur>=0){for(var r=0;r<Math.min(U.rows.length,50);r++){var v=U.rows[r][cur];if(v!==''&&v!=null){sample=String(v);break}}}
      return '<tr><td><select class="in" data-chg="rc-map" data-k="'+f.k+'" aria-label="File column for '+esc(f.label)+'">'+opts+'</select></td><td><b>'+esc(f.label)+'</b><div class="note mono">'+f.canon+'</div></td><td>'+(f.req?'<span class="pill info">Required</span>':'<span class="pill mute">Optional</span>')+'</td><td class="mono break" style="max-width:180px">'+esc(sample.slice(0,60))+'</td></tr>'}).join('');
    var miss=RC_FIELDS.filter(function(f){return f.req&&(U.map[f.k]==null||U.map[f.k]<0)}).map(function(f){return f.label});
    if(!recvAmountOk())miss.push('an open-amount column, or debit/credit balance, or document total with paid to date');
    h+='<div class="hd"><h2>Confirm column mapping</h2><span class="note">Open = open amount; else debit − credit; else total − paid. Credit items (negative open) are kept and shown separately.</span></div><div class="tw"><table><thead><tr><th>File column</th><th>Canonical field</th><th>Need</th><th>Sample</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
     +(miss.length?'<div class="banner err">Map these first: '+esc(miss.join(', '))+'</div>':'')+'<div class="row"><button class="btn pri" data-act="rc-validate" '+(miss.length||!asOfOk?'disabled':'')+'>Confirm and validate</button></div>';
  }
  if(st==='validating')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='validated'||st==='loading'||st==='done')h+=recvResultHtml(st!=='validated');
  if(st==='loading')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='done')h+='<div class="banner '+(U.doneOk?'ok':'warn')+'"><span>'+esc(U.doneMsg)+'</span><button class="btn sm" data-act="u-reset">Upload another file</button></div>';
  if(U.msg)h+='<div class="banner err">'+esc(U.msg)+'</div>';
  el.innerHTML=h;
}
function recvResultHtml(locked){
  var r=U.res;if(!r)return '';
  var h='<div class="hd"><h2>Validation result</h2><span class="pill '+(r.rejected?'part':'ok')+'">'+(r.rejected?fmtN(r.rejected)+' rows will be skipped':'All rows pass')+'</span></div>'
   +'<div class="kpis"><div class="kpi"><small>Rows read</small><b>'+fmtN(r.read)+'</b></div><div class="kpi"><small>Open items loading</small><b>'+fmtN(r.good)+'</b></div><div class="kpi"><small>Open receivable</small><b>'+fmtMoney(r.open)+'</b><small>'+fmtMoney(r.notDue)+' not yet due</small></div><div class="kpi"><small>Credit items (unapplied)</small><b>'+fmtN(r.credit.rows)+'</b><small>'+fmtMoney(r.credit.value)+'</small></div><div class="kpi"><small>Rows skipped (rejected)</small><b>'+fmtN(r.rejected)+'</b></div><div class="kpi"><small>ACP plants (out of scope)</small><b>'+fmtN(r.acp.rows)+'</b></div></div>';
  var it=[{st:'info',t:'File layout',n:null,d:esc(r.layout+'. '+(r.asOf?'As on '+fmtDate(r.asOf)+'. '+(recvSnapAt(r.asOf)?'Replaces the snapshot already held for this date.':'New snapshot.'):''))}];
  if(r.credit.rows)it.push({st:'info',t:'Credit items kept separately (negative open amount)',n:r.credit.rows,d:esc(fmtMoney(r.credit.value)+' is shown apart from the ageing; it is not netted against invoices.')});
  if(r.acp.rows)it.push({st:'info',t:'ACP plants skipped (not part of this Desk)',n:r.acp.rows,d:esc(Object.keys(r.acp.plants).length+' plants.')});
  if(r.zero)it.push({st:'info',t:'Zero-balance rows skipped',n:r.zero,d:''});
  if(r.dup)it.push({st:'fixed',t:'Repeated rows removed (same plant, document, customer and amount)',n:r.dup,d:''});
  if(r.noDue)it.push({st:'need',t:'No due date: document date used',n:r.noDue,d:'Add the due date to the export so ageing is right.'});
  var ub=Object.keys(r.unknownBranch);
  if(ub.length)it.push({st:'need',t:'Branches not in the plant master (rows skipped)',n:ub.reduce(function(a,k){return a+r.unknownBranch[k]},0),d:esc(ub.slice(0,8).join(', '))+'. Add the plant or its B1 branch name in Admin › Plants, then load again.'});
  h+=fixesPanel(it,'Fixes applied');
  var pk=Object.keys(r.plants).sort();
  h+='<div class="tw hscroll" style="max-height:240px;overflow:auto"><table><thead><tr><th>Plant</th><th class="num">Items</th><th class="num">Open</th><th class="num">Not due</th><th class="num">0–30</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">90+</th></tr></thead><tbody>'+pk.map(function(p){var P=r.plants[p];return '<tr><td>'+esc(plantShort(p))+'</td><td class="num">'+fmtN(P.rows.length)+'</td><td class="num">'+fmtMoney(P.open)+'</td><td class="num">'+fmtMoney(P.notDue)+'</td>'+P.b.map(function(b){return '<td class="num">'+fmtMoney(b)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>';
  h+='<div class="row"><button class="btn pri" data-act="rc-load" '+(r.good>0&&!locked?'':'disabled')+'>Load '+fmtN(r.good)+' open items</button>'+(r.rejected?'<button class="btn" data-act="u-rejcsv-rc">Download skipped rows (CSV)</button>':'')+(locked?'':'<button class="btn" data-act="u-reset">Cancel upload</button>')+'</div>';
  return h;
}
function recvSnapAt(a){return S.recvSnaps.find(function(s){return s.as_of===a})||null}
async function recvValidate(){
  U.stage='validating';U.progress=0;U.progressMsg='Starting...';recvRender();await tick();
  try{U.res=await recvParse();U.stage='validated'}catch(e){U.stage='mapping';U.msg='Could not check the file: '+((e&&e.message)||e)}
  recvRender();
}
function recvKeep(extra){
  var all=S.recvSnaps.map(function(s){return s.as_of});if(extra&&all.indexOf(extra)<0)all.push(extra);all.sort().reverse();
  var keep={},lo=histLoYm(),lm={};all.slice(0,6).forEach(function(a){keep[a]=1});
  all.forEach(function(a){var m=a.slice(0,7);if(!lm[m]||a>lm[m])lm[m]=a});Object.keys(lm).forEach(function(m){if(m>=lo)keep[lm[m]]=1});return keep;
}
async function recvDeleteSnap(s){var d8=compactYmd(s.as_of),ps=s.plants||{};for(var p in ps){for(var j=0;j<(ps[p].chunks||0);j++)await ddel('receivables/ri_'+d8+'_'+p+'_'+j)}await ddel('receivables/rsnap_'+d8)}
async function recvLoad(){
  if(!superOnly('load receivables')||!U||!U.res||U.res.good<=0)return;
  var r=U.res,uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),by=whoAmI(),failed=null,demo=!!U.demoFlag,d8=compactYmd(r.asOf),id='rsnap_'+d8,old=S.recvRaw.find(function(x){return x._id===id});
  U.stage='loading';U.progressMsg='Writing the snapshot...';recvRender();await tick();
  var pk=Object.keys(r.plants).sort(),plants={},done=0,B=bkNew(uid,'RC',demo);
  try{
    if(old){bkAdd(B,'receivables/'+id,old);S.recvRaw.forEach(function(d){if(d._id.indexOf('ri_'+d8+'_')===0)bkAdd(B,'receivables/'+d._id,d)});await bkFlush(B)}
    for(var pi=0;pi<pk.length;pi++){
      var p=pk[pi],P=r.plants[p],rows=P.rows,per=1200,n=Math.max(1,Math.ceil(rows.length/per));
      for(var c=0;c<n;c++)await dset('receivables/ri_'+d8+'_'+p+'_'+c,{z:await gz(JSON.stringify(rows.slice(c*per,(c+1)*per))),as_of:r.asOf,plant:p,i:c,n:rows.length,upload:uid,demo:demo||undefined,fmt:'gz-json v1: [doc,customer,name,due,open,total,docDate]'});
      plants[p]={chunks:n,rows:rows.length,open:Math.round(P.open),credit:Math.round(P.credit),notDue:Math.round(P.notDue),b:P.b.map(Math.round),customers:P.cust.size};done++;
      U.progress=Math.round(done/pk.length*100);U.progressMsg='Writing plant '+done+' of '+pk.length;var bar=$('#i-upload .bar i');if(bar)bar.style.width=U.progress+'%';
    }
    await dset('receivables/'+id,{as_of:r.asOf,layout:r.layout,sys:U.sys,file:U.name,upload:uid,at:nowISO(),by:by,plants:plants,loaded:r.good,skipped:r.rejected,open:Math.round(r.open),credit:Math.round(r.credit.value),demo:demo||undefined});
    if(old){var ops=old.plants||{};for(var q in ops){var oc=ops[q].chunks||0,nc=plants[q]?plants[q].chunks:0;for(var j=nc;j<oc;j++)await ddel('receivables/ri_'+d8+'_'+q+'_'+j)}}
    var keep=recvKeep(r.asOf);for(var i=0;i<S.recvSnaps.length;i++){var s=S.recvSnaps[i];if(!keep[s.as_of]&&s.as_of!==r.asOf)await recvDeleteSnap(s)}
    if(r.rejects.length){var rr=r.rejects.slice(0,1500);await dset('rejects/'+uid,{z:await gz(JSON.stringify(rr)),n:rr.length,total:r.rejected,demo:demo||undefined})}
  }catch(e){failed=e}
  var upl={at:nowISO(),by:by,sys:U.sys,entity:'RC',file:U.name,size:U.size,mode:'snapshot',periodLabel:'Receivables as on '+fmtDate(r.asOf),as_of:r.asOf,backup:bkSummary(B),read:r.read,loaded:failed?0:r.good,rejected:r.rejected,skipped:r.rejected,warned:0,status:failed?'Failed':'Loaded',demo:demo||undefined,plants:pk.length,fixes:{credit_items:r.credit.rows,acp_rows:r.acp.rows,zero_rows:r.zero,repeated_rows:r.dup,no_due_date:r.noDue},error:failed?dbErrText(failed):undefined};
  try{await dset('uploads/'+uid,upl);if(!failed){var mp={};Object.keys(U.map).forEach(function(k){mp[k]=U.map[k]>=0?U.headers[U.map[k]]:null});await dset('mappings/'+rcMapKey(U.sys,U.layout),{map:mp,sys:U.sys,entity:'RC',at:nowISO(),by:by})}}catch(e2){failed=failed||e2}
  U.stage='done';U.doneOk=!failed;
  U.doneMsg=failed?('Load stopped: '+dbErrText(failed)):('Loaded open items as on '+fmtDate(r.asOf)+': '+fmtN(r.good)+' items, '+fmtMoney(r.open)+' open, in '+pk.length+' plants.'+(r.rejected?' '+fmtN(r.rejected)+' rows were skipped; the list is in Upload history.':''));
  recvRender();
}
Object.assign(handlers,{
 'rc-validate':async function(){await recvValidate();if(U&&U.stage==='validated'&&!window.__NOAUTOLOAD&&U.res&&U.res.good>0&&effRole()==='Super admin'&&!readOnly()){toast('Loading '+fmtN(U.res.good)+' open items; '+fmtN(U.res.rejected)+' skipped');await recvLoad()}},
 'rc-load':function(){return recvLoad()},
 'u-rejcsv-rc':function(){var r=U.res;return download('skipped-receivable-rows.csv',csvLine(['row','document','line','field','reason','value'])+'\n'+r.rejects.map(csvLine).join('\n'))}
});
document.addEventListener('change',function(ev){
  var t=ev.target,c=t.getAttribute&&t.getAttribute('data-chg');
  if(c==='rc-asof'){U.asOf=t.value;U.asOfSrc='picker';if(U.stage==='validated'||U.stage==='done'){U.stage='mapping';U.res=null}recvRender()}
  else if(c==='rc-map'){U.map[t.getAttribute('data-k')]=+t.value;U.savedMap=false;recvRender()}
});
/* ---- ingest: snapshots -> the per-plant open-item docs the page already reads ---- */
function ingestRecv(){
  var snaps=S.recvRaw.filter(function(x){return /^rsnap_\d{8}$/.test(x._id)});S.recvSnaps=snaps;
  var sorted=snaps.slice().sort(function(a,b){return a.as_of<b.as_of?1:-1}),today=TODAY(),latest=sorted.find(function(s){return s.as_of<=today})||sorted[0]||null;
  S.recvAsOf=latest?latest.as_of:'';
  if(!latest){S.recvCredit=[];S.recv=S.recvRaw.filter(function(x){return x.rows&&x.plant});S.recvKey='';DS.cache={};S.engSig=null;S.lastHtml='';schedule();return}
  var key=latest._id+'|'+latest.upload+'|'+latest.at;
  if(key===S.recvKey)return;S.recvKey=key;var tok=++S.recvTok;
  (async function(){
    var d8=compactYmd(latest.as_of),out=[],cr=[],ps=Object.keys(latest.plants||{}),dm={};
    S.recvRaw.forEach(function(x){dm[x._id]=x});
    for(var i=0;i<ps.length;i++){var p=ps[i],rows=[];
      for(var c=0;c<(latest.plants[p].chunks||0);c++){var d=dm['ri_'+d8+'_'+p+'_'+c];if(!d)continue;try{JSON.parse(await ungz(d.z)).forEach(function(r){rows.push(r)})}catch(e){}}
      out.push({_id:'rsnap-'+p,plant:p,asOn:latest.as_of,rows:rows.filter(function(r){return r[4]>0})});
      cr.push({_id:'rcred-'+p,plant:p,asOn:latest.as_of,rows:rows.filter(function(r){return r[4]<0})})}
    if(tok!==S.recvTok)return;
    S.recvCredit=cr;S.recv=out;DS.cache={};S.engSig=null;S.lastHtml='';schedule();
  })();
}
async function recvUndo(uid){
  var s=S.recvSnaps.find(function(x){return x.upload===uid}),u=S.uploads.find(function(x){return x._id===uid});
  if(s){await recvDeleteSnap(s);await bkRestore(uid)}await bkDelete(uid);await ddel('rejects/'+uid);
  if(u){var up=Object.assign({},u);delete up._id;await dset('uploads/'+uid,Object.assign(up,{status:'Undone',undone_at:nowISO(),undone_by:whoAmI(),undone_months:s?[s.as_of]:[],undone_plant_months:s?Object.keys(s.plants||{}).length:0}))}
  await auditW('upload undone','',{upload:uid,file:((u&&u.file)||'').slice(0,120),as_of:s?s.as_of:''});
  await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:whoAmI(),event:'upload undone',upload:uid,as_of:s?s.as_of:''});
  return s;
}
function recvCov(qkey){
  var months=qMonths(qkey),present=0,detail=[],cur=TODAY().slice(0,7);
  months.forEach(function(ym){var have=S.recvSnaps.filter(function(s){return s.as_of.slice(0,7)===ym}).sort(function(a,b){return a.as_of<b.as_of?1:-1});detail.push({ym:ym,plants:have.length?Object.keys(have[0].plants||{}).length:0});if(have.length)present++});
  var elig=months.filter(function(m){return m<=cur}).length;
  return {st:present===0?'miss':(present>=elig&&elig>0?'ok':'part'),detail:detail,ref:0,closed:!!(S.periods[qkey]&&S.periods[qkey].status==='closed')};
}
/* ---- Receivables page helpers: credit items shown apart; a customer's open total across the plants in scope ---- */
function custOpenTotal(code){var t=0;S.recv.forEach(function(d){if(!plantInScope(SC(),d.plant))return;(d.rows||[]).forEach(function(r){if(r[1]===code)t+=r[4]})});return t}
function recvCreditHtml(plants){
  var sc=SC(),rows=[];(S.recvCredit||[]).forEach(function(d){if(!plantInScope(sc,d.plant)||(plants&&!plants.has(d.plant)))return;d.rows.forEach(function(r){rows.push({plant:d.plant,doc:r[0],cust:r[1],name:r[2],due:r[3],amt:-r[4]})})});
  if(!rows.length)return '';
  rows.sort(function(a,b){return b.amt-a.amt});var tot=rows.reduce(function(a,x){return a+x.amt},0);
  return '<section class="card"><div class="hd"><h2>Credit items (unapplied)</h2><span class="note">'+fmtN(rows.length)+' items, '+fmtMoney(tot)+'. Negative open amounts, kept apart: not netted against invoices and not in the ageing.</span></div><div class="tw" style="max-height:260px;overflow:auto"><table class="std"><thead><tr><th>Customer</th><th>Plant</th><th>Document</th><th class="num">Credit ₹</th></tr></thead><tbody>'+rows.slice(0,60).map(function(x){return '<tr><td class="break"><b>'+esc(x.cust)+'</b> '+esc(custName(x.cust,x.name))+'</td><td>'+esc(plantShort(x.plant))+'</td><td class="mono">'+esc(x.doc)+'</td><td class="num">'+fmtMoney(x.amt)+'</td></tr>'}).join('')+'</tbody></table></div></section>';
}
/* an unrecognised file always reaches the mapping step: chosen entity, or the "Import as" buttons (D45) */
Object.assign(handlers,{
 'imp-rc':function(){var i=U&&U.imp;if(!i)return;recvStart(i.file,i.rows,i.headers,{sys:'B1',layout:'unrecognised layout, map the columns'},i.sheetPicked)},
 'imp-cn':function(){var i=U&&U.imp;if(!i)return;cnStart(i.file,i.rows,i.headers,{sys:'B1',layout:'unrecognised layout, map the columns'},i.sheetPicked)}
});
