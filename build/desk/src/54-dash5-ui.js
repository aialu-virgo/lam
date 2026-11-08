/* ================= My Dashboard, part 5: page, grid, drag and resize, layouts, drill-down ================= */
S.dash={loaded:false,loading:false,owner:'',cards:[],baseJson:'[]',mine:null,active:'default',pub:null,edit:false,per:{k:'QTD'},html:{},dr:{},more:{},undo:null,builder:null,err:'',msg:''};
(function(){try{var p=JSON.parse(lsGet('desk-dash-per')||'null');if(p&&D_PERK[p.k]&&p.k!=='follow')S.dash.per=p}catch(e){}})();
function pagesFor(u){var l=pagesFor0(u);if(l.length&&l.indexOf('dashboard')<0)l.splice(Math.min(1,l.length),0,'dashboard');return l}
function dUserKey(u){u=u||effUser();return 'u_'+slug((u&&u.email)||'owner')}
function dOwnerKey(){var u=effUser();return u?(u.email||'')+'|'+u.role+'|'+(S.viewAs||''):''}
function dPersist(patch){
  /* My layout lives in dashlayouts/u_<email> (page-enforced: a person writes only their own doc); never when previewing as another user */
  if(readOnly())return Promise.resolve();
  var u=realUser(),D=S.dash,doc=Object.assign({email:u.email||'',role:u.role,mine:D.mine||[],active:D.active,at:nowISO(),by:whoAmI(),v:1},patch||{});
  return dset('dashlayouts/'+dUserKey(u),doc);
}
async function dLoad(){
  var D=S.dash,u=effUser();if(!u)return;
  var ok=dOwnerKey();if(D.owner===ok&&(D.loaded||D.loading))return;
  D.owner=ok;D.loading=true;D.loaded=false;D.dr={};D.more={};D.err='';
  var mine=null,active='default',pub=null;
  try{var s=await dget('dashlayouts/'+dUserKey(u));if(s&&s.exists){var d=s.data();var ml=dSanList(d.mine||d.cards);if(ml.length){mine=ml;active=d.active==='default'?'default':'mine'}}}catch(e){D.err='Could not read your saved layout: '+dbErrText(e)}
  try{var p=await dget('dashroles/role_'+slug(u.role));if(p&&p.exists){var pl=dSanList(p.data().cards);if(pl.length)pub=pl}}catch(e){}
  if(D.owner!==ok)return;
  D.mine=mine;D.pub=pub;D.active=mine&&active==='mine'?'mine':'default';
  D.cards=D.active==='mine'?dClone(mine):dClone(pub||dBuiltin(u.role));
  D.baseJson=JSON.stringify(D.cards);D.loaded=true;D.loading=false;D.edit=false;dBump();
}
function dDirty(){return JSON.stringify(S.dash.cards)!==S.dash.baseJson}
function dCardById(id){return S.dash.cards.find(function(c){return c.id===id})||(S.dash.builder&&S.dash.builder.card&&S.dash.builder.card.id===id?S.dash.builder.card:null)}
function dCanEdit(){return !readOnly()}

