/* ================= v0.9 rules engine: R1-R7, priority, escalation drafts (rules and templates only, no AI) ================= */
var OPEN_ST=['Open','Acknowledged','In progress','Reassign requested'];
var LIVE_ST=['Open','Acknowledged','In progress','Reassign requested','Blocked'];
var ALL_ST=['Open','Acknowledged','In progress','Done','Verified closed','Blocked','Reassign requested','Cancelled'];
function slugA(s){return String(s).replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_|_$/g,'').slice(0,150)}
function actionIdOf(rule,parts){return slugA(rule+'_'+parts.join('_'))}
function fmtLakh(v){return fmtMoney(v)}

/* ---- priority score (priority-rules.md) ---- */
function weightsOk(){return CFG.w_U+CFG.w_V+CFG.w_C+CFG.w_A+CFG.w_D===100}
function scoreOf(a,today){
  today=today||TODAY();
  var d=diffDays(a.due,today),U=d<0?100:d===0?90:d===1?75:d<=3?50:d<=7?25:10;
  var V=Math.min(100,100*(a.value||0)/CFG.value_ref);
  var cls=a.customer?custClass(a.customer):null,C=cls==='A'?100:cls==='B'?60:cls==='C'?30:0;
  var age=Math.max(0,diffDays(today,(a.created||today).slice(0,10))),A=Math.min(100,age/CFG.age_ref*100);
  var D=Math.min(100,50*(a.dependents||0));
  var pts={U:CFG.w_U*U/100,V:CFG.w_V*V/100,C:CFG.w_C*C/100,A:CFG.w_A*A/100,D:CFG.w_D*D/100};
  var score=pts.U+pts.V+pts.C+pts.A+pts.D;
  var labels={U:d<0?'overdue '+(-d)+' day'+(d===-1?'':'s'):'due '+fmtShort(a.due),V:'₹'+fmtMoney(a.value||0).replace('₹','')+' at risk',C:'class '+(cls||'-')+' customer',A:'open '+age+' day'+(age===1?'':'s'),D:'blocks '+(a.dependents||0)+' item'+((a.dependents||0)===1?'':'s')};
  return {score:score,pts:pts,comp:{U:U,V:V,C:C,A:A,D:D},labels:labels,cls:cls,days:d,age:age};
}
function prioLabel(s){return s>=CFG.prio_high?'High':s>=CFG.prio_med?'Medium':'Low'}
function whyLine(rank,sc){
  var keys=['U','V','C','A','D'].sort(function(x,y){return sc.pts[y]-sc.pts[x]}).slice(0,2);
  return 'Ranked '+rank+': '+keys.map(function(k){return sc.labels[k]+' ('+sc.pts[k].toFixed(1)+' pts)'}).join(', ')+'. Score '+sc.score.toFixed(1)+'.';
}
function rankSort(list,today){
  var sc=list.map(function(a){return {a:a,s:scoreOf(a,today)}});
  sc.sort(function(x,y){return y.s.score-x.s.score||(x.a.due<y.a.due?-1:x.a.due>y.a.due?1:0)||(y.a.value||0)-(x.a.value||0)||(x.a.id<y.a.id?-1:1)});
  return sc;
}
function capFor(u){var c=u&&u.today_cap;if(c>=1&&c<=20)return Math.floor(c);var rc=CFG.role_caps&&CFG.role_caps[u&&u.role];if(rc>=1&&rc<=20)return rc;return CFG.today_cap}

