/* ================= Customer master (D39, 23 Oct 2026): Admin, replace-all like the item master =================
 * One row per customer: [code, name, group, city, state, salesperson, credit limit, balance, payment terms]. Stored in customers/c<i> (gz, 3,000 rows each)
 * with customers/main as the index. Layouts: B1 OCRD (CardType C only) and S/4 business partner, plus synonyms and the mapping step.
 * Uses: a name wherever only a code shows; the salesperson as a suggestion where sales lacks one; credit limit and "over limit by" on the Receivables page.
 * Display and a rule-based flag only: no new automatic action. */
S.custMeta=null;S.custRaw=[];S.custIdx=new Map();S.custKey='';S.cu=null;
var CU_FIELDS=[
 {k:'code',label:'Customer code',canon:'customer_code',req:1,c:['CardCode','Customer','Customer Number','BP Code','Business Partner']},
 {k:'name',label:'Customer name',canon:'customer_name',req:1,c:['CardName','Name','Customer Name','Name 1','Business Partner Name']},
 {k:'type',label:'Type (C customer; others skipped)',canon:'bp_type',c:['CardType','Card Type','BP Type']},
 {k:'group',label:'Customer group',canon:'customer_group',c:['GroupName','Group Name','GroupCode','Customer Group']},
 {k:'city',label:'City',canon:'city',c:['City','Town']},
 {k:'state',label:'State / region',canon:'state',c:['State','Region','State/Region']},
 {k:'sp',label:'Salesperson',canon:'salesperson',c:['SlpName','Sales Employee','SlpCode','Sales Executive']},
 {k:'limit',label:'Credit limit',canon:'credit_limit',c:['CreditLine','Credit Limit','Credit limit amount','Credit Line']},
 {k:'bal',label:'Account balance',canon:'balance',c:['Balance','Account Balance','Current Balance']},
 {k:'terms',label:'Payment terms',canon:'payment_terms',c:['PymntGroup','Payment Terms','Payment Group','Terms']}];
