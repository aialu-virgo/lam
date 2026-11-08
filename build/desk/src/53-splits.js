/* ================= Overview v44: thickness and brand splits, collections bars, branch rating, zones (D55, D84, D85; built 8 Nov 2026) =================
 * Thickness, brand and zone come from "detail chunks" written at sales upload (index.src.html: dimKeyOf, packChunks). A detail chunk sits after the
 * normal chunks of a plant-month ({a:[],h:[],d:rows}, doc flag dim:true; the cell records dimFrom = index of the first one). Months loaded before v44 have none:
 * the cards then say "not loaded" and name the fix (reload the month), never a zero. Rows: [thickness label, brand, group, zone digit, lines, sheets, sqft, net].
 * Splits are invoiced (credit notes carry no item), external lines only. Rules and templates only, no AI. */
DS.dim=DS.dim||{};DS.dimVer=0;DS.dimBusy=false;DS.zoneCache={ver:-1,map:{}};
var DIM_TOPTHK=6,DIM_TOPBR=8;
function zoneCanon(raw){var m=/^\s*zone\s*0*([1-5])\s*$/i.exec(String(raw==null?'':raw));return m?'ZONE '+m[1]:''}
function zoneMasterOf(p){var r=S.plants.find(function(x){return x.plant_code===p});var raw=r&&r.zone?String(r.zone).trim():'';return zoneCanon(raw)||raw}

