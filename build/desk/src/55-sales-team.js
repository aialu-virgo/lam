/* ================= v0.9 Sales, Team & Scorecard ================= */
S.dd={plant:'',sp:'',cust:''};S.cls='';S.drill=null;function scrollDrill(){setTimeout(function(){var e=document.getElementById('drillp');if(e&&e.scrollIntoView)e.scrollIntoView({block:'start',behavior:'smooth'})},250)}
S.team={who:''};S.docM='';
function needCust(ctx,ms){
  var key=ms.join(',')+'|'+DS.sig;
  if(!custLoaded(ms,ctx.plants)){if(S.custAsk!==key){S.custAsk=key;loadCust(ctx.plants,ms).then(function(){S.custAsk=null;S.lastHtml='';schedule()})}return false}
  return true;
}
function custFigs(code,A,P,ctx,incomplete){
  var a=A.get(code),p=P?P.get(code):null,an=a?a.n:0,pn=p?p.n:(P?0:null);
  var pset=a?new Set(Object.keys(a.plants)):(p?new Set(Object.keys(p.plants)):ctx.plants);
  var inc=incomplete||!monthsLoaded(ctx.res.curMonths,pset)||(ctx.res.prior?!monthsLoaded(ctx.res.priorMonths,pset):false);
  var q=P?qoqOf(an,pn,{incomplete:inc}):{state:'none'};
  return {A:an,P:pn,pot:null,tgt:null,var:null,ach:null,share:null,qoq:q,trend:null,sq:a?a.sq:0};
}
function pageSales(){
  var ctx=viewCtx();if(noData())return emptyData();
  var res=ctx.res,sc=ctx.sc,coord=sc.role==='Coordinator (sales / CRR)'||(sc.role==='HOD'&&norm(sc.dept)==='crr');
  var allM=res.curMonths.concat(res.priorMonths).concat(qMonths(prevQ(curQuarterKey())));
  var haveCust=needCust(ctx,Array.from(new Set(allM)));
  var h='';
  if(!coord){
    var tot=figs({},ctx),spl=salesKpis(ctx,tot,tot.series);
    var cards=[];
    cards.push(kpiCard({color:'indigo',chip:'₹',title:'K1 · Net sales · '+res.label,value:fmtMoney(tot.A),sub:'SAP invoices, internal transfers excluded.',status:statusOf(tot.ach),ach:tot.ach,mini:spl.mini,rows:[['Potential',tot.pot!=null?fmtMoney(tot.pot):'—'],['Target',tgtCell(tot)],['Var',tot.var!=null?fmtVarMoney(tot.var)+' · '+fmtPct(tot.varPct,true):'—'],['Ach %',fmtAch(tot.ach)],['Share of potential',(tot.share!=null?tot.share.toFixed(1)+'%':'—')+spl.shareChg],['Run-rate need vs now',spl.rr?fmtMoney(spl.rr.need)+' vs '+fmtMoney(spl.rr.now)+' /day':'—'],['QoQ %',qoqCell(tot.qoq)],['12-qtr trend',trendWord(tot)]]}));
    cards.push(qtyCard(ctx,tot));
    var A=haveCust?custAgg({plants:ctx.plants,sp:ctx.base.sp,group:ctx.base.group},res.cur):null,P=haveCust&&res.prior?custAgg({plants:ctx.plants,sp:ctx.base.sp,group:ctx.base.group},res.prior):null;
    var nA=A?Array.from(A.values()).filter(function(c){return c.n>0}).length:null,nP=P?Array.from(P.values()).filter(function(c){return c.n>0}).length:null;
    cards.push(kpiCard({color:'orange',chip:'☺',title:'Customers billed · '+res.label,value:nA==null?'…':fmtN(nA),sub:'Unique customers invoiced.',status:'none',pillTxt:'No plan',ach:null,rows:[['Addressable','pending rules'],['Target','No plan'],['Var','—'],['Ach %','—'],['Share of potential','—'],['Run-rate need vs now','—'],['QoQ %',nA!=null&&nP!=null?qoqCell(qoqOf(nA,nP,{incomplete:tot.incomplete})):'—'],['12-qtr trend','—']]}));
    var rl=tot.sh>0?tot.A/tot.sh:null,rlP=tot.Psh>0?tot.P/tot.Psh:null;
    cards.push(kpiCard({color:'green',chip:'%',title:'Realisation · ₹ per sheet',value:rl!=null?'₹ '+fmtN(Math.round(rl)):'—',sub:'Net sales ÷ sheets'+(tot.sq>0?' (₹ '+(tot.A/tot.sq).toFixed(1)+' per sq ft).':'.'),status:'none',pillTxt:'No plan',rows:[['Potential','n/a'],['Target','No plan'],['Var','—'],['Ach %','—'],['Share of potential','—'],['Run-rate need vs now','—'],['QoQ %',rl!=null&&rlP!=null?qoqCell(qoqOf(rl,rlP,{incomplete:tot.incomplete})):'—'],['12-qtr trend','—']]}));
    h+='<div class="kpirow">'+cards.join('')+'</div>';
    h+=trendCard('Quarters since '+qLabel(histStart())+' · Net sales'+(sc.sp?' (own)':''),{},ctx,undefined,'sl');
    h+=drillPanel(ctx);
    h+=classTiles(ctx,haveCust,tot);
    h+=leaderboard(ctx);
    h+=groupBars(ctx);
  }
  h+=drillDown(ctx,haveCust,coord);
  return h;
}
function classTiles(ctx,haveCust,tot){
  if(!haveCust)return '<section class="card"><div class="hd"><h2>Customer classes · A / B / C</h2></div><div class="note">Loading customer detail...</div></section>';
  var res=ctx.res,f={plants:ctx.plants,sp:ctx.base.sp,group:ctx.base.group},A=custAgg(f,res.cur),P=res.prior?custAgg(f,res.prior):null,cm=classMap();
  var priorLoaded=monthsLoaded(res.priorMonths,ctx.plants),total=0;A.forEach(function(c){total+=Math.max(0,c.n)});
  var groups={A:{n:0,a:0,p:0},B:{n:0,a:0,p:0},C:{n:0,a:0,p:0},N:{n:0,a:0,p:0}};
  A.forEach(function(c,code){var pv=P&&P.get(code)?P.get(code).n:0,isNew=priorLoaded&&P&&pv<=0&&c.n>0;var k=isNew?'N':(cm[code]||'C');groups[k].n++;groups[k].a+=c.n;groups[k].p+=pv});
  var tile=function(k,label,sub){var g=groups[k],qo=k==='N'?null:qoqOf(g.a,g.p,{incomplete:!priorLoaded||tot.incomplete});
    return '<button class="ctile t-'+k+'" data-act="cls" data-k="'+k+'" aria-pressed="'+(S.cls===k)+'"><b>'+label+'</b><small>'+sub+'</small><span class="big">'+fmtN(g.n)+' customers</span><span>Actual '+fmtMoney(g.a)+' · '+(total>0?(g.a/total*100).toFixed(1):'0.0')+'% of sales</span><span>Target: no customer-level plan</span><span>QoQ '+(k==='N'?'<span class="note">New, no prior quarter</span>':qoqCell(qo))+'</span></button>'};
  return '<section class="card"><div class="hd"><h2>Customer classes · A / B / C</h2><span class="note">Classes follow the last closed quarter ('+qLabel(prevQ(curQuarterKey()))+'): A = first '+CFG.abc_a+'% of sales, B = next '+CFG.abc_b+'%, C = the rest. New customers sit apart. Tap a tile to filter the customer table.</span></div><div class="ctiles">'+tile('A','A · top customers','first '+CFG.abc_a+'% of sales')+tile('B','B · middle','next '+CFG.abc_b+'%')+tile('C','C · long tail','last '+(100-CFG.abc_a-CFG.abc_b)+'%')+tile('N','New · no prior quarter','first sold this period')+'</div></section>';
}
function leaderboard(ctx){
  var sc=ctx.sc;if(sc.sp)return '';
  var sps=distinct('sp');if(!sps.length)return '';
  var rows=sps.map(function(sp){return {sp:sp,o:figs({sp:sp},ctx,{noTrend:true})}});
  var hasAch=rows.some(function(r){return r.o.ach!=null});
  rows.sort(function(a,b){return hasAch?((b.o.ach==null?-1:b.o.ach)-(a.o.ach==null?-1:a.o.ach)):b.o.A-a.o.A});
  var medal=['gold','silver','bronze'];
  return '<section class="card"><div class="hd"><h2>Salesperson leaderboard · by '+(hasAch?'Ach %':'actual')+'</h2></div><ol class="lb">'+rows.slice(0,10).map(function(r,i){return '<li><span class="medal '+(medal[i]||'')+'">'+(i+1)+'</span><b>'+esc(r.sp)+'</b><span class="note">'+(r.o.ach!=null?'Ach '+r.o.ach.toFixed(1)+'% · ':'')+fmtMoney(r.o.A)+' · QoQ '+qoqCell(r.o.qoq)+'</span></li>'}).join('')+'</ol><p class="note">Facts only. Disciplinary or incentive action on results is SP Sir\'s decision alone.</p></section>';
}
function groupBars(ctx){
  var gs=distinct('group');if(!gs.length)return '';
  var rows=gs.map(function(g){return {g:g,o:figs({group:g},ctx,{noTrend:true})}});var mx=Math.max.apply(null,rows.map(function(r){return Math.max(r.o.A,r.o.tgt||0,r.o.P||0)}).concat([1]));
  var pc=function(v){return Math.max(0,Math.min(100,v/mx*100))};
  return '<section class="card"><div class="hd"><h2>Sales by product group · '+esc(ctx.res.label)+'</h2></div><div class="hbars">'+rows.map(function(r){return '<div class="hb clk" data-act="ov-group" data-v="'+esc(r.g)+'" role="button" tabindex="0" title="Filter the page to '+esc(r.g)+'"><div class="hl">'+esc(r.g)+' ›</div><div class="ht"><i class="a" style="width:'+pc(r.o.A)+'%"></i>'+(r.o.tgt!=null?'<i class="pm" style="left:'+pc(r.o.tgt)+'%"></i>':'')+(r.o.P!=null?'<i class="pv" style="left:'+pc(r.o.P)+'%"></i>':'')+'</div><div class="hv">'+fmtMoney(r.o.A)+'</div></div>'}).join('')+'</div></section>';
}
function drillDown(ctx,haveCust,coord){
  var dd=S.dd,sc=ctx.sc,res=ctx.res,h='<section class="card"><div class="hd"><h2>Drill-down · branch → salesperson → customer → SAP document</h2></div>';
  /* breadcrumb */
  var cr='<div class="crumbs"><button class="chip" data-act="dd-up" data-l="0">All branches</button>';
  if(dd.plant)cr+=' › <button class="chip" data-act="dd-up" data-l="1">'+esc(plantShort(dd.plant))+'</button>';
  if(dd.sp)cr+=' › <button class="chip" data-act="dd-up" data-l="2">'+esc(dd.sp)+'</button>';
  if(dd.cust)cr+=' › <span class="chip on">'+esc(dd.cust)+'</span>';
  cr+='</div>';h+=cr;
  var q=(S.f.search||'').toLowerCase();
  if(coord||sc.sp){/* customer and document view only (coordinator) or own customers (sales executive) */
    if(dd.cust)return h+docBlock(ctx,haveCust)+'</section>';
    return h+custTable(ctx,haveCust,{plant:dd.plant||undefined,sp:sc.sp?undefined:undefined},coord)+'</section>';
  }
  if(!dd.plant){
    var rows=distinct('plant').filter(function(p){return plantInScope(sc,p)&&(!ctx.f.plant||p===ctx.f.plant)}).map(function(p){return {label:'<b>'+esc(plantShort(p))+'</b> ›',o:figs({plant:p},ctx),attrs:' data-act="dd" data-k="plant" data-v="'+esc(p)+'"'}}).filter(matchSearch);
    h+='<h3 class="lvl">Level 1 · Branch</h3>'+stdTable('Branch',rows,figs({},ctx))+tableNote(ctx,'Drill-down stops at the SAP document (decision D9).');
  }else if(!dd.sp){
    var sps=Object.keys(DS.spIdx).filter(function(sp){return sp&&spPlants(sp).indexOf(dd.plant)>=0});
    var rows2=sps.map(function(sp){return {label:'<b>'+esc(sp)+'</b> ›',o:figs({sp:sp,plant:dd.plant},ctx),attrs:' data-act="dd" data-k="sp" data-v="'+esc(sp)+'"'}}).filter(matchSearch);
    h+='<h3 class="lvl">Level 2 · Salesperson in '+esc(plantShort(dd.plant))+'</h3>'+(rows2.length?stdTable('Salesperson',rows2,figs({plant:dd.plant},ctx)):'<div class="empty sm">No salesperson recorded on the rows for this branch (S/4 rows carry none).</div>')+tableNote(ctx,'S/4 rows carry no salesperson; those periods show under the customer master\'s salesperson once a customer master is loaded.');
    h+='<div class="row"><button class="btn sm" data-act="dd" data-k="sp" data-v="*">Skip to customers of '+esc(plantShort(dd.plant))+'</button></div>';
  }else if(!dd.cust){
    h+='<h3 class="lvl">Level 3 · Customer</h3>'+custTable(ctx,haveCust,{plant:dd.plant,sp:dd.sp==='*'?undefined:dd.sp},false);
  }else h+=docBlock(ctx,haveCust);
  return h+'</section>';
}
function custTable(ctx,haveCust,ent,coord){
  if(!haveCust)return '<div class="note">Loading customer detail from the stored history...</div>';
  var res=ctx.res,f={plants:ctx.plants,plant:ent.plant,sp:ent.sp!==undefined?ent.sp:ctx.base.sp,group:ctx.base.group};
  var A=custAgg(f,res.cur),P=res.prior?custAgg(f,res.prior):null,cm=classMap(),rows=[];
  var codes=new Set();A.forEach(function(v,k){codes.add(k)});if(P)P.forEach(function(v,k){codes.add(k)});
  var priorLoaded=monthsLoaded(res.priorMonths,ctx.plants);
  codes.forEach(function(code){
    var a=A.get(code),p=P&&P.get(code),name=(a||p).name,o=custFigs(code,A,P,ctx,false);
    var isNew=priorLoaded&&P&&o.P===0&&o.A>0,cls=isNew?'N':(cm[code]||'C');
    if(S.cls&&S.cls!==cls)return;
    if(o.A<=0&&(o.P||0)<=0)return;
    rows.push({label:'<b>'+esc(code)+'</b> '+esc(name)+' <span class="pill mute">'+(isNew?'New':'class '+cls)+'</span> ›',o:o,attrs:' data-act="dd" data-k="cust" data-v="'+esc(code)+'"'});
  });
  var shown=rows.filter(matchSearch).sort(function(a,b){return b.o.A-a.o.A}).slice(0,400);
  var tot={A:0,P:P?0:null,qoq:{state:'none'}};rows.forEach(function(r){tot.A+=r.o.A;if(P)tot.P+=r.o.P||0});tot.qoq=P?qoqOf(tot.A,tot.P,{incomplete:!monthsLoaded(res.curMonths,ctx.plants)||!priorLoaded}):{state:'none'};tot.pot=null;tot.tgt=null;
  var h=(S.cls?'<div class="banner info"><span>Showing class '+(S.cls==='N'?'New':S.cls)+' customers.</span><button class="btn sm" data-act="cls" data-k="">Clear filter</button></div>':'');
  h+=stdTable('Customer',shown,tot,{noPlan:coord});
  return h+'<p class="note">Customers have no market potential or target, so those columns are "—". '+(coord?'Customer and document view only for your role. ':'')+'Showing the top '+shown.length+' of '+rows.length+' by actual. Tap a customer to see its SAP documents.</p>';
}
function docBlock(ctx,haveCust){
  var dd=S.dd,res=ctx.res,set={};res.curMonths.concat(res.priorMonths).forEach(function(m){if(S.cells['INV_'+m])set[m]=1});
  var ms=Object.keys(set).sort();if(!ms.length)ms=[TODAY().slice(0,7)];
  var withDocs=ms.filter(function(m){var A=custAgg({plants:ctx.plants,plant:dd.plant||undefined,sp:dd.sp&&dd.sp!=='*'?dd.sp:undefined},[m]).get(dd.cust);return A&&A.n>0});
  var m=S.docM&&ms.indexOf(S.docM)>=0?S.docM:(withDocs.length?withDocs[withDocs.length-1]:ms[ms.length-1]);
  var sel='<div class="row"><div class="fld"><label for="doc-m">Month</label><select id="doc-m" data-chg="docm">'+ms.map(function(x){return '<option value="'+x+'"'+(x===m?' selected':'')+'>'+ymLabel(x)+(withDocs.indexOf(x)>=0?' (has sales)':'')+'</option>'}).join('')+'</select></div></div>';
  return '<h3 class="lvl">Level 4 · SAP documents of '+esc(dd.cust)+'</h3>'+sel+docList(ctx,m,dd.cust,dd.plant||null);
}
Object.assign(handlers,{
 'ov-branch':function(t){S.dd={plant:t.getAttribute('data-v'),sp:'',cust:''};S.docs=null;S.lastHtml='';location.hash='#/sales';schedule()},
 'ov-group':function(t){S.f.group=t.getAttribute('data-v');S.dd={plant:'',sp:'',cust:''};S.lastHtml='';location.hash='#/sales';schedule()},
 'trend-q':function(t){S.drill={q:t.getAttribute('data-q'),m:null,sp:t.getAttribute('data-sp')||'',kind:t.getAttribute('data-kind')||'sales',pl:t.getAttribute('data-pl')||''};S.lastHtml='';S.docs=null;schedule();scrollDrill()},
 'drill-qonly':function(){S.drill.m=null;S.docs=null;S.lastHtml='';schedule()},
 'drill-m':function(t){S.drill.m=t.getAttribute('data-m');S.docs=null;S.lastHtml='';schedule();scrollDrill()},
 'drill-close':function(){S.drill=null;S.docs=null;S.lastHtml='';schedule()},
 'cls':function(t){S.cls=t.getAttribute('data-k');S.lastHtml='';schedule()},
 'dd':function(t){var k=t.getAttribute('data-k'),v=t.getAttribute('data-v');if(k==='plant'){S.dd={plant:v,sp:'',cust:''}}else if(k==='sp'){S.dd.sp=v;S.dd.cust=''}else S.dd.cust=v;S.docs=null;S.lastHtml='';schedule()},
 'dd-up':function(t){var l=+t.getAttribute('data-l');if(l===0)S.dd={plant:'',sp:'',cust:''};else if(l===1)S.dd={plant:S.dd.plant,sp:'',cust:''};else S.dd.cust='';S.docs=null;S.lastHtml='';schedule()}
});
document.addEventListener('change',function(ev){var t=ev.target;if(t.getAttribute&&t.getAttribute('data-chg')==='docm'){S.docM=t.value;S.docs=null;S.lastHtml='';schedule()}});

