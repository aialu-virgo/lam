/* ================= v0.9 data: scope, roll-ups, customer detail, targets ================= */
var SEP='\u0001';
function uByEmail(e){e=(e||'').toLowerCase();return S.users.find(function(u){return u.email===e})||null}
function activeUsers(){return S.users.filter(function(u){return u.active!==false})}
function usersOfRole(r){return activeUsers().filter(function(u){return u.role===r})}
function codesOf(u){return String(u&&u.plant_codes||'').split(';').map(function(x){return x.trim()}).filter(Boolean)}
function holdsPlant(u,p){var c=codesOf(u);return c.indexOf(String(p))>=0}
function bmFor(p){return usersOfRole('Branch / depot manager').find(function(u){return holdsPlant(u,p)})||null}
function hodFor(dept){return activeUsers().find(function(u){return u.role==='HOD'&&norm(u.department)===norm(dept)})||null}
function mgmtUsers(){return usersOfRole('Management / HO')}
function coordFor(p){return usersOfRole('Coordinator (sales / CRR)').find(function(u){return holdsPlant(u,p)})||null}
function accountsFor(p){return usersOfRole('Accounts').find(function(u){var c=codesOf(u);return !c.length||c.indexOf(String(p))>=0})||null}
function plantUserFor(p){return usersOfRole('Plant').find(function(u){return holdsPlant(u,p)})||null}
function userBySp(name){var n=norm(name);if(!n)return null;var mm=(function(){var m=spMatch(name);return m&&!m.ambiguous?m:null})();return activeUsers().find(function(u){if(u.role!=='Sales executive')return false;var c=norm(u.sales_employee_code);return c===n||norm(u.name)===n||(mm&&(c===norm(mm.code)||c===norm(mm.name)))})||null}
function plantName(c){var p=S.plants.find(function(x){return x.plant_code===c});var nm=p&&(p.plant_name||p.b1_bpl_name);return nm?c+' '+nm:c}
function plantShort(c){var p=S.plants.find(function(x){return x.plant_code===c});var nm=p&&(p.plant_name||p.b1_bpl_name);return nm?nm:c}
function userName(e){var u=uByEmail(e);return u?u.name:(e||'')}

/* ---- effective user and scope ---- */
function realUser(){
  var em=(S.viewer&&S.viewer.email||'').toLowerCase(),u=viewerUser();
  if(u)return u;
  if(S.role==='Super admin')return {email:em,name:(S.viewer&&S.viewer.name)||em||'Super admin',role:'Super admin',department:'HO',plant_codes:'',reports_to_email:'',today_cap:5,active:true,pseudo:true};
  return null;
}
function effUser(){if(S.viewAs){var u=uByEmail(S.viewAs);if(u)return u}return realUser()}
function effRole(){var u=effUser();return u?u.role:null}
function readOnly(){return !!S.viewAs}
var GLOBAL_ROLES=['Super admin','Management / HO','HOD'];
function scopeOf(u){
  if(!u)return {role:null,plants:[],sp:null,none:true};
  var codes=codesOf(u),all=['Super admin','Management / HO','HOD','Accounts','Sales executive'].indexOf(u.role)>=0;
  var plants=codes.length?new Set(codes):(all?null:new Set());
  var sp=null;if(u.role==='Sales executive')sp=[norm(u.sales_employee_code),norm(u.name)].filter(Boolean);
  return {role:u.role,plants:plants,sp:sp,email:u.email,dept:u.department,none:false};
}
function SC(){return scopeOf(effUser())}
function plantInScope(sc,p){return !sc.plants||sc.plants.has(String(p))}
function scopeSig(sc){return [sc.role,sc.plants?Array.from(sc.plants).sort().join(','):'*',(sc.sp||[]).join('/')].join('#')}
function spOk(sc,name){
  if(!sc.sp)return true;if(sc.sp.indexOf(norm(name))>=0)return true;
  var m=spMatch(name);return !!(m&&!m.ambiguous&&(sc.sp.indexOf(norm(m.name))>=0||sc.sp.indexOf(norm(m.code))>=0));
}
/* what a role may open (role-matrix.md, department table) */
var DEPT_PAGES={Sales:['overview','sales','team'],CRR:['sales','team'],Accounts:['receivables','team'],Plant:['inventory','team'],HO:['overview','sales','receivables','inventory','team']};
function pagesFor(u){
  var base=['today'];if(!u)return [];
  var r=u.role;
  if(r==='Super admin')return ['overview','sales','receivables','inventory','today','actions','team','intake','admin'];
  if(r==='Management / HO')return ['overview','sales','receivables','inventory','today','actions','team','intake','admin'];
  if(r==='HOD'){var p=DEPT_PAGES[u.department]||DEPT_PAGES.Sales;return p.filter(function(x){return x!=='sales'||true}).concat(['today','actions','admin'])}
  if(r==='Branch / depot manager')return ['overview','sales','receivables','inventory','today','actions','team','admin'];
  if(r==='Sales executive')return ['sales','today','actions','team'];
  if(r==='Coordinator (sales / CRR)')return ['sales','today','actions','team'];
  if(r==='Accounts')return ['receivables','today','actions','team'];
  if(r==='Plant')return ['inventory','today','actions','team'];
  return base;
}
function canPage(u,pg){return pagesFor(u).indexOf(pg)>=0}
function isCust(u){return u&&u.role==='Coordinator (sales / CRR)'}