/* ---- period controls (header and builder) ---- */
function dQList(){return closedQuarters().concat([curQuarterKey()]).reverse()}
function dMList(){var out=[],t=TODAY().slice(0,7),lo=histLoYm();for(var m=t;m>=lo&&out.length<40;m=shiftYm(m,-1))out.push(m);return out}
function dFyList(){var seen={},out=[];dQList().forEach(function(q){var fy=q.slice(0,4);if(!seen[fy]){seen[fy]=1;out.push({fy:fy,q:q})}});return out}
function dPerCtl(p,scope,withFollow){
  p=p||{k:withFollow?'follow':'QTD'};var id='dper-'+scope;
  var opts=Object.keys(D_PERK).filter(function(k){return withFollow||k!=='follow'});
  var h='<div class="fld"><label for="'+id+'-k">Period</label><select id="'+id+'-k" class="in" data-dsh="per" data-s="'+scope+'" data-k="k">'+opts.map(function(k){return '<option value="'+k+'"'+(p.k===k?' selected':'')+'>'+esc(D_PERK[k])+'</option>'}).join('')+'</select></div>';
  var cur=curQuarterKey(),sel=function(key,list,val,lab){return '<div class="fld"><label for="'+id+'-'+key+'">'+lab[0]+'</label><select id="'+id+'-'+key+'" class="in" data-dsh="per" data-s="'+scope+'" data-k="'+key+'">'+list.map(function(x){return '<option value="'+esc(x[0])+'"'+(val===x[0]?' selected':'')+'>'+esc(x[1])+'</option>'}).join('')+'</select></div>'};
  if(p.k==='MTD')h+=sel('m',dMList().map(function(m){return [m,ymLabel(m)]}),p.m||TODAY().slice(0,7),['Month']);
  if(p.k==='Q')h+=sel('q',dQList().map(function(q){return [q,qLabel(q)+(q===cur?' (to date)':'')]}),p.q||prevQ(cur),['Quarter']);
  if(p.k==='FY')h+=sel('q',dFyList().map(function(x){return [x.q,x.fy+(x.q===cur||x.fy===cur.slice(0,4)?' so far':'')]}),p.q||cur,['Financial year']);
  if(p.k==='CUSTOM'){var ms=dMList().slice().reverse();h+=sel('from',ms.map(function(m){return [m,ymLabel(m)]}),p.from||shiftYm(TODAY().slice(0,7),-1),['From month'])+sel('to',ms.map(function(m){return [m,ymLabel(m)]}),p.to||TODAY().slice(0,7),['To month'])}
  return h;
}
function dPerSet(p,k,v){
  if(k==='k'){var cur=curQuarterKey(),n={k:v};if(v==='MTD')n.m=TODAY().slice(0,7);if(v==='Q')n.q=prevQ(cur);if(v==='FY')n.q=cur;if(v==='CUSTOM'){n.from=shiftYm(TODAY().slice(0,7),-1);n.to=TODAY().slice(0,7)}return n}
  var o=Object.assign({},p);o[k]=v;if(o.k==='CUSTOM'&&o.to<o.from)o.to=o.from;return o;
}