/* ---- read the detail chunks of the given months for the plants in scope (cached per plant-month and upload time) ---- */
async function loadDim(plants,yms){
  var sc=SC(),jobs=[];
  yms.forEach(function(ym){var c=S.cells['INV_'+ym];if(!c)return;Object.keys(c.plants||{}).forEach(function(p){
    if(!plantInScope(sc,p)||(plants&&plants.size&&!plants.has(p)))return;
    var info=c.plants[p];if(info.dimFrom==null)return;
    var k=p+SEP+ym,cur=DS.dim[k];if(cur&&cur.at===info.at)return;if((DS.dimPend||{})[k])return;
    jobs.push({p:p,ym:ym,k:k,info:info})})});
  if(!jobs.length)return 0;
  DS.dimPend=DS.dimPend||{};jobs.forEach(function(j){DS.dimPend[j.k]=1});
  var q=jobs.slice(),n=0;
  async function worker(){
    while(q.length){
      var j=q.shift();
      try{
        var rows=[];
        for(var i=j.info.dimFrom;i<(j.info.chunks||0);i++){
          var snap=await dget('inv/'+j.info.sys+'-'+j.p+'-'+j.ym+'-'+i);if(!snap.exists)continue;
          var d=snap.data();if(!d.dim)continue;var o=JSON.parse(await ungz(d.z));(o.d||[]).forEach(function(r){rows.push(r)});
        }
        DS.dim[j.k]={at:j.info.at,rows:rows};n++;
      }catch(e){S.err=(S.err||'')+'item detail '+j.k+': '+((e&&e.message)||e)+' '}
      delete DS.dimPend[j.k];
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  DS.dimVer++;return n;
}
/* the plant-months of a window and how many carry detail / have it read */
function dimState(plants,w){
  var sc=SC(),total=0,have=0,loaded=0,miss={};
  wins(w).forEach(function(x){if(!(x.frac>0))return;var c=S.cells['INV_'+x.ym];if(!c)return;
    Object.keys(c.plants||{}).forEach(function(p){if(!plantInScope(sc,p)||(plants&&plants.size&&!plants.has(p)))return;total++;var info=c.plants[p];
      if(info.dimFrom==null)miss[p]=1;if(info.dimFrom!=null){have++;var d=DS.dim[p+SEP+x.ym];if(d&&d.at===info.at)loaded++}})});
  return {missing:Object.keys(miss),total:total,have:have,loaded:loaded,complete:total>0&&have===total,ready:loaded===have};
}
/* totals per label (idx 0 thickness, 1 brand) over a window; months scaled by their fraction, like sumF */
function dimAgg(plants,w,idx){
  var sc=SC(),m=new Map();
  wins(w).forEach(function(x){if(!(x.frac>0))return;var c=S.cells['INV_'+x.ym];if(!c)return;
    Object.keys(c.plants||{}).forEach(function(p){if(!plantInScope(sc,p)||(plants&&plants.size&&!plants.has(p)))return;
      var d=DS.dim[p+SEP+x.ym];if(!d||d.at!==c.plants[p].at)return;
      d.rows.forEach(function(r){var k=r[idx],o=m.get(k);if(!o){o={k:k,sh:0,n:0,sq:0};m.set(k,o)}o.sh+=r[5]*x.frac;o.sq+=r[6]*x.frac;o.n+=r[7]*x.frac})})});
  return m;
}
function dimMonthsNeeded(res){var s={};res.cur.forEach(function(x){if(x.frac>0)s[x.ym]=1});(res.prior||[]).forEach(function(x){if(x.frac>0)s[x.ym]=1});return Object.keys(s)}
/* the 12 latest months of one plant that carry zone detail */
function zoneMonthsOf(p){
  var l=[];Object.keys(S.cells).forEach(function(k){var c=S.cells[k];if(c.entity!=='INV'||!c.plants||!c.plants[p]||c.plants[p].dimFrom==null)return;l.push(c.ym)});
  return l.sort().reverse().slice(0,12);
}
/* zone of a plant from its sales lines: the zone on most lines in its last 12 loaded months (D85). ambiguous on a tie; null when no line carries a zone */
function zoneFromLines(p){
  var cnt={},tot=0;
  zoneMonthsOf(p).forEach(function(ym){var d=DS.dim[p+SEP+ym];if(!d)return;d.rows.forEach(function(r){if(!r[3])return;cnt[r[3]]=(cnt[r[3]]||0)+r[4];tot+=r[4]})});
  var ks=Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a]||(a<b?-1:1)});
  if(!ks.length)return null;
  var tie=ks.length>1&&cnt[ks[1]]===cnt[ks[0]];
  return {zone:tie?null:'ZONE '+ks[0],ambiguous:tie,lines:cnt[ks[0]],total:tot,share:cnt[ks[0]]/tot*100,months:zoneMonthsOf(p).length,counts:cnt};
}
/* a plant's zone for display: the plant master, else the sales-line majority (cached until detail is read again) */
function zoneOfPlant(p){
  var m=zoneMasterOf(p);if(m)return {z:m,src:'master'};
  if(DS.zoneCache.ver!==DS.dimVer){DS.zoneCache={ver:DS.dimVer,map:{}}}
  var c=DS.zoneCache.map[p];if(c===undefined){var r=zoneFromLines(p);c=DS.zoneCache.map[p]=r&&r.zone?r.zone:'';}
  return c?{z:c,src:'sales'}:{z:'',src:''};
}
/* detail for the cards and, when a plant has no zone in the master, for the zone rule */
function dimKick(ctx,needZones){
  if(DS.dimBusy)return;
  var ms=dimMonthsNeeded(ctx.res);
  if(needZones){var zs={};ms.forEach(function(m){zs[m]=1});distinct('plant').forEach(function(p){zoneMonthsOf(p).forEach(function(m){zs[m]=1})});ms=Object.keys(zs)}
  DS.dimBusy=true;
  loadDim(ctx.plants,ms).then(function(n){DS.dimBusy=false;if(n){S.lastHtml='';schedule()}}).catch(function(e){DS.dimBusy=false;S.err=(S.err||'')+'item detail: '+((e&&e.message)||e)+' '});
}