/* ---- who owns what ---- */
function isRuleMade(a){return String(a.assigner||'').indexOf('Desk rule')===0}
function canManage(a,u){
  if(!u)return false;
  if(u.role==='Super admin'||u.role==='Management / HO')return true;
  if(a.assigner===u.email)return true;
  if(u.role==='HOD'&&norm(u.department)===norm(a.department))return true;
  if(u.role==='Branch / depot manager'&&a.plant&&holdsPlant(u,a.plant))return true;
  return false;
}
function canVerify(a,u){
  if(!u)return false;
  if(u.role==='Super admin'||u.role==='Management / HO')return true;
  if(a.assigner===u.email)return true;
  if(isRuleMade(a)){var ow=uByEmail(a.owner);if(ow&&ow.reports_to_email===u.email)return true;if(u.role==='HOD'&&norm(u.department)===norm(a.department))return true}
  return false;
}
function canRespond(a,u){return !!u&&(a.owner===u.email||canManage(a,u))}
function visibleTo(a,u,sc){
  if(!u)return false;
  if(u.role==='Super admin'||u.role==='Management / HO')return true;
  if(a.owner===u.email||a.assigner===u.email)return true;
  if(u.role==='HOD')return norm(a.department)===norm(u.department);
  if(u.role==='Branch / depot manager')return !!a.plant&&holdsPlant(u,a.plant);
  if(u.role==='Coordinator (sales / CRR)'||u.role==='Plant'||u.role==='Accounts')return !!a.plant&&(codesOf(u).length?holdsPlant(u,a.plant):u.role==='Accounts')&&(u.role!=='Accounts'||a.department==='Accounts');
  return false;
}
function myActions(u){return S.actions.filter(function(a){return visibleTo(a,u)})}
function todayCandidates(u){
  return S.actions.filter(function(a){
    if(OPEN_ST.indexOf(a.status)>=0&&a.owner===u.email)return true;
    if(a.status==='Done'&&canVerify(a,u)&&(a.assigner===u.email||isRuleMade(a)))return true;
    return false;
  });
}
function resolveOwner(chain){
  for(var i=0;i<chain.length;i++){var u=chain[i];if(u&&u.active!==false)return {u:u,up:i>0}}
  return {u:null,up:true};
}
function ownerFor(rule,ctx){
  var bm=ctx.plant?bmFor(ctx.plant):null,hod=hodFor(ctx.dept||'Sales'),mg=mgmtUsers()[0],sa=usersOfRole('Super admin')[0];
  var chain;
  if(rule==='R2')chain=[ctx.plant?accountsFor(ctx.plant):null,bm,hodFor('Accounts'),mg,sa];
  else if(rule==='R4')chain=[ctx.plant?plantUserFor(ctx.plant):null,bm,hodFor('Plant'),mg,sa];
  else if(rule==='R5')chain=[ctx.uploader?uByEmail(ctx.uploader):null,sa];
  else if(rule==='R7'&&ctx.kind==='group')chain=[hodFor('Sales'),mg,sa];
  else if(rule==='R7'&&ctx.kind==='person')chain=[ctx.sp?userBySp(ctx.sp):null,bm,hodFor('Sales'),mg,sa];
  else if(rule==='R7'&&ctx.kind==='customer')chain=[ctx.sp?userBySp(ctx.sp):null,bm,hodFor('Sales'),mg,sa];
  else chain=[bm,hod,mg,sa];
  return resolveOwner(chain);
}

