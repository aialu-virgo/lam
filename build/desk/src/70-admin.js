/* ================= v0.9 Admin: plans workflow, settings, tools, roll-up rebuild, demo extras ================= */
S.adminTab='users';S.rbBusy=false;
function adminTabs(){
  var r=effRole();
  if(r==='Super admin')return [['users','Users'],['plants','Plants'],['potential','Market potential'],['transfers','Internal transfer customers'],['items','Item master'],['semp','Sales employees'],['aliases','Aliases'],['settings','Rules & settings'],['tools','Tools']];
  return [['potential','Market potential']];
}
function buildAdmin(){
  var tabs=adminTabs();if(!tabs.some(function(t){return t[0]===S.adminTab}))S.adminTab=tabs[0][0];
  $('#p-admin').innerHTML=(tabs.length>1?'<div class="tabs seg" role="tablist" style="align-self:flex-start">'+tabs.map(function(t){return '<button data-act="atab" data-t="'+t[0]+'" role="tab">'+t[1]+'</button>'}).join('')+'</div>':'')+'<div id="a-body"></div>';
}
function refreshAdmin(){var _e=$('#a-body');withScroll(_e,refreshAdmin0)}
function refreshAdmin0(){
  document.querySelectorAll('[data-act="atab"]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-t')===S.adminTab))});
  var el=$('#a-body');if(!el)return;
  var tabs=adminTabs();if(!tabs.some(function(t){return t[0]===S.adminTab}))S.adminTab=tabs[0][0];
  var focusId=document.activeElement&&document.activeElement.id,t=S.adminTab;
  var html=t==='users'?usersHtml():t==='plants'?plantsHtml():t==='transfers'?transfersHtml():t==='settings'?settingsHtml():t==='tools'?toolsHtml():t==='items'?itemsHtml():t==='semp'?sempHtml():t==='aliases'?aliasesHtml():potentialHtml();
  if(el.getAttribute('data-h')!==String(html.length)+t||(t!=='settings'&&t!=='aliases')){el.innerHTML=html;el.setAttribute('data-h',String(html.length)+t)}
  if(focusId){var f=document.getElementById(focusId);if(f&&f.focus){f.focus();try{var v=f.value;if(f.setSelectionRange&&f.type!=='number'&&f.type!=='email'&&f.type!=='date')f.setSelectionRange(v.length,v.length)}catch(e){}}}
}
/* ---- plan permissions ---- */
function planVisible(x){var sc=SC();if(!sc.plants)return true;return !!x.plant_code&&sc.plants.has(x.plant_code)}
function planGuard(x){
  var u=effUser();if(readOnly())return 'Viewing as another user: preview is read-only';
  if(['Super admin','Management / HO','HOD','Branch / depot manager'].indexOf(u.role)<0)return 'Your role cannot propose or approve sales targets';
  if(u.role==='Branch / depot manager'&&(!x.plant_code||!holdsPlant(u,x.plant_code)))return 'A Branch manager proposes targets for own plants only';
  return '';
}
function proposerOf(x){var rv=(x.revisions||[]).filter(function(r){return r.status==='Draft'}).slice(-1)[0];return rv?rv.by:''}
async function advancePot(id){
  var x=S.potential.find(function(p){return p._id===id});if(!x)return;var u=effUser();
  var g=planGuard(x);if(g){toast(g);return}
  if(isPlanLocked(x.fy_quarter)){toast('That quarter is locked');return}
  var nx={Draft:'Discussed',Discussed:'Approved'}[x.status];if(!nx){toast(x.status==='Approved'?'Use Lock quarter to freeze approved targets':'Nothing further');return}
  var last=(x.revisions||[]).slice(-1)[0]||{};
  if(nx==='Discussed'){var lastDraft=(x.revisions||[]).filter(function(r){return r.status==='Draft'}).slice(-1)[0]||{};
    if(!lastDraft.reason||!lastDraft.discussion_date||!lastDraft.participants){toast('Discussed needs a reason, a discussion date and the participants. Save a revision with all three first.');return}}
  if(nx==='Approved'){
    if(['Super admin','Management / HO'].indexOf(u.role)<0){toast('Approval is by SP Sir or a Management / HO user');return}
    if(proposerOf(x)===u.email){toast('The proposer cannot approve their own revision');return}
    if(x.share_pct===''||x.share_pct==null){toast('Set a share % before approval');return}
  }
  var revs=(x.revisions||[]).concat([{n:x.rev||1,at:nowISO(),by:u.email,status:nx,reason:'Status change',discussion_date:'',participants:'',change:x.status+' to '+nx}]);
  var doc=Object.assign({},x,{status:nx,revisions:revs.slice(-40)});delete doc._id;
  if(nx==='Approved'){var ap={potential_value_inr:+x.potential_value_inr||0,potential_qty_sheets:+x.potential_qty_sheets||0,potential_qty_sqft:+x.potential_qty_sqft||0,share_pct:+x.share_pct,rev:x.rev||1,by:u.email,at:nowISO()};doc.approved=ap;if(!doc.original)doc.original=ap}
  await dset('potential/'+id,doc);closeDlg();toast('Marked '+nx);
}
function senseHtml(x){
  if(noData()||!x.plant_code)return '';
  var f={plant:x.plant_code,group:x.product_group},q=x.fy_quarter,P=planQ(f,q);
  var ser=quarterSeries(f,undefined),closed=ser.filter(function(s){return !s.isCur}),ts=trendStats(closed.map(function(s){return s.A})),lastQ=prevQ(q),lastA=sumF(f,qMonths(lastQ)).n,lastOk=monthsLoaded(qMonths(lastQ),new Set([x.plant_code]));
  var draft=x.share_pct!==''&&x.share_pct!=null?leafTgt(x.potential_value_inr,x.share_pct):null;
  var tot=P.tgt-(approvedOf(x)?leafTgt(approvedOf(x).potential_value_inr,approvedOf(x).share_pct):0)+(draft!=null?draft:0);
  var sr=stretchOf(tot>0?tot:null,lastOk?lastA:null,ts);
  return '<div class="callout '+(sr.state==='stretch'?'warn':'')+'"><b>Sense-check · '+esc(plantShort(x.plant_code))+' · '+esc(x.product_group)+' (all segments)</b><br>Last quarter actual '+(lastOk?fmtMoney(lastA):'incomplete')+(sr.required!=null?' · target '+fmtMoney(tot)+' needs <b>'+fmtPct(sr.required,true)+'</b> QoQ; average of the quarters loaded is <b>'+fmtPct(sr.avg,true)+'</b>. '+(sr.state==='stretch'?'<span class="pill part">Stretch</span> for discussion, never blocks approval.':'Within '+CFG.stretch_multiple+'× the average.'):' · no Stretch check (history too short or no target).')+'</div>';
}
/* ---- settings tab ---- */
function settingsHtml(){
  var rows=SETTING_DEFS.map(function(d){var v=CFG[d[0]];return '<tr><td>'+esc(d[1])+'<div class="note mono">'+d[0]+'</div></td><td><input class="in" id="st-'+d[0]+'" value="'+esc(v)+'" '+(typeof d[2]==='number'?'inputmode="decimal"':'')+'></td><td><span class="pill '+(d[3]==='Brief §4'?'ok':'part')+'">'+esc(d[3])+'</span></td></tr>'}).join('');
  var caps=ROLES.map(function(r){return '<div class="fld"><label for="cap-'+slug(r)+'">'+esc(r)+'</label><input class="in" id="cap-'+slug(r)+'" value="'+esc(CFG.role_caps&&CFG.role_caps[r]||'')+'" placeholder="'+CFG.today_cap+'" inputmode="numeric"></div>'}).join('');
  return '<section class="card"><div class="hd"><h2>Rules and settings</h2><button class="btn pri" data-act="st-save"'+(readOnly()?' disabled':'')+'>Save settings</button></div><p class="note" style="margin:0">Every threshold behind a rule is editable. <b>Assumed</b> marks a value taken from the recommendation on an open question, or proposed in the design, until a Principal answers. Priority weights must total 100 (now '+(CFG.w_U+CFG.w_V+CFG.w_C+CFG.w_A+CFG.w_D)+'). Changes are logged.</p>'
   +'<div class="tw tall"><table><thead><tr><th>Setting</th><th>Value</th><th>Source</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
   +'<h3 style="margin:8px 0 0;font-size:13px">Today cap per role (1 to 20; blank = default; a per-user cap in Users wins)</h3><div class="fgrid">'+caps+'</div><div id="st-msg"></div></section>';
}
async function saveSettings(){
  if(!guardWrite())return;var doc={},errs=[];
  SETTING_DEFS.forEach(function(d){var el=document.getElementById('st-'+d[0]);if(!el)return;var v=el.value.trim();
    if(typeof d[2]==='number'){var n=Number(v);if(v===''||isNaN(n))errs.push(d[1]+' must be a number');else doc[d[0]]=n}else doc[d[0]]=v});
  if(doc.w_U+doc.w_V+doc.w_C+doc.w_A+doc.w_D!==100)errs.push('Priority weights must total 100 (they total '+(doc.w_U+doc.w_V+doc.w_C+doc.w_A+doc.w_D)+')');
  if(doc.month_compare!=='same_position_prior_quarter'&&doc.month_compare!=='previous_month')errs.push('Month comparison must be same_position_prior_quarter or previous_month. There is no last-year option.');
  if(!/^FY\d\d-Q[1-4]$/.test(doc.history_start||''))errs.push('History start must look like FY26-Q1');
  if(doc.holidays&&doc.holidays.split(/[,;\s]+/).filter(Boolean).some(function(h){return !/^\d{4}-\d\d-\d\d$/.test(h)}))errs.push('Holidays must be YYYY-MM-DD dates');
  doc.role_caps={};ROLES.forEach(function(r){var v=document.getElementById('cap-'+slug(r)).value.trim();if(v){var n=Number(v);if(!(n>=1&&n<=20&&Math.floor(n)===n))errs.push('Cap for '+r+' must be 1 to 20');else doc.role_caps[r]=n}});
  if(errs.length){$('#st-msg').innerHTML='<div class="banner err">'+esc(errs.join('. '))+'</div>';return}
  await dset('settings/main',doc);await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:S.viewer.email,event:'settings changed'});
  $('#st-msg').innerHTML='<div class="banner ok">Saved.</div>';S.engSig=null;S.ladSig=null;toast('Settings saved');
}
/* ---- tools tab ---- */
function toolsHtml(){
  var rc=Object.keys(S.rollDocs).length,miss=missingRolls().length;
  return integrityHtml()+'<section class="card"><div class="hd"><h2>Tools</h2></div>'
   +'<div class="kpis"><div class="kpi"><small>Roll-up documents</small><b>'+fmtN(rc)+'</b><small>'+(miss?miss+' plant-months still to build':'all plant-months have one')+'</small></div><div class="kpi"><small>Rules engine</small><b style="font-size:13px;font-family:var(--font)">'+esc(S.engStatus||'not run yet')+'</b></div></div>'
   +'<div class="row"><button class="btn" data-act="rb-run"'+(S.rbBusy?' disabled':'')+'>Rebuild roll-ups now</button><button class="btn" data-act="rules-run">Run the rules now</button></div>'
   +'<p class="note">Roll-ups are the small per plant × month summaries every business page reads. They are written on each upload; this rebuilds any that are missing (for example data loaded earlier).</p>'
   +'<h3 style="margin:8px 0 0;font-size:13px">Test clock (this browser only)</h3><div class="row"><div class="fld"><label for="tc-d">Pretend today is</label><input id="tc-d" type="date" class="in" value="'+TODAY()+'"></div><button class="btn" data-act="clock-set">Set</button><button class="btn" data-act="clock-reset">Use the real date</button></div><p class="note">For the escalation walk-through: set a date, open Action Center, and the next ladder step is drafted. The real date is '+fmtDate(realToday())+'. The clock never changes stored data other than the drafts it causes.</p></section>';
}
function missingRolls(){
  var out=[];Object.keys(S.cells).forEach(function(cid){var c=S.cells[cid];if(c.entity!=='INV')return;Object.keys(c.plants||{}).forEach(function(p){var id=p+'-'+c.ym,r=S.rollDocs[id];if(!r||r.src!==c.plants[p].at)out.push({p:p,ym:c.ym,info:c.plants[p],id:id})})});
  return out;
}
async function ensureRolls(force){
  if(S.rbBusy||readOnly()||!S.rollLoaded||!S.loaded.cells)return;var u=effUser();if(!u||u.role!=='Super admin')return;
  var miss=missingRolls();if(!miss.length)return;if(!force&&S.rbSig===miss.length+'|'+Object.keys(S.rollDocs).length)return;
  S.rbBusy=true;S.rbSig=null;var n=0;
  try{
    var q=miss.slice(),total=miss.length;
    var worker=async function(){
      while(q.length){
        var m=q.shift();DS.status='Building roll-ups '+(total-q.length)+' of '+total;if(n%5===0)schedule();
        var rows=new Map();
        for(var k=0;k<(m.info.chunks||0);k++){var snap=await dget('inv/'+m.info.sys+'-'+m.p+'-'+m.ym+'-'+k);if(!snap.exists)continue;var o=JSON.parse(await ungz(snap.data().z));o.a.forEach(function(a){var key=a[3]+'\u0001'+a[2]+'\u0001'+a[4];var r=rows.get(key);if(!r){r=[a[3],a[2],a[4],0,0,0,0,0];rows.set(key,r)}r[3]+=a[5];r[4]+=a[6];r[5]+=a[7];r[6]+=a[8];r[7]+=a[9]})}
        var rr=Array.from(rows.values()).map(function(r){return [r[0],r[1],r[2],r[3],r[4],r[5],Math.round(r[6]),Math.round(r[7]*100)/100]});
        await writeRoll(m.p,m.ym,m.info.sys,rr,m.info.at,m.info.demo);n++;
      }
    };
    await Promise.all([worker(),worker(),worker()]);
  }catch(e){S.err=(S.err||'')+'roll-up: '+dbErrText(e)+' '}
  S.rbBusy=false;DS.status='ready';S.rbSig=missingRolls().length+'|'+Object.keys(S.rollDocs).length;schedule();
}
/* ---- integrity check: closed-quarter and lock state against the Super-admin audit trail ---- */
S.integrity=[];S.integSig='';
function integrityCheck(){
  var u=realUser();if(!u||u.role!=='Super admin'||!S.loaded.periods||!S.loaded.cells||!S.loaded.audit||!S.loaded.users||!S.loaded.potential)return;
  var sig=[Object.keys(S.periods).length,Object.keys(S.cells).length,S.audit.length,S.potential.length,Object.keys(S.planlocks).length].join('|')+JSON.stringify(Object.keys(S.periods).map(function(q){return S.periods[q].status+(S.periods[q].plan_locked?1:0)}));
  var sigAll=sig+S.potVer+S.audit.map(function(a){return a._id+(a.to||'')}).join(',')+S.cellsSigTick;
  if(S.integSig===sigAll)return;S.integSig=sigAll;
  var sup={};SEED_SUPER.forEach(function(e){sup[e]=1});S.users.forEach(function(x){if(x.role==='Super admin'&&x.active!==false)sup[x.email]=1});
  var acked={};S.audit.forEach(function(a){if(a.event==='integrity accepted')(a.keys||[]).forEach(function(k){acked[k]=1})});
  var out=[],add=function(k,txt){if(!acked[k])out.push({key:k,text:txt})};
  var byQ={};S.audit.forEach(function(a){if(a.sig&&a.q){(byQ[a.q]=byQ[a.q]||[]).push(a)}});Object.keys(byQ).forEach(function(q){byQ[q].sort(function(a,b){return a.at<b.at?-1:1})});
  var qs={};Object.keys(S.periods).forEach(function(q){qs[q]=1});Object.keys(byQ).forEach(function(q){qs[q]=1});
  Object.keys(qs).forEach(function(q){
    var p=S.periods[q],cur=p?sigOf(p.status,p.plan_locked):'absent',list=byQ[q]||[],last=list[list.length-1];
    if(!p){if(last&&last.sig!=='open|0')add('period:'+q+':absent',qLabel(q)+' was '+last.sig.replace('|0','').replace('|1',' and plan-locked')+' in the log but its period record is gone.');return}
    if(cur==='open|0'&&!last)return;
    if(!last)add('period:'+q+':'+cur,qLabel(q)+' is '+(p.status==='closed'?'closed':'')+(p.plan_locked?' plan-locked':'')+' with no Super-admin log entry.');
    else if(last.sig!==cur)add('period:'+q+':'+cur,qLabel(q)+' state ('+cur.replace('|0','').replace('|1',' + plan-locked')+') does not match the last logged state ('+last.sig.replace('|0','').replace('|1',' + plan-locked')+' by '+last.by+', '+istStr(last.at)+').');
    else if(!sup[last.by])add('period:'+q+':by:'+last.by,qLabel(q)+' state was logged by '+last.by+', who is not a Super admin.');
  });
  Object.keys(S.periods).forEach(function(q){
    var p=S.periods[q];if(p.status!=='closed')return;
    var rel=S.audit.filter(function(a){return a.event==='closed quarter reloaded'&&(a.quarters||[]).indexOf(q)>=0&&sup[a.by]});
    qMonths(q).forEach(function(ym){var c=S.cells['INV_'+ym];if(!c)return;Object.keys(c.plants||{}).forEach(function(pl){var at=c.plants[pl].at||'';
      if(p.closed_at&&at<=p.closed_at)return;
      if(rel.some(function(a){return a.from<=at&&(!a.to||at<=a.to)}))return;
      add('data:'+ym+'|'+pl+'|'+at,'Closed '+qLabel(q)+': invoice data for plant '+pl+' in '+ymLabel(ym)+' changed '+istStr(at)+' with no reload entry.')})});
  });
  S.potential.forEach(function(x){
    var q=x.fy_quarter;if(!isPlanLocked(q))return;
    var la=(byQ[q]||[]).filter(function(a){return a.event==='plan locked'}).slice(-1)[0],lockAt=la?la.at:(S.planlocks[q]&&S.planlocks[q].at);if(!lockAt)return;
    var rv=(x.revisions||[]).slice(-1)[0];if(rv&&rv.at>lockAt)add('plan:'+x._id+'|'+rv.at,'Locked '+qLabel(q)+': plan '+(x.plant_code||'')+' '+(x.product_group||'')+' '+(x.customer_segment||'')+' changed '+istStr(rv.at)+' after the lock.');
  });
  S.integrity=out;S.lastHtml='';schedule();
}
S.cellsSigTick=0;
function integrityHtml(){
  var l=S.integrity||[];if(!l.length)return '';
  return '<div class="banner err" role="alert" style="flex-direction:column;align-items:flex-start"><b>Integrity alert · '+l.length+' closed-quarter or lock change'+(l.length>1?'s':'')+' without a matching Super-admin log entry</b>'+l.slice(0,8).map(function(x){return '<span>'+esc(x.text)+'</span>'}).join('')+(l.length>8?'<span>and '+(l.length-8)+' more (Admin › Tools)</span>':'')+'<span class="note">Someone wrote to the database directly, or a record was edited outside the page. Check who, then accept the current state to log it.</span><button class="btn sm" data-act="integ-accept">Accept the current state (logged)</button></div>';
}
var _afterData=afterData;
afterData=function(){ensureRolls();runEngine();runLadder();integrityCheck()};
Object.assign(handlers,{
 'st-save':function(){return saveSettings()},
 'rb-run':function(){return ensureRolls(true)},
 'integ-accept':async function(){if(!superOnly('accept the current state'))return;var keys=(S.integrity||[]).map(function(x){return x.key});if(!keys.length)return;await auditW('integrity accepted','',{keys:keys});await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:S.viewer.email,event:'integrity alert accepted',count:keys.length});S.integSig='';toast('Logged')},
 'rules-run':function(){S.engSig=null;S.ladSig=null;return runEngine()},
 'clock-set':function(){var d=gv('tc-d');if(/^\d{4}-\d\d-\d\d$/.test(d)){lsSet('desk-today',d===realToday()?'':d);if(d===realToday()){try{localStorage.removeItem('desk-today')}catch(e){}}S.engSig=null;S.ladSig=null;S.lastHtml='';DS.cache={};schedule();toast('Test clock set')}}
});

