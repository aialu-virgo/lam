/* ================= Credit notes intake and the Net view (D39 and D40, 23 Oct 2026) =================
 * A period entity like invoices: a file may span months. Stored per plant-month by product group (sheets, value) with the SAP reference per line:
 *   creditnotes/<plant>-<ym>        {plant, ym, groups:{G:{sheets,sqft,value,lines}}, n, z (gzip of the lines), upload}
 *   creditnotes/<plant>-<ym>~<i>    further gzipped line chunks of a big plant-month
 *   creditnotes/cov_<ym>            {ym, upload}: the month is covered by a credit-note file (a plant with none then has none)
 * D40: once every month of a quarter (up to today) is covered, achievement and growth for that quarter use Net = invoiced - credit notes. */
S.cnRaw=[];S.cn=[];S.cnCov={};S.cnSig='';
var CN_FIELDS=[
 {k:'branch',label:'Branch / plant',canon:'plant_code',req:1,c:['BPLName','BRANCHNAME','Branch Name','Branch','Plant']},
 {k:'doc',label:'Credit note number',canon:'source_doc_no',req:1,c:['DocNum','DOCNUM','Invoice Document Number','Credit Memo']},
 {k:'line',label:'Line',canon:'source_line',c:['LineNum','Line Num','Invoice Document item','VisOrder']},
 {k:'date',label:'Document date',canon:'doc_date',req:1,c:['DocDate','DOCDATE','Invoice Date','Posting Date']},
 {k:'cust',label:'Customer code',canon:'customer_code',c:['CardCode','CARDCODE','Sold-to-Party Number']},
 {k:'item',label:'Item code',canon:'item_code',req:1,c:['ItemCode','ITEMCODE','Product Code']},
 {k:'qty',label:'Quantity (sheets)',canon:'qty_sheets',c:['Quantity','QUANTITY','Invoice Qty']},
 {k:'value',label:'Line value (excl. GST)',canon:'net_value_inr',req:1,c:['LineTotal','LINETOTAL','Total Amount (Item)']},
 {k:'base',label:'Base document (invoice)',canon:'base_ref',c:['BaseRef','BASEREF','Reference Document']},
 {k:'type',label:'Billing type (S/4)',canon:'billing_type',c:['Billing Type']}];