/* ---- Admin: set zones from sales (D85) ---- */
async function zonesFromSales(){
  var codes=S.plants.filter(function(p){return p.active!==false}).map(function(p){return p.plant_code}),s={};
  codes.forEach(function(p){zoneMonthsOf(p).forEach(function(m){s[m]=1})});
  if(!Object.keys(s).length)return {list:[],loadedAny:false};
  await loadDim(null,Object.keys(s));
  var list=[];codes.forEach(function(p){var r=zoneFromLines(p);if(r)list.push(Object.assign({plant:p},r))});
  return {list:list,loadedAny:list.length>0};
}
async function setZonesFromSales(){
  var z=await zonesFromSales();
  if(!z.loadedAny)throw new Error('no sales line with a zone is loaded: sales months loaded before v44 carry no zone. Reload the months (Data Intake › Sales), then run this again');
  var set=[],keep=[],amb=[],differ=[];
  for(var i=0;i<z.list.length;i++){
    var r=z.list[i],pl=S.plants.find(function(x){return x.plant_code===r.plant});if(!pl)continue;
    if(!r.zone){amb.push(r.plant);continue}
    var cur=zoneMasterOf(r.plant);
    if(cur){if(zoneCanon(cur)!==r.zone)differ.push(r.plant+' ('+cur+' in master, '+r.zone+' on sales)');else keep.push(r.plant);continue}
    await dset('plants/'+r.plant,Object.assign({},pl,{_id:undefined,zone:r.zone,zone_src:'sales',zone_set_at:nowISO(),zone_set_by:whoAmI(),zone_lines:r.lines,zone_lines_total:r.total}));
    set.push({plant:r.plant,zone:r.zone,lines:r.lines,total:r.total});
  }
  DS.zoneCache={ver:-1,map:{}};S.lastHtml='';
  var text='zones written to the plant master: '+set.length+(set.length?' ('+set.map(function(x){return x.plant+' '+x.zone}).join(', ')+')':'')+'; already in master: '+keep.length+(differ.length?'; master differs from sales, left unchanged: '+differ.join(', '):'')+(amb.length?'; tied between zones, not set: '+amb.join(', '):'');
  try{await auditW('zones set from sales','',{written:set.length,plants:set.slice(0,60).map(function(x){return x.plant+':'+x.zone}),differ:differ.length,tied:amb.length})}catch(e){}
  return {text:text,set:set,keep:keep,differ:differ,amb:amb};
}
function zonesPreviewHtml(z){
  var rows=z.list.slice().sort(function(a,b){return a.plant<b.plant?-1:1});
  return '<div class="tw" style="max-height:300px;overflow:auto"><table class="std"><thead><tr><th>Plant</th><th>In master</th><th>From sales</th><th class="num">Lines</th><th class="num">Share</th><th class="num">Months</th></tr></thead><tbody>'
   +rows.map(function(r){var cur=zoneMasterOf(r.plant);return '<tr><td>'+esc(plantName(r.plant))+'</td><td>'+(cur?esc(cur):'<span class="note">blank</span>')+'</td><td>'+(r.zone?'<b>'+esc(r.zone)+'</b>':'<span class="note">tie, not set</span>')+'</td><td class="num">'+fmtN(r.lines)+' of '+fmtN(r.total)+'</td><td class="num">'+r.share.toFixed(0)+'%</td><td class="num">'+r.months+'</td></tr>'}).join('')+'</tbody></table></div>';
}
Object.assign(handlers,{
 'zones-set':async function(){
  if(!superOnly('set zones from sales'))return;
  toast('Reading the zone on sales lines...');
  try{
    var z=await zonesFromSales();
    if(!z.loadedAny){openDlg('<h3>Set zones from sales</h3><div class="banner warn" style="display:block"><b>No sales line with a zone is loaded.</b> Sales months loaded before v44 carry no zone. Reload the months in Data Intake › Sales (it replaces them), then run this again.</div><div class="row"><button class="btn pri" data-act="dlg-close">Close</button></div>');return}
    var blank=z.list.filter(function(r){return r.zone&&!zoneMasterOf(r.plant)}).length;
    openDlg('<h3>Set zones from sales</h3><p class="note" style="margin:0">A plant\'s zone is the zone on most of its sales lines in its last 12 loaded months (D85). Only plants with a blank zone in the master are written; a zone already in the master is never changed. Ties are left blank.</p>'+zonesPreviewHtml(z)+'<div class="row"><button class="btn pri" data-act="zones-go"'+(blank?'':' disabled')+'>Write '+blank+' zone'+(blank===1?'':'s')+' to the plant master</button><button class="btn" data-act="dlg-close">Cancel</button></div><div id="d-err"></div>');
  }catch(e){toast('Zones: '+dbErrText(e))}
 },
 'zones-go':async function(){
  if(!superOnly('set zones from sales'))return;
  try{var r=await setZonesFromSales();closeDlg();toast('Zones: '+r.set.length+' written');S.upMsg='<div class="banner ok">Set zones from sales: '+esc(r.text)+'.</div>';S.lastHtml='';schedule()}catch(e){var el=$('#d-err');if(el)el.innerHTML='<div class="banner err">'+esc(dbErrText(e))+'</div>'}
 }
});

