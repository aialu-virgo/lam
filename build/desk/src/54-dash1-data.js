/* ================= My Dashboard, part 1: measures, breakdowns, periods, sources (built 8 Nov 2026) =================
 * A card is saved data: {id,title,measure,base,by,filters[],period,visual,n,dir,sortBy,span,drill[]}. dRun (part 2) answers it from the Desk's own aggregates
 * (roll-ups DS.pg/DS.spk, detail chunks DS.dim, customer chunks DS.cust, credit notes, collections, receivables, stock, plans, actions), never from raw lines.
 * Row-level access: every source below is read through SC() / plantInScope() / the scoped DS maps, so a card cannot show more than the viewer's scope.
 * Rules: sheets first; QoQ only (resolvePeriod shifts by three months, nothing else); Ach/Share above 300% = Check; partial and not loaded are never zero. No LLM. */
var DASH={rc:{},rcSig:'',sig:'',pend:{},dvTick:0};
var D_SEP='\u0001';
/* ---- small helpers ---- */
function dV(v,st,x){var o={v:v,st:st||(v==null?'nolod':'ok')};if(x)for(var k in x)o[k]=x[k];return o}
function dMed(a){a=a.slice().sort(function(x,y){return x-y});var n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null}
function dSetOf(a){return new Set(a)}
function dInter(a,pred){var o=new Set();a.forEach(function(x){if(pred(x))o.add(x)});return o}
/* data fingerprint: anything that can change a figure changes this string, so cached results are never stale */
function dDataSig(){
  var up=S.uploads&&S.uploads[0],act=0;
  (S.actions||[]).forEach(function(a){act+=(a.status?a.status.length:0)+(a.due?(a.due.charCodeAt(9)||0):0)+(a.done_at?7:0)});
  var zs=0;S.plants.forEach(function(p){zs+=(p.zone||'').length*3+(p.state||'').length});
  return [DS.ver,DS.custVer,DS.dimVer,S.potVer,Object.keys(S.cells).length,S.cellsSigTick||0,S.uploads.length,up&&up.at,S.coll.length,S.stockAsOf,S.recvAsOf,(S.recv||[]).length,(S.cnRaw||[]).length,(S.actions||[]).length,act,(S.followups||[]).length,S.plants.length,zs,(S.phasing||[]).length,S.itemMeta?1:0,TODAY(),scopeSig(SC()),S.viewAs||'',DASH.dvTick,typeof GEO!=='undefined'?GEO.ver:0,DS.status==='ready'?1:0].join('|');
}
function dBump(){DASH.rc={};DASH.dvTick++;if(S.dash)S.dash.html={};S.lastHtml='';schedule()}
function dMemo(key,fn){var sig=dDataSig();if(DASH.rcSig!==sig){DASH.rc={};DASH.rcSig=sig}var h=DASH.rc[key];if(h!==undefined)return h;h=fn();DASH.rc[key]=h;return h}

/* ---- scope, plants, zones, states ---- */
function dScope(){
  return dMemo('scope',function(){
    var sc=SC(),all=distinct('plant').filter(function(p){return plantInScope(sc,p)}),pm={};
    S.plants.forEach(function(p){pm[p.plant_code]=p});
    return {sc:sc,plants:all,own:sc.sp?ownKey():null,pm:pm};
  });
}
function dZone(p){var z=zoneOfPlant(p).z;return z||'No zone'}
function dState(p){var pl=dScope().pm[p],raw=pl&&pl.state?String(pl.state).trim():'';if(!raw)return 'No state';var c=stateCode(raw);return c?stateName(c):raw}

/* ---- periods: card period -> resolvePeriod (QoQ is the only comparison, three months back) ---- */
function dPerSpec(p){
  p=p||{k:'follow'};if(p.k==='follow')p=(S.dash&&S.dash.per)||{k:'QTD'};
  var cq=curQuarterKey();
  if(p.k==='MTD')return {mode:'MTD',m:p.m||TODAY().slice(0,7)};
  if(p.k==='Q')return {mode:'QTD',q:p.q||prevQ(cq)};
  if(p.k==='FY')return {mode:'YTD',q:p.q||cq};
  if(p.k==='CUSTOM')return {mode:'CUSTOM',from:p.from,to:p.to};
  return {mode:'QTD',q:cq};
}
function dRes(p){
  var spec=dPerSpec(p);
  return dMemo('res'+JSON.stringify(spec),function(){
    var res=resolvePeriod(spec,TODAY());
    if(res.mode==='YTD'){res.qCur=res.latestCur;res.qPrior=res.latestPrior;res.qNote='latest quarter '+qLabel(res.q)+' against '+qLabel(prevQ(res.q))}
    else{res.qCur=res.cur;res.qPrior=res.prior;res.qNote=res.priorLabel}
    res.qCurMonths=res.qCur.filter(function(x){return x.frac>0}).map(function(x){return x.ym});
    res.qPriorMonths=(res.qPrior||[]).filter(function(x){return x.frac>0}).map(function(x){return x.ym});
    res.endYm=res.curMonths.length?res.curMonths[res.curMonths.length-1]:TODAY().slice(0,7);
    return res;
  });
}
/* the seven quarters behind sparklines, stacked bars and trend lines (closed quarters since history start + the current one, to date) */
function dQuarters(){
  return dMemo('qs',function(){
    var cur=curQuarterKey(),qs=closedQuarters().concat([cur]).slice(-7);
    return qs.map(function(q){var ms=qMonths(q),isCur=q===cur,N=isCur?wdBetween(ms[0]+'-01',TODAY()):Infinity;
      return {q:q,label:qLabel(q),months:ms,isCur:isCur,w:isCur?walk(ms,N):wins(ms)}});
  });
}
function dPriorW(q,isCur){var pq=prevQ(q),ms=qMonths(pq),N=isCur?wdBetween(qMonths(q)[0]+'-01',TODAY()):Infinity;return isCur?walk(ms,N):wins(ms)}
function dMonths8(res){
  var end=res.endYm,tYm=TODAY().slice(0,7);if(end>tYm)end=tYm;
  return ymRange(shiftYm(end,-7),end).filter(function(m){return m>=histLoYm()});
}