function cnDetectB1(headers){
  var set={};headers.forEach(function(h){set[norm(h)]=1});
  return set['docnum']&&set['docdate']&&set['cardcode']&&set['itemcode']&&set['linetotal']&&set['baseref']&&!set['invoice type']&&!set['catagory']?{kind:'cn',sys:'B1',layout:'B1 credit notes (ORIN / RIN1)'}:null;
}
function cnS4Share(headers,rows){
  var ix=headerIndex(headers),bi=ix['billing type'];if(bi==null)return 0;var n=0,non=0;
  for(var i=1;i<rows.length&&i<=3000;i++){var t=norm(rows[i][bi]);if(!t)continue;n++;if(t!=='f2')non++}
  return n?non/n:0;
}
function cnDefaultMap(headers){var ix=headerIndex(headers),m={};CN_FIELDS.forEach(function(f){m[f.k]=-1;for(var i=0;i<f.c.length;i++){var k=norm(f.c[i]);if(k in ix){m[f.k]=ix[k];break}}});return m}
function cnStart(file,rows,headers,det,sheetPicked){
  var mode=U.mode;U=newU();U.mode=mode;U.kind='cn';U.entity='CN';U.name=file.name;U.size=file.size;U.headers=headers;U.rows=rows.slice(1);U.sys=det.sys;U.layout=det.layout;U.sheetPicked=sheetPicked;
  U.map=cnDefaultMap(headers);
  var sv=S.mappings[det.sys+'_creditnote'];if(sv&&sv.map){var ix=headerIndex(headers),used=false;Object.keys(sv.map).forEach(function(k){var n=norm(sv.map[k]);if(sv.map[k]===null||sv.map[k]===''){U.map[k]=-1;used=true}else if(n in ix){U.map[k]=ix[n];used=true}});U.savedMap=used}
  U.period=periodFromName(file.name);
  U.stage='mapping';renderUpload();
}
async function cnParse(){
  var map=U.map,rows=U.rows,col=function(k){return map[k]==null?-1:map[k]},cB=col('branch'),cD=col('doc'),cL=col('line'),cT=col('date'),cC=col('cust'),cI=col('item'),cQ=col('qty'),cV=col('value'),cBa=col('base'),cTy=col('type');
  var idx=await loadItemIdx(),resolve=plantResolver(),per=U.period,today=TODAY(),lo=histLoYm();
  var res={read:rows.length,good:0,rejected:0,rejects:[],reasons:{},period:per,layout:U.layout,acp:{rows:0,value:0},other:{rows:0,value:0},preHist:{rows:0,value:0},unknownBranch:{},nonCredit:0,months:{},pm:new Map(),minDate:null,maxDate:null,value:0,sheets:0,itemMaster:idx.size>0,covMonths:[]};
  var rej=function(i,doc,field,reason,val){res.rejected++;res.reasons[reason]=(res.reasons[reason]||0)+1;if(res.rejects.length<20000)res.rejects.push([i+2,doc,'',field,reason,val==null?'':val])};
  var T0=Date.now(),seen=new Set();res.dup=0;
  for(var i=0;i<rows.length;i++){
    if(Date.now()-T0>40){T0=Date.now();U.progress=Math.round(i/rows.length*100);U.progressMsg='Checking row '+fmtN(i)+' of '+fmtN(rows.length);var bar=$('#i-upload .bar i');if(bar)bar.style.width=U.progress+'%';await tick()}
    var r=rows[i],doc=String(r[cD]==null?'':r[cD]).trim().replace(/\.0$/,'');
    if(!doc&&!String(r[cI]==null?'':r[cI]).trim())continue;
    if(cTy>=0){var ty=norm(r[cTy]);if(ty==='f2'){res.nonCredit++;continue}}
    if(!doc){rej(i,'','Credit note number','Credit note number is empty','');continue}
    var val=toNum(r[cV]);if(isNaN(val)){rej(i,doc,'Line value','Line value is not a number',r[cV]);continue}
    var qty=cQ>=0?toNum(r[cQ]):0;if(isNaN(qty))qty=0;
    val=Math.abs(val);qty=Math.abs(qty);
    var dt=parseColDate(r[cT]);if(!dt){rej(i,doc,'Document date','Date not readable',r[cT]);continue}
    var ym=dt.y+'-'+pad(dt.m),iso=ym+'-'+pad(dt.d);
    if(!res.minDate||iso<res.minDate)res.minDate=iso;if(!res.maxDate||iso>res.maxDate)res.maxDate=iso;
    if(iso>today){rej(i,doc,'Document date','Date in the future',iso);continue}
    if(per&&(iso<per.from||iso>per.to)){rej(i,doc,'Document date','Date outside the period in the file name ('+per.from+' to '+per.to+')',iso);continue}
    var bn=String(r[cB]==null?'':r[cB]).trim(),pl=resolve(U.sys,bn);
    if(!pl){var k2=bn||'(blank)';res.unknownBranch[k2]=(res.unknownBranch[k2]||0)+1;rej(i,doc,'Branch','Unknown plant or branch',bn);continue}
    if(pl.business==='ACP'||+pl.plant_code>=1050){res.acp.rows++;res.acp.value+=val;continue}
    if(pl.active===false){rej(i,doc,'Plant','Plant is switched off in Admin',pl.plant_code);continue}
    if(ym<lo){res.preHist.rows++;res.preHist.value+=val;continue}
    var item=String(r[cI]==null?'':r[cI]).trim().toUpperCase(),it=idx.get(item);
    if(!it){res.other.rows++;res.other.value+=val;continue}
    var line=cL>=0?String(r[cL]==null?'':r[cL]).trim().replace(/\.0$/,''):'',dk=pl.plant_code+'|'+doc+'|'+line+'|'+item+'|'+qty+'|'+val;
    if(seen.has(dk)){res.dup++;continue}seen.add(dk);
    var key=pl.plant_code+'|'+ym,P=res.pm.get(key);if(!P){P={plant:pl.plant_code,ym:ym,groups:{},lines:[]};res.pm.set(key,P)}
    var g=it[0],G=P.groups[g]||(P.groups[g]={sheets:0,sqft:0,value:0,lines:0});G.sheets+=qty;G.sqft+=qty*it[1];G.value+=val;G.lines++;
    P.lines.push([doc,line,dt.d,cC>=0?String(r[cC]==null?'':r[cC]).trim():'',item,ITEM_GROUPS.indexOf(g),qty,Math.round(val*100)/100,cBa>=0?String(r[cBa]==null?'':r[cBa]).trim().replace(/\.0$/,''):'']);
    var M=res.months[ym]||(res.months[ym]={lines:0,value:0,sheets:0});M.lines++;M.value+=val;M.sheets+=qty;res.value+=val;res.sheets+=qty;res.good++;
  }
  /* months this file covers: the period in the file name, else the months between the first and last date */
  var from=per?per.from.slice(0,7):(res.minDate||'').slice(0,7),to=per?per.to.slice(0,7):(res.maxDate||'').slice(0,7),cm=[];
  if(from&&to){var x=from<lo?lo:from;while(x<=to&&cm.length<60&&x<=today.slice(0,7)){cm.push(x);x=shiftYm(x,1)}}
  res.covMonths=cm;
  return res;
}
function cnReplaceRisk(res){
  var out={},list=[];
  res.pm.forEach(function(P){var old=S.cn.find(function(d){return d._id===P.plant+'-'+P.ym});if(!old||old.demo)return;
    if((old.n||0)>P.lines.length){var o=out[P.ym]||(out[P.ym]={ym:P.ym,plants:0,oldLines:0,newLines:0});o.plants++;o.oldLines+=old.n||0;o.newLines+=P.lines.length}});
  Object.keys(out).sort().forEach(function(k){list.push(out[k])});return list;
}
function cnCanLoad(){var r=U&&U.res;if(!r)return false;if(!(r.good>0)&&!r.covMonths.length)return false;if(cnReplaceRisk(r).length&&!U.confirmReplace)return false;return true}
function cnRender(){
  var el=$('#i-upload');if(!el)return;var st=U.stage,locked=st==='validating'||st==='loading';
  var stepIdx={mapping:2,validating:3,validated:3,loading:4,done:4}[st]||1;
  var steps=['Upload','Confirm mapping','Validate','Load'].map(function(s,i){return '<span class="'+(i+1<stepIdx?'ok':i+1===stepIdx?'on':'')+'">'+(i+1)+' '+s+'</span>'}).join('');
  var h='<div class="hd"><h2>Upload a SAP export &middot; Credit notes</h2><div class="steps">'+steps+'</div></div>';
  h+='<div class="banner info"><span><b>'+esc(U.name)+'</b> &middot; '+fmtN(U.rows.length)+' data rows &middot; '+U.headers.length+' columns &middot; detected <b>'+esc(U.layout||'credit notes')+'</b>'+(U.savedMap?' &middot; saved mapping applied':'')+'</span><button class="btn sm" data-act="u-reset" '+(locked?'disabled':'')+'>Choose another file</button></div>';
  if(st==='mapping'){
    var rows=CN_FIELDS.map(function(f){var cur=U.map[f.k];if(cur==null)cur=-1;
      var opts='<option value="-1"'+(cur<0?' selected':'')+'>unmapped</option>'+U.headers.map(function(hd,i){return '<option value="'+i+'"'+(cur===i?' selected':'')+'>'+esc(hd===''?'(blank header, col '+(i+1)+')':hd)+'</option>'}).join('');
      var sample='';if(cur>=0){for(var r=0;r<Math.min(U.rows.length,50);r++){var v=U.rows[r][cur];if(v!==''&&v!=null){sample=String(v);break}}}
      return '<tr><td><select class="in" data-chg="cn-map" data-k="'+f.k+'" aria-label="File column for '+esc(f.label)+'">'+opts+'</select></td><td><b>'+esc(f.label)+'</b><div class="note mono">'+f.canon+'</div></td><td>'+(f.req?'<span class="pill info">Required</span>':'<span class="pill mute">Optional</span>')+'</td><td class="mono break" style="max-width:180px">'+esc(sample.slice(0,60))+'</td></tr>'}).join('');
    var miss=CN_FIELDS.filter(function(f){return f.req&&(U.map[f.k]==null||U.map[f.k]<0)}).map(function(f){return f.label});
    h+='<div class="hd"><h2>Confirm column mapping</h2><span class="note">One row per credit-note line. Values are taken as positive amounts to subtract from invoiced sales.</span></div><div class="tw"><table><thead><tr><th>File column</th><th>Canonical field</th><th>Need</th><th>Sample</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
     +(miss.length?'<div class="banner err">Map these first: '+esc(miss.join(', '))+'</div>':'')+'<div class="row"><button class="btn pri" data-act="cn-validate" '+(miss.length?'disabled':'')+'>Confirm and validate</button></div>';
  }
  if(st==='validating')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='validated'||st==='loading'||st==='done')h+=cnResultHtml(st!=='validated');
  if(st==='loading')h+='<div><div class="bar"><i style="width:'+U.progress+'%"></i></div><div class="note">'+esc(U.progressMsg||'')+'</div></div>';
  if(st==='done')h+='<div class="banner '+(U.doneOk?'ok':'warn')+'"><span>'+esc(U.doneMsg)+'</span><button class="btn sm" data-act="u-reset">Upload another file</button></div>';
  if(U.msg)h+='<div class="banner err">'+esc(U.msg)+'</div>';
  el.innerHTML=h;
}
function cnResultHtml(locked){
  var r=U.res;if(!r)return '';
  var h='<div class="hd"><h2>Validation result</h2><span class="pill '+(r.rejected?'part':'ok')+'">'+(r.rejected?fmtN(r.rejected)+' rows will be skipped':'All rows pass')+'</span></div>'
   +'<div class="kpis"><div class="kpi"><small>Rows read</small><b>'+fmtN(r.read)+'</b></div><div class="kpi"><small>Credit-note lines loading</small><b>'+fmtN(r.good)+'</b><small>'+fmtMoney(r.value)+' · '+fmtN(Math.round(r.sheets))+' sheets</small></div><div class="kpi"><small>Rows skipped (rejected)</small><b>'+fmtN(r.rejected)+'</b></div><div class="kpi"><small>Not laminates (counted)</small><b>'+fmtN(r.other.rows)+'</b></div><div class="kpi"><small>ACP plants (out of scope)</small><b>'+fmtN(r.acp.rows)+'</b></div><div class="kpi"><small>Plant-months to write</small><b>'+fmtN(r.pm.size)+'</b></div></div>';
  var it=[{st:'info',t:'File layout',n:null,d:esc(r.layout+'. Dates '+(r.minDate||'-')+' to '+(r.maxDate||'-')+', read as written, never swapped.')}];
  it.push({st:'info',t:'Months this file covers',n:r.covMonths.length,d:esc(r.covMonths.map(ymLabel).join(', ')||'none')+'. A plant with no credit note in a covered month shows no credit notes there. Export all branches.'});
  if(!r.itemMaster)it.push({st:'need',t:'No item master loaded',n:null,d:'The product group and sheets need the item master (Admin › Item master).'});
  if(r.other.rows)it.push({st:'info',t:'Items not in the item master (counted, not stored)',n:r.other.rows,d:esc(fmtMoney(r.other.value)+'. The item master holds laminate-scope items only.')});
  if(r.acp.rows)it.push({st:'info',t:'ACP plants skipped',n:r.acp.rows,d:esc(fmtMoney(r.acp.value))});
  if(r.preHist.rows)it.push({st:'info',t:'Before history start ('+qLabel(histStart())+')',n:r.preHist.rows,d:'Not loaded; no action needed (D28).'});
  if(r.nonCredit)it.push({st:'info',t:'Invoice rows (billing type F2) skipped',n:r.nonCredit,d:'This file is for credit notes only.'});
  if(r.dup)it.push({st:'fixed',t:'Repeated lines removed',n:r.dup,d:''});
  var ub=Object.keys(r.unknownBranch);if(ub.length)it.push({st:'need',t:'Branches not in the plant master (rows skipped)',n:ub.reduce(function(a,k){return a+r.unknownBranch[k]},0),d:esc(ub.slice(0,8).join(', '))+'. Add the plant or its B1 branch name in Admin › Plants.'});
  it.push({st:'info',t:'What changes in the Desk',n:null,d:'Where every month of a quarter is covered, the Sales view shows Invoiced, Credit notes and Net side by side, and achievement and growth for that quarter use Net (D40). Earlier quarters stay on invoiced.'});
  h+=fixesPanel(it,'Fixes applied');
  var ms=Object.keys(r.months).sort();
  h+='<div class="tw hscroll" style="max-height:220px;overflow:auto"><table><thead><tr><th>Month</th><th class="num">Lines</th><th class="num">Sheets</th><th class="num">Credit notes</th></tr></thead><tbody>'+ms.map(function(m){var M=r.months[m];return '<tr><td>'+esc(ymLabel(m))+'</td><td class="num">'+fmtN(M.lines)+'</td><td class="num">'+fmtN(Math.round(M.sheets))+'</td><td class="num">'+fmtMoney(M.value)+'</td></tr>'}).join('')+'</tbody></table></div>';
  var rep=cnReplaceRisk(r);
  if(rep.length)h+='<div class="banner warn" style="display:block"><b>Safety check stopped this file: it would replace '+rep.reduce(function(a,x){return a+x.plants},0)+' plant-months that hold more credit-note lines than the new data.</b><div class="tw hscroll" style="max-height:160px;overflow:auto"><table><thead><tr><th>Month</th><th class="num">Plant-months</th><th class="num">Lines held now</th><th class="num">In this file</th></tr></thead><tbody>'+rep.map(function(x){return '<tr><td>'+esc(ymLabel(x.ym))+'</td><td class="num">'+x.plants+'</td><td class="num">'+fmtN(x.oldLines)+'</td><td class="num">'+fmtN(x.newLines)+'</td></tr>'}).join('')+'</tbody></table></div><label class="chip" style="margin-top:8px"><input type="checkbox" data-chg="cn-confrep" '+(U.confirmReplace?'checked':'')+' '+(locked?'disabled':'')+'> I confirm: replace these months ('+rep.map(function(x){return ymLabel(x.ym)}).join(', ')+')</label></div>';
  h+='<div class="row"><button class="btn pri" data-act="cn-load" '+(cnCanLoad()&&!locked?'':'disabled')+'>Load '+fmtN(r.good)+' credit-note lines</button>'+(r.rejected?'<button class="btn" data-act="u-rejcsv-cn">Download skipped rows (CSV)</button>':'')+(locked?'':'<button class="btn" data-act="u-reset">Cancel upload</button>')+'</div>';
  return h;
}
async function cnValidate(){
  U.stage='validating';U.progress=0;U.progressMsg='Starting...';U.confirmReplace=false;cnRender();await tick();
  try{U.res=await cnParse();U.stage='validated'}catch(e){U.stage='mapping';U.msg='Could not check the file: '+((e&&e.message)||e)}
  cnRender();
}
async function cnLoad(){
  if(!superOnly('load credit notes')||!U||!U.res||!cnCanLoad())return;
  var r=U.res,uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),by=whoAmI(),failed=null,demo=!!U.demoFlag,done=0,total=r.pm.size,atNow=nowISO();
  U.stage='loading';U.progressMsg='Writing...';cnRender();await tick();
  var list=Array.from(r.pm.values()).sort(function(a,b){return a.ym<b.ym?-1:a.ym>b.ym?1:a.plant<b.plant?-1:1}),q=list.slice();
  try{
    await Promise.all([0,1,2,3].map(async function(){
      while(q.length){var P=q.shift(),per=2500,n=Math.max(1,Math.ceil(P.lines.length/per)),id=P.plant+'-'+P.ym,groups={};
        Object.keys(P.groups).forEach(function(g){var G=P.groups[g];groups[g]={sheets:Math.round(G.sheets),sqft:Math.round(G.sqft),value:Math.round(G.value*100)/100,lines:G.lines}});
        for(var c=1;c<n;c++)await dset('creditnotes/'+id+'~'+c,{plant:P.plant,ym:P.ym,chunk:c,z:await gz(JSON.stringify(P.lines.slice(c*per,(c+1)*per))),upload:uid,demo:demo||undefined});
        await dset('creditnotes/'+id,{plant:P.plant,ym:P.ym,groups:groups,n:P.lines.length,chunks:n,z:await gz(JSON.stringify(P.lines.slice(0,per))),fmt:'gz-json v1: [doc,line,day,customer,item,group 0 Laminate 1 Door 2 PVC sheet 3 Compact board,sheets,value,baseDoc]',sys:U.sys,src:U.sys==='S4'?'billing credit memo':'ORIN/RIN1',upload:uid,at:atNow,demo:demo||undefined});
        done++;U.progress=Math.round(done/total*100);U.progressMsg='Writing plant-month '+done+' of '+total;var bar=$('#i-upload .bar i');if(bar)bar.style.width=U.progress+'%'}
    }));
    for(var ci=0;ci<r.covMonths.length;ci++)await dset('creditnotes/cov_'+r.covMonths[ci],{ym:r.covMonths[ci],cov:true,upload:uid,at:atNow,demo:demo||undefined});
    if(r.rejects.length){var rr=r.rejects.slice(0,1500);await dset('rejects/'+uid,{z:await gz(JSON.stringify(rr)),n:rr.length,total:r.rejected,demo:demo||undefined})}
  }catch(e){failed=e}
  var ms=Object.keys(r.months).sort();
  var upl={at:nowISO(),by:by,sys:U.sys,entity:'CN',file:U.name,size:U.size,mode:'historic',periodLabel:r.covMonths.length?(ymLabel(r.covMonths[0])+(r.covMonths.length>1?' to '+ymLabel(r.covMonths[r.covMonths.length-1]):'')):'',read:r.read,loaded:failed?0:r.good,rejected:r.rejected,skipped:r.rejected,warned:0,status:failed?'Failed':'Loaded',demo:demo||undefined,plantMonths:done,months:r.covMonths,
    fixes:{other_rows:r.other.rows,acp_rows:r.acp.rows,repeated_lines:r.dup,amount_loaded:Math.round(r.value),sheets_loaded:Math.round(r.sheets)},error:failed?dbErrText(failed):undefined};
  try{await dset('uploads/'+uid,upl);if(!failed){var mp={};Object.keys(U.map).forEach(function(k){mp[k]=U.map[k]>=0?U.headers[U.map[k]]:null});await dset('mappings/'+U.sys+'_creditnote',{map:mp,sys:U.sys,entity:'CN',at:nowISO(),by:by})}}catch(e2){failed=failed||e2}
  U.stage='done';U.doneOk=!failed;
  U.doneMsg=failed?('Load stopped: '+dbErrText(failed)+' '+done+' of '+total+' plant-months were stored.'):('Loaded '+fmtN(r.good)+' credit-note lines ('+fmtMoney(r.value)+') into '+done+' plant-months; '+r.covMonths.length+' months are now covered.'+(r.rejected?' '+fmtN(r.rejected)+' rows were skipped; the list is in Upload history.':''));
  cnRender();
}
Object.assign(handlers,{
 'cn-validate':async function(){await cnValidate();if(U&&U.stage==='validated'&&!window.__NOAUTOLOAD&&cnCanLoad()&&effRole()==='Super admin'&&!readOnly()){toast('Loading '+fmtN(U.res.good)+' credit-note lines; '+fmtN(U.res.rejected)+' skipped');await cnLoad()}},
 'cn-load':function(){return cnLoad()},
 'u-rejcsv-cn':function(){var r=U.res;return download('skipped-credit-note-rows.csv',csvLine(['row','document','line','field','reason','value'])+'\n'+r.rejects.map(csvLine).join('\n'))}
});
document.addEventListener('change',function(ev){
  var t=ev.target,c=t.getAttribute&&t.getAttribute('data-chg');
  if(c==='cn-map'){U.map[t.getAttribute('data-k')]=+t.value;U.savedMap=false;cnRender()}
  else if(c==='cn-confrep'){U.confirmReplace=t.checked;cnRender()}
});
function ingestCN(){
  S.cn=S.cnRaw.filter(function(d){return d.plant&&d.ym&&d.groups&&!d.chunk});
  var cov={};S.cnRaw.forEach(function(d){if(d.cov&&d.ym)cov[d.ym]=d.upload||1});S.cnCov=cov;
  DS.cache={};S.lastHtml='';S.engSig=null;schedule();
}
function cnUndoPlan(uid){var docs=S.cnRaw.filter(function(d){return d.upload===uid&&!d.cov});var ms={};docs.forEach(function(d){ms[d.ym]=1});return {docs:docs,cov:S.cnRaw.filter(function(d){return d.upload===uid&&d.cov}),months:Object.keys(ms).sort()}}
async function cnUndo(uid){
  var pl=cnUndoPlan(uid),u=S.uploads.find(function(x){return x._id===uid}),all=pl.docs.concat(pl.cov),q=all.slice();
  await Promise.all([0,1,2,3].map(async function(){while(q.length){var d=q.shift();await ddel('creditnotes/'+d._id)}}));
  await ddel('rejects/'+uid);
  if(u){var up=Object.assign({},u);delete up._id;await dset('uploads/'+uid,Object.assign(up,{status:'Undone',undone_at:nowISO(),undone_by:whoAmI(),undone_months:pl.months,undone_plant_months:pl.docs.filter(function(d){return !d.chunk}).length}))}
  await auditW('upload undone','',{upload:uid,file:((u&&u.file)||'').slice(0,120),months:pl.months,plant_months:pl.docs.length});
  await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:whoAmI(),event:'upload undone',upload:uid,months:pl.months});
  return pl;
}
/* ---- coverage grid row ---- */
function cnCov(qkey){
  var months=qMonths(qkey),cur=TODAY().slice(0,7),elig=months.filter(function(m){return m<=cur}),present=elig.filter(function(m){return S.cnCov[m]}).length,detail=months.map(function(ym){return {ym:ym,plants:S.cn.filter(function(d){return d.ym===ym}).length}});
  return {st:present===0?'miss':(present>=elig.length&&elig.length>0?'ok':'part'),detail:detail,ref:0,closed:!!(S.periods[qkey]&&S.periods[qkey].status==='closed')};
}