/* ---- branch rating: weighted percentile rank, sales 50 / collections 30 / stock days 20 (D55, D84). Informational only. ---- */
var RATING_W={sk:50,col:30,stk:20};
function ratingStars(sc){return sc>=80?5:sc>=60?4:sc>=40?3:sc>=20?2:1}
/* percentile of each row among rows that have the measure: (below + half of ties) / (n-1) x 100; hi = higher is better. Fewer than 2 rows: no percentile. */
function ratingPct(list,key,hi){
  var a=list.filter(function(b){return b[key]!=null&&!isNaN(b[key])});
  a.forEach(function(b){
    if(a.length<2){b['p_'+key]=null;return}
    var w=0,t=0;a.forEach(function(o){if(o===b)return;if(hi?o[key]<b[key]:o[key]>b[key])w++;else if(o[key]===b[key])t++});
    b['p_'+key]=(w+.5*t)/(a.length-1)*100;
  });
  list.forEach(function(b){if(!(b[key]!=null&&!isNaN(b[key])))b['p_'+key]=null});
}
/* rows: {id, sk (Ach % in sheets, or QoQ % when no target), col (collected ÷ invoiced %), stk (stock days, lower is better)}; a missing measure is dropped and the others reweighted */
function ratingCalc(list){
  ratingPct(list,'sk',true);ratingPct(list,'col',true);ratingPct(list,'stk',false);
  list.forEach(function(b){
    var parts=['sk','col','stk'].filter(function(k){return b['p_'+k]!=null}),W=parts.reduce(function(a,k){return a+RATING_W[k]},0);
    b.n3=parts.length;
    if(!parts.length){b.score=null;b.st=null;b.W='';return}
    b.score=parts.reduce(function(a,k){return a+b['p_'+k]*RATING_W[k]},0)/W;b.st=ratingStars(b.score);
    b.W=parts.map(function(k){return {sk:'sales',col:'collections',stk:'stock days'}[k]+' '+Math.round(RATING_W[k]/W*100)+'%'}).join(', ');
  });
  return list;
}
/* sales measure: Ach % in sheets when most branches have a valid one (target set, not above 300%), else QoQ % in sheets for all (D55) */
function ratingBasis(rows){
  var nAch=rows.filter(function(r){return r.ach!=null}).length;
  return nAch>=2&&nAch*2>=rows.length?'ach':'qoq';
}
function ratingRows(plants,res,colW,inv){
  var days={};if(inv&&inv.L){var acc={};inv.L.forEach(function(x){if(x.days==null)return;var a=acc[x.plant]||(acc[x.plant]={n:0,d:0});a.n+=x.days*x.sheets;a.d+=x.sheets});Object.keys(acc).forEach(function(p){if(acc[p].d>0)days[p]=acc[p].n/acc[p].d})}
  var rows=plants.filter(function(x){return x.o.sh>0}).map(function(x){
    var q=shQoq(x.o,res),ps=new Set([x.p]),col=null,invd=null;
    if(colW){var c=collMonths(ps,colW),iv=sumF({plants:ps},colW).n;if(c.have&&iv>0){col=c.rec/iv*100;invd=iv}}
    return {id:x.p,name:plantShort(x.p),sh:x.o.sh,ach:x.ach,ck:x.ck,qoq:q.state==='ok'?q.v:null,col:col,stk:days[x.p]!=null?days[x.p]:null};
  });
  var basis=ratingBasis(rows);
  rows.forEach(function(r){r.sk=basis==='ach'?r.ach:r.qoq});
  ratingCalc(rows);
  return {rows:rows,basis:basis};
}
function oxStars(st){return '<span class="ox-stars" role="img" aria-label="'+st+' of 5 stars"><span aria-hidden="true">'+'★'.repeat(st)+'☆'.repeat(5-st)+'</span></span>'}
function oxRatingRow(b,rk,basis){
  var chip=function(l,v,p){return v==null?'<span class="ox-chip sm nl">'+l+': n/a</span>':'<span class="ox-chip sm">'+l+' '+v+' · P'+Math.round(p)+'</span>'};
  var sTxt=b.sk==null?null:(basis==='ach'?Math.floor(b.sk)+'%':(b.sk>=0?'+':'−')+Math.abs(b.sk).toFixed(0)+'% QoQ');
  var tip=b.id+' '+b.name+' · score '+b.score.toFixed(0)+' → '+b.st+' of 5 stars · Sales '+(b.sk==null?'n/a':(basis==='ach'?'Ach '+b.sk.toFixed(1)+'% in sheets':'QoQ '+b.sk.toFixed(1)+'% in sheets (no target)')+' P'+Math.round(b.p_sk)+' (50%)')+' · Collection '+(b.col==null?'n/a':b.col.toFixed(1)+'% collected ÷ invoiced P'+Math.round(b.p_col)+' (30%)')+' · Stock days '+(b.stk==null?'n/a':b.stk.toFixed(0)+' days P'+Math.round(b.p_stk)+' (20%, lower is better)')+' · weights used: '+b.W;
  return '<div class="ox-br"'+oxTip(tip)+'><div class="h"><span><b class="mono">#'+rk+'</b> <b>'+esc(b.name)+'</b> <span class="note mono">'+esc(b.id)+'</span></span><span>'+oxStars(b.st)+' <span class="mono" style="font-size:12px">'+b.score.toFixed(0)+'</span></span></div><div class="ox-row">'
   +chip('Sales',sTxt,b.p_sk)+chip('Coll.',b.col==null?null:Math.floor(b.col)+'%',b.p_col)+chip('Stock',b.stk==null?null:Math.round(b.stk)+'d',b.p_stk)+'</div>'+(b.n3<3?'<span class="note">based on '+b.n3+' of 3 measures, others reweighted</span>':'')+(b.ck&&basis==='ach'?'<span class="note">Sales: Check target (above '+ACH_MAX+'%)</span>':'')+'</div>';
}
function oxRatingCard(R,res,colLabel){
  var rated=R.rows.filter(function(b){return b.score!=null}).sort(function(a,b){return b.score-a.score||b.sh-a.sh});
  var note='<div class="ox-callout note" style="border-left:4px solid var(--ink3)"><b>Informational only.</b> The rating is a rule-based reading of three measures. It is not for incentives or disciplinary action; those are SP Sir\'s decision alone. Stars: 80+ = 5, 60 to under 80 = 4, 40 to under 60 = 3, 20 to under 40 = 2, under 20 = 1.</div>';
  if(rated.length<2)return '<section class="ox-card ox-t12"><h2>Branch rating</h2><div class="ox-empty"><b>Needs at least 2 branches with sales in scope</b><span>The rating ranks branches against each other, so a single branch has no percentile. Shown as not rated, never as a star.</span></div>'+note+'</section>';
  var top=rated.length<=10?rated:rated.slice(0,5),bot=rated.length<=10?[]:rated.slice(-5);
  var rule='Score = weighted percentile rank among '+rated.length+' in-scope branch'+(rated.length===1?'':'es')+': sales 50% ('+(R.basis==='ach'?'Ach % in sheets':'QoQ % in sheets, because targets are not loaded for most branches')+'), collection efficiency 30% (collected ÷ invoiced ₹'+(colLabel?', '+esc(colLabel):'')+'), stock days 20% (lower is better). P = percentile. A missing measure is dropped and the rest reweighted.';
  return '<section class="ox-card ox-t12" id="ox-ratingcard"><h2>Branch rating'+(rated.length<=10?'':', top 5 and bottom 5')+oxDrill('rating','All branches ›')+'</h2><p class="note" style="margin:0">'+rule+'</p>'
   +'<div class="ox-brk"><div><p class="ox-sub3">'+(bot.length?'Top 5':'Branches')+'</p>'+top.map(function(b,i){return oxRatingRow(b,i+1,R.basis)}).join('')+'</div>'+(bot.length?'<div><p class="ox-sub3">Bottom 5</p>'+bot.map(function(b,i){return oxRatingRow(b,rated.length-bot.length+1+i,R.basis)}).join('')+'</div>':'')+'</div>'+note+'</section>';
}
function oxRatingTable(R){
  var rated=R.rows.filter(function(b){return b.score!=null}).sort(function(a,b){return b.score-a.score||b.sh-a.sh}),un=R.rows.filter(function(b){return b.score==null});
  var f1=function(v,s){return v==null?'<td class="num"><span class="ox-nl">n/a</span></td>':'<td class="num">'+s+'</td>'};
  return '<div class="tw"><table class="std"><thead><tr><th>#</th><th>Branch</th><th>Zone</th><th>Stars</th><th class="num">Score</th><th class="num">Sales ('+(R.basis==='ach'?'Ach %':'QoQ %')+')</th><th class="num">Collected ÷ invoiced</th><th class="num">Stock days</th><th>Measures used</th></tr></thead><tbody>'
   +rated.map(function(b,i){var zz=zoneOfPlant(b.id).z;return '<tr><td>'+(i+1)+'</td><td><b>'+esc(b.name)+'</b> <span class="note mono">'+esc(b.id)+'</span></td><td>'+(zz?esc(zz):'—')+'</td><td>'+oxStars(b.st)+'</td><td class="num">'+b.score.toFixed(0)+'</td>'+f1(b.sk,b.sk==null?'':(R.basis==='ach'?b.sk.toFixed(1)+'%':(b.sk>=0?'+':'−')+Math.abs(b.sk).toFixed(1)+'%'))+f1(b.col,b.col==null?'':b.col.toFixed(1)+'%')+f1(b.stk,b.stk==null?'':String(Math.round(b.stk)))+'<td class="note">'+esc(b.W)+'</td></tr>'}).join('')
   +un.map(function(b){return '<tr><td>—</td><td><b>'+esc(b.name)+'</b> <span class="note mono">'+esc(b.id)+'</span></td><td colspan="7" class="note">not rated: no measure could be ranked</td></tr>'}).join('')+'</tbody></table></div><p class="note">Informational only. Percentile rank among the branches listed; a missing measure is dropped and the weights of the others rescaled.</p>';
}