/* ---- candidate builders ---- */
function mkCand(rule,key,period,o){
  var own=ownerFor(rule,o.ctx||{});
  var dept={R1:'Sales',R2:'Accounts',R4:'Plant',R5:'HO',R6:'Sales',R7:'Sales'}[rule];
  return {id:actionIdOf(rule,[key,period]),rule:rule,period:period,title:o.title,source:o.source,owner:own.u?own.u.email:'',ownerUp:own.up,department:dept,plant:o.plant||'',group:o.group||'',customer:o.customer||'',
    due:addWD(TODAY(),CFG['due_'+rule]||3),next_step:o.next,value:Math.round(o.value||0),meta:o.meta||{}};
}
function evalR1(){
  var out=[],t=TODAY(),tYm=t.slice(0,7),q=curQuarterKey(),ms=qMonths(q);
  if(!S.potential.length)return {out:out,live:null};
  DS.plants.forEach(function(plant){GROUPS.forEach(function(g){
    var P=planQ({plant:plant,group:g},q);if(P.nAppr===0||P.kind==='draft')return;
    ms.forEach(function(ym,i){
      if(ym>tYm)return;var wd=WD(ym),done=ym<tYm,el=done?wd:wdBetween(ym+'-01',t);
      if(!done&&el/wd*100<CFG.shortfall_from_pct)return;if(!monthLoaded(ym,new Set([plant])))return;
      var plan=P.months[i]*(el/wd);if(plan<=0)return;var act=sumF({plant:plant,group:g},[ym]).n,ach=act/plan*100;
      if(ach<CFG.status_orange_pct){
        out.push(mkCand('R1',plant+'_'+g,ym,{title:'Plan shortfall · '+plantShort(plant)+', '+g+' · '+MON[+ym.slice(5,7)-1],plant:plant,group:g,value:plan-act,ctx:{plant:plant},
          source:{label:'Rule R1 · Overview › '+plantShort(plant)+' › '+g+' · '+ach.toFixed(1)+'% of plan to date',page:'overview',plant:plant,group:g},
          next:'Open '+plantShort(plant)+' '+g+': shortfall '+fmtMoney(plan-act)+' against plan to date. Review the 3 customers with the largest drop against the previous quarter, agree a recovery plan, reply with the new ETA.',meta:{ach:ach,plan:plan,act:act}}));
      }
    });
  })});
  return {out:out,live:true};
}
function evalR2(){
  var out=[],items=[];(S.recv||[]).forEach(function(d){(d.rows||[]).forEach(function(r){items.push({plant:d.plant,inv:r[0],cust:r[1],name:r[2],due:r[3],open:r[4]})})});
  if(!items.length)return {out:out,live:null};
  var t=TODAY(),by={};
  items.forEach(function(x){var od=diffDays(t,x.due);if(od>CFG.rcv_days){var k=x.plant+'|'+x.cust,o=by[k]||(by[k]={plant:x.plant,cust:x.cust,name:x.name,n:0,amt:0,oldest:0});o.n++;o.amt+=x.open;o.oldest=Math.max(o.oldest,od)}});
  Object.keys(by).forEach(function(k){var o=by[k];if(o.amt<CFG.rcv_min_inr)return;
    out.push(mkCand('R2',o.cust+'_'+o.plant,t.slice(0,7),{title:'Overdue receivable · '+(o.name||o.cust),plant:o.plant,customer:o.cust,value:o.amt,ctx:{plant:o.plant},
      source:{label:'Rule R2 · Receivables › '+(o.name||o.cust),page:'receivables',plant:o.plant},next:'Call '+(o.name||o.cust)+'. Overdue '+fmtMoney(o.amt)+' on '+o.n+' invoice'+(o.n>1?'s':'')+', oldest '+o.oldest+' days. Record the promised payment date and amount in your reply.',meta:{n:o.n,oldest:o.oldest}}))});
  return {out:out,live:true};
}
function evalR4(){
  var out=[];if(!(S.stock||[]).length)return {out:out,live:null};
  S.stock.forEach(function(d){(d.rows||[]).forEach(function(r){
    var g=r[0],onh=r[1],aged=r[2];var sd=stockDays(d.plant,g,onh);
    var A=aged>=CFG.stock_age_min_sheets,B=sd!=null&&sd>CFG.stock_days_target*CFG.stock_over_pct/100;
    if(A||B)out.push(mkCand('R4',d.plant+'_'+g,'open',{title:'Ageing stock · '+plantShort(d.plant)+', '+g,plant:d.plant,group:g,value:aged*stockPrice(d.plant,g),ctx:{plant:d.plant},source:{label:'Rule R4 · Inventory › '+plantShort(d.plant)+' › '+g,page:'inventory',plant:d.plant,group:g},
      next:'Choose a route for the '+(A&&B?'aged and excess':A?'aged':'excess')+' stock: transfer to a depot with demand, price action, or write-off request. Reply with route, quantity and date.',meta:{aged:aged,days:sd}}));
  })});
  return {out:out,live:true};
}
function stockPrice(plant,g){var s=sumF({plant:plant,group:g},qMonths(prevQ(curQuarterKey())));return s.sh>0?s.n/s.sh:1000}
function evalR5(){
  var out=[],t=TODAY();
  S.uploads.forEach(function(u){
    if(u.status==='Undone'||!(u.read>0&&u.rejected>0&&u.rejected/u.read*100>CFG.skip_alert_pct))return;if(diffDays(t,(u.at||'').slice(0,10))>14)return;
    out.push(mkCand('R5',u._id,'upload',{title:'Rejected rows · '+(u.file||'upload'),value:0,ctx:{uploader:u.by},source:{label:'Rule R5 · Data Intake › upload history · '+fmtN(u.rejected)+' rows rejected of '+fmtN(u.read),page:'intake'},
      next:'Fix the '+fmtN(u.rejected)+' rejected rows in the SAP export or the column mapping, then re-upload the same file. The rejected-rows report is in Data Intake.',meta:{}}));
  });
  return {out:out,live:true};
}
function evalR6(){
  var out=[];if(!S.potential.length)return {out:out,live:null};
  var t=TODAY(),cq=curQuarterKey(),nq=nextQ(cq),days=diffDays(qMonths(nq)[0]+'-01',t),check=[cq];if(days<=CFG.plan_lead_days)check.push(nq);
  check.forEach(function(q){
    var lq=prevQ(q);
    DS.plants.forEach(function(plant){
      var miss=[];GROUPS.forEach(function(g){var sold=sumF({plant:plant,group:g},qMonths(lq)).n;if(sold>0){var P=planQ({plant:plant,group:g},q);if(P.nAppr===0)miss.push(g)}});
      if(miss.length)out.push(mkCand('R6',plant,q,{title:'Missing plan · '+plantShort(plant)+' · '+qLabel(q),plant:plant,value:0,ctx:{plant:plant},source:{label:'Rule R6 · Admin › Market potential · '+qLabel(q),page:'admin'},
        next:'Propose potential and share % for '+plantShort(plant)+' ('+miss.join(', ')+'), record the discussion, and submit for approval.',meta:{groups:miss}}));
    });
  });
  return {out:out,live:true};
}
async function evalR7(){
  var out=[],t=TODAY(),tYm=t.slice(0,7),cq=curQuarterKey(),lq=prevQ(cq),mk=CFG.qoq_decline_pct;
  function consider(kind,label,fil,ym,pm,pset,extra){
    var A=sumF(fil,[ym]).n,P=sumF(fil,[pm]).n;
    if(!monthLoaded(ym,pset)||!monthLoaded(pm,pset))return;if(P<CFG.qoq_min_base_inr)return;
    var q=(A-P)/P*100;if(q>mk)return;
    out.push(mkCand('R7',kind+'_'+label.key,ym,Object.assign({title:label.title+' · QoQ '+fmtPct(q,true)+' · '+MON[+ym.slice(5,7)-1]+' vs '+MON[+pm.slice(5,7)-1],value:P-A,
      source:{label:'Rule R7 · '+label.src+' · '+ymLabel(ym)+' '+fmtMoney(A)+' vs '+ymLabel(pm)+' '+fmtMoney(P),page:label.page,plant:extra.plant||'',group:extra.group||''},
      next:label.name+': '+ymLabel(ym)+' '+fmtMoney(A)+' vs '+ymLabel(pm)+' '+fmtMoney(P)+' ('+fmtPct(q,true)+'). Find the reason (price, stock, competitor, credit) and reply with a recovery plan and ETA.'},extra)));
  }
  /* completed months of the open quarter */
  qMonths(cq).filter(function(m){return m<tYm}).forEach(function(ym){
    var pm=priorMonth(ym);
    DS.plants.forEach(function(p){consider('plant',{key:p,title:'QoQ decline · '+plantShort(p),name:plantShort(p),src:'Overview › '+plantShort(p),page:'overview'},{plant:p},ym,pm,new Set([p]),{plant:p,ctx:{plant:p,kind:'plant'}})});
    GROUPS.forEach(function(g){consider('group',{key:g,title:'QoQ decline · '+g,name:g,src:'Overview › '+g,page:'overview'},{group:g},ym,pm,SC().plants,{group:g,ctx:{kind:'group'}})});
    Object.keys(DS.spIdx).filter(Boolean).forEach(function(sp){var pl=spPlants(sp)[0];consider('person',{key:slugA(sp),title:'QoQ decline · '+sp,name:sp,src:'Team & Scorecard › '+sp,page:'team'},{sp:sp},ym,pm,null,{plant:pl,ctx:{kind:'person',sp:sp,plant:pl}})});
  });
  /* last completed quarter vs the one before it (Q1 compares with Q4 of the prior FY) */
  var lqm=qMonths(lq),lpm=qMonths(prevQ(lq));
  if(monthsLoaded(lqm,null)||true){
    var pq=prevQ(lq);
    function considerQ(kind,label,fil,pset,extra){var A=sumF(fil,lqm).n,P=sumF(fil,lpm).n;if(!monthsLoaded(lqm,pset)||!monthsLoaded(lpm,pset))return;if(P<CFG.qoq_min_base_inr)return;var q=(A-P)/P*100;if(q>mk)return;
      out.push(mkCand('R7',kind+'_'+label.key,lq,Object.assign({title:label.title+' · QoQ '+fmtPct(q,true)+' · '+qLabel(lq)+' vs '+qLabel(pq),value:P-A,source:{label:'Rule R7 · '+label.src+' · '+qLabel(lq)+' '+fmtMoney(A)+' vs '+qLabel(pq)+' '+fmtMoney(P),page:label.page,plant:extra.plant||'',group:extra.group||''},
        next:label.name+': '+qLabel(lq)+' '+fmtMoney(A)+' vs '+qLabel(pq)+' '+fmtMoney(P)+' ('+fmtPct(q,true)+'). Find the reason (price, stock, competitor, credit) and reply with a recovery plan and ETA.'},extra)))}
    DS.plants.forEach(function(p){considerQ('plant',{key:p,title:'QoQ decline · '+plantShort(p),name:plantShort(p),src:'Overview › '+plantShort(p),page:'overview'},{plant:p},new Set([p]),{plant:p,ctx:{plant:p,kind:'plant'}})});
    GROUPS.forEach(function(g){considerQ('group',{key:g,title:'QoQ decline · '+g,name:g,src:'Overview › '+g,page:'overview'},{group:g},SC().plants,{group:g,ctx:{kind:'group'}})});
    Object.keys(DS.spIdx).filter(Boolean).forEach(function(sp){var pl=spPlants(sp)[0];considerQ('person',{key:slugA(sp),title:'QoQ decline · '+sp,name:sp,src:'Team & Scorecard › '+sp,page:'team'},{sp:sp},null,{plant:pl,ctx:{kind:'person',sp:sp,plant:pl}})});
  }
  /* customers: class A and B, completed months of the open quarter */
  var cms=qMonths(cq).filter(function(m){return m<tYm});
  if(cms.length){
    var need=[];cms.forEach(function(m){need.push(m,priorMonth(m))});
    /* customer-level checks need the customer detail; they run once it has been read (open Sales or Team) */
    var allNeed=need.concat(qMonths(lq));
    cms.forEach(function(ym){
      var pm=priorMonth(ym);if(!monthLoaded(ym,null)||!monthLoaded(pm,null))return;if(!custLoaded([ym,pm].concat(qMonths(lq)),SC().plants))return;
      var A=custAgg({plants:SC().plants},[ym]),P=custAgg({plants:SC().plants},[pm]),cm=classMap();
      P.forEach(function(p,code){
        var cls=cm[code]||'C';if(CFG.qoq_classes.split(',').map(function(x){return x.trim()}).indexOf(cls)<0)return;
        var a=A.get(code),av=a?a.n:0;if(p.n<CFG.qoq_min_base_inr)return;var q=(av-p.n)/p.n*100;if(q>mk)return;
        var plant=Object.keys(p.plants)[0],sp=Object.keys(p.sps).sort(function(x,y){return p.sps[y]-p.sps[x]})[0]||'';
        out.push(mkCand('R7','customer_'+code,ym,{title:'QoQ decline · '+p.name+' · '+fmtPct(q,true)+' · '+MON[+ym.slice(5,7)-1]+' vs '+MON[+pm.slice(5,7)-1],plant:plant,customer:code,value:p.n-av,ctx:{kind:'customer',sp:sp,plant:plant},
          source:{label:'Rule R7 · Sales › '+p.name+' · '+ymLabel(ym)+' '+fmtMoney(av)+' vs '+ymLabel(pm)+' '+fmtMoney(p.n)+' · class '+cls,page:'sales',plant:plant},
          next:p.name+': '+ymLabel(ym)+' '+fmtMoney(av)+' vs '+ymLabel(pm)+' '+fmtMoney(p.n)+' ('+fmtPct(q,true)+'). Find the reason (price, stock, competitor, credit) and reply with a recovery plan and ETA.'}));
      });
    });
  }
  return {out:out,live:null};
}
async function runEngine(){
  var u=effUser();if(!u||GLOBAL_ROLES.indexOf(u.role)<0||readOnly()||S.engBlock)return;
  if(!S.loaded.actions||!S.loaded.uploads||!S.loaded.potential||!S.loaded.settings||!DS.ready)return;
  var sig=[DS.ver,DS.custVer,S.potVer,S.uploads.length,TODAY(),S.recv.length,S.stock.length,S.users.length].join('|');
  if(S.engSig===sig||S.engBusy)return;
  S.engBusy=true;S.engSig=sig;S.engStatus='Checking rules...';
  try{
    var res=[evalR1(),evalR2(),evalR4(),evalR5(),evalR6()];res.push(await evalR7());
    var all=[];res.forEach(function(r){all=all.concat(r.out)});
    /* existing actions are never duplicated; new ones capped per rule per run, largest value first */
    var have={};S.actions.forEach(function(a){have[a.id]=1});
    var perRule={},made=0,created=[];
    all.sort(function(a,b){return b.value-a.value}).forEach(function(c){
      if(have[c.id])return;perRule[c.rule]=(perRule[c.rule]||0)+1;if(perRule[c.rule]>CFG.max_new_per_rule_per_run)return;created.push(c);
    });
    for(var i=0;i<created.length;i++){
      var c=created[i];
      var snap=await dget('actions/'+c.id);if(snap.exists)continue;
      var now=nowISO();
      var a={id:c.id,ref:hashRef(c.id),rule:c.rule,title:c.title,source:c.source,owner:c.owner,assigner:'Desk rule '+c.rule,creator:'Desk rule '+c.rule,department:c.department,plant:c.plant,group:c.group,customer:c.customer,
        due:c.due,next_step:c.next_step,value:c.value,status:'Open',created:now,updated:now,dependents:0,period:c.period,meta:c.meta,need_help:false,
        thread:[{at:now,by:'Desk rule '+c.rule,kind:'created',text:'Created by rule '+c.rule+' for '+c.period+'.'+(c.ownerUp?' No user found at the first level, so the action went one level up.':'')}]};
      if(S.demoMode)a.demo=true;
      await dset('actions/'+c.id,a);made++;
    }
    /* condition cleared: shown, never auto-closed */
    var liveIds={};all.forEach(function(c){liveIds[c.id]=1});
    var evald={};res.forEach(function(r,i){if(r.live)evald['R'+(i+1)]=1});
    var tYm=TODAY().slice(0,7),cq=curQuarterKey();
    for(var j=0;j<S.actions.length;j++){
      var a2=S.actions[j];if(!evald[a2.rule]||a2.cleared||LIVE_ST.indexOf(a2.status)<0||isRuleMade(a2)===false)continue;
      if(['R1','R2','R4','R6'].indexOf(a2.rule)<0)continue;
      if(a2.rule==='R1'&&qKeyOfYm(a2.period)!==cq)continue;if(a2.rule==='R6'&&a2.period!==cq&&a2.period!==nextQ(cq))continue;
      if(!liveIds[a2.id]){await saveAction(Object.assign({},a2,{cleared:true,updated:nowISO(),thread:(a2.thread||[]).concat([{at:nowISO(),by:'Desk rule '+a2.rule,kind:'cleared',text:'Condition cleared. The assigner verifies the closure.'}])}))}
    }
    S.engStatus='Rules checked '+istStr(nowISO())+(made?' · '+made+' new action'+(made>1?'s':''):' · nothing new');
  }catch(e){S.engStatus='Rules stopped: '+dbErrText(e)}
  S.engBusy=false;schedule();
}