function custDetect(headers){
  var set={};headers.forEach(function(h){set[norm(h)]=1});var has=function(a){return a.some(function(x){return set[norm(x)]})};
  if(has(['docnum','itemcode','linetotal','quantity','docduedate','branchname','tranfser','invoice document number','checksum','onhand','whscode']))return null;
  var code=has(['cardcode','customer number','bp code','business partner']),nm=has(['cardname','customer name','business partner name']);
  if(code&&nm&&has(['cardtype','groupname','creditline','credit limit','city','slpcode','slpname','pymntgroup']))return {sys:'B1',layout:'B1 customer master (OCRD)'};
  if(has(['customer'])&&has(['name'])&&has(['credit limit','credit limit amount','region','city']))return {sys:'S4',layout:'S/4 business partner'};
  return null;
}
function custDefaultMap(headers){var ix=headerIndex(headers),m={};CU_FIELDS.forEach(function(f){m[f.k]=-1;for(var i=0;i<f.c.length;i++){var k=norm(f.c[i]);if(k in ix){m[f.k]=ix[k];break}}});return m}
async function custPick(file){
  var st={stage:'working',name:file.name,size:file.size,msg:'Reading the file...',src:null,rows:null,headers:null,map:null,res:null};S.cu=st;S.lastHtml='';schedule();
  try{
    var src=await listSheets(file),pick=src.names[0],rows=await sheetRows(src,pick);
    if(!rows.length)throw new Error('The sheet is empty.');
    st.headers=rows[0].map(function(x){return x==null?'':String(x)});st.rows=rows.slice(1);st.sheet=pick;
    var d=custDetect(st.headers);st.layout=d?d.layout:'unknown layout, map the columns';st.sys=d?d.sys:'B1';
    st.map=custDefaultMap(st.headers);
    var sv=S.mappings[st.sys+'_customer_'+String(st.layout).toLowerCase().replace(/[^a-z0-9]+/g,'')];if(sv&&sv.map){var ix=headerIndex(st.headers);Object.keys(sv.map).forEach(function(k){var n=norm(sv.map[k]);if(sv.map[k]===null||sv.map[k]===''){st.map[k]=-1}else if(n in ix)st.map[k]=ix[n]})}
    st.stage='mapping';st.msg='';
  }catch(e){st.stage='idle';st.msg='Could not read the file: '+((e&&e.message)||e)}
  S.lastHtml='';schedule();
}
async function custParse(){
  var st=S.cu,m=st.map,rows=st.rows,c=function(k){return m[k]==null?-1:m[k]},cC=c('code'),cN=c('name'),cT=c('type'),cG=c('group'),cCi=c('city'),cS=c('state'),cSp=c('sp'),cL=c('limit'),cB=c('bal'),cP=c('terms');
  var res={read:rows.length,loaded:0,rejected:0,rejects:[],skippedType:0,warned:0,custs:[],withLimit:0,withSp:0};
  var seen={},T0=Date.now(),g=function(r,i){return i>=0?String(r[i]==null?'':r[i]).trim():''};
  st.stage='working';st.msg='Checking...';schedule();await tick();
  for(var i=0;i<rows.length;i++){
    if(Date.now()-T0>40){T0=Date.now();st.msg='Checking customer '+fmtN(i)+' of '+fmtN(rows.length);schedule();await tick()}
    var r=rows[i],code=g(r,cC).toUpperCase();
    if(!code&&!g(r,cN))continue;
    if(cT>=0){var ty=norm(g(r,cT));if(ty&&ty!=='c'&&ty!=='ccustomer'&&ty!=='customer'&&ty!=='cust'){res.skippedType++;continue}}
    if(!code){res.rejected++;if(res.rejects.length<20000)res.rejects.push([i+2,'','','Customer code','Customer code is empty','']);continue}
    if(seen[code]){res.rejected++;if(res.rejects.length<20000)res.rejects.push([i+2,code,'','Customer code','Duplicate customer code in file','']);continue}
    seen[code]=1;
    var lim=cL>=0?toNum(r[cL]):0,bal=cB>=0?toNum(r[cB]):0;
    if(isNaN(lim)){res.warned++;lim=0}if(isNaN(bal))bal=0;
    var sp=g(r,cSp);if(lim>0)res.withLimit++;if(sp)res.withSp++;
    res.custs.push([code,g(r,cN).slice(0,40),g(r,cG).slice(0,24),g(r,cCi).slice(0,24),g(r,cS).slice(0,20),sp.slice(0,30),Math.round(lim),Math.round(bal),g(r,cP).slice(0,20)]);res.loaded++;
  }
  st.res=res;st.stage='checked';st.msg='';S.lastHtml='';schedule();
}
async function custLoad(){
  if(!superOnly('load the customer master'))return;
  var st=S.cu,r=st&&st.res;if(!r||st.stage!=='checked')return;
  st.stage='loading';st.msg='Writing customers...';schedule();await tick();
  var uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),by=whoAmI(),failed=null,demo=!!st.demo;
  try{
    var per=3000,n=Math.max(1,Math.ceil(r.custs.length/per));
    for(var i=0;i<n;i++){await dset('customers/c'+i,{z:await gz(JSON.stringify(r.custs.slice(i*per,(i+1)*per))),n:Math.min(per,r.custs.length-i*per),i:i,upload:uid,fmt:'gz-json v1: [code,name,group,city,state,salesperson,credit limit,balance,payment terms]',demo:demo||undefined})}
    var old=(S.custMeta&&S.custMeta.chunks)||0;for(var j=n;j<old;j++)await ddel('customers/c'+j);
    await dset('customers/main',{at:nowISO(),by:by,file:st.name,layout:st.layout,sys:st.sys,read:r.read,loaded:r.loaded,rejected:r.rejected,skipped_type:r.skippedType,with_limit:r.withLimit,chunks:n,upload:uid,demo:demo||undefined});
    await dset('uploads/'+uid,{at:nowISO(),by:by,sys:st.sys,entity:'CU',file:st.name,size:st.size||0,mode:'master',periodLabel:'Customer master snapshot',read:r.read,loaded:r.loaded,rejected:r.rejected,skipped:r.rejected,warned:r.warned,status:'Loaded',demo:demo||undefined,fixes:{not_customers:r.skippedType}});
    if(r.rejects.length){var rr=r.rejects.slice(0,1500);await dset('rejects/'+uid,{z:await gz(JSON.stringify(rr)),n:rr.length,total:r.rejected,demo:demo||undefined})}
    var mp={};Object.keys(st.map).forEach(function(k){mp[k]=st.map[k]>=0?st.headers[st.map[k]]:null});await dset('mappings/'+st.sys+'_customer_'+String(st.layout).toLowerCase().replace(/[^a-z0-9]+/g,''),{map:mp,sys:st.sys,entity:'CU',at:nowISO(),by:by});
    await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:by,event:'customer master loaded',rows:r.loaded});
  }catch(e){failed=e}
  st.stage=failed?'checked':'done';st.msg=failed?('Load stopped: '+dbErrText(failed)):('Loaded '+fmtN(r.loaded)+' customers ('+fmtN(r.withLimit)+' with a credit limit). '+fmtN(r.skippedType)+' non-customer partners were counted, not stored.');
  S.lastHtml='';schedule();
}
function custHtml(){
  var st=S.cu,m=S.custMeta,h='<section class="card"><div class="hd"><h2>Customer master &middot; '+(m?fmtN(m.loaded)+' customers':'not loaded')+'</h2><div class="row"><label class="btn pri sm" for="up-cust" style="cursor:pointer">Upload customer master (XLSX or CSV)</label><input id="up-cust" data-mfile="cust" type="file" accept=".xlsx,.xls,.csv" style="position:absolute;opacity:0;width:1px;height:1px"><button class="btn sm" data-act="mst-tmpl" data-t="cust">Download template</button></div></div>';
  h+='<p class="note" style="margin:0">B1 OCRD (customers only, CardType C) or the S/4 business partner list. Each load replaces the whole master. Used to name customers wherever only a code shows, to suggest the salesperson, and to show the credit limit and "over limit by" next to open receivables.</p>';
  if(m)h+='<div class="kpis"><div class="kpi"><small>Customers stored</small><b>'+fmtN(m.loaded)+'</b><small>'+fmtN(m.with_limit||0)+' with a credit limit</small></div><div class="kpi"><small>Rejected rows</small><b>'+fmtN(m.rejected)+'</b></div><div class="kpi"><small>Loaded</small><b style="font-size:14px;font-family:var(--font)">'+esc(istStr(m.at))+'</b><small>'+esc((m.by||'').split('@')[0])+' · '+esc(m.file||'')+'</small></div></div>';
  else h+='<div class="empty">No customer master yet.</div>';
  if(st&&st.msg&&(st.stage==='idle'||st.stage==='working'||st.stage==='done'||st.stage==='checked'))h+='<div class="banner '+(st.stage==='idle'?'err':'info')+'">'+esc(st.msg)+'</div>';
  if(st&&st.stage==='mapping'){
    var rows=CU_FIELDS.map(function(f){var cur=st.map[f.k];if(cur==null)cur=-1;
      var opts='<option value="-1"'+(cur<0?' selected':'')+'>unmapped</option>'+st.headers.map(function(hd,i){return '<option value="'+i+'"'+(cur===i?' selected':'')+'>'+esc(hd===''?'(blank header, col '+(i+1)+')':hd)+'</option>'}).join('');
      var sample='';if(cur>=0){for(var r=0;r<Math.min(st.rows.length,50);r++){var v=st.rows[r][cur];if(v!==''&&v!=null){sample=String(v);break}}}
      return '<tr><td><select class="in" data-chg="cu-map" data-k="'+f.k+'" aria-label="File column for '+esc(f.label)+'">'+opts+'</select></td><td><b>'+esc(f.label)+'</b><div class="note mono">'+f.canon+'</div></td><td>'+(f.req?'<span class="pill info">Required</span>':'<span class="pill mute">Optional</span>')+'</td><td class="mono break" style="max-width:180px">'+esc(sample.slice(0,60))+'</td></tr>'}).join('');
    var miss=CU_FIELDS.filter(function(f){return f.req&&(st.map[f.k]==null||st.map[f.k]<0)}).map(function(f){return f.label});
    h+='<div class="banner info"><span><b>'+esc(st.name)+'</b> &middot; '+fmtN(st.rows.length)+' rows &middot; detected <b>'+esc(st.layout)+'</b></span></div><div class="tw"><table><thead><tr><th>File column</th><th>Canonical field</th><th>Need</th><th>Sample</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(miss.length?'<div class="banner err">Map these first: '+esc(miss.join(', '))+'</div>':'')+'<div class="row"><button class="btn pri" data-act="cu-check" '+(miss.length?'disabled':'')+'>Confirm and check</button><button class="btn" data-act="mst-reset" data-k="cu">Cancel</button></div>';
  }
  if(st&&st.res&&(st.stage==='checked'||st.stage==='loading'||st.stage==='done')){var r=st.res;
    h+='<div class="kpis"><div class="kpi"><small>Rows read</small><b>'+fmtN(r.read)+'</b></div><div class="kpi"><small>Customers loading</small><b>'+fmtN(r.loaded)+'</b></div><div class="kpi"><small>Not customers (skipped, counted)</small><b>'+fmtN(r.skippedType)+'</b></div><div class="kpi"><small>Rows rejected</small><b>'+fmtN(r.rejected)+'</b></div><div class="kpi"><small>With a credit limit</small><b>'+fmtN(r.withLimit)+'</b></div><div class="kpi"><small>With a salesperson</small><b>'+fmtN(r.withSp)+'</b></div></div>';
    if(r.rejected)h+='<div class="row"><button class="btn sm" data-act="cu-rejcsv">Download rejected rows (CSV)</button></div>';
    if(st.stage==='checked')h+='<div class="row"><button class="btn pri" data-act="cu-load" '+(r.loaded>0&&!readOnly()?'':'disabled')+'>Load '+fmtN(r.loaded)+' customers (replaces the master)</button><button class="btn" data-act="mst-reset" data-k="cu">Cancel</button></div>';
    if(st.stage==='done')h+='<div class="row"><button class="btn sm" data-act="mst-reset" data-k="cu">Upload another file</button></div>';
  }
  return h+'</section>';
}
Object.assign(handlers,{
 'cu-check':function(){return custParse()},
 'cu-load':function(){return custLoad()},
 'cu-rejcsv':function(){return download('rejected-customer-rows.csv',csvLine(['row','code','','field','reason','value'])+'\n'+S.cu.res.rejects.map(csvLine).join('\n'))}
});
document.addEventListener('change',function(ev){
  var t=ev.target,c=t.getAttribute&&t.getAttribute('data-chg');
  if(c==='cu-map'&&S.cu){S.cu.map[t.getAttribute('data-k')]=+t.value;S.lastHtml='';schedule()}
});
/* ---- ingest: customers/c<i> -> S.custIdx (code -> row) ---- */
function ingestCust(){
  var meta=S.custRaw.find(function(x){return x._id==='main'})||null;S.custMeta=meta;
  var key=meta?(meta.upload||'')+'|'+(meta.at||'')+'|'+(meta.chunks||0):'';
  if(key===S.custKey)return;S.custKey=key;
  if(!meta){S.custIdx=new Map();S.lastHtml='';schedule();return}
  var dm={};S.custRaw.forEach(function(x){dm[x._id]=x});
  (async function(){
    var idx=new Map();
    for(var i=0;i<(meta.chunks||0);i++){var d=dm['c'+i];if(!d)continue;try{JSON.parse(await ungz(d.z)).forEach(function(a){idx.set(a[0],a)})}catch(e){}}
    if(key!==S.custKey)return;
    S.custIdx=idx;DS.cache={};S.engSig=null;S.lastHtml='';schedule();
  })();
}
/* [code,name,group,city,state,salesperson,limit,balance,terms] or null */
function custInfo(code){return S.custIdx&&S.custIdx.size?(S.custIdx.get(String(code||'').toUpperCase())||null):null}
function custName(code,fallback){var c=custInfo(code);return (fallback&&String(fallback).trim())||(c?c[1]:'')}