/* ================= Team & Scorecard ================= */
var ROLE_KPIS={
 'Super admin':['K24','K21','K17'],'Management / HO':['K1','K2','K3','K5','K6','K9','K10','K20','K23'],
 'HOD':null,'Branch / depot manager':['K1','K2','K3','K4','K7','K8','K9','K10','K14','K15','K23','K25'],'Sales executive':['K1','K2','K3','K4','K7','K8'],
 'Coordinator (sales / CRR)':['K12','K13','K14','K22'],'Accounts':['K9','K10','K11'],'Plant':['K12','K13','K14','K15','K16']};
var DEPT_KPIS={Sales:['K1','K3','K8'],CRR:['K12','K13','K14'],Accounts:['K9','K10','K11'],Plant:['K12','K15','K16'],HO:['K1','K3']};
var COMMON=['K17','K18','K19'];
function kpiIdsFor(u){var base=u.role==='HOD'?(DEPT_KPIS[u.department]||DEPT_KPIS.Sales).concat(['K17','K19','K20','K25']):(ROLE_KPIS[u.role]||[]).slice();COMMON.forEach(function(k){if(base.indexOf(k)<0)base.push(k)});return base}
function spKeyOf(u){var cands=[norm(u.sales_employee_code),norm(u.name)].filter(Boolean);var mc=SM.byCode[norm(u.sales_employee_code)];if(mc)cands.push(norm(mc.name));var keys=Object.keys(DS.spIdx);for(var i=0;i<keys.length;i++)if(cands.indexOf(norm(keys[i]))>=0)return keys[i];return null}
function userFilter(u,ctx){
  if(u.role==='Sales executive'){var k=spKeyOf(u);return k?{sp:k}:null}
  var c=codesOf(u);return c.length?{plants:new Set(c)}:{};
}
function quarterOf(iso){return iso?qKeyOfYm(iso.slice(0,7)):''}
function actionStats(u,q){
  var mine=S.actions.filter(function(a){return a.owner===u.email}),inQ=function(a,k){return quarterOf((a[k]||'').slice(0,10))===q};
  var done=mine.filter(function(a){return a.done_at&&inQ(a,'done_at')});var onTime=done.filter(function(a){return a.done_at.slice(0,10)<=a.due});
  var assigned=mine.filter(function(a){return inQ(a,'created')}),quick=assigned.filter(function(a){var e=(a.thread||[]).find(function(x){return x.by===u.email&&['ack','update','done','help','reassign_req','blocked'].indexOf(x.kind)>=0});return e&&e.at.slice(0,10)<=addWD(a.created.slice(0,10),1)});
  var esc2=S.followups.filter(function(f){var a=S.actions.find(function(x){return x.id===f.action_id});return a&&a.owner===u.email&&(f.step==='L2'||f.step==='L3')&&quarterOf(f.created_day)===q});
  var drafts=S.followups.filter(function(f){return (f.sender===u.email)&&quarterOf(f.created_day)===q}),sentOk=drafts.filter(function(f){return f.status==='Sent'&&diffDays((f.sent_at||'').slice(0,10),f.created_day)<=1});
  var owed=S.actions.filter(function(a){return a.assigner===u.email&&a.done_at&&inQ(a,'done_at')}),verOk=owed.filter(function(a){return a.verified_at&&wdBetween(a.done_at.slice(0,10),a.verified_at.slice(0,10))-1<=3});
  var ups=S.uploads.filter(function(x){return x.by===u.email&&quarterOf((x.at||'').slice(0,10))===q}),rd=ups.reduce(function(a,x){return a+(x.read||0)},0),rj=ups.reduce(function(a,x){return a+(x.rejected||0)},0);
  var overdue=mine.filter(function(a){return OPEN_ST.indexOf(a.status)>=0&&diffDays(a.due,TODAY())<0}).length;
  return {done:done.length,onTime:onTime.length,assigned:assigned.length,quick:quick.length,esc:esc2.length,drafts:drafts.length,sentOk:sentOk.length,owed:owed.length,verOk:verOk.length,rd:rd,rj:rj,overdue:overdue,ups:ups.length};
}
function pct(a,b){return b>0?a/b*100:null}
function kpiCompute(id,u,ctx){
  var f=userFilter(u,ctx),q=ctx.res.q||curQuarterKey(),pq=prevQ(q),cur=actionStats(u,q),prv=actionStats(u,pq);
  var K={id:id};
  var sales=function(){if(f==null)return null;return figs(f,ctx)};
  switch(id){
   case 'K1':{var o=sales();Object.assign(K,{name:'Sales achievement %',kind:'pct',actual:o&&o.ach,plan:o&&o.tgt!=null?100:null,last:null,qoq:o&&o.qoq,detail:o&&('Actual '+fmtMoney(o.A)+(o.tgt!=null?' vs target '+fmtMoney(o.tgt):'')),none:!o||o.tgt==null,hint:o?undefined:'No sales rows matched this person'});break}
   case 'K2':{var o2=sales();Object.assign(K,{name:'Share of potential %',kind:'pct',actual:o2&&o2.share,plan:null,qoq:o2&&o2.qoq,detail:o2&&o2.pot!=null?'Potential '+fmtMoney(o2.pot):'No potential entered',none:true});break}
   case 'K3':{var o3=sales();Object.assign(K,{name:'QoQ growth %',kind:'pct',actual:o3&&o3.qoq&&o3.qoq.state==='ok'?o3.qoq.v:null,plan:null,qoq:o3&&o3.qoq,detail:o3&&o3.P!=null?'vs '+fmtMoney(o3.P):'',none:true,txtOnly:o3&&o3.qoq&&o3.qoq.state!=='ok'?o3.qoq.txt:null});break}
   case 'K4':{var o4=sales();var rr=o4?runRate(ctx,o4,f):null;Object.assign(K,{name:'Run-rate, required vs current',kind:'text',text:rr?fmtMoney(rr.need)+' needed vs '+fmtMoney(rr.now)+' /day':'—',none:true});break}
   case 'K5':{var o5=sales();Object.assign(K,{name:'Trend direction',kind:'text',text:o5&&o5.trend?(o5.trend.short?'history too short':arrow(o5.trend.dir)):'—',none:true});break}
   case 'K6':{var n=0,tot=0;GROUPS.forEach(function(g){DS.plants.forEach(function(p){if(f&&f.plants&&!f.plants.has(p))return;var P=planQ({plant:p,group:g},q);if(!P.nLeaf)return;tot++;var ser=quarterSeries({plant:p,group:g},undefined),ts=trendStats(ser.filter(function(s){return !s.isCur}).map(function(s){return s.A})),pa=ser[ser.length-2];if(pa&&stretchOf(P.tgt,pa.A,ts).state==='stretch')n++})});Object.assign(K,{name:'Stretch targets',kind:'n',actual:n,plan:null,detail:'of '+tot+' plant × group targets',none:true});break}
   case 'K7':Object.assign(K,{name:'New customers',kind:'text',text:'Pending: needs the customer first-seen index',none:true,pending:true});break;
   case 'K8':{var ok=custLoaded(ctx.res.curMonths.concat(ctx.res.priorMonths),ctx.plants);var cnt=null;if(ok&&f){var A=custAgg(Object.assign({plants:ctx.plants},f),ctx.res.cur),P=custAgg(Object.assign({plants:ctx.plants},f),ctx.res.prior||[]),cm=classMap();cnt=0;P.forEach(function(p,code){var c=cm[code]||'C';if(c==='C'||p.n<CFG.qoq_min_base_inr)return;var a=A.get(code),av=a?a.n:0;if((av-p.n)/p.n*100<=CFG.qoq_decline_pct)cnt++})}Object.assign(K,{name:'Class A/B customers in decline',kind:'n',actual:cnt,plan:0,lower:true,detail:cnt==null?'Open Sales once to load customer detail':'',none:cnt==null});break}
   case 'K9':{var co=collectionFigs(ctx,f&&f.plants);Object.assign(K,{name:'Collection achievement %',kind:'pct',actual:co.ach,plan:co.plan>0?100:null,detail:co.detail,none:co.plan<=0,pending:!co.have});break}
   case 'K10':{var rv=recvStats(f&&f.plants);Object.assign(K,{name:'Overdue share %',kind:'pct',actual:rv.have?rv.overShare:null,plan:15,lower:true,detail:rv.have?'':'Needs the receivable export',pending:!rv.have});break}
   case 'K11':{var rv2=recvStats(f&&f.plants);Object.assign(K,{name:'Ageing profile (0–30 / 31–60 / 61–90 / 90+)',kind:'text',text:rv2.have?rv2.buckets.map(function(b){return fmtMoney(b)}).join(' / '):'—',none:true,pending:!rv2.have});break}
   case 'K12':case 'K13':case 'K14':{var od=orderStats(f&&f.plants);var map={K12:['On-time dispatch %','pct',od.have?od.onTime:null,90,false],K13:['Order-to-dispatch days','days',od.have?od.o2d:null,CFG.tat_days,true],K14:['Open orders beyond TAT','n',od.have?od.late:null,0,true]};var m=map[id];Object.assign(K,{name:m[0],kind:m[1],actual:m[2],plan:m[3],lower:m[4],pending:!od.have,detail:od.have?'':'Needs the sales order and delivery exports'});break}
   case 'K15':case 'K16':{var st=stockStats(f&&f.plants);var m2=id==='K15'?['Stock days','days',st.have?st.days:null,CFG.stock_days_target,true]:['Aged stock %','pct',st.have?st.agedPct:null,10,true];Object.assign(K,{name:m2[0],kind:m2[1],actual:m2[2],plan:m2[3],lower:m2[4],pending:!st.have,detail:st.have?'':'Needs the stock export'});break}
   case 'K17':Object.assign(K,{name:'On-time closure %',kind:'pct',actual:pct(cur.onTime,cur.done),plan:90,last:pct(prv.onTime,prv.done),detail:cur.onTime+' of '+cur.done+' on time'});break;
   case 'K18':Object.assign(K,{name:'Response within 1 day %',kind:'pct',actual:pct(cur.quick,cur.assigned),plan:90,last:pct(prv.quick,prv.assigned),detail:cur.quick+' of '+cur.assigned+' assigned'});break;
   case 'K19':Object.assign(K,{name:'Overdue open actions',kind:'n',actual:cur.overdue,plan:0,lower:true,last:null,detail:'now'});break;
   case 'K20':Object.assign(K,{name:'Escalations reached (L2 or L3)',kind:'n',actual:cur.esc,plan:0,lower:true,last:prv.esc});break;
   case 'K21':Object.assign(K,{name:'Data errors %',kind:'pct',actual:cur.rd>0?cur.rj/cur.rd*100:(cur.ups?0:null),plan:1,lower:true,last:prv.rd>0?prv.rj/prv.rd*100:null,detail:cur.ups+' uploads in the quarter'});break;
   case 'K22':Object.assign(K,{name:'Follow-ups sent on time %',kind:'pct',actual:pct(cur.sentOk,cur.drafts),plan:90,last:pct(prv.sentOk,prv.drafts),detail:cur.sentOk+' of '+cur.drafts+' drafts'});break;
   case 'K23':{var leaves=S.potential.filter(function(x){return x.fy_quarter===q&&(!f||!f.plants||f.plants.has(x.plant_code))}),qs0=qMonths(q)[0]+'-01',okn=leaves.filter(function(x){var a=approvedOf(x);return a&&(!x.approved||!x.approved.at||x.approved.at.slice(0,10)<=qs0)}).length;Object.assign(K,{name:'Plans on time %',kind:'pct',actual:leaves.length?okn/leaves.length*100:null,plan:100,detail:okn+' of '+leaves.length+' leaves approved before the quarter'});break}
   case 'K24':{var okc=0,tot2=0;closedQuarters().forEach(function(k){tot2++;if(covStatus('INV',k).st==='ok')okc++});Object.assign(K,{name:'History coverage %',kind:'pct',actual:okc/tot2*100,plan:100,detail:okc+' of '+tot2+' quarters loaded (invoice)'});break}
   case 'K25':Object.assign(K,{name:'Closures verified in 3 days %',kind:'pct',actual:pct(cur.verOk,cur.owed),plan:90,last:pct(prv.verOk,prv.owed),detail:cur.verOk+' of '+cur.owed});break;
  }
  if(K.pending&&K.kind!=='text'){K.actual=null}
  /* achievement and status */
  if(K.plan!=null&&K.actual!=null&&K.kind!=='text'){
    if(K.lower){K.ach=K.plan>0?K.actual/K.plan*100:(K.actual<=0?100:200);K.status=K.plan>0?statusOf(K.ach,true):(K.actual<=K.plan?'green':K.actual<=1?'orange':'red')}
    else{K.ach=K.plan>0?K.actual/K.plan*100:null;K.status=statusOf(K.ach)}
  }else K.status=K.none||K.kind==='text'?'none':'none';
  if(id==='K1'&&K.actual!=null){K.status=statusOf(K.actual)}
  return K;
}
function fmtK(K,v){
  if(v==null)return '—';
  if(K.kind==='pct')return v.toFixed(1)+'%';if(K.kind==='days')return v.toFixed(1)+' d';if(K.kind==='n')return fmtN(Math.round(v));return String(v);
}
function kpiTable(u,ctx){
  var ids=kpiIdsFor(u);
  var rows=ids.map(function(id){return kpiCompute(id,u,ctx)});
  var on=rows.filter(function(k){return k.status==='green'}).length,scored=rows.filter(function(k){return k.status!=='none'}).length;
  var qlast=prevQ(ctx.res.q||curQuarterKey());
  var h='<div class="tw"><table class="std"><thead><tr><th>KPI</th><th class="num">Plan</th><th class="num">Actual</th><th class="num">Var</th><th class="num">Ach %</th><th class="num">Last Qtr</th><th class="num">QoQ</th><th>Status</th></tr></thead><tbody>'
   +rows.map(function(K){
     if(K.kind==='text')return '<tr><td><b>'+K.id+'</b> '+esc(K.name)+'</td><td class="num">—</td><td colspan="4">'+esc(K.text||'—')+'</td><td class="num">—</td><td>'+(K.pending?statusPill('pending','Pending'):'<span class="pill mute">Info</span>')+'</td></tr>';
     var varv=(K.plan!=null&&K.actual!=null)?K.actual-K.plan:null;
     var qoq='—';
     if(K.id==='K1'||K.id==='K2'||K.id==='K3')qoq=qoqCell(K.qoq);
     else if(K.last!=null&&K.actual!=null){var d=K.actual-K.last;qoq=K.kind==='pct'?'<span class="'+(d>=0?'up':'dn')+'">'+(d>=0?'+':'−')+Math.abs(d).toFixed(1)+' pts</span>':(K.last>0?qoqCell(qoqOf(K.actual,K.last,{})):(d===0?'0':(d>0?'+':'−')+Math.abs(d)))}
     return '<tr><td><b>'+K.id+'</b> '+esc(K.name)+(K.detail?'<div class="note">'+esc(K.detail)+'</div>':'')+'</td><td class="num">'+(K.plan!=null?fmtK(K,K.plan):'<span class="pill mute">No plan</span>')+'</td><td class="num">'+(K.txtOnly?'<span class="note">'+esc(K.txtOnly)+'</span>':K.pending?'—':fmtK(K,K.actual))+'</td><td class="num">'+(varv!=null?(varv>=0?'+':'−')+fmtK(K,Math.abs(varv)):'—')+'</td><td class="num">'+(K.ach!=null?fmtAch(K.ach,K.lower):'—')+'</td><td class="num">'+(K.last!=null?fmtK(K,K.last):'—')+'</td><td class="num">'+qoq+'</td><td>'+(K.pending?statusPill('pending','Pending'):statusPill(K.status))+'</td></tr>'}).join('')+'</tbody></table></div>';
  return {html:h,on:on,scored:scored,total:rows.length};
}
function teamPeople(u){
  var users=activeUsers();
  if(u.role==='Super admin'||u.role==='Management / HO')return users;
  if(u.role==='HOD')return users.filter(function(x){return norm(x.department)===norm(u.department)});
  if(u.role==='Branch / depot manager'){var sc=scopeOf(u);return users.filter(function(x){if(x.email===u.email)return true;var c=codesOf(x);return c.some(function(p){return sc.plants&&sc.plants.has(p)})})}
  return users.filter(function(x){return x.email===u.email});
}
function pageTeam(){
  var ctx=viewCtx(),u=effUser(),people=teamPeople(u).sort(function(a,b){return a.role<b.role?-1:a.role>b.role?1:a.name<b.name?-1:1});
  var q=(S.f.search||'').toLowerCase();people=people.filter(function(p){return !q||(p.name+' '+p.role).toLowerCase().indexOf(q)>=0});var allPeople=people.length;people=people.slice(0,60);
  var who=S.team.who&&people.find(function(p){return p.email===S.team.who})?S.team.who:(u.role==='Sales executive'||people.length===1?people[0]&&people[0].email:'');
  /* make sure customer detail is loaded for K8 */
  if(!noData())needCust(ctx,Array.from(new Set(ctx.res.curMonths.concat(ctx.res.priorMonths).concat(qMonths(prevQ(curQuarterKey()))))));
  var h='<section class="card"><div class="hd"><h2>Team · KRA / KPI plan vs actual</h2><span class="note">'+(u.role==='Sales executive'?'Your own scorecard.':u.role==='Branch / depot manager'?'Your own team.':u.role==='HOD'?'Your department.':'All people.')+'</span></div>'
   +'<div class="tw"><table><thead><tr><th>Person</th><th>Role</th><th>Dept</th><th class="num">KPIs on plan</th><th class="num">On-time closure</th><th class="num">Overdue actions</th><th></th></tr></thead><tbody>'
   +people.map(function(p){var kt=kpiTable(p,ctx),as=actionStats(p,ctx.res.q||curQuarterKey());return '<tr class="clk'+(who===p.email?' sel':'')+'" data-act="team-who" data-e="'+esc(p.email)+'"><td><b>'+esc(p.name)+'</b></td><td>'+esc(p.role)+'</td><td>'+esc(p.department)+'</td><td class="num">'+kt.on+' of '+kt.scored+' scored · '+kt.total+' KPIs</td><td class="num">'+(as.done?fmtPct(as.onTime/as.done*100):'—')+'</td><td class="num">'+as.overdue+'</td><td>›</td></tr>'}).join('')+'</tbody></table></div><p class="note">'+(allPeople>people.length?'Showing the first '+people.length+' of '+allPeople+' people. Use Search to find someone. ':'')+'The scorecard informs. It shows no composite score and no ranking label; disciplinary or incentive action on results is SP Sir\'s decision alone. A KPI whose plan is missing shows "No plan" and is never scored zero.</p></section>';
  h+=teamSalespeople(ctx,u);
  if(who){
    var p=people.find(function(x){return x.email===who}),kt2=kpiTable(p,ctx);
    h+='<section class="card"><div class="hd"><h2>Scorecard · '+esc(p.name)+' · '+esc(p.role)+'</h2><span class="note">'+kt2.on+' of '+kt2.scored+' scored KPIs on plan · '+esc(ctx.res.label)+'</span></div>'+kt2.html+'</section>';
    var f=userFilter(p,ctx);
    h+=personTrend(p,f,ctx);
  }else h+='<div class="note">Tap a person to see the scorecard and the quarter trend since '+qLabel(histStart())+'.</div>';
  return h;
}
Object.assign(handlers,{'team-who':function(t){S.team.who=t.getAttribute('data-e');S.lastHtml='';schedule()}});

