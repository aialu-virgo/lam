/* ================= Targets & Potential by State (plan P1; D70, D71, D77-D80; design/wireframes/targets-potential-geo.html) =================
   Records live in "potential": key (fy_quarter, state_code, district_id | '_state', product_group, customer_segment), _id = slug('geo_'+...).
   The _state record is the only required one; districts are optional slices; unallocated = state total - districts, derived, never stored.
   Plant-keyed records (no state_code) are legacy: frozen, read only, shown in "Legacy (by plant)".
   Rules: planGuard, proposerOf, advanceDoc (70-admin.js); masters and attributed actuals: 71-geo.js. */
S.tp={q:'',st:'',view:'state',grp:'Laminate',seg:false,ed:{},ph:{},open:{},sel:{},ret:false,retText:'',msg:'',up:null};
var TP_SRC=[['dealer / market survey','Dealer survey'],['branch estimate','Branch estimate'],['industry data','Industry data']];
function tpSrcLabel(v){var t=TP_SRC.find(function(s){return s[0]===v});return t?t[1]:(v||'Source')}
function tpCanEdit(){var r=effRole();return !readOnly()&&(r==='Branch / depot manager'||r==='Management / HO'||r==='Super admin')}
function tpCanApprove(){var r=effRole();return !readOnly()&&(r==='Management / HO'||r==='Super admin')}
function tpView(){var r=effRole();return r==='Branch / depot manager'?'bm':r==='HOD'?'hod':r==='Sales executive'?'se':r==='Management / HO'?'mg':'sa'}
function tpIN(n,dp){if(n==null||isNaN(n))return '';return Number(n).toLocaleString('en-IN',{maximumFractionDigits:dp==null?2:dp,minimumFractionDigits:0})}
function tpNum(s){if(s==null)return null;var n=toNum(s);return isNaN(n)?null:n}
function tpQRange(k){var m=qMonths(k);return MON[+m[0].slice(5,7)-1]+'–'+MON[+m[2].slice(5,7)-1]+' '+m[2].slice(0,4)}
/* geography starts at the current open quarter, or the next one if that quarter has an Approved or Locked plant record (D79); DEMO plant records do not count */
function geoStartQ(){
  var cur=curQuarterKey(),rule=S.potential.some(function(x){return !x.state_code&&!x.demo&&x.fy_quarter===cur&&(x.status==='Approved'||x.status==='Locked')})?nextQ(cur):cur;
  var g=S.potential.filter(function(x){return x.state_code&&/^FY\d\d-Q[1-4]$/.test(x.fy_quarter||'')}).map(function(x){return x.fy_quarter}).sort()[0];
  return g&&g<rule?g:rule;
}
function isGeoQ(q){return q>=geoStartQ()}
function tpQ(){if(!S.tp.q)S.tp.q=curQuarterKey()<geoStartQ()?geoStartQ():curQuarterKey();return S.tp.q}
function tpQuarters(){
  var cur=curQuarterKey(),gs=geoStartQ(),set={};closedQuarters().concat([cur,nextQ(cur),nextQ(nextQ(cur)),gs]).forEach(function(k){set[k]=1});
  S.potential.forEach(function(x){if(/^FY\d\d-Q[1-4]$/.test(x.fy_quarter||''))set[x.fy_quarter]=1});
  return Object.keys(set).sort().reverse();
}
/* no DEMO plan record stands in once real sales are loaded (D55) */
function geoRealSales(){var k='grs'+Object.keys(S.cells).length+S.cellsSigTick;if(DS.cache[k]!=null)return DS.cache[k];var r=Object.keys(S.cells).some(function(id){var c=S.cells[id];return c.entity==='INV'&&Object.keys(c.plants||{}).some(function(p){return !c.plants[p].demo})});DS.cache[k]=r;return r}
function tpVisible(x){if(!x.demo)return true;if(x.state_code)return !geoRealSales();return !realActual(x.plant_code,x.fy_quarter)}
function geoLeaves(q){return S.potential.filter(function(x){return x.fy_quarter===q&&x.state_code&&tpVisible(x)})}
function geoKey(q,st,did,group,seg){return slug('geo_'+[q,st,did||'_state',group,seg||'All'].join('_'))}
function geoPhKey(q,st,did,group){return slug('geo_'+[q,st,did||'_state',group].join('_'))}
/* who edits (D79): state record = default plant's Branch manager, Management / HO, Super admin; district = responsible plant's Branch manager, Management / HO, Super admin */
function tpCanState(st){return tpCanEdit()&&!planGuard({state_code:st,district_id:'_state'})}
function tpCanDistrict(st,did){return tpCanEdit()&&!planGuard({state_code:st,district_id:did})}
function tpStates(q,cq,pL,aggQ,aggP,aggMine){
  var u=effUser(),r=u.role,held=codesOf(u),set={};
  if(r==='Sales executive'){Object.keys(aggMine).forEach(function(k){if(k.indexOf('|')>0&&aggMine[k].n>0)set[k.split('|')[0]]=1})}
  else{
    cq.concat(pL).forEach(function(x){set[x.state_code]=1});
    [aggQ,aggP].forEach(function(a){Object.keys(a).forEach(function(k){if(k.indexOf('|')>0&&a[k].n>0)set[k.split('|')[0]]=1})});
    Object.keys(GEO.states).forEach(function(c){if(geoDefaultPlant(c))set[c]=1});
    if(r==='Branch / depot manager'){var mine={};Object.keys(GEO.states).forEach(function(c){if(held.indexOf(geoDefaultPlant(c))>=0)mine[c]=1});Object.keys(GEO.districts).forEach(function(id){var d=GEO.districts[id];if(d.active!==false&&held.indexOf(d.responsible_plant_code)>=0)mine[d.state_code]=1});set=mine}
  }
  delete set['00'];
  return Object.keys(set).filter(function(c){return GEO.states[c]}).sort(function(a,b){return stateName(a)<stateName(b)?-1:1});
}
function tpKnownSegs(){var o={};S.potential.forEach(function(x){if(x.state_code&&x.customer_segment&&x.customer_segment!=='All')o[x.customer_segment]=1});return Object.keys(o).sort()}
/* one editable leaf: saved document (x) overlaid with the person's unsaved edits */
function tpVM(q,st,did,group,seg,x,dsh,can){
  var key=geoKey(q,st,did,group,seg),e=S.tp.ed[key]||{};
  var sPot=x&&x.potential_value_inr!==''&&x.potential_value_inr!=null?+x.potential_value_inr:null,sShare=x&&x.share_pct!==''&&x.share_pct!=null?+x.share_pct:null;
  var pot=e.pot!==undefined?tpNum(e.pot):sPot,share=e.share!==undefined?tpNum(e.share):sShare;
  var tgt=e.tgt!==undefined?tpNum(e.tgt):(pot!=null&&share!=null?leafTgt(pot,share):null);
  var sugg=(share==null&&tgt==null&&pot!=null&&dsh!=null)?leafTgt(pot,dsh):null;
  var src=e.src!==undefined?e.src:(x?x.source_type:'branch estimate'),note=e.note!==undefined?e.note:(x?x.source_note||'':'');
  var sh=e.sh!==undefined?tpNum(e.sh):(x&&+x.potential_qty_sheets>0?+x.potential_qty_sheets:null),sq=e.sq!==undefined?tpNum(e.sq):(x&&+x.potential_qty_sqft>0?+x.potential_qty_sqft:null);
  var dirty=!!S.tp.ed[key]&&(x?(pot!==sPot||share!==sShare||src!==x.source_type||note!==(x.source_note||'')||sh!==(+x.potential_qty_sheets>0?+x.potential_qty_sheets:null)||sq!==(+x.potential_qty_sqft>0?+x.potential_qty_sqft:null)||(e.tgt!==undefined&&Math.abs((tgt||0)-(sShare!=null&&sPot!=null?leafTgt(sPot,sShare):0))>0.005)):(pot!=null||share!=null||tgt!=null));
  return {key:key,q:q,st:st,did:did||'_state',group:group,seg:seg,x:x||null,e:e,pot:pot,share:share,tgt:tgt,sugg:sugg,dsh:dsh,src:src,note:note,sh:sh,sq:sq,dirty:dirty,status:x?x.status:null,can:!!can,
    proposer:x?proposerOf(x):'',ap:x?approvedOf(x):null};
}
function tpAggStatus(vms){
  var st=vms.filter(function(v){return v.x}).map(function(v){return v.status});
  if(!st.length)return 'Not started';if(st.indexOf('Draft')>=0)return 'Draft';if(st.indexOf('Discussed')>=0)return 'Proposed';
  if(st.every(function(s){return s==='Locked'}))return 'Locked';return 'Approved';
}
/* attributed actuals: a locked quarter reads its lock-time snapshot; others read the loaded invoice detail */
function tpAgg(q,sc){if(isPlanLocked(q)){var s=geoSnap(q);if(s)return s}return geoAgg(qMonths(q),sc)}
function tpLoadNeeded(q){var cur=curQuarterKey(),qs=closedQuarters().slice(-6),yms=[];qs.concat([q,prevQ(q)]).forEach(function(k){if(k<=cur)qMonths(k).forEach(function(m){if(yms.indexOf(m)<0)yms.push(m)})});return yms}
function tpSeries(st,group,sc){
  var k='tgs'+st+'|'+group+'|'+GEOA.ver+'|'+GEO.ver+'|'+S.custKey+(sc&&sc.sp?'sp':'');if(DS.cache[k])return DS.cache[k];
  var ser=closedQuarters().map(function(cq){var ms=qMonths(cq);if(!geoMonthsLoaded(ms)||!ms.some(function(m){return S.cells['INV_'+m]}))return null;var a=geoAgg(ms,sc)[st+'|'+group];return a?a.n:0});
  var r={ts:trendStats(ser)};DS.cache[k]=r;return r;
}
function tpModel(){
  var q=tpQ(),pq=prevQ(q),cur=curQuarterKey(),locked=isPlanLocked(q),cq=geoLeaves(q),pL=geoLeaves(pq),sc=SC(),u=effUser();
  var aggQ=q<=cur?tpAgg(q,sc.sp?sc:null):{},aggP=pq<cur?tpAgg(pq,sc.sp?sc:null):{},segs=tpKnownSegs();
  var pqLoaded=pq<cur&&(isPlanLocked(pq)&&geoSnap(pq)?true:geoMonthsLoaded(qMonths(pq))&&qMonths(pq).some(function(m){return S.cells['INV_'+m]}));
  var states=tpStates(q,cq,pL,aggQ,aggP,sc.sp?aggQ:{});
  var out={q:q,locked:locked,geo:isGeoQ(q),states:[],rows:[],dist:[],started:false,unknown:(aggQ['00|Laminate']||{n:0}).n};
  GROUPS.forEach(function(g){var a=aggQ['00|'+g];if(a&&g!=='Laminate')out.unknown+=a.n});
  states.forEach(function(st){
    if(S.tp.st&&S.tp.st!==st)return;
    var canSt=!locked&&tpCanState(st),grp=[];
    GROUPS.forEach(function(g){
      var leaves=cq.filter(function(x){return x.state_code===st&&x.product_group===g&&(x.district_id||'_state')==='_state'});
      var dleaves=cq.filter(function(x){return x.state_code===st&&x.product_group===g&&x.district_id&&x.district_id!=='_state'});
      var a=aggQ[st+'|'+g]||null,ap=aggP[st+'|'+g]||null;
      var lp=0,anyP=false;pL.forEach(function(x){if(x.state_code===st&&x.product_group===g&&(x.district_id||'_state')==='_state'){var s=approvedOf(x)||x;if(+s.potential_value_inr>0){lp+=+s.potential_value_inr;anyP=true}}});
      var last={A:pqLoaded?(ap?ap.n:0):null,state:pq>=cur?'open':(pqLoaded?'ok':'incomplete'),pq:pq,pot:anyP?lp:null,dsh:null,ts:null,dist:ap?ap.dist:{},un:ap?ap.un:0};
      if(last.A!=null&&last.pot>0)last.dsh=r2(r2(last.A/last.pot*100)+(+CFG.default_share_uplift_pts||0));
      if(!sc.sp&&last.A!=null)last.ts=tpSeries(st,g,null).ts;
      var allL=leaves.find(function(x){return x.customer_segment==='All'}),segL=leaves.filter(function(x){return x.customer_segment!=='All'});
      var mode=segL.length&&!(allL&&+allL.potential_value_inr>0)?'seg':'all',kids=[],main=null;
      if(mode==='all'){main=tpVM(q,st,'_state',g,'All',allL,last.dsh,canSt);
        if(S.tp.seg&&!(allL&&+allL.potential_value_inr>0)&&!main.dirty)segs.forEach(function(sg){kids.push(tpVM(q,st,'_state',g,sg,segL.find(function(x){return x.customer_segment===sg}),null,canSt))})}
      else{var names={};segL.forEach(function(x){names[x.customer_segment]=1});if(S.tp.seg)segs.forEach(function(sg){names[sg]=1});
        Object.keys(names).sort().forEach(function(sg){kids.push(tpVM(q,st,'_state',g,sg,segL.find(function(x){return x.customer_segment===sg}),null,canSt))})}
      var vms=mode==='seg'?kids:(kids.some(function(k){return k.x||k.dirty})?kids:[main]);
      var pot=null,tgt=null,orig=null,curT=null,anyAp=false;
      vms.forEach(function(v){if(v.pot!=null)pot=(pot||0)+v.pot;if(v.tgt!=null)tgt=(tgt||0)+v.tgt;
        if(v.ap){anyAp=true;var og=v.x&&v.x.original||v.ap;orig=(orig||0)+leafTgt(og.potential_value_inr,og.share_pct);curT=(curT||0)+leafTgt(v.ap.potential_value_inr,v.ap.share_pct)}});
      var sugg=main&&main.sugg!=null?main.sugg:null,tShow=tgt!=null?tgt:sugg;
      /* district split (optional): districts in the master for the state, plus any stored district record */
      var dids={};geoDistrictsOf(st).forEach(function(d){dids[d.district_id]=1});dleaves.forEach(function(x){dids[x.district_id]=1});
      var dvms=Object.keys(dids).sort(function(x,y){return geoDistrictName(x)<geoDistrictName(y)?-1:1}).map(function(id){var x=dleaves.find(function(l){return l.district_id===id&&(l.customer_segment||'All')==='All'});
        var lpd=0,anyD=false;pL.forEach(function(l){if(l.state_code===st&&l.product_group===g&&l.district_id===id){var s=approvedOf(l)||l;if(+s.potential_value_inr>0){lpd+=+s.potential_value_inr;anyD=true}}});
        var la=last.A!=null?(last.dist[id]||0):null,dd=la!=null&&anyD&&lpd>0?r2(r2(la/lpd*100)+(+CFG.default_share_uplift_pts||0)):null;
        var v=tpVM(q,st,id,g,'All',x,dd,!locked&&tpCanDistrict(st,id));v.lastA=la;v.lastPot=anyD?lpd:null;v.ach=a?(a.dist[id]||0):(q<=cur?0:null);v.plant=geoDistrictPlant(id);return v});
      var dSum=0,dAny=false;dvms.forEach(function(v){if(v.pot!=null&&(v.x||v.dirty)){dSum+=v.pot;dAny=true}});
      var stateTot=pot!=null?pot:(dAny?dSum:null);
      var stateShare=main&&main.share!=null?main.share:(main?main.dsh:null);
      var row={st:st,group:g,mode:mode,main:main,kids:kids,vms:vms,last:last,pot:pot,tgt:tgt,sugg:sugg,tShow:tShow,orig:orig,cur:curT,anyAp:anyAp,status:tpAggStatus(vms.filter(function(v){return v.x})),
        started:vms.some(function(v){return v.x||v.dirty})||dvms.some(function(v){return v.x||v.dirty}),canSt:canSt,parentEditable:mode==='all'&&!kids.length,gkey:geoPhKey(q,st,'_state',g),
        ach:q<=cur?(a?a.n:0):null,agg:a,dvms:dvms,dSum:dSum,dAny:dAny,stateTot:stateTot,derived:pot==null&&dAny,
        unalloc:dAny&&stateTot!=null?r2(stateTot-dSum):null,over:dAny&&pot!=null&&dSum>pot+0.01?r2(dSum-pot):0,stateShare:stateShare};
      row.unallocTgt=row.unalloc!=null&&row.unalloc>0&&stateShare!=null?leafTgt(row.unalloc,stateShare):null;
      var stv=tShow!=null&&last.A!=null&&last.ts?stretchOf(tShow,last.A,last.ts):{state:'na'};
      row.stretch=stv.state==='stretch';row.qoq=tShow!=null?qoqOf(tShow,last.A,{incomplete:last.A==null&&last.state==='incomplete'}):null;
      if(row.started)out.started=true;
      grp.push(row);out.rows.push(row);
    });
    out.states.push({code:st,rows:grp,canSt:canSt});
  });
  return out;
}
/* ---------- rendering ---------- */
function tpPill(st,extra){var m={Approved:'tp-ok',Draft:'tp-draft',Proposed:'tp-prop',Locked:'tp-lock','Not started':'tp-ns','Not entered':'tp-ns'}[st]||'tp-ns';return '<span class="tp-pill '+m+'">'+esc(st)+'</span>'+(extra||'')}
function tpInput(vm,field,val,ph,label,cls,editable,dflt){
  if(!editable)return val!==''&&val!=null?'<span class="mono">'+esc(val)+'</span>':'<span class="tp-mut">—</span>';
  return '<input class="tp-in '+cls+(dflt?' dflt':'')+'" id="tp-'+field+'-'+vm.key+'" data-tp="'+field+'" data-key="'+esc(vm.key)+'" value="'+esc(val==null?'':val)+'" placeholder="'+esc(ph||'')+'" aria-label="'+esc(label)+'" inputmode="decimal">';
}
function tpCells(vm,editable,lab){
  var dsh=vm.share==null?vm.dsh:null;
  var potIn=tpInput(vm,'pot',editable?(vm.e.pot!==undefined?vm.e.pot:(vm.pot!=null?tpIN(vm.pot):'')):(vm.pot!=null?tpIN(vm.pot):''),'enter potential','Potential ₹ '+lab,'pot',editable,false);
  var shVal=vm.e.share!==undefined?(tpNum(vm.e.share)!=null?tpNum(vm.e.share).toFixed(2):vm.e.share):(vm.share!=null?vm.share.toFixed(2):'');
  var shIn=tpInput(vm,'share',shVal,dsh!=null?dsh.toFixed(2):'','Share % '+lab,'share',editable,vm.share==null&&dsh!=null);
  var tgVal=vm.e.tgt!==undefined?vm.e.tgt:(vm.tgt!=null?tpIN(vm.tgt):'');
  var tgIn=tpInput(vm,'tgt',tgVal,vm.tgt==null&&vm.sugg!=null?tpIN(vm.sugg):'','Target ₹ '+lab,'tgt',editable,vm.tgt==null&&vm.sugg!=null);
  return {pot:'<div class="tp-c" data-l="Potential ₹">'+potIn+'</div>',share:'<div class="tp-c" data-l="Share %">'+shIn+'</div>',tgt:'<div class="tp-c" data-l="Target ₹">'+tgIn+'</div>'};
}
function tpAchCell(ach,tgt){
  if(ach==null)return '<div class="tp-c tp-n" data-l="Achieved so far"><span class="tp-mut">—</span></div>';
  return '<div class="tp-c tp-n" data-l="Achieved so far"><span class="mono">'+tpIN(Math.round(ach))+'</span><small class="tp-mut">'+(tgt>0?(ach/tgt*100).toFixed(1)+'% of target':'no target yet')+'</small></div>';
}
function tpLastCell(l){return '<div class="tp-c tp-n" data-l="Last quarter actual">'+(l.A!=null?'<span class="mono">'+tpIN(Math.round(l.A))+'</span><small class="tp-mut">'+qLabel(l.pq)+(l.pot!=null?' · potential '+tpIN(l.pot):'')+'</small>':'<span class="tp-mut">'+(l.state==='open'?'Quarter still open':'incomplete history')+'</span>')+'</div>'}
function tpQoq(row){
  if(row.tShow==null)return '<span class="tp-mut">—</span>';
  var q=row.qoq;if(!q||q.state!=='ok')return qoqCell(q);
  return '<span class="mono '+(q.v>=0?'up':'dn')+'">'+fmtPct(q.v,true,2)+'</span>'+(row.stretch?' <span class="tp-pill tp-str" title="For discussion; never blocks approval">Stretch</span>':'');
}
function tpSelBox(v,model,label){
  if(!tpCanApprove()||model.locked||!v.x||v.status!=='Discussed')return '';
  if(v.proposer===effUser().email)return '<small class="tp-own">You proposed this: another approver needed</small>';
  return '<label class="tp-ck"><input type="checkbox" data-tp="sel" data-key="'+esc(v.key)+'" aria-label="Select for approval '+esc(label)+'"'+(S.tp.sel[v.key]?' checked':'')+'> select</label>';
}
function tpStatusCell(row,model){
  var vms=row.vms.filter(function(v){return v.x}),st=row.status,extra='';
  if(st==='Approved'||st==='Locked'){var ap=vms.map(function(v){return v.ap&&v.ap.by}).filter(Boolean);extra=ap.length?'<small>approved by '+esc(userName(ap[ap.length-1]))+'</small>':''}
  else if(st==='Proposed'){var pr=vms.map(function(v){return v.proposer}).filter(Boolean);extra='<small>by '+esc(pr[0]||'')+'</small>'}
  else if(st==='Draft'){var dv=vms.filter(function(v){return v.status==='Draft'});extra='<small>rev '+((dv[0]&&dv[0].x.rev)||1)+' · '+esc(userName(dv[0]&&dv[0].proposer||''))+'</small>'}
  var h=tpPill(st,extra);
  if(row.mode==='all'&&row.main&&row.vms[0]===row.main)h+=tpSelBox(row.main,model,stateName(row.st)+' '+row.group);
  return '<div class="tp-c" data-l="Status">'+h+'</div>';
}
function tpOrigCell(row){
  var h;
  if(row.anyAp&&row.cur!=null){
    h=Math.abs((row.orig||0)-row.cur)<0.005?'<div><span class="tp-mut">Original = current</span> <b class="mono">'+tpIN(row.cur)+'</b></div>':'<div><span class="tp-mut">Original</span> <span class="mono">'+tpIN(row.orig)+'</span><br><span class="tp-mut">Current</span> <b class="mono">'+tpIN(row.cur)+'</b></div>';
    if(row.status==='Draft'||row.status==='Proposed')h+='<small class="tp-mut">Newer revision pending</small>';
  }else if(row.started)h='<div class="tp-mut">No approved target yet. Draft is shown, not counted.</div>';
  else h='<div class="tp-mut">No approved target yet</div>';
  return '<div class="tp-c" data-l="Original vs current target">'+h+'</div>';
}
function tpPhasing(row,model,editable){
  var t=row.tgt;
  if(t==null)return '<div class="tp-phs"><b>Monthly phasing</b><p class="tp-mut">Appears once a target exists. Default: equal split.</p></div>';
  var q=model.q,ms=qMonths(q),wd=ms.map(WD),wsum=wd.reduce(function(a,b){return a+b},0),wpct=wd.map(function(d){return d/wsum*100});
  var cur=phasingFor({fy_quarter:q,state_code:row.st,district_id:'_state',product_group:row.group,customer_segment:'All'});
  var near=function(a,b){return a.every(function(v,i){return Math.abs(v-b[i])<0.01})};
  var st=S.tp.ph[row.gkey],m=st?st.m:(near(cur,[100/3,100/3,100/3])?'equal':near(cur,wpct)?'wd':'custom');
  var cust=st?st.c:(m==='custom'?cur.map(function(v){return String(r2(v))}):['','','']);
  var eq=monthsOfTarget(t,[100/3,100/3,100/3]),wm=monthsOfTarget(t,wpct),csum=cust.reduce(function(a,v){return a+(tpNum(v)||0)},0);
  var rad=function(v,l){return '<label><input type="radio" name="tp-ph-'+row.gkey+'" data-tp="ph" data-g="'+esc(row.gkey)+'" value="'+v+'"'+(m===v?' checked':'')+(editable?'':' disabled')+'> '+l+'</label>'};
  return '<div class="tp-phs"><div class="tp-phh"><b>Monthly phasing</b><span class="tp-seg2" role="radiogroup" aria-label="Phasing method">'+rad('equal','Equal split')+rad('wd','Working days')+rad('custom','Custom %')+'</span></div>'
   +'<div class="tw"><table><thead><tr><th>Month</th><th class="num">Equal split ₹</th><th class="num">Working days</th><th class="num">By working days ₹</th><th class="num">Custom %</th></tr></thead><tbody>'
   +ms.map(function(mm,i){return '<tr><td>'+ymLabel(mm)+'</td><td class="num mono">'+tpIN(eq[i],2)+'</td><td class="num">'+wd[i]+'</td><td class="num mono">'+tpIN(wm[i],2)+'</td><td class="num">'+(editable&&m==='custom'?'<input class="tp-in sm" id="tp-phc-'+row.gkey+'-'+i+'" data-tp="phc" data-g="'+esc(row.gkey)+'" data-i="'+i+'" value="'+esc(cust[i])+'" placeholder="%" aria-label="Custom % '+ymLabel(mm)+'" inputmode="decimal">':'<span class="mono">'+esc(m==='custom'?cust[i]:'')+'</span>')+'</td></tr>'}).join('')
   +'<tr class="tt"><td>Quarter</td><td class="num mono">'+tpIN(t,2)+'</td><td class="num">'+wsum+'</td><td class="num mono">'+tpIN(t,2)+'</td><td class="num mono">'+(m==='custom'?tpIN(csum,2):'100')+'</td></tr></tbody></table></div>'
   +'<p class="tp-mut">Months 1 and 2 are rounded to 2 decimals; month 3 takes the remainder, so months always add up to the quarter. Working days: Mon to Sat less the holidays in Admin › Settings. A change is saved as a revision.'+(m==='custom'&&Math.abs(csum-100)>0.01?' <b class="tp-own">Custom % must add up to 100 (now '+tpIN(csum,2)+').</b>':'')+'</p></div>';
}
function tpRevTrail(vm){
  var x=vm.x;if(!x)return '';var revs=(x.revisions||[]).slice().reverse().slice(0,8);if(!revs.length)return '';
  return '<div><b>Revision trail</b><ul class="tp-tl">'+revs.map(function(r){return '<li>Rev '+r.n+' · '+esc(userName(r.by))+' · '+esc(istStr(r.at))+' · <b>'+esc(r.status==='Discussed'?'Proposed':r.status)+'</b>'+(r.change?' · '+esc(r.change):'')+(r.reason&&r.reason!=='Status change'?' · reason: “'+esc(r.reason)+'”':'')+(r.participants?' · with '+esc(r.participants):'')+'</li>'}).join('')+'</ul></div>';
}
function tpDetail(row,model){
  var vm=row.main,ed=row.canSt&&!model.locked;
  if(row.mode==='seg'){var kx=row.vms.filter(function(v){return v.x});return '<div class="tp-dbody"><p class="tp-mut">This product group is planned by segment; the rows below set it and the state figures are their sum.</p>'+tpPhasing(row,model,ed)+kx.map(function(v){return '<div><b>'+esc(v.seg)+'</b>'+tpRevTrail(v)+'</div>'}).join('')+'</div>'}
  var dsh=row.last.dsh;
  var nf=function(f,l,v,ph){return '<label class="fld">'+l+(ed?'<input class="tp-in" id="tp-'+f+'-'+vm.key+'" data-tp="'+f+'" data-key="'+esc(vm.key)+'" value="'+esc(vm.e[f]!==undefined?vm.e[f]:(v!=null?tpIN(v):''))+'" placeholder="'+ph+'" inputmode="numeric">':'<span class="mono">'+(v!=null?tpIN(v):'—')+'</span>')+'</label>'};
  return '<div class="tp-dbody"><div class="tp-dgrid">'+nf('sh','Potential, sheets (optional)',vm.sh,'Sheets')+nf('sq','Potential, sq ft (optional)',vm.sq,'Sq ft')
   +'<label class="fld">Source of potential'+(ed?'<select class="tp-in" id="tp-src-'+vm.key+'" data-tp="src" data-key="'+esc(vm.key)+'">'+TP_SRC.map(function(s){return '<option value="'+esc(s[0])+'"'+(vm.src===s[0]?' selected':'')+'>'+esc(s[1])+'</option>'}).join('')+'</select>':'<span>'+esc(tpSrcLabel(vm.src))+'</span>')+'</label>'
   +'<label class="fld">Note on potential'+(ed?'<input class="tp-in txt" id="tp-note-'+vm.key+'" data-tp="note" data-key="'+esc(vm.key)+'" value="'+esc(vm.note)+'" placeholder="Where does this figure come from?">':'<span>'+esc(vm.note||'—')+'</span>')+'</label></div>'
   +(dsh!=null?'<p class="tp-mut">Default share for this row: last quarter '+tpIN(Math.round(row.last.A))+' ÷ '+tpIN(row.last.pot)+' = '+r2(row.last.A/row.last.pot*100).toFixed(2)+'% + '+(+CFG.default_share_uplift_pts||0)+' points = <b>'+dsh.toFixed(2)+'%</b>. Used only when no share is entered; saved as Draft.</p>'
     :'<p class="tp-mut">No default share for this row: last quarter has no state potential or no loaded actual, so a person enters the share.</p>')
   +(row.dAny?'<p class="tp-mut">With the district split, the state target counts districts plus the unallocated slice: '+tpIN(r2(row.dvms.reduce(function(a,v){return a+(v.tgt||0)},0)+(row.unallocTgt||0)))+'.</p>':'')
   +tpPhasing(row,model,ed)+tpRevTrail(vm)+'</div>';
}
function tpRowHtml(row,model){
  var pe=row.canSt&&row.parentEditable&&!model.locked,ref=row.mode==='all'?row.main:null,cells;
  if(ref)cells=tpCells(ref,pe,stateName(row.st)+' '+row.group);
  else cells={pot:'<div class="tp-c" data-l="Potential ₹">'+(row.pot!=null?'<span class="mono">'+tpIN(row.pot)+'</span>':'<span class="tp-mut">—</span>')+'<small>sum of segments</small></div>',share:'<div class="tp-c" data-l="Share %">'+(row.pot>0&&row.tgt!=null?'<span class="mono">'+(row.tgt/row.pot*100).toFixed(2)+'</span>':'<span class="tp-mut">—</span>')+'<small>blended</small></div>',tgt:'<div class="tp-c" data-l="Target ₹">'+(row.tgt!=null?'<span class="mono">'+tpIN(row.tgt)+'</span>':'<span class="tp-mut">—</span>')+'<small>sum of segments</small></div>'};
  if(row.derived)cells.pot='<div class="tp-c" data-l="Potential ₹"><span class="mono">'+tpIN(row.dSum)+'</span><small>derived · sum of districts</small>'+(row.canSt&&!model.locked?'<button class="btn sm" data-act="tp-usesum" data-st="'+row.st+'" data-g="'+esc(row.group)+'">Use the sum</button>':'')+'</div>';
  var ok=row.st+'|'+row.group,open=S.tp.open[ok]?' open':'';
  var h='<details class="tp-row tp-par" data-okey="'+esc(ok)+'"'+open+'><summary class="tp-g"><span class="tp-chev" aria-hidden="true">▸</span><div class="tp-c tp-cg" data-l="Product group"><b>'+esc(row.group)+'</b>'+(row.mode==='seg'?'<small class="tp-mut">by segment</small>':(row.kids.length?'<small class="tp-mut">Segment: All</small>':''))+'</div>'
   +cells.pot+cells.share+cells.tgt+tpAchCell(row.ach,row.tShow)+tpLastCell(row.last)+'<div class="tp-c tp-n" data-l="QoQ vs last quarter">'+tpQoq(row)+'</div>'+tpStatusCell(row,model)+tpOrigCell(row)+'<span class="tp-more">Phasing, sheets, sq ft, note</span></summary>'+tpDetail(row,model)+'</details>';
  row.kids.forEach(function(k){
    var kc=tpCells(k,k.can&&!model.locked,row.group+' '+k.seg),kst=k.x?{Draft:'Draft',Discussed:'Proposed',Approved:'Approved',Locked:'Locked'}[k.status]:'Not started';
    h+='<div class="tp-row tp-child tp-g"><span class="tp-chev" aria-hidden="true"></span><div class="tp-c tp-cg" data-l="Segment"><span class="tp-ind">↳ '+esc(row.group)+' · <b>'+esc(k.seg)+'</b></span></div>'+kc.pot+kc.share+kc.tgt+'<div class="tp-c tp-n" data-l="Achieved so far"></div><div class="tp-c tp-n" data-l="Last quarter actual"></div><div class="tp-c tp-n" data-l="QoQ vs last quarter"></div><div class="tp-c" data-l="Status">'+tpPill(kst)+tpSelBox(k,model,row.group+' '+k.seg)+'</div><div class="tp-c" data-l="Original vs current target"><span class="tp-mut">Leaf of the state total</span></div></div>';
  });
  return h;
}
/* totals compare like with like: QoQ and achieved % use only the rows that have a target, and say so */
function tpTotals(rows,label,all){
  var pot=null,tgt=null,ach=0,achT=0,la=0,laN=0,laT=0,tgtA=0,nT=0,appr=0,noPot=0;
  rows.forEach(function(r){
    if(r.pot!=null)pot=(pot||0)+r.pot;else noPot++;
    if(r.tgt!=null){tgt=(tgt||0)+r.tgt;nT++;if(r.ach!=null){ach+=r.ach;achT+=r.tgt}if(r.last.A!=null){laT+=r.last.A;tgtA+=r.tgt}}
    if(r.last.A!=null){la+=r.last.A;laN++}
    if(r.status==='Approved'||r.status==='Locked')appr++;
  });
  var started=rows.filter(function(r){return r.started}).length,achAll=rows.reduce(function(a,r){return a+(r.ach||0)},0);
  var blended=pot>0&&tgt!=null?(tgt/pot*100).toFixed(2):null,qq=tgtA>0&&laT>0?(tgtA/laT-1)*100:null,part=nT<rows.length;
  return '<div class="tp-tot'+(all?' tp-all':'')+' tp-g"><span class="tp-chev"></span><div class="tp-c tp-cg" data-l="">'+esc(label)+'</div><div class="tp-c" data-l="Potential ₹">'+(pot!=null?'<b class="mono">'+tpIN(pot)+'</b>':'<span class="tp-pill tp-miss">Potential not set</span>')+'</div>'
   +'<div class="tp-c" data-l="Share %">'+(blended?'<b class="mono">'+blended+'</b><small>blended</small>':'—')+'</div><div class="tp-c" data-l="Target ₹">'+(tgt!=null?'<b class="mono">'+tpIN(tgt)+'</b>':'—')+'</div>'
   +'<div class="tp-c tp-n" data-l="Achieved so far"><span class="mono">'+tpIN(Math.round(achAll))+'</span>'+(achT>0?'<small>'+(ach/achT*100).toFixed(1)+'% of target'+(part?' · '+nT+' of '+rows.length+' rows have a target':'')+'</small>':'')+'</div>'
   +'<div class="tp-c tp-n" data-l="Last quarter actual">'+(laN?'<span class="mono">'+tpIN(Math.round(la))+'</span>':'—')+'</div>'
   +'<div class="tp-c tp-n" data-l="QoQ">'+(qq!=null?'<b class="mono '+(qq>=0?'up':'dn')+'">'+fmtPct(qq,true,2)+'</b>'+(part||laN<rows.length?'<small>target vs last quarter of the same '+nT+' row'+(nT===1?'':'s')+' ('+tpIN(Math.round(laT))+')</small>':''):'—')+'</div>'
   +'<div class="tp-c" data-l="Status">'+(started?appr+' of '+rows.length+' approved':'0 of '+rows.length+' started')+(started?'<small>'+(noPot?noPot+' without potential':'All rows have potential')+'</small>':'')+'</div><div class="tp-c"></div></div>';
}
/* district mapping (optional, collapsed, silent when empty) */
function tpDistrictHtml(model){
  var blocks=model.rows.filter(function(r){return r.dvms.length&&(r.pot!=null||r.dAny||r.group==='Laminate')});
  if(!blocks.length)return '';
  var u=effUser(),v=tpView(),open=S.tp.open.__dist?' open':'';
  var intro=v==='bm'?'You edit only districts mapped to your plant'+(codesOf(u).length>1?'s':'')+' ('+codesOf(u).map(plantShort).join(', ')+'), even inside another plant\'s state. Other plants\' districts are view only.':v==='mg'||v==='sa'?'Management / HO and Super admin edit any district.':'View only.';
  var h='<details class="card tp-dist" data-okey="__dist"'+open+'><summary><b>District mapping (optional)</b> <span class="tp-mut">Not needed to set or approve targets · open to split a state into districts</span></summary>'
   +'<p class="tp-mut" style="margin:0">'+esc(intro)+' Districts must add up to their state total once you start a split. Each district belongs to one plant (Admin › Geography). Actuals reach a district through the customer master (PIN or District); until then they sit in "– unassigned".</p>';
  blocks.forEach(function(r){
    var dp=geoDefaultPlant(r.st);
    h+='<div class="tp-gridwrap" style="margin-top:8px"><div class="tp-ph"><b>'+esc(stateName(r.st))+' · '+esc(r.group)+'</b> <span class="tp-mut">· state total '+(r.stateTot!=null?tpIN(r.stateTot)+(r.derived?' (derived)':''):'not set')+(dp?' · default plant '+esc(plantShort(dp)):' · no default plant')+'</span></div>';
    if(!r.dAny)h+='<div class="tp-g"><span></span><div class="tp-c tp-mut" style="grid-column:2/-1">Not split into districts. Nothing to fix; the state total stands on its own. Enter a district value only if a split is wanted.</div></div>';
    else h+='<div class="tp-g"><span></span><div class="tp-c" style="grid-column:2/-1">'+(r.over?'<b class="tp-own">▲ Districts add to '+tpIN(r.dSum)+', over the '+esc(stateName(r.st))+' total of '+tpIN(r.pot)+' by '+tpIN(r.over)+'. Lower a district or ask Management / HO to raise the state total. Submit stays off until fixed.</b>':'Split across districts: <b class="mono">'+tpIN(r.dSum)+'</b> of '+tpIN(r.stateTot)+(r.unalloc>0?' · '+tpIN(r.unalloc)+' unallocated':''))+'</div></div>';
    r.dvms.forEach(function(d){
      var ed=d.can&&!model.locked,c=tpCells(d,ed,geoDistrictName(d.did)+' '+r.group),kst=d.x?{Draft:'Draft',Discussed:'Proposed',Approved:'Approved',Locked:'Locked'}[d.status]:'Not entered';
      var dq=d.tgt!=null&&d.lastA>0?qoqOf(d.tgt,d.lastA,{}):null;
      h+='<div class="tp-row tp-child tp-g" style="display:grid"><span></span><div class="tp-c tp-cg" data-l="District"><span class="tp-ind">↳ <b>'+esc(geoDistrictName(d.did))+'</b></span><small class="tp-mut">'+(d.plant?esc(plantShort(d.plant)):'No plant mapped · Management / HO and Super admin only')+'</small></div>'+c.pot+c.share+c.tgt
       +tpAchCell(d.ach,d.tgt)+'<div class="tp-c tp-n" data-l="Last quarter actual">'+(d.lastA!=null?'<span class="mono">'+tpIN(Math.round(d.lastA))+'</span><small class="tp-mut">'+qLabel(model.q.length?prevQ(model.q):'')+(d.lastPot!=null?' · potential '+tpIN(d.lastPot):'')+'</small>':'—')+'</div>'
       +'<div class="tp-c tp-n" data-l="QoQ">'+(dq&&dq.state==='ok'?'<span class="mono '+(dq.v>=0?'up':'dn')+'">'+fmtPct(dq.v,true,2)+'</span>':'—')+'</div><div class="tp-c" data-l="Status">'+tpPill(kst,d.x&&d.status==='Discussed'?'<small>by '+esc(d.proposer)+'</small>':'')+tpSelBox(d,model,geoDistrictName(d.did)+' '+r.group)+(!ed&&!model.locked&&tpCanEdit()?'<small class="tp-mut">View only</small>':'')+'</div><div class="tp-c" data-l="Branch">'+(d.plant?'Branch: '+esc(plantShort(d.plant)):'No plant')+'</div></div>';
    });
    if(r.dAny){
      h+='<div class="tp-row tp-child tp-g" style="display:grid"><span></span><div class="tp-c tp-cg"><b>Unallocated to districts</b><small class="tp-mut">State total less districts. Derived, not a plan row. Shown only because some districts are filled.</small></div><div class="tp-c"><span class="mono">'+tpIN(Math.max(0,r.unalloc||0))+'</span></div><div class="tp-c"><span class="mono">'+(r.stateShare!=null?r.stateShare.toFixed(2):'—')+'</span><small>state share</small></div><div class="tp-c"><span class="mono">'+(r.unallocTgt!=null?tpIN(r.unallocTgt):'—')+'</span><small>'+(r.unallocTgt!=null?tpIN(Math.max(0,r.unalloc))+' × '+r.stateShare.toFixed(2)+'%':'no target on unallocated')+'</small></div><div class="tp-c"></div><div class="tp-c"></div><div class="tp-c"></div><div class="tp-c"><span class="tp-mut">Derived · not a plan row</span></div><div class="tp-c"></div></div>';
      var un=r.agg?r.agg.un:0,inDist=0;if(r.agg)Object.keys(r.agg.dist).forEach(function(id){if(!r.dvms.some(function(d){return d.did===id&&(d.x||d.dirty)}))inDist+=r.agg.dist[id]});
      h+='<div class="tp-row tp-child tp-g" style="display:grid"><span></span><div class="tp-c tp-cg"><b>'+esc(stateName(r.st))+' – unassigned</b><small class="tp-mut">Customers with no district in the customer master. Actuals only.</small></div><div class="tp-c">—</div><div class="tp-c">—</div><div class="tp-c">—</div><div class="tp-c tp-n"><span class="mono">'+tpIN(Math.round(un))+'</span></div><div class="tp-c tp-n"><span class="mono">'+tpIN(Math.round(r.last.un||0))+'</span></div><div class="tp-c"></div><div class="tp-c"><span class="tp-mut">Actuals only</span></div><div class="tp-c"></div></div>';
    }
    h+='</div>';
  });
  return h+'</details>';
}
/* plant roll-up by responsible plant (read only; not invoicing plant) */
function tpRollup(model){
  var g=S.tp.grp,by={},lab={},add=function(p,k,v){var o=by[p]||(by[p]={pot:0,tgt:0,ach:0,last:0,tgtA:0,lastT:0,hasPot:false,hasT:false});if(v!=null){o[k]+=v;if(k==='pot')o.hasPot=true;if(k==='tgt')o.hasT=true}},note=function(p,t){(lab[p]=lab[p]||[]).push(t)};
  model.rows.filter(function(r){return !g||r.group===g}).forEach(function(r){
    var dp=geoDefaultPlant(r.st)||'_none',l=r.last;
    if(!r.dAny){add(dp,'pot',r.pot);add(dp,'tgt',r.tgt);add(dp,'ach',r.ach);add(dp,'last',l.A);if(r.tgt!=null&&l.A!=null){add(dp,'tgtA',r.tgt);add(dp,'lastT',l.A)}note(dp,stateName(r.st)+(g?'':' '+r.group)+' (state level)');return}
    var used={};r.dvms.forEach(function(d){if(!(d.x||d.dirty))return;var p=d.plant||'_none';used[d.did]=1;add(p,'pot',d.pot);add(p,'tgt',d.tgt);add(p,'ach',d.ach);add(p,'last',d.lastA);if(d.tgt!=null&&d.lastA!=null){add(p,'tgtA',d.tgt);add(p,'lastT',d.lastA)}note(p,stateName(r.st)+': '+geoDistrictName(d.did))});
    var restA=r.agg?r.agg.un:0,restL=l.un||0;if(r.agg)Object.keys(r.agg.dist).forEach(function(id){if(!used[id])restA+=r.agg.dist[id]});Object.keys(l.dist||{}).forEach(function(id){if(!used[id])restL+=l.dist[id]});
    add(dp,'pot',Math.max(0,r.unalloc||0));add(dp,'tgt',r.unallocTgt);add(dp,'ach',r.ach!=null?restA:null);add(dp,'last',l.A!=null?restL:null);note(dp,stateName(r.st)+': unallocated + unassigned');
  });
  var ps=Object.keys(by).sort(function(a,b){return a==='_none'?1:b==='_none'?-1:a<b?-1:1}),tot={pot:0,tgt:0,ach:0,last:0,tgtA:0,lastT:0};
  var rowsH=ps.map(function(p){var o=by[p];['pot','tgt','ach','last','tgtA','lastT'].forEach(function(k){tot[k]+=o[k]});var qq=o.lastT>0?(o.tgtA/o.lastT-1)*100:null;
    return '<tr><td><b>'+(p==='_none'?'No responsible plant':esc(plantName(p)))+'</b></td><td class="note">'+esc((lab[p]||[]).join(' · '))+'</td><td class="num mono">'+(o.hasPot?tpIN(o.pot):'Potential not set')+'</td><td class="num mono">'+(o.hasT?tpIN(o.tgt):'—')+'</td><td class="num mono">'+tpIN(Math.round(o.ach))+(o.tgt>0?' <span class="note">'+(o.ach/o.tgt*100).toFixed(1)+'%</span>':'')+'</td><td class="num mono">'+tpIN(Math.round(o.last))+'</td><td class="num">'+(qq!=null?fmtPct(qq,true,2):'—')+'</td></tr>'}).join('');
  var tq=tot.lastT>0?(tot.tgtA/tot.lastT-1)*100:null;
  return '<div class="tp-note">Responsible plant, from customer geography. This is not invoicing plant: the Sales and Overview pages show where goods were billed from, so the figures differ. District rows go to the district\'s plant; a state not split goes to the state\'s default plant. Read only; switch to State to edit.</div>'
   +'<div class="card"><div class="tp-h"><h3>'+qLabel(model.q)+' · '+(g?esc(g):'all product groups')+' · by responsible plant</h3><div class="fld"><label for="tp-grp">Product group</label><select id="tp-grp" data-tp="grp"><option value="">All</option>'+GROUPS.map(function(x){return '<option'+(x===g?' selected':'')+'>'+x+'</option>'}).join('')+'</select></div></div>'
   +'<div class="tw"><table><thead><tr><th>Responsible plant</th><th>Made up of</th><th class="num">Potential ₹</th><th class="num">Target ₹</th><th class="num">Achieved so far</th><th class="num">Last quarter actual</th><th class="num">QoQ</th></tr></thead><tbody>'+rowsH
   +'<tr class="tt"><td>'+(g?esc(g):'All groups')+' · all states</td><td></td><td class="num mono">'+tpIN(tot.pot)+'</td><td class="num mono">'+tpIN(tot.tgt)+'</td><td class="num mono">'+tpIN(Math.round(tot.ach))+'</td><td class="num mono">'+tpIN(Math.round(tot.last))+'</td><td class="num">'+(tq!=null?fmtPct(tq,true,2)+' <span class="note">vs last quarter of the same rows ('+tpIN(Math.round(tot.lastT))+')</span>':'—')+'</td></tr></tbody></table></div></div>';
}
function tpLegacyHtml(qOnly){
  var rows=S.potential.filter(function(x){return !x.state_code&&(qOnly?x.fy_quarter===qOnly:!isGeoQ(x.fy_quarter))&&tpVisible(x)}).sort(function(a,b){return a.fy_quarter<b.fy_quarter?1:a.fy_quarter>b.fy_quarter?-1:(a.plant_code||'')<(b.plant_code||'')?-1:1});
  var agg={};rows.forEach(function(x){var k=x.fy_quarter+'|'+(x.plant_code||x.territory)+'|'+x.product_group,o=agg[k]||(agg[k]={q:x.fy_quarter,p:x.plant_code||x.territory,g:x.product_group,pot:0,tgt:0,st:[]});var a=approvedOf(x)||x;o.pot+=+a.potential_value_inr||0;if(a.share_pct!==''&&a.share_pct!=null)o.tgt+=leafTgt(a.potential_value_inr,a.share_pct);o.st.push(x.status)});
  var list=Object.keys(agg).map(function(k){return agg[k]});
  var body=list.length?'<div class="tw"><table><thead><tr><th>Quarter</th><th>Plant</th><th>Product group</th><th class="num">Potential ₹</th><th class="num">Target ₹</th><th>Status</th></tr></thead><tbody>'+list.slice(0,120).map(function(o){return '<tr><td>'+qLabel(o.q)+'</td><td>'+esc(plantShort(o.p))+'</td><td>'+esc(o.g)+'</td><td class="num mono">'+tpIN(o.pot)+'</td><td class="num mono">'+tpIN(r2(o.tgt))+'</td><td>'+tpPill(tpAggStatus(o.st.map(function(s){return {x:1,status:s}})))+'</td></tr>'}).join('')+'</tbody></table></div>':'<div class="empty sm">No plant-based figures.</div>';
  return {n:list.length,html:'<p class="tp-mut" style="margin:0">Potential and targets entered by plant before the change to states stay exactly as saved. They are not converted to states and cannot be edited. Choosing a quarter before '+qLabel(geoStartQ())+' in the Quarter list opens this view.</p>'+body};
}
function tpBarHtml(model){
  var v=tpView(),q=model.q,ro=function(t){return '<div class="tp-bar"><span class="tp-mut">'+t+'</span></div>'};
  if(!model.geo)return ro(qLabel(q)+' is before '+qLabel(geoStartQ())+': plant-based figures, read only.');
  if(readOnly())return ro('Viewing as another user: preview is read-only. Nothing can be saved.');
  if(model.locked)return ro(qLabel(q)+' is locked. Locked quarters open read-only for everyone, including Super admin.');
  if(!tpCanEdit())return ro(model.started?'View only. You see the figures; the default plant\'s Branch manager or Management edits; Management approves.':'View only. Nothing to show until the quarter is started.');
  var drafts=0,dirty=0,sel=0;
  model.rows.forEach(function(r){r.vms.concat(r.kids,r.dvms).forEach(function(x){if(x.dirty)dirty++;if(x.x&&x.status==='Draft'&&!planGuard(x.x))drafts++;if(S.tp.sel[x.key]&&x.status==='Discussed')sel++})});
  var emp=!model.started;
  var left='<div class="tp-bl"><button class="btn'+(emp?' pri':'')+'" data-act="tp-copy">Copy from last quarter</button>'
   +'<details class="tp-menu"><summary class="btn">Download template</summary><div class="tp-pop"><button class="btn sm" data-act="tp-tmpl" data-t="potential">State potential and targets file</button><button class="btn sm" data-act="tp-tmpl" data-t="district">District file (optional)</button><button class="btn sm" data-act="tp-tmpl" data-t="phasing">Monthly phasing file</button></div></details>'
   +'<details class="tp-menu"><summary class="btn">Upload</summary><div class="tp-pop"><label class="btn sm" for="up-pot">Potential and targets file (CSV)</label><label class="btn sm" for="up-ph">Monthly phasing file (CSV)</label></div></details>'
   +'<input id="up-pot" class="tp-hid" data-tpfile="potential" type="file" accept=".csv"><input id="up-ph" class="tp-hid" data-tpfile="phasing" type="file" accept=".csv"></div>';
  var right='<div class="tp-br"><button class="btn" data-act="tp-save">Save draft</button>';
  if(emp)right+='<button class="btn" disabled>Submit for approval</button>';
  else if(v==='bm'||drafts||dirty)right+='<button class="btn'+(v==='bm'?' pri':'')+'" data-act="tp-submit"'+(drafts||dirty?'':' disabled')+'>Submit '+(drafts?drafts+' Draft row'+(drafts===1?'':'s')+' ':'')+'for approval</button>';
  if(!emp&&(v==='mg'||v==='sa'))right+='<button class="btn" data-act="tp-return-open">Return with reason</button>';
  if(v==='mg'||v==='sa')right+='<button class="btn" data-act="tp-lock-open" title="Freeze every Approved target of this quarter; cannot be undone in v1.0">Lock quarter</button>';
  if(!emp&&(v==='mg'||v==='sa'))right+='<button class="btn pri" data-act="tp-approve"'+(sel?'':' disabled')+'>Approve '+sel+' selected</button>';
  return '<div class="tp-bar">'+left+right+'</div></div>';
}
function tpRoleNote(model){
  var v=tpView(),u=effUser(),held=codesOf(u);
  if(v==='bm'){
    var mine=model.states.filter(function(s){return s.canSt}).map(function(s){return stateName(s.code)}),other=model.states.filter(function(s){return !s.canSt}).map(function(s){return stateName(s.code)+' (default plant '+(geoDefaultPlant(s.code)?plantShort(geoDefaultPlant(s.code)):'none')+')'});
    return 'You are the Branch manager for '+held.map(plantShort).join(', ')+'. '+(mine.length?'You edit the state rows of '+mine.join(', ')+', whose default plant is yours. ':'No state has your plant as its default plant yet (Admin › Geography), so you have no state rows to edit. ')+(other.length?other.join(', ')+': state rows are view only for you; you edit only the districts mapped to your plant. ':'');
  }
  return {hod:'View only. You see every state, the district mapping and the figures; the default plant\'s Branch manager or Management edits; Management approves.',se:'View only. You see the states where your customers are.',mg:'You see all states. You set state totals, propose and approve, but never approve a row you proposed.',sa:'You see all states and can edit, approve and lock. Approval of a row you proposed still needs another approver.'}[v]||'';
}
function pageTargets(){
  var q=tpQ(),qs=tpQuarters(),gs=geoStartQ();
  if(isGeoQ(q)){var need=tpLoadNeeded(q);if(!geoMonthsLoaded(need))geoLoadMonths(need)}
  var model=tpModel(),v=tpView();
  var stOpts=model.states.length||S.tp.st?'<option value="">'+(v==='bm'?'My states':'All states')+'</option>'+tpStates(q,geoLeaves(q),geoLeaves(prevQ(q)),{},{},{}).concat(S.tp.st&&model.states.every(function(s){return s.code!==S.tp.st})?[S.tp.st]:[]).map(function(c){return '<option value="'+c+'"'+(S.tp.st===c?' selected':'')+'>'+esc(stateName(c))+'</option>'}).join(''):'<option value="">All states</option>';
  var h='<div class="tp-tools"><div class="fld"><label for="tp-q">Quarter</label><select id="tp-q" data-tp="q">'+qs.map(function(k){return '<option value="'+k+'"'+(k===q?' selected':'')+'>'+qLabel(k)+' · '+tpQRange(k)+(k<gs?' · Legacy (by plant)':'')+(isPlanLocked(k)?' · Locked (read-only)':'')+'</option>'}).join('')+'</select></div>';
  if(!model.geo){
    var lg=tpLegacyHtml(q);
    return h+'</div><div class="tp-note">'+qLabel(q)+' is before '+qLabel(gs)+', when targets moved to states. Plant-based figures are shown read only; nothing here can be edited, submitted or approved.</div><div class="card"><div class="tp-h"><h3>Legacy (by plant) · '+qLabel(q)+'</h3></div>'+lg.html+'</div><div class="tp-sticky">'+tpBarHtml(model)+'</div>';
  }
  h+='<div class="fld"><label for="tp-st">States</label><select id="tp-st" data-tp="st">'+stOpts+'</select></div>'
   +'<div class="fld"><span>View</span><span class="tp-seg2" role="radiogroup" aria-label="View"><label><input type="radio" name="tp-view" data-tp="view" value="state"'+(S.tp.view!=='plant'?' checked':'')+'> State</label><label><input type="radio" name="tp-view" data-tp="view" value="plant"'+(S.tp.view==='plant'?' checked':'')+'> Plant roll-up (responsible plant)</label></span></div>'
   +'<label class="tp-ck" style="align-self:end"><input type="checkbox" id="tp-seg" data-tp="seg"'+(S.tp.seg?' checked':'')+'> Show segment rows</label></div>';
  h+='<div class="tp-note">'+esc(tpRoleNote(model))+(model.locked?' '+qLabel(q)+' is locked: every figure is read-only for everyone, including Super admin.':'')+' Growth is quarter on quarter only: target against last quarter\'s actual. Actuals come by the customer\'s state. Edit Share % and Target ₹ and the other moves; the last one you touch wins.</div>';
  if(GEOA.jobs)h+='<div class="banner info">Reading sales by customer for the state figures ('+GEOA.jobs+' plant-months)...</div>';
  var rows=model.rows,cnt={A:0,D:0,P:0,none:0};rows.forEach(function(r){if(r.status==='Approved'||r.status==='Locked')cnt.A++;else if(r.status==='Draft')cnt.D++;else if(r.status==='Proposed')cnt.P++;if(r.pot==null&&!r.derived)cnt.none++});
  var desc=rows.length+' rows · '+model.states.length+' state'+(model.states.length===1?'':'s')+' × '+GROUPS.length+' product groups'+(tpCanEdit()?'':' · view only');
  h+=model.started?'<div class="tp-strip"><span class="tp-pill tp-ok">'+cnt.A+' Approved</span><span class="tp-pill tp-draft">'+cnt.D+' Draft</span><span class="tp-pill tp-prop">'+cnt.P+' Proposed</span><span class="tp-pill tp-miss">'+cnt.none+' Potential not set</span><span class="tp-mut">'+desc+'</span></div>'
    :'<div class="tp-strip"><span class="tp-pill tp-ns">0 started</span><span class="tp-mut">'+qLabel(q)+' has no potential, share or target entered yet.</span></div>';
  if(!model.started&&!model.locked){
    if(tpCanEdit())h+='<div class="card tp-guide"><h3>'+qLabel(q)+' is empty. Three ways to start</h3><ol><li><b>Copy from last quarter.</b> Takes last quarter\'s potential and share into this quarter as Draft. Edit what changed.</li><li><b>Download template, fill, Upload.</b> The state potential file and the monthly phasing file.</li><li><b>Type it in.</b> Enter Potential ₹ per state and product group. Share % is already filled with the default.</li></ol>'
      +'<p class="tp-mut"><b>Default.</b> Share % = last quarter\'s actual ÷ last quarter\'s potential for the same state and product group, plus '+(+CFG.default_share_uplift_pts||0)+' points (setting in Admin). Target = potential × share, saved as a <span class="tp-pill tp-draft">Draft</span> only when you save. With no potential entered there is no target and the row says "Potential not set".</p></div>';
    else h+='<div class="card tp-guide"><h3>'+qLabel(q)+' is empty</h3><p class="tp-mut">Nothing entered yet. Rows below show last quarter\'s actuals for reference.</p></div>';
  }
  h+='<div id="tp-msg">'+(S.tp.msg||'')+'</div>';
  if(S.tp.up)h+=tpUploadResultHtml();
  if(S.tp.view==='plant')h+=tpRollup(model);
  else if(!model.states.length)h+='<div class="card"><div class="empty">'+(v==='bm'?'No state has your plant as its default plant and no district is mapped to your plant yet. Ask Management / HO to set the default plants in Admin › Geography.':'No states to show yet. States appear once sales by customer state are loaded, a state has a default plant, or a figure is entered.')+'</div></div>';
  else{
    h+='<div class="card tp-gridcard"><div class="tp-h"><h3>'+qLabel(q)+' · state × product group</h3><span class="tp-mut">₹ net of GST · actuals from SAP by customer state (invoiced; credit notes not netted by state) · segment All unless expanded</span></div><div class="tp-gridwrap">'
     +'<div class="tp-g tp-gh" aria-hidden="true"><span></span><div>Product group</div><div>Potential ₹</div><div>Share % ⇄</div><div>Target ₹ ⇄</div><div class="tp-n">Achieved so far</div><div class="tp-n">Last quarter actual</div><div class="tp-n">QoQ</div><div>Status</div><div>Original vs current</div></div>';
    model.states.forEach(function(s){
      var dp=geoDefaultPlant(s.code),nd=geoDistrictsOf(s.code),nm=nd.filter(function(d){return !d.responsible_plant_code}).length;
      h+='<div class="tp-ph"><b>'+esc(stateName(s.code))+'</b> <span class="tp-mut">· state · '+(dp?'default plant: '+esc(plantShort(dp)):'no default plant · Management / HO and Super admin edit')+(nd.length?' · '+nd.length+' districts in the list'+(nm?' ('+nm+' not mapped)':''):'')+(s.canSt?'':(tpCanEdit()&&!model.locked?' · view only for you':''))+'</span></div>';
      s.rows.forEach(function(r){h+=tpRowHtml(r,model)});
      h+=tpTotals(s.rows,stateName(s.code)+' total');
    });
    if(model.states.length>1)h+=tpTotals(rows,v==='bm'?'Total, your states':'Total, all states',true);
    h+='</div></div>';
    if(model.unknown>0)h+='<div class="tp-note">'+tpIN(Math.round(model.unknown))+' of '+qLabel(q)+' sales have no customer state yet ("State not known"); they count in no state until the customer master or the invoice carries the state.</div>';
    h+=tpDistrictHtml(model);
  }
  if(S.tp.ret&&tpCanApprove()&&!model.locked){
    var ticked=tpSelected().map(tpRelabel);
    h+='<details class="card tp-ret" open><summary><b>Return with a reason</b> <span class="tp-mut">· '+ticked.length+' row'+(ticked.length===1?'':'s')+' ticked'+(ticked.length?': '+esc(ticked.join(', ')):'. Tick Proposed rows first.')+'</span></summary>'
     +'<label class="fld">Reason (required, shown to the proposer)<textarea class="tp-in txt" id="tp-ret-text" data-tp="rettext" rows="2">'+esc(S.tp.retText)+'</textarea></label>'
     +'<div class="tp-rbtn"><button class="btn" data-act="tp-return-cancel">Cancel</button><button class="btn pri" data-act="tp-return-go"'+(ticked.length?'':' disabled')+'>Return '+ticked.length+' row'+(ticked.length===1?'':'s')+' to Draft</button></div>'
     +'<p class="tp-mut">The approver can never be the proposer of that revision. Rows you proposed show "another approver needed". Returned rows go back to the proposer as a Draft with the reason on the revision trail and an action on their Today list.</p></details>';
  }
  var lg2=tpLegacyHtml();
  if(lg2.n)h+='<details class="card tp-legacy" data-okey="__legacy"'+(S.tp.open.__legacy?' open':'')+'><summary><b>Legacy (by plant)</b> <span class="tp-mut">Earlier quarters, read only · geography starts at '+qLabel(gs)+'</span></summary>'+lg2.html+'</details>';
  h+='<div class="tp-sticky">'+tpBarHtml(model)+'</div>';
  h+='<div class="tp-note">Locked quarters open read-only for everyone, including Super admin. A locked quarter keeps the actuals attributed at lock time. Sheets and sq ft never change a target; ₹ is the basis. '+SEGMENT_NOTE+'</div>';
  return h;
}
/* ---------- actions ---------- */
function tpMsg(kind,txt){S.tp.msg='<div class="banner '+kind+'" style="display:block">'+txt+'</div>';var m=$('#tp-msg');if(m)m.innerHTML=S.tp.msg}
function tpRelabel(vm){return stateName(vm.st)+(vm.did&&vm.did!=='_state'?' · '+geoDistrictName(vm.did):'')+' '+vm.group+(vm.seg&&vm.seg!=='All'?' '+vm.seg:'')}
function tpAllVMs(model){var o=[],seen={};model.rows.forEach(function(r){r.vms.concat(r.kids,r.dvms).forEach(function(v){if(!seen[v.key]){seen[v.key]=1;o.push({v:v,row:r})}})});return o}
function tpLeafPut(key,doc){return dset('potential/'+key,doc).then(function(){var d=Object.assign({_id:key},doc);var i=S.potential.findIndex(function(p){return p._id===key});if(i>=0)S.potential[i]=d;else S.potential.push(d);S.potVer++;DS.cache={}})}
function tpDoc(v,x,share,u,reason,extra){
  var rev=(x?x.rev||1:0)+1,now=nowISO();
  var chg=x?('₹ '+fmtMoney(x.potential_value_inr)+' to '+fmtMoney(v.pot)+', share '+(x.share_pct===''||x.share_pct==null?'-':x.share_pct)+' to '+(share==null?'-':share)):'new figure';
  var rvn={n:rev,at:now,by:u.email,status:'Draft',reason:reason||'Draft saved',discussion_date:'',participants:'',change:chg,old:x?{potential_value_inr:x.potential_value_inr,share_pct:x.share_pct}:null,new:{potential_value_inr:v.pot,share_pct:share==null?'':share}};
  var f={fy_quarter:v.q,state_code:v.st,district_id:v.did||'_state',product_group:v.group,customer_segment:v.seg||'All',potential_value_inr:v.pot,potential_qty_sheets:v.sh||0,potential_qty_sqft:v.sq||0,share_pct:share==null?'':share,source_type:v.src,source_note:v.note||'',owner_email:(x&&x.owner_email)||u.email};
  var doc=x?Object.assign({},x,f,{status:'Draft',rev:rev,revisions:(x.revisions||[]).concat([rvn]).slice(-40)}):Object.assign(f,{status:'Draft',rev:rev,revisions:[rvn]});
  delete doc._id;delete doc.demo;delete doc.plant_code;delete doc.territory;Object.assign(doc,extra||{});return doc;
}
async function tpSave(opts){
  opts=opts||{};if(!guardWrite())return {saved:0,errs:['read-only']};
  var model=tpModel(),q=model.q,u=effUser(),errs=[],jobs=[];
  if(!model.geo){tpMsg('err','Plant-based quarters are read only.');return {saved:0,errs:['legacy']}}
  if(model.locked){tpMsg('err','That quarter is locked.');return {saved:0,errs:['locked']}}
  if(!tpCanEdit()){toast('Your role cannot propose sales targets');return {saved:0,errs:['role']}}
  tpAllVMs(model).forEach(function(o){var v=o.v,r=o.row;if(!v.dirty)return;
    var lab=tpRelabel(v),g=planGuard({state_code:v.st,district_id:v.did});if(g){errs.push(lab+': '+g);return}
    if(v.pot==null){errs.push(lab+': enter the potential ₹ first');return}
    if(!(v.pot>=0)){errs.push(lab+': potential ₹ must be 0 or more');return}
    var share=v.share;
    if(share==null&&v.tgt!=null){if(v.pot>0)share=Math.round(v.tgt/v.pot*100*1e8)/1e8;else{errs.push(lab+': a target needs a potential above 0');return}}
    if(share==null&&v.dsh!=null&&v.seg==='All')share=v.dsh;
    if(share!=null&&!(share>=0&&share<=100)){errs.push(lab+': share % must be 0 to 100');return}
    if(v.did==='_state'){var other=S.potential.filter(function(x){return x.fy_quarter===q&&x.state_code===v.st&&(x.district_id||'_state')==='_state'&&x.product_group===v.group&&tpVisible(x)&&((v.seg==='All')!==(x.customer_segment==='All'))&&+x.potential_value_inr>0});
      if(other.length&&v.pot>0){errs.push(lab+': this state already has '+(v.seg==='All'?'segment':'All-segment')+' figures; use one or the other');return}}
    jobs.push({v:v,share:share});
  });
  var phJobs=[];
  Object.keys(S.tp.ph).forEach(function(gk){
    var row=model.rows.find(function(r){return r.gkey===gk});if(!row)return;var st=S.tp.ph[gk],pct;
    if(st.m==='equal')pct=[100/3,100/3,100/3];
    else if(st.m==='wd'){var wd=qMonths(q).map(WD),s=wd.reduce(function(a,b){return a+b},0);pct=wd.map(function(d){return d/s*100})}
    else{var c=st.c.map(tpNum);if(c.some(function(n){return n==null||n<0||n>100})||Math.abs(c.reduce(function(a,b){return a+b},0)-100)>0.01){errs.push(stateName(row.st)+' '+row.group+': custom phasing % must be three numbers adding up to 100');return}pct=c}
    var cur=phasingFor({fy_quarter:q,state_code:row.st,district_id:'_state',product_group:row.group,customer_segment:'All'});
    if(cur.every(function(v,i){return Math.abs(v-pct[i])<0.0001}))return;
    var g=planGuard({state_code:row.st,district_id:'_state'});if(g){errs.push(stateName(row.st)+' '+row.group+' phasing: '+g);return}
    phJobs.push({row:row,pct:pct,gk:gk});
  });
  if(errs.length){if(!opts.quiet)tpMsg('err','<b>Nothing was saved.</b><ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>');return {saved:0,errs:errs}}
  var n=0,phWarn='',ph=0;
  for(var i=0;i<jobs.length;i++){var j=jobs[i];await tpLeafPut(j.v.key,tpDoc(j.v,j.v.x,j.share,u));delete S.tp.ed[j.v.key];n++}
  for(var k=0;k<phJobs.length;k++){var pj=phJobs[k];
    try{var pdoc={fy_quarter:q,state_code:pj.row.st,district_id:'_state',product_group:pj.row.group,customer_segment:'',pct:pj.pct,by:u.email,at:nowISO()};
      await dset('phasing/'+pj.gk,pdoc);var pi=S.phasing.findIndex(function(p){return p._id===pj.gk}),pd=Object.assign({_id:pj.gk},pdoc);if(pi>=0)S.phasing[pi]=pd;else S.phasing.push(pd);DS.cache={};S.potVer++;
      await dset('log/l'+Date.now().toString(36)+k,{at:nowISO(),by:u.email,event:'phasing changed',quarter:q,state:pj.row.st});delete S.tp.ph[pj.gk];ph++;
    }catch(e){phWarn+=(phWarn?' ':'')+stateName(pj.row.st)+' '+pj.row.group+': '+dbErrText(e)}}
  S.lastHtml='';
  if(!opts.quiet){if(!n&&!ph&&!phWarn)tpMsg('info','Nothing to save: no figure was changed.');
    else tpMsg(phWarn?'warn':'ok',(n?'Saved '+n+' row'+(n===1?'':'s')+' as Draft':'No figure changed')+(ph?(n?' and ':'; ')+ph+' phasing change'+(ph>1?'s':''):'')+'.'+(phWarn?' <b>Phasing not saved</b> ('+esc(phWarn)+').':''))}
  schedule();return {saved:n,phasing:ph,phWarn:phWarn,errs:[]};
}
function tpSubmitList(){var out=[];tpAllVMs(tpModel()).forEach(function(o){var v=o.v;if(v.x&&v.status==='Draft'&&!planGuard(v.x))out.push(o)});return out}
async function tpSubmitOpen(){
  if(!guardWrite())return;
  var s=await tpSave({quiet:true});if(s.errs&&s.errs.length){tpMsg('err','<b>Fix these first.</b><ul style="margin:6px 0 0 18px">'+s.errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>');return}
  var list=tpSubmitList();if(!list.length){tpMsg('info','No Draft rows to submit.');return}
  var bad=[];list.forEach(function(o){var v=o.v;if(!(+v.x.potential_value_inr>0))bad.push(tpRelabel(v)+': potential ₹ is not set');else if(v.x.share_pct===''||v.x.share_pct==null)bad.push(tpRelabel(v)+': no share % and no default to use');else if(o.row.over)bad.push(tpRelabel(v)+': districts exceed the state by '+tpIN(o.row.over))});
  if(bad.length){tpMsg('err','<b>Not ready to submit.</b><ul style="margin:6px 0 0 18px">'+bad.map(function(b){return '<li>'+esc(b)+'</li>'}).join('')+'</ul>');return}
  openDlg('<h3>Submit '+list.length+' row'+(list.length===1?'':'s')+' for approval</h3><p class="note">'+esc(list.map(function(o){return tpRelabel(o.v)}).join(', '))+'</p><div class="fgrid"><div class="fld"><label for="tp-s-reason">Reason (required, shown to the approver)</label><input id="tp-s-reason" class="in"></div><div class="fld"><label for="tp-s-date">Date of discussion (required)</label><input id="tp-s-date" type="date" class="in" value="'+TODAY()+'"></div><div class="fld"><label for="tp-s-part">Participants (required, names)</label><input id="tp-s-part" class="in"></div></div><p class="note">The rows are stored as Proposed and wait for another person to approve.</p><div id="d-err"></div><div class="row"><button class="btn pri" data-act="tp-submit-go">Submit '+list.length+' row'+(list.length===1?'':'s')+'</button><button class="btn" data-act="dlg-close">Cancel</button></div>');
}
async function tpSubmitGo(){
  var reason=gv('tp-s-reason'),date=gv('tp-s-date'),part=gv('tp-s-part'),u=effUser();
  if(!reason){dlgErr('A reason is required');return}if(!/^\d{4}-\d\d-\d\d$/.test(date)){dlgErr('A discussion date is required');return}if(!part){dlgErr('Participants are required');return}
  var list=tpSubmitList(),n=0,errs=[];
  for(var i=0;i<list.length;i++){
    var o=list[i],x=o.v.x,revs=(x.revisions||[]).slice(),ix=-1;if(o.row.over){errs.push(tpRelabel(o.v)+': districts exceed the state by '+tpIN(o.row.over));continue}
    for(var k=revs.length-1;k>=0;k--){if(revs[k].status==='Draft'&&!revs[k].returned){ix=k;break}}
    if(ix>=0)revs[ix]=Object.assign({},revs[ix],{reason:reason,discussion_date:date,participants:part});
    var r=advanceDoc(Object.assign({},x,{revisions:revs}),u);if(r.err){errs.push(tpRelabel(o.v)+': '+r.err);continue}
    await tpLeafPut(o.v.key,r.doc);n++;
  }
  closeDlg();S.lastHtml='';tpMsg(errs.length?'warn':'ok','Submitted '+n+' row'+(n===1?'':'s')+' for approval.'+(errs.length?'<ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>':''));toast('Submitted '+n);schedule();
}
function tpSelected(){var out=[];tpAllVMs(tpModel()).forEach(function(o){if(S.tp.sel[o.v.key]&&o.v.x&&o.v.status==='Discussed')out.push(o.v)});return out}
async function tpApprove(){
  if(!guardWrite())return;var u=effUser(),list=tpSelected(),n=0,errs=[];
  if(!tpCanApprove()){toast('Approval is by SP Sir or a Management / HO user');return}
  for(var i=0;i<list.length;i++){var r=advanceDoc(list[i].x,u);if(r.err){errs.push(tpRelabel(list[i])+': '+r.err);continue}await tpLeafPut(list[i].key,r.doc);delete S.tp.sel[list[i].key];n++}
  S.lastHtml='';tpMsg(errs.length?(n?'warn':'err'):'ok','Approved '+n+' row'+(n===1?'':'s')+'.'+(errs.length?'<ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>':''));schedule();
}
async function tpReturn(){
  if(!guardWrite())return;var u=effUser(),reason=(S.tp.retText||'').trim(),list=tpSelected(),n=0,errs=[],byProp={};
  if(!tpCanApprove()){toast('Only SP Sir or a Management / HO user can return a row');return}
  if(!reason){tpMsg('err','A reason is required. The proposer sees it.');return}
  for(var i=0;i<list.length;i++){
    var x=list[i].x;if(isPlanLocked(x.fy_quarter)){errs.push(tpRelabel(list[i])+': quarter is locked');continue}
    var prop=proposerOf(x),doc=Object.assign({},x,{status:'Draft',revisions:(x.revisions||[]).concat([{n:x.rev||1,at:nowISO(),by:u.email,status:'Draft',returned:true,reason:reason,discussion_date:'',participants:'',change:'Returned to Draft by '+u.name}]).slice(-40)});delete doc._id;
    await tpLeafPut(list[i].key,doc);delete S.tp.sel[list[i].key];n++;if(prop)(byProp[prop]=byProp[prop]||[]).push(tpRelabel(list[i]));
  }
  var emails=Object.keys(byProp);
  for(var k=0;k<emails.length;k++){if(!uByEmail(emails[k]))continue;
    try{await raiseAction({title:'Targets returned · '+qLabel(tpQ())+' · '+byProp[emails[k]].join(', '),owner:emails[k],due:addDays(TODAY(),2),next:'Open Plan › Targets & Potential, read the reason on the revision trail, correct the figures and submit again.',source:'Returned by '+u.name+': '+reason,page:'targets',plant:''})}catch(e){errs.push('Action for '+emails[k]+' not created: '+dbErrText(e))}}
  S.tp.ret=false;S.tp.retText='';S.lastHtml='';
  tpMsg(errs.length?'warn':'ok','Returned '+n+' row'+(n===1?'':'s')+' to Draft with your reason.'+(errs.length?'<ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>':''));schedule();
}
async function tpCopy(){
  if(!guardWrite())return;var model=tpModel(),q=model.q,pq=prevQ(q),u=effUser();
  if(model.locked){tpMsg('err',qLabel(q)+' is locked.');return}
  if(!tpCanEdit()){toast('Your role cannot propose sales targets');return}
  var src=geoLeaves(pq).filter(function(x){return !planGuard(x)&&(!S.tp.st||x.state_code===S.tp.st)}),n=0,skipped=0;
  if(!src.length){tpMsg('info',qLabel(pq)+' has no state potential you can copy'+(isGeoQ(pq)?'':' (it is a plant-based quarter; plant figures are not converted to states)')+'.');return}
  for(var i=0;i<src.length;i++){
    var s=src[i],did=s.district_id||'_state',key=geoKey(q,s.state_code,did,s.product_group,s.customer_segment),ex=S.potential.find(function(p){return p._id===key&&tpVisible(p)});
    if(ex&&(+ex.potential_value_inr>0||(ex.share_pct!==''&&ex.share_pct!=null))){skipped++;continue}
    var use=approvedOf(s)||s,sh=use.share_pct===''||use.share_pct==null?'':+use.share_pct;
    var v={q:q,st:s.state_code,did:did,group:s.product_group,seg:s.customer_segment||'All',pot:+use.potential_value_inr||0,sh:+use.potential_qty_sheets||0,sq:+use.potential_qty_sqft||0,src:s.source_type||'branch estimate',note:s.source_note||''};
    var doc=tpDoc(v,ex&&tpVisible(ex)?ex:null,sh===''?null:sh,u,'Copied from '+qLabel(pq));doc.owner_email=u.email;doc.revisions[doc.revisions.length-1].change='copied from '+qLabel(pq);
    if(s.demo&&!geoRealSales())doc.demo=true;
    await tpLeafPut(key,doc);delete S.tp.ed[key];n++;
  }
  S.lastHtml='';tpMsg(n?'ok':'info','Copied '+n+' row'+(n===1?'':'s')+' from '+qLabel(pq)+' as Draft'+(skipped?'; '+skipped+' already had figures and were left alone':'')+'. Edit what changed, then submit.');schedule();
}
/* templates (data-map/templates/market-potential.csv, target-phasing.csv): pre-filled with the rows this person may edit */
var TP_TMPL={potential:'fy_quarter,state_code,district_id,product_group,customer_segment,potential_value_inr,potential_qty_sheets,potential_qty_sqft,share_pct,source_type,source_note,owner_email',phasing:'fy_quarter,state_code,district_id,product_group,customer_segment,month_in_quarter,phasing_pct'};
function tpTemplateCsv(kind){
  var model=tpModel(),q=model.q,u=effUser(),lines=[];
  if(kind==='phasing'){lines.push(TP_TMPL.phasing);
    model.rows.forEach(function(r){if(!r.canSt)return;phasingFor({fy_quarter:q,state_code:r.st,district_id:'_state',product_group:r.group,customer_segment:'All'}).forEach(function(v,i){lines.push(csvLine([q,r.st,'_state',r.group,'',i+1,Math.round(v*1e6)/1e6]))})});
  }else{lines.push(TP_TMPL.potential);
    model.rows.forEach(function(r){
      var put=function(v){var x=v.x;lines.push(csvLine([q,r.st,v.did,r.group,v.seg||'All',x&&+x.potential_value_inr>0?x.potential_value_inr:'',x&&+x.potential_qty_sheets>0?x.potential_qty_sheets:'',x&&+x.potential_qty_sqft>0?x.potential_qty_sqft:'',x&&x.share_pct!==''&&x.share_pct!=null?x.share_pct:'',v.src||'branch estimate',v.note||'',(x&&x.owner_email)||u.email]))};
      if(kind==='district'){r.dvms.forEach(function(d){if(d.can)put(d)})}
      else if(r.canSt)r.vms.forEach(put);
    });
  }
  return lines.join('\n')+'\n';
}
function tpLev(a,b){a=a.toLowerCase();b=b.toLowerCase();var m=[],i,j;for(i=0;i<=b.length;i++)m[i]=[i];for(j=0;j<=a.length;j++)m[0][j]=j;for(i=1;i<=b.length;i++)for(j=1;j<=a.length;j++)m[i][j]=Math.min(m[i-1][j-1]+(b[i-1]===a[j-1]?0:1),m[i][j-1]+1,m[i-1][j]+1);return m[b.length][a.length]}
function tpMean(v,list){var best=null,bd=9;list.forEach(function(x){var d=tpLev(v,x);if(d<bd){bd=d;best=x}});return bd<=3?best:null}
/* upload in two steps (mock-up 4): check, show the result per row, then "Load n rows as Draft"; nothing is saved before Load */
async function tpUploadCheck(kind,name,text){
  var model=tpModel(),q=model.q,u=effUser(),rows=parseCSV(text),res={kind:kind,name:name,rows:[],ready:0,rejected:0,warn:0,unchanged:0};
  if(rows.length<2){S.tp.up=Object.assign(res,{err:'The file has no data rows.'});tpRerender();return res}
  var hd=rows[0].map(function(x){return norm(x)}),get=function(r,k){var i=hd.indexOf(k);return i<0?'':String(r[i]==null?'':r[i]).trim()};
  var need=kind==='phasing'?['fy_quarter','state_code','product_group','month_in_quarter','phasing_pct']:['fy_quarter','state_code','product_group','potential_value_inr'],miss=need.filter(function(c){return hd.indexOf(c)<0});
  if(miss.length){S.tp.up=Object.assign(res,{err:'Missing columns: '+miss.join(', ')+'. Download the template.'});tpRerender();return res}
  var stNames=Object.keys(GEO.states).map(function(c){return GEO.states[c].state_name}),seen={},ph={};
  rows.slice(1).forEach(function(r,i){
    var rn=i+2;if(r.every(function(v){return String(v==null?'':v).trim()===''}))return;
    var fq=get(r,'fy_quarter').toUpperCase().replace(/^Q(\d) ?FY(\d\d)$/,'FY$2-Q$1'),stRaw=get(r,'state_code'),st=stateCode(stRaw),did=get(r,'district_id')||'_state',grp=get(r,'product_group'),seg=get(r,'customer_segment')||'All';
    var o={rn:rn,stRaw:stRaw,st:st,did:did,grp:grp,seg:seg,res:'',what:'',pot:null};res.rows.push(o);
    var rej=function(w){o.res='Rejected';o.what=w;res.rejected++};
    if(fq!==q)return rej('Quarter must be '+q+' (the quarter open on the page).');
    if(!st)return rej('State not found.'+(tpMean(stRaw,stNames)?' Did you mean '+tpMean(stRaw,stNames)+'?':''));
    if(GROUPS.indexOf(grp)<0)return rej('Product group not found.'+(tpMean(grp,GROUPS)?' Did you mean '+tpMean(grp,GROUPS)+'?':''));
    if(did!=='_state'&&(!GEO.districts[did]||GEO.districts[did].state_code!==st))return rej('District '+did+' is not in the district list of '+stateName(st)+'.');
    if(model.locked)return rej('The quarter is locked.');
    var g=planGuard({state_code:st,district_id:did});if(g)return rej(did==='_state'&&/default plant/.test(g)?g+' Ask that plant or Management / HO.':g);
    if(kind==='phasing'){var mi=+get(r,'month_in_quarter'),pc=toNum(get(r,'phasing_pct'));if(!(mi>=1&&mi<=3))return rej('month_in_quarter must be 1, 2 or 3');if(isNaN(pc)||pc<0||pc>100)return rej('phasing_pct must be 0 to 100');
      var k=[st,did,grp].join('|'),p=ph[k]||(ph[k]={st:st,did:did,grp:grp,pct:[null,null,null],rows:[]});if(p.pct[mi-1]!=null)return rej('Duplicate month');p.pct[mi-1]=pc;p.rows.push(o);o.res='Ready';o.what='Month '+mi+': '+pc+'%';res.ready++;return}
    var pv=toNum(get(r,'potential_value_inr'));if(get(r,'potential_value_inr')===''){o.res='Skipped';o.what='Left blank in the template.';res.unchanged++;return}
    if(isNaN(pv)||pv<0)return rej('Potential ₹ must be a number, 0 or more.');
    var shs=get(r,'potential_qty_sheets'),sqs=get(r,'potential_qty_sqft'),sh=shs===''?0:toNum(shs),sq=sqs===''?0:toNum(sqs),shr=get(r,'share_pct'),share=shr===''?null:toNum(shr);
    if(isNaN(sh)||sh<0||isNaN(sq)||sq<0)return rej('Sheets and sq ft must be 0 or more.');if(share!=null&&(isNaN(share)||share<0||share>100))return rej('Share % must be 0 to 100.');
    var key=geoKey(q,st,did,grp,seg);if(seen[key])return rej('Duplicate row in the file.');seen[key]=1;
    var ex=S.potential.find(function(p){return p._id===key})||null,exV=ex&&tpVisible(ex)?ex:null;
    var srcT=get(r,'source_type')||(exV&&exV.source_type)||'branch estimate',note=get(r,'source_note'),own=(get(r,'owner_email')||(exV&&exV.owner_email)||u.email).toLowerCase();
    if(share==null&&exV&&exV.share_pct!==''&&exV.share_pct!=null)share=+exV.share_pct;
    o.pot=pv;o.v={q:q,st:st,did:did,group:grp,seg:seg,pot:pv,sh:sh,sq:sq,src:srcT,note:note};o.own=own;o.ex=exV;o.key=key;
    /* identical to what is saved: skipped, status kept (a DEMO record is never unchanged: an upload makes it real) */
    if(ex&&!ex.demo&&(+ex.potential_value_inr||0)===pv&&(+ex.potential_qty_sheets||0)===sh&&(+ex.potential_qty_sqft||0)===sq&&String(ex.share_pct===''||ex.share_pct==null?'':+ex.share_pct)===String(share==null?'':share)&&(ex.source_type||'')===srcT&&(ex.source_note||'')===note){o.res='Unchanged';o.what='Skipped; '+(ex.status==='Discussed'?'Proposed':ex.status)+' stays '+(ex.status==='Discussed'?'Proposed':ex.status)+'.';res.unchanged++;return}
    if(share==null){var row=model.rows.find(function(x){return x.st===st&&x.group===grp});var d=did==='_state'?(row&&row.last.dsh):null;
      if(d!=null&&seg==='All'){share=d;o.res='Warning';o.what='Loads as Draft. Share % blank: default '+d.toFixed(2)+'% used (last quarter + '+(+CFG.default_share_uplift_pts||0)+' points).';res.warn++}
      else{o.res='Warning';o.what='Loads as Draft with no share % (no default: no last-quarter potential). The target shows "pending".';res.warn++}}
    else{o.res='Ready';o.what='Loads as Draft'+(ex?' (was '+tpIN(+ex.potential_value_inr||0)+').':'.');}
    o.share=share;res.ready++;
  });
  if(kind==='phasing')Object.keys(ph).forEach(function(k){var p=ph[k],sum=p.pct.reduce(function(a,b){return a+(b||0)},0);if(p.pct.some(function(v){return v==null})||Math.abs(sum-100)>0.01){p.rows.forEach(function(o){if(o.res==='Ready'){o.res='Rejected';o.what='The three months must be given and add up to 100 (they add up to '+sum+').';res.ready--;res.rejected++}})}else p.ok=true});
  res.ph=ph;S.tp.up=res;toast('Upload checked: '+res.ready+' ready, '+res.unchanged+' unchanged or blank, '+res.rejected+' rejected. Press Load to save.');tpRerender();return res;
}
function tpUploadResultHtml(){
  var r=S.tp.up;if(!r)return '';
  if(r.err)return '<div class="banner err" style="display:block"><b>'+esc(r.name||'Upload')+'</b>: '+esc(r.err)+' <button class="btn sm" data-act="tp-up-cancel">Close</button></div>';
  var loadN=r.rows.filter(function(o){return o.res==='Ready'||o.res==='Warning'}).length;
  return '<section class="card tp-upres"><div class="tp-h"><h3>Result of the upload · '+esc(r.name)+'</h3></div><div class="tp-strip"><span class="tp-pill tp-ok">'+(r.ready-r.warn)+' Ready</span><span class="tp-pill tp-draft">'+r.unchanged+' Unchanged or blank</span><span class="tp-pill tp-str">'+r.warn+' Warning</span><span class="tp-pill tp-miss">'+r.rejected+' Rejected</span><span class="tp-mut">'+r.rows.length+' rows read · nothing is saved until you press Load</span></div>'
   +'<div class="tw"><table><thead><tr><th class="num">File row</th><th>State</th><th>District</th><th>Product group</th><th class="num">Potential ₹</th><th>Result</th><th>What to do</th></tr></thead><tbody>'+r.rows.slice(0,200).map(function(o){return '<tr><td class="num">'+o.rn+'</td><td>'+esc(o.st?stateName(o.st):o.stRaw)+'</td><td>'+esc(o.did==='_state'?'':geoDistrictName(o.did))+'</td><td>'+esc(o.grp)+'</td><td class="num mono">'+(o.pot!=null?tpIN(o.pot):'')+'</td><td>'+(o.res==='Rejected'?'<b class="tp-own">✗ Rejected</b>':esc(o.res))+'</td><td class="note">'+esc(o.what)+'</td></tr>'}).join('')+'</tbody></table></div>'
   +'<div class="row">'+(r.rejected?'<button class="btn sm" data-act="tp-up-rej">Download file of '+r.rejected+' rejected rows</button>':'')+'<button class="btn" data-act="tp-up-cancel">Cancel</button><button class="btn pri" data-act="tp-up-load"'+(loadN?'':' disabled')+'>Load '+loadN+' row'+(loadN===1?'':'s')+' as Draft</button></div>'
   +'<p class="tp-mut">Loaded rows become real Drafts, also over DEMO rows. Rows identical to what is saved are skipped, so an Approved target is never demoted by re-uploading the same file. Then Submit for approval in the grid.</p></section>';
}
async function tpUploadLoad(){
  var r=S.tp.up;if(!r||r.err)return;if(!guardWrite())return;var u=effUser(),n=0,errs=[];
  try{
    if(r.kind==='phasing'){var ks=Object.keys(r.ph);for(var i=0;i<ks.length;i++){var p=r.ph[ks[i]];if(!p.ok)continue;var id=geoPhKey(tpQ(),p.st,p.did,p.grp),d={fy_quarter:tpQ(),state_code:p.st,district_id:p.did,product_group:p.grp,customer_segment:'',pct:p.pct,by:u.email,at:nowISO()};await dset('phasing/'+id,d);var pi=S.phasing.findIndex(function(x){return x._id===id});if(pi>=0)S.phasing[pi]=Object.assign({_id:id},d);else S.phasing.push(Object.assign({_id:id},d));n++}if(n)await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:u.email,event:'phasing changed',quarter:tpQ(),file:r.name});DS.cache={};S.potVer++}
    else for(var j=0;j<r.rows.length;j++){var o=r.rows[j];if(o.res!=='Ready'&&o.res!=='Warning')continue;var doc=tpDoc(o.v,o.ex,o.share,u,'Uploaded file '+r.name);doc.owner_email=o.own;await tpLeafPut(o.key,doc);n++}
  }catch(e){errs.push(dbErrText(e))}
  S.tp.up=null;toast('Loaded '+n+' row'+(n===1?'':'s')+(r.kind==='phasing'?' of phasing':' as Draft'));
  tpMsg(errs.length?'err':'ok','Loaded '+n+' '+(r.kind==='phasing'?'phasing row'+(n===1?'':'s'):'row'+(n===1?'':'s')+' as Draft')+' from '+esc(r.name)+'.'+(errs.length?' Stopped: '+esc(errs.join('; ')):''));tpRerender();
}
/* lock: the quarter's attributed actuals are snapshotted so a later master edit never moves them */
async function tpLockGo(t){
  var q=t.getAttribute('data-q'),ok=tpCanApprove()&&!isPlanLocked(q);await handlers['plan-lock'](t);
  if(ok){try{var rows=await geoSnapRows(q);var ex=S.planlocks[q]||{};await dset('planlocks/'+q,Object.assign({fy_quarter:q,by:effUser().email,at:nowISO()},ex,{geo_snap:await gz(JSON.stringify(rows)),geo_snap_at:nowISO(),geo_snap_n:rows.length,_id:undefined}))}catch(e){toast('Locked; the actuals snapshot was not saved: '+dbErrText(e))}}
  closeDlg();S.lastHtml='';schedule();
}
/* ---------- events ---------- */
function tpRerender(){S.lastHtml='';schedule()}
function tpFindVM(key){var f=null;tpAllVMs(tpModel()).forEach(function(o){if(o.v.key===key)f=o.v});return f}
function tpLink(key,field,val){
  var e=S.tp.ed[key]=S.tp.ed[key]||{},vm=tpFindVM(key);if(!vm)return;
  if(field==='pot'){e.pot=val;var pot=tpNum(val);if(pot==null){if(e.touch!=='tgt')delete e.tgt;return}
    if(e.touch==='tgt'&&tpNum(e.tgt)!=null&&pot>0){e.share=String(Math.round(tpNum(e.tgt)/pot*100*1e8)/1e8)}
    else{var sh=e.share!==undefined?tpNum(e.share):(vm.x&&vm.x.share_pct!==''&&vm.x.share_pct!=null?+vm.x.share_pct:null);if(sh!=null)e.tgt=tpIN(leafTgt(pot,sh))}}
  else if(field==='share'){e.share=val;e.touch='share';var s=tpNum(val),p=e.pot!==undefined?tpNum(e.pot):vm.pot;if(s!=null&&p!=null)e.tgt=tpIN(leafTgt(p,s));else if(s==null)delete e.tgt}
  else if(field==='tgt'){e.tgt=val;e.touch='tgt';var t=tpNum(val),p2=e.pot!==undefined?tpNum(e.pot):vm.pot;if(t!=null&&p2!=null&&p2>0)e.share=String(Math.round(t/p2*100*1e8)/1e8)}
}
document.addEventListener('input',function(ev){
  var t=ev.target,f=t.getAttribute&&t.getAttribute('data-tp');if(!f)return;
  if(f==='rettext'){S.tp.retText=t.value;return}
  if(f==='phc'){var st=S.tp.ph[t.getAttribute('data-g')];if(st)st.c[+t.getAttribute('data-i')]=t.value;return}
  var key=t.getAttribute('data-key');if(!key)return;var e=S.tp.ed[key]=S.tp.ed[key]||{};
  if(['pot','share','tgt','note','sh','sq'].indexOf(f)>=0)e[f]=t.value;
});
document.addEventListener('change',function(ev){
  var t=ev.target;if(!t.getAttribute)return;
  var tf=t.getAttribute('data-tpfile');if(tf&&t.files&&t.files[0]){var file=t.files[0];file.text().then(function(x){return tpUploadCheck(tf,file.name,x)}).then(function(){t.value=''});return}
  var f=t.getAttribute('data-tp');if(!f)return;var key=t.getAttribute('data-key');
  if(f==='q'){S.tp.q=t.value;S.tp.ed={};S.tp.ph={};S.tp.sel={};S.tp.ret=false;S.tp.msg='';S.tp.up=null;S.lastTop=null;tpRerender();return}
  if(f==='st'){S.tp.st=t.value;S.tp.msg='';tpRerender();return}
  if(f==='view'){S.tp.view=t.value;tpRerender();return}
  if(f==='grp'){S.tp.grp=t.value;tpRerender();return}
  if(f==='seg'){S.tp.seg=t.checked;tpRerender();return}
  if(f==='sel'){if(t.checked)S.tp.sel[key]=1;else delete S.tp.sel[key];tpRerender();return}
  if(f==='src'){(S.tp.ed[key]=S.tp.ed[key]||{}).src=t.value;tpRerender();return}
  if(f==='pot'||f==='share'||f==='tgt'){var nv=t.value;if((f==='pot'||f==='tgt')&&tpNum(nv)!=null)nv=tpIN(tpNum(nv));tpLink(key,f,nv);tpRerender();return}
  if(f==='note'||f==='sh'||f==='sq'){(S.tp.ed[key]=S.tp.ed[key]||{})[f]=(f!=='note'&&tpNum(t.value)!=null)?tpIN(tpNum(t.value)):t.value;tpRerender();return}
  if(f==='ph'){var g=t.getAttribute('data-g'),st=S.tp.ph[g]||(S.tp.ph[g]={m:t.value,c:['','','']});st.m=t.value;
    if(st.m==='custom'&&st.c.every(function(c){return c===''})){var row=tpModel().rows.find(function(r){return r.gkey===g});if(row)st.c=phasingFor({fy_quarter:tpQ(),state_code:row.st,district_id:'_state',product_group:row.group,customer_segment:'All'}).map(function(v){return String(r2(v))})}
    tpRerender();return}
  if(f==='phc'){var st2=S.tp.ph[t.getAttribute('data-g')];if(st2)st2.c[+t.getAttribute('data-i')]=t.value;tpRerender();return}
});
document.addEventListener('toggle',function(ev){var d=ev.target;if(d&&d.getAttribute&&d.getAttribute('data-okey')){if(d.open)S.tp.open[d.getAttribute('data-okey')]=1;else delete S.tp.open[d.getAttribute('data-okey')]}},true);
Object.assign(handlers,{
 'tp-save':function(){return tpSave()},
 'tp-copy':function(){return tpCopy()},
 'tp-submit':function(){return tpSubmitOpen()},
 'tp-submit-go':function(){return tpSubmitGo()},
 'tp-approve':function(){return tpApprove()},
 'tp-return-open':function(){S.tp.ret=true;tpRerender()},
 'tp-return-cancel':function(){S.tp.ret=false;S.tp.retText='';tpRerender()},
 'tp-return-go':function(){return tpReturn()},
 'tp-up-load':function(){return tpUploadLoad()},
 'tp-up-cancel':function(){S.tp.up=null;tpRerender()},
 'tp-up-rej':function(){var r=S.tp.up;return download('rejected-rows.csv',csvLine(['row','state','district','product_group','reason'])+'\n'+r.rows.filter(function(o){return o.res==='Rejected'}).map(function(o){return csvLine([o.rn,o.stRaw,o.did,o.grp,o.what])}).join('\n'))},
 'tp-usesum':function(t){var st=t.getAttribute('data-st'),g=t.getAttribute('data-g'),row=tpModel().rows.find(function(r){return r.st===st&&r.group===g});if(!row||!row.main)return;tpLink(row.main.key,'pot',tpIN(row.dSum));tpRerender()},
 'tp-tmpl':function(t){var k=t.getAttribute('data-t');return download((k==='phasing'?'target-phasing':k==='district'?'market-potential-district':'market-potential-state')+'-'+tpQ()+'.csv',tpTemplateCsv(k))},
 'tp-lock-open':function(){
   if(!tpCanApprove()){toast('Only Management / HO or Super admin can lock a quarter');return}
   var q=tpQ(),n=S.potential.filter(function(x){return x.fy_quarter===q&&x.status==='Approved'}).length,d=S.potential.filter(function(x){return x.fy_quarter===q&&x.state_code&&x.status!=='Approved'&&x.status!=='Locked'}).length;
   openDlg('<h3>Lock '+qLabel(q)+'?</h3><p class="note">Locking freezes the '+n+' Approved target'+(n===1?'':'s')+' of '+qLabel(q)+' and keeps the actuals attributed to each state as they are now. '+(d?d+' row'+(d===1?' is':'s are')+' still Draft or Proposed and will stay uncounted. ':'')+'A locked quarter cannot be edited by anyone and cannot be unlocked in v1.0.</p><div class="row"><button class="btn pri" data-act="tp-lock-go" data-q="'+q+'">Lock '+qLabel(q)+'</button><button class="btn" data-act="dlg-close">Cancel</button></div>')},
 'tp-lock-go':function(t){return tpLockGo(t)}
});