/* ================= demo extras: plans, people, actions, open-item stores ================= */
async function demoPeople(){
  var def=[['super@demo','Demo Super Admin','Super admin','HO','','', '919000000001'],['mgmt@demo','Demo Management','Management / HO','HO','','','919000000002'],['hod.sales@demo','Demo HOD Sales','HOD','Sales','','mgmt@demo','919000000003'],
   ['bm.a@demo','Demo Branch Manager A','Branch / depot manager','Sales','1012','hod.sales@demo','919000000004'],['bm.b@demo','Demo Branch Manager B','Branch / depot manager','Sales','1013','hod.sales@demo','919000000005'],
   ['se.s1@demo','Demo Sales 1','Sales executive','Sales','','bm.a@demo','919000000006'],['se.s2@demo','Demo Sales 2','Sales executive','Sales','','bm.a@demo','919000000007'],
   ['coord.a@demo','Demo Coordinator A','Coordinator (sales / CRR)','CRR','1012','hod.sales@demo','919000000008'],['acc.ab@demo','Demo Accounts AB','Accounts','Accounts','1012;1013','mgmt@demo','919000000009'],['plant.b@demo','Demo Plant B','Plant','Plant','1013','mgmt@demo','']];
  for(var i=0;i<def.length;i++){var d=def[i];await dset('users/'+slug(d[0]),{email:d[0],name:d[1],role:d[2],department:d[3],plant_codes:d[4],reports_to_email:d[5],whatsapp_number:d[6],today_cap:5,active:true,sales_employee_code:d[2]==='Sales executive'?d[1]:'',demo:true})}
}
async function demoPlans(facts,cur){
  var qs=closedQuarters().concat([cur]),plants=['1001','1011','1012','1013'],groups=['Laminate','Door','PVC sheet'],segs=[['Dealer',0.6],['Project',0.4]],n=0,R=(function(){var a=7;return function(){a=(a*9301+49297)%233280;return a/233280}})();
  for(var qi=0;qi<qs.length;qi++){
    var q=qs[qi],ms=qMonths(q),isCur=q===cur;
    for(var pi=0;pi<plants.length;pi++)for(var gi=0;gi<groups.length;gi++){
      var A=0;(isCur?qMonths(prevQ(q)):ms).forEach(function(m){A+=facts[plants[pi]+'|'+m+'|'+groups[gi]]||0});if(isCur)A*=1.04;if(A<=0)continue;
      var factor=0.92+R()*0.2,tg=A*factor;
      for(var si=0;si<segs.length;si++){
        var sg=segs[si],share=8,pot=Math.round(tg*sg[1]/(share/100)),sq=Math.round(pot/45);
        var id=slug([q,plants[pi],groups[gi],sg[0]].join('_')),orig={potential_value_inr:Math.round(pot*0.96),potential_qty_sheets:Math.round(sq/32),potential_qty_sqft:Math.round(sq*0.96),share_pct:share,rev:1,by:'mgmt@demo',at:nowISO()};
        var ap={potential_value_inr:pot,potential_qty_sheets:Math.round(sq/32),potential_qty_sqft:sq,share_pct:share,rev:isCur?3:2,by:'mgmt@demo',at:nowISO()};
        var draftOnly=isCur&&plants[pi]==='1013'&&groups[gi]==='Door';
        var revs=[{n:1,at:nowISO(),by:'bm.a@demo',status:'Draft',reason:'DEMO first proposal',discussion_date:'2026-09-18',participants:'DEMO branch team',change:'new figure'},{n:1,at:nowISO(),by:'mgmt@demo',status:'Discussed',reason:'Status change',change:'Draft to Discussed'}];
        if(!draftOnly){revs.push({n:1,at:nowISO(),by:'mgmt@demo',status:'Approved',reason:'Status change',change:'Discussed to Approved'},{n:2,at:nowISO(),by:'bm.a@demo',status:'Draft',reason:'DEMO dealer survey up',discussion_date:'2026-09-25',participants:'DEMO team',change:'revised'},{n:2,at:nowISO(),by:'mgmt@demo',status:'Approved',reason:'Status change',change:'Draft to Approved'})}
        var doc={fy_quarter:q,plant_code:plants[pi],territory:'',product_group:groups[gi],customer_segment:sg[0],potential_value_inr:pot,potential_qty_sheets:Math.round(sq/32),potential_qty_sqft:sq,share_pct:share,source_type:'branch estimate',source_note:'DEMO',owner_email:'bm.a@demo',status:draftOnly?'Draft':(isCur?'Approved':'Locked'),rev:ap.rev,revisions:revs,demo:true};
        if(!draftOnly){doc.approved=ap;doc.original=orig}
        await dset('potential/'+id,doc);n++;
      }
    }
    if(!isCur){var pr=S.periods[q];await dset('periods/'+q,Object.assign({fy_quarter:q,status:'open'},pr||{},{plan_locked:true,demo:true,_id:undefined}));await auditW('plan locked',q,{sig:sigOf((pr&&pr.status)||'open',true),demo:true})}
  }
  return n;
}
async function demoOps(){
  if(!window.DemoGen||!DemoGen.ops)return;
  var today=TODAY(),plants=['1001','1011','1012','1013'].map(function(c){return {code:c}}),g=gridQuarters(),months=[];
  g.list.forEach(function(k){qMonths(k).forEach(function(m){if(m<=today.slice(0,7))months.push(m)})});
  var plan=qMonths(g.cur).concat(qMonths(prevQ(g.cur)));
  var o=DemoGen.ops({today:today,plants:plants,months:months,planMonths:plan,seed:31});
  var i;
  for(i=0;i<o.receivables.length;i++)await dset('receivables/'+o.receivables[i].plant,Object.assign({demo:true},o.receivables[i]));
  for(i=0;i<o.collections.length;i++){var c=o.collections[i];await dset('collections/'+c.plant+'-'+c.ym,Object.assign({demo:true},c))}
}
async function demoActions(){
  var t=TODAY(),mk=function(id,title,owner,assigner,due,val,extra){var now=nowISO();return Object.assign({id:id,ref:hashRef(id),rule:'M',title:title,source:{label:'DEMO manual action',page:'actions',plant:'1012'},owner:owner,assigner:assigner,creator:assigner,department:'Sales',plant:'1012',group:'',customer:'DEMOCU000007',due:due,next_step:'Update the status and the next date.',value:val,status:'Open',created:now,updated:now,dependents:0,period:'manual',meta:{},need_help:false,demo:true,thread:[{at:now,by:assigner,kind:'created',text:'DEMO action.'}]},extra||{})};
  var list=[];
  for(var i=0;i<12;i++)list.push(mk('DEMO_A'+(i+1),'DEMO action '+(i+1)+(i%3===0?' · collect overdue':i%3===1?' · confirm payment plan':' · review plan'),'bm.a@demo','hod.sales@demo',addDays(t,i-3),(i+1)*150000,{plant:'1012',customer:'DEMOCU'+pad(i+2,6)}));
  list.push(mk('DEMO_LAD','DEMO ladder example · overdue receivable','se.s1@demo','coord.a@demo',addDays(t,2),850000,{status:'In progress',plant:'1012'}));
  list.push(mk('DEMO_VER','DEMO closure waiting for verification','bm.a@demo','hod.sales@demo',addDays(t,1),0,{status:'Done',closure:'Dispatched and confirmed with the customer.',done_at:nowISO()}));
  list.push(mk('DEMO_S1','DEMO call customer','se.s1@demo','bm.a@demo',addDays(t,1),300000,{plant:'1012'}));
  for(i=0;i<list.length;i++)await dset('actions/'+list[i].id,list[i]);
}
/* synthetic stock snapshots (batch layout, two warehouses per plant): month-end and today */
async function demoStock(){
  if(!window.DemoGen||!DemoGen.stockFile)return;
  var idx=await loadItemIdx(),items=Array.from(idx.keys()).filter(function(c){return /^DEMOFG/.test(c)});if(!items.length)return;
  var today=TODAY(),me=addDays(today.slice(0,7)+'-01',-1),plants=['1001','1011','1012','1013'].map(function(c){return {code:c}}),saveU=U;
  var asOfs=[me,today];
  for(var i=0;i<asOfs.length;i++){
    var f=DemoGen.stockFile({kind:'batch',asOf:asOfs[i],plants:plants,items:items,seed:41+i});
    U=newU();U.kind='stock';U.entity='ST';U.sk='batch';U.sys='B1';U.name='DEMO Stock '+asOfs[i]+' (synthetic).csv';U.headers=f.headers;U.rows=f.rows;U.map=stockDefaultMap('batch',f.headers);U.asOf=asOfs[i];U.demoFlag=true;
    U.res=await stockParse();U.stage='validated';await stockLoad();
  }
  U=saveU;
}
/* synthetic masters: written only when no real master is loaded; flagged demo so Clear demo removes only these */
async function demoMasters(){
  var by=whoAmI(),now=nowISO(),pl=function(c){return 'DEMO plant '+c};
  if(!S.salesMaster){
    var P=[['DEMO-M-A','DEMO Manager A','Zone 1','1012','Branch Manager','Branch / depot manager','','DEMO-H-1'],['DEMO-M-B','DEMO Manager B','Zone 2','1013','Branch Manager','Branch / depot manager','','DEMO-H-1'],['DEMO-H-1','DEMO Head Sales','Zone 1','1011','Zonal Head','','','']];
    var sp=[['DEMO Sales 1','Zone 1','1012','DEMO-M-A'],['DEMO Sales 2','Zone 1','1012','DEMO-M-A'],['DEMO Sales 3','Zone 2','1013','DEMO-M-B'],['DEMO Sales 4','Zone 2','1013','DEMO-M-B'],['DEMO Sales 5','Zone 3','1011','DEMO-H-1'],['DEMO Sales 6','Zone 3','1001','DEMO-H-1']];
    var people=P.map(function(x){return [x[0],x[1],x[2],x[3],pl(x[3]),x[4],x[5],'','','','',x[7],'','']});
    sp.forEach(function(x,i){people.push(['DEMO-E-'+pad(i+1,3),x[0],x[1],x[2],pl(x[2]),'Sales Executive','Sales executive','','','','',x[3],'',''])});
    /* DEMO Sales 7 is left out on purpose: the match rate shows one unmatched name and the R8 hint */
    var uid='udemo'+Date.now().toString(36);
    await dset('salesmaster/main',{z:await gz(JSON.stringify(people)),n:people.length,at:now,by:by,file:'DEMO sales employees (synthetic)',sheets:['DEMO'],read:people.length,rejected:0,upload:uid,demo:true,fmt:'gz-json v3: [code,name,zone,plant,plantRaw,designation,role,email,whatsapp,slpCode,b1Name,reportsToCode,endDate,altCode]'});
    await dset('uploads/'+uid,{at:now,by:by,sys:'B1',entity:'SE',file:'DEMO sales employees (synthetic)',size:0,mode:'master',periodLabel:'Sales employees: DEMO',read:people.length,loaded:people.length,rejected:1,warned:0,status:'Partial',demo:true});
  }
  if(!S.itemMeta){
    var items=[],sizes=[['8X4',32],['7X3',21],['6X4',24]],g=0;
    for(var i=1;i<=24;i++){var z=sizes[i%3];items.push(['DEMOFG'+pad(i,5),i%6===0?1:0,z[1],i%2?1:0.8,'Pcs',true,z[0]])}
    var uid2='udemoi'+Date.now().toString(36);
    await dset('items/c0',{z:await gz(JSON.stringify(items)),n:items.length,i:0,at:now,by:by,fmt:'gz-json v1: [code,group 0 Laminate 1 Door 2 PVC sheet 3 Compact board,sqft per sheet,thickness mm,uom,active,size]',demo:true});
    await dset('itemmeta/main',{at:now,by:by,file:'DEMO items (synthetic)',sheet:'DEMO',read:items.length,loaded:items.length,out_of_scope:0,rejected:0,warned:0,by_group:{Laminate:20,Door:4},chunks:1,upload:uid2,demo:true});
    await dset('uploads/'+uid2,{at:now,by:by,sys:'B1',entity:'IT',file:'DEMO items (synthetic)',size:0,mode:'master',periodLabel:'Item master snapshot',read:items.length,loaded:items.length,rejected:0,warned:0,status:'Loaded',demo:true});
  }
}
async function demoExtras(facts){
  await demoMasters();
  await demoStock();
  await demoPeople();
  var n=await demoPlans(facts,gridQuarters().cur);
  await demoOps();
  await demoActions();
  return n;
}
async function demoClearExtras(){
  var cols=[['actions',S.actions],['followups',S.followups],['orders',S.orders],['deliveries',S.deliv],['receivables',S.recv],['collections',S.coll],['stock',S.stock],['roll',Object.keys(S.rollDocs).map(function(k){return S.rollDocs[k]})],['users',S.users],['audit',S.audit]];
  for(var c=0;c<cols.length;c++){var list=cols[c][1].filter(function(x){return x.demo});
    if(cols[c][0]==='roll')list=list.filter(function(x){var ce=S.cells['INV_'+x.ym],cp=ce&&ce.plants&&ce.plants[x.plant];return !(cp&&!cp.demo)});/* never delete a roll doc that sits on a real plant-month */for(var i=0;i<list.length;i++)await ddel(cols[c][0]+'/'+list[i]._id)}
}
