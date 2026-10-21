/* ================= v1.0 shell, routing, handlers ================= */
S.f={mode:'QTD',q:'',m:'',from:'',to:'',plant:'',sp:'',group:'',search:''};
S.acF={status:'',owner:'',rule:'',q:''};S.logF={kind:'',by:'',q:'',from:''};S.acTab='list';S.threadId=null;
S.actions=[];S.followups=[];S.phasing=[];S.rollDocs={};S.rollLoaded=false;S.orders=[];S.deliv=[];S.recv=[];S.coll=[];S.stock=[];S.potVer=0;S.viewAs=null;S.demoMode=false;
var PAGES=[
 ['overview','Overview','Overview'],['sales','Sales','Overview'],['orders','Orders & Dispatch','Overview'],['receivables','Receivables','Overview'],['inventory','Inventory','Overview'],
 ['today','Today','Team'],['actions','Action Center','Team'],['team','Team & Scorecard','Team'],['intake','Data Intake','Data'],['admin','Admin','Data']];
var TITLES={
 overview:['Overview','Net sales and growth against market potential. Comparison is always the previous quarter.'],
 sales:['Sales','Branch → salesperson → customer → SAP document · A/B/C customer tiles'],
 orders:['Orders & Dispatch','Open orders and order-to-dispatch days against the plan TAT'],
 receivables:['Receivables','Ageing buckets and collection plan against actual'],
 inventory:['Inventory','Stock against plan, stock days and ageing'],
 today:['Today','Your top actions, ranked and capped for your role'],
 actions:['Action Center','Actions, raise action, Follow-ups to send, Action log'],
 team:['Team & Scorecard','KRA / KPI plan against actual per person and role'],
 intake:['Data Intake','SAP B1 now, S/4HANA ready. CSV or XLSX. Every row keeps its SAP reference.'],
 admin:['Admin','Users, plants, market potential with revisions, rules and settings.']};
var PERIOD_PAGES=['overview','sales','team'],FILTER_PAGES=['overview','sales','team','orders','receivables','inventory'];