/* the quarter trend since '+qLabel(histStart())+' card of a person's scorecard: primary KPI per kra-kpi.md */
function personTrend(p,f,ctx){
  if(p.role==='Accounts'){
    var pl=f&&f.plants?f.plants:SC().plants;
    if(!collAvailable(pl))return '<section class="card"><div class="hd"><h2>Quarters since '+qLabel(histStart())+' · Collections · '+esc(p.name)+'</h2></div>'+needPanel(['coll'],'No collection history is loaded, so the Accounts scorecard has no trend yet.')+'</section>';
    return trendCard('Quarters since '+qLabel(histStart())+' · Collections · '+p.name,{plants:pl},ctx,undefined,'tm',{series:collSeries(pl),kind:'coll'})+drillPanel(ctx);
  }
  if(noData())return '<section class="card"><div class="hd"><h2>Quarters since '+qLabel(histStart())+' · Net sales · '+esc(p.name)+'</h2></div>'+emptyData('No sales history is loaded in your scope.')+'</section>';
  if(f==null)return '<section class="card"><div class="hd"><h2>Quarters since '+qLabel(histStart())+' · Net sales · '+esc(p.name)+'</h2></div><div class="empty sm">No sales rows match this person\'s sales employee code ('+esc(p.sales_employee_code||'blank')+'). It must equal the salesperson name in the SAP export.</div></section>';
  return trendCard('Quarters since '+qLabel(histStart())+' · Net sales · '+p.name,f.sp!=null?{}:f,ctx,f.sp!=null?f.sp:undefined,'tm')+(p.role==='Plant'||p.role==='Coordinator (sales / CRR)'?'<p class="note">Primary KPI shown is the plant\'s net sales: dispatch history (sales order and delivery exports) is not loaded yet, so there is no 12-quarter dispatch series.</p>':'')+drillPanel(ctx);
}

