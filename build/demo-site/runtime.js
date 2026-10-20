/* ===== DEMO RUNTIME (replaces the platform db and user layer with an in-browser store; no network, no sign-in) ===== */
var DM_PW='Demo@123';
var DM_ACCTS=[
 ['Super admin','demo.super@demo','Demo Super Admin','Everything, including Admin, Data Intake and View as role'],
 ['Management / HO','demo.mgmt@demo','Demo Management','All branches; approves plans'],
 ['HOD','demo.hod@demo','Demo HOD Sales','Sales department across branches'],
 ['Branch manager','demo.branchmgr@demo','Demo Branch Manager A','Branch 1012 and its team'],
 ['Sales executive','demo.salesexec@demo','Demo Sales 1','Own customers only'],
 ['Coordinator','demo.coordinator@demo','Demo Coordinator A','Orders and follow-ups for branch 1012'],
 ['Accounts','demo.accounts@demo','Demo Accounts AB','Receivables for branches 1012 and 1013'],
 ['Plant','demo.plant@demo','Demo Plant B','Orders, dispatch and stock for plant 1013']];
var DM_K={next:'demo-next-v1',sess:'demo-session-v1',auth:'demo-auth-v1',ovl:'demo-overlay-v1',signed:'demo-signed-v1'};
var DM_PERSIST=/^(actions|followups|potential|planlocks|settings|phasing|users|plants|transfers|log|audit)\//;
var DM_MEM={};/* fallback when localStorage is blocked */
function dmGet(k){try{var v=localStorage.getItem(k);if(v!==null)return v}catch(e){}return DM_MEM[k]||null}
function dmSet(k,v){DM_MEM[k]=v;try{localStorage.setItem(k,v);return true}catch(e){return false}}
function dmDel(k){delete DM_MEM[k];try{localStorage.removeItem(k)}catch(e){}}
function dmJ(k,d){try{var v=dmGet(k);return v?JSON.parse(v):d}catch(e){return d}}
function dmAcct(email){return DM_ACCTS.find(function(a){return a[1]===email})||null}
function dmQ(s){return document.querySelector(s)}

/* ---- in-browser store, same surface as the platform database ---- */
var DM_STORE={},DM_SUBS=[],DM_TRACK=false,DM_OVL={},DM_OVL_T=0,DM_OVL_WARN=false;
function dmClone(x){return x===undefined?undefined:JSON.parse(JSON.stringify(x))}
function dmParent(p){var i=p.lastIndexOf('/');return i<0?'':p.slice(0,i)}
function dmNotify(col){DM_SUBS.forEach(function(s){if(s.col===col)s.fire()})}
function dmOvlSave(){
  clearTimeout(DM_OVL_T);
  DM_OVL_T=setTimeout(function(){
    var ok=dmSet(DM_K.ovl,JSON.stringify(DM_OVL));
    if(!ok&&!DM_OVL_WARN){DM_OVL_WARN=true;toast('Browser storage is blocked or full. Your edits last until you close this page.')}
  },250);
}
function dmWrote(path,doc){if(DM_TRACK&&DM_PERSIST.test(path)){DM_OVL[path]=doc===null?null:dmClone(doc);dmOvlSave()}}
function dmChildren(col){return Object.keys(DM_STORE).filter(function(p){return dmParent(p)===col}).sort().map(function(p){return {id:p.slice(p.lastIndexOf('/')+1),exists:true,data:function(){return dmClone(DM_STORE[p])},metadata:{}}})}
function dmSnap(col,q){var docs=dmChildren(col);if(q&&q.order){var f=q.order[0],d=q.order[1];docs.sort(function(a,b){var x=a.data()[f],y=b.data()[f];return (x<y?-1:x>y?1:0)*(d==='desc'?-1:1)})}if(q&&q.lim)docs=docs.slice(0,q.lim);return {docs:docs,size:docs.length,empty:!docs.length,docChanges:function(){return []},metadata:{}}}
function dmQuery(col,q){q=q||{};return {orderBy:function(f,d){return dmQuery(col,Object.assign({},q,{order:[f,d||'asc']}))},limit:function(n){return dmQuery(col,Object.assign({},q,{lim:n}))},where:function(){return dmQuery(col,q)},
  onSnapshot:function(next){var s={col:col,fire:function(){setTimeout(function(){next(dmSnap(col,q))},0)}};DM_SUBS.push(s);s.fire();return function(){DM_SUBS=DM_SUBS.filter(function(x){return x!==s})}},
  get:async function(){return dmSnap(col,q)}}}