/* ---- the card ---- */
function dReadLine(card){
  var meas=MEAS[card.measure];if(!meas)return '';var res=dRes(card.period),by=meas.fixedBy||card.by||'none';
  var bm=meas.kind==='bench'?(MEAS[card.base]||MEAS.sheets):null;
  var f=(card.filters||[]).map(function(x){return D_BY[x.dim].toLowerCase()+' '+x.vals.slice(0,3).join(', ')+(x.vals.length>3?' +'+(x.vals.length-3):'')});
  return meas.label+(bm?' of '+bm.label:'')+(by!=='none'?', by '+D_BY[by]:'')+(f.length?', where '+f.join(' and '):'')+', for '+res.label+(meas.snap?' (latest snapshot, no period)':', compared QoQ with '+(res.qNote||'the previous quarter'))+', drawn as '+(D_VIS[card.visual]||'table').toLowerCase();
}
function dCrumbs(card){
  var d=S.dash.dr[card.id];if(!d||!(d.stack&&d.stack.length||d.period))return '';
  var h='<div class="crumbs dsh-cr"><button class="chip" data-act="d-crumb" data-c="'+esc(card.id)+'" data-i="0">'+esc(dCardTitle(card))+'</button>';
  (d.stack||[]).forEach(function(s,i){h+=' › <button class="chip'+(i===d.stack.length-1?' on':'')+'" data-act="d-crumb" data-c="'+esc(card.id)+'" data-i="'+(i+1)+'">'+esc(D_BY[s.dim]+': '+s.val)+'</button>'});
  if(d.period)h+=' › <span class="chip on">'+esc(dRes(d.period).label)+'</span>';
  return h+'</div>';
}
function dCardHtml(card,opt){
  opt=opt||{};var D=S.dash,edit=!!(D.edit&&!opt.preview&&dCanEdit()),meas=MEAS[card.measure];
  var ck=[JSON.stringify(card),dDataSig(),edit,JSON.stringify(D.dr[card.id]||null),D.more[card.id]||'',JSON.stringify(D.per),opt.preview?'p':''].join('#');
  var hit=D.html[card.id];if(hit&&hit.k===ck)return hit.h;
  var eff=dEff(card),R=meas?dRun(eff):{err:'Unknown measure'},res=meas?dRes(eff.period):null;
  var title=dCardTitle(card),ic=meas?'<span class="dsh-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'+(D_MOD_ICON[meas.mod]||'')+'</svg></span>':'';
  var idx=D.cards.indexOf(card),n=D.cards.length,cid=esc(card.id);
  var tools='';
  if(edit){
    tools='<div class="dsh-tools"><button class="dsh-hd" data-dd="handle" aria-label="Move '+esc(title)+' (drag, or Alt with arrow keys)" title="Drag to move; Alt+arrow keys also move">⋮⋮</button>'
     +'<button class="btn sm dsh-ud" data-act="d-mv" data-c="'+cid+'" data-d="-1" aria-label="Move up"'+(idx<=0?' disabled':'')+'>↑</button><button class="btn sm dsh-ud" data-act="d-mv" data-c="'+cid+'" data-d="1" aria-label="Move down"'+(idx>=n-1?' disabled':'')+'>↓</button>'
     +'<span class="dsh-w" role="group" aria-label="Width in columns">'+[1,2,3,4].map(function(w){return '<button class="btn sm" data-act="d-span" data-c="'+cid+'" data-w="'+w+'" aria-pressed="'+(card.span===w)+'" aria-label="Width '+w+' of 4">'+w+'</button>'}).join('')+'</span>'
     +'<button class="btn sm" data-act="d-edit" data-c="'+cid+'">Edit</button><button class="btn sm" data-act="d-copy" data-c="'+cid+'">Copy</button><button class="btn sm" data-act="d-rm" data-c="'+cid+'">Remove</button></div>';
  }
  var chips='';
  if(res&&meas){chips='<span class="ox-chip sm">'+esc(meas.snap?'latest snapshot':res.label)+'</span>';if(R&&R.rows&&R.rows.some(function(r){return r.partial}))chips+='<span class="ox-chip sm nl dsh-hat">partial</span>'}
  var actions='';
  if(meas&&!R.err&&!R.locked&&(meas.kind==='sales')&&!meas.snap)actions+='<button class="ox-drill" data-act="d-docs" data-c="'+cid+'">SAP documents ›</button>';
  if(meas&&(eff.visual==='ranked')&&!R.err)actions+='<button class="ox-drill" data-act="d-dir" data-c="'+cid+'" '+(dCanEdit()?'':'disabled')+'>'+((card.dir||'top')==='bottom'?'Showing bottom ›':'Showing top ›')+'</button>';
  var body;try{body=dBodyHtml(card)}catch(e){body='<div class="ox-empty"><b>This card could not be drawn</b><span>'+esc((e&&e.message)||e)+'</span></div>'}
  var foot='';
  if(meas&&res){foot='<span>Binds to: '+esc(meas.src)+'</span><span>'+(meas.snap?(R&&R.rows&&R.rows[0]&&R.rows[0].x&&R.rows[0].x.asOf?'As on '+esc(fmtDate(R.rows[0].x.asOf)):'Latest snapshot'):esc(res.label)+' · QoQ with '+esc(res.qNote||'previous quarter'))+'</span>';
    var basis=R&&R.rows&&R.rows[0]&&R.rows[0].x&&R.rows[0].x.basis;if(basis&&meas.kind==='sales')foot+='<span>Basis: '+esc(basis)+'</span>';
    if(S.uploads.some(function(u){return u.demo})||S.actions.some(function(a){return a.demo}))foot+='<span class="ox-chip sm demo">DEMO data loaded</span>'}
  var h='<section class="ox-card dsh-card'+(edit?' editing':'')+'" data-id="'+cid+'" data-sp="'+card.span+'" aria-label="'+esc(title)+'"><header class="dsh-h">'+ic+'<h2><span>'+esc(title)+'</span>'+chips+'</h2>'+actions+'</header>'+tools+dCrumbs(card)+'<div class="dsh-b">'+body+'</div><footer class="dsh-f">'+foot+'</footer>'+(edit?'<span class="dsh-grip" data-dd="grip" aria-hidden="true" title="Drag to resize"></span>':'')+'</section>';
  D.html[card.id]={k:ck,h:h};return h;
}