/* ---- filters: card filters + drill-down steps, intersected with the viewer's scope ---- */
function dFilt(card){
  var SCP=dScope(),F={plants:new Set(SCP.plants),groups:null,thk:null,brand:null,cust:null,sp:SCP.own,spPick:null};
  (card.filters||[]).concat(card.drill||[]).forEach(function(f){
    if(!f||!f.dim||!f.vals||!f.vals.length)return;var vs=f.vals.map(String);
    if(f.dim==='plant')F.plants=dInter(F.plants,function(p){return vs.indexOf(p)>=0});
    else if(f.dim==='zone')F.plants=dInter(F.plants,function(p){return vs.indexOf(dZone(p))>=0});
    else if(f.dim==='state')F.plants=dInter(F.plants,function(p){return vs.indexOf(dState(p))>=0});
    else if(f.dim==='group')F.groups=F.groups?dInter(F.groups,function(g){return vs.indexOf(g)>=0}):dSetOf(vs);
    else if(f.dim==='thickness')F.thk=dSetOf(vs);
    else if(f.dim==='brand')F.brand=dSetOf(vs);
    else if(f.dim==='customer')F.cust=dSetOf(vs);
    else if(f.dim==='salesperson'){if(SCP.own==null)F.spPick=vs[0]}
  });
  if(F.spPick&&SCP.own==null)F.sp=F.spPick;
  return F;
}
function dBaseM(F){return {plants:F.plants,groups:F.groups,sp:F.sp,thk:F.thk,brand:F.brand,cust:F.cust}}
function dMk(m,over){var o={};for(var k in m)o[k]=m[k];if(over)for(var j in over)o[j]=over[j];return o}
function dSKey(s){return s?Array.from(s).sort().join(','):''}
function dMKey(m){return dSKey(m.plants)+'#'+dSKey(m.groups)+'#'+(m.sp||'')+'#'+dSKey(m.thk)+'#'+dSKey(m.brand)+'#'+dSKey(m.cust)}
function dWKey(w){return wins(w).map(function(x){return x.ym+':'+(Math.round(x.frac*1000)/1000)}).join(',')}
function dMonthsOf(w){return wins(w).filter(function(x){return x.frac>0}).map(function(x){return x.ym})}