var DM_DB={collection:function(c){return dmQuery(c)},doc:function(path){return {
  get:async function(){await tick();var e=path in DM_STORE;return {id:path.slice(path.lastIndexOf('/')+1),exists:e,data:function(){return dmClone(DM_STORE[path])}}},
  set:async function(d){await tick();if(JSON.stringify(d).length>262144)throw {code:'invalid_argument',message:'document too large'};DM_STORE[path]=dmClone(d);dmWrote(path,d);dmNotify(dmParent(path))},
  update:async function(d){if(!(path in DM_STORE))throw {code:'invalid_argument',message:'missing document'};DM_STORE[path]=Object.assign({},DM_STORE[path],dmClone(d));dmWrote(path,DM_STORE[path]);dmNotify(dmParent(path))},
  delete:async function(){delete DM_STORE[path];dmWrote(path,null);dmNotify(dmParent(path))}}}};
function dmInstallClaude(viewer){
  window.__demoStore={open:async function(n){
    if(n==='db')return DM_DB;
    if(n==='user')return {me:async function(){return {id:'demo_'+viewer.email,name:viewer.name,email:viewer.email}},email:async function(){return viewer.email},isOwner:async function(){return false}};
    return null}};
}

/* ---- IndexedDB snapshot of the generated seed (one per day) ---- */
function dmIdb(){return new Promise(function(res,rej){try{var r=indexedDB.open('desk-demo',1);r.onupgradeneeded=function(){r.result.createObjectStore('kv')};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}}catch(e){rej(e)}})}
async function dmIdbGet(k){var db=await dmIdb();return new Promise(function(res,rej){var t=db.transaction('kv').objectStore('kv').get(k);t.onsuccess=function(){res(t.result)};t.onerror=function(){rej(t.error)}})}
async function dmIdbPut(k,v){var db=await dmIdb();return new Promise(function(res,rej){var tx=db.transaction('kv','readwrite');var st=tx.objectStore('kv');st.clear();st.put(v,k);tx.oncomplete=function(){res()};tx.onerror=function(){rej(tx.error)}})}
function dmSnapKey(){return 'seed-v1-'+TODAY()}

