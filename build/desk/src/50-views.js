/* ================= v0.9 views: shared builders, Overview, Sales ================= */
var COLORS=['indigo','violet','orange','green','sky','pink','teal','red'];
function viewCtx(){
  var sc=SC(),f=S.f,res=resolvePeriod(f,TODAY()),plants=f.plant?new Set([f.plant]):sc.plants;
  return {sc:sc,f:f,res:res,plants:plants,base:{sp:sc.sp?ownKey():(f.sp||undefined),group:f.group||undefined}};
}
/* a Sales executive's own salesperson key as stored in the roll-ups ('' when none matches: no rows, no plan) */
function ownKey(){var k=spKeyOf(effUser());return k==null?'':k}
function noData(){return !DS.plants.length}
function emptyData(what){
  return '<div class="empty"><b>'+esc(what||'No sales data in your scope yet.')+'</b><br>'+(effRole()==='Super admin'?'Load history in <a href="#/intake">Data Intake</a>, or load demo data there. ':'Ask your admin to load the SAP invoice history. ')+'The Desk ships empty.</div>';
}
/* one row of figures for an entity: potential, target, actual, variance, achievement, share, last quarter, QoQ, trend */
function figs(ent,ctx,opts){
  opts=opts||{};
  var f=Object.assign({plants:ctx.plants},ctx.base,ent);if(f.sp===undefined&&ctx.sc.sp)f.sp=undefined;
  var res=ctx.res,cur=res.cur,pr=res.prior,spMode=f.sp!=null&&f.sp!==undefined&&ent.sp!==undefined||(ctx.sc.sp==null&&f.sp!=null);
  var A=sumF(f,cur),P=pr?sumF(f,pr):null;
  var pl=null;
  if(opts.noPlan){pl={any:false,tgt:0,pot:0,kind:'none',orig:0}}
  else if(f.sp!=null&&ent.sp!==undefined){pl=personPlan(f.sp,cur,f.plant,f.group);pl.orig=pl.tgt}
  else if(f.sp!=null){pl=personPlan(f.sp,cur,f.plant,f.group);pl.orig=pl.tgt}
  else pl=planW(f,cur);
  var pset=f.plant?new Set([f.plant]):f.plants;
  var incomplete=!monthsLoaded(res.curMonths,pset)||(res.prior?!monthsLoaded(res.priorMonths,pset):false);
  if(!res.curMonths.length)incomplete=true;
  var q=res.prior?qoqOf(A.n,P.n,{incomplete:incomplete}):{v:null,state:'none',txt:''};
  var hasT=pl.any&&pl.tgt>0;
  var o={A:A.n,sq:A.sq,docs:A.d,sh:A.sh,P:P?P.n:null,Psq:P?P.sq:null,pot:pl.any?pl.pot:null,tgt:hasT?pl.tgt:null,orig:hasT?pl.orig:null,kind:pl.kind,qoq:q,incomplete:incomplete};
  o.var=hasT?A.n-pl.tgt:null;o.varPct=hasT?(A.n-pl.tgt)/pl.tgt*100:null;o.ach=hasT?A.n/pl.tgt*100:null;o.share=(pl.any&&pl.pot>0)?A.n/pl.pot*100:null;
  if(!opts.noTrend){var ser=quarterSeries(f,(f.sp!=null)?f.sp:undefined);var ts=trendStats(ser.map(function(x){return x.isCur?null:x.A}));o.trend=ts;o.series=ser}
  return o;
}
function fmtAch(v,lower){if(v==null)return '<span class="note">—</span>';var st=statusOf(v,lower);return '<b class="a-'+st+'">'+v.toFixed(1)+'%</b>'}
function qoqCell(q){
  if(!q||q.state==='none')return '<span class="note">—</span>';
  if(q.state==='ok')return '<span class="'+(q.v>=0?'up':'dn')+'">'+fmtPct(q.v,true)+'</span>';
  if(q.state==='incomplete')return '<span class="note" title="Prior or current quarter is not fully loaded">incomplete history</span>';
  if(q.state==='new')return '<span class="note">New, no prior quarter</span>';
  return '<span class="note">'+esc(q.txt)+'</span>';
}
function trendCell(o){return o.trend?'<span class="'+(o.trend.dir==='rising'?'up':o.trend.dir==='falling'?'dn':'')+'" title="'+esc(arrow(o.trend.dir))+'">'+arrowShort(o.trend.dir)+'</span>':'—'}
function tgtCell(o){
  if(o.tgt==null)return '<span class="pill mute">No plan</span>';
  return fmtMoney(o.tgt)+(o.kind==='draft'?' <span class="pill part">Draft</span>':'')+(o.orig!=null&&Math.abs(o.orig-o.tgt)>1?'<div class="note">orig '+fmtMoney(o.orig)+'</div>':'');
}
/* standard table of §4: Potential · Target · Actual · Var · Ach % · Share % · Last Qtr · QoQ % · Trend, total row */
function stdTable(first,rows,tot,opt){
  opt=opt||{};
  rows=rows.slice().sort(function(a,b){var av=a.o.var,bv=b.o.var;if(av==null&&bv==null)return b.o.A-a.o.A;if(av==null)return 1;if(bv==null)return -1;return av-bv});
  var head='<tr><th>'+esc(first)+'</th>'+(opt.noPlan?'':'<th class="num">Potential</th><th class="num">Target</th>')+'<th class="num">Actual</th>'+(opt.noPlan?'':'<th class="num">Var</th><th class="num">Ach %</th><th class="num">Share %</th>')+'<th class="num">Last Qtr</th><th class="num">QoQ %</th><th>Trend</th></tr>';
  var line=function(label,o,total,attrs){
    return '<tr'+(total?' class="tot"':(attrs?' class="clk"':''))+(attrs||'')+'><td>'+label+'</td>'+(opt.noPlan?'':'<td class="num">'+(o.pot!=null?fmtMoney(o.pot):'—')+'</td><td class="num">'+tgtCell(o)+'</td>')
     +'<td class="num">'+fmtMoney(o.A)+'</td>'
     +(opt.noPlan?'':'<td class="num">'+(o.var!=null?'<span class="'+(o.var>=0?'up':'dn')+'">'+fmtVarMoney(o.var)+' · '+fmtPct(o.varPct,true)+'</span>':'—')+'</td><td class="num">'+fmtAch(o.ach)+'</td><td class="num">'+(o.share!=null?o.share.toFixed(1)+'%':'—')+'</td>')
     +'<td class="num">'+(o.P!=null?fmtMoney(o.P):'—')+'</td><td class="num">'+qoqCell(o.qoq)+'</td><td>'+trendCell(o)+'</td></tr>';
  };
  return '<div class="tw tall"><table class="std"><thead>'+head+'</thead><tbody>'+rows.map(function(r){return line(r.label,r.o,false,r.attrs)}).join('')+(tot?line('<b>Total</b>',tot,true):'')+'</tbody></table></div>';
}
function tableNote(ctx,extra){
  var r=ctx.res;
  return '<p class="note">Columns: Potential · Target · Actual · Var · Ach % · Share % · Last Qtr · QoQ %'+' · Trend. Sorted by variance, worst first. '+(r.pro?'Potential and Target are to-date: pro-rated by working days ('+r.N+' of '+r.wdTot+'). ':'')+'Last Qtr and QoQ % compare with '+esc(r.priorLabel||'the previous quarter')+'. A row with no prior-quarter data shows "New, no prior quarter"; a row whose history is not fully loaded shows "incomplete history". Net sales exclude internal transfers; credit notes have no feed yet. '+(extra||'')+'</p>';
}
function miniBars(vals,color){
  var mx=Math.max.apply(null,vals.map(function(v){return v||0}).concat([1])),w=6,g=3,h=26;
  return '<svg class="mini" width="'+(vals.length*(w+g))+'" height="'+h+'" aria-hidden="true">'+vals.map(function(v,i){var bh=v==null?0:Math.max(2,v/mx*h);return '<rect x="'+i*(w+g)+'" y="'+(h-bh)+'" width="'+w+'" height="'+bh+'" rx="2" fill="'+(v==null?'var(--line)':'var(--'+color+')')+'" opacity="'+(i===vals.length-1?1:.55)+'"/>'}).join('')+'</svg>';
}
function kpiCard(o){
  var st=o.status||'none',pill=o.pending?statusPill('pending',o.pendingTxt||'Pending'):statusPill(st,o.pillTxt);
  var rows=(o.rows||[]).map(function(r){return '<div><dt>'+esc(r[0])+'</dt><dd>'+r[1]+'</dd></div>'}).join('');
  var pct=o.ach!=null?Math.max(0,Math.min(100,o.ach)):0;
  return '<article class="kcard c-'+(o.color||'indigo')+(o.pending?' pend':'')+'"><div class="khd"><span class="kchip" aria-hidden="true">'+(o.chip||'₹')+'</span>'+pill+'</div>'
   +'<div class="ktitle">'+esc(o.title)+'</div><div class="kval">'+o.value+'</div><div class="ksub">'+esc(o.sub||'')+'</div><dl class="krows">'+rows+'</dl>'
   +(o.pending?'<div class="empty sm">'+esc(o.pendingMsg||'')+'</div>':'<div class="bar"><i style="width:'+pct+'%;background:var(--'+(st==='green'?'green':st==='orange'?'orange':st==='red'?'red':'indigo')+')"></i></div>'+(o.mini?miniBars(o.mini,o.color||'indigo'):''))+'</article>';
}
function runRate(ctx,o,fl){
  var r=ctx.res;if(ctx.sc.sp||r.mode!=='QTD'||!r.qOpen||o.tgt==null)return null;
  var ms=qMonths(r.q),tot=ms.reduce(function(a,m){return a+WD(m)},0),el=r.N,rem=Math.max(0,tot-el);
  var pl=planW(Object.assign({plants:ctx.plants},ctx.base,fl||{}),ms.map(function(m){return {ym:m,frac:1}}));
  var needTotal=pl.tgt;var need=rem>0?Math.max(0,(needTotal-o.A)/rem):0,now=el>0?o.A/el:0;return {need:need,now:now};
}
function salesKpis(ctx,o,series){
  var st=statusOf(o.ach),rr=runRate(ctx,o),mini=series?series.map(function(s){return s.A}):null;
  var shareChg='';
  if(!ctx.sc.sp&&o.share!=null&&ctx.res.prior&&ctx.res.mode!=='YTD'){
    var pf=Object.assign({plants:ctx.plants},ctx.base),pp=planW(pf,ctx.res.prior);
    if(pp.any&&pp.pot>0&&o.P!=null){var ps=o.P/pp.pot*100;shareChg=' ('+((o.share-ps)>=0?'+':'−')+Math.abs(o.share-ps).toFixed(1)+' pts vs last quarter)'}
    else shareChg=' (change greyed: no potential last quarter)';
  }
  return {st:st,rr:rr,mini:mini,shareChg:shareChg};
}
function trendWord(o){return o.trend?(o.trend.short?'history too short':arrow(o.trend.dir)):'—'}