/* ---- thickness and brand split cards ---- */
function oxSplitData(kind,ctx){
  var res=ctx.res,idx=kind==='thk'?0:1,topN=kind==='thk'?DIM_TOPTHK:DIM_TOPBR,plants=ctx.plants;
  var stC=dimState(plants,res.cur),stP=res.prior?dimState(plants,res.prior):null;
  var out={st:stC,stP:stP,rows:[],total:0,totalN:0,idx:idx};
  if(!stC.have)return out;
  var A=dimAgg(plants,res.cur,idx),P=res.prior?dimAgg(plants,res.prior,idx):new Map();
  var arr=Array.from(A.values()).sort(function(a,b){return b.sh-a.sh});
  out.total=arr.reduce(function(a,x){return a+x.sh},0);out.totalN=arr.reduce(function(a,x){return a+x.n},0);
  var top=arr.slice(0,topN),rest=arr.slice(topN);
  var inc=!res.curMonths.length||!monthsLoaded(res.curMonths,plants)||(res.prior?!monthsLoaded(res.priorMonths,plants):false);/* the coverage grid decides whether QoQ may be trusted (D28) */
  var priorOk=!!(res.prior&&!inc&&stP&&stP.complete&&stP.ready&&stC.complete&&stC.ready&&!preHist(res.priorMonths||[]));
  var mk=function(label,a,p,extra){var q=priorOk?qoqOf(a.sh,p,{}):{v:null,state:'incomplete',txt:!res.prior?'n/a':(stP&&stP.have?'partial':'no prior detail')};return {label:label,sh:a.sh,n:a.n,P:p,q:q,share:out.total>0?a.sh/out.total*100:0,extra:extra||''}};
  top.forEach(function(a){var pv=P.get(a.k);out.rows.push(mk(a.k,a,pv?pv.sh:0))});
  if(rest.length){var ra={sh:0,n:0};var rp=0;rest.forEach(function(a){ra.sh+=a.sh;ra.n+=a.n;var pv=P.get(a.k);if(pv)rp+=pv.sh});out.rows.push(mk('Other ('+rest.length+' '+(kind==='thk'?'values':'brands')+')',ra,rp,'other'))}
  return out;
}
function oxSplitCard(kind,ctx){
  var title=kind==='thk'?'Thickness split (top '+DIM_TOPTHK+' + Other)':'Brand split (top '+DIM_TOPBR+' + Other)',res=ctx.res,tk=kind==='thk'?'thk':'brand';
  var head='<section class="ox-card ox-h"><h2>'+title+oxDrill(tk)+'</h2>';
  if(kind==='brand'&&!S.itemMeta)return head+'<div class="ox-empty"><b>Item master not loaded</b><span>Brand and thickness come from the item master (Data Intake › Item master). Shown as not loaded, never as zero.</span></div></section>';
  var D=oxSplitData(kind,ctx),st=D.st;
  if(!st.have)return head+'<div class="ox-empty"><b>No thickness or brand detail for '+esc(res.label)+'</b><span>'+(st.total?'Sales loaded before v44 carry no item detail ('+st.total+' plant-month'+(st.total===1?'':'s')+' in this period). Reload these months in Data Intake › Sales; the replace keeps the old data until the new file is checked.':'No sales are loaded for this period.')+' Shown as not loaded, never as zero.</span></div></section>';
  var h=head;
  if(!st.ready)h+='<div class="ox-row"><span class="ox-chip nl">Reading item detail… '+st.loaded+' of '+st.have+'</span></div>';
  else if(!st.complete)h+='<div class="ox-row"><span class="ox-chip warn">Partial: '+st.have+' of '+st.total+' plant-months carry item detail</span></div><p class="note" style="margin:0"><b>Loaded plants only.</b> '+st.missing.length+' plant'+(st.missing.length===1?' is':'s are')+' missing from this split ('+esc(st.missing.slice(0,6).map(plantShort).join(', ')+(st.missing.length>6?' +'+(st.missing.length-6):''))+'); shares are of the loaded plants, not of all sales. Reload those plants\' months to complete it.</p>';
  if(st.ready||D.rows.length){
    var mx=Math.max.apply(null,D.rows.map(function(r){return r.sh}).concat([1]));
    h+=D.rows.map(function(r){
      var q=r.q,tip=r.label+' · '+oxLakh(r.sh)+' lakh sheets · '+r.share.toFixed(1)+(st.complete?'% of sheets':'% of the loaded plants\' sheets (partial)')+' · '+fmtMoney(r.n)+' invoiced'+(q.state==='ok'?' · Last Qtr '+oxLakh(r.P)+' · QoQ '+oxSgn(q.v,Math.abs(q.v).toFixed(1))+'%':' · QoQ '+(q.txt||'—'))+' · no target (targets are set by plant and product group)';
      return '<div class="ox-sp"'+oxTip(tip)+'><div class="h"><b>'+esc(r.label)+'</b><span class="mono"><b>'+oxLakh(r.sh)+'</b> lakh</span></div><div class="ox-bul share"><div class="f" style="width:'+(r.sh/mx*100).toFixed(1)+'%"></div></div>'
       +'<div class="m"><span>'+r.share.toFixed(1)+(st.complete?'% share':'% of loaded plants')+' · '+esc(fmtMoney(r.n))+'</span><span class="ox-row"><span class="ox-chip sm nl">no target</span>'+oxQoqChip(q)+'</span></div></div>';
    }).join('');
  }
  h+='<p class="note" style="margin:0">Sheets first, then share and ₹, '+esc(res.label)+'. Invoiced external lines (credit notes carry no item). Bar = share of sheets, scaled to the largest row. Targets are set by plant and product group, so no Ach % here.'+(kind==='thk'?' Thickness is read from the item master and rounded to 2 decimals; items without one are "Unknown".':' Items without a brand are "No brand".')+'</p></section>';
  return h;
}
function oxSplitTable(kind,ctx){
  var D=oxSplitData(kind,ctx),res=ctx.res;
  if(!D.st.have)return '<p class="note">Not loaded for '+esc(res.label)+'.</p>';
  var all=Array.from(dimAgg(ctx.plants,res.cur,D.idx).values()).sort(function(a,b){return b.sh-a.sh}),P=res.prior?dimAgg(ctx.plants,res.prior,D.idx):new Map(),tot=D.total||1;
  return '<div class="tw"><table class="std"><thead><tr><th>'+(kind==='thk'?'Thickness':'Brand')+'</th><th class="num">Lakh sheets</th><th class="num">Share %</th><th class="num">₹ invoiced</th><th class="num">Last Qtr</th><th class="num">QoQ %</th></tr></thead><tbody>'
   +all.map(function(a){var pv=P.get(a.k),pOk=D.stP&&D.stP.complete&&D.stP.ready&&D.st.complete&&D.st.ready,q=pOk?qoqOf(a.sh,pv?pv.sh:0,{}):null;return '<tr><td><b>'+esc(a.k)+'</b></td><td class="num">'+oxLakh(a.sh)+'</td><td class="num">'+(a.sh/tot*100).toFixed(1)+'%</td><td class="num">'+esc(fmtMoney(a.n))+'</td><td class="num">'+(pOk&&pv?oxLakh(pv.sh):'<span class="ox-nl">not loaded</span>')+'</td><td class="num">'+(q&&q.state==='ok'?fmtPct(q.v,true):'<span class="note">'+esc(q?q.txt:'partial')+'</span>')+'</td></tr>'}).join('')
   +'<tr class="tot"><td>'+(D.st.complete?'Total':'Total, loaded plants only')+'</td><td class="num">'+oxLakh(D.total)+'</td><td class="num">100%</td><td class="num">'+esc(fmtMoney(D.totalN))+'</td><td></td><td></td></tr></tbody></table></div><p class="note">Invoiced external lines; '+D.st.have+' of '+D.st.total+' plant-months carry item detail.</p>';
}