/* salespeople from the sales-employee master that match the B1 names: scorecards for people who are not Desk users */
function teamSalespeople(ctx,u){
  if(u.role==='Sales executive'||!SM.ready||noData())return '';
  var sc=SC(),list=[];
  Object.keys(DS.spIdx).filter(Boolean).forEach(function(k){var m=spMeta(k);if(!m)return;if(sc.plants&&m.plant&&!sc.plants.has(m.plant))return;list.push({k:k,m:m})});
  var q=(S.f.search||'').toLowerCase();list=list.filter(function(x){return !q||(x.k+' '+x.m.zone+' '+x.m.plant).toLowerCase().indexOf(q)>=0});
  if(!list.length)return '<section class="card"><div class="hd"><h2>Salespeople from the sales-employee master</h2></div><div class="empty sm">No salesperson in your scope matches the master yet. Match rate is in Admin › Sales employees.</div></section>';
  var rows=list.map(function(x){return {x:x,o:figs({sp:x.k},ctx,{noTrend:true})}}).sort(function(a,b){return (b.o.A)-(a.o.A)}).slice(0,60);
  var h='<section class="card"><div class="hd"><h2>Salespeople · linked to branch and zone by the master · '+esc(ctx.res.label)+'</h2><span class="note">'+list.length+' matched'+(list.length>60?' (top 60 by actual shown)':'')+'</span></div><div class="tw tall"><table class="std"><thead><tr><th>Person</th><th>Zone</th><th>Branch</th><th>Designation</th><th class="num">Actual</th><th class="num">Ach %</th><th class="num">QoQ %</th></tr></thead><tbody>'
   +rows.map(function(r){return '<tr class="clk'+(S.team.sp===r.x.k?' sel':'')+'" data-act="team-sp" data-k="'+esc(r.x.k)+'"><td><b>'+esc(r.x.k)+'</b> <span class="note mono">'+esc(r.x.m.code)+'</span></td><td>'+esc(r.x.m.zone||'—')+'</td><td>'+esc(r.x.m.plant?plantShort(r.x.m.plant):(r.x.m.plantRaw||'—'))+'</td><td>'+esc(r.x.m.designation||'—')+'</td><td class="num">'+fmtMoney(r.o.A)+'</td><td class="num">'+fmtAch(r.o.ach)+'</td><td class="num">'+qoqCell(r.o.qoq)+'</td></tr>'}).join('')+'</tbody></table></div><p class="note">Names match the master exactly or after removing the " - &lt;branch&gt;" suffix. Facts only; no ranking label.</p>';
  if(S.team.sp&&list.some(function(x){return x.k===S.team.sp})){
    var m=spMeta(S.team.sp),p={name:S.team.sp,email:'',role:'Sales executive',department:'Sales',sales_employee_code:m.code,plant_codes:m.plant||''},kt=kpiTable(p,ctx);
    h+='<div class="hd"><h2>Scorecard · '+esc(p.name)+' · '+esc(m.zone||'')+' · '+esc(m.plant?plantName(m.plant):(m.plantRaw||''))+'</h2><span class="note">'+kt.on+' of '+kt.scored+' scored KPIs on plan</span></div>'+kt.html+trendCard('Quarters since '+qLabel(histStart())+' · Net sales · '+p.name,{},ctx,S.team.sp,'tp')+drillPanel(ctx);
  }
  return h+'</section>';
}
Object.assign(handlers,{'team-sp':function(t){S.team.sp=t.getAttribute('data-k');S.team.who='';S.lastHtml='';schedule()}});
