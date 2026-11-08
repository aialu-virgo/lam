/* ================= v0.9 Receivables, Inventory (open-item stores; Orders & Dispatch removed, D31) ================= */
/* No export for these yet: the stores stay empty until the exports are wired. Pages then show the dashed empty state naming the export. */
var NEED={
 recv:{name:'Receivable export',how:'SAP B1 open OINV + JDT1 (DocDueDate, DocTotal, PaidToDate) · S/4 ACDOCA / BSID (I_OperationalAcctgDocItem)',file:'data-map/receivable.md'},
 coll:{name:'Collection export',how:'SAP B1 ORCT (DocNum, DocDate, CardCode, DocTotal) · S/4 ACDOCA incoming payment (DZ)',file:'data-map/collection.md'},
 stock:{name:'Stock export',how:'SAP B1 OITW (ItemCode, WhsCode, OnHand) · S/4 MARD / MATDOC (API_MATERIAL_STOCK_SRV)',file:'data-map/stock.md'}};
function needPanel(keys,intro){
  return '<div class="empty dashed"><b>'+esc(intro)+'</b>'+keys.map(function(k){var n=NEED[k];return '<div class="needrow"><b>'+esc(n.name)+' needed</b><div class="note">'+esc(n.how)+'</div><div class="note mono">'+esc(n.file)+'</div></div>'}).join('')+'<div class="note">Intake for this export is not built yet (invoice history only). Nothing here is a zero: it is simply not loaded. Load demo data in Data Intake to see the page filled.</div></div>';
}
function canEditPlan(u){return u&&['Super admin','Management / HO','HOD','Branch / depot manager'].indexOf(u.role)>=0}
function inScopeDocs(list,ctx){return list.filter(function(d){return plantInScope(ctx.sc,d.plant)&&(!ctx.f.plant||d.plant===ctx.f.plant)})}
function plantSet(plants){return plants instanceof Set?plants:null}

/* ---- statistics shared with the scorecard ---- */
function recvItems(plants){var sc=SC(),out=[];S.recv.forEach(function(d){if(!plantInScope(sc,d.plant)||(plants&&!plants.has(d.plant)))return;d.rows.forEach(function(r){out.push({plant:d.plant,inv:r[0],cust:r[1],name:r[2],due:r[3],open:r[4],total:r[5]})})});return out}
function recvStats(plants){
  var it=recvItems(plants);if(!it.length)return {have:false,buckets:[0,0,0,0],notDue:0,total:0,overShare:null};
  var t=S.recvAsOf||TODAY(),b=[0,0,0,0],nd=0,tot=0,over=0;
  it.forEach(function(x){var od=diffDays(t,x.due);tot+=x.open;if(od<=0){nd+=x.open;return}if(od<=30)b[0]+=x.open;else if(od<=60)b[1]+=x.open;else if(od<=90)b[2]+=x.open;else b[3]+=x.open;if(od>CFG.overdue_share_days)over+=x.open});
  return {have:true,buckets:b,notDue:nd,total:tot,overShare:tot>0?over/tot*100:null,items:it};
}
function stockStats(plants){
  var sc=SC(),ds=S.stock.filter(function(d){return plantInScope(sc,d.plant)&&(!plants||plants.has(d.plant))});if(!ds.length)return {have:false};
  var onh=0,aged=0,ageBase=0,daysNum=0,daysDen=0,asOf=S.stockAsOf||'';
  ds.forEach(function(d){d.rows.forEach(function(r){onh+=r[1];if(d.hasAge&&r[3]){aged+=r[2];ageBase+=r[3].reduce(function(a,b){return a+b},0)}var sd=stockDays(d.plant,r[0],r[1],d.asOn);if(sd!=null){daysNum+=sd*r[1];daysDen+=r[1]}})});
  return {have:true,onHand:onh,aged:aged,agedPct:ageBase>0?aged/ageBase*100:null,hasAge:ageBase>0,days:daysDen>0?daysNum/daysDen:null};
}
function collMonths(plants,ms){
  var sc=SC(),rec=0,plan=0,have=false,planHave=false,planDefault=false;
  ms.forEach(function(x){
    var ym=x.ym,fr=x.frac;
    S.coll.forEach(function(d){if(d.ym!==ym||!plantInScope(sc,d.plant)||(plants&&!plants.has(d.plant)))return;have=true;rec+=d.total*fr;if(d.plan!=null){plan+=d.plan*fr;planHave=true}else{var due=0;recvItems(new Set([d.plant])).forEach(function(i){if(i.due.slice(0,7)===ym)due+=i.open});if(due>0){plan+=due*fr;planHave=true;planDefault=true}}});
  });
  return {rec:rec,plan:plan,have:have,planHave:planHave,planDefault:planDefault};
}
function collectionFigs(ctx,plants){
  plants=plants===undefined?ctx.plants:plants;var res=ctx.res;
  var cur=collMonths(plants,res.cur),pr=res.prior?collMonths(plants,res.prior):null;
  var qs=closedQuarters().concat([curQuarterKey()]),series=qs.map(function(q){var c=collMonths(plants,wins(qMonths(q)));return c.have?c.rec:null});
  var ach=cur.have&&cur.planHave&&cur.plan>0?cur.rec/cur.plan*100:null;
  var out={have:cur.have,ach:ach,plan:cur.planHave?cur.plan:0,detail:cur.have?'Receipts '+fmtMoney(cur.rec)+(cur.planHave?' of plan '+fmtMoney(cur.plan):''):'',cur:cur,pr:pr};
  if(!cur.have){out.card=kpiCard({color:'green',chip:'↧',title:'K9 · Collections · '+res.label,value:'—',sub:'Receipts against open invoices.',pending:true,pendingTxt:'Not loaded',pendingMsg:'Needs the '+NEED.coll.name+' ('+NEED.coll.file+'). Not a zero.',rows:[['Collectable (due)','pending rules'],['Target','No plan'],['Var','—'],['Ach %','—'],['Share of potential','—'],['Run-rate need vs now','—'],['QoQ %','—'],['12-qtr trend','—']]});return out}
  var inc=!res.curMonths.length;var q=pr?qoqOf(cur.rec,pr.rec,{incomplete:inc||!pr.have}):{state:'none'};
  var ts=trendStats(series.slice(0,12));
  out.card=kpiCard({color:'green',chip:'↧',title:'K9 · Collections · '+res.label,value:fmtMoney(cur.rec),sub:'Receipts against open invoices.'+(cur.planDefault?' Plan is the default: invoices falling due in the month.':''),status:statusOf(ach),ach:ach,mini:series,
    rows:[['Collectable (due)','pending rules'],['Target',cur.planHave?fmtMoney(cur.plan):'<span class="pill mute">No plan</span>'],['Var',cur.planHave?fmtVarMoney(cur.rec-cur.plan)+' · '+fmtPct((cur.rec-cur.plan)/cur.plan*100,true):'—'],['Ach %',fmtAch(ach)],['Share of potential','—'],['Run-rate need vs now','—'],['QoQ %',qoqCell(q)],['12-qtr trend',ts.short?'history too short':arrow(ts.dir)]]});
  return out;
}