/* ---- actions: writes ---- */
function saveAction(a){var o=Object.assign({},a);delete o._id;return dset('actions/'+a.id,o)}
function guardWrite(){if(readOnly()){toast('Viewing as another user: preview is read-only');return false}return true}
function threadAdd(a,e,patch){
  var now=nowISO();e=Object.assign({at:now},e);
  var n=Object.assign({},a,patch||{},{updated:now,thread:(a.thread||[]).concat([e]).slice(-200)});delete n._id;return n;
}
async function respond(id,kind,data){
  if(!guardWrite())return;
  var a=S.actions.find(function(x){return x.id===id});if(!a)return;var u=effUser();
  if(!canRespond(a,u)){toast('Only the owner or a manager can respond');return}
  var by=u.email,patch={},e={by:by,kind:kind,text:data.text||''};
  if(kind==='ack'){patch.status='Acknowledged';e.text=data.text||'Acknowledged.'}
  else if(kind==='update'){patch.status='In progress';e.eta=data.eta||'';if(data.eta)e.text=(data.text||'')+' (new ETA '+fmtDate(data.eta)+')'}
  else if(kind==='done'){patch.status='Done';patch.closure=data.text;patch.done_at=nowISO()}
  else if(kind==='help'){patch.need_help=true;e.text=data.text||'Needs help.'}
  else if(kind==='reassign_req'){patch.status='Reassign requested';patch.prev_status=a.status;e.text=data.text}
  else if(kind==='blocked'){patch.status='Blocked';patch.prev_status=a.status;patch.blocked_reason=data.text}
  else if(kind==='unblock'){patch.status=a.prev_status&&OPEN_ST.indexOf(a.prev_status)>=0&&a.prev_status!=='Reassign requested'?a.prev_status:'In progress';e.text=data.text||'Unblocked.'}
  await saveAction(threadAdd(a,e,patch));
}
async function assignAction(id,to,why){
  if(!guardWrite())return;var a=S.actions.find(function(x){return x.id===id}),u=effUser();if(!a||!canManage(a,u)){toast('You cannot assign this action');return}
  await saveAction(threadAdd(a,{by:u.email,kind:'assigned',text:'Assigned to '+userName(to)+(why?': '+why:'')},{owner:to,status:'Open',need_help:false,prev_status:undefined}));
}
async function changeDue(id,due,why){
  if(!guardWrite())return;var a=S.actions.find(function(x){return x.id===id}),u=effUser();if(!a||!canManage(a,u)){toast('You cannot change the due date');return}
  await saveAction(threadAdd(a,{by:u.email,kind:'due_changed',text:'Due date '+fmtDate(a.due)+' to '+fmtDate(due)+(why?': '+why:'')+'. The follow-up ladder restarts from the new date.'},{due:due}));
}
async function verifyAction(id,ok,note){
  if(!guardWrite())return;var a=S.actions.find(function(x){return x.id===id}),u=effUser();if(!a||!canVerify(a,u)){toast('Only the assigner can verify');return}
  if(ok)await saveAction(threadAdd(a,{by:u.email,kind:'verified',text:note||'Verified closed.'},{status:'Verified closed',verified_by:u.email,verified_at:nowISO()}));
  else{if(!note){toast('A reopen note is required');return}await saveAction(threadAdd(a,{by:u.email,kind:'reopened',text:note},{status:'In progress',closure:'',done_at:undefined}))}
}
async function cancelAction(id,why){
  if(!guardWrite())return;var a=S.actions.find(function(x){return x.id===id}),u=effUser();if(!a||!canManage(a,u))return;
  await saveAction(threadAdd(a,{by:u.email,kind:'cancelled',text:why||'Cancelled.'},{status:'Cancelled'}));
}
async function raiseAction(o){
  if(!guardWrite())return;var u=effUser(),now=nowISO();
  var id='M_'+Date.now().toString(36)+Math.random().toString(36).slice(2,4);
  var own=uByEmail(o.owner);
  var a={id:id,ref:hashRef(id),rule:'M',title:o.title,source:{label:o.source||'Raised by '+u.name,page:o.page||'actions',plant:o.plant||''},owner:o.owner,assigner:u.email,creator:u.email,department:o.department||u.department||'Sales',plant:o.plant||(own&&codesOf(own)[0])||'',group:o.group||'',customer:o.customer||'',
    due:o.due,next_step:o.next,value:Math.round(+o.value||0),status:'Open',created:now,updated:now,dependents:0,period:'manual',meta:{},need_help:false,thread:[{at:now,by:u.email,kind:'created',text:'Raised by '+u.name+'.'}]};
  if(S.demoMode)a.demo=true;
  await saveAction(a);return id;
}