/* ---- trend card: 12 closed quarters + current, target markers, QoQ line, MA4, trend line, Stretch ---- */
function trendCard(title,ent,ctx,personSp,id,opts){
  opts=opts||{};
  var f=Object.assign({plants:ctx.plants},ctx.base,ent||{});var sp=personSp!=null?personSp:(f.sp!=null?f.sp:undefined);
  var ser=opts.series||quarterSeries(f,sp),closed=ser.filter(function(s){return !s.isCur}),ts=trendStats(closed.map(function(s){return s.A})),cur=ser[ser.length-1];
  var all=ser.map(function(s){return s.A});
  if(!all.some(function(v){return v!=null&&v>0}))return '<section class="card"><div class="hd"><h2>'+esc(title)+'</h2></div><div class="empty">No quarters loaded in your scope yet. The trend needs history from Data Intake.</div></section>';
  var W=760,H=250,L=44,R=10,T=14,B=62,n=ser.length,bw=(W-L-R)/n,mx=Math.max.apply(null,all.map(function(v){return v||0}).concat(ser.map(function(s){return s.tgt||0})).concat([1]))*1.12;
  var y=function(v){return T+(H-T-B)*(1-v/mx)},x=function(i){return L+i*bw};
  var svg='<svg class="trend" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(title)+'. '+ser.map(function(s){return s.label+' '+(s.A==null?'not loaded':fmtMoney(s.A))}).join('; ')+'" preserveAspectRatio="xMidYMid meet"><defs><pattern id="hat'+id+'" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--indigo)" opacity=".35"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--indigo)" stroke-width="3"/></pattern></defs>';
  for(var g=0;g<=4;g++){var gv2=mx/1.12*g/4,gy=y(gv2);svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+gy+'" y2="'+gy+'" stroke="var(--line)" stroke-width="1"/><text x="'+(L-4)+'" y="'+(gy+3)+'" text-anchor="end" class="ax">'+esc(fmtMoney(gv2).replace('₹',''))+'</text>'}
  ser.forEach(function(s,i){
    var bx=x(i)+bw*.18,w=bw*.64;
    if(s.A==null){svg+='<rect x="'+bx+'" y="'+(T+4)+'" width="'+w+'" height="'+(H-T-B-4)+'" rx="4" fill="none" stroke="var(--ink3)" stroke-dasharray="4 3" opacity=".6"><title>'+s.label+': not loaded (gap, not zero)</title></rect>'}
    else svg+='<rect class="bar-q" data-act="trend-q" data-q="'+s.q+'" data-sp="'+esc(sp!=null?sp:'')+'" data-kind="'+(opts.kind||'sales')+'" data-pl="'+esc(f.plants?Array.from(f.plants).join(','):'')+'" x="'+bx+'" y="'+y(s.A)+'" width="'+w+'" height="'+Math.max(1,y(0)-y(s.A))+'" rx="4" fill="'+(s.isCur?'url(#hat'+id+')':'var(--indigo)')+'" stroke="var(--indigo)" tabindex="0"><title>'+s.label+' actual '+fmtMoney(s.A)+(s.tgt!=null?' · target '+fmtMoney(s.tgt):' · no plan')+'</title></rect>';
    if(s.tgt!=null)svg+='<line x1="'+(bx-3)+'" x2="'+(bx+w+3)+'" y1="'+y(s.tgt)+'" y2="'+y(s.tgt)+'" stroke="var(--orange)" stroke-width="2.5"><title>'+s.label+' target '+fmtMoney(s.tgt)+'</title></line>';
    svg+='<text x="'+(x(i)+bw/2)+'" y="'+(H-B+13)+'" text-anchor="middle" class="ax">'+esc(s.label.replace(' FY',' '))+(s.isCur?'*':'')+'</text>';
    svg+='<text x="'+(x(i)+bw/2)+'" y="'+(H-B+26)+'" text-anchor="middle" class="ax a-'+statusOf(s.ach)+'">'+(s.ach!=null?s.ach.toFixed(0)+'%':'—')+'</text>';
    var qv=i>0?ts.qoqAt[i]:null;if(s.isCur){var pv=ser[i-1].A;qv=(s.A!=null&&pv!=null&&pv>0&&cur.N!==Infinity)?null:qv}
    svg+='<text x="'+(x(i)+bw/2)+'" y="'+(H-B+40)+'" text-anchor="middle" class="ax '+(qv==null?'':qv>=0?'up':'dn')+'">'+(s.isCur?'QTD':(qv==null?'—':(qv>0?'+':'')+qv.toFixed(1).replace('-','−')))+'</text>';
  });
  /* previous-quarter marker on the current bar */
  var pv2=ser.length>1?ser[ser.length-2].A:null;if(pv2!=null)svg+='<line x1="'+(x(n-1)+bw*.1)+'" x2="'+(x(n-1)+bw*.9)+'" y1="'+y(pv2)+'" y2="'+y(pv2)+'" stroke="var(--ink)" stroke-dasharray="3 2" stroke-width="1.5"><title>Previous quarter '+fmtMoney(pv2)+'</title></line>';
  /* 4-quarter moving average (closed quarters) */
  var pts=ts.ma.map(function(v,i){return v==null?null:[x(i)+bw/2,y(v)]}).filter(Boolean);
  if(pts.length>1)svg+='<polyline points="'+pts.map(function(p){return p[0]+','+p[1]}).join(' ')+'" fill="none" stroke="var(--violet)" stroke-width="2.2"><title>4-quarter moving average</title></polyline>';
  if(ts.slope!=null){var x1=1,x2=closed.length;svg+='<line x1="'+(x(0)+bw/2)+'" x2="'+(x(closed.length-1)+bw/2)+'" y1="'+y(ts.icpt+ts.slope*x1)+'" y2="'+y(ts.icpt+ts.slope*x2)+'" stroke="var(--green)" stroke-width="2" stroke-dasharray="6 4"><title>Trend line (least squares)</title></line>'}
  svg+='</svg>';
  /* Stretch / required QoQ against the current quarter's target */
  var lastClosed=closed[closed.length-1],req='';
  if(cur.tgt!=null&&lastClosed&&lastClosed.A!=null){var sr=stretchOf(cur.tgt,lastClosed.A,ts);
    req='<div class="callout '+(sr.state==='stretch'?'warn':'')+'">Target '+fmtMoney(cur.tgt)+' needs <b>'+fmtPct(sr.required,true)+'</b> QoQ'+(ts.avg!=null&&!ts.short?'; 12-qtr average is <b>'+fmtPct(ts.avg,true)+'</b>':'')+'. '+(sr.state==='stretch'?'<span class="pill part">Stretch</span> more than '+CFG.stretch_multiple+'× the average, flagged for discussion.':sr.state==='ok'?'Within '+CFG.stretch_multiple+'× the average.':'History too short for a Stretch check.')+'</div>'}
  var sumr='<div class="tsum"><div><small>Average QoQ growth ('+ts.pairs+' step'+(ts.pairs===1?'':'s')+', arithmetic)</small><b>'+(ts.avg!=null?fmtPct(ts.avg,true):'—')+'</b></div><div><small>Direction</small><b>'+(ts.short?'history too short':arrow(ts.dir))+'</b></div><div><small>Latest quarter</small><b>'+esc(cur.label)+(cur.N!==Infinity?' to date':'')+'</b></div></div>';
  var legend='<div class="legend"><span><i class="sw" style="background:var(--indigo)"></i>Actual (hatched = to date)</span><span><i class="sw" style="background:var(--orange)"></i>Target marker</span><span><i class="sw dash"></i>Previous quarter</span><span><i class="sw" style="background:var(--violet)"></i>4-quarter moving average</span><span><i class="sw" style="background:var(--green)"></i>Trend line</span></div>';
  return '<section class="card" id="trend-'+id+'"><div class="hd"><h2>'+esc(title)+'</h2><span class="note">12 closed quarters '+qLabel(closed[0].q)+' to '+qLabel(closed[closed.length-1].q)+' + '+esc(cur.label)+' to date</span></div>'
   +svg+'<div class="note">Under each bar: achievement % of that quarter\'s target, then QoQ % (each quarter against the one before; a gap breaks the chain). Tap a bar to drill: quarter → month → SAP document.</div>'+legend+sumr+req+'</section>';
}
function drillPanel(ctx){
  var d=S.drill;if(!d)return '';
  if(d.kind==='coll')return drillColl(ctx);
  var q=d.q,ms=qMonths(q),f=Object.assign({plants:ctx.plants},ctx.base);if(d.sp)f.sp=d.sp;if(d.pl&&!d.sp)f.plants=new Set(d.pl.split(','));
  var rows=ms.map(function(m){var A=sumF(f,[m]),pm=priorMonth(m),P=sumF(f,[pm]),inc=!monthLoaded(m,ctx.plants)||!monthLoaded(pm,ctx.plants);var qo=qoqOf(A.n,P.n,{incomplete:inc});
    return '<tr class="clk" data-act="drill-m" data-m="'+m+'"><td>'+ymLabel(m)+' ›</td><td class="num">'+fmtMoney(A.n)+'</td><td class="num">'+fmtMoney(P.n)+' <span class="note">'+ymLabel(pm)+'</span></td><td class="num">'+qoqCell(qo)+'</td><td class="num">'+fmtN(A.d)+'</td></tr>'}).join('');
  var h='<section class="card" id="drillp"><div class="hd"><h2>Drill-down · '+qLabel(q)+(d.sp?' · '+esc(d.sp):'')+'</h2><button class="btn sm" data-act="drill-close">Close</button></div>'
   +'<div class="crumbs"><button class="chip" data-act="drill-close">Trend</button> › <button class="chip'+(d.m?'':' on')+'" data-act="drill-qonly">'+qLabel(q)+'</button>'+(d.m?' › <button class="chip" data-act="drill-m" data-m="'+d.m+'">'+ymLabel(d.m)+'</button> › <span class="chip on">SAP documents</span>':'')+'</div>'
   +'<div class="tw"><table><thead><tr><th>Month</th><th class="num">Actual</th><th class="num">Same position, previous quarter</th><th class="num">QoQ %</th><th class="num">Documents</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  if(d.m)h+=docList((d.pl&&!d.sp)?Object.assign({},ctx,{plants:f.plants}):ctx,d.m,null,null,d.sp||null);
  return h+'</section>';
}
/* documents: the last drill level. Index rows: [doc, day, customer, lines, sheets, net, transfer, sqft, salesperson] */
function docList(ctx,ym,cust,plant,spF){
  var key=ym+'|'+(cust||'')+'|'+(plant||'')+'|'+(spF||'')+'|'+(ctx.plants?Array.from(ctx.plants).join(','):'');var st=S.docs&&S.docs.key===key?S.docs:null;
  if(!st){if(!S.docsLoading||S.docsLoading!==key){S.docsLoading=key;loadDocs(ctx,ym,cust,plant,key,spF)}return '<div class="note">Loading documents from the stored index...</div>'}
  var sc=ctx.sc,rows=st.rows;
  var h='<div class="hd"><h3 style="margin:0;font-size:13px">SAP documents · '+ymLabel(ym)+(cust?' · '+esc(cust):'')+'</h3><span class="note">'+fmtN(rows.length)+' documents'+(st.cut?' (first 300 by value shown)':'')+'</span></div>';
  if(st.noIndex)h+='<div class="banner warn">The document index was not kept for some of these plant-months (Data Intake option). Drill-down stops at the customer there.</div>';
  if(sc.sp&&!st.legacy)h+='<div class="note">Documents of your customers, matched on your salesperson code.</div>';
  if(sc.sp&&st.legacy)h+='<div class="note">Documents of your customers: this period was loaded before the salesperson was added to the index, so the list can include a document sold under another salesperson.</div>';
  h+=rows.length?'<div class="tw tall"><table><thead><tr><th>System</th><th>Doc type</th><th>Doc no</th><th>Date</th><th>Plant</th><th>Customer</th><th class="num">Lines</th><th class="num">Sheets</th><th class="num">Net</th></tr></thead><tbody>'+rows.slice(0,300).map(function(r){return '<tr><td class="mono">'+esc(r.sys)+'</td><td class="mono" title="'+esc(r.type==='INV'?'Invoice':r.type)+'">'+esc(r.type)+'</td><td class="mono">'+esc(r.doc)+'</td><td>'+esc(r.date)+'</td><td>'+esc(plantShort(r.plant))+'</td><td class="break">'+esc(r.cust)+'</td><td class="num">'+r.lines+'</td><td class="num">'+fmtN(r.sheets)+'</td><td class="num">'+fmtMoney(r.net)+'</td></tr>'}).join('')+'</tbody></table></div>':'<div class="empty sm">No documents.</div>';
  return h+'<p class="note">Drill-down stops at the SAP document (decision D9). Lines inside a document come from the SAP export. A document with two product groups appears once with its total.</p>';
}
async function loadDocs(ctx,ym,cust,plant,key,spF){
  var c=S.cells['INV_'+ym],sc=ctx.sc,rows=[],noIndex=false,legacy=false;
  if(c){
    var ps=Object.keys(c.plants||{}).filter(function(p){return plantInScope(sc,p)&&(!ctx.plants||ctx.plants.has(p))&&(!plant||p===plant)});
    for(var i=0;i<ps.length;i++){var info=c.plants[ps[i]];
      for(var k=0;k<(info.chunks||0);k++){
        var snap=await dget('inv/'+info.sys+'-'+ps[i]+'-'+ym+'-'+k);if(!snap.exists)continue;var o=JSON.parse(await ungz(snap.data().z));
        if(!snap.data().nh)noIndex=true;
        o.h.forEach(function(h){
          if(h[6])return;if(cust&&h[2]!==cust)return;
          if(sc.sp){if(h.length>8){if(!spOk(sc,h[8]))return}else legacy=true}
          if(spF&&h.length>8&&spCanon(h[8])!==spF)return;
          rows.push({sys:info.sys,type:h[9]||'INV',doc:h[0],date:ym+'-'+pad(h[1]),plant:ps[i],cust:h[2],lines:h[3],sheets:h[4],net:h[5]});
        });
      }
    }
  }
  if(sc.sp&&legacy){/* old chunks: keep only documents of customers who have this person's aggregate rows */
    var mine={};custAgg({plants:ctx.plants},[ym]).forEach(function(v,k){mine[k]=1});if(Object.keys(mine).length)rows=rows.filter(function(r){return mine[r.cust]})}
  rows.sort(function(a,b){return b.net-a.net});var cut=rows.length>300;
  S.docs={key:key,rows:rows.slice(0,3000),cut:cut,noIndex:noIndex,legacy:legacy};S.docsLoading=null;S.lastHtml='';schedule();
}