function route(){
  var h=(location.hash||'').replace(/^#\/?/,''),parts=h.split('/'),pg=parts[0]||'';
  var valid=PAGES.map(function(p){return p[0]});
  if(pg==='action'&&parts[1]){S.tab='actions';S.threadId=decodeURIComponent(parts.slice(1).join('/'))}
  else{S.threadId=null;if(valid.indexOf(pg)>=0)S.tab=pg;else{var u=effUser();S.tab=u&&u.role==='Super admin'?'overview':'today'}}
  S.drill=null;S.docs=null;
  var sh=$('#shell');if(sh)sh.removeAttribute('data-sig');schedule();
}
window.addEventListener('hashchange',function(){route()});

function dataChip(){
  var ups=S.uploads.slice().sort(function(a,b){return a.at<b.at?1:-1});var l=ups[0];
  return l?'<span class="chip">SAP '+esc(l.sys||'B1')+' · loaded '+esc(istStr(l.at))+'</span>':'<span class="chip">No SAP data loaded</span>';
}
/* line icons, 24x24, stroke 2, drawn at 17px like the reference (no icon library) */
var NAV_ICON={overview:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 sales:'<path d="M3 20h18M6 16l4-5 4 3 5-7"/>',orders:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',receivables:'<path d="M7 4h10M7 9h10M7 4c5 0 5 5 0 5l7 11"/>',inventory:'<path d="M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4"/>',
 today:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',actions:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
 team:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.4 3.5 5.5"/>',
 intake:'<path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',admin:'<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>'};
function navIcon(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'+(NAV_ICON[k]||'')+'</svg>'}
function openActionCount(u){try{return myActions(u).filter(function(a){return LIVE_ST.indexOf(a.status)>=0}).length}catch(e){return 0}}
/* factual tags only: counts, load state, role scope */
function navTags(u,open){
  var sa=u.role==='Super admin',t={},mk=function(txt,cls,title){return '<span class="tag '+(cls||'')+'"'+(title?' title="'+esc(title)+'"':'')+'>'+txt+'</span>'};
  if(open)t.today=mk(open,'cnt');
  var oa=openActionCount(u);if(oa)t.actions=mk(oa,'red','Open actions in your scope');
  t.team=mk('TEAM','teal');
  if(sa){t.intake=mk('LIVE','ind');t.admin=mk('RULES','vio','Rules, settings and plans')}else t.intake=mk('VIEW','ind');
  if(!S.orders.length&&!S.deliv.length)t.orders=mk('DATA','','Sales order and delivery exports not loaded');
  if(!S.recv.length&&!S.coll.length)t.receivables=mk('DATA','','Receivable and collection exports not loaded');
  if(!S.stock.length)t.inventory=mk('DATA','','Stock export not loaded');
  return t;
}
function navTagSig(u){var t=navTags(u,0);return Object.keys(t).map(function(k){return k+t[k]}).join('')}
/* Logo slot: build/desk/assets/virgo-logo.(svg|png) is inlined at build time; until it exists a neutral text mark stands in (no invented logo). */
var LOGO_SRC='/*@@LOGO@@*/';
function brandLogo(){return '<span class="brandmark">'+(LOGO_SRC?'<img class="brandlogo" src="'+LOGO_SRC+'" alt="Virgo">':'<span class="brandtext">Virgo</span>')+'</span>'}
function navHtml(u){
  var pages=pagesFor(u),open=0;try{open=todayCandidates(u).length}catch(e){}
  var groups={};PAGES.forEach(function(p){(groups[p[2]]=groups[p[2]]||[]).push(p)});
  return ['Overview','Team','Data'].map(function(g){
    var items=groups[g].filter(function(p){return pages.indexOf(p[0])>=0});if(!items.length)return '';
    var label=function(p){return p[0]==='admin'&&u.role!=='Super admin'?'Plans':p[1]};
    var tg=navTags(u,open);
    return '<nav class="navg"><h4>'+g+'</h4>'+items.map(function(p){var t=tg[p[0]]||'';
      return '<a class="nav" href="#/'+p[0]+'" '+(S.tab===p[0]?'aria-current="page"':'')+'>'+navIcon(p[0])+'<span class="nl">'+esc(label(p))+'</span>'+t+'</a>'}).join('')+'</nav>';
  }).join('');
}
function shellHtml(u){
  return '<div class="app"><aside class="side"><div class="brand">'+brandLogo()+'<div><b>Laminates Performance Desk</b><small>desk-v1.0</small></div></div>'+navHtml(u)
   +'<div class="me"><b>'+esc(S.viewer&&S.viewer.name||u.name||'Viewer')+'</b><span>'+esc(S.role||'')+'</span><span class="note break">'+esc(S.viewer&&S.viewer.email||'')+'</span>'
   +(S.role==='Super admin'?'<label class="note" for="va-sel">View as role</label><select id="va-sel" class="in" data-chg="viewas"><option value="">Myself (Super admin)</option>'+S.users.filter(function(x){return x.active!==false&&x.email!==(S.viewer&&S.viewer.email)}).sort(function(a,b){return a.role<b.role?-1:a.role>b.role?1:a.name<b.name?-1:1}).map(function(x){return '<option value="'+esc(x.email)+'"'+(S.viewAs===x.email?' selected':'')+'>'+esc(x.role+' · '+x.name)+'</option>'}).join('')+'</select>':'')
   +'</div></aside><main class="main"><div class="top" id="top"></div><div id="banners"></div><div id="pg"></div></main></div>';
}
function topHtml(){
  var t=TITLES[S.tab]||TITLES.today;var demo=S.uploads.some(function(x){return x.demo})||S.actions.some(function(a){return a.demo});
  var label=S.tab==='admin'&&effRole()!=='Super admin'?['Plans','Propose, discuss and approve targets. Settings stay with the Super admin.']:t;
  return '<div><h1>'+esc(label[0])+'</h1><p>'+esc(label[1])+'</p></div><div class="chips">'+(demo?'<span class="chip demo">DEMO data loaded</span>':'')+dataChip()+(S.engStatus?'<span class="chip">'+esc(S.engStatus)+'</span>':'')+'<button class="btn sm" data-act="share">Share link</button><button class="btn sm" data-act="theme" aria-label="Switch light or dark theme">Theme</button></div>';
}
function bannersHtml(){
  var h='';
  if(S.viewAs){var vu=uByEmail(S.viewAs);h+='<div class="banner warn"><span><b>Viewing as '+esc(vu?vu.name+' · '+vu.role:S.viewAs)+'.</b> Read-only preview with that person\'s filter. Nothing can be saved. Logged.</span><button class="btn sm" data-act="va-exit">Exit view</button></div>'}
  if(lsGet('desk-today'))h+='<div class="banner info"><span>Test clock: today is set to <b>'+esc(fmtDate(TODAY()))+'</b> for this browser only (Admin › Settings).</span><button class="btn sm" data-act="clock-reset">Use the real date</button></div>';
  if(DS.custJobs>0)h+='<div class="banner info">Reading customer detail '+DS.custDone+' of '+DS.custJobs+'...</div>';
  if(DS.status&&DS.status!=='ready'&&DS.status!=='idle')h+='<div class="banner info">'+esc(DS.status)+'</div>';
  if(S.err)h+='<div class="banner err">Database message: '+esc(S.err)+'</div>';
  return h;
}
function ctxPlants(f,sc){return f.plant?new Set([f.plant]):sc.plants}
function ctrlBar(pg){
  var f=S.f,sc=SC(),tYm=TODAY().slice(0,7),cur=curQuarterKey(),res=resolvePeriod(f,TODAY());
  var qs=closedQuarters().concat([cur]).reverse(),h='<section class="ctrl card">';
  if(PERIOD_PAGES.indexOf(pg)>=0){
    h+='<div class="seg" role="group" aria-label="Period">'+['MTD','QTD','YTD','Custom'].map(function(m){return '<button data-act="mode" data-m="'+m.toUpperCase()+'" aria-pressed="'+(f.mode===m.toUpperCase())+'">'+m+'</button>'}).join('')+'</div>';
    if(f.mode==='QTD'||f.mode==='YTD')h+='<div class="fld"><label for="f-q">Quarter</label><select id="f-q" data-chg="flt" data-k="q">'+qs.map(function(k){return '<option value="'+k+'"'+((f.q||cur)===k?' selected':'')+'>'+qLabel(k)+(k===cur?' (open)':'')+'</option>'}).join('')+'</select></div>';
    if(f.mode==='MTD'){var ms=[];qs.forEach(function(k){qMonths(k).forEach(function(m){if(m<=tYm)ms.push(m)})});ms.sort().reverse();h+='<div class="fld"><label for="f-m">Month</label><select id="f-m" data-chg="flt" data-k="m">'+ms.slice(0,40).map(function(m){return '<option value="'+m+'"'+((f.m||tYm)===m?' selected':'')+'>'+ymLabel(m)+'</option>'}).join('')+'</select></div>'}
    if(f.mode==='CUSTOM'){var all=[];qs.forEach(function(k){qMonths(k).forEach(function(m){if(m<=tYm)all.push(m)})});all.sort();var opt=function(sel){return all.map(function(m){return '<option value="'+m+'"'+(sel===m?' selected':'')+'>'+ymLabel(m)+'</option>'}).join('')};
      h+='<div class="fld"><label for="f-from">From month</label><select id="f-from" data-chg="flt" data-k="from">'+opt(f.from||shiftYm(tYm,-1))+'</select></div><div class="fld"><label for="f-to">To month</label><select id="f-to" data-chg="flt" data-k="to">'+opt(f.to||tYm)+'</select></div>'}
  }
  if(FILTER_PAGES.indexOf(pg)>=0){
    var plants=DS.plants.length?DS.plants:S.plants.map(function(p){return p.plant_code});plants=plants.filter(function(p){return plantInScope(sc,p)});
    if(plants.length>1||f.plant)h+='<div class="fld"><label for="f-plant">Branch / plant</label><select id="f-plant" data-chg="flt" data-k="plant"><option value="">All</option>'+plants.map(function(p){return '<option value="'+p+'"'+(f.plant===p?' selected':'')+'>'+esc(plantName(p))+'</option>'}).join('')+'</select></div>';
    if(!sc.sp&&(pg==='sales'||pg==='overview'||pg==='team')){var sps=distinct('sp');if(sps.length)h+='<div class="fld"><label for="f-sp">Salesperson</label><select id="f-sp" data-chg="flt" data-k="sp"><option value="">All</option>'+sps.slice(0,500).map(function(p){return '<option value="'+esc(p)+'"'+(f.sp===p?' selected':'')+'>'+esc(p)+'</option>'}).join('')+'</select></div>'}
    if(pg==='sales'||pg==='overview'||pg==='team')h+='<div class="fld"><label for="f-group">Product group</label><select id="f-group" data-chg="flt" data-k="group"><option value="">All</option>'+GROUPS.map(function(g){return '<option'+(f.group===g?' selected':'')+'>'+g+'</option>'}).join('')+'</select></div>';
    if(f.plant||f.sp||f.group||f.search)h+='<button class="btn sm" data-act="clear-f">Clear filters</button>';
    h+='<div class="fld"><label for="f-search">Search</label><input id="f-search" class="in" data-in="fsearch" value="'+esc(f.search||'')+'" placeholder="customer, branch, person"></div>';
  }
  if(f.mode==='MTD'&&PERIOD_PAGES.indexOf(pg)>=0&&DS.plants.length){
    var rq=resolvePeriod({mode:'QTD',q:res.q},TODAY()),ff={plants:ctxPlants(f,sc)},A=sumF(ff,rq.cur).n,P=sumF(ff,rq.prior).n,inc=!monthsLoaded(rq.curMonths,ff.plants)||!monthsLoaded(rq.priorMonths,ff.plants);
    h+='<span class="chip">Quarter QoQ ('+esc(qLabel(res.q))+'): '+qoqCell(qoqOf(A,P,{incomplete:inc}))+'</span>';
  }
  if(PERIOD_PAGES.indexOf(pg)>=0)h+='<span class="chip">Compared with: '+esc(res.priorLabel||'previous quarter')+'</span>'+(res.pro?'<span class="chip">To-date plan and previous quarter pro-rated by working days ('+res.N+' elapsed)</span>':'');
  return h+'</section>';
}
function pageHtml(u){
  var pg=S.tab;
  if(pg==='today')return pageToday();
  if(pg==='actions')return S.threadId?pageThread(S.threadId):pageActions();
  var body='';
  if(pg==='overview')body=pageOverview();else if(pg==='sales')body=pageSales();else if(pg==='team')body=pageTeam();
  else if(pg==='orders')body=pageOrders();else if(pg==='receivables')body=pageReceivables();else if(pg==='inventory')body=pageInventory();
  return ctrlBar(pg)+body;
}
function renderAll(){
  var root=$('#root');
  var retryBtn='<div class="gate"><button class="btn pri" data-act="boot-retry">Retry</button></div>';
  if(S.dbState==='init'){var w0=Date.now()-(S.t0||Date.now());if(w0>12000)root.innerHTML=gate('Still opening the Desk','Waiting on '+(S.step||'the viewer record')+' for '+Math.round(w0/1000)+' seconds.')+retryBtn;else if(!root.innerHTML||/Still opening/.test(root.innerHTML))root.innerHTML=gate('Opening the Desk','Checking who you are.');return}
  if(S.dbState==='none'){root.innerHTML=gate('Database not available','Sign in to claude.ai and open this page again. The Desk stores its data in the shared database.')+retryBtn;return}
  if(!S.loaded.users){
    var waited=Date.now()-(S.t0||Date.now());
    if(S.errs&&S.errs.users){root.innerHTML=gate('Could not read users: '+S.errs.users,'The Desk cannot tell who you are without its users list.')+'<div class="gate"><button class="btn pri" data-act="boot-retry">Retry</button></div>';return}
    if(waited>12000){root.innerHTML=gate('Still opening the Desk','Waiting on '+(S.step||'the database')+' for '+Math.round(waited/1000)+' seconds.')+'<div class="gate"><button class="btn pri" data-act="boot-retry">Retry</button></div>';return}
    if(!root.innerHTML||/Still opening|Could not read/.test(root.innerHTML))root.innerHTML=gate('Opening the Desk','Waiting on '+(S.step||'the users list')+'.');
    return;
  }
  S.role=viewerRole();
  if(S.role===null||S.role==='inactive'){root.innerHTML=gate('Ask your admin for access','You are signed in as '+(S.viewer&&S.viewer.email||'a user whose email this page cannot read')+'. This page is not enabled for that address.'+(S.viewer&&S.viewer.id?' Give your admin this viewer ID: '+S.viewer.id:''));return}
  if(S.role==='Super admin'&&!S.seeded&&S.loaded.users&&S.loaded.plants){S.seeded=true;seedDefaults()}
  var u=effUser();
  if(!u){root.innerHTML=gate('Ask your admin for access','Your user record could not be read.');return}
  if(!S.routed){S.routed=true;route()}
  S.demoMode=S.uploads.some(function(x){return x.demo});
  if(!canPage(u,S.tab)){
    if(!$('#shell'))root.innerHTML='<div id="shell"></div>';
    $('#shell').innerHTML=shellHtml(u);$('#shell').setAttribute('data-sig','x');$('#top').innerHTML=topHtml();
    $('#pg').innerHTML=gate('Ask your admin for access','Your role ('+esc(u.role)+') does not include this page.');S.lastHtml='';return;
  }
  if(!$('#shell'))root.innerHTML='<div id="shell"></div>';
  var sh=$('#shell');
  var sig=[S.role,S.viewAs||'',S.tab,S.demoMode,S.viewer&&S.viewer.email,S.users.length,u.role,S.threadId?1:0].join('|');
  var navOpen=(function(){try{return todayCandidates(u).length}catch(e){return 0}})();
  sig+='|'+navOpen+'|'+navTagSig(u);
  var rebuilt=false;
  if(sh.getAttribute('data-sig')!==sig){
    sh.setAttribute('data-sig',sig);sh.innerHTML=shellHtml(u);rebuilt=true;S.lastHtml='';
    if(S.tab==='intake')$('#pg').innerHTML='<div id="p-intake"></div>';else if(S.tab==='admin')$('#pg').innerHTML='<div id="p-admin"></div>';
    if(S.tab==='intake')buildIntake();else if(S.tab==='admin')buildAdmin();
  }
  var t=topHtml();if(S.lastTop!==t||rebuilt){S.lastTop=t;$('#top').innerHTML=t}
  var b=bannersHtml();if(S.lastBan!==b||rebuilt){S.lastBan=b;$('#banners').innerHTML=b}
  if(S.tab==='intake'){if(u.role==='Super admin')refreshIntake();else refreshIntake()}
  else if(S.tab==='admin')refreshAdmin();
  else{
    var ae=document.activeElement,aid=ae&&ae.id,pos=ae&&ae.selectionStart;
    var html;try{html=pageHtml(u)}catch(e){html='<div class="banner err">This page could not be drawn: '+esc((e&&e.message)||e)+'</div>'}
    if(html!==S.lastHtml){S.lastHtml=html;$('#pg').innerHTML=html;if(aid){var n=document.getElementById(aid);if(n&&n.focus){n.focus();try{if(pos!=null&&n.setSelectionRange&&n.type==='text')n.setSelectionRange(pos,pos)}catch(e2){}}}}
  }
  afterData();
}

/* ---- handlers ---- */
function goto(pg,opt){opt=opt||{};if(opt.plant!=null)S.f.plant=opt.plant||'';if(opt.group!=null)S.f.group=opt.group||'';location.hash='#/'+pg}
Object.assign(handlers,{
 'boot-retry':function(){boot()},
 'clear-f':function(){S.f.plant='';S.f.sp='';S.f.group='';S.f.search='';S.lastHtml='';schedule()},
 'goto':function(t){S.f.plant=t.getAttribute('data-plant')||S.f.plant;S.f.group=t.getAttribute('data-group')||''},
 'share':function(){var d=window.__clip;return copyText(PAGE_URL,'Link copied')},
 'mode':function(t){S.f.mode=t.getAttribute('data-m');S.lastHtml='';schedule()},
 'actab':function(t){S.acTab=t.getAttribute('data-t');S.threadId=null;if(location.hash.indexOf('action/')>=0)location.hash='#/actions';S.lastHtml='';schedule()},
 'open-action':function(t,ev){if(ev&&ev.target&&ev.target.closest('a'))return;location.hash='#/action/'+t.getAttribute('data-id')},
 'va-exit':function(){S.viewAs=null;S.lastHtml='';DS.ver++;schedule();ingestRoll()},
 'clock-reset':function(){try{localStorage.removeItem('desk-today')}catch(e){}S.engSig=null;S.ladSig=null;S.lastHtml='';DS.cache={};schedule()},
 'r-ack':function(t){return respond(t.getAttribute('data-id'),'ack',{})},
 'r-update':function(t){respDlg('update',t.getAttribute('data-id'))},
 'r-done':function(t){respDlg('done',t.getAttribute('data-id'))},
 'r-help':function(t){respDlg('help',t.getAttribute('data-id'))},
 'r-reassign':function(t){respDlg('reassign',t.getAttribute('data-id'))},
 'r-block':function(t){respDlg('block',t.getAttribute('data-id'))},
 'r-unblock':function(t){return respond(t.getAttribute('data-id'),'unblock',{})},
 'resp-go':async function(t){
   var kind=t.getAttribute('data-kind'),id=t.getAttribute('data-id'),text=gv('rd-text'),eta=gv('rd-eta');
   if(!text){dlgErr('This field is required'+(kind==='done'?': Done needs a closure note':''));return}
   if(text.length>2000){dlgErr('Keep it under 2000 characters');return}
   var map={update:'update',done:'done',help:'help',reassign:'reassign_req',block:'blocked'};
   await respond(id,map[kind],{text:text,eta:eta});closeDlg();toast('Saved to the thread');
 },
 'verify-ok':function(t){return verifyAction(t.getAttribute('data-id'),true,'')},
 'verify-reopen':function(t){var id=t.getAttribute('data-id');openDlg('<h3>Reopen with note</h3><div class="fld"><label for="rd-text">Why is it not closed? (required)</label><textarea id="rd-text"></textarea></div><div id="d-err"></div><div class="row"><button class="btn pri" data-act="reopen-act" data-id="'+esc(id)+'">Reopen</button><button class="btn" data-act="dlg-close">Cancel</button></div>')},
 'reopen-act':async function(t){var n=gv('rd-text');if(!n){dlgErr('A note is required');return}await verifyAction(t.getAttribute('data-id'),false,n);closeDlg();toast('Reopened')},
 'm-assign':function(t){var id=t.getAttribute('data-id'),a=S.actions.find(function(x){return x.id===id}),u=effUser();
   openDlg('<h3>Assign '+esc(a.ref)+'</h3><div class="fld"><label for="as-to">New owner</label><select id="as-to">'+scopedUsers(u).map(function(x){return '<option value="'+esc(x.email)+'"'+(x.email===a.owner?' selected':'')+'>'+esc(x.name+' · '+x.role)+'</option>'}).join('')+'</select></div><div class="fld"><label for="as-why">Note</label><input id="as-why" class="in"></div><div id="d-err"></div><div class="row"><button class="btn pri" data-act="assign-go" data-id="'+esc(id)+'">Assign</button><button class="btn" data-act="dlg-close">Cancel</button></div>')},
 'assign-go':async function(t){await assignAction(t.getAttribute('data-id'),gv('as-to'),gv('as-why'));closeDlg();toast('Assigned')},
 'm-due':function(t){var id=t.getAttribute('data-id'),a=S.actions.find(function(x){return x.id===id});
   openDlg('<h3>Change due date · '+esc(a.ref)+'</h3><div class="fld"><label for="du-d">New due date</label><input id="du-d" type="date" class="in" value="'+a.due+'"></div><div class="fld"><label for="du-why">Reason (required)</label><input id="du-why" class="in"></div><p class="note">The follow-up ladder restarts from the new date. Drafts already made stay in the log.</p><div id="d-err"></div><div class="row"><button class="btn pri" data-act="due-go" data-id="'+esc(id)+'">Save</button><button class="btn" data-act="dlg-close">Cancel</button></div>')},
 'due-go':async function(t){var d=gv('du-d'),w=gv('du-why');if(!/^\d{4}-\d\d-\d\d$/.test(d)){dlgErr('Pick a date');return}if(!w){dlgErr('A reason is required');return}await changeDue(t.getAttribute('data-id'),d,w);closeDlg();toast('Due date changed')},
 'm-cancel':function(t){var id=t.getAttribute('data-id');openDlg('<h3>Cancel action</h3><div class="fld"><label for="rd-text">Reason (required)</label><textarea id="rd-text"></textarea></div><div id="d-err"></div><div class="row"><button class="btn warn" data-act="cancel-go" data-id="'+esc(id)+'">Cancel action</button><button class="btn" data-act="dlg-close">Back</button></div>')},
 'cancel-go':async function(t){var n=gv('rd-text');if(!n){dlgErr('A reason is required');return}await cancelAction(t.getAttribute('data-id'),n);closeDlg()},
 'ra-save':function(){return saveRaise()},
 'fu-copy':function(t){var f=S.followups.find(function(x){return x._id===t.getAttribute('data-id')});if(!f)return;var w=t.getAttribute('data-w');return copyText(w==='wa'?f.wa_text:f.subject+'\n\n'+f.body,'Copied. Paste it into your mail or WhatsApp.')},
 'fu-sent':function(t){return markSent(t.getAttribute('data-id'))},
 'fu-dismiss':function(t){var id=t.getAttribute('data-id');openDlg('<h3>Dismiss draft</h3><div class="fld"><label for="rd-text">Reason (required)</label><input id="rd-text" class="in"></div><div id="d-err"></div><div class="row"><button class="btn pri" data-act="dismiss-go" data-id="'+esc(id)+'">Dismiss</button><button class="btn" data-act="dlg-close">Back</button></div>')},
 'dismiss-go':async function(t){var n=gv('rd-text');if(!n){dlgErr('A reason is required');return}await dismissDraft(t.getAttribute('data-id'),n);closeDlg()},
 'log-csv':function(){return logCsv()}
});
function superOnly(what){if(readOnly()){toast('Viewing as another user: preview is read-only');return false}var u=effUser();if(!u||u.role!=='Super admin'){toast('Only a Super admin can '+what+'. Ask a Super admin; it needs a reason and is logged.');return false}return true}
function copyText(text,msg){
  try{if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text).then(function(){toast(msg||'Copied')},function(){showCopy('Copy',text)})}catch(e){}
  showCopy('Copy',text);return Promise.resolve();
}
document.addEventListener('change',function(ev){
  var t=ev.target,c=t.getAttribute&&t.getAttribute('data-chg');if(!c)return;
  if(c==='flt'){var k=t.getAttribute('data-k');S.f[k]=t.value;if(k==='from'&&S.f.to&&S.f.to<t.value)S.f.to=t.value;S.lastHtml='';schedule()}
  else if(c==='acf'){S.acF[t.getAttribute('data-k')]=t.value;S.lastHtml='';schedule()}
  else if(c==='logf'){S.logF[t.getAttribute('data-k')]=t.value;S.lastHtml='';schedule()}
  else if(c==='viewas'){
    var em=t.value||null;S.viewAs=em;S.lastHtml='';S.engSig=null;S.ladSig=null;DS.ver++;
    if(em){dset('log/va'+Date.now().toString(36),{at:nowISO(),by:S.viewer.email,event:'view as',who:em}).catch(function(){})}
    var u2=effUser();if(u2&&!canPage(u2,S.tab))location.hash='#/today';
    schedule();ingestRoll();
  }
});
var inTimer=0;
document.addEventListener('input',function(ev){
  var t=ev.target,c=t.getAttribute&&t.getAttribute('data-in');if(!c)return;
  clearTimeout(inTimer);var v=t.value;
  inTimer=setTimeout(function(){
    if(c==='fsearch')S.f.search=v;else if(c==='acq')S.acF.q=v;else if(c==='logq')S.logF.q=v;
    S.lastHtml='';schedule();
  },250);
});