/* ---- sales: roll-up path, detail-chunk path (thickness, brand), customer-chunk path ---- */
function dNeedDetail(kind,m,w){
  var ms=dMonthsOf(w),key=kind+'|'+dSKey(m.plants)+'|'+ms.join(',')+'|'+DS.sig+'|'+(kind==='cust'?DS.custVer:DS.dimVer);
  if(DASH.pend[key])return;DASH.pend[key]=1;
  var job;try{job=kind==='dim'?loadDim(m.plants,ms):loadCust(m.plants,ms)}catch(e){job=null}
  Promise.resolve(job).then(function(){dBump()},function(){dBump()});
}
function dDimMap(m,w){
  return dMemo('dm'+dMKey(dMk(m,{thk:null,brand:null,cust:null}))+'|'+dWKey(w),function(){
    var st=dimState(m.plants,w),out={map:null,st:st};
    if(!st.have)return out;
    if(!st.ready){dNeedDetail('dim',m,w);return out}
    var sc=SC();out.map=new Map();
    wins(w).forEach(function(x){if(!(x.frac>0))return;var c=S.cells['INV_'+x.ym];if(!c)return;
      Object.keys(c.plants||{}).forEach(function(p){if(!plantInScope(sc,p)||(m.plants&&!m.plants.has(p)))return;
        var d=DS.dim[p+D_SEP+x.ym];if(!d||d.at!==c.plants[p].at)return;
        d.rows.forEach(function(r){if(m.groups&&!m.groups.has(r[2]))return;var k=r[0]+D_SEP+r[1],o=out.map.get(k);if(!o){o={thk:r[0],brand:r[1],n:0,sh:0,sq:0,l:0};out.map.set(k,o)}
          o.n+=r[7]*x.frac;o.sh+=r[5]*x.frac;o.sq+=r[6]*x.frac;o.l+=r[4]*x.frac})})});
    return out;
  });
}
function dCustMap(m,w){
  return dMemo('cm'+dMKey(dMk(m,{thk:null,brand:null,cust:null}))+'|'+dWKey(w),function(){
    var yms=dMonthsOf(w);
    if(!custLoaded(yms,m.plants)){dNeedDetail('cust',m,w);return {map:null,loading:true}}
    var gs=m.groups?Array.from(m.groups):[undefined],out=new Map();
    gs.forEach(function(g){
      custAgg({plants:m.plants,group:g,sp:m.sp==null?undefined:m.sp},w).forEach(function(v,k){var o=out.get(k);if(!o){o={code:k,name:v.name,n:0,sh:0,sq:0,d:0};out.set(k,o)}o.n+=v.n;o.sh+=v.sh;o.sq+=v.sq;o.d+=v.d});
    });
    return {map:out};
  });
}
function dSales(m,w){
  w=wins(w);
  return dMemo('s'+dMKey(m)+'|'+dWKey(w),function(){
    if(m.cust){
      var cm=dCustMap(dMk(m,{cust:null}),w);if(cm.loading)return {st:'loading'};
      var acc={n:0,sh:0,sq:0,l:0,d:0};m.cust.forEach(function(c){var o=cm.map.get(c);if(o){acc.n+=o.n;acc.sh+=o.sh;acc.sq+=o.sq;acc.d+=o.d}});
      return {st:'ok',raw:acc,net:null,detail:'cust'};
    }
    if((m.thk||m.brand)&&m.sp!=null)return {st:'na',why:'Thickness and brand detail is held by plant, not by person, so it is not shown for one salesperson'};
    if(m.thk||m.brand){
      var dm=dDimMap(dMk(m,{thk:null,brand:null}),w);
      if(!dm.st.have)return {st:'nodetail',total:dm.st.total};
      if(!dm.map)return {st:'loading'};
      var a2={n:0,sh:0,sq:0,l:0,d:0};dm.map.forEach(function(o){if(m.thk&&!m.thk.has(o.thk))return;if(m.brand&&!m.brand.has(o.brand))return;a2.n+=o.n;a2.sh+=o.sh;a2.sq+=o.sq;a2.l+=o.l});
      return {st:'ok',raw:a2,net:null,detail:'dim',partialDetail:dm.st.complete?null:{have:dm.st.have,total:dm.st.total}};
    }
    var gs=m.groups?Array.from(m.groups):[undefined],raw={n:0,sh:0,sq:0,l:0,d:0},net=m.sp==null?{n:0,sh:0,sq:0}:null,unc=[],cnv=0;
    gs.forEach(function(g){
      var a=sumF({plants:m.plants,group:g,sp:m.sp==null?undefined:m.sp},w);raw.n+=a.n;raw.sh+=a.sh;raw.sq+=a.sq;raw.l+=a.l;raw.d+=a.d;
      if(net){var cn=cnFor({plants:m.plants,group:g},w);if(cn.covered){net.n+=a.n-cn.value;net.sh+=a.sh-cn.sheets;net.sq+=a.sq-cn.sqft;cnv+=cn.value}else{net=null;unc=cn.uncovered}}
    });
    return {st:'ok',raw:raw,net:net,cnValue:net?cnv:null,unc:unc};
  });
}
/* months of the window with sales loaded for every plant of the member: partial / not loaded flags, never a zero */
function dSalesCov(m,w){
  var ms=dMonthsOf(w);if(!ms.length)return {k:0,n:0,any:false};
  var plants=m.plants&&m.plants.size?m.plants:null,k=ms.filter(function(x){return monthLoaded(x,plants)}).length;
  return {k:k,n:ms.length,any:anyMonthData(ms,plants)};
}