/* ---- roll-up store: plant x month, decoded in scope only ---- */
var DS={raw:{},sig:'',ver:0,pg:{},spk:{},spIdx:{},xf:{},busy:false,again:false,status:'idle',cust:{},custVer:0,custJobs:0,custDone:0,cache:{},plants:[],months:[]};
function T0(){return {n:0,sh:0,sq:0,d:0,l:0}}
async function ingestRoll(){
  if(!S.rollLoaded||!S.smReady)return;
  if(DS.busy){DS.again=true;return}
  DS.busy=true;
  try{
    do{
      DS.again=false;
      var sc=SC();if(sc.none)break;
      var sig=scopeSig(sc);
      if(DS.sig!==sig){DS.raw={};DS.sig=sig;DS.cust={};DS.custVer++}
      var ids=Object.keys(S.rollDocs).filter(function(id){return plantInScope(sc,S.rollDocs[id].plant)});
      var changed=false;
      Object.keys(DS.raw).forEach(function(id){if(ids.indexOf(id)<0){delete DS.raw[id];changed=true}});
      var T=Date.now();
      for(var i=0;i<ids.length;i++){
        var d=S.rollDocs[ids[i]],cur=DS.raw[ids[i]];
        if(cur&&cur.at===d.at)continue;
        var rows=JSON.parse(await ungz(d.z));
        var tot=null;
        if(sc.sp){/* an executive's own share of a plant needs the plant total; only the number is kept, never other people's rows */
          tot={};rows.forEach(function(r){if(!r[2])tot[r[0]]=(tot[r[0]]||0)+r[7]});rows=rows.filter(function(r){return spOk(sc,r[1])})}
        DS.raw[ids[i]]={at:d.at,plant:d.plant,ym:d.ym,rows:rows,tot:tot};changed=true;
        if(Date.now()-T>120){T=Date.now();DS.status='Reading history '+(i+1)+' of '+ids.length;schedule();await tick()}
      }
      if(changed||DS.ver===0){rebuildMaps();DS.ver++;DS.cache={}}
      DS.status='ready';
    }while(DS.again);
  }catch(e){DS.status='error: '+((e&&e.message)||e)}
  DS.busy=false;DS.ready=true;schedule();afterData();
}
function rebuildMaps(){
  DS.pg={};DS.spk={};DS.spIdx={};DS.xf={};DS.spRaw={};DS.ptot={};var plants={},months={};
  Object.keys(DS.raw).forEach(function(id){
    var o=DS.raw[id];plants[o.plant]=1;months[o.ym]=1;
    if(o.tot)Object.keys(o.tot).forEach(function(g){var kk=o.plant+SEP+g,m=DS.ptot[kk]||(DS.ptot[kk]={});m[o.ym]=(m[o.ym]||0)+o.tot[g]});
    o.rows.forEach(function(r){
      /* r = [group, salesperson, transfer, docs, lines, sheets, sqft, net] */
      if(r[2]){DS.xf[o.ym]=(DS.xf[o.ym]||0)+r[7];return}
      var spc=spCanon(r[1]);DS.spRaw[r[1]]=(DS.spRaw[r[1]]||0)+r[4];
      var k1=o.plant+SEP+r[0],m1=DS.pg[k1]||(DS.pg[k1]={}),a=m1[o.ym]||(m1[o.ym]=T0());
      a.n+=r[7];a.sh+=r[5];a.sq+=r[6];a.d+=r[3];a.l+=r[4];
      var k2=spc+SEP+o.plant+SEP+r[0],m2=DS.spk[k2];if(!m2){m2=DS.spk[k2]={};(DS.spIdx[spc]=DS.spIdx[spc]||[]).push(k2)}
      var b=m2[o.ym]||(m2[o.ym]=T0());b.n+=r[7];b.sh+=r[5];b.sq+=r[6];b.d+=r[3];b.l+=r[4];
    });
  });
  DS.plants=Object.keys(plants).sort();DS.months=Object.keys(months).sort();
}
function wins(ms){return ms.map(function(x){return typeof x==='string'?{ym:x,frac:1}:x})}
/* f: {plants:Set|null, plant, group, sp}; w: [{ym,frac}] or [ym] */
function sumF(f,w){
  w=wins(w);
  var ck=JSON.stringify([f.plants?Array.from(f.plants):null,f.plant||'',f.group||'',f.sp==null?'':'S:'+f.sp,w]);
  var hit=DS.cache[ck];if(hit)return hit;
  var acc=T0(),keys,map,sp=f.sp!=null;
  if(sp){keys=DS.spIdx[f.sp]||[];map=DS.spk}else{keys=Object.keys(DS.pg);map=DS.pg}
  for(var i=0;i<keys.length;i++){
    var parts=keys[i].split(SEP),plant=sp?parts[1]:parts[0],grp=sp?parts[2]:parts[1];
    if(f.plants&&!f.plants.has(plant))continue;if(f.plant&&plant!==f.plant)continue;if(f.group&&grp!==f.group)continue;
    var mo=map[keys[i]];
    for(var j=0;j<w.length;j++){var x=mo[w[j].ym];if(x){var fr=w[j].frac;acc.n+=x.n*fr;acc.sh+=x.sh*fr;acc.sq+=x.sq*fr;acc.d+=x.d*fr;acc.l+=x.l*fr}}
  }
  DS.cache[ck]=acc;return acc;
}
function distinct(kind,f){/* list of plants, groups or salespeople present in scope data */
  if(kind==='plant')return DS.plants.slice();
  if(kind==='group')return GROUPS.filter(function(g){return Object.keys(DS.pg).some(function(k){return k.split(SEP)[1]===g})});
  if(kind==='sp')return Object.keys(DS.spIdx).filter(Boolean).sort();
  return [];
}
function spPlants(sp){var o={};(DS.spIdx[sp]||[]).forEach(function(k){o[k.split(SEP)[1]]=1});return Object.keys(o)}
function filtPlants(sc,fp){/* Set of plants for the current filter */
  if(fp)return new Set([fp]);return sc.plants}