/* ---- the page ---- */
function dLayoutBar(u){
  var D=S.dash,cap=dCapFor(u.role),over=D.cards.length>cap,sa=effRole()==='Super admin'&&!readOnly(),ro=!dCanEdit();
  var res=dRes({k:'follow'});
  var h='<section class="ox-banner dsh-ctl" aria-label="Dashboard controls"><div class="dsh-bar1"><b>My Dashboard</b><span class="ox-chip sm">'+esc(u.role)+'</span>'
   +(D.active==='mine'?'<span class="ox-chip sm ok">My layout</span>':'<span class="ox-chip sm nl">'+(D.pub?'Role default (published)':'Role default (built in)')+'</span>')
   +(dDirty()&&!ro?'<span class="ox-chip sm warn" role="status">Unsaved changes</span>':'')
   +'<span class="ox-chip sm nl">Compared with: '+esc(res.qNote||res.priorLabel||'previous quarter')+'</span></div>'
   +'<div class="dsh-bar2">'+dPerCtl(D.per,'hdr',false)+'</div>';
  if(!ro){
    h+='<div class="dsh-bar3"><button class="btn sm" data-act="d-edit-toggle" aria-pressed="'+D.edit+'">'+(D.edit?'Done customising':'Customise')+'</button><button class="btn sm pri" data-act="d-add">+ Add card</button>'
     +'<button class="btn sm" data-act="d-save"'+(dDirty()?'':' disabled')+'>Save layout</button>'
     +'<button class="btn sm" data-act="d-reset"'+(D.active==='default'&&!dDirty()?' disabled':'')+'>Reset to role default</button>'
     +(D.mine&&D.active==='default'?'<button class="btn sm" data-act="d-mine">Switch to my layout</button>':'')
     +(sa?'<button class="btn sm" data-act="d-pub">Publish as role default…</button>':'')+'</div>';
  }else h+='<div class="dsh-bar3"><span class="note">Previewing another person\'s dashboard: read-only, nothing is saved.</span></div>';
  if(over)h+='<div class="dsh-note" role="note">This layout has '+D.cards.length+' cards; the usual for a '+esc(u.role)+' is '+cap+'. More is allowed, it is only flagged: fewer cards are easier to act on.</div>';
  if(D.undo)h+='<div class="dsh-note ok" role="status">Removed "'+esc(dCardTitle(D.undo.card))+'". <button class="btn sm" data-act="d-undo">Undo</button></div>';
  if(D.err)h+='<div class="dsh-note err" role="alert">'+esc(D.err)+'</div>';
  return h+'</section>';
}
function pageDash(){
  var D=S.dash,u=effUser();if(!u)return '';
  if(!D.loaded){dLoad();return '<div class="ox dsh"><div class="ox-empty"><b>Opening your dashboard…</b><span>Reading your saved layout.</span></div></div>'}
  if(D.dragging&&D.lastPage)return D.lastPage;
  var ro=!dCanEdit();
  D.html=D.html||{};
  var h='<div class="ox dsh'+(D.edit&&!ro?' editing':'')+'" id="dsh">'+dLayoutBar(u);
  h+='<div class="ox-banner"><b>Bar colour = Ach %</b><span class="ox-bands">'+[1,2,3,4].map(function(b){var r=['','&lt;75','75–&lt;90','90–&lt;100','100+'][b];return '<span><i class="b'+b+'"></i>'+r+' '+OX_MARK[b]+' '+OX_LBL[b]+'</span>'}).join('')+'</span><span class="note">Growth is always against the previous quarter. Partial periods are hatched, never zero.</span></div>';
  if(!D.cards.length)h+='<div class="ox-empty"><b>No cards yet</b><span>Add a card from the starter library, or build your own.</span></div>';
  h+='<div class="dsh-grid" id="dsh-grid">'+D.cards.map(function(c){return dCardHtml(c)}).join('')+'</div></div>';
  D.lastPage=h;return h;
}

