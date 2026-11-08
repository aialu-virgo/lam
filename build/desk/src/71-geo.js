/* ================= Geography (D77-D80): state and district masters, PIN -> district, actuals by customer state, Admin › Geography =================
   Masters live in the database collection "geography" (admin collection on Apps Script; Super admin and Management / HO write):
     st_<state_code>   {kind:'state', state_code, state_name, aliases, default_plant_code, active, map_source, confirmed_by, confirmed_at}
     di_<district_id>  {kind:'district', district_id, state_code, district_name, responsible_plant_code, map_source, active, confirmed_by, confirmed_at}
     pin_main + pin_c<i> {kind:'pinmeta'|'pins', z: gz [[pin,state_code,district_id,source,multi]]}
   The built-in GST state list below is public reference data (not Virgo data); a stored state record always wins over it. */
var GST_STATES=[['01','Jammu and Kashmir','JK|J&K'],['02','Himachal Pradesh','HP'],['03','Punjab','PB'],['04','Chandigarh','CH'],['05','Uttarakhand','UK|Uttaranchal'],['06','Haryana','HR'],['07','Delhi','DL|New Delhi|NCT of Delhi'],['08','Rajasthan','RJ'],['09','Uttar Pradesh','UP'],['10','Bihar','BR'],['11','Sikkim','SK'],['12','Arunachal Pradesh','AR'],['13','Nagaland','NL'],['14','Manipur','MN'],['15','Mizoram','MZ'],['16','Tripura','TR'],['17','Meghalaya','ML'],['18','Assam','AS'],['19','West Bengal','WB'],['20','Jharkhand','JH'],['21','Odisha','OD|Orissa'],['22','Chhattisgarh','CG|Chattisgarh'],['23','Madhya Pradesh','MP'],['24','Gujarat','GJ'],['25','Daman and Diu','DD'],['26','Dadra and Nagar Haveli and Daman and Diu','DN|DNH'],['27','Maharashtra','MH'],['29','Karnataka','KA'],['30','Goa','GA'],['31','Lakshadweep','LD'],['32','Kerala','KL'],['33','Tamil Nadu','TN'],['34','Puducherry','PY|Pondicherry'],['35','Andaman and Nicobar Islands','AN'],['36','Telangana','TS|TG'],['37','Andhra Pradesh','AP'],['38','Ladakh','LA'],['97','Other Territory','OT']];
S.geoRaw=[];var GEO={states:{},districts:{},alias:new Map(),dname:new Map(),pins:new Map(),pinKey:'',ver:0,stored:0};
function geoNorm(s){return String(s==null?'':s).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\b(district|dist|city|urban|rural)\b/g,' ').replace(/\s+/g,' ').trim()}
function geoIngest(){
  var st={},alias=new Map(),di={},dn=new Map(),stored=0;
  GST_STATES.forEach(function(s){st[s[0]]={state_code:s[0],state_name:s[1],aliases:s[2],default_plant_code:'',active:true,builtin:true}});
  S.geoRaw.forEach(function(x){if(x.kind==='state'&&/^\d\d$/.test(x.state_code||'')){st[x.state_code]=Object.assign({},x);stored++}});
  Object.keys(st).forEach(function(c){var s=st[c];alias.set(c,c);alias.set(String(+c),c);alias.set(geoNorm(s.state_name),c);String(s.aliases||'').split('|').forEach(function(a){var k=geoNorm(a);if(k)alias.set(k,c)})});
  S.geoRaw.forEach(function(x){if(x.kind==='district'&&x.district_id){di[x.district_id]=Object.assign({},x);dn.set(x.state_code+'|'+geoNorm(x.district_name),x.district_id)}});
  GEO.states=st;GEO.alias=alias;GEO.districts=di;GEO.dname=dn;GEO.stored=stored;GEO.ver++;DS.cache={};if(typeof schedule==='function'&&S.loaded){S.lastHtml='';schedule()}
  var meta=S.geoRaw.find(function(x){return x._id==='pin_main'}),key=meta?(meta.at||'')+'|'+(meta.chunks||0):'';
  if(key!==GEO.pinKey){GEO.pinKey=key;if(!meta){GEO.pins=new Map()}else{var dm={};S.geoRaw.forEach(function(x){dm[x._id]=x});(async function(){var m=new Map();for(var i=0;i<(meta.chunks||0);i++){var d=dm['pin_c'+i];if(!d)continue;try{JSON.parse(await ungz(d.z)).forEach(function(r){m.set(String(r[0]),r)})}catch(e){}}if(key===GEO.pinKey){GEO.pins=m;GEO.ver++;DS.cache={};S.lastHtml='';schedule()}})()}}
}
geoIngest();
function stateCode(raw){
  if(raw==null)return '';var t=String(raw).trim();if(!t)return '';
  if(/^\d{1,2}$/.test(t)){var c=('0'+t).slice(-2);return GEO.states[c]?c:''}
  return GEO.alias.get(geoNorm(t))||'';
}
function stateName(c){return c==='00'?'State not known':(GEO.states[c]?GEO.states[c].state_name:c)}
function geoDefaultPlant(c){var s=GEO.states[c];return s&&s.active!==false?(s.default_plant_code||''):''}
function geoDistrictsOf(c){return Object.keys(GEO.districts).map(function(k){return GEO.districts[k]}).filter(function(d){return d.state_code===c&&d.active!==false}).sort(function(a,b){return a.district_name<b.district_name?-1:1})}
function geoDistrictPlant(id){var d=GEO.districts[id];return d?(d.responsible_plant_code||''):''}
function geoDistrictName(id){var d=GEO.districts[id];return d?d.district_name:id}
/* customer -> state and district (target-model "How actuals reach a district"): master state, else the invoice's customer state, else 00; district only by PIN (state must agree) or the master's District text */
function custGeo(code,invState){
  var c=custInfo(code),st='',how='';
  if(c&&c[4]){st=stateCode(c[4]);if(st)how=/^SAP:/i.test(c[4])?'region':'master'}
  if(!st&&c){st=gstinState(c[12]);if(st)how='gstin'}
  if(!st&&invState){st=stateCode(invState);if(st)how='invoice'}
  if(!st){st='00';how='unknown'}
  var dist='',why='';
  if(c&&c[9]){var p=GEO.pins.get(String(c[9]).trim());if(!p)why='pin not in master';else if(p[1]!==st)why='pin state differs';else if(!p[2])why='pin has no district';else dist=p[2]}
  else why='no pin';
  if(!dist&&c&&c[10]){var id=GEO.dname.get(st+'|'+geoNorm(c[10]));if(id)dist=id}
  return {st:st,dist:dist,why:dist?'':why,how:how};
}
/* GSTIN fallback (D80 addition): the first two digits of a GSTIN are the GST state code; used only when the master's state is blank or an unmapped SAP region */
function gstinState(g){var m=/^(\d\d)[A-Z0-9]{13}$/i.exec(String(g||'').trim());return m&&GEO.states[m[1]]&&m[1]!=='00'?m[1]:''}
function custGstinPlaced(){var n=0,by={B1:0,S4:0};if(S.custIdx)S.custIdx.forEach(function(a){if(!(a[4]&&stateCode(a[4]))&&gstinState(a[12])){n++;by[a[11]==='S4'?'S4':'B1']++}});return {n:n,by:by}}
/* ---- invoice customer detail for every plant (attribution is by customer, not by the viewer's plant scope) ---- */
var GEOA={rows:{},pending:{},jobs:0,done:0,ver:0};
function geoMonthsLoaded(yms){return yms.every(function(ym){var c=S.cells['INV_'+ym];if(!c)return true;return Object.keys(c.plants||{}).every(function(p){return !!GEOA.rows[p+SEP+ym]})})}
async function geoLoadMonths(yms){
  var jobs=[];
  yms.forEach(function(ym){var c=S.cells['INV_'+ym];if(!c)return;Object.keys(c.plants||{}).forEach(function(p){var k=p+SEP+ym,info=c.plants[p];if(GEOA.rows[k]&&GEOA.rows[k].at===info.at)return;if(GEOA.pending[k])return;jobs.push({k:k,p:p,ym:ym,info:info})})});
  if(!jobs.length)return;
  jobs.forEach(function(j){GEOA.pending[j.k]=1});GEOA.jobs+=jobs.length;schedule();
  var q=jobs.slice();
  async function worker(){
    while(q.length){var j=q.shift();
      try{var a=[],cs={};
        for(var i=0;i<(j.info.chunks||0);i++){var snap=await dget('inv/'+j.info.sys+'-'+j.p+'-'+j.ym+'-'+i);if(!snap.exists)continue;var o=JSON.parse(await ungz(snap.data().z));for(var x=0;x<o.a.length;x++)a.push(o.a[x]);if(o.cs)Object.keys(o.cs).forEach(function(k){cs[k]=o.cs[k]})}
        GEOA.rows[j.k]={a:a,cs:cs,at:j.info.at,demo:!!j.info.demo};
      }catch(e){S.err=(S.err||'')+'geography read '+j.k+': '+((e&&e.message)||e)+' '}
      delete GEOA.pending[j.k];GEOA.done++;
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  GEOA.done=GEOA.jobs=0;GEOA.ver++;DS.cache={};S.lastHtml='';schedule();
}
/* aggregate attributed actuals over months: key state|group -> {n, sh, dist:{id:n}, un, plants:{invoicing plant: n}}; spOnly limits to one salesperson scope */
function geoAgg(yms,sc){
  var key='ga'+JSON.stringify([yms,sc&&sc.sp||null])+GEOA.ver+'|'+GEO.ver+'|'+S.custKey;
  if(DS.cache[key])return DS.cache[key];
  var out={},custs=0,seen={};
  yms.forEach(function(ym){
    var c=S.cells['INV_'+ym];if(!c)return;
    Object.keys(c.plants||{}).forEach(function(p){
      var R=GEOA.rows[p+SEP+ym];if(!R)return;
      R.a.forEach(function(r){
        if(r[4])return;if(sc&&sc.sp&&!spOk(sc,r[2]))return;
        var g=custGeo(r[0],R.cs[r[0]]),k=g.st+'|'+r[3],o=out[k]||(out[k]={n:0,sh:0,dist:{},un:0,plants:{},months:{}});
        o.n+=r[9];o.sh+=r[7];o.plants[p]=(o.plants[p]||0)+r[9];o.months[ym]=(o.months[ym]||0)+r[9];
        if(g.dist)o.dist[g.dist]=(o.dist[g.dist]||0)+r[9];else o.un+=r[9];
        if(!seen[r[0]]){seen[r[0]]=1;custs++}
      });
    });
  });
  out.__custs=custs;DS.cache[key]=out;return out;
}
/* actuals of a locked quarter come from the snapshot written at lock time (target-model rule 5) */
var GEOSNAP={};
function geoSnap(q){
  var lk=S.planlocks&&S.planlocks[q];if(!lk||!lk.geo_snap)return null;
  var hit=GEOSNAP[q];if(hit&&hit.at===lk.at)return hit.agg;
  if(!hit||hit.at!==lk.at){GEOSNAP[q]={at:lk.at,agg:null};(async function(){try{var rows=JSON.parse(await ungz(lk.geo_snap));var o={};rows.forEach(function(r){var k=r[0]+'|'+r[2],x=o[k]||(o[k]={n:0,sh:0,dist:{},un:0,plants:{},months:{}});x.n+=r[4];x.sh+=r[5];x.months[r[3]]=(x.months[r[3]]||0)+r[4];if(r[1])x.dist[r[1]]=(x.dist[r[1]]||0)+r[4];else x.un+=r[4]});GEOSNAP[q].agg=o;S.lastHtml='';schedule()}catch(e){}})()}
  return null;
}
async function geoSnapRows(q){
  var yms=qMonths(q);await geoLoadMonths(yms);var rows=[];
  yms.forEach(function(ym){var c=S.cells['INV_'+ym];if(!c)return;var acc={};Object.keys(c.plants||{}).forEach(function(p){var R=GEOA.rows[p+SEP+ym];if(!R)return;R.a.forEach(function(r){if(r[4])return;var g=custGeo(r[0],R.cs[r[0]]),k=[g.st,g.dist,r[3]].join('|'),o=acc[k]||(acc[k]=[g.st,g.dist,r[3],ym,0,0]);o[4]+=r[9];o[5]+=r[7]})});Object.keys(acc).forEach(function(k){var o=acc[k];o[4]=Math.round(o[4]*100)/100;rows.push(o)})});
  return rows;
}
/* ---- draft branch map from sales history (data-map/geography.md): votes by invoicing plant over the last 4 closed quarters ---- */
function geoWindow(){var cq=closedQuarters().slice(-4);return {qs:cq,yms:[].concat.apply([],cq.map(qMonths))}}
function geoBand(top,second){if(!top||top.share==null)return 'Unmapped';var s=top.share*100,s2=second?second.share*100:0;if(s>=60)return 'High';if(s>=50)return 'Check';if(s-s2>5)return 'Check';return 'Unmapped'}
function geoVote(votes,lastQms){
  var plants=Object.keys(votes);if(!plants.length)return {list:[],total:0,top:null,second:null,band:'Unmapped'};
  var total=plants.reduce(function(a,p){return a+votes[p].n},0);
  var list=plants.map(function(p){var v=votes[p],lq=0;lastQms.forEach(function(m){lq+=v.m[m]||0});return {p:p,n:v.n,sh:v.sh,lq:lq,share:total>0?v.n/total:0}});
  list.sort(function(a,b){return b.n-a.n||b.sh-a.sh||b.lq-a.lq||(a.p<b.p?-1:1)});
  var band=total>0?geoBand(list[0],list[1]):'Unmapped';
  return {list:list,total:total,top:list[0],second:list[1]||null,band:band};
}
function geoDraft(){
  var w=geoWindow(),lastQms=w.qs.length?qMonths(w.qs[w.qs.length-1]):[],st={},di={};
  w.yms.forEach(function(ym){var c=S.cells['INV_'+ym];if(!c)return;Object.keys(c.plants||{}).forEach(function(p){if(+p>=1050)return;var R=GEOA.rows[p+SEP+ym];if(!R)return;R.a.forEach(function(r){if(r[4])return;var g=custGeo(r[0],R.cs[r[0]]);
    var add=function(bag,k){var b=bag[k]||(bag[k]={}),v=b[p]||(b[p]={n:0,sh:0,m:{}});v.n+=r[9];v.sh+=r[7];v.m[ym]=(v.m[ym]||0)+r[9]};
    add(st,g.st);if(g.dist)add(di,g.dist)})})});
  var out={states:{},districts:{},window:w,ready:geoMonthsLoaded(w.yms)};
  Object.keys(st).forEach(function(k){if(k!=='00')out.states[k]=geoVote(st[k],lastQms)});
  Object.keys(GEO.districts).forEach(function(k){out.districts[k]=geoVote(di[k]||{},lastQms)});
  return out;
}
/* ---------- Admin › Geography page (Super admin and Management / HO) ---------- */
S.geoEd={states:{},districts:{}};S.geoMsg='';S.geoDraftOn=false;
function geoCanEdit(){var r=effRole();return !readOnly()&&(r==='Super admin'||r==='Management / HO')}
function geoPlantOpts(cur){var pl=S.plants.filter(function(p){return p.active!==false&&p.business!=='ACP'&&+p.plant_code<1050}).map(function(p){return p.plant_code}).sort();return '<option value="">Choose plant</option>'+pl.map(function(c){return '<option value="'+c+'"'+(cur===c?' selected':'')+'>'+esc(plantName(c))+'</option>'}).join('')}
function geoShareTxt(v){return v&&v.top?Math.round(v.top.share*100)+'%':'—'}
function geoOthers(v){if(!v||!v.list.length)return 'no sales in 4 quarters';return v.list.slice(1,3).map(function(x){return esc(plantShort(x.p))+' '+Math.round(x.share*100)+'%'}).join(' · ')||'—'}
function pageGeography(){
  var can=geoCanEdit(),dr=S.geoDraftOn?geoDraft():null,w=geoWindow();
  if(S.geoDraftOn&&dr&&!dr.ready)geoLoadMonths(w.yms);
  var states=Object.keys(GEO.states).filter(function(c){var s=GEO.states[c];return !s.builtin||s.default_plant_code||(dr&&dr.states[c])||geoDistrictsOf(c).length||S.geoEd.states[c]!=null}).sort(function(a,b){return stateName(a)<stateName(b)?-1:1});
  var noDef=0,unm=0,chk=0;
  var srow=states.map(function(c){
    var s=GEO.states[c],v=dr&&dr.states[c],stored=s.default_plant_code||'',ed=S.geoEd.states[c];
    var sugg=v&&v.band!=='Unmapped'?v.top.p:'',cur=ed!=null?ed:(stored&&s.map_source==='entered'?stored:(dr?sugg||stored:stored));
    var band=v?v.band:(stored?'Saved':'—');if(!cur)noDef++;if(band==='Check')chk++;
    var status=ed!=null&&ed!==stored?'Changed, not saved':s.confirmed_by&&s.map_source==='entered'?'Confirmed by '+esc(userName(s.confirmed_by))+' '+esc(fmtDate((s.confirmed_at||'').slice(0,10))):stored?(s.map_source==='derived'?'Saved (drafted)':'Saved'):cur?'Suggested':'No default plant';
    return '<tr><td>'+esc(stateName(c))+'<div class="note mono">'+c+'</div></td><td>'+(can?'<select class="in" data-chg="geo-st" data-k="'+c+'" aria-label="Default plant for '+esc(stateName(c))+'">'+geoPlantOpts(cur)+'</select>':esc(cur?plantName(cur):'No default plant'))+'</td><td class="num">'+geoShareTxt(v)+'</td><td class="note">'+(v?geoOthers(v):'—')+'</td><td>'+(band==='High'?'<span class="pill ok">High</span>':band==='Check'?'<span class="pill part">Check</span>':band==='Unmapped'?'<span class="pill miss">Unmapped</span>':esc(band))+'</td><td class="note">'+status+'</td><td class="num">'+geoDistrictsOf(c).length+'</td></tr>'}).join('');
  var dids=Object.keys(GEO.districts).sort(function(a,b){var x=GEO.districts[a],y=GEO.districts[b];return (stateName(x.state_code)+x.district_name)<(stateName(y.state_code)+y.district_name)?-1:1});
  var drow=dids.map(function(id){
    var d=GEO.districts[id],v=dr&&dr.districts[id],stored=d.responsible_plant_code||'',ed=S.geoEd.districts[id];
    var sugg=v&&v.band!=='Unmapped'&&v.top?v.top.p:'',cur=ed!=null?ed:(stored&&d.map_source==='entered'?stored:(dr?sugg||stored:stored));if(!cur)unm++;
    var band=v?(v.total?v.band:'Unmapped'):(stored?'Saved':'—');if(band==='Check')chk++;
    return '<tr><td>'+esc(stateName(d.state_code))+'</td><td>'+esc(d.district_name)+'<div class="note mono">'+esc(id)+'</div></td><td>'+(can?'<select class="in" data-chg="geo-di" data-k="'+esc(id)+'" aria-label="Plant for '+esc(d.district_name)+'">'+geoPlantOpts(cur)+'</select>':esc(cur?plantName(cur):'Not mapped'))+'</td><td class="num">'+geoShareTxt(v)+'</td><td class="note">'+(v?geoOthers(v):'—')+'</td><td>'+(band==='High'?'<span class="pill ok">High</span>':band==='Check'?'<span class="pill part">Check</span>':band==='Unmapped'?'<span class="pill miss">Unmapped</span>':esc(band))+'</td><td class="note">'+(ed!=null&&ed!==stored?'Changed, not saved':d.map_source==='entered'&&d.confirmed_by?'Confirmed by '+esc(userName(d.confirmed_by)):stored?'Saved':cur?'Suggested':'Not mapped')+'</td></tr>'}).join('');
  var h='<section class="card"><div class="hd"><h2>Geography · default plant of each state, plant of each district</h2><div class="row">'
   +(can?'<button class="btn" data-act="geo-draft">Draft from sales history</button>':'')+'<button class="btn" data-act="geo-csv">Download as file</button>'+(can?'<button class="btn pri" data-act="geo-save">Save mapping</button>':'')+'</div></div>'
   +'<p class="note" style="margin:0">Super admin and Management / HO can draft, correct and save. The draft gives each state and district to the plant with the most net sales in the last 4 completed quarters ('+(w.qs.length?esc(qLabel(w.qs[0]))+' to '+esc(qLabel(w.qs[w.qs.length-1])):'none loaded')+'); ties go to more sheets, then the latest quarter, then the lower plant code. A rule, not AI. Nothing is saved until you press Save mapping. A state with no default plant is edited by Management / HO and Super admin only.</p>'
   +'<p class="note" style="margin:0"><b>Check bands.</b> High: top plant has 60% or more. Check: 50 to 59%, or under 50% with a lead of more than 5 points over the second plant. Unmapped: no sales, or under 50% with a lead of 5 points or less; you pick the plant.</p>'
   +(dr&&!dr.ready?'<div class="banner info">Reading sales history for the draft ('+GEOA.jobs+' plant-months)...</div>':'')
   +'<div class="row"><span class="pill '+(noDef?'part':'ok')+'">'+noDef+' state'+(noDef===1?'':'s')+' with no default plant</span><span class="pill '+(unm?'part':'ok')+'">'+unm+' district'+(unm===1?'':'s')+' not mapped</span><span class="pill info">'+chk+' to check</span></div>'
   +'<div id="geo-msg">'+(S.geoMsg||'')+'</div>'
   +'<h3 style="margin:6px 0 0;font-size:13px">1 · State → default plant (works now: actuals come by the customer\'s state)</h3>'
   +(states.length?'<div class="tw"><table><thead><tr><th>State</th><th>Default plant</th><th class="num">Top plant share of state sales</th><th>Others</th><th>Check</th><th>Status</th><th class="num">Districts in list</th></tr></thead><tbody>'+srow+'</tbody></table></div>':'<div class="empty">No state has a default plant yet. Press "Draft from sales history", or upload the state file.</div>')
   +'<h3 style="margin:6px 0 0;font-size:13px">2 · District → responsible plant (optional; needs district on the customer master · '+dids.length+' district'+(dids.length===1?'':'s')+' in the list)</h3>'
   +(dids.length?'<div class="tw"><table><thead><tr><th>State</th><th>District</th><th>Responsible plant</th><th class="num">Top plant share of district sales</th><th>Others</th><th>Check</th><th>Status</th></tr></thead><tbody>'+drow+'</tbody></table></div>':'<div class="empty sm">No district list. Districts are optional; nothing waits on them.</div>')
   +'</section>';
  h+='<section class="card"><div class="hd"><h2>Masters · upload</h2></div><p class="note" style="margin:0">State, district and PIN lists from the templates (header row as in the template; the public lists are loaded here, never into the code). A re-run of the draft replaces only drafted rows, never rows a person set.</p>'
   +'<div class="row">'+[['state','State list'],['district','District list'],['pin','PIN → district']].map(function(t){return (can?'<label class="btn sm" for="up-geo-'+t[0]+'" style="cursor:pointer">Upload '+t[1]+' (CSV)</label><input id="up-geo-'+t[0]+'" data-geofile="'+t[0]+'" type="file" accept=".csv" style="position:absolute;opacity:0;width:1px;height:1px">':'')+'<button class="btn sm" data-act="geo-tmpl" data-t="'+t[0]+'">'+t[1]+' template</button>'}).join('')+'</div>'
   +'<div class="kpis"><div class="kpi"><small>States saved</small><b>'+GEO.stored+'</b><small>'+Object.keys(GEO.states).length+' known (GST list + saved)</small></div><div class="kpi"><small>Districts</small><b>'+Object.keys(GEO.districts).length+'</b></div><div class="kpi"><small>PIN codes</small><b>'+fmtN(GEO.pins.size)+'</b></div><div class="kpi"><small>Customers placed by GSTIN</small><b>'+fmtN(custGstinPlaced().n)+'</b><small>state blank or an unmapped SAP region; state taken from the GSTIN\'s first two digits</small></div></div>'
   +'<div id="geo-up-msg">'+(S.geoUpMsg||'')+'</div></section>';
  return h;
}
var GEO_TEMPLATES={state:'state_code,state_name,aliases,default_plant_code,active',district:'district_id,state_code,district_name,responsible_plant_code,map_source,active',pin:'pin,state_code,district_id,source,multi_district'};
async function geoSave(){
  if(!geoCanEdit()){toast('Only Super admin or Management / HO can save the geography map');return}
  var dr=S.geoDraftOn?geoDraft():null,by=effUser().email,now=nowISO(),n=0;
  try{
    var codes={};Object.keys(S.geoEd.states).forEach(function(c){codes[c]=1});if(dr)Object.keys(dr.states).forEach(function(c){codes[c]=1});
    for(var c in codes){
      var s=GEO.states[c]||{state_code:c,state_name:stateName(c)},v=dr&&dr.states[c],ed=S.geoEd.states[c],stored=s.builtin?'':(s.default_plant_code||'');
      var sugg=v&&v.band!=='Unmapped'&&v.top?v.top.p:'';
      var plant,src;
      if(ed!=null){plant=ed;src=ed===sugg&&!s.confirmed_by?'derived':'entered'}
      else if(s.map_source==='entered'&&stored){continue}
      else if(dr){plant=sugg;src='derived'}else continue;
      if(plant===stored&&!s.builtin&&src===(s.map_source||'derived'))continue;
      var doc={kind:'state',state_code:c,state_name:s.state_name,aliases:s.aliases||'',default_plant_code:plant||'',active:s.active!==false,map_source:src,updated_by:by,updated_at:now};
      if(src==='entered'){doc.confirmed_by=by;doc.confirmed_at=now}
      if(v&&v.top){doc.draft_share=Math.round(v.top.share*1000)/10;doc.draft_band=v.band}
      await dset('geography/st_'+c,doc);n++;
    }
    var ids={};Object.keys(S.geoEd.districts).forEach(function(k){ids[k]=1});if(dr)Object.keys(dr.districts).forEach(function(k){ids[k]=1});
    for(var id in ids){
      var d=GEO.districts[id];if(!d)continue;var vd=dr&&dr.districts[id],edd=S.geoEd.districts[id],sd=vd&&vd.band!=='Unmapped'&&vd.top?vd.top.p:'',pl,sr;
      if(edd!=null){pl=edd;sr=edd===sd?'derived':'entered'}else if(d.map_source==='entered'&&d.responsible_plant_code)continue;else if(dr){pl=sd;sr='derived'}else continue;
      if(pl===(d.responsible_plant_code||'')&&sr===(d.map_source||'derived'))continue;
      var dd=Object.assign({},d,{responsible_plant_code:pl||'',map_source:sr,updated_by:by,updated_at:now});delete dd._id;if(sr==='entered'){dd.confirmed_by=by;dd.confirmed_at=now}
      await dset('geography/di_'+slug(id),dd);n++;
    }
    await dset('log/l'+Date.now().toString(36),{at:now,by:by,event:'geography map saved',rows:n});
    S.geoEd={states:{},districts:{}};S.geoMsg='<div class="banner ok">Saved '+n+' row'+(n===1?'':'s')+'.</div>';toast('Geography map saved');
  }catch(e){S.geoMsg='<div class="banner err">'+esc(dbErrText(e))+'</div>'}
  S.lastHtml='';schedule();
}
async function geoUpload(kind,text){
  var show=function(h){S.geoUpMsg=h;S.lastHtml='';schedule()};
  if(!geoCanEdit()){show('<div class="banner err">Only Super admin or Management / HO can load geography masters.</div>');return}
  var rows=parseCSV(text);if(rows.length<2){show('<div class="banner err">The file has no data rows.</div>');return}
  var hd=rows[0].map(function(x){return norm(x)}),need=GEO_TEMPLATES[kind].split(','),miss=need.filter(function(c){return hd.indexOf(c)<0&&['aliases','default_plant_code','active','map_source','source','multi_district','responsible_plant_code'].indexOf(c)<0});
  if(miss.length){show('<div class="banner err">Missing columns: '+esc(miss.join(', '))+'. Download the template.</div>');return}
  var get=function(r,k){var i=hd.indexOf(k);return i<0?'':String(r[i]==null?'':r[i]).trim()},bad=[],ok=[],seen={},by=effUser().email,now=nowISO();
  var plantOk=function(p){return !p||S.plants.some(function(x){return x.plant_code===p&&x.business!=='ACP'&&+p<1050})};
  rows.slice(1).forEach(function(r,i){var rn=i+2;if(r.every(function(v){return String(v==null?'':v).trim()===''}))return;
    if(kind==='state'){var c=get(r,'state_code').replace(/\.0$/,'');if(/^\d$/.test(c))c='0'+c;var e=[];if(!/^\d\d$/.test(c))e.push('state_code must be 2 digits');if(seen[c])e.push('Duplicate state_code');seen[c]=1;if(!get(r,'state_name'))e.push('state_name is required');var dp=get(r,'default_plant_code').replace(/\.0$/,'');if(!plantOk(dp))e.push('default_plant_code is not a laminates plant');
      if(e.length)bad.push([rn,c,e.join('; ')]);else ok.push(['geography/st_'+c,{kind:'state',state_code:c,state_name:get(r,'state_name'),aliases:get(r,'aliases'),default_plant_code:dp,active:!/^(n|no|false|0)$/i.test(get(r,'active')||'y'),map_source:dp?'entered':'',confirmed_by:dp?by:undefined,confirmed_at:dp?now:undefined,updated_by:by,updated_at:now}])}
    else if(kind==='district'){var id=get(r,'district_id').replace(/\.0$/,''),sc=stateCode(get(r,'state_code').replace(/\.0$/,'')),rp=get(r,'responsible_plant_code').replace(/\.0$/,''),e2=[];if(!id)e2.push('district_id is required');if(seen['d'+id])e2.push('Duplicate district_id');seen['d'+id]=1;if(!sc)e2.push('Unknown state_code');if(!get(r,'district_name'))e2.push('district_name is required');if(!plantOk(rp))e2.push('responsible_plant_code is not a laminates plant');
      if(e2.length)bad.push([rn,id,e2.join('; ')]);else ok.push(['geography/di_'+slug(id),{kind:'district',district_id:id,state_code:sc,district_name:get(r,'district_name'),responsible_plant_code:rp,map_source:rp?(get(r,'map_source')||'entered'):'',active:!/^(n|no|false|0)$/i.test(get(r,'active')||'y'),updated_by:by,updated_at:now}])}
    else{var pin=get(r,'pin').replace(/\.0$/,''),ps=stateCode(get(r,'state_code').replace(/\.0$/,'')),pd=get(r,'district_id').replace(/\.0$/,''),e3=[];if(!/^[1-9]\d{5}$/.test(pin))e3.push('pin must be 6 digits');if(seen['p'+pin])e3.push('Duplicate pin');seen['p'+pin]=1;if(!ps)e3.push('Unknown state_code');if(pd&&(!GEO.districts[pd]||GEO.districts[pd].state_code!==ps))e3.push('district_id is not a district of that state');
      if(e3.length)bad.push([rn,pin,e3.join('; ')]);else ok.push([pin,ps,pd,get(r,'source')||'public list',/^(y|yes|1|true)$/i.test(get(r,'multi_district'))?1:0])}
  });
  try{
    if(kind==='pin'){var per=4000,n=Math.max(1,Math.ceil(ok.length/per)),old=(S.geoRaw.find(function(x){return x._id==='pin_main'})||{}).chunks||0;
      for(var i=0;i<n;i++)await dset('geography/pin_c'+i,{kind:'pins',i:i,z:await gz(JSON.stringify(ok.slice(i*per,(i+1)*per))),n:Math.min(per,ok.length-i*per)});
      for(var j=n;j<old;j++)await ddel('geography/pin_c'+j);
      await dset('geography/pin_main',{kind:'pinmeta',chunks:n,n:ok.length,at:now,by:by,fmt:'gz-json v1: [pin,state_code,district_id,source,multi_district]'});
    }else for(var k=0;k<ok.length;k++){var d=ok[k][1];Object.keys(d).forEach(function(x){if(d[x]===undefined)delete d[x]});await dset(ok[k][0],d)}
    await dset('log/l'+Date.now().toString(36),{at:now,by:by,event:'geography '+kind+' list loaded',rows:ok.length});
  }catch(e){show('<div class="banner err">'+esc(dbErrText(e))+'</div>');return}
  toast('Geography: '+ok.length+' loaded'+(bad.length?', '+bad.length+' rejected':''));
  show('<div class="banner '+(bad.length?'warn':'ok')+'" style="display:block">Loaded '+ok.length+' row(s) into the '+kind+' list.'+(bad.length?' <b>'+bad.length+' rejected:</b><ul style="margin:4px 0 0 18px">'+bad.slice(0,30).map(function(b){return '<li>Row '+b[0]+' '+esc(b[1])+': '+esc(b[2])+'</li>'}).join('')+'</ul>':'')+'</div>');
}
function geoCsv(){
  var dr=S.geoDraftOn?geoDraft():null,l=[['level','state_code','state_name','district_id','district_name','plant_code','top_share_pct','band','map_source']];
  Object.keys(GEO.states).sort().forEach(function(c){var s=GEO.states[c],v=dr&&dr.states[c],p=S.geoEd.states[c]!=null?S.geoEd.states[c]:(s.default_plant_code||(v&&v.band!=='Unmapped'&&v.top?v.top.p:''));if(!p&&!v&&s.builtin)return;l.push(['state',c,s.state_name,'','',p,v&&v.top?Math.round(v.top.share*100):'',v?v.band:'',s.map_source||''])});
  Object.keys(GEO.districts).sort().forEach(function(id){var d=GEO.districts[id],v=dr&&dr.districts[id],p=S.geoEd.districts[id]!=null?S.geoEd.districts[id]:(d.responsible_plant_code||(v&&v.band!=='Unmapped'&&v.top?v.top.p:''));l.push(['district',d.state_code,stateName(d.state_code),id,d.district_name,p,v&&v.top?Math.round(v.top.share*100):'',v?v.band:'',d.map_source||''])});
  return l.map(csvLine).join('\n')+'\n';
}
Object.assign(handlers,{
 'geo-draft':function(){S.geoDraftOn=true;S.geoMsg='';geoLoadMonths(geoWindow().yms);S.lastHtml='';schedule()},
 'geo-save':function(){return geoSave()},
 'geo-csv':function(){return download('geography-map.csv',geoCsv())},
 'geo-tmpl':function(t){var k=t.getAttribute('data-t');return download('geography-'+k+'.csv',GEO_TEMPLATES[k]+'\n')}
});
document.addEventListener('change',function(ev){
  var t=ev.target;if(!t.getAttribute)return;
  var c=t.getAttribute('data-chg');
  if(c==='geo-st'){S.geoEd.states[t.getAttribute('data-k')]=t.value;S.lastHtml='';schedule();return}
  if(c==='geo-di'){S.geoEd.districts[t.getAttribute('data-k')]=t.value;S.lastHtml='';schedule();return}
  var g=t.getAttribute('data-geofile');if(g&&t.files&&t.files[0]){var f=t.files[0];f.text().then(function(x){return geoUpload(g,x)}).then(function(){t.value=''})}
});