/* ---- completeness (coverage grid decides whether QoQ may be trusted) ---- */
function cellRef(){var r=0;Object.keys(S.cells).forEach(function(k){var c=S.cells[k];if(c.entity==='INV')r=Math.max(r,Object.keys(c.plants||{}).length)});return r}
function monthLoaded(ym,plants){
  if(ym<histLoYm())return false;/* D28: before history start nothing counts as loaded */
  var c=S.cells['INV_'+ym];if(!c)return false;
  var have=Object.keys(c.plants||{});
  if(plants&&plants.size){var n=0;plants.forEach(function(p){if(c.plants[p])n++});return n===plants.size}
  var ref=cellRef();return ref>0&&have.length>=Math.ceil(ref*0.9);
}
function monthsLoaded(ms,plants){return ms.length>0&&ms.every(function(m){return monthLoaded(m,plants)})}
function anyMonthData(ms,plants){return ms.some(function(m){if(m<histLoYm())return false;var c=S.cells['INV_'+m];if(!c)return false;if(plants&&plants.size){var h=false;plants.forEach(function(p){if(c.plants[p])h=true});return h}return Object.keys(c.plants||{}).length>0})}

/* ---- customer detail: read on demand from the stored chunks (aggregate rows only) ---- */
async function loadCust(plants,yms){
  var sc=SC(),jobs=[];
  yms.forEach(function(ym){var c=S.cells['INV_'+ym];if(!c)return;Object.keys(c.plants||{}).forEach(function(p){if(!plantInScope(sc,p))return;if(plants&&plants.size&&!plants.has(p))return;var k=p+SEP+ym;if(!DS.cust[k]&&!(DS.custPending||{})[k])jobs.push({p:p,ym:ym,k:k,info:c.plants[p]})})});
  if(!jobs.length)return;
  DS.custPending=DS.custPending||{};
  DS.custJobs+=jobs.length;jobs.forEach(function(j){DS.custPending[j.k]=1});
  var q=jobs.slice(),sig=DS.sig;
  async function worker(){
    while(q.length){
      var j=q.shift();
      try{
        var rows=[];
        for(var i=0;i<(j.info.chunks||0);i++){
          var snap=await dget('inv/'+j.info.sys+'-'+j.p+'-'+j.ym+'-'+i);
          if(!snap.exists)continue;var d=snap.data();var o=JSON.parse(await ungz(d.z));
          for(var a=0;a<o.a.length;a++)rows.push(o.a[a]);
        }
        if(sc.sp)rows=rows.filter(function(r){return spOk(sc,r[2])});
        if(DS.sig===sig)DS.cust[j.k]=rows;
      }catch(e){S.err=(S.err||'')+'customer detail '+j.k+': '+((e&&e.message)||e)+' '}
      delete DS.custPending[j.k];DS.custDone++;
      if(DS.custDone%4===0)schedule();
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  DS.custVer++;DS.cache={};DS.custDone=DS.custJobs=0;schedule();
}
/* aggregate customers over plant-months (xf excluded) */
function custAgg(f,w){
  w=wins(w);var sc=SC(),m=new Map();
  w.forEach(function(x){
    var c=S.cells['INV_'+x.ym];if(!c)return;
    Object.keys(c.plants||{}).forEach(function(p){
      if(!plantInScope(sc,p))return;if(f.plants&&!f.plants.has(p))return;if(f.plant&&p!==f.plant)return;
      var rows=DS.cust[p+SEP+x.ym];if(!rows)return;
      rows.forEach(function(r){
        if(r[4])return;if(f.group&&r[3]!==f.group)return;if(f.sp!=null&&spCanon(r[2])!==f.sp)return;
        var o=m.get(r[0]);if(!o){o={code:r[0],name:r[1],n:0,sh:0,sq:0,d:0,plants:{},sps:{}};m.set(r[0],o)}
        o.n+=r[9]*x.frac;o.sh+=r[7]*x.frac;o.sq+=r[8]*x.frac;o.d+=r[5]*x.frac;o.plants[p]=1;if(r[2]){var sc2=spCanon(r[2]);o.sps[sc2]=(o.sps[sc2]||0)+r[9]}
      });
    });
  });
  return m;
}
function custLoaded(yms,plants){
  var sc=SC(),ok=true;
  yms.forEach(function(ym){var c=S.cells['INV_'+ym];if(!c)return;Object.keys(c.plants||{}).forEach(function(p){if(!plantInScope(sc,p))return;if(plants&&plants.size&&!plants.has(p))return;if(!DS.cust[p+SEP+ym])ok=false})});
  return ok;
}
/* A / B / C from the last closed quarter, in the viewer's scope */
function classMap(){
  var key='cm'+DS.custVer+'|'+curQuarterKey();if(DS.cache[key])return DS.cache[key];
  var lq=prevQ(curQuarterKey()),m=custAgg({plants:SC().plants},qMonths(lq)),arr=Array.from(m.values()).sort(function(a,b){return b.n-a.n});
  var tot=arr.reduce(function(a,x){return a+Math.max(0,x.n)},0),cum=0,out={};
  arr.forEach(function(x){var share=tot>0?cum/tot*100:100;out[x.code]=share<CFG.abc_a?'A':share<CFG.abc_a+CFG.abc_b?'B':'C';cum+=Math.max(0,x.n)});
  out.__n=arr.length;out.__total=tot;DS.cache[key]=out;return out;
}
function custClass(code){var cm=classMap();return cm[code]||'C'}

/* ---- targets: potential x share, revisions, phasing (target-model.md) ---- */
function approvedOf(x){
  if(x.approved)return x.approved;
  if(x.status==='Approved'||x.status==='Locked'){if(x.share_pct===''||x.share_pct==null)return null;return {potential_value_inr:+x.potential_value_inr||0,potential_qty_sqft:+x.potential_qty_sqft||0,share_pct:+x.share_pct,rev:x.rev||1}}
  return null;
}
function r2(v){return Math.round(v*100)/100}
function leafTgt(pot,share){return r2((+pot||0)*(+share||0)/100)}
function phasingFor(x){
  var best=null,bs=-1;
  (S.phasing||[]).forEach(function(p){
    if(p.fy_quarter!==x.fy_quarter)return;var s=0;
    if(p.plant_code){if(p.plant_code!==x.plant_code)return;s+=4}
    if(p.product_group){if(p.product_group!==x.product_group)return;s+=2}
    if(p.customer_segment){if(p.customer_segment!==x.customer_segment)return;s+=1}
    if(s>bs){bs=s;best=p}
  });
  return best&&best.pct&&best.pct.length===3?best.pct:[100/3,100/3,100/3];
}
function monthsOfTarget(t,pct){var a=r2(t*pct[0]/100),b=r2(t*pct[1]/100);return [a,b,r2(t-a-b)]}
function leafMatch(x,f){
  if(f.plant){if(x.plant_code!==f.plant)return false}
  else if(f.plants){if(!x.plant_code||!f.plants.has(x.plant_code))return false}
  if(f.group&&x.product_group!==f.group)return false;
  return true;
}
/* quarter-level plan figures for a filter: potential, approved target (current and original), draft, monthly phasing */
function planQ(f,q){
  var key='pq'+JSON.stringify([f.plants?Array.from(f.plants):null,f.plant||'',f.group||'',q])+S.potVer;
  if(DS.cache[key])return DS.cache[key];
  var R={pot:0,potSqft:0,potSh:0,tgtSh:0,tgtShD:0,tgtSq:0,tgtSqD:0,tgt:0,orig:0,draft:0,nAppr:0,nDraft:0,nLeaf:0,months:[0,0,0],draftMonths:[0,0,0],revs:[],kind:'none'};
  (S.potential||[]).forEach(function(x){
    if(x.fy_quarter!==q||!leafMatch(x,f))return;
    R.nLeaf++;var ap=approvedOf(x),pct=phasingFor(x);
    var src=ap||x;R.pot+=+src.potential_value_inr||0;R.potSqft+=+src.potential_qty_sqft||0;R.potSh+=shOfLeaf(src);
    if(ap){var t=leafTgt(ap.potential_value_inr,ap.share_pct);R.tgt+=t;R.nAppr++;R.tgtSq+=(+ap.potential_qty_sqft||0)*(+ap.share_pct||0)/100;R.tgtSh+=shOfLeaf(ap)*(+ap.share_pct||0)/100;monthsOfTarget(t,pct).forEach(function(v,i){R.months[i]+=v});
      var og=x.original||ap;R.orig+=leafTgt(og.potential_value_inr,og.share_pct)}
    if(!ap&&x.share_pct!==''&&x.share_pct!=null){var d=leafTgt(x.potential_value_inr,x.share_pct);R.draft+=d;R.nDraft++;R.tgtSqD+=(+x.potential_qty_sqft||0)*(+x.share_pct||0)/100;R.tgtShD+=shOfLeaf(x)*(+x.share_pct||0)/100;monthsOfTarget(d,pct).forEach(function(v,i){R.draftMonths[i]+=v})}
    R.revs.push(x);
  });
  if(R.nAppr>0){R.kind=R.nDraft>0?'mixed':'approved'}
  else if(R.nDraft>0){R.kind='draft';R.tgt=R.draft;R.orig=R.draft;R.months=R.draftMonths.slice();R.tgtSq=R.tgtSqD;R.tgtSh=R.tgtShD}
  DS.cache[key]=R;return R;
}
/* plan figures over a window of months: target to date (phased), potential pro-rated by working days */
function planW(f,w){
  w=wins(w);var out={pot:0,tgt:0,orig:0,kind:'none',any:false,nLeaf:0,qs:{}};var kinds={};
  w.forEach(function(x){
    var q=qKeyOfYm(x.ym),P=planQ(f,q),qm=qMonths(q),idx=qm.indexOf(x.ym),wdq=qm.reduce(function(a,m){return a+WD(m)},0);
    if(!P.nLeaf)return;out.any=true;kinds[P.kind]=1;
    out.tgt+=P.months[idx]*x.frac;out.orig+=(P.orig/3)*x.frac;out.pot+=P.pot*(WD(x.ym)*x.frac)/wdq;
    out.nLeaf+=0;out.qs[q]=P;
  });
  var ks=Object.keys(kinds);out.kind=!ks.length?'none':ks.length===1?ks[0]:'mixed';
  return out;
}
/* net sales of a plant x group across everyone; for an executive's scoped data this comes from the kept totals */
function plantGroupNet(plant,grp,ms){
  if(SC().sp){var m=(DS.ptot||{})[plant+SEP+grp]||{},t=0;ms.forEach(function(ym){t+=m[ym]||0});return t}
  return sumF({plant:plant,group:grp},ms).n;
}
/* default person split P2: last quarter's share of the leaf */
function personPlan(sp,w,onlyPlant,onlyGroup){
  w=wins(w);var out={tgt:0,pot:0,any:false,kind:'none'};
  (DS.spIdx[sp]||[]).forEach(function(k){
    var parts=k.split(SEP),plant=parts[1],grp=parts[2];
    if(onlyPlant&&plant!==onlyPlant)return;if(onlyGroup&&grp!==onlyGroup)return;
    w.forEach(function(x){
      var q=qKeyOfYm(x.ym),pq=prevQ(q),lp=plantGroupNet(plant,grp,qMonths(pq)),mine=sumF({plant:plant,group:grp,sp:sp},qMonths(pq)).n;
      var share=lp>0?mine/lp:0;if(share<=0)return;
      var P=planW({plant:plant,group:grp},[x]);if(!P.any)return;
      out.any=true;out.tgt+=P.tgt*share;out.pot+=P.pot*share;out.kind=P.kind;
    });
  });
  return out;
}
/* series of closed quarters since history start (up to 12) + current: actual, target, ach for a filter */
function quarterSeries(f,personSp){
  var cur=curQuarterKey(),qs=closedQuarters().concat([cur]),out=[];
  qs.forEach(function(q,i){
    var ms=qMonths(q),isCur=q===cur;
    var loaded=isCur?anyMonthData(ms,f.plants||(f.plant?new Set([f.plant]):null)):monthsLoaded(ms,f.plant?new Set([f.plant]):f.plants);
    var ff=Object.assign({},f);if(personSp!=null)ff.sp=personSp;
    var N=isCur?wdBetween(ms[0]+'-01',TODAY()):Infinity;var w=isCur?walk(ms,N):wins(ms);
    var A=loaded?sumF(ff,w).n:null;
    var P=personSp!=null?personPlan(personSp,qMonths(q),f.plant,f.group):planW(f,qMonths(q));
    var tgt=(personSp!=null?P.any:P.any)?(personSp!=null?P.tgt:P.tgt):null;
    var tgtTo=isCur?(personSp!=null?personPlan(personSp,w,f.plant,f.group).tgt:planW(f,w).tgt):tgt;
    out.push({q:q,label:qLabel(q),A:A,loaded:loaded,tgt:tgt,tgtTo:tgtTo,kind:P.kind,isCur:isCur,ach:(A!=null&&tgtTo>0)?A/tgtTo*100:null,N:N});
  });
  return out;
}