/* ---- actions on the layout ---- */
function dTouch(){S.dash.html={};S.lastHtml='';schedule()}
function dMoveTo(id,newIdx){var D=S.dash,i=D.cards.findIndex(function(c){return c.id===id});if(i<0)return;var c=D.cards.splice(i,1)[0];D.cards.splice(Math.max(0,Math.min(D.cards.length,newIdx)),0,c);dTouch()}
function dFocusHandle(id){setTimeout(function(){var b=document.querySelector('.dsh-card[data-id="'+id+'"] .dsh-hd');if(b)b.focus()},120)}
async function dSaveLayout(){
  if(!dCanEdit()){toast('Previewing as another user: nothing can be saved');return}
  var D=S.dash;
  try{D.mine=dClone(D.cards);D.active='mine';await dPersist({mine:D.mine,active:'mine'});D.baseJson=JSON.stringify(D.cards);D.err='';toast('Layout saved to your dashboard');dTouch()}
  catch(e){D.err='Could not save your layout: '+dbErrText(e);dTouch();throw e}
}
Object.assign(handlers,{
 'd-edit-toggle':function(){S.dash.edit=!S.dash.edit;dTouch()},
 'd-add':function(){dBuilderOpen(null,'lib')},
 'd-edit':function(t){var c=dCardById(t.getAttribute('data-c'));if(c)dBuilderOpen(c,'build')},
 'd-copy':function(t){var D=S.dash,c=dCardById(t.getAttribute('data-c'));if(!c)return;var n=dClone(c);n.id=dUid();n.title=(c.title||dDefTitle(c))+' (copy)';D.cards.splice(D.cards.indexOf(c)+1,0,n);dTouch()},
 'd-rm':function(t){var D=S.dash,id=t.getAttribute('data-c'),i=D.cards.findIndex(function(c){return c.id===id});if(i<0)return;D.undo={card:D.cards[i],index:i};D.cards.splice(i,1);dTouch()},
 'd-undo':function(){var D=S.dash;if(!D.undo)return;D.cards.splice(Math.min(D.undo.index,D.cards.length),0,D.undo.card);D.undo=null;dTouch()},
 'd-mv':function(t){var D=S.dash,id=t.getAttribute('data-c'),i=D.cards.findIndex(function(c){return c.id===id}),d=+t.getAttribute('data-d');if(i<0)return;dMoveTo(id,i+d);dFocusHandle(id)},
 'd-span':function(t){var c=dCardById(t.getAttribute('data-c'));if(c){c.span=+t.getAttribute('data-w');dTouch()}},
 'd-save':function(){return dSaveLayout()},
 'd-reset':async function(){
   var D=S.dash,u=effUser();if(!dCanEdit())return;
   D.cards=dClone(D.pub||dBuiltin(u.role));D.active='default';D.baseJson=JSON.stringify(D.cards);D.dr={};
   if(D.mine)await dPersist({mine:D.mine,active:'default'});
   toast('Reset to the role default'+(D.mine?'. Your own layout is kept: use "Switch to my layout"':''));dTouch();
 },
 'd-mine':async function(){var D=S.dash;if(!D.mine)return;D.cards=dClone(D.mine);D.active='mine';D.baseJson=JSON.stringify(D.cards);D.dr={};await dPersist({mine:D.mine,active:'mine'});dTouch()},
 'd-pub':function(){
   if(!superOnly('publish a role default'))return;
   var roles=ROLES.filter(function(r){return r!=='Super admin'});
   openDlg('<h3>Publish as role default</h3><p class="note" style="margin:0">Publishes the '+S.dash.cards.length+' cards now on this dashboard as the starting layout for one role. People who saved their own layout keep it; everyone else sees this one. Cards using measures outside that role\'s scope show as locked for them.</p>'
    +'<div class="fld"><label for="dpub-role">Role</label><select id="dpub-role" class="in">'+roles.map(function(r){return '<option>'+esc(r)+'</option>'}).join('')+'</select></div><div id="d-err"></div><div class="row"><button class="btn pri" data-act="d-pub-go">Publish</button><button class="btn" data-act="dlg-close">Cancel</button></div>');
 },
 'd-pub-go':async function(){
   if(!superOnly('publish a role default'))return;
   var role=gv('dpub-role'),cards=dClone(S.dash.cards);
   try{await dset('dashroles/role_'+slug(role),{role:role,cards:cards,at:nowISO(),by:whoAmI(),v:1});try{await auditW('dashboard default published','',{role:role,cards:cards.length})}catch(e2){}
     if(role===(effUser()&&effUser().role))S.dash.pub=dSanList(cards);closeDlg();toast('Published as the default for '+role);dTouch()}
   catch(e){var el=$('#d-err');if(el)el.innerHTML='<div class="banner err">'+esc(dbErrText(e))+'</div>'}
 },
 'd-more':function(t){var id=t.getAttribute('data-c');S.dash.more[id]=1;dTouch()},
 'd-dir':function(t){var c=dCardById(t.getAttribute('data-c'));if(c&&dCanEdit()){c.dir=(c.dir||'top')==='bottom'?'top':'bottom';dTouch()}},
 'd-drill':function(t,ev){if(ev&&ev.target&&ev.target.closest&&ev.target.closest('.dsh-card.editing')&&ev.target.closest('[data-dd]'))return;return dDrill(t.getAttribute('data-c'),t.getAttribute('data-k'))},
 'd-crumb':function(t){var id=t.getAttribute('data-c'),i=+t.getAttribute('data-i'),d=S.dash.dr[id];if(!d)return;
   if(i<=0)delete S.dash.dr[id];else if(d.stack&&d.stack.length){var by=d.stack[i]?d.stack[i].from:d.by;d.stack=d.stack.slice(0,i);d.by=by}else{d.period=null}
   var x=S.dash.dr[id];if(x&&!(x.stack&&x.stack.length)&&!x.period)delete S.dash.dr[id];dTouch()},
 'd-docs':function(t){return dDocsOpen(t.getAttribute('data-c'))}
});
var D_NEXT={zone:'plant',state:'plant',plant:'customer',group:'plant',thickness:'brand',brand:'thickness',salesperson:'customer'};
function dDrill(cid,k){
  var card=dCardById(cid);if(!card)return;var eff=dEff(card),R=dRun(eff);if(!R||!R.rows)return;
  var r=R.rows.find(function(x){return String(x.k)===String(k)});if(!r||!r.dim)return;
  var D=S.dash,d=D.dr[cid]||(D.dr[cid]={by:null,stack:[]}),meas=R.meas;
  var curBy=eff.by||R.by;
  if(['month','quarter','fy'].indexOf(r.dim)>=0){
    var per=r.dim==='month'?{k:'MTD',m:r.k}:r.dim==='quarter'?{k:'Q',q:r.k}:{k:'FY',q:(function(){var qs=closedQuarters().concat([curQuarterKey()]).filter(function(q){return q.slice(0,4)===r.k});return qs[qs.length-1]})()};
    d.period=per;d.by=meas.dims.indexOf('plant')>=0&&!meas.fixedBy?'plant':'none';dTouch();return;
  }
  var used={};(card.filters||[]).concat(d.stack).forEach(function(f){used[f.dim]=1});used[r.dim]=1;
  d.stack.push({dim:r.dim,val:r.k,from:curBy});
  var next=D_NEXT[r.dim];
  if(next&&(used[next]||!dDimOk(Object.assign({},eff,{by:next}),next)||(next==='customer'&&['sales','recv','coll'].indexOf((R.baseMeas||meas).kind)<0)))next=null;
  if(!next){/* lowest level: the card is filtered; sales cards offer the SAP documents behind it */
    d.by='none';if(meas.kind==='sales'&&(meas.f!=='n'||true)){dTouch();toast('Lowest level. "SAP documents" lists the documents behind this card.');return}
  }else d.by=next;
  dTouch();
}
async function dDocsOpen(cid){
  var card=dCardById(cid);if(!card)return;var eff=dEff(card),F=dFilt(eff),res=dRes(eff.period),ms=res.curMonths.slice().reverse();
  if(!ms.length){toast('No loaded month in this period');return}
  var st=S.dash.docs={cid:cid,ym:ms.find(function(m){return S.cells['INV_'+m]})||ms[0]};
  var pickCust=F.cust&&F.cust.size===1?Array.from(F.cust)[0]:null;
  var ctx={sc:SC(),plants:F.plants},spF=F.spPick?spCanon(F.spPick):null;
  S.dash.docsCtx={ctx:ctx,cust:pickCust,spF:spF,ms:ms};
  dDocsRender();
}
function dDocsRender(){
  var st=S.dash.docs,c=S.dash.docsCtx;if(!st||!c)return;
  var html='<h3>SAP documents behind the card</h3><div class="fld"><label for="dd-m">Month</label><select id="dd-m" class="in" data-dsh="docsm">'+c.ms.map(function(m){return '<option value="'+m+'"'+(m===st.ym?' selected':'')+'>'+ymLabel(m)+'</option>'}).join('')+'</select></div><div id="dd-docs">'+docList(c.ctx,st.ym,c.cust,null,c.spF)+'</div><div class="row"><button class="btn" data-act="dlg-close">Close</button></div>';
  if(!document.getElementById('dd-docs'))openDlg(html);else document.getElementById('dd-docs').innerHTML=docList(c.ctx,st.ym,c.cust,null,c.spF);
  var tries=0;(function poll(){var el=document.getElementById('dd-docs');if(!el||tries++>60)return;var h=docList(c.ctx,st.ym,c.cust,null,c.spF);if(/Loading documents/.test(h)){setTimeout(poll,400)}else el.innerHTML=h})();
}
document.addEventListener('change',function(ev){
  var t=ev.target,k=t.getAttribute&&t.getAttribute('data-dsh');if(!k)return;
  if(k==='per'){
    var sc=t.getAttribute('data-s'),f=t.getAttribute('data-k');
    if(sc==='hdr'){S.dash.per=dPerSet(S.dash.per,f,t.value);try{lsSet('desk-dash-per',JSON.stringify(S.dash.per))}catch(e){}dTouch()}
    else if(sc==='draft'&&S.dash.builder){var c=S.dash.builder.card;c.period=dPerSet(c.period,f,t.value);dBuilderRender()}
  }else if(k==='docsm'){S.dash.docs.ym=t.value;dDocsRender()}
  else dBuilderChange(t,k);
});