/* ---- collections: six quarters and the current one as bars, ₹ crore on each bar (mock-up v3) ---- */
function oxCollBars(cser){
  var s=cser.slice(-7),n=s.length;if(n<2)return '';
  var W=240,H=88,sl=W/n,vals=s.map(function(x){return x.A}).filter(function(v){return v!=null}),mx=Math.max.apply(null,vals.concat([1]));
  var out='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Collected by quarter in rupees crore: '+esc(s.map(function(x){return x.label+' '+(x.A==null?'not loaded':(x.A/1e7).toFixed(0))}).join(', '))+'">';
  s.forEach(function(x,i){
    var bx=i*sl+7,w=sl-14,prev=i?s[i-1]:null,tip=x.label+(x.isCur?' to date':'')+' · '+(x.A==null?'receipts not loaded':'collected '+fmtMoney(x.A));
    if(x.A!=null&&prev&&prev.A!=null&&prev.A>0&&!x.isCur)tip+=' · QoQ '+oxSgn(x.A-prev.A,Math.abs((x.A-prev.A)/prev.A*100).toFixed(1))+'%';
    out+='<g'+oxTip(tip)+'>';
    if(x.A==null)out+='<rect x="'+bx.toFixed(1)+'" y="30" width="'+w.toFixed(1)+'" height="38" rx="3" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="'+(bx+w/2).toFixed(1)+'" y="52" text-anchor="middle" style="font-size:8px">n/l</text>';
    else{var h=Math.max(1,x.A/mx*54);out+='<rect x="'+bx.toFixed(1)+'" y="'+(68-h).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3" fill="'+(x.isCur?'url(#oxh)':'var(--act)')+'"/><text x="'+(bx+w/2).toFixed(1)+'" y="'+(64-h).toFixed(1)+'" text-anchor="middle" style="font-size:9px;font-weight:700;fill:var(--ink)">'+Math.round(x.A/1e7)+'</text>'}
    out+='<text x="'+(bx+w/2).toFixed(1)+'" y="82" text-anchor="middle" class="st" style="font-size:9px">'+esc(x.label.replace(' FY',' ·')+(x.isCur?'*':''))+'</text></g>';
  });
  return out+'</svg>';
}

/* one card failing never takes the Overview down: it is replaced by a small notice naming the card */
function oxSafe(name,fn){try{return fn()}catch(e){return '<section class="ox-card ox-h"><h2>'+esc(name)+'</h2><div class="ox-empty"><b>This card could not be drawn</b><span>'+esc((e&&e.message)||String(e))+'. The rest of the Overview is unaffected.</span></div></section>'}}
