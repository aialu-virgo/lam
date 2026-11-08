/* ================= My Dashboard, part 2: the query engine (members x windows -> rows) ================= */
function dIsPP(meas){return !!meas.ratio&&(meas.unit==='pct'||meas.unit==='days'||meas.unit==='score')}
/* quarter on quarter for one member. Sales: Net with Net only when credit notes are loaded for both quarters, else invoiced with invoiced (D40). Ratios: change in points. */
function dPair(meas,mem,wq,wp){
  var m=mem.m;
  if(!wp)return {v:null,state:'none',txt:mem.dim==='fy'?'FY is read quarter by quarter':'no prior quarter'};
  if(preHist(dMonthsOf(wp)))return {v:null,state:'nohist',txt:'No prior quarter loaded'};
  if(meas.kind==='sales'){
    var a=dSales(m,wq),p=dSales(m,wp);
    if(a.st==='loading'||p.st==='loading')return {v:null,state:'loading',txt:'reading detail'};
    if(a.st!=='ok'||p.st!=='ok')return {v:null,state:'incomplete',txt:'no prior detail'};
    var both=!!(a.net&&p.net);if(meas.net&&!both)return {v:null,state:'incomplete',txt:'credit notes not loaded'};
    var useNet=both;
    var g=function(o){
      if(meas.ratio){var s=useNet?o.net.sh:o.raw.sh;return s>0?o.raw.n/s:null}
      var f=meas.f||'sh';if(f==='n'&&meas.net)return o.net.n;if(f==='n'||f==='l')return o.raw[f];return (useNet?o.net:o.raw)[f];
    };
    var ca=dSalesCov(m,wq),cp=dSalesCov(m,wp),inc=!(ca.k===ca.n&&cp.k===cp.n&&ca.n>0&&cp.n>0);
    return qoqOf(g(a),g(p),{incomplete:inc});
  }
  var c=dValOne(meas,mem,wq),q=dValOne(meas,mem,wp);
  if(c.v==null||q.v==null)return {v:null,state:'incomplete',txt:(c.st==='ok'||c.st==null)?'prior quarter not loaded':'not loaded'};
  var cc=c.cov,pc=q.cov;if(cc&&pc&&(cc.k<cc.n||pc.k<pc.n))return {v:null,state:'incomplete',txt:'incomplete history'};
  if(dIsPP(meas))return {v:c.v-q.v,state:'ok',pp:true,txt:(c.v-q.v>=0?'+':'−')+Math.abs(c.v-q.v).toFixed(1)+(meas.unit==='days'?' days':' pts')};
  return qoqOf(c.v,q.v,{});
}
function dSeries(meas,mem){
  return dQuarters().map(function(q){
    var r=dValOne(meas,mem,q.w);
    var part=!!(r.cov&&r.cov.n&&r.cov.k<r.cov.n&&r.v!=null);
    return {q:q.q,label:q.label,v:r.st==='ok'?r.v:null,st:r.st,isCur:q.isCur,partial:part||q.isCur&&r.st==='ok'};
  });
}
function dMonthSeries(meas,mem,months){
  var tYm=TODAY().slice(0,7);
  return months.map(function(ym){var r=dValOne(meas,mem,[{ym:ym,frac:1}]);return {ym:ym,v:r.st==='ok'?r.v:null,st:r.st,partial:ym===tYm}});
}
/* band of a row: Ach % for sheets and the Ach measure, plan ÷ actual for stock days, collected ÷ plan for collections */
function dBandOf(meas,row){
  if(meas.id==='ach')return row.v!=null?oxBand(row.v):null;
  if(row.ach!=null)return oxBand(row.ach);
  return null;
}
function dPlanOf(meas,mem,res,row){
  /* target, potential and Ach for sheets-like measures over the card's window */
  if(meas.id==='sheets'&&mem.m.sp==null&&!mem.m.thk&&!mem.m.brand&&!mem.m.cust&&!mem.w){
    var gs=mem.m.groups?Array.from(mem.m.groups):[undefined],tgt=0,pot=0,any=false;
    gs.forEach(function(g){var P=planQtyF({plants:mem.m.plants,group:g},res.cur);if(P.any){any=true;tgt+=P.tgt;pot+=P.pot}});
    if(any){row.tgt=tgt>0?tgt:null;row.pot=pot>0?pot:null;
      if(tgt>0&&row.v!=null){var a=row.v/tgt*100;if(achCap(a)){row.check='target'}else row.ach=a}
      if(pot>0&&row.v!=null){var s=row.v/pot*100;if(achCap(s))row.checkPot=true;else row.share=s}}
  }else if(meas.id==='coll'&&row.x&&row.x.plan>0&&row.v!=null){row.tgt=row.x.plan;row.ach=row.v/row.x.plan*100;if(achCap(row.ach)){row.ach=null;row.check='target'}}
  else if(meas.id==='stock_days'&&row.v!=null&&CFG.stock_days_target>0){var al=achLower(row.v,CFG.stock_days_target);row.tgt=CFG.stock_days_target;row.ach=al.ach}
}
function dCompute(meas,members,res){
  return members.map(function(mem){
    var row={k:mem.k,label:mem.label,dim:mem.dim,mem:mem,partialTime:mem.partial};
    if(meas.snap){var r=dSnap(meas,mem);row.v=r.v;row.st=r.st;row.x=r;row.q={v:null,state:'none',txt:'no prior snapshot'};dPlanOf(meas,mem,res,row);return row}
    var wc=mem.w||res.cur,wq=mem.w||res.qCur,wp=mem.w?mem.pw:res.qPrior;
    var cur=dValOne(meas,mem,wc);row.v=cur.v;row.st=cur.st;row.x=cur;
    if(cur.st==='check'){row.check=cur.what}
    row.q=dPair(meas,mem,wq,wp);
    dPlanOf(meas,mem,res,row);
    if(cur.st==='ok'&&meas.kind==='sales'&&cur.cov&&cur.cov.k<cur.cov.n)row.partial=cur.cov;
    return row;
  });
}
/* sorting: value or QoQ, top (best first) or bottom */
function dSortRows(rows,card,meas){
  var sb=card.sortBy||'value',dir=card.dir||'top',lower=!!meas.lower;
  var key=function(r){var x=sb==='qoq'?(r.q&&r.q.state==='ok'?r.q.v:null):r.v;return x};
  var arr=rows.slice();
  arr.sort(function(a,b){
    if(sb==='label')return a.label<b.label?-1:a.label>b.label?1:0;
    var x=key(a),y=key(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
    var asc=(lower&&sb!=='qoq')?(dir==='top'):(dir==='bottom');
    return asc?x-y:y-x;
  });
  return arr;
}
function dRankPct(vals,v,hi){
  var n=vals.length;if(n<2)return null;var w=0,t=0;
  vals.forEach(function(o){if(o===v)return;if(hi?o<v:o>v)w++;else if(o===v)t++});
  return (w+.5*t)/(n-1)*100;
}
function dBench(rows,bm,lower){
  var vals=rows.filter(function(r){return r.v!=null}).map(function(r){return r.v});
  var best=vals.length?(lower?Math.min.apply(null,vals):Math.max.apply(null,vals)):null,med=dMed(vals),avg=vals.length?vals.reduce(function(a,b){return a+b},0)/vals.length:null;
  var sorted=rows.filter(function(r){return r.v!=null}).sort(function(a,b){return lower?a.v-b.v:b.v-a.v});
  rows.forEach(function(r){
    r.bv=r.v;r.bench={best:best,med:med,avg:avg,n:vals.length};
    if(r.v==null){r.rank=null;r.pctl=null;return}
    r.rank=sorted.indexOf(r)+1;r.pctl=dRankPct(vals,r.v,!lower);
    r.gapBest=r.v-best;r.gapMed=med==null?null:r.v-med;r.idx=avg>0?r.v/avg*100:null;
  });
  return {best:best,med:med,avg:avg,n:vals.length};
}
/* ---- data health ---- */
var D_ENT=[['INV','Sales (invoices)'],['CN','Credit notes'],['CL','Collections'],['RC','Receivables'],['ST','Stock']];
function dDh(card,meas){
  var qs=gridQuarters().list.slice(-4),R={rows:[],cov:[],qs:qs};
  D_ENT.forEach(function(e){var cells=qs.map(function(q){var c=covStatus(e[0],q);return {q:q,st:c.st,detail:c.detail}});R.cov.push({ent:e[0],label:e[1],cells:cells})});
  var tot=0,ok=0;R.cov.forEach(function(r){r.cells.forEach(function(c){tot++;if(c.st==='ok')ok++})});
  R.pct=tot?ok/tot*100:null;
  var ups=S.uploads.filter(function(u){return u.status==='Loaded'||u.status==='Undone'&&0});
  D_ENT.forEach(function(e){
    var l=ups.filter(function(u){return u.entity===e[0]}).sort(function(a,b){return a.at<b.at?1:-1})[0];
    R.rows.push({k:e[0],label:e[1],up:l||null,v:meas.id==='dh_rej'?(l?(+l.rejected||0):null):(l?l.at:null),read:l?(+l.read||0):null});
  });
  R.last=ups.length?ups.reduce(function(a,u){return a>u.at?a:u.at},''):'';
  R.rej=R.rows.reduce(function(a,r){return a+(r.v&&meas.id==='dh_rej'?r.v:0)},0);
  return R;
}
/* ---- rating (informational only) ---- */
function dRating(card,F,res,members){
  var SCP=dScope();
  if(SCP.own!=null)return {err:'Branch rating is not available to a Sales executive'};
  var ctx={sc:SCP.sc,f:{plant:'',group:''},res:res,plants:F.plants,base:{sp:undefined,group:undefined}};
  var plants=members.map(function(mem){var p=mem.k,o=figs({plant:p,plants:undefined},ctx,{noTrend:true}),pq=planQtyF({plants:undefined,plant:p},res.cur);
    return {p:p,o:o,pq:pq,ach:oxAchV(o.sh,pq.tgt),ck:oxAchCk(o.sh,pq.tgt)}});
  var colHave=false;try{colHave=collMonths(F.plants,res.cur).have}catch(e){}
  var inv=null;try{inv=invSummary(ctx)}catch(e){}
  var RT=ratingRows(plants,res,colHave?res.cur:null,inv);
  var byId={};RT.rows.forEach(function(b){byId[b.id]=b});
  return {RT:RT,byId:byId,basis:RT.basis};
}
function dRun(card){
  var key='run|'+[card.measure,card.base||'',card.by||'',JSON.stringify(card.filters||[]),JSON.stringify(card.drill||[]),JSON.stringify(card.period||{}),card.visual,card.n||'',card.dir||'',card.sortBy||''].join('|');
  return dMemo(key,function(){try{return dRun0(card)}catch(e){return {err:(e&&e.message)||String(e)}}});
}
function dRun0(card){
  var meas=dMeas(card);if(!meas)return {err:'This card uses a measure that no longer exists ('+card.measure+')'};
  var role=effRole();if(!dRoleOk(role,meas))return {locked:true,why:dRoleWhy(role,meas),meas:meas};
  var res=dRes(card.period),F=dFilt(card),by=meas.fixedBy||card.by||'none';
  var c2=Object.assign({},card,{by:by});
  var R={meas:meas,by:by,res:res,F:F,src:meas.src,rows:[],notes:[],card:card,unit:meas.unit,lower:!!meas.lower};
  if(!dDimOk(c2,by))return Object.assign(R,{err:'This measure cannot be broken down by '+D_BY[by]});
  if(meas.kind==='dh'){R.dh=dDh(card,meas);R.rows=R.dh.rows;R.noPeriod=true;return R}
  var SCP=dScope();
  if(!SCP.plants.length&&!DS.plants.length)return Object.assign(R,{empty:'No sales data in your scope yet.'});
  if(F.plants.size===0)return Object.assign(R,{empty:'No plant in your scope matches the filters of this card.'});
  if((by==='thickness'||by==='brand')&&F.sp!=null)return Object.assign(R,{empty:'Thickness and brand detail is held by plant, not by person, so it is not shown to a Sales executive.'});
  var members=dMembers(c2,F,res);R.members=members;
  if(!members.length&&(by==='customer'||by==='thickness'||by==='brand')){
    var base0=dMk(dBaseM(F),{cust:null,thk:null,brand:null});
    if(by==='customer'&&dMeas(c2).kind==='sales'){var cm0=dCustMap(base0,res.cur);if(cm0.loading)return Object.assign(R,{pending:'loading'})}
    if(by!=='customer'){var dm0=dDimMap(dMk(base0,{}),res.cur);if(!dm0.st.have)return Object.assign(R,{pending:'nodetail',detailTotal:dm0.st.total});if(!dm0.map)return Object.assign(R,{pending:'loading'})}
  }
  var bm=meas;
  if(meas.kind==='bench')bm=dBaseMeas(card),R.baseMeas=bm;
  R.timeDim=['month','quarter','fy'].indexOf(by)>=0;
  R.snap=!!bm.snap;
  if(meas.kind==='rating'){
    var rt=dRating(card,F,res,members);if(rt.err)return Object.assign(R,{err:rt.err});
    R.rating=rt;
    members.forEach(function(mem){var b=rt.byId[mem.k];R.rows.push({k:mem.k,label:mem.label,dim:'plant',v:b&&b.score!=null?b.score:null,st:b&&b.score!=null?'ok':'norate',rb:b||null,q:{v:null,state:'none',txt:'—'}})});
    R.total=null;R.noQoq=true;return R;
  }
  var rows;
  if(meas.kind==='person'){
    rows=dCompute(MEAS.sheets,members,res);
    var tot=0;rows.forEach(function(r){if(r.v!=null)tot+=r.v});
    rows.forEach(function(r){r.share=tot>0&&r.v!=null?r.v/tot*100:null;var u=userBySp(r.k);r.user=u?u.name:'';
      if(u){var st=actionStats(u,res.q||curQuarterKey());r.closure=st.done>0?st.onTime/st.done*100:null;r.closureN=st.done}});
    R.rows=dSortRows(rows,card,MEAS.sheets);R.totalSheets=tot;R.baseMeas=MEAS.sheets;R.noPlanNote='Salesperson targets are not set, so there is no Ach % here: sheets, QoQ and share only.';
    R.total=null;return R;
  }
  rows=dCompute(bm,members,res);
  if(meas.kind==='bench'){R.stats=dBench(rows,meas.bench,!!bm.lower);R.unitBase=bm.unit;R.lower=!!bm.lower}
  /* a total on the same basis (never a sum of rounded parts, never an average of ratios) */
  if(by!=='none'&&!R.timeDim&&meas.kind!=='bench'){
    var tm=[{k:'all',label:'Total',m:dBaseM(F),dim:null}];R.total=dCompute(bm,tm,res)[0];
  }else if(by==='none')R.total=rows[0];
  R.rows=rows;R.sortedRows=dSortRows(rows,card,bm);
  /* partial / not loaded roll-up of states */
  var st={};rows.forEach(function(r){st[r.st]=(st[r.st]||0)+1});R.stateCount=st;
  R.loading=!!(st.loading);R.nodetail=!!(st.nodetail);
  return R;
}
/* series and monthly values are computed only for the members a visual draws */
function dNeedSeries(R,n){
  var bm=R.baseMeas||R.meas;if(bm.snap||R.timeDim)return;
  var list=(R.sortedRows||R.rows).slice(0,n);
  list.forEach(function(r){if(!r.series&&r.mem)r.series=dSeries(bm,r.mem)});
  if(R.total&&!R.total.series)R.total.series=dSeries(bm,R.total.mem);
}
function dNeedMonths(R,n){
  var bm=R.baseMeas||R.meas;if(bm.snap||R.timeDim)return null;
  var months=dMonths8(R.res),list=(R.sortedRows||R.rows).slice(0,n);
  list.forEach(function(r){if(!r.ms&&r.mem)r.ms=dMonthSeries(bm,r.mem,months)});
  return months;
}
/* which visuals fit this card, and why a visual is greyed out */
function dVisFit(card){
  var meas=dMeas(card),out={};Object.keys(D_VIS).forEach(function(v){out[v]=''});
  if(!meas)return out;
  var by=meas.fixedBy||card.by||'none',bm=meas.kind==='bench'?dBaseMeas(card):meas,time=['month','quarter','fy'].indexOf(by)>=0;
  if(meas.kind==='dh'){Object.keys(D_VIS).forEach(function(v){out[v]=(v==='coverage'?(meas.id==='dh_cov'?'':'Coverage grid is for the Coverage measure'):(v==='kpi'||v==='table')?'':'Data health measures use the coverage grid, a tile or a table')});return out}
  out.coverage='Coverage grid is for data health';
  var windowed=['sales','plan','coll','cn'].indexOf(bm.kind)>=0&&!bm.snap&&meas.kind!=='bench'&&meas.id!=='phasing',special=meas.kind==='rating'||meas.kind==='person';
  if(by==='none'){['bar','ranked','donut','stacked','heat','multiples','bench'].forEach(function(v){out[v]='Needs a breakdown'})}
  if(!(bm.tgt||bm.id==='coll')||meas.kind==='bench'||special)out.bullet='This measure has no target';
  if(!(meas.add&&windowed)&&!out.stacked)out.stacked=bm.snap?'Not available for a snapshot measure':'Stacked bars are for measures that add up, read over 7 quarters';
  if(time&&!out.stacked)out.stacked='A time breakdown is a series: use bar or line';
  if(!meas.add&&!out.donut)out.donut='Ratios do not add to a whole';
  if(time&&!out.donut)out.donut='A time breakdown is a series: use bar or line';
  if(meas.kind==='person'||meas.kind==='rating'){out.stacked='Not available';out.line='Not available';out.heat='Not available'}
  if(!windowed&&meas.id!=='phasing'&&!out.line)out.line=bm.snap?'Needs a measure read over time (not a snapshot)':'Not available for this measure';
  if(!out.line&&meas.id!=='phasing'&&by!=='none'&&time)out.line='';
  if(!windowed&&!out.heat)out.heat=bm.snap?'Needs a measure read over time (not a snapshot)':'Not available for this measure';
  if(time&&!out.heat)out.heat='The heatmap already runs over months';
  if(meas.id==='phasing'){out.line='';out.heat='The heatmap already runs over months'}
  if(time){out.ranked='A time breakdown is a series: use bar, line or table';out.multiples='A time breakdown is a series: use bar, line or table';out.bench='Benchmarks compare members, not months'}
  if(meas.kind==='rating'||meas.kind==='person'){out.multiples='Not available';out.bench='Not available'}
  if(meas.kind==='bench'){out.multiples=out.multiples||'Not available'}
  return out;
}
function dAutoVisual(card){
  var meas=dMeas(card);if(!meas)return 'table';var fit=dVisFit(card),by=meas.fixedBy||card.by||'none';
  var pref=meas.kind==='dh'?['coverage','kpi']:meas.kind==='bench'?['bench','ranked','table']:meas.kind==='rating'||meas.kind==='person'?['table','ranked']:meas.kind==='plan'&&by==='month'?['line','bar']:
    by==='none'?['kpi','bullet']:['month','quarter','fy'].indexOf(by)>=0?['bar','line','table']:['bar','ranked','table'];
  for(var i=0;i<pref.length;i++)if(!fit[pref[i]])return pref[i];
  return 'table';
}