/* ---- login screen ---- */
function dmBar(){
  var bar=dmQ('#demobar');var em=dmGet(DM_K.sess),a=dmAcct(em);
  bar.hidden=false;
  var left='<span class="dm-l"><b>DEMO — synthetic data</b><span>Invented figures and DEMO codes. Not Virgo data. Edits stay in this browser.</span></span>';
  var right='';
  if(a)right='<span class="dm-r"><span class="dm-who">'+esc(a[2])+' · '+esc(a[0])+'</span><button class="dbtn" data-dm="switch">Switch user</button><button class="dbtn" data-dm="logout">Log out</button>'+dmResetBtn()+'</span>';
  else right='<span class="dm-r">'+dmResetBtn()+'</span>';
  bar.innerHTML=left+right;
  document.documentElement.style.setProperty('--dbh',bar.offsetHeight+'px');
}
var DM_CONFIRM=false;
function dmResetBtn(){return DM_CONFIRM?'<span class="dm-who">Erase your demo edits and passwords?</span><button class="dbtn red" data-dm="reset-yes">Yes, reset</button><button class="dbtn" data-dm="reset-no">Cancel</button>':'<button class="dbtn lnk" data-dm="reset">Reset demo</button>'}
function dmLoginHtml(pre,step,msg){
  var rows=DM_ACCTS.map(function(a){return '<tr class="'+(a[1]===pre?'pick':'')+'"><td><b>'+esc(a[0])+'</b><div class="note">'+esc(a[3])+'</div></td><td class="mono">'+esc(a[1])+'</td><td><button type="button" class="use" data-dm="use" data-e="'+esc(a[1])+'" aria-label="Use '+esc(a[1])+'">Use</button></td></tr>'}).join('');
  var form;
  if(step==='change'){
    form='<form id="dl-form" class="card dl-form" autocomplete="off"><h2>Choose a new password</h2><p class="note" style="margin:0">First sign-in for <b class="mono">'+esc(pre)+'</b>. The real Desk asks for this on first login. Here the new password is kept only in this browser.</p>'
    +'<div class="fld"><label for="dl-n1">New password</label><input id="dl-n1" type="password" autocomplete="new-password" class="in"></div>'
    +'<div class="fld"><label for="dl-n2">Repeat new password</label><input id="dl-n2" type="password" autocomplete="new-password" class="in"></div>'
    +'<div class="note">At least 8 characters, with a letter and a digit. It must differ from the shared demo password.</div>'
    +'<div class="dl-err" id="dl-err" role="alert">'+esc(msg||'')+'</div><div class="row"><button class="btn pri" type="submit">Save and open the Desk</button><button class="btn" type="button" data-dm="back">Back</button></div></form>';
  }else{
    form='<form id="dl-form" class="card dl-form" autocomplete="off"><h2>Sign in to the demo</h2>'
    +'<div class="dl-pw"><span>Shared demo password for every account</span><code>'+DM_PW+'</code><span class="note">These accounts only open synthetic data. After you set your own password in this browser, use that one instead.</span></div>'
    +'<div class="fld"><label for="dl-u">Username</label><input id="dl-u" class="in" value="'+esc(pre||'')+'" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="demo.salesexec@demo"></div>'
    +'<div class="fld"><label for="dl-p">Password</label><input id="dl-p" type="password" class="in" autocomplete="current-password"></div>'
    +'<div class="dl-err" id="dl-err" role="alert">'+esc(msg||'')+'</div><div class="row"><button class="btn pri" type="submit">Sign in</button></div></form>';
  }
  return '<div class="dl-wrap"><div class="dl-head">'+brandLogo()+'<div><h1>Lam Performance Desk</h1><p>Demo. Pick a role, sign in and try the Desk.</p></div></div>'+form
   +'<section class="card dl-acc"><h2>Demo accounts</h2><div class="tw"><table><thead><tr><th>Role</th><th>Username</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="note" style="margin:0">Every account shares the password <span class="mono">'+DM_PW+'</span> until you change it. Each role sees only its own scope.</p></section>'
   +'<div class="dl-foot"><span>Data Intake works with your own files, but nothing you upload here is saved anywhere.</span></div></div>';
}
function dmShowLogin(pre,step,msg){
  document.body.classList.add('dm-login');dmBar();
  dmQ('#demo-login').innerHTML=dmLoginHtml(pre,step,msg);
  var f=dmQ(step==='change'?'#dl-n1':(pre?'#dl-p':'#dl-u'));if(f&&!matchMedia('(max-width:700px)').matches)f.focus();
  DM_PENDING=step==='change'?pre:null;
}
var DM_PENDING=null;
function dmTryLogin(){
  var u=(dmQ('#dl-u').value||'').trim().toLowerCase(),p=dmQ('#dl-p').value||'',a=dmAcct(u);
  if(!a)return dmShowLogin(u,'login','Unknown username. Pick one from the list on this page.');
  var auth=dmJ(DM_K.auth,{}),own=auth[u];
  if(own){if(p!==own)return dmShowLogin(u,'login','Wrong password. You changed it earlier in this browser. Use that one, or Reset demo.');return dmEnter(u)}
  if(p!==DM_PW)return dmShowLogin(u,'login','Wrong password. The shared demo password is '+DM_PW+'.');
  dmShowLogin(u,'change');
}
function dmChangePw(){
  var u=DM_PENDING,n1=dmQ('#dl-n1').value||'',n2=dmQ('#dl-n2').value||'';
  var err=n1.length<8?'Use at least 8 characters.':!/[A-Za-z]/.test(n1)||!/\d/.test(n1)?'Include at least one letter and one digit.':n1===DM_PW?'Choose a password different from the shared demo password.':n1!==n2?'The two passwords do not match.':'';
  if(err){dmQ('#dl-err').textContent=err;return}
  var auth=dmJ(DM_K.auth,{});auth[u]=n1;dmSet(DM_K.auth,JSON.stringify(auth));dmEnter(u);
}
function dmEnter(email){
  var s=dmJ(DM_K.signed,{});s[email]=1;dmSet(DM_K.signed,JSON.stringify(s));dmSet(DM_K.sess,email);
  try{location.hash='#/today'}catch(e){}
  location.reload();
}
function dmSwitchDlg(){
  var cur=dmGet(DM_K.sess),signed=dmJ(DM_K.signed,{});
  openDlg('<h3>Switch user</h3><p class="note">Accounts you have already signed in to open at once. Others ask for the password.</p><div style="display:flex;flex-direction:column;gap:6px">'
   +DM_ACCTS.map(function(a){return '<button class="btn" style="text-align:left" data-dm="swto" data-e="'+esc(a[1])+'" '+(a[1]===cur?'disabled':'')+'><b>'+esc(a[0])+'</b> <span class="note mono">'+esc(a[1])+(signed[a[1]]?' · signed in before':'')+'</span></button>'}).join('')
   +'</div><div class="row"><button class="btn" data-act="dlg-close">Close</button></div>');
}
document.addEventListener('submit',function(ev){if(ev.target.id==='dl-form'){ev.preventDefault();if(DM_PENDING)dmChangePw();else dmTryLogin()}});
document.addEventListener('click',function(ev){
  var t=ev.target.closest&&ev.target.closest('[data-dm]');if(!t)return;var a=t.getAttribute('data-dm');
  if(a==='use'){dmShowLogin(t.getAttribute('data-e'),'login')}
  else if(a==='back'){dmShowLogin('', 'login')}
  else if(a==='logout'){dmDel(DM_K.sess);location.reload()}
  else if(a==='switch')dmSwitchDlg();
  else if(a==='swto'){var e=t.getAttribute('data-e'),s=dmJ(DM_K.signed,{});if(s[e]&&dmJ(DM_K.auth,{})[e]){dmSet(DM_K.sess,e);try{location.hash='#/today'}catch(x){}location.reload()}else{dmDel(DM_K.sess);dmSet(DM_K.next,e);location.reload()}}
  else if(a==='reset'){DM_CONFIRM=true;dmBar()}
  else if(a==='reset-no'){DM_CONFIRM=false;dmBar()}
  else if(a==='reset-yes'){Object.keys(DM_K).forEach(function(k){dmDel(DM_K[k])});dmDel('desk-today');DM_CONFIRM=false;location.reload()}
});
window.addEventListener('resize',function(){var b=dmQ('#demobar');if(b&&!b.hidden)document.documentElement.style.setProperty('--dbh',b.offsetHeight+'px')});