/* ---- Orders & Dispatch ---- */
/* ---- Receivables ---- */
function pageReceivables(){
  var ctx=viewCtx(),rs=inScopeDocs(S.recv,ctx),cs=inScopeDocs(S.coll,ctx);
  if(!rs.length&&!cs.length)return needPanel(['recv','coll'],'No receivables or collections are loaded.');
  var plants=ctx.f.plant?new Set([ctx.f.plant]):ctx.plants,st=recvStats(plants),col=collectionFigs(ctx,plants),res=ctx.res;
  var h='';
  if(st.have){
    var names=['0–30','31–60','61–90','90+'],cols=['green','orange','red','red'];
    var cards=[kpiCard({color:'indigo',chip:'₹',title:'Open receivables',value:fmtMoney(st.total),sub:fmtMoney(st.notDue)+' not yet due',status:'none',pillTxt:'No plan',rows:[['Plan','—'],['Var','—'],['Ach %','—'],['Last Qtr','no prior snapshot'],['QoQ %','—'],['12-qtr trend','—']]}),
     kpiCard({color:'orange',chip:'%',title:'K10 · Overdue share (over '+CFG.overdue_share_days+' days)',value:st.overShare!=null?st.overShare.toFixed(1)+'%':'—',sub:'Open receivables more than '+CFG.overdue_share_days+' days past due ÷ total open.',status:st.overShare==null?'none':statusOf(achLower(st.overShare,15).ach),ach:st.overShare!=null?Math.min(100,achLower(st.overShare,15).ach):null,rows:[['Plan','15% (Assumed)'],['Var',st.overShare!=null?(st.overShare-15>=0?'+':'−')+Math.abs(st.overShare-15).toFixed(1)+' pts':'—'],['Ach %',st.overShare!=null?fmtAchLower(achLower(st.overShare,15)):'—'],['Last Qtr','no prior snapshot'],['QoQ %','—'],['12-qtr trend','—']]}),col.card];
    h+='<div class="kpirow">'+cards.join('')+'</div>';
    h+='<section class="card"><div class="hd"><h2>Ageing · days past due</h2></div><div class="ctiles">'+names.map(function(n,i){return '<div class="ctile t-'+['A','B','C','C'][i]+'"><b>'+n+' days</b><span class="big">'+fmtMoney(st.buckets[i])+'</span><span>'+(st.total>0?(st.buckets[i]/st.total*100).toFixed(1):'0.0')+'% of open</span></div>'}).join('')+'</div></section>';
    var by={};st.items.forEach(function(x){var od=diffDays(S.recvAsOf||TODAY(),x.due);if(od<=0)return;var k=x.plant+'|'+x.cust,o=by[k]||(by[k]={plant:x.plant,cust:x.cust,name:x.name,b:[0,0,0,0],total:0,oldest:0});var bi=od<=30?0:od<=60?1:od<=90?2:3;o.b[bi]+=x.open;o.total+=x.open;o.oldest=Math.max(o.oldest,od)});
    var rows=Object.keys(by).map(function(k){return by[k]}).filter(function(o){var q=(S.f.search||'').toLowerCase();return !q||(o.cust+o.name).toLowerCase().indexOf(q)>=0}).sort(function(a,b){return b.total-a.total}).slice(0,60);
    h+='<section class="card"><div class="hd"><h2>Overdue by customer</h2><span class="note">Source: open invoice items (SAP B1 OINV / S/4 BSID). Rule R2 raises an action at '+CFG.rcv_days+' days and '+fmtMoney(CFG.rcv_min_inr)+'.</span></div><div class="tw tall"><table><thead><tr><th>Customer</th><th>Plant</th><th class="num">0–30</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">90+</th><th class="num">Overdue</th><th class="num">Oldest (days)</th>'+(S.custIdx&&S.custIdx.size?'<th>Salesperson (master)</th><th class="num">Credit limit</th><th class="num">Over limit by</th>':'')+'</tr></thead><tbody>'+rows.map(function(o){var ci=custInfo(o.cust),tot=custOpenTotal(o.cust),over=ci&&ci[6]>0&&tot>ci[6]?tot-ci[6]:0;return '<tr><td class="break"><b>'+esc(o.cust)+'</b> '+esc(custName(o.cust,o.name))+'</td><td>'+esc(plantShort(o.plant))+'</td>'+o.b.map(function(v){return '<td class="num">'+(v?fmtMoney(v):'—')+'</td>'}).join('')+'<td class="num"><b>'+fmtMoney(o.total)+'</b></td><td class="num">'+o.oldest+'</td>'+(S.custIdx&&S.custIdx.size?'<td>'+(ci&&ci[5]?esc(ci[5])+' <span class="note">suggested</span>':'—')+'</td><td class="num">'+(ci&&ci[6]>0?fmtMoney(ci[6]):'—')+'</td><td class="num">'+(over?'<span class="pill miss">'+fmtMoney(over)+'</span>':'—')+'</td>':'')+'</tr>'}).join('')+'</tbody></table></div></section>'+recvCreditHtml(plants);
  }else h+=needPanel(['recv'],'No receivable items are loaded.');
  /* collection plan vs actual by month */
  if(col.have){
    var cq=res.q||curQuarterKey(),ms=qMonths(cq),pms=ms.map(priorQuarterMonth);
    var trs=ms.map(function(m,i){var c=collMonths(plants,[{ym:m,frac:1}]),p=collMonths(plants,[{ym:pms[i],frac:1}]);var qo=qoqOf(c.rec,p.rec,{incomplete:!p.have||!c.have});var a=c.planHave&&c.plan>0?c.rec/c.plan*100:null;
      return '<tr><td>'+ymLabel(m)+'</td><td class="num">'+(c.planHave?fmtMoney(c.plan)+(c.planDefault?' <span class="pill mute">default</span>':''):'<span class="pill mute">No plan</span>')+'</td><td class="num">'+(c.have?fmtMoney(c.rec):'—')+'</td><td class="num">'+(c.planHave?fmtVarMoney(c.rec-c.plan):'—')+'</td><td class="num">'+fmtAch(a)+'</td><td class="num">'+(p.have?fmtMoney(p.rec):'—')+' <span class="note">'+ymLabel(pms[i])+'</span></td><td class="num">'+qoqCell(qo)+'</td></tr>'}).join('');
    h+='<section class="card"><div class="hd"><h2>Collection plan vs actual · '+qLabel(cq)+'</h2></div><div class="tw"><table class="std"><thead><tr><th>Month</th><th class="num">Plan</th><th class="num">Actual</th><th class="num">Var</th><th class="num">Ach %</th><th class="num">Last Qtr (same position)</th><th class="num">QoQ %</th></tr></thead><tbody>'+trs+'</tbody></table></div><p class="note">Collection plan (P3) is ₹ received in the month, entered by Accounts. With no plan the default is open receivables falling due in the month (Assumed). Compared with the same position in the previous quarter only.</p></section>';
  }
  return h;
}