/* ---- collections: one index of plant-month receipts per data signature ---- */
function dCollIdx(){
  return dMemo('collidx',function(){
    var ix={},sc=SC();S.coll.forEach(function(d){if(!d.ym||!plantInScope(sc,d.plant)||d.total==null)return;ix[d.plant+D_SEP+d.ym]={rec:+d.total||0,plan:d.plan!=null?+d.plan:null,rows:d.rows||[]}});return ix;
  });
}
function dColl(m,w){
  var ix=dCollIdx(),rec=0,plan=0,have=0,planHave=0,tot=0;w=wins(w);
  w.forEach(function(x){if(!(x.frac>0))return;m.plants.forEach(function(p){tot++;var d=ix[p+D_SEP+x.ym];if(d){have++;rec+=d.rec*x.frac;if(d.plan!=null){plan+=d.plan*x.frac;planHave++}}})});
  return {rec:rec,plan:planHave&&planHave===have?plan:null,have:have,total:tot};
}
function dCN(m,w){
  var gs=m.groups?Array.from(m.groups):[undefined],val=0,sh=0,cov=true,unc=[],any=false;
  gs.forEach(function(g){var c=cnFor({plants:m.plants,group:g},w);if(c.covered){val+=c.value;sh+=c.sheets}else{cov=false;unc=c.uncovered}if(c.anyLoaded)any=true});
  return {covered:cov,value:val,sheets:sh,unc:unc,any:any};
}
function dStockL(){
  return dMemo('stockL',function(){
    var sc=stockScopeSnap();if(!sc||!Object.keys(sc.plants).length)return null;
    return {sn:sc.snap,L:invLines({f:{}},{as_of:sc.snap.as_of,plants:sc.plants})};
  });
}
function dStock(m){
  var S0=dStockL();if(!S0)return null;
  var sh=0,val=0,hasV=false,dn=0,dd=0,n=0;
  S0.L.forEach(function(x){if(m.plants&&!m.plants.has(x.plant))return;if(m.groups&&!m.groups.has(x.group))return;n++;sh+=x.sheets;if(x.value!=null){val+=x.value;hasV=true}if(x.days!=null){dn+=x.days*x.sheets;dd+=x.sheets}});
  return {sheets:sh,value:hasV?val:null,days:dd>0?dn/dd:null,n:n,asOf:S0.sn.as_of};
}
function dRecvItems(){return dMemo('recvit',function(){return recvItems(null)})}
function dRecv(m){
  var t=S.recvAsOf||TODAY(),b=[0,0,0,0],nd=0,tot=0,over=0,n=0,custs=new Map();
  dRecvItems().forEach(function(x){if(m.plants&&!m.plants.has(x.plant))return;if(m.cust&&!m.cust.has(x.cust))return;n++;var od=diffDays(t,x.due);tot+=x.open;
    var c=custs.get(x.cust);if(!c){c={code:x.cust,name:x.name,open:0};custs.set(x.cust,c)}c.open+=x.open;
    if(od<=0){nd+=x.open;return}if(od<=30)b[0]+=x.open;else if(od<=60)b[1]+=x.open;else if(od<=90)b[2]+=x.open;else b[3]+=x.open;if(od>CFG.overdue_share_days)over+=x.open});
  return {have:n>0,b:b,notDue:nd,total:tot,overShare:tot>0?over/tot*100:null,custs:custs,asOf:t};
}
function dActs(m){
  var u=effUser(),n=dScope().plants.length;
  return myActions(u).filter(function(a){if(a.status==='Cancelled')return false;if(a.plant){if(m.plants&&!m.plants.has(String(a.plant)))return false}else if(m.plants&&m.plants.size<n)return false;return true});
}
function dActCalc(kind,m){
  var l=dActs(m),today=TODAY();
  if(kind==='open')return l.filter(function(a){return LIVE_ST.indexOf(a.status)>=0}).length;
  if(kind==='overdue')return l.filter(function(a){return LIVE_ST.indexOf(a.status)>=0&&a.due&&diffDays(a.due,today)<0}).length;
  if(kind==='fu'){var ids={};l.forEach(function(a){ids[a.id]=1});return (S.followups||[]).filter(function(f){return ids[f.action_id]&&f.status!=='Sent'&&f.status!=='Dismissed'}).length}
  if(kind==='closure'){var dn=l.filter(function(a){return a.done_at}),ot=dn.filter(function(a){return a.done_at.slice(0,10)<=a.due});return dn.length?ot.length/dn.length*100:null}
  return null;
}

/* =============== measure registry =============== */
/* kind: sales | plan | coll | recv | cn | stock | rating | person | bench | act | dh. unit: sh | inr | pct | n | days | score.
 * lower: lower is better. add: adds up across members (donut, stacked, share-of-total allowed). snap: month-end snapshot, no period. dims: allowed breakdowns. */