/* ---- escalation ladder: drafts only, a person sends ---- */
function senderOf(a){
  if(a.assigner&&a.assigner.indexOf('Desk rule')!==0)return a.assigner;
  var c=a.plant?coordFor(a.plant):null;if(c)return c.email;var ow=uByEmail(a.owner),mg=ow&&ow.reports_to_email?uByEmail(ow.reports_to_email):null;return mg?mg.email:'*super';/* Q22 recommendation: plant Coordinator, else the owner's manager, else a Super admin */
}
function iAmSender(a,u){var s=senderOf(a);return s===u.email||(s==='*super'&&u.role==='Super admin')}
function ladderRecipients(a,step){
  var owner=uByEmail(a.owner);if(!owner)return null;
  var rep=owner.reports_to_email?uByEmail(owner.reports_to_email):null,hod=hodFor(a.department),mg=mgmtUsers();
  var l2=rep||hod||mg[0]||null;
  if(step==='Reminder'||step==='L1')return {to:owner,cc:[]};
  if(step==='L2')return {to:l2,cc:[owner]};
  var l3list=hod&&(!owner||hod.email!==owner.email)&&(!l2||hod.email!==l2.email)?[hod]:mg.filter(function(m){return m.email!==owner.email&&(!l2||m.email!==l2.email)});
  if(!l3list.length&&hod)l3list=[hod];if(!l3list.length)return {to:l2,cc:[owner]};
  var cc=[];if(rep&&rep.email!==l3list[0].email)cc.push(rep);cc.push(owner);l3list.slice(1).forEach(function(x){cc.push(x)});
  return {to:l3list[0],cc:cc};
}
var TPL={
 Reminder:{subj:'Reminder: {action_id} due {when}, {title}',body:'Hi {recipient},\n\nA reminder that {action_id} "{title}" is due {when}, {due_date}.\nNext step: {next_step}\nSource: {source_ref}\nValue at risk: {value_at_risk}\n\nPlease acknowledge or update it here: {link}\n\n{sender}',wa:'Reminder: {action_id} "{title}" is due {when} ({due_date}). Next step: {next_step}. Update here: {link}'},
 L1:{subj:'Overdue 1 day: {action_id}, {title}',body:'Hi {recipient},\n\n{action_id} "{title}" was due on {due_date} and is now {days_overdue} day(s) overdue.\nNext step: {next_step}\nSource: {source_ref}\nValue at risk: {value_at_risk}\nLast update: {last_update}\n\nPlease respond with an update and a new date, or mark it done with a closure note: {link}\n\n{sender}',wa:'{action_id} "{title}" is {days_overdue} day(s) overdue (was due {due_date}). Next step: {next_step}. Please update or close it here: {link}'},
 L2:{subj:'Overdue {days_overdue} days, for your attention: {action_id}, {title}',body:'Hi {recipient},\n\n{action_id} "{title}", owned by {owner}, was due on {due_date} and is {days_overdue} days overdue.\nNext step: {next_step}\nSource: {source_ref}\nValue at risk: {value_at_risk}\nLast update: {last_update}\nBlocked: {blocked}\n\nPlease speak with {owner} and help agree a date. Thread and responses: {link}\n\n{sender}',wa:'{action_id} "{title}" ({owner}) is {days_overdue} days overdue, due {due_date}. Next step: {next_step}. Please help move it: {link}'},
 L3:{subj:'Escalation, overdue {days_overdue} days: {action_id}, {title}',body:'Hi {recipient},\n\n{action_id} "{title}", owned by {owner} (reports to {reports_to}), was due on {due_date} and is {days_overdue} days overdue. It was reminded at 1 day and escalated to {reports_to} at 3 days.\nNext step: {next_step}\nSource: {source_ref}\nValue at risk: {value_at_risk}\nLast update: {last_update}\nBlocked: {blocked}\n\nYour decision is needed on whether to reassign, extend the date or close it. Thread, responses and log: {link}\n\n{sender}',wa:'Escalation: {action_id} "{title}" ({owner}) is {days_overdue} days overdue, due {due_date}. Reminded and escalated to {reports_to}. Please decide: reassign, extend or close. {link}'}
};
function fillTpl(t,v){
  /* a line holding a placeholder with no value is dropped whole; text from data is inserted as plain text */
  return t.split('\n').map(function(line){
    var drop=false;var out=line.replace(/\{(\w+)\}/g,function(m,k){var x=v[k];if(x==null||x===''){drop=true;return ''}return String(x)});
    return drop?null:out;
  }).filter(function(l){return l!==null}).join('\n');
}
function actionLink(a){return PAGE_URL+'#/action/'+a.id}
function lastUpdate(a){var th=(a.thread||[]).filter(function(e){return e.kind==='update'||e.kind==='note'}).slice(-1)[0];return th?th.text:''}
function buildDraft(a,step,today){
  var rc=ladderRecipients(a,step);if(!rc||!rc.to)return null;
  var owner=uByEmail(a.owner),rep=owner&&owner.reports_to_email?uByEmail(owner.reports_to_email):null,sender=effUser();
  var od=diffDays(today,a.due);
  var vars={recipient:(rc.to.name||'').split(' ')[0],owner:owner?owner.name:a.owner,reports_to:rep?rep.name:'',action_id:a.ref,title:a.title,due_date:fmtDate(a.due),days_overdue:od>0?od:'',next_step:a.next_step,
    value_at_risk:a.value>0?fmtMoney(a.value):'',source_ref:(a.source&&a.source.label)||'',last_update:lastUpdate(a),link:actionLink(a),blocked:a.status==='Blocked'?(a.blocked_reason||''):'',sender:sender?sender.name:'',when:today<a.due?'tomorrow':'today'};
  var t=TPL[step],subject=fillTpl(t.subj,vars),body=fillTpl(t.body,vars),wa=fillTpl(t.wa,Object.assign({},vars,{next_step:String(vars.next_step||'').replace(/[.\s]+$/,'')}));
  var num=String(rc.to.whatsapp_number||'').replace(/\D/g,'');
  return {id:'f_'+a.id+'_'+step+'_'+a.due,action_id:a.id,ref:a.ref,title:a.title,step:step,due:a.due,to_name:rc.to.name,to_email:rc.to.email,to_whatsapp:num,cc_email:rc.cc.map(function(x){return x.email}).join(','),subject:subject,body:body,wa_text:num?wa:'',link:actionLink(a),
    days_overdue:od>0?od:0,created_day:today,created_at:nowISO(),status:'Drafted',sender:senderOf(a),demo:a.demo||undefined};
}
async function runLadder(){
  var u=effUser();if(!u||readOnly()||S.ladBusy)return;
  if(!S.loaded.actions||!S.loaded.followups||!S.loaded.settings||!S.loaded.users)return;
  var today=TODAY(),sig=[today,S.actions.length,S.followups.length,S.actions.map(function(a){return a.status+a.due}).join('')].join('|');
  if(S.ladSig===sig)return;S.ladSig=sig;S.ladBusy=true;
  try{
    for(var i=0;i<S.actions.length;i++){
      var a=S.actions[i];if(LIVE_ST.indexOf(a.status)<0||!iAmSender(a,u))continue;
      var mine=S.followups.filter(function(f){return f.action_id===a.id&&f.due===a.due});
      if(mine.some(function(f){return f.created_day===today}))continue;/* one step per action per calendar day */
      var steps=[['Reminder',addDays(a.due,-CFG.remind_days_before)],['L1',addDays(a.due,CFG.L1_days)],['L2',addDays(a.due,CFG.L2_days)],['L3',addDays(a.due,CFG.L3_days)]];
      var next=null;
      for(var k=0;k<steps.length;k++){
        var st=steps[k];if(mine.some(function(f){return f.step===st[0]}))continue;
        if(st[0]==='Reminder'&&today>a.due)continue;/* due date has passed: no reminder */
        if(st[1]<=today){next=st[0];break}
        break;
      }
      if(!next)continue;
      var d=buildDraft(a,next,today);if(!d)continue;
      var ex=await dget('followups/'+d.id);if(ex.exists)continue;
      await dset('followups/'+d.id,d);
    }
  }catch(e){S.err=(S.err||'')+'ladder: '+dbErrText(e)+' '}
  S.ladBusy=false;
}
function afterData(){runEngine();runLadder()}