/* ---- Overview ---- */
function pageOverview(){
  var ctx=viewCtx();if(noData())return emptyData();
  var res=ctx.res,tot=figs({},ctx),spl=salesKpis(ctx,tot,tot.series);
  var cardsQ=[];
  var sqPlan=planSq(ctx);
  var sqA=tot.sq,sqAch=sqPlan.tgt>0?sqA/sqPlan.tgt*100:null;
  cardsQ.push(kpiCard({color:'indigo',chip:'₹',title:'K1 · Net sales · '+res.label,value:fmtMoney(tot.A),sub:'SAP invoices, internal transfers excluded. Credit notes: no feed yet.',status:statusOf(tot.ach),
    ach:tot.ach,mini:spl.mini,rows:[['Potential',tot.pot!=null?fmtMoney(tot.pot):'—'],['Target',tgtCell(tot)],['Var',tot.var!=null?fmtVarMoney(tot.var)+' · '+fmtPct(tot.varPct,true):'—'],['Ach %',fmtAch(tot.ach)],['Share of potential',(tot.share!=null?tot.share.toFixed(1)+'%':'—')+spl.shareChg],
     ['Run-rate need vs now',spl.rr?fmtMoney(spl.rr.need)+' vs '+fmtMoney(spl.rr.now)+' /day':'—'],['QoQ %',qoqCell(tot.qoq)],['12-qtr trend',trendWord(tot)]]}));
  cardsQ.push(kpiCard({color:'violet',chip:'▦',title:'Quantity · '+res.label,value:fmtSqft(sqA),sub:'Sheets converted to sq ft (item size).',status:statusOf(sqAch),ach:sqAch,
    rows:[['Potential',sqPlan.pot>0?fmtSqft(sqPlan.pot):'—'],['Target',sqPlan.tgt>0?fmtSqft(sqPlan.tgt):'No plan'],['Var',sqPlan.tgt>0?(sqA-sqPlan.tgt>=0?'+':'−')+fmtSqft(Math.abs(sqA-sqPlan.tgt)):'—'],['Ach %',fmtAch(sqAch)],['Share of potential',sqPlan.pot>0?(sqA/sqPlan.pot*100).toFixed(1)+'%':'—'],['Run-rate need vs now','—'],['QoQ %',res.prior&&tot.Psq!=null?qoqCell(qoqOf(sqA,tot.Psq,{incomplete:tot.incomplete})):'—'],['12-qtr trend',trendWord(tot)]]}));
  var col=collectionFigs(ctx);
  cardsQ.push(col.card);
  cardsQ.push(kpiCard({color:'orange',chip:'+',title:'K7 · New customers',value:'—',sub:'Needs the customer first-seen index (four earlier quarters).',pending:true,pendingTxt:'Pending',pendingMsg:'Not built in v0.9: the roll-up holds no customer history. Shown as pending, not zero.',
    rows:[['Addressable','pending rules'],['Target','No plan (P6)'],['Var','—'],['Ach %','—'],['Share of potential','—'],['Run-rate need vs now','—'],['QoQ %','—'],['12-qtr trend','—']]}));
  var h='<div class="kpirow">'+cardsQ.join('')+'</div>';
  h+=trendCard('12-quarter trend · Net sales',{},ctx,undefined,'ov');
  h+=drillPanel(ctx);
  /* branch chart + alerts */
  h+='<div class="grid2">'+branchChart(ctx)+alertsCard()+'</div>';
  /* product group table and branch table */
  var gr=distinct('group').map(function(g){return {label:'<b>'+esc(g)+'</b> ›',o:figs({group:g},ctx),attrs:' data-act="ov-group" data-v="'+esc(g)+'"'}});
  h+='<section class="card"><div class="hd"><h2>Product group · '+esc(res.label)+' vs '+esc(res.priorLabel||'')+'</h2></div>'+stdTable('Product group',gr.filter(matchSearch),tot)+tableNote(ctx)+'</section>';
  var br=distinct('plant').filter(function(p){return plantInScope(ctx.sc,p)&&(!ctx.f.plant||p===ctx.f.plant)}).map(function(p){return {label:'<b>'+esc(plantShort(p))+'</b> <span class="note mono">'+p+'</span> ›',o:figs({plant:p,plants:undefined},ctx),attrs:' data-act="ov-branch" data-v="'+esc(p)+'"'}});
  h+='<section class="card"><div class="hd"><h2>Branch · '+esc(res.label)+'</h2><span class="note">Tap a row in Sales to drill: branch → salesperson → customer → SAP document.</span></div>'+stdTable('Branch',br.filter(matchSearch),tot)+tableNote(ctx,'Drill-down stops at the SAP document (decision D9).')+'</section>';
  h+=ytdStrip(ctx);
  h+=targetRevisionCard(ctx,tot);
  return h;
}
function matchSearch(r){var q=(S.f.search||'').toLowerCase();return !q||(r.label||'').replace(/<[^>]+>/g,' ').toLowerCase().indexOf(q)>=0}
function planSq(ctx){
  if(ctx.sc.sp)return {pot:0,tgt:0};/* plant-level quantity plans are not an executive's target */
  var f=Object.assign({plants:ctx.plants},ctx.base),w=ctx.res.cur,out={pot:0,tgt:0};
  wins(w).forEach(function(x){var q=qKeyOfYm(x.ym),P=planQ(f,q),qm=qMonths(q),idx=qm.indexOf(x.ym),wdq=qm.reduce(function(a,m){return a+WD(m)},0);if(!P.nLeaf)return;out.pot+=P.potSqft*(WD(x.ym)*x.frac)/wdq;out.tgt+=(P.tgt>0?P.tgtSq*(P.months[idx]/P.tgt):0)*x.frac});
  return out;
}
function branchChart(ctx){
  var res=ctx.res,ps=distinct('plant').filter(function(p){return plantInScope(ctx.sc,p)});
  var rows=ps.map(function(p){var o=figs({plant:p},ctx,{noTrend:true});return {p:p,o:o}}).sort(function(a,b){return b.o.A-a.o.A}).slice(0,12);
  if(!rows.length)return '';
  var mx=Math.max.apply(null,rows.map(function(r){return Math.max(r.o.A,r.o.tgt||0,r.o.P||0)}).concat([1]));
  var h='<section class="card"><div class="hd"><h2>Branch performance · '+esc(res.label)+' vs plan</h2></div><div class="hbars">'+rows.map(function(r){
    var pc=function(v){return Math.max(0,Math.min(100,v/mx*100))};
    return '<div class="hb clk" data-act="ov-branch" data-v="'+esc(r.p)+'" role="button" tabindex="0" title="Open the salespeople of '+esc(plantShort(r.p))+'"><div class="hl">'+esc(plantShort(r.p))+' ›</div><div class="ht"><i class="a" style="width:'+pc(r.o.A)+'%"></i>'+(r.o.tgt!=null?'<i class="pm" style="left:'+pc(r.o.tgt)+'%" title="Plan to date '+esc(fmtMoney(r.o.tgt))+'"></i>':'')+(r.o.P!=null?'<i class="pv" style="left:'+pc(r.o.P)+'%" title="Previous quarter '+esc(fmtMoney(r.o.P))+'"></i>':'')+'</div><div class="hv">'+fmtMoney(r.o.A)+'</div></div>'}).join('')+'</div>'
   +'<div class="legend"><span><i class="sw" style="background:var(--indigo)"></i>Actual</span><span><i class="sw" style="background:var(--orange)"></i>Plan (to-date, working days)</span><span><i class="sw dash"></i>Previous quarter (same working days)</span></div></section>';
  return h;
}
function alertsCard(){
  var u=effUser(),list=myActions(u).filter(function(a){return LIVE_ST.indexOf(a.status)>=0}),r=rankSort(list,TODAY()).slice(0,4);
  return '<section class="card"><div class="hd"><h2>Alerts · tap to open</h2><span class="note">'+list.length+' open in your scope</span></div>'+(r.length?r.map(function(x){var a=x.a;return '<a class="alert" href="#/action/'+esc(a.id)+'"><b>'+esc(a.title)+'</b><span class="note">'+esc((a.source&&a.source.label)||'')+' · action '+esc(a.ref)+' · '+esc(ruleLabel(a))+'</span></a>'}).join(''):'<div class="empty sm">No open alerts.</div>')+'</section>';
}
function ytdStrip(ctx){
  var cur=curQuarterKey(),qs=fyQuarters(ctx.f.mode==='YTD'&&ctx.f.q?ctx.f.q:cur),f=Object.assign({plants:ctx.plants},ctx.base);
  var rows=qs.map(function(q){
    var ms=qMonths(q),isCur=q===cur,N=isCur?wdBetween(ms[0]+'-01',TODAY()):Infinity,w=walk(ms,N),A=sumF(f,w).n,loaded=isCur?anyMonthData(ms,ctx.plants):monthsLoaded(ms,ctx.plants);
    var pq=prevQ(q),pms=qMonths(pq),pw=walk(pms,N),P=sumF(f,pw).n,inc=!loaded||!monthsLoaded(pms,ctx.plants);
    var pl=planW(f,w),qo=qoqOf(A,P,{incomplete:inc});
    var crossover=/-Q1$/.test(q)?' (prior-FY crossover)':'';
    return '<tr><td>'+qLabel(q)+(isCur?' <span class="pill info">to date</span>':'')+'</td><td class="num">'+(pl.any?fmtMoney(pl.tgt):'—')+'</td><td class="num">'+fmtMoney(A)+'</td><td class="num">'+(pl.any&&pl.tgt>0?fmtAch(A/pl.tgt*100):'—')+'</td><td>'+qLabel(pq)+crossover+'</td><td class="num">'+qoqCell(qo)+'</td></tr>'});
  return '<section class="card"><div class="hd"><h2>YTD · '+qLabel(qs[qs.length-1]).split(' ')[1]+' so far · quarter by quarter</h2><span class="note">Not compared with any other year.</span></div><div class="tw"><table><thead><tr><th>Quarter</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Ach %</th><th>Compared with</th><th class="num">QoQ step</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div></section>';
}
function targetRevisionCard(ctx,tot){
  if(ctx.sc.sp)return '';/* the revision trail covers plant targets, not an executive's own */
  var q=ctx.res.q||curQuarterKey(),f=Object.assign({plants:ctx.plants},ctx.base),P=planQ(f,q);
  if(!P.nLeaf)return '<section class="card"><div class="hd"><h2>Target revision · '+qLabel(q)+'</h2></div><div class="empty sm">No potential or target entered for '+qLabel(q)+(effRole()==='Super admin'||canEditPlan(effUser())?'. Add it in <a href="#/admin">Admin › Market potential</a>.':'.')+'</div></section>';
  var ser=quarterSeries(f,undefined),closed=ser.filter(function(s){return !s.isCur}),ts=trendStats(closed.map(function(s){return s.A}));
  var lastQ=prevQ(q),lastA=sumF(f,qMonths(lastQ)).n,lastOk=monthsLoaded(qMonths(lastQ),ctx.plants);
  var sr=stretchOf(P.tgt,lastOk?lastA:null,ts),revN=Math.max.apply(null,P.revs.map(function(x){return x.rev||1}).concat([1]));
  return '<section class="card"><div class="hd"><h2>Target revision · '+qLabel(q)+' · '+(ctx.f.plant?esc(plantShort(ctx.f.plant)):'all in scope')+'</h2>'+(sr.state==='stretch'?'<span class="pill part">Stretch</span>':sr.state==='ok'?'<span class="pill ok">Within range</span>':'<span class="pill mute">History too short</span>')+'</div>'
   +'<div class="kpis"><div class="kpi"><small>Original target</small><b>'+fmtMoney(P.orig)+'</b></div><div class="kpi"><small>Current '+(P.kind==='draft'?'draft':'approved')+' (r'+revN+')</small><b>'+fmtMoney(P.tgt)+'</b></div><div class="kpi"><small>Potential × share %</small><b style="font-size:14px">'+fmtMoney(P.pot)+' × '+(P.pot>0?(P.tgt/P.pot*100).toFixed(1):'—')+'%</b></div><div class="kpi"><small>Last quarter actual ('+qLabel(lastQ)+')</small><b>'+(lastOk?fmtMoney(lastA):'incomplete')+'</b></div></div>'
   +'<div class="callout '+(sr.state==='stretch'?'warn':'')+'">'+(sr.required!=null?'Target needs <b>'+fmtPct(sr.required,true)+'</b> QoQ; 12-qtr average is <b>'+fmtPct(sr.avg,true)+'</b>. '+(sr.state==='stretch'?'More than '+CFG.stretch_multiple+'× the average: flagged Stretch for discussion. It never blocks approval.':'Not more than '+CFG.stretch_multiple+'× the average.'):'Not enough loaded history for a sense-check (needs '+CFG.min_pairs+' consecutive quarter pairs).')+'</div>'
   +'<div class="row"><a class="btn sm" href="#/admin">Open revision trail</a></div><p class="note">'+(P.kind==='draft'?'Draft target: no approved target exists yet, so achievement is shown against the draft and labelled.':'Achievement is shown against the current approved target; the original is kept.')+'</p></section>';
}