/* ---- start ---- */
function dmPrep(msg,pct){document.body.classList.add('dm-prep');if(msg)dmQ('#prep-msg').textContent=msg;if(pct!=null)dmQ('#prep-bar').style.width=pct+'%'}
async function dmWait(cond,ms){var t=Date.now();while(Date.now()-t<ms){if(cond())return true;await sleep(150)}return false}
async function dmSeedRun(){
  /* first visit of the day: build the synthetic store as the demo Super admin, then keep a snapshot */
  dmPrep('Generating synthetic data in your browser. This happens once a day and takes under a minute.',10);
  DM_TRACK=false;
  var sup=dmAcct('demo.super@demo');
  dmInstallClaude({email:sup[1],name:sup[2]});
  boot();
  if(!await dmWait(function(){return S.role==='Super admin'&&S.loaded.users&&S.loaded.plants},20000))throw new Error('seed: sign-in did not settle');
  dmPrep('Writing plans, people, actions and open items...',30);
  var iv=setInterval(function(){var b=dmQ('#prep-bar');var w=parseFloat(b.style.width)||30;if(w<90)b.style.width=(w+1.5)+'%'},700);
  try{
    await demoLoad();
    await dmWait(function(){return /Rules checked/.test(S.engStatus||'')},60000);
    await sleep(500);
  }finally{clearInterval(iv)}
  dmPrep('Saving a copy for the next visit...',95);
  try{await dmIdbPut(dmSnapKey(),JSON.stringify(DM_STORE))}catch(e){DM_FALLBACK=true}
  if(DM_FALLBACK){/* no IndexedDB: carry on as the real viewer from the same page */
    return 'fallback';
  }
  location.reload();return 'reload';
}
var DM_FALLBACK=false;
async function dmStart(){
  var em=dmGet(DM_K.sess),a=dmAcct(em);
  if(!a){dmDel(DM_K.sess);var pre=dmGet(DM_K.next);dmDel(DM_K.next);dmShowLogin(pre||'', 'login');return}
  document.body.classList.remove('dm-login');dmBar();
  var snap=null;try{snap=await dmIdbGet(dmSnapKey())}catch(e){}
  if(!snap){
    var r;try{r=await dmSeedRun()}catch(e){dmPrep('The demo could not be prepared: '+((e&&e.message)||e)+'. Reload the page to try again.',100);return}
    if(r==='reload')return;
    /* fallback: swap the viewer and continue in this page */
    DM_TRACK=true;dmInstallClaude({email:a[1],name:a[2]});
    S.viewer={email:a[1],name:a[2],owner:false,id:'demo_'+a[1]};S.role=null;S.engSig=null;S.ladSig=null;S.lastHtml='';DS.cache={};S.viewAs=null;
    document.body.classList.remove('dm-prep');location.hash='#/today';schedule();return;
  }
  DM_STORE=JSON.parse(snap);
  var ovl=dmJ(DM_K.ovl,{});DM_OVL=ovl;
  Object.keys(ovl).forEach(function(p){if(ovl[p]===null)delete DM_STORE[p];else DM_STORE[p]=ovl[p]});
  DM_TRACK=true;
  dmInstallClaude({email:a[1],name:a[2]});
  document.body.classList.remove('dm-prep');
  boot();
}
dmStart();
