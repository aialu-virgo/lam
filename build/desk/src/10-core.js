/* ================= v0.9 core: settings, calendar, periods, QoQ, trend ================= */
var PAGE_URL='https://claude.ai/artifact/GZei5qVxZeom1fMm45t4nx';
var DEPTS=['Sales','CRR','Accounts','Plant','HO'];
/* Every threshold is an editable setting. Label = where the value came from (design/check-rules.md, priority-rules.md). */
var SETTING_DEFS=[
 ['w_U','Priority weight: due-date urgency',35,'Assumed (new)'],['w_V','Priority weight: value at risk',25,'Assumed (new)'],['w_C','Priority weight: customer impact',15,'Assumed (new)'],['w_A','Priority weight: ageing',15,'Assumed (new)'],['w_D','Priority weight: dependency',10,'Assumed (new)'],
 ['value_ref','Value at risk reference (₹)',1000000,'Assumed (new)'],['age_ref','Ageing reference (days)',30,'Assumed (new)'],['abc_a','Class A: first % of sales',70,'Assumed (new)'],['abc_b','Class B: next % of sales',20,'Assumed (new)'],
 ['prio_high','High priority from score',70,'Assumed (new)'],['prio_med','Medium priority from score',40,'Assumed (new)'],
 ['today_cap','Today cap (default for every role)',5,'Assumed (Q10)'],
 ['qoq_decline_pct','QoQ decline threshold %',-5,'Assumed (Q9)'],['qoq_min_base_inr','QoQ rule: minimum prior base (₹)',500000,'Assumed (new)'],['qoq_classes','QoQ rule: customer classes',"A,B",'Assumed (new)'],
 ['status_green_pct','Status green from Ach %',100,'Assumed (Q13)'],['status_orange_pct','Status orange from Ach %',90,'Assumed (Q13)'],
 ['shortfall_from_pct','R1: evaluate open month after % of working days',80,'Assumed (new)'],['max_new_per_rule_per_run','Max new actions per rule per run',20,'Assumed (new)'],
 ['due_R1','Due (working days) R1 plan shortfall',3,'Assumed (new)'],['due_R2','Due R2 overdue receivable',2,'Assumed (new)'],['due_R4','Due R4 ageing stock',5,'Assumed (new)'],['due_R5','Due R5 rejected rows',1,'Assumed (new)'],['due_R6','Due R6 missing plan',3,'Assumed (new)'],['due_R7','Due R7 QoQ decline',5,'Assumed (new)'],
 ['rcv_days','R2: days past due',30,'Assumed (new)'],['rcv_min_inr','R2: minimum overdue (₹)',100000,'Assumed (new)'],
 ['stock_age_days','R4: stock age (days)',180,'Assumed (new)'],['stock_age_min_sheets','R4: minimum aged sheets',500,'Assumed (new)'],['stock_over_pct','R4: stock days over plan %',125,'Assumed (new)'],['stock_days_target','Stock days plan',30,'Assumed (new)'],
 ['reject_min','R5: minimum rejected rows',1,'Assumed (new)'],['plan_lead_days','R6: days before quarter start',7,'Assumed (new)'],
 ['remind_days_before','Escalation: reminder days before due',1,'Assumed (Q11)'],['L1_days','Escalation L1 (days overdue)',1,'Assumed (Q11)'],['L2_days','Escalation L2 (days overdue)',3,'Assumed (Q11)'],['L3_days','Escalation L3 (days overdue)',7,'Assumed (Q11)'],
 ['stretch_multiple','Stretch multiple of average QoQ',2,'Brief §4'],['stretch_floor_pct','Stretch floor % (when average is 0 or less)',0,'Assumed (new)'],['min_pairs','Minimum QoQ pairs for trend and Stretch',4,'Assumed (new)'],['trend_band_pct','Trend direction band ± %',1,'Assumed (new)'],
 ['default_share_uplift_pts','Default share uplift (points)',2,'Assumed (Q4)'],
 ['overdue_share_days','K10 overdue share: days past due',60,'Assumed (new)'],
 ['history_start','History start quarter (D28: nothing earlier is loaded or shown), format FY26-Q1','FY26-Q1','D28 (Vijay)'],
 ['own_company_names','Group company names (comma separated): customers with these in the name are suggested as internal transfers','VIRGO','Assumed (new)'],
 ['holidays','Holidays (YYYY-MM-DD, comma separated)','','Assumed (new)'],['month_compare','Month comparison (same_position_prior_quarter or previous_month)','same_position_prior_quarter','Assumed (Q8)']];
