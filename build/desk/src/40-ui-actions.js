/* ================= v0.9 UI: Today, Action Center, thread, follow-ups, action log ================= */
var STATUS_LADDER=['Open','Acknowledged','In progress','Done','Verified closed'];
function pillFor(st){var m={'Open':'info','Acknowledged':'info','In progress':'info','Done':'part','Verified closed':'ok','Blocked':'miss','Reassign requested':'part','Cancelled':'mute'}[st]||'mute';return '<span class="pill '+m+'">'+esc(st)+'</span>'}
function prioPill(l){return '<span class="pill '+({High:'miss',Medium:'part',Low:'mute'}[l])+'">'+l+'</span>'}
function ruleLabel(a){return a.rule==='M'?'Manual':'Rule '+a.rule}
function dueTxt(a,today){var d=diffDays(a.due,today);return d<0?'overdue '+(-d)+' d':d===0?'due today':'due '+fmtShort(a.due)}
function who(e){if(!e)return '';if(e.indexOf('@')<0)return e;var u=uByEmail(e);return u?u.name:e}
function sourceLink(a){var s=a.source||{};var pg=s.page||'actions';return '<a href="#/'+pg+'" data-act="goto" data-pg="'+esc(pg)+'" data-plant="'+esc(s.plant||'')+'" data-group="'+esc(s.group||'')+'">'+esc(s.label||'Source')+'</a>'}
function canRespondBtns(a,u){return canRespond(a,u)&&!readOnly()}

/* ---- action card (Today and lists) ---- */
function actionCard(a,rank,sc,u,today,verifyCard){
  var pl=prioLabel(sc.score);
  var btns='';
  if(verifyCard)btns='<button class="btn sm pri" data-act="verify-ok" data-id="'+esc(a.id)+'">Verify closed</button><button class="btn sm" data-act="verify-reopen" data-id="'+esc(a.id)+'">Reopen with note</button>';
  else if(canRespondBtns(a,u))btns='<button class="btn sm" data-act="r-ack" data-id="'+esc(a.id)+'">Acknowledge</button><button class="btn sm" data-act="r-update" data-id="'+esc(a.id)+'">Update</button><button class="btn sm pri" data-act="r-done" data-id="'+esc(a.id)+'">Mark done</button><button class="btn sm" data-act="r-help" data-id="'+esc(a.id)+'">Need help</button><button class="btn sm" data-act="r-reassign" data-id="'+esc(a.id)+'">Request reassign</button>';
  var det=['U','V','C','A','D'].map(function(k){return {U:'Urgency',V:'Value',C:'Class '+(sc.cls||'-'),A:'Ageing',D:'Dependency'}[k]+' '+sc.pts[k].toFixed(1)}).join(' · ');
  return '<article class="acard"><div class="hd"><b>'+(rank?rank+'. ':'')+esc(a.title)+'</b><span>'+(verifyCard?'<span class="pill info">Verify</span> ':'')+pillFor(a.status)+' '+prioPill(pl)+(a.need_help?' <span class="pill part">Needs help</span>':'')+(a.cleared?' <span class="pill ok">Condition cleared</span>':'')+'</span></div>'
   +'<div class="note"><span class="mono">'+esc(a.ref)+'</span> · '+(verifyCard?'Assigned by '+esc(who(a.assigner))+' · to verify':'Owner: '+(a.owner===u.email?'you':esc(who(a.owner))))+' · '+esc(dueTxt(a,today))+' ('+esc(fmtDate(a.due))+')</div>'
   +'<div>Next step: '+esc(a.next_step)+'</div>'
   +'<div class="note">Source: '+sourceLink(a)+'</div>'
   +'<div class="why">'+esc(whyLine(rank||1,sc))+'</div>'
   +'<details class="note"><summary>Score details</summary>'+esc(det)+' · score '+sc.score.toFixed(1)+'</details>'
   +'<div class="row">'+btns+'<a class="btn sm" href="#/action/'+esc(a.id)+'">Open thread</a></div></article>';
}