var D_SALES_DIMS=['none','month','quarter','fy','plant','zone','state','group','thickness','brand','customer','salesperson'];
var D_PLAN_DIMS=['none','month','quarter','plant','zone','state','group'];
var D_COLL_DIMS=['none','month','quarter','fy','plant','zone','state','customer'];
var D_PLANT_DIMS=['none','plant','zone','state'];
var D_BN_DIMS=['plant','zone','state','group','salesperson'];
var MEAS={
 sheets:{mod:'Sales',label:'Sheets',unit:'sh',kind:'sales',add:true,dims:D_SALES_DIMS,tgt:true,src:'cells/ and roll/ sheets (net of credit notes when loaded for every plant, else invoiced)'},
 value_inv:{mod:'Sales',label:'Value invoiced',unit:'inr',kind:'sales',f:'n',add:true,dims:D_SALES_DIMS,src:'cells/ and roll/ invoiced value, external customers only'},
 value_net:{mod:'Sales',label:'Value, net of credit notes',unit:'inr',kind:'sales',f:'n',net:true,add:true,dims:['none','month','quarter','fy','plant','zone','state','group'],src:'roll/ invoiced less creditnotes/ (needs credit notes for every plant and month)'},
 qty_sqft:{mod:'Sales',label:'Quantity (sq ft)',unit:'sq',kind:'sales',f:'sq',add:true,dims:D_SALES_DIMS,src:'roll/ sq ft of the items sold'},
 lines:{mod:'Sales',label:'Invoice lines',unit:'n',kind:'sales',f:'l',add:true,dims:D_SALES_DIMS,src:'roll/ line count'},
 avgprice:{mod:'Sales',label:'Average price per sheet',unit:'inr1',kind:'sales',ratio:true,dims:D_SALES_DIMS,src:'invoiced value ÷ sheets'},
 target:{mod:'Planning',label:'Target (sheets)',unit:'sh',kind:'plan',pf:'tgt',add:true,dims:D_PLAN_DIMS,src:'potential/ approved target in sheets, phased by phasing/'},
 ach:{mod:'Planning',label:'Achievement % of target',unit:'pct',kind:'plan',ratio:true,dims:D_PLAN_DIMS,tgt:true,src:'sheets ÷ approved sheet target (Check target above 300%)'},
 potential:{mod:'Planning',label:'Market potential (sheets)',unit:'sh',kind:'plan',pf:'pot',add:true,dims:D_PLAN_DIMS,src:'potential/ approved potential in sheets, pro-rated by working days'},
 share:{mod:'Planning',label:'Share of potential',unit:'pct',kind:'plan',ratio:true,dims:D_PLAN_DIMS,src:'sheets ÷ market potential (Check potential above 300%)'},
 gap:{mod:'Planning',label:'Gap to target (sheets still to go)',unit:'sh',kind:'plan',lower:true,dims:D_PLAN_DIMS,src:'approved sheet target less sheets so far (negative = ahead of target)'},
 phasing:{mod:'Planning',label:'Target phasing by month',unit:'sh',kind:'plan',pf:'tgt',add:true,dims:['month'],fixedBy:'month',src:'potential/ target x phasing/ percentages per month'},
 coll:{mod:'Collections',label:'Collected',unit:'inr',kind:'coll',add:true,dims:D_COLL_DIMS,src:'collections/ receipts (Incoming Payment Report)'},
 coll_eff:{mod:'Collections',label:'Collection efficiency',unit:'pct',kind:'coll',ratio:true,dims:['none','month','quarter','plant','zone','state'],src:'collected ÷ invoiced in the same period (a ratio, not an achievement)'},
 recv_out:{mod:'Receivables',label:'Outstanding',unit:'inr',kind:'recv',snap:true,add:true,dims:['none','plant','zone','state','customer','ageing'],lower:true,src:'receivables/ open items on the latest snapshot'},
 recv_over:{mod:'Receivables',label:'Overdue share',unit:'pct',kind:'recv',snap:true,ratio:true,lower:true,dims:['none','plant','zone','state'],src:'open items past due by more than the Settings days ÷ total open'},
 recv_age:{mod:'Receivables',label:'Ageing buckets',unit:'inr',kind:'recv',snap:true,add:true,dims:['ageing'],fixedBy:'ageing',lower:true,src:'receivables/ days past due: 0-30, 31-60, 61-90, 90+'},
 cn_value:{mod:'Credit notes',label:'Credit notes (value)',unit:'inr',kind:'cn',add:true,lower:true,dims:['none','month','quarter','fy','plant','zone','state','group'],src:'creditnotes/ value by plant, month and group'},
 cn_ratio:{mod:'Credit notes',label:'Credit-note ratio',unit:'pct',kind:'cn',ratio:true,lower:true,dims:['none','month','quarter','plant','zone','state','group'],src:'credit notes ÷ invoiced value'},
 stock_sh:{mod:'Inventory',label:'Stock (sheets)',unit:'sh',kind:'stock',snap:true,add:true,dims:['none','plant','zone','state','group'],src:'stock/ latest snapshot, sheets on hand'},
 stock_val:{mod:'Inventory',label:'Stock value',unit:'inr',kind:'stock',snap:true,add:true,dims:['none','plant','zone','state','group'],src:'stock/ latest snapshot, value'},
 stock_days:{mod:'Inventory',label:'Stock days',unit:'days',kind:'stock',snap:true,ratio:true,lower:true,dims:['none','plant','zone','state','group'],src:'stock sheets ÷ sheets sold per day over the 90 days before the snapshot'},
 rating:{mod:'Rating',label:'Branch rating score',unit:'score',kind:'rating',ratio:true,dims:['plant'],fixedBy:'plant',src:'weighted percentile rank: sales 50, collections 30, stock days 20 (informational only)'},
 person:{mod:'Rating',label:'Person scorecard',unit:'sh',kind:'person',add:true,dims:['salesperson'],fixedBy:'salesperson',src:'sheets, QoQ and share per salesperson (no Ach % until person plans exist)'},
 bench_rank:{mod:'Benchmarking',label:'Rank',unit:'rank',kind:'bench',bench:'rank',dims:D_BN_DIMS,src:'rank among peers on the base measure'},
 bench_pct:{mod:'Benchmarking',label:'Percentile',unit:'pctl',kind:'bench',bench:'pct',dims:D_BN_DIMS,src:'percentile among peers on the base measure'},
 bench_best:{mod:'Benchmarking',label:'Gap to best',unit:'base',kind:'bench',bench:'best',dims:D_BN_DIMS,src:'member minus the best peer'},
 bench_med:{mod:'Benchmarking',label:'Gap to median',unit:'base',kind:'bench',bench:'med',dims:D_BN_DIMS,src:'member minus the median peer'},
 bench_idx:{mod:'Benchmarking',label:'Index vs average (100 = average)',unit:'idx',kind:'bench',bench:'idx',dims:D_BN_DIMS,src:'member ÷ average of peers x 100'},
 act_open:{mod:'Actions',label:'Open actions',unit:'n',kind:'act',a:'open',add:true,lower:true,dims:D_PLANT_DIMS,src:'actions/ live statuses in your scope'},
 act_over:{mod:'Actions',label:'Overdue actions',unit:'n',kind:'act',a:'overdue',add:true,lower:true,dims:D_PLANT_DIMS,src:'actions/ live and past their due date'},
 act_fu:{mod:'Actions',label:'Follow-ups pending',unit:'n',kind:'act',a:'fu',add:true,lower:true,dims:D_PLANT_DIMS,src:'followups/ drafts not yet sent or dismissed'},
 act_close:{mod:'Actions',label:'On-time closure %',unit:'pct',kind:'act',a:'closure',ratio:true,dims:D_PLANT_DIMS,src:'actions/ closed by the due date ÷ closed'},
 dh_cov:{mod:'Data health',label:'Coverage',unit:'pct',kind:'dh',dims:['none'],src:'coverage grid: loaded plant-months for the last four quarters'},
 dh_last:{mod:'Data health',label:'Last upload',unit:'text',kind:'dh',dims:['none'],src:'uploads/ latest successful load per SAP export'},
 dh_rej:{mod:'Data health',label:'Rejected rows',unit:'n',kind:'dh',lower:true,add:true,dims:['none'],src:'uploads/ rows skipped at validation'}
};
Object.keys(MEAS).forEach(function(k){MEAS[k].id=k});
var D_MODS=['Sales','Planning','Collections','Receivables','Credit notes','Inventory','Rating','Benchmarking','Actions','Data health'];
var D_MOD_ICON={Sales:'<path d="M3 20h18M6 16l4-5 4 3 5-7"/>',Planning:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',Collections:'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',Receivables:'<path d="M7 4h10M7 9h10M7 4c5 0 5 5 0 5l7 11"/>','Credit notes':'<path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3"/>',Inventory:'<path d="M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4"/>',Rating:'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>',Benchmarking:'<path d="M5 20V10M12 20V4M19 20v-7"/>',Actions:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>','Data health':'<path d="M3 12h4l3-8 4 16 3-8h4"/>'};
var D_BY={none:'None (total)',month:'Month',quarter:'Quarter',fy:'Financial year',plant:'Plant',zone:'Zone',state:'State (of the plant)',group:'Product group',thickness:'Thickness',brand:'Brand',item:'Item',customer:'Customer',salesperson:'Salesperson',ageing:'Ageing bucket'};
var D_VIS={kpi:'KPI tile',bullet:'Bullet vs target',bar:'Bar',stacked:'Stacked bar (7 quarters)',line:'Line trend',donut:'Donut',ranked:'Ranked top / bottom',heat:'Heatmap (member x month)',table:'Table with drill-down',multiples:'Small multiples',bench:'Benchmark vs best and median',coverage:'Coverage grid'};
var D_PERK={follow:'Follow the dashboard',MTD:'Month',Q:'Quarter',QTD:'Quarter to date (current)',FY:'Financial year',CUSTOM:'Custom range'};
var D_FILTER_DIMS=['plant','zone','state','group','thickness','brand','customer','salesperson'];

function dMeas(card){return MEAS[card.measure]||null}
function dBaseMeas(card){var m=dMeas(card);return m&&m.kind==='bench'?(MEAS[card.base]&&MEAS[card.base].kind!=='bench'?MEAS[card.base]:MEAS.sheets):m}
/* what a role may use (design/dashboard-builder-spec.md section 7) */
function dRoleOk(role,m){
  role=role||effRole();var k=m.kind;
  if(role==='Super admin'||role==='Management / HO'||role==='HOD')return true;
  if(role==='Branch / depot manager')return k!=='dh';
  if(role==='Sales executive'||role==='Coordinator (sales / CRR)')return k==='sales'||k==='act';
  if(role==='Accounts')return ['coll','recv','cn','act'].indexOf(k)>=0||(k==='sales'&&(m.id==='value_inv'||m.id==='value_net'));
  if(role==='Plant')return k==='stock'||k==='act'||(k==='sales'&&(m.id==='sheets'||m.id==='qty_sqft'));
  return k==='sales'||k==='act';
}
function dRoleWhy(role,m){return m.kind==='rating'?'Branch rating is for Management, HOD and Branch managers':m.kind==='dh'?'Data health is for Super admin, Management and HOD':'Outside the '+role+' role'}
function dDimOk(card,by){
  var m=dMeas(card);if(!m)return false;if(m.dims.indexOf(by)<0)return false;
  if(m.kind==='bench'){var b=dBaseMeas(card);return b.dims.indexOf(by)>=0}
  return true;
}
function dByWhy(card,by){var m=dMeas(card);if(by==='item')return 'Item-level sales are not stored in the roll-ups or detail chunks (thickness and brand are); the SAP documents list shows items';return m&&m.dims.indexOf(by)<0?'Not available for '+m.label:''}

/* ---- member lists per breakdown ---- */
function dMembers(card,F,res){
  var by=card.by||'none',base=dBaseM(F),SCP=dScope(),out=[];
  if(by==='none')return [{k:'all',label:'All'+(F.plants.size<SCP.plants.length?' (filtered)':''),m:base,dim:null}];
  if(by==='plant')Array.from(F.plants).sort().forEach(function(p){out.push({k:p,label:plantShort(p),m:dMk(base,{plants:dSetOf([p])}),dim:'plant'})});
  else if(by==='zone'||by==='state'){var fn=by==='zone'?dZone:dState,g={};F.plants.forEach(function(p){(g[fn(p)]=g[fn(p)]||[]).push(p)});Object.keys(g).sort().forEach(function(z){out.push({k:z,label:z,m:dMk(base,{plants:dSetOf(g[z])}),dim:by})})}
  else if(by==='group'){GROUPS.filter(function(g){return !F.groups||F.groups.has(g)}).forEach(function(g){out.push({k:g,label:g,m:dMk(base,{groups:dSetOf([g])}),dim:'group'})})}
  else if(by==='salesperson'){if(SCP.own!=null)out.push({k:SCP.own,label:SCP.own,m:base,dim:'salesperson'});else distinct('sp').forEach(function(s){if(F.spPick&&F.spPick!==s)return;out.push({k:s,label:s,m:dMk(base,{sp:s}),dim:'salesperson'})})}
  else if(by==='thickness'||by==='brand'){
    var dm=dDimMap(dMk(base,{thk:null,brand:null,cust:null}),res.cur),key=by==='thickness'?'thk':'brand',tot={};
    if(dm.map)dm.map.forEach(function(o){tot[o[key]]=(tot[o[key]]||0)+o.sh});
    Object.keys(tot).sort(function(a,b){return tot[b]-tot[a]}).forEach(function(l){if(F[key]&&!F[key].has(l))return;var ov={};ov[key]=dSetOf([l]);out.push({k:l,label:l,m:dMk(base,ov),dim:by})});
  }
  else if(by==='customer'){
    var m0=dMeas(card);
    if(m0.kind==='sales'){var cm=dCustMap(dMk(base,{cust:null,thk:null,brand:null}),res.cur);if(cm.map)Array.from(cm.map.values()).sort(function(a,b){return b.n-a.n}).slice(0,300).forEach(function(o){if(F.cust&&!F.cust.has(o.code))return;out.push({k:o.code,label:custName(o.code,o.name)||o.code,m:dMk(base,{cust:dSetOf([o.code])}),dim:'customer'})})}
    else if(m0.kind==='recv'){Array.from(dRecv(base).custs.values()).sort(function(a,b){return b.open-a.open}).slice(0,300).forEach(function(o){out.push({k:o.code,label:custName(o.code,o.name)||o.code,m:dMk(base,{cust:dSetOf([o.code])}),dim:'customer'})})}
    else if(m0.kind==='coll'){var tt={},ix=dCollIdx();Object.keys(ix).forEach(function(kk){if(!F.plants.has(kk.split(D_SEP)[0]))return;ix[kk].rows.forEach(function(r){tt[r[2]]=(tt[r[2]]||0)+r[3]})});Object.keys(tt).sort(function(a,b){return tt[b]-tt[a]}).slice(0,300).forEach(function(c){out.push({k:c,label:custName(c,'')||c,m:dMk(base,{cust:dSetOf([c])}),dim:'customer'})})}
  }
  else if(by==='ageing'){['0–30 days','31–60 days','61–90 days','90+ days'].forEach(function(l,i){out.push({k:String(i),label:l,m:base,dim:'ageing',bucket:i})})}
  else if(by==='month'){dMonths8(res).forEach(function(ym){out.push({k:ym,label:ymLabel(ym),m:base,dim:'month',w:[{ym:ym,frac:1}],pw:[{ym:priorQuarterMonth(ym),frac:1}],partial:ym===TODAY().slice(0,7)})})}
  else if(by==='quarter'){dQuarters().forEach(function(q,i){out.push({k:q.q,label:q.label+(q.isCur?' to date':''),m:base,dim:'quarter',w:q.w,pw:dPriorW(q.q,q.isCur),partial:q.isCur})})}
  else if(by==='fy'){
    var fys={},cq=curQuarterKey();closedQuarters().concat([cq]).forEach(function(q){var fy=q.slice(0,4);(fys[fy]=fys[fy]||[]).push(q)});
    Object.keys(fys).sort().forEach(function(fy){var ms=[];fys[fy].forEach(function(q){ms=ms.concat(qMonths(q))});var isc=fys[fy].indexOf(cq)>=0,N=isc?wdBetween(ms[0]+'-01',TODAY()):Infinity;out.push({k:fy,label:fy+(isc?' so far':''),m:base,dim:'fy',w:walk(ms,N),pw:null,partial:isc})});
  }
  return out;
}

/* =============== the value of a measure for a member over a window =============== */
function dValOne(meas,mem,w){
  var m=mem.m,k=meas.kind;
  if(k==='sales'){
    var a=dSales(m,w);if(a.st!=='ok')return dV(null,a.st,{total:a.total});
    var cov=dSalesCov(m,w),extra={cov:cov,partialDetail:a.partialDetail,basis:a.net?'Net':'Invoiced'};
    if(!cov.any&&!a.detail)return dV(null,'nolod',extra);
    if(meas.net){if(!a.net)return dV(null,'nocn',{unc:a.unc,cov:cov});return dV(a.net.n,'ok',extra)}
    if(meas.ratio){var sh0=a.net?a.net.sh:a.raw.sh,n0=a.raw.n;return dV(sh0>0?n0/sh0:null,'ok',extra)}
    var f=meas.f||'sh',src=(f==='n'||f==='l')?a.raw:(a.net||a.raw);
    return dV(src[f],'ok',extra);
  }
  if(k==='plan'){
    if(m.sp!=null||m.thk||m.brand||m.cust)return dV(null,'noplan',{why:'Targets and potential are set by plant and product group, not by person, customer, thickness or brand'});
    var gs=m.groups?Array.from(m.groups):[undefined],pot=0,tgt=0,any=false;
    gs.forEach(function(g){var P=planQtyF({plants:m.plants,group:g},w);if(P.any){any=true;pot+=P.pot;tgt+=P.tgt}});
    if(meas.id==='target'||meas.id==='phasing')return any&&tgt>0?dV(tgt,'ok'):dV(null,'noplan');
    if(meas.id==='potential')return any&&pot>0?dV(pot,'ok'):dV(null,'nopot');
    var s=dSales(m,w);if(s.st!=='ok')return dV(null,s.st);var sh=s.net?s.net.sh:s.raw.sh,cv=dSalesCov(m,w);
    if(meas.id==='gap')return tgt>0&&cv.any?dV(tgt-sh,'ok',{cov:cv,tgt:tgt,act:sh}):dV(null,tgt>0?'nolod':'noplan');
    if(meas.id==='ach'){if(!(tgt>0))return dV(null,'noplan');var a2=sh/tgt*100;return achCap(a2)?dV(null,'check',{raw:a2,what:'target',cov:cv}):dV(a2,'ok',{cov:cv,tgt:tgt,act:sh})}
    if(meas.id==='share'){if(!(pot>0))return dV(null,'nopot');var s2=sh/pot*100;return achCap(s2)?dV(null,'check',{raw:s2,what:'potential',cov:cv}):dV(s2,'ok',{cov:cv,pot:pot,act:sh})}
    return dV(null,'na');
  }
  if(k==='coll'){
    if(m.groups||m.thk||m.brand||m.sp!=null)return dV(null,'na',{why:'Receipts carry no product group or salesperson'});
    var cc=dColl(m,w);if(!cc.have)return dV(null,'nolod');
    var ex={cov:{k:cc.have,n:cc.total},plan:cc.plan};
    if(meas.id==='coll_eff'){var iv=sumF({plants:m.plants},w).n;if(!(iv>0))return dV(null,'nolod');return dV(cc.rec/iv*100,'ok',ex)}
    if(m.cust){var t=0,ix=dCollIdx();wins(w).forEach(function(x){if(!(x.frac>0))return;m.plants.forEach(function(p){var d=ix[p+D_SEP+x.ym];if(d)d.rows.forEach(function(r){if(m.cust.has(r[2]))t+=r[3]*x.frac})})});return dV(t,'ok',ex)}
    return dV(cc.rec,'ok',ex);
  }
  if(k==='cn'){
    if(m.thk||m.brand||m.cust||m.sp!=null)return dV(null,'na',{why:'Credit notes are stored by plant, month and product group'});
    var cn=dCN(m,w);if(!cn.covered)return dV(null,cn.any?'partial':'nocn',{unc:cn.unc});
    if(meas.id==='cn_ratio'){var iv2=0;(m.groups?Array.from(m.groups):[undefined]).forEach(function(g){iv2+=sumF({plants:m.plants,group:g},w).n});return iv2>0?dV(cn.value/iv2*100,'ok'):dV(null,'nolod')}
    return dV(cn.value,'ok');
  }
  return dV(null,'na');
}
function dSnap(meas,mem){
  var m=mem.m,k=meas.kind;
  if(k==='stock'){var s=dStock(m);if(!s||!s.n)return dV(null,'nolod');if(meas.id==='stock_sh')return dV(s.sheets,'ok',{asOf:s.asOf});if(meas.id==='stock_val')return s.value==null?dV(null,'nolod'):dV(s.value,'ok',{asOf:s.asOf});return s.days==null?dV(null,'nolod'):dV(s.days,'ok',{asOf:s.asOf})}
  if(k==='recv'){var r=dRecv(m);if(!r.have)return dV(null,'nolod');
    if(meas.id==='recv_over')return r.overShare==null?dV(null,'nolod'):dV(r.overShare,'ok',{asOf:r.asOf});
    if(mem.dim==='ageing')return dV(r.b[mem.bucket],'ok',{asOf:r.asOf});
    return dV(r.total,'ok',{asOf:r.asOf,notDue:r.notDue,buckets:r.b});}
  if(k==='act'){var v=dActCalc(meas.a,m);return v==null?dV(null,'noplan'):dV(v,'ok')}
  return dV(null,'na');
}