/* ---- pointer drag (move), corner grip (resize), keyboard ---- */
var DD=null;
function ddScroll(y){var m=70;if(y<m)window.scrollBy(0,-18);else if(y>window.innerHeight-m)window.scrollBy(0,18)}
document.addEventListener('pointerdown',function(ev){
  var h=ev.target.closest&&ev.target.closest('[data-dd]');if(!h||DD)return;
  var card=h.closest('.dsh-card');if(!card||!S.dash.edit||!dCanEdit())return;
  if(ev.pointerType==='mouse'&&ev.button!==0)return;
  ev.preventDefault();var grid=card.parentNode,r=card.getBoundingClientRect(),kind=h.getAttribute('data-dd');
  S.dash.dragging=true;
  if(kind==='handle'){
    var ph=document.createElement('div');ph.className='dsh-ph';ph.setAttribute('data-sp',card.getAttribute('data-sp'));ph.style.height=r.height+'px';
    var ghost=card.cloneNode(true);ghost.classList.add('dsh-ghost');ghost.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;pointer-events:none;z-index:60';
    grid.insertBefore(ph,card);card.style.display='none';document.body.appendChild(ghost);
    DD={mode:'move',id:card.getAttribute('data-id'),card:card,grid:grid,ph:ph,ghost:ghost,dx:ev.clientX-r.left,dy:ev.clientY-r.top};
  }else DD={mode:'resize',id:card.getAttribute('data-id'),card:card,grid:grid,left:r.left,span:+card.getAttribute('data-sp')};
  window.addEventListener('pointermove',ddMove);window.addEventListener('pointerup',ddUp);window.addEventListener('pointercancel',ddCancel);
});
function ddMove(ev){
  if(!DD)return;
  if(DD.mode==='move'){
    DD.ghost.style.left=(ev.clientX-DD.dx)+'px';DD.ghost.style.top=(ev.clientY-DD.dy)+'px';ddScroll(ev.clientY);
    var el=document.elementFromPoint(ev.clientX,ev.clientY),t=el&&el.closest&&el.closest('.dsh-card');
    if(t&&t!==DD.card&&t.parentNode===DD.grid){
      var r=t.getBoundingClientRect(),cols=getComputedStyle(DD.grid).gridTemplateColumns.split(' ').length;
      var before=cols>1?((ev.clientX-r.left)/r.width<0.5):((ev.clientY-r.top)/r.height<0.5);
      DD.grid.insertBefore(DD.ph,before?t:t.nextSibling);
    }
  }else{
    var cs=getComputedStyle(DD.grid),cols2=cs.gridTemplateColumns.split(' ').length,gap=parseFloat(cs.columnGap)||14,colW=(DD.grid.clientWidth-(cols2-1)*gap)/cols2;
    var span=Math.max(1,Math.min(cols2,Math.round((ev.clientX-DD.left+gap)/(colW+gap))));DD.span=span;DD.card.setAttribute('data-sp',span);
  }
}
function ddEnd(){window.removeEventListener('pointermove',ddMove);window.removeEventListener('pointerup',ddUp);window.removeEventListener('pointercancel',ddCancel)}
function ddUp(){
  if(!DD)return;var d=DD;DD=null;ddEnd();S.dash.dragging=false;
  if(d.mode==='move'){
    var ids=[];Array.prototype.forEach.call(d.grid.children,function(ch){if(ch===d.ph)ids.push(d.id);else if(ch!==d.card&&ch.getAttribute&&ch.getAttribute('data-id'))ids.push(ch.getAttribute('data-id'))});
    d.ghost.remove();d.ph.remove();d.card.style.display='';
    var by={};S.dash.cards.forEach(function(c){by[c.id]=c});S.dash.cards=ids.map(function(i){return by[i]}).filter(Boolean);
    if(S.dash.cards.length!==Object.keys(by).length){/* never lose a card */S.dash.cards=Object.keys(by).map(function(k){return by[k]})}
    dTouch();dFocusHandle(d.id);
  }else{var c=dCardById(d.id);if(c)c.span=d.span;dTouch()}
}
function ddCancel(){
  if(!DD)return;var d=DD;DD=null;ddEnd();S.dash.dragging=false;
  if(d.mode==='move'){d.ghost.remove();d.ph.remove();d.card.style.display=''}else dTouch();
}
document.addEventListener('keydown',function(ev){
  var h=ev.target.closest&&ev.target.closest('.dsh-hd');if(!h||!ev.altKey)return;
  var id=h.closest('.dsh-card').getAttribute('data-id'),D=S.dash,i=D.cards.findIndex(function(c){return c.id===id}),d=(ev.key==='ArrowUp'||ev.key==='ArrowLeft')?-1:(ev.key==='ArrowDown'||ev.key==='ArrowRight')?1:0;
  if(!d)return;ev.preventDefault();dMoveTo(id,i+d);dFocusHandle(id);
});