/* ---- Today ---- */
function pageToday(){
  var u=effUser(),today=TODAY();
  var cand=todayCandidates(u);if(cand.some(function(a){return a.customer})&&!noData()){var lqm=qMonths(prevQ(curQuarterKey()));var sc0=SC();if(!custLoaded(lqm,sc0.plants)&&S.custAsk!=='today'){S.custAsk='today';loadCust(sc0.plants,lqm).then(function(){S.custAsk=null;S.lastHtml='';schedule()})}}
  var ranked=rankSort(cand,today),cap=capFor(u),top=ranked.slice(0,cap),more=ranked.length-top.length;
  var overdue=cand.filter(function(a){return a.status!=='Done'&&diffDays(a.due,today)<0}).length,dueToday=cand.filter(function(a){return a.status!=='Done'&&a.due===today}).length;
  var fu=S.followups.filter(function(f){return f.status==='Drafted'&&(f.sender===u.email||(f.sender==='*super'&&u.role==='Super admin'))}).length;
  var h='<div class="kpis tiles"><div class="kpi"><small>Today list</small><b>'+top.length+' / '+cap+'</b><small>Cap for '+esc(u.role)+' · editable per role and user</small></div>'
   +'<div class="kpi"><small>More in Action Center</small><b>'+Math.max(0,more)+'</b></div><div class="kpi"><small>Overdue</small><b>'+overdue+'</b></div><div class="kpi"><small>Due today</small><b>'+dueToday+'</b></div>'
   +'<div class="kpi"><small>Follow-ups to send</small><b>'+fu+'</b><small>Separate queue, not counted in the cap</small></div></div>';
  if(S.role==='Super admin'&&!S.viewAs)h=integrityHtml()+h;
  if(!weightsOk())h+='<div class="banner err">Priority weights do not total 100 (Admin › Settings). Ranking may be wrong.</div>';
  if(!top.length)h+='<div class="empty"><b>Nothing due.</b> You are clear for today.</div>';
  else h+='<div class="stack">'+top.map(function(x,i){return actionCard(x.a,i+1,x.s,u,today,x.a.status==='Done')}).join('')+'</div>';
  if(more>0)h+='<div class="note"><a href="#/actions">'+more+' more in Action Center</a>. Blocked actions sit in a collapsed Blocked strip there, not here.</div>';
  h+='<p class="note">Rules only, no AI. Score = urgency '+CFG.w_U+' + value at risk '+CFG.w_V+' + customer impact '+CFG.w_C+' + ageing '+CFG.w_A+' + dependency '+CFG.w_D+' (weights editable in Admin). High from '+CFG.prio_high+', Medium '+CFG.prio_med+'–'+(CFG.prio_high-1)+', Low below. Never more than the role cap. Same inputs always give the same order.</p>';
  return h;
}

