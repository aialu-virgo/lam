/* ================= SAP S/4HANA live feed card and "Load SAP feed" (D73, 7 Nov 2026) =================
 * Apps Script build only. The server (sap.gs.js) READS billing documents from S/4HANA from 1 Oct 2026 and stages them, in the register's own column layout, in the admin-only
 * collection "sapstage". This page turns the staged rows into cells when a Super admin clicks "Load SAP feed": the rows go through THIS page's register intake (detect, defaultMap,
 * runValidation, runLoad for sales; cnParse, cnLoad for credit memos), so mapping, validation, replace-a-plant-month, backups and the upload entry are the same code as a file upload.
 * Nothing is aggregated here a second time. The page only shows status: it never receives or shows a credential or an address. */
var SAPF={status:null,at:0,busy:false,msg:'',err:'',confirm:false,held:null,sig:''};
window.__sapf=SAPF;/* test hook: read-only view of the card state */
function sapIsGas(){return typeof window.__gasCall==='function'}
function sapSuper(){return effRole()==='Super admin'&&!readOnly()}
function sapRefreshStatus(){
  if(!sapIsGas()||effRole()!=='Super admin')return Promise.resolve();
  SAPF.at=Date.now();
  return window.__gasCall('sapStatus',[]).then(function(r){SAPF.status=r.status;SAPF.statusErr=''},function(e){SAPF.status=null;SAPF.statusErr=(e&&e.message)||'The feed status is not available.'}).then(function(){SAPF.sig='';renderFeed()});
}
function sapPending(st){return Object.keys((st&&st.staged)||{}).filter(function(m){return st.staged[m].status!=='loaded'}).sort()}
function sapRenderFeed(el){
  if(!sapIsGas())return false;
  var sa=effRole()==='Super admin';
  if(sa&&!SAPF.busy&&(SAPF.status===null?Date.now()-SAPF.at>15000:Date.now()-SAPF.at>60000))sapRefreshStatus();
  var st=SAPF.status,pill,h;
  if(!sa){
    h='<div class="hd"><h2>SAP S/4HANA live feed</h2><span class="pill mute">Not connected</span></div><p class="note" style="margin:0">Only a Super admin can see or load the SAP feed.</p>';
  }else if(!st){
    h='<div class="hd"><h2>SAP S/4HANA live feed</h2><span class="pill mute">Not connected</span></div><p class="note" style="margin:0">'+esc(SAPF.statusErr||'Reading the feed status...')+'</p>';
  }else{
    var pend=sapPending(st),errN=(st.errors||[]).length,ok=st.connected;
    pill='<span class="pill '+(ok?'ok':'mute')+'">'+(ok?'Connected':'Not connected')+'</span>';
    h='<div class="hd"><h2>SAP S/4HANA live feed</h2>'+pill+'</div>'
     +'<div class="kpis"><div class="kpi"><small>Last run (IST)</small><b>'+(st.lastAt?esc(istStr(st.lastAt)):'never')+'</b><small>'+esc(st.lastKind||'')+(st.lastAt&&st.lastOk===false?' &middot; failed':'')+'</small></div>'
     +'<div class="kpi"><small>Rows read</small><b>'+fmtN((st.read&&st.read.lines)||0)+'</b><small>'+fmtN((st.read&&st.read.headers)||0)+' documents</small></div>'
     +'<div class="kpi"><small>Rows loaded</small><b>'+fmtN((st.loaded&&st.loaded.rows)||0)+'</b><small>'+(st.loaded&&st.loaded.at?esc(istStr(st.loaded.at)):'not yet')+'</small></div>'
     +'<div class="kpi"><small>Waiting to load</small><b>'+fmtN(pend.reduce(function(a,m){return a+(st.staged[m].rows||0)},0))+'</b><small>'+esc(pend.map(ymLabel).join(', ')||'nothing')+'</small></div>'
     +'<div class="kpi"><small>Errors</small><b>'+fmtN(errN)+'</b><small>'+(errN?esc(st.errors[0].msg):'none')+'</small></div>'
     +(st.cust?'<div class="kpi"><small>Customer master</small><b>'+fmtN(st.cust.rows||0)+'</b><small>'+esc(st.cust.status||'')+(st.cust.loadedAt?' '+esc(istStr(st.cust.loadedAt)):st.cust.at?' '+esc(istStr(st.cust.at)):'')+(st.cust.counts?' · '+fmtN(st.cust.counts.pin6||0)+' with PIN, '+fmtN(st.cust.counts.noRegion||0)+' no region':'')+'</small></div>':'')+'</div>'
     +(function(){var gs=custGstinPlaced();return gs.n?'<p class="note" style="margin:0">'+fmtN(gs.n)+' customers placed in a state by their GSTIN (state blank or region not mapped): '+fmtN(gs.by.S4)+' S/4, '+fmtN(gs.by.B1)+' B1.</p>':''})()+(function(){var gp=custRegionGaps();return gp.n?'<div class="banner warn" style="display:block"><b>'+fmtN(gp.n)+' S/4 customers have a region with no state:</b> '+esc(Object.keys(gp.regions).sort().map(function(k){return k+' ('+gp.regions[k]+')'}).join(', '))+'. They count as "state unknown" until the region code is added to the state\'s aliases as SAP:&lt;code&gt; in Admin › Geography.</div>':''})()
     +'<p class="note" style="margin:0"><b>Next step:</b> '+esc(st.next||'')+'</p>';
    if(st.message&&st.lastOk===false)h+='<div class="banner err" style="display:block">'+esc(st.message)+'</div>';
    if(st.skippedMonths&&st.skippedMonths.length)h+='<p class="note" style="margin:0">Closed quarters are never re-read: skipped '+esc(st.skippedMonths.map(ymLabel).join(', '))+'.</p>';
    if(st.unresolved&&st.unresolved.rows)h+='<div class="banner warn" style="display:block"><b>Credit memos not loaded for '+esc(st.unresolved.months.map(ymLabel).join(', '))+':</b> '+fmtN(st.unresolved.rows)+' lines ('+fmtN(st.unresolved.codes)+' product codes, '+fmtMoney(st.unresolved.value)+') use S/4 product codes that are not in the item master. Credit coverage stays off until this is zero.</div>';
    if(SAPF.held&&SAPF.held.length)h+='<div class="banner warn" style="display:block"><b>Held: the feed would replace '+SAPF.held.reduce(function(a,x){return a+x.plants},0)+' plant-months that hold more lines than the new data</b> ('+esc(SAPF.held.map(function(x){return ymLabel(x.ym)}).join(', '))+'). The feed never confirms for itself.<label class="chip" style="margin-top:8px"><input type="checkbox" data-chg="sap-confrep" '+(SAPF.confirm?'checked':'')+'> I confirm: replace these months</label></div>';
    if(SAPF.err)h+='<div class="banner err" style="display:block">'+esc(SAPF.err)+'</div>';
    if(SAPF.msg)h+='<div class="banner '+(SAPF.busy?'info':'ok')+'" style="display:block">'+esc(SAPF.msg)+'</div>';
    h+='<div class="row"><button class="btn pri" data-act="sap-load" '+((pend.length||(st.cust&&st.cust.status==='staged'))&&!SAPF.busy&&sapSuper()?'':'disabled')+'>Load SAP feed</button><button class="btn" data-act="sap-refresh" '+(SAPF.busy?'disabled':'')+'>Refresh status</button></div>'
     +'<p class="note" style="margin:0">Settings, the shadow run and the daily trigger are in the Apps Script project (see the setup page). Read-only: nothing is written to SAP.</p>';
  }
  var sig=h;if(SAPF.sig===sig&&el.firstChild)return true;SAPF.sig=sig;el.innerHTML=h;return true;
}
function sapStageCol(hdr,name){var i=hdr.indexOf(name);if(i<0)throw new Error('The staged rows have no column '+name+'. Run sapSync again.');return i}
async function sapFeedLoad(){
  if(!sapIsGas()||SAPF.busy)return;
  if(!superOnly('load the SAP feed'))return;
  SAPF.busy=true;SAPF.msg='Reading the staged SAP rows...';SAPF.err='';SAPF.held=null;SAPF.sig='';renderFeed();
  var summary={months:[],rows:0,message:'',unresolved:null},stop=null;
  try{
    var snap=await S.db.collection('sapstage').get(),man={},chunks={},cman=null,cchunks={};
    snap.docs.forEach(function(d){var o=d.data();if(d.id==='cust_man')cman=o;else if(d.id.indexOf('cust_c_')===0)cchunks[d.id]=o;else if(d.id.indexOf('man_')===0)man[o.ym]=o;else if(d.id.indexOf('c_')===0)chunks[d.id]=o});
    /* ---- customer master first (D78): state, PIN and district then reach the billing rows loaded below ---- */
    var custDone=null;
    if(cman&&cman.complete&&cman.status!=='loaded'){
      var crows=[];for(var cs=0;cs<(cman.n||0);cs++){var cc=cchunks['cust_c_'+cman.run+'_'+cs];if(!cc)throw new Error('The staged customer rows are incomplete (part '+(cs+1)+' of '+cman.n+' is missing). Run sapCustomerSync again. Nothing was loaded.');JSON.parse(await ungz(cc.z)).forEach(function(r){crows.push(r)})}
      SAPF.msg='Loading '+fmtN(crows.length)+' staged customers...';renderFeed();
      custDone=await custFeedLoad({sys:'S4',headers:cman.cols,rows:crows,name:'SAP S/4 customer feed (run '+cman.run+')',layout:'S/4 business partner (SAP feed)'});
      if(!custDone.ok)throw new Error('Customer master not loaded: '+(custDone.msg||'stopped')+'. Nothing else was loaded.');
      await window.__gasCall('sapMarkLoaded',[{customers:{run:cman.run,rows:custDone.loaded}}]);
      SAPF.cust={loaded:custDone.loaded,rejected:custDone.rejected,gaps:custRegionGaps()};
    }
    var yms=Object.keys(man).filter(function(m){return man[m].complete&&man[m].status!=='loaded'}).sort();
    if(!yms.length){SAPF.msg=custDone?'Customer master loaded: '+fmtN(custDone.loaded)+' S/4 customers ('+fmtN(custDone.rejected)+' rejected). No billing month is waiting.':'Nothing is waiting to be loaded.';return}
    var skippedClosed=[],hdr=null,sales=[],cred={},cut=0,runs={};
    for(var mi=0;mi<yms.length;mi++){
      var ym=yms[mi],m=man[ym],q=S.periods[qKeyOfYm(ym)];
      if(q&&q.status==='closed'){skippedClosed.push(ym);continue}
      if(hdr&&JSON.stringify(hdr)!==JSON.stringify(m.cols))throw new Error('The staged months use different columns. Run sapSync again.');
      hdr=m.cols;runs[m.run]=1;
      var iDate=sapStageCol(hdr,'Invoice Date'),iType=sapStageCol(hdr,'Billing Type');
      for(var s=0;s<(m.n||0);s++){
        var c=chunks['c_'+ym+'_'+m.run+'_'+s];if(!c)throw new Error('The staged rows for '+ymLabel(ym)+' are incomplete (part '+(s+1)+' of '+m.n+' is missing). Run sapSync again. Nothing was loaded.');
        JSON.parse(await ungz(c.z)).forEach(function(r){
          if(String(r[iDate])<m.from){cut++;return}/* cut-off: nothing dated before the feed start is ever loaded */
          if(m.salesTypes.indexOf(String(r[iType]).toUpperCase())>=0)sales.push(r);else(cred[ym]=cred[ym]||[]).push(r);
        });
      }
    }
    var live=yms.filter(function(x){return skippedClosed.indexOf(x)<0}),handled=live.slice(),runTag=Object.keys(runs).join('+');
    if(!hdr){SAPF.msg='Every waiting month is in a closed quarter and was skipped.';return}
    /* ---- sales: the page's own register intake ---- */
    if(sales.length){
      SAPF.msg='Checking '+fmtN(sales.length)+' staged sales rows with the register intake...';renderFeed();
      U=newU();U.mode='historic';U.period='auto';U.entity='INV';U.closeAfter=false;U.expMonth='any';U.sys='S4';U.headers=hdr;U.rows=sales;U.size=0;U.source='SAP S/4 feed';
      U.name='SAP S/4 feed '+live[0]+(live.length>1?' to '+live[live.length-1]:'')+' (run '+runTag+')';U.map=defaultMap(hdr,'S4');U.stage='validating';
      await runValidation();
      if(U.stage!=='validated')throw new Error('The register intake did not finish checking the staged rows.');
      if(SAPF.confirm)U.confirmReplace=true;
      if(!canLoad(U.res,false)){
        var rk=replaceRisk(U.res);
        if(rk.length&&!U.confirmReplace){SAPF.held=rk;stop='Held: the feed would replace months that hold more lines than the new data. Tick the confirmation and load again, or leave them. Nothing was changed.';U=newU();renderUpload();throw new Error(stop)}
        var lk=cnLockedIn(oxMonthList(U.res));
        throw new Error(lk.length?'Credit notes are locked for '+lk.map(ymLabel).join(', ')+'; unlock them first. Nothing was changed.':'The register intake would not load these rows. Nothing was changed.');
      }
      SAPF.msg='Loading '+fmtN(U.res.good)+' good rows...';renderFeed();
      await runLoad({});
      if(!U.doneOk)throw new Error(U.doneMsg||'The load stopped.');
      summary.rows+=U.res.good;summary.message=U.doneMsg;
    }
    /* ---- credit memos: only months whose product codes all resolve in the item master get loaded and marked covered ---- */
    var idx=await loadItemIdx(),resolve=plantResolver(),un={rows:0,codes:{},value:0,months:[]},credLoaded=0;
    var iPlant=sapStageCol(hdr,'Plant'),iItem=sapStageCol(hdr,'Product Code'),iNet=sapStageCol(hdr,'Total Amount (Item)');
    for(var ci=0;ci<live.length;ci++){
      var cm=live[ci],cr=cred[cm]||[],gap=[];
      cr.forEach(function(r){var pl=resolve('S4',r[iPlant]);if(!pl||pl.business==='ACP'||+pl.plant_code>=1050)return;if(!idx.has(String(r[iItem]).trim().toUpperCase()))gap.push(r)});
      if(gap.length){un.rows+=gap.length;un.months.push(cm);gap.forEach(function(r){un.codes[r[iItem]]=1;un.value+=Math.abs(toNum(r[iNet])||0)});handled.splice(handled.indexOf(cm),1);continue}
      if(cnLockedIn([cm]).length){handled.splice(handled.indexOf(cm),1);SAPF.err=(SAPF.err?SAPF.err+' ':'')+'Credit notes for '+ymLabel(cm)+' are locked; unlock them to load the feed for that month.';continue}
      SAPF.msg='Loading credit memos for '+ymLabel(cm)+'...';renderFeed();
      var ld=cm+'-'+pad(ymDays(cm));
      U=newU();U.kind='cn';U.entity='CN';U.name='SAP S/4 feed credit memos '+cm+' (run '+runTag+')';U.size=0;U.headers=hdr;U.rows=cr;U.sys='S4';U.layout='S/4 billing credit memos (SAP feed)';U.map=cnDefaultMap(hdr);U.period={from:cm+'-01',to:ld};U.source='SAP S/4 feed';
      await cnValidate();
      if(U.stage!=='validated')throw new Error(U.msg||'The credit-note intake did not finish checking the staged rows.');
      U.allBranches=true;/* the month was read completely for all plants, so a plant with none has none */
      if(SAPF.confirm)U.confirmReplace=true;
      if(!cnCanLoad()){var rr=cnReplaceRisk(U.res);if(rr.length){SAPF.held=(SAPF.held||[]).concat(rr)}handled.splice(handled.indexOf(cm),1);U=newU();continue}
      await cnLoad();
      if(!U.doneOk)throw new Error(U.doneMsg||'The credit-note load stopped.');
      credLoaded+=U.res.good;summary.rows+=U.res.good;
    }
    summary.months=handled;summary.unresolved=un.rows?{rows:un.rows,codes:Object.keys(un.codes).length,value:un.value,months:un.months}:null;
    var parts=[];if(sales.length)parts.push('sales loaded');if(credLoaded)parts.push(fmtN(credLoaded)+' credit-memo lines loaded');if(skippedClosed.length)parts.push('closed quarters skipped: '+skippedClosed.map(ymLabel).join(', '));if(un.rows)parts.push(fmtN(un.rows)+' credit-memo lines held back (item master)');
    summary.message=(summary.message||'')+' '+parts.join('; ');
    await window.__gasCall('sapMarkLoaded',[summary]);
    SAPF.msg='Done. '+(custDone?fmtN(custDone.loaded)+' customers loaded; ':'')+fmtN(summary.rows)+' rows loaded'+(parts.length?' ('+parts.join('; ')+')':'')+'.';
  }catch(e){SAPF.err=(e&&e.message)||String(e);SAPF.msg=''}
  finally{SAPF.busy=false;SAPF.sig='';try{await sapRefreshStatus()}catch(e){}renderFeed()}
}
Object.assign(handlers,{
 'sap-load':function(){return sapFeedLoad()},
 'sap-refresh':function(){SAPF.err='';SAPF.msg='';return sapRefreshStatus()}
});
document.addEventListener('change',function(ev){var t=ev.target;if(t&&t.getAttribute&&t.getAttribute('data-chg')==='sap-confrep'){SAPF.confirm=t.checked;SAPF.sig='';renderFeed()}});