/* ================= the Net view (D40) ================= */
function cnMonthsCovered(ms){var cur=TODAY().slice(0,7),el=ms.filter(function(m){return m<=cur});return el.length>0&&el.every(function(m){return !!S.cnCov[m]})}
/* credit notes for a filter and window: {value,sheets,sqft,covered}. w: [{ym,frac}] or [ym]. Not available per salesperson. */
function cnFor(f,w){
  w=wins(w);var ms=w.map(function(x){return x.ym}),out={value:0,sheets:0,sqft:0,covered:false};
  if(f.sp!=null)return out;
  out.covered=cnMonthsCovered(ms);if(!out.covered)return out;
  w.forEach(function(x){S.cn.forEach(function(d){if(d.ym!==x.ym)return;if(f.plants&&!f.plants.has(d.plant))return;if(f.plant&&d.plant!==f.plant)return;
    Object.keys(d.groups).forEach(function(g){if(f.group&&g!==f.group)return;var G=d.groups[g];out.value+=G.value*x.frac;out.sheets+=G.sheets*x.frac;out.sqft+=(G.sqft||0)*x.frac})})});
  return out;
}
function cnPanel(ctx,f){
  var res=ctx.res,ms=res.curMonths&&res.curMonths.length?res.curMonths:(res.cur||[]).map(function(x){return x.ym||x}),cur=TODAY().slice(0,7);
  var base=Object.assign({plants:ctx.plants},ctx.base);if(f)Object.assign(base,f);
  if(base.sp!=null)return '';
  var rows=ms.filter(function(m){return m<=cur}).map(function(m){
    var A=sumF(base,[m]),cv=!!S.cnCov[m],C=cv?cnFor(base,[m]):null;
    return '<tr><td>'+esc(ymLabel(m))+'</td><td class="num">'+fmtMoney(A.n)+'</td><td class="num">'+fmtN(Math.round(A.sh))+'</td>'+(cv?'<td class="num">'+fmtMoney(C.value)+'</td><td class="num">'+fmtN(Math.round(C.sheets))+'</td><td class="num"><b>'+fmtMoney(A.n-C.value)+'</b></td><td class="num"><b>'+fmtN(Math.round(A.sh-C.sheets))+'</b></td>':'<td class="note" colspan="4">Credit notes not loaded</td>')+'</tr>'}).join('');
  if(!rows)return '';
  var allCov=cnMonthsCovered(ms);
  return '<section class="card"><div class="hd"><h2>Invoiced · Credit notes · Net</h2><span class="note">'+(allCov?'Net is the headline for this period':'Headline stays invoiced where credit notes are not loaded')+'</span></div><div class="tw hscroll"><table class="std"><thead><tr><th>Month</th><th class="num">Invoiced ₹</th><th class="num">Invoiced sheets</th><th class="num">Credit notes ₹</th><th class="num">Credit note sheets</th><th class="num">Net ₹</th><th class="num">Net sheets</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="note">Net = invoiced − credit notes. Targets are set on invoiced sales. Once every month of a quarter has credit notes loaded, achievement and growth for that quarter use Net; earlier quarters stay on invoiced. Growth compares Net with Net only when both quarters have credit notes, otherwise invoiced with invoiced.</p></section>';
}