/* ---- Inventory ---- */

/* ---- collections: quarter series since history start for a scorecard (Accounts' primary KPI) ---- */
function collSeries(plants){
  var cur=curQuarterKey(),qs=closedQuarters().concat([cur]);
  return qs.map(function(q){
    var ms=qMonths(q),isCur=q===cur,N=isCur?wdBetween(ms[0]+'-01',TODAY()):Infinity,w=isCur?walk(ms,N):wins(ms);
    var c=collMonths(plants,w),full=collMonths(plants,wins(ms)),A=c.have?c.rec:null,tgtTo=c.planHave?c.plan:null;
    return {q:q,label:qLabel(q),A:A,loaded:c.have,tgt:full.planHave?full.plan:null,tgtTo:tgtTo,kind:'approved',isCur:isCur,ach:(A!=null&&tgtTo>0)?A/tgtTo*100:null,N:N};
  });
}
function collAvailable(plants){var sc=SC();return S.coll.some(function(d){return plantInScope(sc,d.plant)&&(!plants||plants.has(d.plant))})}
function collRows(plants,ym){
  var sc=SC(),out=[];
  S.coll.forEach(function(d){if(d.ym!==ym||!plantInScope(sc,d.plant)||(plants&&!plants.has(d.plant)))return;(d.rows||[]).forEach(function(r){out.push({doc:r[0],date:ym+'-'+pad(r[1]),cust:r[2],amount:r[3],plant:d.plant})})});
  return out.sort(function(a,b){return b.amount-a.amount});
}
function drillColl(ctx){
  var d=S.drill,q=d.q,ms=qMonths(q),plants=d.pl?new Set(d.pl.split(',')):ctx.plants;
  var rows=ms.map(function(m){var A=collMonths(plants,[{ym:m,frac:1}]),pm=priorMonth(m),P=collMonths(plants,[{ym:pm,frac:1}]);var qo=qoqOf(A.rec,P.rec,{incomplete:!A.have||!P.have});
    return '<tr class="clk" data-act="drill-m" data-m="'+m+'"><td><button class="btn sm" data-act="drill-m" data-m="'+m+'">'+ymLabel(m)+' · open receipts ›</button></td><td class="num">'+(A.have?fmtMoney(A.rec):'—')+'</td><td class="num">'+(A.planHave?fmtMoney(A.plan):'<span class="pill mute">No plan</span>')+'</td><td class="num">'+(P.have?fmtMoney(P.rec):'—')+' <span class="note">'+ymLabel(pm)+'</span></td><td class="num">'+qoqCell(qo)+'</td></tr>'}).join('');
  var h='<section class="card" id="drillp"><div class="hd"><h2>Drill-down · Collections · '+qLabel(q)+'</h2><button class="btn sm" data-act="drill-close">Close</button></div>'
   +'<div class="crumbs"><button class="chip" data-act="drill-close">Trend</button> › <button class="chip'+(d.m?'':' on')+'" data-act="drill-qonly">'+qLabel(q)+'</button>'+(d.m?' › <button class="chip" data-act="drill-m" data-m="'+d.m+'">'+ymLabel(d.m)+'</button> › <span class="chip on">Receipt documents</span>':'')+'</div>'
   +'<div class="tw"><table><thead><tr><th>Month</th><th class="num">Receipts</th><th class="num">Plan</th><th class="num">Same position, previous quarter</th><th class="num">QoQ %</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  if(d.m){var dl=collRows(plants,d.m);h+='<div class="hd"><h3 style="margin:0;font-size:13px">SAP receipts · '+ymLabel(d.m)+'</h3><span class="note">'+dl.length+' documents</span></div>'+(dl.length?'<div class="tw tall"><table><thead><tr><th>System</th><th>Doc type</th><th>Doc no</th><th>Date</th><th>Plant</th><th>Customer</th><th class="num">Amount</th></tr></thead><tbody>'+dl.slice(0,300).map(function(x){return '<tr><td class="mono">B1</td><td class="mono" title="Incoming payment (receipt)">RCT</td><td class="mono">'+esc(x.doc)+'</td><td>'+esc(x.date)+'</td><td>'+esc(plantShort(x.plant))+'</td><td class="break">'+esc(x.cust)+'</td><td class="num">'+fmtMoney(x.amount)+'</td></tr>'}).join('')+'</tbody></table></div>':'<div class="empty sm">'+(collMonths(plants,[{ym:d.m,frac:1}]).have?'This month has a receipts total but no receipt documents were stored with it (demo data loaded before receipt documents were stored: Clear demo, then Load demo data).':'No receipts loaded for this month.')+'</div>')}
  return h+'</section>';
}
