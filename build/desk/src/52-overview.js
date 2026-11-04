/* ================= Overview, infographic (D50, D51, D52; built 3-4 Nov 2026) =================
 * Sheets first. Every figure is read from the same functions the Sales, Collections and Inventory pages use (figs, collectionFigs, invSummary, recvStats),
 * so the numbers agree by construction; src/52 only draws. Bars are coloured by Ach % band (D51): <75 Far behind, 75-<90 Behind, 90-<100 Watch, 100+ On target.
 * The answer strip is rules and templates, no AI. Targets, potential, plans and files that are not loaded show "not loaded", never zero. */
S.oxOpen={};
var OX_LBL=['','Far behind','Behind','Watch','On target'],OX_MARK=['','▼▼','▼','▲','●'];
function oxBand(a){return a>=100?4:a>=90?3:a>=75?2:1}
function oxLakh(v,d){return (v/100000).toFixed(d==null?2:d)}
function oxK(v){return Math.abs(v)<10000?(v/1000).toFixed(1):fmtN(Math.round(v/1000))}
function oxSgn(v,txt){return (v>0?'+':v<0?'−':'')+txt}
function oxTip(s){return ' data-tip="'+esc(s)+'" tabindex="0"'}
function oxNL(t){return '<span class="ox-nl">'+esc(t||'not loaded')+'</span>'}
/* percentages are cut, never rounded up: 89.96 prints 89.9 (Behind), not 90.0 (Watch) */
function oxPct(a,d){d=d==null?1:d;var k=Math.pow(10,d);return (Math.floor(a*k+1e-9)/k).toFixed(d)}
function oxBandChip(a,extra){var b=oxBand(a);return '<span class="ox-chip b'+b+'">'+OX_MARK[b]+' '+OX_LBL[b]+' '+oxPct(a)+'%'+(extra||'')+'</span>'}
function oxQoqChip(q,unit){
  if(q&&q.state==='ok')return '<span class="ox-chip '+(q.v>=0?'ok':'bad')+'">'+(q.v>=0?'▲ +':'▼ −')+Math.abs(q.v).toFixed(1)+'% '+(unit||'QoQ')+'</span>';
  return '<span class="ox-chip nl">'+esc(unit||'QoQ')+' · '+esc((q&&q.txt)||'—')+'</span>';
}
/* D55: achievement above 300% is a wrong target: no number, "Check target" instead */
function oxAchV(a,t){return t>0&&!achCap(a/t*100)?a/t*100:null}
function oxAchCk(a,t){return t>0&&achCap(a/t*100)}
function oxAchChip(x){return x.ck?'<span class="ox-chip warn">Check target</span>':x.ach!=null?oxBandChip(x.ach):'<span class="ox-chip nl">Ach: not loaded</span>'}
function oxDrill(k,label){return '<button class="ox-drill" data-act="ox-open" data-k="'+k+'">'+(label||'Table ›')+'</button>'}
/* bullet bar: act (coloured by band), target tick, last-quarter dashed marker, grey track = potential (or the largest figure when there is no potential) */
function oxBul(o){
  var sc=o.pot>0?o.pot:Math.max(o.act||0,o.tgt||0,o.last||0,1)*1.12,pc=function(v){return Math.max(0,Math.min(100,v/sc*100))};
  if(o.band==null&&!(o.tgt>0))return '<div class="ox-bul nl" role="img" aria-label="'+esc(o.aria||'No target loaded')+'"><div class="f" style="width:'+pc(o.act||0)+'%;opacity:.55;background:var(--act)"></div></div>';
  return '<div class="ox-bul" role="img" aria-label="'+esc(o.aria||'')+'"><div class="f b'+(o.band||4)+'" style="width:'+pc(o.act||0)+'%"></div>'+(o.last>0?'<div class="lq" style="left:'+pc(o.last)+'%"></div>':'')+(o.tgt>0?'<div class="tg" style="left:'+pc(o.tgt)+'%"></div>':'')+'</div>';
}
function oxSpark(vals){
  var v=vals.filter(function(x){return x!=null});if(v.length<2)return '';
  var mn=Math.min.apply(null,v),mx=Math.max.apply(null,v),n=vals.length,pts=[];
  vals.forEach(function(x,i){if(x==null)return;pts.push((2+i*(86/(n-1))).toFixed(1)+','+(22-(mx>mn?(x-mn)/(mx-mn):.5)*18).toFixed(1))});
  var last=pts[pts.length-1].split(',');
  return '<svg viewBox="0 0 90 26" width="90" aria-hidden="true"><polyline points="'+pts.join(' ')+'" fill="none" stroke="var(--act)" stroke-width="2"/><circle cx="'+last[0]+'" cy="'+last[1]+'" r="3" fill="var(--act)"/></svg>';
}
/* quarter series in sheets, on the same loaded/partial/net rules as quarterSeries (D28, D40, D45) */
function oxSeries(ctx){
  var f=Object.assign({plants:ctx.plants},ctx.base),sp=f.sp!=null?f.sp:undefined,ser=quarterSeries(f,sp),pset=f.plants||(f.plant?new Set([f.plant]):null);
  return ser.map(function(s,i){
    var ms=qMonths(s.q),ff=Object.assign({},f);if(sp!=null)ff.sp=sp;
    var w=s.isCur?walk(ms,s.N):wins(ms),has=s.isCur?s.loaded:(s.loaded||anyMonthData(ms,pset)),sh0=has?sumF(ff,w).sh:null,shNet=null;
    if(has&&s.net&&sp==null){shNet=sh0-cnFor(ff,w).sheets}
    var P=sp==null?planQ(f,s.q):null,tgt=P&&P.nLeaf&&P.tgtSh>0?P.tgtSh:null,tgtTo=null;
    if(s.isCur&&sp==null){var pq=planQtyF(f,w);tgtTo=pq.any&&pq.tgt>0?pq.tgt:null}
    return {q:s.q,label:s.label,cov:s.cov,isCur:s.isCur,full:s.loaded,partial:has&&!s.loaded&&!s.isCur,has:has,sh0:sh0,shNet:shNet,net:s.net,H:shNet!=null?shNet:sh0,tgt:tgt,tgtTo:s.isCur?tgtTo:tgt,N:s.N,A:s.A,ach:s.ach};
  });
}
function oxQoqAt(ser,i){
  if(i===0)return {txt:'n/a',v:null};
  var a=ser[i],p=ser[i-1];
  if(a.isCur)return {txt:'to date',v:null};
  if(!a.full)return {txt:a.has?'partial':'not loaded',v:null};
  if(!p.full)return {txt:p.has?'vs partial':'vs gap',v:null};
  var x=a.net&&p.net?[a.shNet,p.shNet]:[a.sh0,p.sh0];if(!(x[1]>0))return {txt:'—',v:null};
  return {v:(x[0]-x[1])/x[1]*100,txt:''};
}
function oxTrendStats(ser){
  var inv=ser.map(function(x){return x.isCur||!x.full?null:x.sh0});
  return trendStats(inv,{pairs:function(i){var a=ser[i],p=ser[i-1];return a&&p&&a.net&&p.net&&a.full&&p.full&&!a.isCur?[a.shNet,p.shNet]:null}});
}
function oxTrendSvg(ser,hasTgt){
  var W=620,H=262,L=34,B=58,T=14,n=ser.length,bw=(W-L-10)/n,vals=[];
  ser.forEach(function(s){[s.H,s.tgt,s.tgtTo].forEach(function(v){if(v!=null)vals.push(v)})});
  var proj=null,cur=ser[n-1];
  if(cur&&cur.isCur&&cur.has&&cur.N>0&&cur.N!==Infinity){var wdTot=qMonths(cur.q).reduce(function(a,m){return a+WD(m)},0);if(wdTot>cur.N)proj=cur.H/cur.N*wdTot}
  if(proj!=null)vals.push(proj);
  var mx=Math.max.apply(null,vals.concat([1]))*1.12,step=Math.pow(10,Math.floor(Math.log10(mx/4))),m5=[1,2,5,10].map(function(k){return k*step}).filter(function(k){return mx/k<=5})[0]||step*10,top=Math.ceil(mx/m5)*m5;
  var y=function(v){return T+(H-T-B)*(1-v/top)},s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Quarterly sheets, actual against target, '+esc(ser[0].label)+' to '+esc(cur.label)+'"><defs><pattern id="oxh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--track)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink3)" stroke-width="2"/></pattern></defs>';
  for(var g=0;g<=top+1e-9;g+=m5)s+='<line x1="'+L+'" x2="'+W+'" y1="'+y(g)+'" y2="'+y(g)+'" stroke="var(--line)"/><text x="0" y="'+(y(g)+3)+'">'+(g/100000).toFixed(g/100000%1?1:0)+'</text>';
  ser.forEach(function(q,i){
    var bx=L+i*bw+bw*.18,w=bw*.64,v=q.H,qq=oxQoqAt(ser,i),tip=q.label+' · '+(v==null?'not loaded':oxLakh(v)+' lakh sheets'+(q.isCur?' to date':'')+(q.net?' (Net)':' (Invoiced)'));
    var tg=q.isCur?q.tgtTo:q.tgt;if(tg!=null)tip+=' · target '+oxLakh(tg)+' lakh'+(v!=null&&q.ach!=null?' · Ach '+(v/tg*100).toFixed(1)+'%':'');
    tip+=qq.v!=null?' · QoQ '+oxSgn(qq.v,Math.abs(qq.v).toFixed(1))+'%':(qq.txt?' · QoQ '+qq.txt:'');
    s+='<g data-tip="'+esc(tip)+'" tabindex="0">';
    if(v==null)s+='<rect x="'+bx+'" y="'+(T+4)+'" width="'+w+'" height="'+(H-T-B-4)+'" rx="4" fill="none" stroke="var(--ink3)" stroke-dasharray="4 3" opacity=".6"/>';
    else{
      if(q.isCur&&proj!=null)s+='<rect x="'+bx+'" y="'+y(proj)+'" width="'+w+'" height="'+(y(0)-y(proj))+'" rx="4" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 3"/>';
      s+='<rect x="'+bx+'" y="'+y(v)+'" width="'+w+'" height="'+Math.max(1,y(0)-y(v))+'" rx="4" fill="'+(q.partial?'url(#oxh)':'var(--act)')+'"/>';
    }
    if(tg!=null)s+='<line x1="'+(bx-4)+'" x2="'+(bx+w+4)+'" y1="'+y(tg)+'" y2="'+y(tg)+'" stroke="var(--plan)" stroke-width="3"/>';
    if(v!=null)s+='<text x="'+(bx+w/2)+'" y="'+(y(v)-4)+'" text-anchor="middle" class="st vl">'+oxLakh(v)+'</text>';
    s+='<text x="'+(bx+w/2)+'" y="'+(H-B+13)+'" text-anchor="middle" class="st">'+esc(q.label.replace(' FY',' ·'))+(q.isCur?'*':'')+'</text>';
    s+='<text x="'+(bx+w/2)+'" y="'+(H-B+26)+'" text-anchor="middle" style="fill:'+(qq.v==null?'var(--ink3)':qq.v>=0?'var(--green)':'var(--red)')+';font-weight:700">'+(qq.v==null?esc(qq.txt):(qq.v>=0?'▲':'▼')+Math.abs(qq.v).toFixed(1)+'%')+'</text>'+(q.partial&&q.cov?'<text x="'+(bx+w/2)+'" y="'+(H-B+38)+'" text-anchor="middle" class="st">partial:</text><text x="'+(bx+w/2)+'" y="'+(H-B+49)+'" text-anchor="middle" class="st">'+q.cov.n+' of '+q.cov.N+' plants</text>':'')+'</g>';
  });
  return s+'</svg>';
}
/* ---- the page ---- */
function pageOverview(){
  var ctx=viewCtx();if(noData())return emptyData();
  var res=ctx.res,tot=figs({},ctx),sc=ctx.sc,today=TODAY(),pset=ctx.plants;
  var f0=Object.assign({plants:ctx.plants},ctx.base),own=!!sc.sp;
  var q=planQty(ctx),shQ=shQoq(tot,res),ser=oxSeries(ctx),tsSh=oxTrendStats(ser),cur=ser[ser.length-1];
  var heroCk=oxAchCk(tot.sh,q.tgt),tgtOk=q.tgt>0&&!heroCk,potOk=q.pot>0,ach=tgtOk?tot.sh/q.tgt*100:null,var_=tgtOk?tot.sh-q.tgt:null,share=potOk?tot.sh/q.pot*100:null;
  var lastSh=res.prior?(tot.bothNet?tot.Psh:tot.Psh0):null;
  var basisTxt=tot.basis==='Net'?'Net sales (credit notes loaded for every plant in scope)':'Invoiced sales ('+cnNote(tot).replace(/^Invoiced · /,'').replace(/\.$/,'')+')';
  /* groups */
  var groups=distinct('group').map(function(g){var o=figs({group:g},ctx,{noTrend:true}),pq=planQtyF(Object.assign({plants:ctx.plants},ctx.base,{group:g}),res.cur);return {g:g,o:o,pq:pq,ach:oxAchV(o.sh,pq.tgt),ck:oxAchCk(o.sh,pq.tgt),q:shQoq(o,res)}});
  var totSh=groups.reduce(function(a,x){return a+x.o.sh},0)||1;
  /* zones and plants */
  var plantsIn=distinct('plant').filter(function(p){return plantInScope(sc,p)&&(!ctx.f.plant||p===ctx.f.plant)});
  var zoneOf=function(p){var r=S.plants.find(function(x){return x.plant_code===p});return r&&r.zone?r.zone:''};
  var zoneMap={};plantsIn.forEach(function(p){var z=zoneOf(p);if(z)(zoneMap[z]=zoneMap[z]||[]).push(p)});
  var zones=Object.keys(zoneMap).sort().map(function(z){var ps=new Set(zoneMap[z]),o=figs({plants:ps},ctx,{noTrend:true}),pq=planQtyF(Object.assign({},f0,{plants:ps}),res.cur);return {z:z,o:o,pq:pq,ach:oxAchV(o.sh,pq.tgt),ck:oxAchCk(o.sh,pq.tgt),q:shQoq(o,res)}});
  var plants=plantsIn.map(function(p){var o=figs({plant:p,plants:undefined},ctx,{noTrend:true}),pq=planQtyF(Object.assign({},f0,{plants:undefined,plant:p}),res.cur);return {p:p,o:o,pq:pq,ach:oxAchV(o.sh,pq.tgt),ck:oxAchCk(o.sh,pq.tgt),v:pq.tgt>0&&!oxAchCk(o.sh,pq.tgt)?o.sh-pq.tgt:null}});
  /* actions for the Today panel and the answer strip */
  var u=effUser(),cand=todayCandidates(u),ranked=rankSort(cand,today),cap=capFor(u),showN=Math.min(3,cap),topAct=ranked.slice(0,showN);
  var h='<div class="ox">';
  /* legend + basis: the one legend on the page */
  h+='<div class="ox-banner"><b>Bar colour = Ach %</b><span class="ox-bands">'+[1,2,3,4].map(function(b){var r=['','&lt;75','75–&lt;90','90–&lt;100','100+'][b];return '<span><i class="b'+b+'"></i>'+r+' '+OX_MARK[b]+' '+OX_LBL[b]+'</span>'}).join('')+'</span><span class="note">Basis: <b>'+esc(basisTxt)+'</b>'+(tot.basis==='Net'?'':'')+'</span></div>';
  /* answer strip */
  var behind=[];
  if(tgtOk){groups.forEach(function(x){if(x.ach!=null&&x.ach<90)behind.push(x.g)});zones.forEach(function(x){if(x.ach!=null&&x.ach<90)behind.push(x.z)})}
  var decl=groups.filter(function(x){return x.q.state==='ok'&&x.q.v<-5}).sort(function(a,b){return a.q.v-b.q.v});
  var a1=heroCk?'<b>'+oxLakh(tot.sh)+' lakh sheets</b><span>Check target: achievement is above '+ACH_MAX+'%, so the target is probably wrong. Asked of the Super admin.</span>':tgtOk?'<b>'+oxPct(ach)+'% of target</b><span>In sheets: '+oxLakh(Math.abs(var_))+' lakh '+(var_<0?'behind':'ahead of')+' the '+(res.pro?'pro-rated ':'')+'target.'+(share!=null?' '+share.toFixed(1)+'% of market potential.':'')+' Worth '+fmtMoney(tot.A)+'.</span>'
    :'<b>'+oxLakh(tot.sh)+' lakh sheets</b><span>'+(tot.A!=null?'Worth '+fmtMoney(tot.A)+'. ':'')+'Target'+(potOk?'':' and potential')+' not loaded, so no Ach % yet.</span>';
  var a2=shQ.state==='ok'?'<b>'+(shQ.v>=0?'▲ +':'▼ −')+Math.abs(shQ.v).toFixed(1)+'% sheets</b><span>vs '+esc(res.priorLabel)+(tot.qoq&&tot.qoq.state==='ok'?' (₹ '+oxSgn(tot.qoq.v,Math.abs(tot.qoq.v).toFixed(1))+'%)':'')+'. '+(tsSh.short?'Trend: history too short.':'Trend '+(tsSh.dir==='rising'?'rising':tsSh.dir==='falling'?'falling':'flat')+(tsSh.avg!=null?', average '+fmtPct(tsSh.avg,true):'')+'.')+'</span>'
    :'<b>QoQ not shown</b><span>'+esc(shQ.txt||'no prior quarter')+'. '+(res.prior?'Compared with '+esc(res.priorLabel)+'.':'')+'</span>';
  var a3=tgtOk?(behind.length?'<b>'+esc(behind.slice(0,3).join(', ')+(behind.length>3?' +'+(behind.length-3):''))+'</b><span>Below 90% of target (sheets).'+(plants.filter(function(x){return x.ach!=null&&x.ach<90}).length?' '+plants.filter(function(x){return x.ach!=null&&x.ach<90}).length+(' plant'+(plants.filter(function(x){return x.ach!=null&&x.ach<90}).length===1?'':'s')+' below 90%, furthest behind listed below.'):'')+'</span>':'<b>Nothing below 90%</b><span>Every group and zone is at or above 90% of its sheet target.</span>')
    :(decl.length?'<b>'+esc(decl.slice(0,2).map(function(x){return x.g+' −'+Math.abs(x.q.v).toFixed(1)+'% QoQ'}).join(', '))+'</b><span>Only QoQ can flag decline until targets load.</span>':'<b>No group below −5% QoQ</b><span>Only QoQ can flag decline until targets load.</span>');
  var a4=topAct.length?'<b>'+Math.min(ranked.length,cap)+' action'+(Math.min(ranked.length,cap)===1?'':'s')+' today</b><span>Top: '+esc(topAct[0].a.title)+', '+esc(dueTxt(topAct[0].a,today))+', owner '+esc(topAct[0].a.owner===u.email?'you':who(topAct[0].a.owner))+'.</span>':'<b>Nothing due</b><span>You are clear for today.</span>';
  h+='<section class="ox-answers" aria-label="Five-second answers"><div class="ox-ans"><q>1 · Where are we?</q>'+a1+'</div><div class="ox-ans"><q>2 · Growing QoQ?</q>'+a2+'</div><div class="ox-ans"><q>3 · Who is behind?</q>'+a3+'</div><div class="ox-ans"><q>4 · What now?</q>'+a4+'</div></section>';
  /* tiles */
  h+='<div class="ox-tiles">';
  /* hero */
  var heroTip='Actual '+oxLakh(tot.sh)+' lakh sheets ('+fmtMoney(tot.A)+')'+(lastSh!=null?' · Last Qtr '+oxLakh(lastSh)+' lakh':'')+(shQ.state==='ok'?' · QoQ '+oxSgn(shQ.v,Math.abs(shQ.v).toFixed(1))+'%':'');
  h+='<section class="ox-card ox-hero-c"><h2>K1 · Sales in sheets · '+esc(res.label)+oxDrill('groupsh')+'</h2><div class="ox-hero"><div'+oxTip(heroTip)+'><div class="ox-big">'+oxLakh(tot.sh)+'<span class="ox-unit"> lakh sheets</span></div>'
   +'<div class="ox-row" style="margin-top:6px">'+oxQoqChip(shQ)+(heroCk?'<span class="ox-chip warn">Check target</span>':ach!=null?oxBandChip(ach):'<span class="ox-chip nl">Ach % · not loaded</span>')+(tot.kind==='draft'?'<span class="ox-chip nl">Draft target</span>':'')+'</div>'
   +'<p class="ox-sec mono">'+fmtMoney(tot.A)+' <span class="ox-unit">'+(tot.basis==='Net'?'net value':'invoiced value')+(tot.qoq&&tot.qoq.state==='ok'?', ₹ '+oxSgn(tot.qoq.v,Math.abs(tot.qoq.v).toFixed(1))+'% QoQ':'')+'</span></p>'
   +'<p class="note" style="margin:4px 0 0">Laminate, Door, PVC sheet, Compact board. Internal transfers excluded.'+(res.pro&&res.wdN!=null?' '+res.wdN+' of '+res.wdTot+' working days elapsed.':'')+'</p></div>'
   +'<div><div'+oxTip('Actual '+oxLakh(tot.sh)+' · Target '+(tgtOk?oxLakh(q.tgt):'not loaded')+' · Potential '+(potOk?oxLakh(q.pot):'not loaded')+' lakh sheets'+(lastSh!=null?' · Last Qtr '+oxLakh(lastSh):'')+(ach!=null?' · Ach '+oxPct(ach)+'%':''))+'>'
   +oxBul({act:tot.sh,tgt:q.tgt,pot:q.pot,last:lastSh,band:ach!=null?oxBand(ach):null,aria:'Actual '+oxLakh(tot.sh)+' lakh sheets'+(tgtOk?', target '+oxLakh(q.tgt):', target not loaded')})
   +(tgtOk||potOk?'':'<p class="ox-nl" style="margin:6px 0 0;font-size:12.5px">Target and potential not loaded: no scale to draw against. Load in Admin › Market potential.</p>')+'</div>'
   +'<div class="ox-nine">'+[['Potential',potOk?oxLakh(q.pot):null],['Target',tgtOk?oxLakh(q.tgt):null],['Actual',oxLakh(tot.sh)],['Var',tgtOk?oxSgn(var_,oxLakh(Math.abs(var_)))+' ('+fmtPct(var_/q.tgt*100,true)+')':null],['Ach %',ach!=null?oxPct(ach)+'%':null],['Share %',share!=null?share.toFixed(1)+'%':null],['Last Qtr',lastSh!=null?oxLakh(lastSh):(res.prior?null:'—')],['QoQ %',shQ.state==='ok'?fmtPct(shQ.v,true):'—'],['Trend',tsSh.short?'too short':arrowShort(tsSh.dir)+' '+tsSh.dir]].map(function(x){return '<div><small>'+x[0]+'</small>'+(x[1]==null?'<b class="ox-nl">not loaded</b>':'<b>'+esc(x[1])+'</b>')+'</div>'}).join('')+'</div><p class="note" style="margin:6px 0 0">All figures in lakh sheets. '+(cur&&cur.net?'Net of credit notes.':'Invoiced.')+'</p></div></div></section>';
  /* rupee tile */
  h+='<section class="ox-card ox-sm"'+oxTip('Value '+fmtMoney(tot.A)+' · Target '+(tot.tgt!=null?fmtMoney(tot.tgt):'not loaded')+(tot.ach!=null?' · Ach '+oxPct(tot.ach)+'%':'')+' · Last Qtr '+(tot.P!=null?fmtMoney(tot.P):'—'))+'><h2>₹ value<span>'+oxDrill('group')+oxDrill('trendrs','Trend ›')+'</span></h2><div class="ox-tile-big">'+fmtMoney(tot.A)+' <span class="ox-unit">'+(tot.basis==='Net'?'net':'invoiced')+'</span></div>'
   +(tot.ach!=null?oxBul({act:tot.A,tgt:tot.tgt,pot:tot.tgt*1.0,last:tot.P,band:oxBand(tot.ach)})+'<p class="note" style="margin:6px 0 0">'+OX_MARK[oxBand(tot.ach)]+' '+OX_LBL[oxBand(tot.ach)]+' · '+oxPct(tot.ach)+'% of '+fmtMoney(tot.tgt)+' target</p>':'<div class="ox-empty sm"><span class="ox-nl">Target: not loaded</span></div>')
   +'<div class="ox-row">'+oxQoqChip(tot.qoq)+oxSpark((tot.series||[]).map(function(s){return s.H}))+'</div></section>';
  /* collections tile */
  var col=collectionFigs(ctx),cser=collSeries(pset),showQ=null,colNote='';
  var colRec=null,colQ=null,colLabel='',colPrior=null,colPlanHave=false,colPlan=0;
  if(col.have){colRec=col.cur.rec;colQ=col.pr?qoqOf(col.cur.rec,col.pr.rec,{incomplete:!res.curMonths.length||!col.pr.have}):{state:'none',txt:'no prior quarter'};colLabel=res.label;colPlanHave=!!(col.cur.planHave&&!col.cur.planDefault);colPlan=col.cur.plan}
  else{for(var ci=cser.length-1;ci>=0;ci--){if(cser[ci].loaded){showQ=cser[ci];break}}
    if(showQ){var cm=collMonths(pset,wins(qMonths(showQ.q))),pm=collMonths(pset,wins(qMonths(prevQ(showQ.q))));colRec=cm.rec;colLabel=qLabel(showQ.q);colQ=qoqOf(cm.rec,pm.rec,{incomplete:!pm.have});colPlanHave=!!(cm.planHave&&!cm.planDefault);colPlan=cm.plan;colNote=res.label+' receipts: <span class="ox-nl">not loaded</span>.'}}
  var lastCollYm=S.coll.reduce(function(a,d){return d.ym&&d.rows&&(d.n||d.total)>0&&(!a||d.ym>a)?d.ym:a},'');
  if(colRec==null)h+='<section class="ox-card ox-sm"><h2>K9 · Collections <span class="ox-chip nl">Not loaded</span></h2><div class="ox-empty"><b>No receipts file for this period</b><span>Collections appear after the Incoming Payment Report is loaded. Shown as not loaded, never as zero.</span><div class="ox-bul nl" style="height:12px"></div></div></section>';
  else{
    var invQ=sumF(f0,col.have?res.cur:wins(qMonths(showQ.q))).n,ratio=invQ>0?colRec/invQ*100:null;
    h+='<section class="ox-card ox-sm"'+oxTip('Collected '+colLabel+' '+fmtMoney(colRec)+(ratio!=null?' · collected ÷ invoiced '+ratio.toFixed(1)+'%':'')+' · collection plan '+(colPlanHave?fmtMoney(colPlan):'not loaded')+(lastCollYm?' · data to '+ymLabel(lastCollYm):''))+'><h2>K9 · Collections'+oxDrill('coll')+'</h2><div class="ox-tile-big">'+fmtMoney(colRec)+' <span class="ox-unit">'+esc(colLabel)+'</span></div>'
     +(colPlanHave&&colPlan>0?oxBul({act:colRec,tgt:colPlan,pot:colPlan,band:oxBand(colRec/colPlan*100)})+'<p class="note" style="margin:6px 0 0">'+OX_MARK[oxBand(colRec/colPlan*100)]+' '+OX_LBL[oxBand(colRec/colPlan*100)]+' · '+oxPct(colRec/colPlan*100)+'% of plan '+fmtMoney(colPlan)+'</p>'
       :'<div class="ox-bul nl"><div class="f" style="width:'+(ratio!=null?Math.min(ratio,100):0)+'%;opacity:.55;background:var(--act)"></div></div><p class="note" style="margin:0">Bar = collected ÷ invoiced'+(ratio!=null?' ('+ratio.toFixed(1)+'%), a ratio, not an achievement':'')+'. Collection plan: <span class="ox-nl">not loaded</span>.'+(colNote?' '+colNote:'')+'</p>')
     +'<div class="ox-row">'+oxQoqChip(colQ)+oxSpark(cser.map(function(s){return s.A}))+'</div></section>';
  }
  /* stock tile */
  var inv=invSummary(ctx);
  if(!inv||inv.days==null)h+='<section class="ox-card ox-sm"><h2>K15 · Stock days <span class="ox-chip nl">Not loaded</span></h2><div class="ox-empty"><b>'+(inv?'No sales rate to divide by':'No stock file yet')+'</b><span>Stock days appear after a stock snapshot with 90 days of sales. Shown as not loaded, never as zero.</span><div class="ox-bul nl" style="height:12px"></div></div></section>';
  else{
    var al=achLower(inv.days,inv.tgt),gk=ITEM_GROUPS.filter(function(g){return inv.byGroup[g]!=null}),mxd=Math.max.apply(null,gk.map(function(g){return inv.byGroup[g]}).concat([inv.tgt,inv.days]))*1.15;
    var rows=gk.map(function(g,i){var d=inv.byGroup[g],a=achLower(d,inv.tgt),b=oxBand(a.ach),yy=6+i*22,wv=Math.min(150,d/mxd*150);
      return '<rect x="64" y="'+yy+'" width="150" height="12" rx="3" fill="var(--track)"/><rect x="64" y="'+(yy+2)+'" width="'+wv.toFixed(1)+'" height="8" rx="3" fill="var(--b'+b+')" stroke="var(--b'+b+'d)" stroke-width="1.5"/><text x="0" y="'+(yy+10)+'" class="st">'+esc(g.length>9?g.slice(0,8):g)+'</text><text x="220" y="'+(yy+10)+'"'+(b<3?' style="fill:var(--red);font-weight:700"':'')+'>'+OX_MARK[b]+Math.round(d)+'</text>'}).join('');
    var px=64+Math.min(150,inv.tgt/mxd*150);
    h+='<section class="ox-card ox-sm"'+oxTip('Stock days '+Math.round(inv.days)+' as on '+fmtDate(inv.sn.as_of)+' · plan '+inv.tgt+' · plan ÷ actual = '+oxPct(al.ach)+'% · lower is better')+'><h2>K15 · Stock days'+oxDrill('inv')+'</h2><div class="ox-tile-big">'+Math.round(inv.days)+' <span class="ox-unit">days · '+esc(fmtDate(inv.sn.as_of).replace(/^\w+ /,''))+'</span></div>'
     +'<svg viewBox="0 0 240 '+(gk.length*22+8)+'" role="img" aria-label="Stock days by group; plan '+inv.tgt+'">'+rows+'<line x1="'+px.toFixed(1)+'" y1="2" x2="'+px.toFixed(1)+'" y2="'+(gk.length*22+4)+'" stroke="var(--plan)" stroke-width="2"/></svg>'
     +'<div class="ox-row">'+oxBandChip(al.ach,' · plan ÷ actual')+'</div><p class="note" style="margin:0">Line = plan '+inv.tgt+' days. Lower is better; bar colour = plan ÷ actual. '+(S.stockSnaps.length>1?'':'One snapshot, so no QoQ yet.')+'</p></section>';
  }
  /* receivables tile */
  var rv=recvStats(pset);
  if(!rv.have)h+='<section class="ox-card ox-sm"><h2>K10 · Overdue receivables <span class="ox-chip nl">Not loaded</span></h2><div class="ox-empty"><b>No receivables file yet</b><span>Overdue share and the 0–30 / 31–60 / 61–90 / 90+ ageing bar appear after the Receivables intake. Shown as not loaded, never as zero.</span><div class="ox-bul nl" style="height:12px"></div>'+(effRole()==='Super admin'?'<a class="ox-drill" href="#/intake">Open Data Intake › Receivables</a>':'')+'</div></section>';
  else{
    var ar=achLower(rv.overShare,15),tot2=rv.total||1,bk=rv.buckets,seg=['0–30','31–60','61–90','90+'];
    h+='<section class="ox-card ox-sm"'+oxTip('Overdue share '+(rv.overShare!=null?rv.overShare.toFixed(1)+'%':'—')+' · open '+fmtMoney(rv.total)+' · as on '+(S.recvAsOf?fmtDate(S.recvAsOf):'—'))+'><h2>K10 · Overdue receivables'+oxDrill('rcv')+'</h2><div class="ox-tile-big">'+(rv.overShare!=null?rv.overShare.toFixed(1)+'%':'—')+' <span class="ox-unit">over '+CFG.overdue_share_days+' days</span></div>'
     +'<div class="ox-age" role="img" aria-label="Ageing">'+bk.map(function(v,i){return '<i style="width:'+Math.max(0,v/tot2*100).toFixed(1)+'%;background:var(--age'+i+')" title="'+seg[i]+' days '+esc(fmtMoney(v))+'"></i>'}).join('')+'</div><p class="note" style="margin:0">Open '+fmtMoney(rv.total)+'; '+fmtMoney(rv.notDue)+' not yet due. 0–30 / 31–60 / 61–90 / 90+: '+bk.map(function(v){return fmtMoney(v)}).join(' / ')+'.</p>'
     +'<div class="ox-row">'+(ar.within?'<span class="ox-chip b4">● Within plan</span>':ar.ach!=null?oxBandChip(ar.ach,' · plan ÷ actual'):'')+'<span class="note">Plan 15% (Assumed)</span></div></section>';
  }
  /* trend */
  var hasTgt=ser.some(function(s){return s.tgt!=null||s.tgtTo!=null}),closed=ser.filter(function(s){return !s.isCur&&s.full}),lastClosed=closed[closed.length-1],stretch='';
  if(cur&&cur.tgtTo!=null&&cur.tgt!=null&&lastClosed&&lastClosed.sh0>0){var sr=stretchOf(cur.tgt,lastClosed.sh0,tsSh);if(sr.required!=null)stretch='<div class="ox-callout"><span class="ox-chip '+(sr.state==='stretch'?'warn':'ok')+'">'+(sr.state==='stretch'?'Stretch':'Within range')+'</span> '+esc(cur.label.replace(/ to date/,''))+' target needs <b>'+fmtPct(sr.required,true)+'</b> QoQ in sheets; average QoQ is '+fmtPct(sr.avg,true)+' ('+CFG.stretch_multiple+'× = '+fmtPct(sr.threshold,false)+'). For discussion.</div>'}
  h+='<section class="ox-card ox-t6"><h2>Quarterly trend in lakh sheets, actual vs target'+oxDrill('trendsh')+'</h2>'+oxTrendSvg(ser,hasTgt)
   +'<div class="ox-legend"><span><i class="k-act"></i>Actual sheets (lakh)</span><span><i class="k-tg"></i>Target'+(hasTgt?'':' (not loaded)')+'</span><span><i class="k-run"></i>Run-rate projection</span><span><i class="k-hat"></i>Incomplete history</span><span class="note">* quarter to date</span></div>'+stretch
   +'<p class="note" style="margin:0">History starts '+esc(qLabel(histStart()))+' (D28): '+(ser.length-1)+' closed quarter'+(ser.length-1===1?'':'s')+' shown, not 12. A partial quarter is hatched and its QoQ reads "partial" or "vs partial". Net quarters use credit notes (D40); others are invoiced.</p></section>';
  /* groups */
  h+='<section class="ox-card ox-t5"><h2>Product group mix (sheets) and achievement'+oxDrill('groupsh')+'</h2><div class="ox-mix" role="img" aria-label="Sheet mix">'+groups.map(function(x,i){return '<i style="width:'+(x.o.sh/totSh*100).toFixed(1)+'%;background:var(--g'+(i+1)+')"'+oxTip(x.g+' '+(x.o.sh/totSh*100).toFixed(1)+'% of sheets')+'></i>'}).join('')+'</div>'
   +groups.map(function(x,i){var o=x.o,lastG=res.prior?(o.bothNet?o.Psh:o.Psh0):null,tip=x.g+' (lakh sheets) · Potential '+(x.pq.pot>0?oxLakh(x.pq.pot):'not loaded')+' · Target '+(x.pq.tgt>0?oxLakh(x.pq.tgt):'not loaded')+' · Actual '+oxLakh(o.sh)+(x.ach!=null?' · Ach '+oxPct(x.ach)+'%':'')+(lastG!=null?' · Last Qtr '+oxLakh(lastG):'')+(x.q.state==='ok'?' · QoQ '+oxSgn(x.q.v,Math.abs(x.q.v).toFixed(1))+'%':'');
     return '<div class="ox-grp"'+oxTip(tip)+'><div class="h"><span><i class="sw" style="background:var(--g'+(i+1)+')"></i><b>'+esc(x.g)+'</b> <span class="mono">'+oxLakh(o.sh)+' lakh</span></span><span class="ox-row">'+oxAchChip(x)+oxQoqChip(x.q)+'</span></div>'
     +oxBul({act:o.sh,tgt:x.pq.tgt,pot:x.pq.pot,last:lastG,band:x.ach!=null?oxBand(x.ach):null,aria:x.g+' '+oxLakh(o.sh)+' lakh sheets'})+'</div>'}).join('')
   +'<p class="note" style="margin:0">Sheets. Bar length = lakh sheets against group potential (grey track); colour = Ach band; tick = target; dashed = Last Qtr.</p></section>';
  /* zones and plants */
  var withTgt=plants.filter(function(x){return x.v!=null}).sort(function(a,b){return a.v-b.v}),rk=[];
  if(withTgt.length){var behindL=withTgt.filter(function(x){return x.v<0}).slice(0,4),aheadL=withTgt.filter(function(x){return x.v>=0}).slice(-4);rk=behindL.concat(aheadL)}/* each plant at most once */
  var mxv=Math.max.apply(null,rk.map(function(x){return Math.abs(x.v)}).concat([1]));
  h+='<section class="ox-card ox-t6"><h2>Zones and plants'+oxDrill('branchsh')+'</h2>'
   +(zones.length?'<div class="ox-zones">'+zones.map(function(x){var lastZ=res.prior?(x.o.bothNet?x.o.Psh:x.o.Psh0):null;return '<div class="ox-zone"'+oxTip(x.z+' (lakh sheets) · Target '+(x.pq.tgt>0?oxLakh(x.pq.tgt):'not loaded')+' · Actual '+oxLakh(x.o.sh)+(x.ach!=null?' · Ach '+oxPct(x.ach)+'%':'')+(lastZ!=null?' · Last Qtr '+oxLakh(lastZ):''))+'><small>'+esc(x.z)+'</small>'+(x.ach!=null?'<b>'+oxPct(x.ach,0)+'%</b>':'<b class="ox-nl" style="font-size:13px">Ach: not loaded</b>')+'<div class="ox-bul">'+'<div class="f '+(x.ach!=null?'b'+oxBand(x.ach):'')+'" style="width:'+(x.ach!=null?Math.min(x.ach,100):Math.min(100,x.o.sh/(Math.max.apply(null,zones.map(function(z){return z.o.sh}))||1)*100))+'%;'+(x.ach!=null?'':'background:var(--act)')+'"></div></div>'+(x.ach!=null?oxBandChip(x.ach):'<span class="ox-chip nl">'+oxLakh(x.o.sh)+' lakh</span>')+oxQoqChip(x.q)+'</div>'}).join('')+'</div>'
     :'<div class="ox-empty sm"><span class="ox-nl">Zones not set in Admin › Plants</span><span class="note">Zone tiles appear once plants carry a zone.</span></div>')
   +'<h2 style="margin-top:4px">Furthest behind and ahead (variance, thousand sheets)</h2>'
   +(rk.length?rk.map(function(x){var neg=x.v<0,w=Math.abs(x.v)/mxv*50,b=oxBand(x.ach);return '<div class="ox-rk"'+oxTip(plantShort(x.p)+' (thousand sheets) · Target '+oxK(x.pq.tgt)+' · Actual '+oxK(x.o.sh)+' · Var '+oxSgn(x.v,oxK(Math.abs(x.v)))+' · Ach '+oxPct(x.ach)+'%')+'><span class="nm">'+esc(plantShort(x.p))+'</span><div class="ox-div"><i style="'+(neg?'right:50%':'left:50%')+';width:'+w.toFixed(1)+'%;background:var(--b'+b+');border:2px solid var(--b'+b+'d)"></i></div><span class="v">'+(neg?'▼ −':'▲ +')+oxK(Math.abs(x.v))+' · '+oxPct(x.ach,0)+'%</span></div>'}).join('')
     :'<div class="ox-empty"><b>Ranking needs targets</b><span>Without a sheet target there is no variance to rank. Until then, the Branch table lists plants by ₹ actual and QoQ %.</span></div>')
   +'<p class="note" style="margin:0">'+(rk.length?'Showing '+rk.length+' of '+plants.length+' plants. ':plants.length+' plants. ')+'Bar colour = Ach band.</p></section>';
  /* Today */
  h+='<section class="ox-card ox-t5"><h2>Today · top '+topAct.length+' of cap '+cap+'<a class="ox-drill" href="#/today">All in Today ›</a></h2>'
   +(topAct.length?topAct.map(function(x){var a=x.a,pl=prioLabel(x.s.score);return '<a class="ox-act" href="#/action/'+esc(a.id)+'"><div><span class="ox-pri '+({High:'bad',Medium:'warn',Low:'ok'}[pl])+'">'+({High:'▲ High',Medium:'● Medium',Low:'▽ Low'}[pl])+'</span><b>'+esc(a.title)+'</b></div><span>Next step: '+esc(a.next_step)+'</span><span class="m">Owner '+esc(a.owner===u.email?'you':who(a.owner))+' · '+esc(dueTxt(a,today))+' ('+esc(fmtDate(a.due))+') · why ranked: '+esc(whyLine(1,x.s))+'</span></a>'}).join('')
     :'<div class="ox-empty sm"><b>Nothing due.</b> You are clear for today.</div>')
   +'<p class="note" style="margin:0">Each action: one owner, one due date, one next step. Responses happen in the page. Alerts are listed in Today.</p></section>';
  h+='</div>';
  /* detail tables behind the Table links: columns unchanged */
  var gr=distinct('group').map(function(g){return {label:'<b>'+esc(g)+'</b> ›',o:figs({group:g},ctx),attrs:' data-act="ov-group" data-v="'+esc(g)+'"'}});
  var br=plantsIn.map(function(p){return {label:'<b>'+esc(plantShort(p))+'</b> <span class="note mono">'+p+'</span> ›',o:figs({plant:p,plants:undefined},ctx),attrs:' data-act="ov-branch" data-v="'+esc(p)+'"'}});
  var det=function(k,title,body){var open=!!S.oxOpen[k];return '<section class="ox-det" id="ox-'+k+'"><button class="ox-sumbtn" data-act="ox-tog" data-k="'+k+'" aria-expanded="'+open+'">'+(open?'▾':'▸')+' Detail table · '+esc(title)+'</button>'+(open?'<div class="ox-detb">'+body+'</div>':'')+'</section>'};
  var cell=function(v,f){return v==null?'<td class="num"><span class="ox-nl">not loaded</span></td>':'<td class="num">'+f(v)+'</td>'};
  var vq=function(q){return q&&q.state==='ok'?'<td class="num"><span class="'+(q.v>=0?'up':'dn')+'">'+fmtPct(q.v,true)+'</span></td>':'<td class="num note">'+esc((q&&q.txt)||'—')+'</td>'};
  var lk=function(v){return oxLakh(v)};
  var gRows=groups.map(function(x){var l=res.prior?(x.o.bothNet?x.o.Psh:x.o.Psh0):null,t=x.pq.tgt>0,po=x.pq.pot>0;return '<tr><td><b>'+esc(x.g)+'</b></td>'+cell(po?x.pq.pot:null,lk)+cell(t?x.pq.tgt:null,lk)+'<td class="num">'+lk(x.o.sh)+'</td>'+cell(t?x.o.sh-x.pq.tgt:null,function(v){return oxSgn(v,lk(Math.abs(v)))})+cell(x.ach,function(v){return oxPct(v)+'%'})+cell(po?x.o.sh/x.pq.pot*100:null,function(v){return oxPct(v)+'%'})+cell(l,lk)+vq(x.q)+'</tr>'}).join('');
  var gTot='<tr class="tot"><td>Total (lakh sheets)</td>'+cell(potOk?q.pot:null,lk)+cell(tgtOk?q.tgt:null,lk)+'<td class="num">'+lk(tot.sh)+'</td>'+cell(tgtOk?var_:null,function(v){return oxSgn(v,lk(Math.abs(v)))})+cell(ach,function(v){return oxPct(v)+'%'})+cell(share,function(v){return oxPct(v)+'%'})+cell(lastSh,lk)+vq(shQ)+'</tr>';
  var groupSh='<div class="tw"><table class="std"><thead><tr><th>Product group</th><th class="num">Potential</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Var</th><th class="num">Ach %</th><th class="num">Share %</th><th class="num">Last Qtr</th><th class="num">QoQ %</th></tr></thead><tbody>'+gRows+gTot+'</tbody></table></div><p class="note">Lakh sheets. '+(cur&&cur.net?'Net of credit notes.':'Invoiced.')+'</p>';
  var pRow=function(label,o,pq,a,v){var l=res.prior?(o.bothNet?o.Psh:o.Psh0):null;return '<tr><td><b>'+esc(label)+'</b></td>'+cell(pq.tgt>0?pq.tgt:null,lk)+'<td class="num">'+lk(o.sh)+'</td>'+cell(v,function(x){return oxSgn(x,lk(Math.abs(x)))})+cell(a,function(x){return oxPct(x)+'%'})+cell(l,lk)+vq(shQoq(o,res))+'</tr>'};
  var branchSh='<div class="tw"><table class="std"><thead><tr><th>Zone / plant</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Var</th><th class="num">Ach %</th><th class="num">Last Qtr</th><th class="num">QoQ %</th></tr></thead><tbody>'
    +zones.map(function(x){return pRow('Zone '+x.z,x.o,x.pq,x.ach,x.pq.tgt>0?x.o.sh-x.pq.tgt:null)}).join('')+plants.slice().sort(function(a,b){return b.o.sh-a.o.sh}).map(function(x){return pRow(plantShort(x.p),x.o,x.pq,x.ach,x.v)}).join('')+'</tbody></table></div><p class="note">Lakh sheets.</p>';
  var tRows=ser.map(function(s0,i){var qq=oxQoqAt(ser,i),t=s0.isCur?s0.tgtTo:s0.tgt,v=s0.H;return '<tr><td><b>'+esc(s0.label)+'</b>'+(s0.isCur?' <span class="note">to date</span>':'')+(s0.partial?' <span class="note">partial</span>':'')+'</td>'+cell(t,lk)+(v==null?'<td class="num"><span class="ox-nl">not loaded</span></td>':'<td class="num">'+lk(v)+'</td>')+cell(t!=null&&v!=null?v-t:null,function(x){return oxSgn(x,lk(Math.abs(x)))})+cell(t!=null&&v!=null?v/t*100:null,function(x){return oxPct(x)+'%'})+(qq.v!=null?'<td class="num"><span class="'+(qq.v>=0?'up':'dn')+'">'+fmtPct(qq.v,true)+'</span></td>':'<td class="num note">'+esc(qq.txt||'—')+'</td>')+'</tr>'}).join('');
  var trendSh='<div class="tw"><table class="std"><thead><tr><th>Quarter</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Var</th><th class="num">Ach %</th><th class="num">QoQ %</th></tr></thead><tbody>'+tRows+'</tbody></table></div><p class="note">Lakh sheets, from '+esc(qLabel(histStart()))+'. Quarters with credit notes loaded for every plant are Net; others are invoiced (D40, D45).</p>';
  h+=det('groupsh','Product group, lakh sheets',groupSh);
  h+=det('branchsh','Zones and plants, lakh sheets',branchSh);
  h+=det('trendsh','Quarterly trend, lakh sheets',trendSh);
  h+=det('group','Product group · '+res.label+' vs '+(res.priorLabel||''),stdTable('Product group',gr.filter(matchSearch),tot)+tableNote(ctx));
  h+=det('branch','Branch · '+res.label,stdTable('Branch',br.filter(matchSearch),tot)+tableNote(ctx,'Drill-down stops at the SAP document (decision D9).'));
  h+=det('trendrs','Quarterly trend in rupees, with drill',trendCard('Quarters since '+qLabel(histStart())+' · Sales',{},ctx,undefined,'ov')+drillPanel(ctx));
  h+=det('ytd','YTD, quarter by quarter',ytdStrip(ctx));
  h+=det('rev','Target revision',targetRevisionCard(ctx,tot));
  if(S.drill&&!S.oxOpen.trendrs)h+=drillPanel(ctx);
  h+='<p class="note">Colour is never the only signal: every band also carries its label and a ▲▼ mark. K7 New customers is on its own page (Team › Scorecard).</p>';
  return h;
}
Object.assign(handlers,{
 'ox-tog':function(t){var k=t.getAttribute('data-k');S.oxOpen[k]=!S.oxOpen[k];S.lastHtml='';schedule()},
 'ox-open':function(t){
  var k=t.getAttribute('data-k'),go={coll:'#/receivables',inv:'#/inventory',rcv:'#/receivables'};
  if(go[k]){location.hash=go[k];return}
  S.oxOpen[k]=true;S.lastHtml='';schedule();setTimeout(function(){var e=document.getElementById('ox-'+k);if(e&&e.scrollIntoView)e.scrollIntoView({block:'start'})},60);
 }
});
/* tooltips: hover, focus or tap */
(function(){
  var tip=null;
  function el(){if(!tip){tip=document.createElement('div');tip.id='ox-tip';tip.setAttribute('role','tooltip');document.body.appendChild(tip)}return tip}
  function show(e){var t=e.target&&e.target.closest?e.target.closest('[data-tip]'):null,d=el();if(!t){d.style.display='none';return}d.textContent=t.getAttribute('data-tip');d.style.display='block';var r=t.getBoundingClientRect();d.style.left=Math.max(8,Math.min(innerWidth-270,r.left))+'px';d.style.top=Math.max(8,r.top-d.offsetHeight-8)+'px'}
  document.addEventListener('pointerover',show);document.addEventListener('focusin',show);document.addEventListener('click',show);document.addEventListener('focusout',function(){if(tip)tip.style.display='none'});
})();
