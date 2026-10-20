/* ================= v0.9 Admin: plans workflow, settings, tools, roll-up rebuild, demo extras ================= */
S.adminTab='users';S.rbBusy=false;
function adminTabs(){
  var r=effRole();
  if(r==='Super admin')return [['users','Users'],['plants','Plants'],['potential','Market potential'],['transfers','Internal transfer customers'],['settings','Rules & settings'],['tools','Tools']];
  return [['potential','Market potential']];
}
function buildAdmin(){
  var tabs=adminTabs();if(!tabs.some(function(t){return t[0]===S.adminTab}))S.adminTab=tabs[0][0];
  $('#p-admin').innerHTML=(tabs.length>1?'<div class="tabs seg" role="tablist" style="align-self:flex-start">'+tabs.map(function(t){return '<button data-act="atab" data-t="'+t[0]+'" role="tab">'+t[1]+'</button>'}).join('')+'</div>':'')+'<div id="a-body"></div>';
}
function refreshAdmin(){
  document.querySelectorAll('[data-act="atab"]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-t')===S.adminTab))});
  var el=$('#a-body');if(!el)return;
  var tabs=adminTabs();if(!tabs.some(function(t){return t[0]===S.adminTab}))S.adminTab=tabs[0][0];
  var focusId=document.activeElement&&document.activeElement.id,t=S.adminTab;
  var html=t==='users'?usersHtml():t==='plants'?plantsHtml():t==='transfers'?transfersHtml():t==='settings'?settingsHtml():t==='tools'?toolsHtml():potentialHtml();
  if(el.getAttribute('data-h')!==String(html.length)+t||t!=='settings'){el.innerHTML=html;el.setAttribute('data-h',String(html.length)+t)}
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
  if(S.periods[x.fy_quarter]&&S.periods[x.fy_quarter].plan_locked){toast('That quarter is locked');return}
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
  return '<div class="callout '+(sr.state==='stretch'?'warn':'')+'"><b>Sense-check · '+esc(plantShort(x.plant_code))+' · '+esc(x.product_group)+' (all segments)</b><br>Last quarter actual '+(lastOk?fmtMoney(lastA):'incomplete')+(sr.required!=null?' · target '+fmtMoney(tot)+' needs <b>'+fmtPct(sr.required,true)+'</b> QoQ; 12-qtr average is <b>'+fmtPct(sr.avg,true)+'</b>. '+(sr.state==='stretch'?'<span class="pill part">Stretch</span> for discussion, never blocks approval.':'Within '+CFG.stretch_multiple+'× the average.'):' · no Stretch check (history too short or no target).')+'</div>';
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
  if(doc.holidays&&doc.holidays.split(/[,;\s]+/).filter(Boolean).some(function(h){return !/^\d{4}-\d\d-\d\d$/.test(h)}))errs.push('Holidays must be YYYY-MM-DD dates');
  doc.role_caps={};ROLES.forEach(function(r){var v=document.getElementById('cap-'+slug(r)).value.trim();if(v){var n=Number(v);if(!(n>=1&&n<=20&&Math.floor(n)===n))errs.push('Cap for '+r+' must be 1 to 20');else doc.role_caps[r]=n}});
  if(errs.length){$('#st-msg').innerHTML='<div class="banner err">'+esc(errs.join('. '))+'</div>';return}
  await dset('settings/main',doc);await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:S.viewer.email,event:'settings changed'});
  $('#st-msg').innerHTML='<div class="banner ok">Saved.</div>';S.engSig=null;S.ladSig=null;toast('Settings saved');
}
/* ---- tools tab ---- */
function toolsHtml(){
  var rc=Object.keys(S.rollDocs).length,miss=missingRolls().length;
  return '<section class="card"><div class="hd"><h2>Tools</h2></div>'
   +'<div class="kpis"><div class="kpi"><small>Roll-up documents</small><b>'+fmtN(rc)+'</b><small>'+(miss?miss+' plant-months still to build':'all plant-months have one')+'</small></div><div class="kpi"><small>Rules engine</small><b style="font-size:13px;font-family:var(--font)">'+esc(S.engStatus||'not run yet')+'</b></div></div>'
   +'<div class="row"><button class="btn" data-act="rb-run"'+(S.rbBusy?' disabled':'')+'>Rebuild roll-ups now</button><button class="btn" data-act="rules-run">Run the rules now</button></div>'
   +'<p class="note">Roll-ups are the small per plant × month summaries every business page reads. They are written on each upload; this rebuilds any that are missing (for example data loaded by desk-v0.1).</p>'
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
    for(var i=0;i<miss.length;i++){
      var m=miss[i];DS.status='Building roll-ups '+(i+1)+' of '+miss.length;schedule();
      var rows=new Map();
      for(var k=0;k<(m.info.chunks||0);k++){var snap=await dget('inv/'+m.info.sys+'-'+m.p+'-'+m.ym+'-'+k);if(!snap.exists)continue;var o=JSON.parse(await ungz(snap.data().z));o.a.forEach(function(a){var key=a[3]+'\u0001'+a[2]+'\u0001'+a[4];var r=rows.get(key);if(!r){r=[a[3],a[2],a[4],0,0,0,0,0];rows.set(key,r)}r[3]+=a[5];r[4]+=a[6];r[5]+=a[7];r[6]+=a[8];r[7]+=a[9]})}
      var rr=Array.from(rows.values()).map(function(r){return [r[0],r[1],r[2],r[3],r[4],r[5],Math.round(r[6]),Math.round(r[7]*100)/100]});
      await writeRoll(m.p,m.ym,m.info.sys,rr,m.info.at,m.info.demo);n++;
    }
  }catch(e){S.err=(S.err||'')+'roll-up: '+dbErrText(e)+' '}
  S.rbBusy=false;DS.status='ready';S.rbSig=missingRolls().length+'|'+Object.keys(S.rollDocs).length;schedule();
}
var _afterData=afterData;
afterData=function(){ensureRolls();runEngine();runLadder()};
Object.assign(handlers,{
 'st-save':function(){return saveSettings()},
 'rb-run':function(){return ensureRolls(true)},
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
  var qs=closedQuarters().concat([cur]),plants=['1001','1011','1012','1013'],groups=['Laminate','Door'],segs=[['Dealer',0.6],['Project',0.4]],n=0,R=(function(){var a=7;return function(){a=(a*9301+49297)%233280;return a/233280}})();
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
    if(!isCur){var pr=S.periods[q];await dset('periods/'+q,Object.assign({fy_quarter:q,status:'open'},pr||{},{plan_locked:true,demo:true,_id:undefined}))}
  }
  return n;
}
async function demoOps(){
  if(!window.DemoGen||!DemoGen.ops)return;
  var today=TODAY(),plants=['1001','1011','1012','1013'].map(function(c){return {code:c}}),g=gridQuarters(),months=[];
  g.list.forEach(function(k){qMonths(k).forEach(function(m){if(m<=today.slice(0,7))months.push(m)})});
  var plan=qMonths(g.cur).concat(qMonths(prevQ(g.cur)));
  var o=DemoGen.ops({today:today,plants:plants,months:months,planMonths:plan,seed:31});
  for(var i=0;i<o.orders.length;i++)await dset('orders/'+o.orders[i].plant,Object.assign({demo:true},o.orders[i]));
  for(i=0;i<o.deliveries.length;i++)await dset('deliveries/'+o.deliveries[i].plant,Object.assign({demo:true},o.deliveries[i]));
  for(i=0;i<o.receivables.length;i++)await dset('receivables/'+o.receivables[i].plant,Object.assign({demo:true},o.receivables[i]));
  for(i=0;i<o.stock.length;i++)await dset('stock/'+o.stock[i].plant,Object.assign({demo:true},o.stock[i]));
  for(i=0;i<o.collections.length;i++){var c=o.collections[i];await dset('collections/'+c.plant+'-'+c.ym,Object.assign({demo:true},c))}
}
async function demoActions(){
  var t=TODAY(),mk=function(id,title,owner,assigner,due,val,extra){var now=nowISO();return Object.assign({id:id,ref:hashRef(id),rule:'M',title:title,source:{label:'DEMO manual action',page:'actions',plant:'1012'},owner:owner,assigner:assigner,creator:assigner,department:'Sales',plant:'1012',group:'',customer:'DEMOCU000007',due:due,next_step:'Update the status and the next date.',value:val,status:'Open',created:now,updated:now,dependents:0,period:'manual',meta:{},need_help:false,demo:true,thread:[{at:now,by:assigner,kind:'created',text:'DEMO action.'}]},extra||{})};
  var list=[];
  for(var i=0;i<12;i++)list.push(mk('DEMO_A'+(i+1),'DEMO action '+(i+1)+(i%3===0?' · collect overdue':i%3===1?' · confirm dispatch':' · review plan'),'bm.a@demo','hod.sales@demo',addDays(t,i-3),(i+1)*150000,{plant:'1012',customer:'DEMOCU'+pad(i+2,6)}));
  list.push(mk('DEMO_LAD','DEMO ladder example · overdue receivable','se.s1@demo','coord.a@demo',addDays(t,2),850000,{status:'In progress',plant:'1012'}));
  list.push(mk('DEMO_VER','DEMO closure waiting for verification','bm.a@demo','hod.sales@demo',addDays(t,1),0,{status:'Done',closure:'Dispatched and confirmed with the customer.',done_at:nowISO()}));
  list.push(mk('DEMO_S1','DEMO call customer','se.s1@demo','bm.a@demo',addDays(t,1),300000,{plant:'1012'}));
  for(i=0;i<list.length;i++)await dset('actions/'+list[i].id,list[i]);
}
async function demoExtras(facts){
  await demoPeople();
  var n=await demoPlans(facts,gridQuarters().cur);
  await demoOps();
  await demoActions();
  return n;
}
async function demoClearExtras(){
  var cols=[['actions',S.actions],['followups',S.followups],['orders',S.orders],['deliveries',S.deliv],['receivables',S.recv],['collections',S.coll],['stock',S.stock],['roll',Object.keys(S.rollDocs).map(function(k){return S.rollDocs[k]})],['users',S.users]];
  for(var c=0;c<cols.length;c++){var list=cols[c][1].filter(function(x){return x.demo});for(var i=0;i<list.length;i++)await ddel(cols[c][0]+'/'+list[i]._id)}
}