var CFG={};SETTING_DEFS.forEach(function(d){CFG[d[0]]=d[2]});
CFG.role_caps={};
function applySettings(doc){SETTING_DEFS.forEach(function(d){CFG[d[0]]=d[2]});CFG.role_caps={};if(doc){Object.keys(doc).forEach(function(k){if(k==='role_caps'&&doc[k])CFG.role_caps=doc[k];else if(k in CFG&&doc[k]!==''&&doc[k]!=null)CFG[k]=(typeof CFG[k]==='number')?Number(doc[k]):doc[k]})}if(!/^FY\d\d-Q[1-4]$/.test(String(CFG.history_start||'')))CFG.history_start='FY26-Q1';HOL=null}
var HOL=null;
function histStart(){return /^FY\d\d-Q[1-4]$/.test(String(CFG.history_start||''))?CFG.history_start:'FY26-Q1'}
function histLoYm(){return qStartYm(histStart())}
function preHist(ms){var lo=histLoYm();return ms.some(function(m){return m<lo})}
function holidaySet(){if(!HOL){HOL={};String(CFG.holidays||'').split(/[,;\s]+/).forEach(function(x){if(/^\d{4}-\d\d-\d\d$/.test(x))HOL[x]=1})}return HOL}

/* ---- dates (all ISO strings, IST calendar) ---- */
function isoOf(y,m,d){return y+'-'+pad(m)+'-'+pad(d)}
function parseISO(s){return new Date(Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10)))}
function addDays(s,n){return new Date(parseISO(s).getTime()+n*86400000).toISOString().slice(0,10)}
function diffDays(a,b){return Math.round((parseISO(a)-parseISO(b))/86400000)}
function dow(s){return parseISO(s).getUTCDay()}
function fmtDate(s){if(!s)return '';var d=parseISO(s);return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]+' '+d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+' '+d.getUTCFullYear()}
function fmtShort(s){if(!s)return '';var d=parseISO(s);return d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ymLabel(ym){return MON[+ym.slice(5,7)-1]+' '+ym.slice(0,4)}
function realToday(){var n=istNow();return isoOf(n.y,n.m,n.d)}
function TODAY(){var t=lsGet('desk-today');return /^\d{4}-\d\d-\d\d$/.test(t||'')?t:realToday()}
function isWD(s){return dow(s)!==0&&!holidaySet()[s]}
function wdBetween(a,b){/* working days from a to b inclusive */var n=0;if(b<a)return 0;for(var d=a;d<=b;d=addDays(d,1))if(isWD(d))n++;return n}
function WD(ym){var last=ym+'-'+pad(ymDays(ym));return Math.max(1,wdBetween(ym+'-01',last))}
function addWD(s,n){var d=s,k=0;while(k<n){d=addDays(d,1);if(isWD(d))k++}return d}
function shiftYm(ym,k){var y=+ym.slice(0,4),m=+ym.slice(5,7)-1+k;y+=Math.floor(m/12);m=((m%12)+12)%12;return y+'-'+pad(m+1)}
function ymRange(a,b){var o=[],x=a;while(x<=b&&o.length<400){o.push(x);x=shiftYm(x,1)}return o}
/* the one comparison function: a period moves back by exactly three months. There is no twelve-month shift anywhere. */
function priorMonth(ym){return shiftYm(ym,CFG.month_compare==='previous_month'?-1:-3)}
function priorQuarterMonth(ym){return shiftYm(ym,-3)}
function curQuarterKey(){return qKeyOfYm(TODAY().slice(0,7))}
function closedQuartersFrom(cur){var k=cur,l=[],hs=histStart();for(var i=0;i<12;i++){k=prevQ(k);if(k<hs)break;l.unshift(k)}return l}
function closedQuarters(){return closedQuartersFrom(curQuarterKey())}
function fyQuarters(fyq){/* quarters of the FY of key, up to key */var m=/^FY(\d\d)-Q(\d)$/.exec(fyq),o=[];for(var q=1;q<=+m[2];q++)o.push('FY'+m[1]+'-Q'+q);return o}

/* ---- window: months with the fraction of each month that counts ---- */
function walk(months,N){
  var rem=N,out=[];
  months.forEach(function(ym){
    var wd=WD(ym),f;
    if(rem===Infinity)f=1;else if(rem<=0)f=0;else if(rem>=wd){f=1;rem-=wd}else{f=rem/wd;rem=0}
    out.push({ym:ym,frac:f});
  });
  return out;
}
/* resolve the period control into current and previous windows. f: {mode,q,m,from,to} */
function resolvePeriod(f,today){
  today=today||TODAY();var tYm=today.slice(0,7),curQ=qKeyOfYm(tYm);var mode=f.mode||'QTD';
  var R={mode:mode,today:today,note:''};
  if(mode==='QTD'||mode==='YTD'){
    var q=f.q||curQ,months=qMonths(q),open=(q===curQ);
    var N=open?wdBetween(months[0]+'-01',today):(q>curQ?0:Infinity);
    R.q=q;R.qOpen=open;R.N=N;
    if(mode==='QTD'){
      R.label=qLabel(q)+(open?' to date':'');R.cur=walk(months,N);R.prior=walk(months.map(priorQuarterMonth),N);R.priorQ=prevQ(q);R.priorLabel=qLabel(R.priorQ)+(open?' (same working days)':'');
      R.wdN=open?N:null;R.wdTot=months.reduce(function(a,m){return a+WD(m)},0);R.pro=open;
    }else{
      var qs=fyQuarters(q);R.quarters=qs;R.label='YTD '+qLabel(q).split(' ')[1]+(open?' so far':'');
      var allM=[];qs.forEach(function(k){allM=allM.concat(qMonths(k))});R.cur=walk(allM,qs[qs.length-1]===curQ?wdBetween(allM[0]+'-01',today):Infinity);
      R.prior=null;R.priorLabel='none: YTD is shown quarter by quarter';R.pro=false;
      /* latest-quarter QoQ for the card */
      var lm=qMonths(q);R.latestQ=q;R.latestCur=walk(lm,N);R.latestPrior=walk(lm.map(priorQuarterMonth),N);
    }
  }else if(mode==='MTD'){
    var m=f.m||tYm,open2=(m===tYm),N2=open2?wdBetween(m+'-01',today):(m>tYm?0:Infinity);
    R.m=m;R.N=N2;R.label=ymLabel(m)+(open2?' to date':'');R.cur=walk([m],N2);R.prior=walk([priorMonth(m)],N2);
    R.priorLabel=ymLabel(priorMonth(m))+(open2?' (same working days)':'');R.pro=open2;R.wdN=open2?N2:null;R.wdTot=WD(m);R.q=qKeyOfYm(m);
    R.priorQ=qKeyOfYm(priorMonth(m));
  }else{
    var from=f.from||shiftYm(tYm,-1),to=f.to||tYm;if(to<from)to=from;var ms=ymRange(from,to);
    var open3=to>=tYm,N3=open3?wdBetween(ms[0]+'-01',today):Infinity;if(ms[0]>tYm)N3=0;
    R.from=from;R.to=to;R.N=N3;R.label=ymLabel(from)+(from===to?'':' to '+ymLabel(to))+(open3?' (to date)':'');R.cur=walk(ms,N3);R.prior=walk(ms.map(priorQuarterMonth),N3);
    R.priorLabel=ymLabel(priorQuarterMonth(from))+(from===to?'':' to '+ymLabel(priorQuarterMonth(to)));R.pro=open3;R.q=qKeyOfYm(to);R.wdTot=ms.reduce(function(a,m){return a+WD(m)},0);R.wdN=open3?N3:null;
  }
  R.curMonths=R.cur.filter(function(x){return x.frac>0}).map(function(x){return x.ym});
  R.priorMonths=R.prior?R.prior.map(function(x){return x.ym}):[];
  return R;
}

/* ---- QoQ ---- */
function qoqOf(A,P,ctx){
  ctx=ctx||{};
  if(ctx.noPrior)return {v:null,state:'nohist',txt:'No prior quarter loaded'};
  if(ctx.incomplete)return {v:null,state:'incomplete',txt:'incomplete history'};
  if(P==null)return {v:null,state:'none',txt:'no prior quarter'};
  if(P<=0){if(A>0)return {v:null,state:'new',txt:'New, no prior quarter'};if(A===0&&P===0)return {v:null,state:'zero',txt:'—'};return {v:null,state:'na',txt:'n/a'}}
  return {v:(A-P)/P*100,state:'ok',txt:fmtPct(((A-P)/P)*100,true)};
}
function fmtPct(v,sign,d){if(v==null||isNaN(v))return '—';d=d==null?1:d;var s=(Math.abs(v)<0.05&&d===1?0:v).toFixed(d);if(sign&&v>0)s='+'+s;return s.replace('-','−')+'%'}
function fmtVarMoney(v){return (v>0?'+':v<0?'−':'')+fmtMoney(Math.abs(v))}

/* ---- trend, moving average, Stretch (target-model.md) ---- */
function trendStats(series){
  /* series: numbers (or null for a quarter not loaded), oldest first. QoQ uses consecutive loaded pairs. */
  var n=series.length,qoqs=[],qoqAt=new Array(n).fill(null),ma=new Array(n).fill(null);
  for(var i=1;i<n;i++){var a=series[i],p=series[i-1];if(a!=null&&p!=null&&p>0){var q=(a-p)/p*100;qoqs.push(q);qoqAt[i]=q}}
  for(i=3;i<n;i++){var ok=true,s=0;for(var j=i-3;j<=i;j++){if(series[j]==null){ok=false;break}s+=series[j]}if(ok)ma[i]=s/4}
  var avg=qoqs.length?qoqs.reduce(function(a,b){return a+b},0)/qoqs.length:null;
  var sx=0,sy=0,sxx=0,sxy=0,k=0;for(i=0;i<n;i++){if(series[i]!=null){var x=i+1,y=series[i];sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;k++}}
  var slope=null,icpt=null;if(k>=4){var den=k*sxx-sx*sx;if(den!==0){slope=(k*sxy-sx*sy)/den;icpt=(sy-slope*sx)/k}}
  var short=qoqs.length<CFG.min_pairs,dir='short';
  if(!short){dir=avg>CFG.trend_band_pct?'rising':avg<-CFG.trend_band_pct?'falling':'flat'}
  return {n:n,qoqs:qoqs,qoqAt:qoqAt,ma:ma,avg:avg,slope:slope,icpt:icpt,pairs:qoqs.length,short:short,dir:dir};
}
function stretchOf(target,lastActual,ts){
  if(target==null||lastActual==null||lastActual<=0||!ts||ts.short||ts.avg==null)return {state:'na',required:null,threshold:null};
  var required=(target/lastActual-1)*100;
  var thr=CFG.stretch_multiple*Math.max(ts.avg,CFG.stretch_floor_pct);
  return {state:required>thr?'stretch':'ok',required:required,threshold:thr,avg:ts.avg};
}
function arrow(dir){return dir==='rising'?'▲ rising':dir==='falling'?'▼ falling':dir==='flat'?'▬ flat':'history too short'}
function arrowShort(dir){return dir==='rising'?'▲':dir==='falling'?'▼':dir==='flat'?'▬':'—'}
function statusOf(ach,lowerBetter){
  if(ach==null||isNaN(ach))return 'none';
  if(lowerBetter){/* ach is actual/plan for lower-better KPIs */return ach<=100?'green':ach<=110?'orange':'red'}
  return ach>=CFG.status_green_pct?'green':ach>=CFG.status_orange_pct?'orange':'red';
}
function statusPill(st,txt){var m={green:['ok','On plan'],orange:['part','Watch'],red:['miss','Behind'],none:['mute','No plan'],pending:['mute','Pending']}[st]||['mute',st];return '<span class="pill '+m[0]+'">'+esc(txt||m[1])+'</span>'}
function fmtSqft(v){return fmtN(Math.round(v||0))+' sq ft'}
/* sheets are the primary quantity unit; sq ft is the secondary line */
function fmtSheets(v){return fmtN(Math.round(v||0))+' sheets'}
function shOfLeaf(o){var s=+o.potential_qty_sheets||0;return s>0?s:(+o.potential_qty_sqft||0)/32}/* a leaf with no sheet count is converted from sq ft at 32 sq ft per 8x4 sheet (Assumed) */
function hashRef(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return 'ACT-'+h.toString(36).toUpperCase().padStart(6,'0').slice(0,6)}
function rowKey(a){return a.join('|')}