/* ---- Action Center ---- */
function pageActions(){
  var u=effUser(),today=TODAY(),tab=S.acTab||'list';
  var tabs=[['list','Actions'],['raise','Raise action'],['follow','Follow-ups to send'],['log','Action log']];
  var canRaise=['Super admin','Management / HO','HOD','Branch / depot manager','Coordinator (sales / CRR)'].indexOf(u.role)>=0;
  var fuN=S.followups.filter(function(f){return f.status==='Drafted'&&(f.sender===u.email||(f.sender==='*super'&&u.role==='Super admin'))}).length;
  var h='<div class="tabs seg" role="tablist">'+tabs.filter(function(t){return (t[0]!=='raise'||canRaise)&&(t[0]!=='follow'||['Sales executive','Accounts','Plant'].indexOf(u.role)<0)}).map(function(t){return '<button data-act="actab" data-t="'+t[0]+'" aria-pressed="'+(tab===t[0])+'">'+t[1]+(t[0]==='follow'&&fuN?' ('+fuN+')':'')+'</button>'}).join('')+'</div>';
  if(tab==='raise'&&canRaise)h+=raiseHtml(u);
  else if(tab==='follow')h+=followHtml(u,today);
  else if(tab==='log')h+=logHtml(u);
  else h+=listHtml(u,today);
  return h;
}
function listHtml(u,today){
  var f=S.acF,list=myActions(u);
  var opts=function(arr,cur,all){return '<option value="">'+all+'</option>'+arr.map(function(x){return '<option value="'+esc(x[0])+'"'+(cur===x[0]?' selected':'')+'>'+esc(x[1])+'</option>'}).join('')};
  var owners=Array.from(new Set(list.map(function(a){return a.owner}))).map(function(e){return [e,who(e)]});
  var shown=list.filter(function(a){return (!f.status||a.status===f.status)&&(!f.owner||a.owner===f.owner)&&(!f.rule||a.rule===f.rule)&&(!f.q||(a.title+' '+a.ref+' '+(a.customer||'')).toLowerCase().indexOf(f.q.toLowerCase())>=0)});
  var active=shown.filter(function(a){return a.status!=='Blocked'&&a.status!=='Cancelled'&&a.status!=='Verified closed'});
  var ranked=rankSort(active,today),blocked=shown.filter(function(a){return a.status==='Blocked'}),closed=shown.filter(function(a){return a.status==='Verified closed'||a.status==='Cancelled'});
  var h='<section class="card"><div class="hd"><h2>Actions · '+active.length+' open</h2><span class="note">Ranked by priority score. '+esc(u.role==='Sales executive'?'Own actions only.':'Within your scope.')+'</span></div>'
   +'<div class="row"><div class="fld"><label for="af-s">Status</label><select id="af-s" data-chg="acf" data-k="status">'+opts(ALL_ST.map(function(x){return [x,x]}),f.status,'All')+'</select></div>'
   +'<div class="fld"><label for="af-o">Owner</label><select id="af-o" data-chg="acf" data-k="owner">'+opts(owners,f.owner,'All')+'</select></div>'
   +'<div class="fld"><label for="af-r">Source</label><select id="af-r" data-chg="acf" data-k="rule">'+opts([['M','Manual'],['R1','R1 Plan shortfall'],['R2','R2 Overdue receivable'],['R3','R3 Order beyond TAT'],['R4','R4 Ageing stock'],['R5','R5 Rejected rows'],['R6','R6 Missing plan'],['R7','R7 QoQ decline']],f.rule,'All')+'</select></div>'
   +'<div class="fld"><label for="af-q">Search</label><input id="af-q" class="in" data-in="acq" value="'+esc(f.q||'')+'" placeholder="title, ID, customer"></div></div>';
  h+=ranked.length?'<div class="tw"><table><thead><tr><th>ID</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th>Priority</th><th class="num">Value at risk</th></tr></thead><tbody>'+ranked.map(function(x){var a=x.a;return '<tr class="clk" data-act="open-action" data-id="'+esc(a.id)+'"><td class="mono">'+esc(a.ref)+'</td><td><a href="#/action/'+esc(a.id)+'">'+esc(a.title)+'</a><div class="note">'+esc(ruleLabel(a))+(a.plant?' · '+esc(plantShort(a.plant)):'')+'</div></td><td>'+esc(who(a.owner))+'</td><td style="white-space:nowrap">'+esc(dueTxt(a,today))+'</td><td>'+pillFor(a.status)+(a.need_help?' <span class="pill part">Help</span>':'')+'</td><td>'+prioPill(prioLabel(x.s.score))+' <span class="note mono">'+x.s.score.toFixed(0)+'</span></td><td class="num">'+(a.value?fmtMoney(a.value):'—')+'</td></tr>'}).join('')+'</tbody></table></div>':'<div class="empty">No actions match. Rules run on page load and on each upload.</div>';
  if(blocked.length)h+='<details class="strip"><summary>Blocked · '+blocked.length+'</summary>'+blocked.map(function(a){return '<div class="note"><a href="#/action/'+esc(a.id)+'">'+esc(a.title)+'</a> · '+esc(who(a.owner))+' · '+esc(a.blocked_reason||'')+'</div>'}).join('')+'</details>';
  if(closed.length)h+='<details class="strip"><summary>Closed · '+closed.length+'</summary>'+closed.slice(0,60).map(function(a){return '<div class="note"><a href="#/action/'+esc(a.id)+'">'+esc(a.title)+'</a> · '+esc(a.status)+'</div>'}).join('')+'</details>';
  return h+'</section>';
}
function scopedUsers(u){
  var sc=scopeOf(u);
  return activeUsers().filter(function(x){
    if(u.role==='Super admin'||u.role==='Management / HO')return true;
    if(u.role==='HOD')return norm(x.department)===norm(u.department)||x.role==='Management / HO';
    var c=codesOf(x);if(!sc.plants)return true;if(!c.length)return x.role!=='Branch / depot manager'&&x.role!=='Plant';
    return c.some(function(p){return sc.plants.has(p)});
  });
}
function raiseHtml(u){
  var users=scopedUsers(u),pl=S.plants.filter(function(p){return p.active!==false&&(!SC().plants||SC().plants.has(p.plant_code))});
  return '<section class="card"><div class="hd"><h2>Raise an action</h2><span class="note">One owner, one due date, one next step.</span></div><div class="fgrid">'
   +fld('ra-title','Title','')+'<div class="fld"><label for="ra-owner">Owner</label><select id="ra-owner">'+users.map(function(x){return '<option value="'+esc(x.email)+'">'+esc(x.name)+' · '+esc(x.role)+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="ra-due">Due date</label><input id="ra-due" type="date" class="in" value="'+addWD(TODAY(),3)+'" min="'+TODAY()+'"></div>'
   +'<div class="fld"><label for="ra-plant">Plant (optional)</label><select id="ra-plant"><option value="">None</option>'+pl.map(function(p){return '<option value="'+p.plant_code+'">'+esc(plantName(p.plant_code))+'</option>'}).join('')+'</select></div>'
   +fld('ra-cust','Customer code (optional)','')+fld('ra-val','Value at risk ₹ (optional)','')
   +'</div><div class="fld"><label for="ra-next">Next step</label><textarea id="ra-next"></textarea></div><div id="ra-err"></div><div class="row"><button class="btn pri" data-act="ra-save"'+(readOnly()?' disabled':'')+'>Raise action</button></div>'
   +'<p class="note">The owner sees it in Today. Text you type is stored as plain text. Nothing is sent to anyone: follow-up drafts appear in Follow-ups to send for a person to send.</p></section>';
}
async function saveRaise(){
  var o={title:gv('ra-title'),owner:gv('ra-owner'),due:gv('ra-due'),plant:gv('ra-plant'),customer:gv('ra-cust'),value:gv('ra-val'),next:gv('ra-next')},er=[];
  if(!o.title)er.push('Title is required');if(!o.owner)er.push('Choose an owner');if(!/^\d{4}-\d\d-\d\d$/.test(o.due))er.push('Due date is required');else if(o.due<TODAY())er.push('Due date is in the past');if(!o.next)er.push('Next step is required');
  if(o.value&&isNaN(+o.value))er.push('Value must be a number');
  if(er.length){$('#ra-err').innerHTML='<div class="banner err">'+esc(er.join('. '))+'</div>';return}
  var id=await raiseAction(o);toast('Action raised');location.hash='#/action/'+id;
}

/* ---- thread ---- */
function threadHtml(a,u,today){
  var sc=scoreOf(a,today),idx=STATUS_LADDER.indexOf(a.status);
  var ladder='<div class="steps">'+STATUS_LADDER.map(function(s,i){return '<span class="'+(s===a.status?'on':(idx>=0&&i<idx)?'ok':'')+'">'+s+'</span>'}).join('')+(a.status==='Blocked'||a.status==='Reassign requested'||a.status==='Cancelled'?'<span class="on">'+esc(a.status)+'</span>':'')+'</div>';
  var drafts=S.followups.filter(function(f){return f.action_id===a.id&&(f.sender===u.email||(f.sender==='*super'&&u.role==='Super admin'))});
  var h='<section class="card"><div class="hd"><h2>'+esc(a.ref)+' · '+esc(ruleLabel(a))+'</h2><a class="btn sm" href="#/actions">Back to Action Center</a></div>'
   +'<h3 style="margin:0;font-size:18px">'+esc(a.title)+'</h3>'+ladder
   +'<div class="kpis"><div class="kpi"><small>Owner</small><b style="font-size:14px;font-family:var(--font)">'+esc(who(a.owner))+'</b></div><div class="kpi"><small>Due</small><b style="font-size:14px;font-family:var(--font)">'+esc(fmtDate(a.due))+'</b><small>'+esc(dueTxt(a,today))+'</small></div><div class="kpi"><small>Priority</small><b style="font-size:14px;font-family:var(--font)">'+prioLabel(sc.score)+' · '+sc.score.toFixed(1)+'</b></div><div class="kpi"><small>Value at risk</small><b style="font-size:14px;font-family:var(--font)">'+(a.value?fmtMoney(a.value):'—')+'</b></div></div>'
   +'<div>Next step: <b>'+esc(a.next_step)+'</b></div><div class="note">Source: '+sourceLink(a)+' · Created by '+esc(who(a.creator))+' · assigner '+esc(who(a.assigner))+' · '+esc(istStr(a.created))+'</div>'
   +(a.status==='Blocked'?'<div class="banner warn">Blocked: '+esc(a.blocked_reason||'')+'</div>':'')+(a.cleared?'<div class="banner ok">Condition cleared. The assigner verifies the closure.</div>':'')+(a.closure?'<div class="banner info">Closure note: '+esc(a.closure)+'</div>':'')
   +'<div class="why">'+esc(whyLine(1,sc))+'</div></section>';
  /* responses and manager controls */
  var b='';
  if(canRespondBtns(a,u)&&LIVE_ST.concat(['Done']).indexOf(a.status)>=0&&a.status!=='Done'){b+='<button class="btn sm" data-act="r-ack" data-id="'+esc(a.id)+'">Acknowledge</button><button class="btn sm" data-act="r-update" data-id="'+esc(a.id)+'">Update</button><button class="btn sm pri" data-act="r-done" data-id="'+esc(a.id)+'">Mark done</button><button class="btn sm" data-act="r-help" data-id="'+esc(a.id)+'">Need help</button><button class="btn sm" data-act="r-reassign" data-id="'+esc(a.id)+'">Request reassign</button>'+(a.status==='Blocked'?'<button class="btn sm" data-act="r-unblock" data-id="'+esc(a.id)+'">Unblock</button>':'<button class="btn sm" data-act="r-block" data-id="'+esc(a.id)+'">Blocked</button>')}
  if(!readOnly()&&canManage(a,u)&&a.status!=='Verified closed'&&a.status!=='Cancelled')b+='<button class="btn sm" data-act="m-assign" data-id="'+esc(a.id)+'">Assign / reassign</button><button class="btn sm" data-act="m-due" data-id="'+esc(a.id)+'">Change due date</button><button class="btn sm warn" data-act="m-cancel" data-id="'+esc(a.id)+'">Cancel</button>';
  if(!readOnly()&&a.status==='Done'&&canVerify(a,u))b+='<button class="btn sm pri" data-act="verify-ok" data-id="'+esc(a.id)+'">Verify closed</button><button class="btn sm" data-act="verify-reopen" data-id="'+esc(a.id)+'">Reopen with note</button>';
  if(b)h+='<section class="card"><div class="hd"><h2>Respond</h2></div><div class="row">'+b+'</div></section>';
  h+='<section class="card"><div class="hd"><h2>Thread · '+(a.thread||[]).length+'</h2></div><ol class="thread">'+(a.thread||[]).slice().reverse().map(function(e){return '<li><b>'+esc(who(e.by))+'</b> <span class="pill mute">'+esc(e.kind)+'</span> <span class="note">'+esc(istStr(e.at))+'</span><div>'+esc(e.text||'')+'</div></li>'}).join('')+'</ol></section>';
  if(drafts.length)h+='<section class="card"><div class="hd"><h2>Follow-up drafts for this action</h2></div>'+drafts.map(function(f){return '<div class="note">'+esc(f.step)+' to '+esc(f.to_name)+' · '+esc(f.status)+' · drafted '+esc(fmtShort(f.created_day))+'</div>'}).join('')+'<a class="btn sm" href="#/actions" data-act="actab" data-t="follow">Open Follow-ups to send</a></section>';
  return h;
}
function pageThread(id){
  var u=effUser(),a=S.actions.find(function(x){return x.id===id});
  if(!a)return '<div class="empty">'+(S.loaded.actions?'That action was not found, or it is outside your scope.':'Loading...')+'</div>';
  if(!visibleTo(a,u))return gate('Ask your admin for access','This action is outside your scope.');
  return threadHtml(a,u,TODAY());
}

/* ---- follow-ups to send ---- */
function followHtml(u,today){
  var mine=S.followups.filter(function(f){return f.sender===u.email||(f.sender==='*super'&&u.role==='Super admin')});
  var pend=mine.filter(function(f){return f.status==='Drafted'}).sort(function(a,b){return a.created_day<b.created_day?1:-1}),done=mine.filter(function(f){return f.status!=='Drafted'}).sort(function(a,b){return (a.sent_at||'')<(b.sent_at||'')?1:-1}).slice(0,40);
  var h='<section class="card"><div class="hd"><h2>Follow-ups to send · '+pend.length+'</h2><span class="note">The Desk drafts. You send, then mark Sent. Nothing is sent from this page.</span></div>';
  if(!pend.length)h+='<div class="empty">No drafts waiting. A draft appears the day after a step falls due, when someone opens the page.</div>';
  h+=pend.map(function(f){return draftCard(f,today)}).join('');
  if(done.length)h+='<details class="strip"><summary>Sent or dismissed · '+done.length+'</summary>'+done.map(function(f){return '<div class="note">'+esc(f.step)+' · '+esc(f.ref)+' · '+esc(f.to_name)+' · '+esc(f.status)+(f.sent_by?' by '+esc(who(f.sent_by))+' '+esc(istStr(f.sent_at)):'')+(f.dismiss_reason?' · '+esc(f.dismiss_reason):'')+'</div>'}).join('')+'</details>';
  return h+'</section>';
}
function mailtoOf(f){return 'mailto:'+encodeURIComponent(f.to_email).replace(/%40/g,'@')+'?'+(f.cc_email?'cc='+encodeURIComponent(f.cc_email).replace(/%40/g,'@').replace(/%2C/g,',')+'&':'')+'subject='+encodeURIComponent(f.subject)+'&body='+encodeURIComponent(f.body)}
function waOf(f){return f.to_whatsapp?'https://wa.me/'+f.to_whatsapp+'?text='+encodeURIComponent(f.wa_text):''}
function draftCard(f,today){
  var wait=diffDays(today,f.created_day);
  return '<article class="acard"><div class="hd"><b>'+esc(f.step)+' · '+esc(f.ref)+' · '+esc(f.title)+'</b><span>'+(wait>1?'<span class="pill part">waiting '+wait+' days</span>':'')+'<span class="pill info">'+esc(f.step)+'</span></span></div>'
   +'<div class="note">To '+esc(f.to_name)+' &lt;'+esc(f.to_email)+'&gt;'+(f.cc_email?' · cc '+esc(f.cc_email):'')+' · '+(f.days_overdue?f.days_overdue+' days overdue when drafted':'before due date')+'</div>'
   +'<div class="note"><b>Email subject:</b> '+esc(f.subject)+'</div><pre class="draft">'+esc(f.body)+'</pre>'
   +(f.wa_text?'<div class="note"><b>WhatsApp text:</b></div><pre class="draft">'+esc(f.wa_text)+'</pre>':'<div class="banner warn">No WhatsApp number for '+esc(f.to_name)+': email draft only. Add the number in Admin › Users.</div>')
   +'<div class="row"><button class="btn sm" data-act="fu-copy" data-id="'+esc(f._id)+'" data-w="mail">Copy email</button>'+(f.wa_text?'<button class="btn sm" data-act="fu-copy" data-id="'+esc(f._id)+'" data-w="wa">Copy WhatsApp</button>':'')
   +'<a class="btn sm" href="'+esc(mailtoOf(f))+'" target="_blank" rel="noopener noreferrer">Open mail</a>'+(f.wa_text?'<a class="btn sm" href="'+esc(waOf(f))+'" target="_blank" rel="noopener noreferrer">Open WhatsApp</a>':'')
   +'<button class="btn sm pri" data-act="fu-sent" data-id="'+esc(f._id)+'"'+(readOnly()?' disabled':'')+'>Mark sent</button><button class="btn sm" data-act="fu-dismiss" data-id="'+esc(f._id)+'"'+(readOnly()?' disabled':'')+'>Dismiss</button></div></article>';
}
async function markSent(id){
  if(!guardWrite())return;var f=S.followups.find(function(x){return x._id===id}),u=effUser();if(!f)return;
  var o=Object.assign({},f,{status:'Sent',sent_by:u.email,sent_at:nowISO()});delete o._id;await dset('followups/'+id,o);
  var a=S.actions.find(function(x){return x.id===f.action_id});if(a)await saveAction(threadAdd(a,{by:u.email,kind:'followup_sent',text:f.step+' follow-up to '+f.to_name+' marked sent.'},{}));
  toast('Marked sent');
}
async function dismissDraft(id,why){
  if(!guardWrite())return;var f=S.followups.find(function(x){return x._id===id}),u=effUser();if(!f)return;
  var o=Object.assign({},f,{status:'Dismissed',sent_by:u.email,sent_at:nowISO(),dismiss_reason:why});delete o._id;await dset('followups/'+id,o);toast('Dismissed');
}

/* ---- action log ---- */
function logRows(u){
  var rows=[];
  myActions(u).forEach(function(a){(a.thread||[]).forEach(function(e){rows.push({at:e.at,ref:a.ref,id:a.id,title:a.title,by:e.by,kind:e.kind,text:e.text||'',owner:a.owner,status:a.status})})});
  rows.sort(function(x,y){return x.at<y.at?1:-1});return rows;
}
function logHtml(u){
  var f=S.logF,rows=logRows(u);
  var kinds=Array.from(new Set(rows.map(function(r){return r.kind}))).sort(),bys=Array.from(new Set(rows.map(function(r){return r.by}))).sort();
  var shown=rows.filter(function(r){return (!f.kind||r.kind===f.kind)&&(!f.by||r.by===f.by)&&(!f.q||(r.ref+' '+r.title+' '+r.text).toLowerCase().indexOf(f.q.toLowerCase())>=0)&&(!f.from||r.at.slice(0,10)>=f.from)});
  var canCsv=['Super admin','Management / HO','HOD','Branch / depot manager'].indexOf(u.role)>=0;
  var sel=function(k,arr,lab,fn){return '<div class="fld"><label for="lf-'+k+'">'+lab+'</label><select id="lf-'+k+'" data-chg="logf" data-k="'+k+'"><option value="">All</option>'+arr.map(function(x){return '<option value="'+esc(x)+'"'+(f[k]===x?' selected':'')+'>'+esc(fn?fn(x):x)+'</option>'}).join('')+'</select></div>'};
  return '<section class="card"><div class="hd"><h2>Action log · '+shown.length+' entries</h2>'+(canCsv?'<button class="btn sm" data-act="log-csv">Export CSV</button>':'')+'</div>'
   +'<div class="row">'+sel('kind',kinds,'Event')+sel('by',bys,'By',who)+'<div class="fld"><label for="lf-from">From date</label><input id="lf-from" type="date" class="in" data-chg="logf" data-k="from" value="'+esc(f.from||'')+'"></div><div class="fld"><label for="lf-q">Search</label><input id="lf-q" class="in" data-in="logq" value="'+esc(f.q||'')+'"></div></div>'
   +(shown.length?'<div class="tw" style="max-height:520px;overflow:auto"><table><thead><tr><th>When (IST)</th><th>Action</th><th>Event</th><th>By</th><th>Note</th></tr></thead><tbody>'+shown.slice(0,300).map(function(r){return '<tr><td class="mono" style="white-space:nowrap">'+esc(istStr(r.at))+'</td><td><a href="#/action/'+esc(r.id)+'">'+esc(r.ref)+'</a> <span class="note">'+esc(r.title)+'</span></td><td><span class="pill mute">'+esc(r.kind)+'</span></td><td>'+esc(who(r.by))+'</td><td>'+esc(r.text)+'</td></tr>'}).join('')+'</tbody></table></div>':'<div class="empty">No log entries yet.</div>')
   +'<p class="note">Every ask, response, decision and closure. Showing the newest 300; the CSV holds all matching entries.</p></section>';
}
function logCsv(){
  var u=effUser(),f=S.logF,rows=logRows(u).filter(function(r){return (!f.kind||r.kind===f.kind)&&(!f.by||r.by===f.by)&&(!f.q||(r.ref+' '+r.title+' '+r.text).toLowerCase().indexOf(f.q.toLowerCase())>=0)&&(!f.from||r.at.slice(0,10)>=f.from)});
  var csv=csvLine(['when_utc','action_id','title','event','by','note','owner','status_now'])+'\n'+rows.map(function(r){return csvLine([r.at,r.ref,r.title,r.kind,r.by,r.text,r.owner,r.status])}).join('\n');
  return download('action-log.csv',csv);
}

/* ---- dialogs ---- */
function respDlg(kind,id){
  var a=S.actions.find(function(x){return x.id===id});if(!a)return;
  var cfg={update:['Update','Comment','Update comment (required)',true],done:['Mark done','Closure note (required)','What was done, and the result',true],help:['Need help','What help is needed (required)','',true],reassign:['Request reassign','Why should it move? (required)','',true],block:['Mark blocked','Reason (required)','',true]}[kind];
  openDlg('<h3>'+cfg[0]+' · '+esc(a.ref)+'</h3><div class="note">'+esc(a.title)+'</div><div class="fld"><label for="rd-text">'+cfg[1]+'</label><textarea id="rd-text" placeholder="'+esc(cfg[2])+'"></textarea></div>'
   +(kind==='update'?'<div class="fld"><label for="rd-eta">New ETA (optional)</label><input id="rd-eta" type="date" class="in" min="'+TODAY()+'"></div>':'')
   +'<div id="d-err"></div><div class="row"><button class="btn pri" data-act="resp-go" data-kind="'+kind+'" data-id="'+esc(id)+'">Save</button><button class="btn" data-act="dlg-close">Cancel</button></div>');
}
