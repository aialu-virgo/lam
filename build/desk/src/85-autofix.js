/* ================= Auto-fix pass (Vijay, 21 Oct 2026): upload files as SAP gives them, show what was fixed =================
 * Alias tables live in settings/alias_<kind> (database rule: admin write). Seeds are in code. Nothing is changed silently:
 * every fix is counted and shown in the "Fixes applied" panel of the upload; what only the source can fix is named. */
S.alias={category:{},zone:{},designation:{},salesperson:{},warehouse:{},plantprefix:{}};
var ZONE_CANON=['ZONE1','ZONE2','ZONE3','ZONE4','ZONE5','BRANCH','FACTORY','ACP'];
var CAT_CANON=['Laminate','Door','PVC sheet','Compact board','Out of scope'];
function seedZone(){var o={};for(var i=1;i<=5;i++){o['zone'+i]='ZONE'+i;o['zone '+i]='ZONE'+i;o['zone 0'+i]='ZONE'+i}o.branch='BRANCH';o.factory='FACTORY';o.acp='ACP';return o}
var ALIAS_KINDS={
 category:{label:'Item category → product group',hint:'B1 "Catagory" or S/4 Product Type. Applies when a file is checked. "Out of scope" keeps the row in the record but outside the four groups.',canon:CAT_CANON,
  seed:{'decorative laminate':'Laminate','decorative laminates':'Laminate','decorative laminate door':'Door','decorative laminates door':'Door','pvc sheet':'PVC sheet','pvc sheets':'PVC sheet','compact laminate':'Compact board','compact board':'Compact board','compact laminates':'Compact board','acp':'Out of scope','aluminium composite panel':'Out of scope','cladding':'Out of scope'}},
 zone:{label:'Zone spelling → zone',hint:'Used for the internal-transfer rule (BRANCH or FACTORY). Applies when a file is checked.',canon:ZONE_CANON,seed:seedZone()},
 designation:{label:'Designation spelling → designation',hint:'Applies when a sales-employee file is checked. The Desk role is proposed from the chosen designation.',canon:null,
  seed:{'sales executive':'Sales Executive','sale executive':'Sales Executive','sales exec':'Sales Executive','sales executives':'Sales Executive','sr sales executive':'Sr. Sales Executive','senior sales executive':'Sr. Sales Executive','branch manager':'Branch Manager','branch head':'Branch Manager','depot manager':'Depot Manager'}},
 salesperson:{label:'B1 salesperson name → employee code',hint:'One click in a list of unmatched names saves a row here. Applies at once, no reload.',canon:null,seed:{}},
 warehouse:{label:'Warehouse code → plant code',hint:'B1 WhsCode (or S/4 storage location) to the plant that owns it. Several warehouses may map to one plant; their stock is added together. Applies when a stock file is checked.',canon:null,seed:{}},
 plantprefix:{label:'Employee ID prefix → plant code',hint:'The part of the employee ID before the number (E-XXX in E-XXX-0123). The Desk also learns prefixes from people whose plant is already known.',canon:null,seed:{}}
};
function akey(s){return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function aliasKeyFor(kind,raw){return kind==='plantprefix'?String(raw||'').toUpperCase().replace(/[^A-Z0-9\-]/g,''):akey(raw)}
function aliasGet(kind,raw){
  var k=aliasKeyFor(kind,raw);if(!k)return null;
  var sv=S.alias[kind];if(sv&&Object.prototype.hasOwnProperty.call(sv,k))return sv[k]==='-'?null:sv[k];
  var sd=ALIAS_KINDS[kind].seed;return sd&&Object.prototype.hasOwnProperty.call(sd,k)?sd[k]:null;
}
function aliasRows(kind){
  var rows=[],sv=S.alias[kind]||{},sd=ALIAS_KINDS[kind].seed||{};
  Object.keys(sd).forEach(function(k){var v=Object.prototype.hasOwnProperty.call(sv,k)?sv[k]:sd[k];rows.push({k:k,v:v,src:Object.prototype.hasOwnProperty.call(sv,k)?'edited':'seed'})});
  Object.keys(sv).forEach(function(k){if(!Object.prototype.hasOwnProperty.call(sd,k))rows.push({k:k,v:sv[k],src:'saved'})});
  return rows.sort(function(a,b){return a.k<b.k?-1:1});
}
function ingestAliases(docs){
  var next={category:{},zone:{},designation:{},salesperson:{},warehouse:{},plantprefix:{}};
  (docs||[]).forEach(function(x){var m=/^alias_(\w+)$/.exec(x._id||'');if(m&&next[m[1]]&&x.map&&typeof x.map==='object')next[m[1]]=x.map});
  var changed=JSON.stringify(next)!==JSON.stringify(S.alias);S.alias=next;
  if(changed)onAliasChange();
}
function onAliasChange(){
  try{SM.cache={};if(DS.ready){rebuildMaps();DS.ver++;DS.cache={}}}catch(e){}
  S.lastHtml='';S.engSig=null;schedule();
}
async function aliasSave(kind,key,val){
  if(!superOnly('edit alias tables'))return false;
  var k=aliasKeyFor(kind,key);if(!k||val==null||String(val).trim()===''){toast('Both sides are needed');return false}
  var map=Object.assign({},S.alias[kind]||{});map[k]=String(val).trim();
  try{await dset('settings/alias_'+kind,{map:map,at:nowISO(),by:whoAmI()});S.alias[kind]=map;onAliasChange();return true}
  catch(e){toast('Not saved: '+dbErrText(e));return false}
}
async function aliasDel(kind,key){
  if(!superOnly('edit alias tables'))return;
  var map=Object.assign({},S.alias[kind]||{}),sd=ALIAS_KINDS[kind].seed||{};
  if(Object.prototype.hasOwnProperty.call(sd,key))map[key]='-';else delete map[key];
  try{await dset('settings/alias_'+kind,{map:map,at:nowISO(),by:whoAmI()});S.alias[kind]=map;onAliasChange()}catch(e){toast('Not saved: '+dbErrText(e))}
}

/* ---- category, zone, junk ---- */
function catGroupAlias(cat){var a=aliasGet('category',cat);if(a==null)return undefined;return a==='Out of scope'?null:a}
function zoneNorm(raw){
  var s=String(raw==null?'':raw).trim();if(!s)return {z:'',known:true,blank:true};
  var a=aliasGet('zone',s);if(a&&ZONE_CANON.indexOf(a)>=0)return {z:a,known:true,via:'alias'};
  var c=s.toUpperCase().replace(/[^A-Z0-9]/g,''),m=/^ZONE0*([1-9])$/.exec(c);if(m)return {z:'ZONE'+m[1],known:true,via:s.toUpperCase()==='ZONE'+m[1]?'':'rule'};
  if(ZONE_CANON.indexOf(c)>=0)return {z:c,known:true,via:s.toUpperCase()===c?'':'rule'};
  return {z:c,known:false};
}
function isJunk(v){var s=String(v==null?'':v).trim();if(!s)return false;return s.length<=2||/^[^a-z0-9]+$/i.test(s)||/^(z+|x+)$/i.test(s)||/^(null|none|n\/?a|na|test|nil)$/i.test(s)}
function ownNames(){return String(CFG.own_company_names||'').split(/[,;]+/).map(function(x){return x.trim().toUpperCase()}).filter(Boolean)}

/* ---- employee ids, designations, plant prefixes ---- */
function normEmpId(c){
  var s=String(c==null?'':c).trim();if(!s)return '';
  var m=/^([A-Za-z]+-[A-Za-z]+)\s*\/\s*0*(\d{1,6})$/.exec(s);/* only the slash form is rewritten; E-XXX-0123 is already the target form */
  if(m)return m[1].toUpperCase()+'-'+pad(m[2],4);
  return s;
}
function idPrefix(c){var m=/^(.*?)[\/\-]\s*\d+$/.exec(String(c||'').trim());return m?m[1].toUpperCase():''}
function learnPrefixes(people){
  /* people: arrays [code,name,zone,plant,...]; majority plant per prefix among people whose plant is known */
  var t={};
  people.forEach(function(p){var pf=idPrefix(p[0]),pl=p[3];if(!pf||!pl)return;(t[pf]=t[pf]||{})[pl]=(t[pf][pl]||0)+1});
  var out={};Object.keys(t).forEach(function(pf){var best=null,tot=0;Object.keys(t[pf]).forEach(function(pl){tot+=t[pf][pl];if(!best||t[pf][pl]>t[pf][best])best=pl});if(t[pf][best]/tot>=0.6)out[pf]={plant:best,n:t[pf][best],of:tot}});
  return out;
}
function prefixPlant(pf,learned){var a=aliasGet('plantprefix',pf);if(a)return {plant:a,how:'edited table'};var l=learned[pf];return l?{plant:l.plant,how:'learned from '+l.n+' of '+l.of+' people'}:null}
function desCanonMap(rawList){
  /* seed and edited aliases first; otherwise group spellings that differ only in case, spacing or punctuation and keep the most frequent */
  var cnt={},groups={},out={};
  rawList.forEach(function(d){if(!d)return;cnt[d]=(cnt[d]||0)+1});
  Object.keys(cnt).forEach(function(d){var a=aliasGet('designation',d);if(a){out[d]={to:a,via:'alias'};return}var k=akey(d).replace(/\s/g,'');(groups[k]=groups[k]||[]).push(d)});
  Object.keys(groups).forEach(function(k){var g=groups[k].sort(function(a,b){return cnt[b]-cnt[a]||(a<b?-1:1)}),best=g[0];g.forEach(function(d){out[d]={to:best,via:d===best?'':'spelling'}})});
  return out;
}

/* ---- sales-person name matching: aliases, spacing, initials, edit distance ---- */
function compactKey(s){return nameKey(splitSuffix(s)[0]).replace(/\s+/g,'')}
function tokensOf(s){return nameKey(splitSuffix(s)[0]).split(' ').filter(Boolean)}
function editDist(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  var prev=[],cur=[],i,j;for(j=0;j<=b.length;j++)prev[j]=j;
  for(i=1;i<=a.length;i++){cur[0]=i;var rowMin=cur[0];for(j=1;j<=b.length;j++){cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));if(cur[j]<rowMin)rowMin=cur[j]}if(rowMin>max)return max+1;var t=prev;prev=cur;cur=t}
  return prev[b.length];
}
function initialsMatch(ta,tb){
  if(ta.length!==tb.length||ta.length<2)return false;var init=false;
  for(var i=0;i<ta.length;i++){var a=ta[i],b=tb[i];if(a===b)continue;if(a.length===1&&b[0]===a){init=true;continue}if(b.length===1&&a[0]===b){init=true;continue}return false}
  return init;
}
function fuzzyMatch(raw){
  /* Only a deterministic tidy-up is applied automatically: the same name written with different case, spacing or punctuation
     (compact keys equal), and only when it picks one person. Initials and close spellings are SUGGESTIONS (spSuggest): they
     never change whose sales a figure or a Sales executive's scope shows until a Super admin saves them as an alias. */
  var cp=compactKey(raw);if(!cp)return null;
  var hit=SM.list.filter(function(p){return compactKey(p.name)===cp||(p.b1name&&compactKey(p.b1name)===cp)}),o={},u=[];
  hit.forEach(function(p){if(!o[p.code]){o[p.code]=1;u.push(p)}});
  if(u.length===1)return {p:u[0],how:'spacing or punctuation'};
  return u.length>1?{ambiguous:true}:null;
}
function spSuggest(raw,n){
  var cp=compactKey(raw),ta=tokensOf(raw),out=[];
  SM.list.forEach(function(p){
    var pc=compactKey(p.name),d=editDist(cp,pc,6),tb=tokensOf(p.name),ov=0;
    ta.forEach(function(t){if(tb.indexOf(t)>=0)ov++});
    var ini=initialsMatch(ta,tb),score=d<=6?(10-d):0;score+=ov*3;if(ini)score+=6;
    if(score>=5)out.push({code:p.code,name:p.name,plant:p.plant||'',score:score,why:ini?'initials':d<=2&&cp.length>=8?'close spelling':ov?'shared words':'similar'});
  });
  return out.sort(function(a,b){return b.score-a.score}).slice(0,n||3);
}

/* ---- panel ---- */
function fixesPanel(items,title){
  items=items.filter(Boolean);
  var nf=items.filter(function(x){return x.st==='fixed'}).length,nn=items.filter(function(x){return x.st==='need'}).length,ns=items.filter(function(x){return x.st==='sugg'}).length;
  var pill={fixed:['ok','Fixed'],need:['miss','Needs the source'],info:['mute','Note'],sugg:['part','Your call']};
  return '<details class="strip fixes" open><summary>'+esc(title||'Fixes applied')+' · '+nf+' fixed'+(ns?' · '+ns+' for you to decide':'')+' · '+nn+' need the source</summary><div class="tw"><table><thead><tr><th>Status</th><th>What</th><th class="num">Count</th><th>Detail</th></tr></thead><tbody>'
   +items.map(function(x){return '<tr><td><span class="pill '+pill[x.st][0]+'">'+pill[x.st][1]+'</span></td><td>'+esc(x.t)+'</td><td class="num">'+(x.n==null?'':fmtN(x.n))+'</td><td class="break">'+(x.d||'')+'</td></tr>'}).join('')
   +'</tbody></table></div></details>';
}
function mapRow(kind,raw,n,idx){
  var K=ALIAS_KINDS[kind];
  return '<tr><td class="break">'+esc(raw)+'</td><td class="num">'+fmtN(n)+'</td><td><select id="afm-'+kind+'-'+idx+'" class="in">'+K.canon.map(function(c){return '<option>'+esc(c)+'</option>'}).join('')+'</select></td><td><button class="btn sm" data-act="af-map" data-kind="'+kind+'" data-i="'+idx+'" data-raw="'+esc(raw)+'">Save mapping</button></td></tr>';
}
function mapTable(kind,obj,head){
  var ks=Object.keys(obj).sort(function(a,b){return obj[b]-obj[a]}).slice(0,15);
  if(!ks.length)return '';
  return '<div class="tw" style="max-height:200px;overflow:auto"><table><thead><tr><th>'+esc(head)+'</th><th class="num">Rows</th><th>Map to</th><th></th></tr></thead><tbody>'+ks.map(function(k,i){return mapRow(kind,k,obj[k],i)}).join('')+'</tbody></table></div>'+(Object.keys(obj).length>15?'<div class="note">'+(Object.keys(obj).length-15)+' more not shown.</div>':'');
}
function sugRows(names,lines){
  return names.map(function(nm,i){
    var s=spSuggest(nm,3);
    return '<tr><td class="break">'+esc(nm)+'</td><td class="num">'+fmtN(lines[nm]||0)+'</td><td>'+(s.length?s.map(function(x){return '<button class="btn sm" data-act="af-sp" data-raw="'+esc(nm)+'" data-code="'+esc(x.code)+'" title="Looks like a match by '+esc(x.why)+'. Saves an alias; only a Super admin can confirm it.">'+esc(x.name)+(x.plant?' · '+esc(x.plant):'')+' <span class="note">('+esc(x.why)+')</span></button>'}).join(' '):'<span class="note">no close match; add the person or the B1 name in the master</span>')+'</td></tr>';
  }).join('');
}
function sugTable(names,lines){
  if(!names.length)return '';
  return '<div class="tw" style="max-height:220px;overflow:auto"><table><thead><tr><th>Name in the sales data</th><th class="num">Lines</th><th>Suggestions only. Click the right person to confirm it as an alias</th></tr></thead><tbody>'+sugRows(names.slice(0,25),lines)+'</tbody></table></div>'+(names.length>25?'<div class="note">'+(names.length-25)+' more names not shown.</div>':'');
}

/* ---- invoice upload: panel ---- */
function invoiceFixes(r){
  var af=r.af||{},it=[],fmtK=af.dateKinds||{};
  it.push({st:'info',t:'File layout',n:null,d:esc((U.sys==='B1'?'SAP B1 Combine Sale':'SAP S/4HANA Sales Register')+(U.sheetPicked?', sheet "'+U.sheetPicked+'"':'')+'. '+U.rows.length.toLocaleString('en-IN')+' data rows.')});
  var kinds=[['serial','date cells'],['text','text dd/mm/yyyy'],['iso','text YYYY-MM-DD']].filter(function(k){return fmtK[k[0]]}).map(function(k){return fmtK[k[0]].toLocaleString('en-IN')+' '+k[1]}).join(', ');
  it.push({st:r.dateInfo.mixed?'fixed':'info',t:r.dateInfo.mixed?'Dates: day and month swapped back':'Dates read',n:r.dateInfo.mixed?r.dateInfo.swapped:null,d:esc((kinds||'none')+'. Range '+(r.minDate||'-')+' to '+(r.maxDate||'-')+'.')+(r.dateInfo.mixed?' Confirm the range below before loading.':'')+(r.dateInfo.unfixable?' <b>'+r.dateInfo.unfixable+' could not be repaired and are rejected.</b>':'')});
  if(r.exp)it.push({st:r.af.dateFixed?'fixed':'info',t:r.af.dateFixed?'Dates corrected to '+ymLabel(r.exp):'Expected month',n:r.af.dateFixed||null,d:esc(ymLabel(r.exp)+' ('+expSourceText(r)+'). '+(r.af.dateFixed?'These dates fell outside it as read; reading day and month the other way round put them inside, so they were stored as that date.':'No date needed correcting.'))});
  if(r.preHist&&r.preHist.rows)it.push({st:'info',t:'Before history start ('+qLabel(histStart())+')',n:r.preHist.rows,d:'Not loaded and not rejected; no action needed (D28).'});
  if(r.noLineCol)it.push({st:'fixed',t:'No LineNum column: line numbers created',n:af.lineSynth||0,d:'Numbered 1, 2, 3 ... in file row order within each document, so the same file always gives the same numbers.'});
  if(af.dupNoLine)it.push({st:'fixed',t:'Repeated lines removed (same document, item, quantity and value)',n:af.dupNoLine,d:'Only because the file has no LineNum. If a document genuinely has two identical lines, add LineNum to the saved query.'});
  if(U.sys==='B1'){
    var hx=headerIndex(U.headers),noSlp=!('slpcode' in hx),noWhs=!('whscode' in hx);
    if(noSlp||noWhs)it.push({st:'info',t:(noSlp?'SlpCode':'')+(noSlp&&noWhs?' and ':'')+(noWhs?'WhsCode':'')+' not in the file',n:null,d:'Salespeople are matched by name and the plant by branch name. Adding the columns makes both exact.'});
  }
  /* transfers */
  it.push({st:'info',t:'Internal transfers flagged (excluded from sales)',n:r.xfer.rows,d:esc(fmtN(r.xferMaster)+' by the Admin transfer list; the rest by account or zone rule.')});
  var xs=Object.keys(af.xferSuggest||{});
  if(xs.length){
    xs.sort(function(a,b){return af.xferSuggest[b].value-af.xferSuggest[a].value});
    it.push({st:'sugg',t:'Customers named like the Virgo group, counted as sales',n:xs.length,d:'<div class="tw" style="max-height:200px;overflow:auto"><table><thead><tr><th>CardCode</th><th>Name</th><th class="num">Rows</th><th class="num">Net value</th><th></th></tr></thead><tbody>'+xs.slice(0,20).map(function(c){var o=af.xferSuggest[c];return '<tr><td class="mono">'+esc(c)+'</td><td class="break">'+esc(o.name)+'</td><td class="num">'+fmtN(o.rows)+'</td><td class="num">'+fmtMoney(o.value)+'</td><td><button class="btn sm" data-act="af-xf" data-code="'+esc(c)+'" data-name="'+esc(o.name)+'">Add to transfer list</button></td></tr>'}).join('')+'</tbody></table></div><div class="row" style="margin-top:6px"><button class="btn sm pri" data-act="af-xf-all">Add all '+xs.length+'</button><span class="note">Suggestions only: nothing is added until you click.</span></div>'});
  }
  /* category */
  if(af.catAlias)it.push({st:'fixed',t:'Category spellings normalised through the alias table',n:af.catAlias,d:esc(af.catSpellings+' spelling'+(af.catSpellings===1?'':'s')+' seen. Edit in Admin › Aliases.')});
  var cu=af.catUnknown||{};
  if(Object.keys(cu).length)it.push({st:'sugg',t:'Categories outside the four groups, not mapped',n:Object.keys(cu).reduce(function(a,k){return a+cu[k]},0),d:'<div class="note">Rows stay in the record. Map a category to a group to bring it in, or to Out of scope to stop listing it.</div>'+mapTable('category',cu,'Category in the file')});
  if(af.catBlank)it.push({st:'need',t:'Category blank',n:af.catBlank,d:'The item is not in the item master. Add the item in SAP (or the item master upload), then reload.'});
  /* zone and junk */
  if(af.zoneNorm)it.push({st:'fixed',t:'Zone spellings normalised',n:af.zoneNorm,d:esc(af.zoneSpellings+' spellings seen.')});
  var zu=af.zoneUnknown||{};
  if(Object.keys(zu).length)it.push({st:'sugg',t:'Zone values not recognised',n:Object.keys(zu).reduce(function(a,k){return a+zu[k]},0),d:mapTable('zone',zu,'Zone in the file')});
  var jk=af.junk||{};
  if(jk.zone||jk.pos)it.push({st:'info',t:'Junk values counted, used nowhere',n:(jk.zone||0)+(jk.pos||0),d:esc('Zone '+(jk.zone||0)+', Place of Supply '+(jk.pos||0)+'. Clean the masters in SAP when convenient.')});
  if(af.junkRows)it.push({st:'need',t:'Rows with a junk Invoice Type skipped (not rejected)',n:af.junkRows,d:esc('Value '+fmtMoney(af.junkValue||0)+' not loaded. The Invoice Type is a stray character such as "z"; correct it in SAP and reload if these are real invoices.')});
  /* salespeople */
  if(af.spNames){
    var names=Object.keys(af.spNames).filter(Boolean),un=[],mt=0,viaFuzzy=0;
    names.forEach(function(n){var m=spMatch(n);if(m&&!m.ambiguous){mt++;if(m.how&&/spacing|alias/.test(m.how))viaFuzzy++}else un.push(n)});
    if(SM.ready){
      it.push({st:viaFuzzy?'fixed':'info',t:'Salesperson names matched to the sales-employee master',n:mt,d:esc(mt+' of '+names.length+' names ('+(names.length?(mt/names.length*100).toFixed(1):'0')+'%).'+(viaFuzzy?' '+viaFuzzy+' matched through case, spacing, punctuation or a saved alias. Initials and close spellings are only suggested below until you confirm them.':''))});
      if(un.length){un.sort(function(a,b){return af.spNames[b]-af.spNames[a]});it.push({st:'sugg',t:'Salesperson names with no match',n:un.length,d:sugTable(un,af.spNames)})}
    }else if(names.length)it.push({st:'need',t:'No sales-employee master loaded',n:names.length,d:'Load the master in Admin › Sales employees so names can be matched.'});
  }
  /* S/4 */
  if(U.sys==='S4'){
    if(r.fanout)it.push({st:'fixed',t:'S/4 repeated rows removed (same document and item)',n:r.fanout,d:'The report repeats each line once per price group.'});
    if(af.blankSp){
      var lk=af.link||{};
      if(af.spFilled)it.push({st:'fixed',t:'Sales Executive empty: salesperson taken from the customer\'s B1 sales',n:af.spFilled,d:esc(af.spFilled+' rows filled from '+lk.matched+' customers found in loaded B1 sales (the salesperson with the largest B1 value).')+(af.spUnlinked?' '+af.spUnlinked+' rows have a customer not found in B1.':'')});
      else it.push({st:'need',t:'Sales Executive empty and cannot be filled from B1',n:af.blankSp,d:esc(lk.why||'No B1 sales are loaded to link from.')+' The S/4 report needs the sales-employee partner function added.'});
    }
    it.push({st:'need',t:'Credit memos are absent from the S/4 register',n:null,d:'Net sales are overstated until credit-memo billing types are added to the report (check Q-D4).'});
  }else it.push({st:'need',t:'Credit notes are not in this export',n:null,d:'Net sales are overstated by the value of credit notes until a credit-note export is loaded (not built yet).'});
  /* history */
  var g=gridQuarters(),miss=g.list.filter(function(k){return k!==g.cur&&covStatus('INV',k).st==='miss'&&!(r.quarters&&r.quarters[k])});
  if(miss.length)it.push({st:'need',t:'Quarters with no history loaded',n:miss.length,d:esc(miss.map(qLabel).join(', ')+'. QoQ and the trend need them: export the missing months from SAP.')});
  return fixesPanel(it,'Fixes applied');
}

/* ---- B1 customer to salesperson link for S/4 (reads stored B1 chunks of the latest months) ---- */
async function buildB1Linker(custCodes){
  var cells=Object.keys(S.cells).filter(function(k){return /^INV_/.test(k)}).sort().reverse(),jobs=[];
  for(var i=0;i<cells.length&&jobs.length<40;i++){var c=S.cells[cells[i]];Object.keys(c.plants||{}).forEach(function(p){var x=c.plants[p];if(x.sys==='B1'&&jobs.length<40)jobs.push({p:p,ym:c.ym,info:x})})}
  var map=new Map(),nB1=0;
  for(var j=0;j<jobs.length;j++){
    var jb=jobs[j];
    try{for(var k=0;k<(jb.info.chunks||0);k++){var snap=await dget('inv/B1-'+jb.p+'-'+jb.ym+'-'+k);if(!snap.exists)continue;var o=JSON.parse(await ungz(snap.data().z));
      o.a.forEach(function(r){if(r[4]||!r[2])return;var e=map.get(r[0]);if(!e){e={};map.set(r[0],e);nB1++}e[r[2]]=(e[r[2]]||0)+r[9]})}}catch(e){}
  }
  var best=new Map(),matched=0;
  custCodes.forEach(function(cc){var e=map.get(cc);if(!e)return;var top=null;Object.keys(e).forEach(function(s){if(!top||e[s]>e[top])top=s});best.set(cc,top);matched++});
  var ex=Array.from(custCodes).slice(0,2).join(', '),bx=Array.from(map.keys()).slice(0,2).join(', ');
  return {map:best,matched:matched,b1Customers:nB1,
    why:!jobs.length?'No B1 sales are loaded to link from.':(matched?'':'Customer codes cannot be linked: S/4 codes ('+ex+') are not B1 CardCodes ('+bx+'), and the Desk stores no GSTIN to link on.')};
}

/* ---- sales-employee file: panel ---- */
function sempFixes(r){
  var f=r.fx||{},it=[];
  it.push({st:'info',t:'File layout',n:null,d:esc((r.s4?'S/4 workforce CSV':'Sales Employee Master workbook')+', '+(r.sheets||[]).join(', '))});
  if(f.ids)it.push({st:'fixed',t:'Employee IDs normalised (E-XXX/123 becomes E-XXX-0123)',n:f.ids,d:'The old spelling is kept as an alternate code, so earlier references still match.'});
  if(f.plantInferred)it.push({st:'fixed',t:'Plant filled from the ID prefix',n:f.plantInferred,d:esc((f.prefixes||[]).slice(0,8).map(function(x){return x.pf+' → '+x.plant+' ('+x.how+')'}).join('; '))+' Edit prefixes in Admin › Aliases.'});
  if(f.desFixed)it.push({st:'fixed',t:'Designation spellings normalised',n:f.desFixed,d:esc(f.desFrom+' spellings became '+f.desTo+'.')+' Edit in Admin › Aliases.'});
  if(f.noPlant)it.push({st:'need',t:'People still without a plant',n:f.noPlant,d:'Listed below. Fill the plant in the source file (*CompanyCode or Plant Name).'});
  if(f.noDes)it.push({st:'need',t:'People without a designation',n:f.noDes,d:'Add the designation in the source file.'});
  if(r.warn&&r.warn.noEmail)it.push({st:'need',t:'No email address',n:r.warn.noEmail,d:'The Desk cannot sign them in until an email is on the record. Fill Email in the source file.'});
  it.push({st:'need',t:'The Desk cannot read viewers\' email addresses',n:null,d:'A new user is added by Viewer ID once (Admin › Users › Viewer ID). This cannot be fixed from our side.'});
  if(r.match&&r.match.names){
    var un=(r.unmatched||[]).map(function(u){return u.name}),lines={};(r.unmatched||[]).forEach(function(u){lines[u.name]=u.lines});
    it.push({st:r.matchBefore&&r.match.rate>r.matchBefore.rate?'fixed':'info',t:'B1 salesperson names matched',n:r.match.matched,d:esc('Match rate '+(r.match.rate!=null?r.match.rate.toFixed(1):'-')+'% of '+r.match.names+' names'+(r.matchBefore&&r.matchBefore.rate!=null?' (before this file: '+r.matchBefore.rate.toFixed(1)+'%)':'')+'.')});
    if(un.length)it.push({st:'sugg',t:'Names still unmatched',n:un.length,d:'<div class="note">Suggestions come from the people in this file. Saved aliases apply at once.</div>'+sugTable(un,lines)});
  }
  return fixesPanel(it,'Fixes applied');
}

/* ---- handlers ---- */
Object.assign(handlers,{
 'af-map':async function(t){
   var kind=t.getAttribute('data-kind'),raw=t.getAttribute('data-raw'),i=t.getAttribute('data-i'),sel=document.getElementById('afm-'+kind+'-'+i);
   if(!sel)return;if(await aliasSave(kind,raw,sel.value)){toast('Saved: '+raw+' → '+sel.value);if(U&&(U.stage==='validated'||U.stage==='done')){U.stage='validating';U.progressMsg='Checking again with the new mapping...';renderUpload();await runValidation();await afterValidate()}else if(S.mst.items&&S.mst.items.stage==='checked'&&S.mst.items.src){await itemParse()}}
 },
 'af-sp':async function(t){
   var raw=t.getAttribute('data-raw'),code=t.getAttribute('data-code');
   if(await aliasSave('salesperson',raw,code)){toast('Saved: '+raw+' → '+code);S.lastHtml='';if(U&&U.stage==='validated')renderUpload();schedule();var m=S.mst&&S.mst.semp;if(m&&m.stage==='checked'){await sempCheck()}}
 },
 'af-xf':async function(t){
   if(!superOnly('add to the transfer list'))return;
   var c=(t.getAttribute('data-code')||'').toUpperCase();await dset('transfers/'+slug(c),{code:c,name:t.getAttribute('data-name')||'',flag:true,added_by_suggestion:true});toast('Added '+c+' to the transfer list');
   if(U&&(U.stage==='validated'||U.stage==='done')){U.stage='validating';renderUpload();await runValidation();await afterValidate()}
 },
 'af-xf-all':async function(){
   if(!superOnly('add to the transfer list')||!U||!U.res)return;var xs=U.res.af.xferSuggest||{},ks=Object.keys(xs);
   for(var i=0;i<ks.length;i++)await dset('transfers/'+slug(ks[i].toUpperCase()),{code:ks[i].toUpperCase(),name:xs[ks[i]].name,flag:true,added_by_suggestion:true});
   toast('Added '+ks.length+' accounts to the transfer list');U.stage='validating';renderUpload();await runValidation();await afterValidate();
 },
 'u-load-as-transfers':async function(){
   if(!superOnly('load the transfer list')||!U||!U.offer)return;var f=U.offer;S.upMsg='';await masterUpload('transfers',f.file,f.rows);
   var done=S.upMsg||'';U=newU();U.transferDone='<div class="banner ok"><span>Loaded as the Internal-transfer list.</span></div>'+done;renderUpload();
 },
 'al-add':async function(t){
   var kind=t.getAttribute('data-kind'),a=document.getElementById('al-r-'+kind),b=document.getElementById('al-c-'+kind);if(!a||!b)return;
   if(await aliasSave(kind,a.value,b.value)){a.value='';if(b.tagName==='INPUT')b.value=''}
 },
 'al-del':function(t){return aliasDel(t.getAttribute('data-kind'),t.getAttribute('data-k'))}
});

/* ---- Admin › Aliases ---- */
function aliasesHtml(){
  var h='<section class="card"><div class="hd"><h2>Aliases and normalisations</h2></div><p class="note" style="margin:0">Every spelling table the auto-fix pass uses. Seeded with the current rules; Super admin edits. Each change is saved to the database and applies at the next check (names and prefixes apply at once). Nothing here changes stored data silently: uploads list what was fixed.</p></section>';
  Object.keys(ALIAS_KINDS).forEach(function(kind){
    var K=ALIAS_KINDS[kind],rows=aliasRows(kind);
    var inCanon=K.canon?'<select id="al-c-'+kind+'" class="in">'+K.canon.map(function(c){return '<option>'+esc(c)+'</option>'}).join('')+'</select>':'<input id="al-c-'+kind+'" class="in" placeholder="'+(kind==='plantprefix'||kind==='warehouse'?'plant code, e.g. 1012':kind==='salesperson'?'employee code':'designation')+'">';
    h+='<section class="card"><div class="hd"><h2>'+esc(K.label)+' &middot; '+rows.length+'</h2></div><p class="note" style="margin:0">'+esc(K.hint)+'</p>'
     +'<div class="row"><div class="fld"><label for="al-r-'+kind+'">'+(kind==='plantprefix'?'ID prefix':'Spelling in the file')+'</label><input id="al-r-'+kind+'" class="in"></div><div class="fld"><label for="al-c-'+kind+'">Becomes</label>'+inCanon+'</div><div class="fld"><label>&nbsp;</label><button class="btn pri sm" data-act="al-add" data-kind="'+kind+'">Add or change</button></div></div>'
     +(rows.length?'<div class="tw" style="max-height:260px;overflow:auto"><table><thead><tr><th>Spelling</th><th>Becomes</th><th>From</th><th></th></tr></thead><tbody>'+rows.map(function(x){return '<tr><td class="break">'+esc(x.k)+'</td><td class="break">'+esc(x.v==='-'?'(switched off)':x.v)+'</td><td><span class="pill '+(x.src==='seed'?'mute':'part')+'">'+x.src+'</span></td><td><button class="btn sm" data-act="al-del" data-kind="'+kind+'" data-k="'+esc(x.k)+'">'+(x.src==='seed'?'Switch off':'Remove')+'</button></td></tr>'}).join('')+'</tbody></table></div>':'<div class="empty sm">No rows yet.</div>');
    if(kind==='plantprefix'){var lp=learnPrefixes(SM.list.map(function(p){return [p.code,p.name,p.zone,p.plant]}));var ks=Object.keys(lp).sort();h+='<div class="note">Learned from the loaded master ('+ks.length+' prefixes): '+(ks.length?ks.slice(0,40).map(function(k){return esc(k+' → '+lp[k].plant)}).join(' · '):'none yet')+'</div>'}
    h+='</section>';
  });
  return h;
}

/* ---- sales-employee auto-fix pass: designations, plant from ID prefix, still-missing lists ---- */
function afSempPass(res,existing){
  var fx=res.fx=res.fx||{ids:0},ppl=res.people;
  var dm=desCanonMap(ppl.map(function(p){return p[5]})),rawSet={},toSet={};
  ppl.forEach(function(p){var d=p[5];if(!d)return;var m=dm[d];rawSet[d]=1;if(m&&m.to!==d){p[5]=m.to;fx.desFixed=(fx.desFixed||0)+1}toSet[p[5]]=1});
  fx.desFrom=Object.keys(rawSet).length;fx.desTo=Object.keys(toSet).length;
  /* role from the chosen designation, where the file gave none */
  ppl.forEach(function(p){var role=roleFromDesignation(p[5]);if(!p[6]||(fx.desFixed&&p[5]&&role))p[6]=role||p[6]});
  /* plant from the ID prefix, learned from people whose plant is known (this file plus the loaded master) */
  var known=ppl.concat((existing||[]).map(function(o){return [o.code,o.name,o.zone,o.plant]}));
  var learned=learnPrefixes(known),plantsOk={};S.plants.forEach(function(p){plantsOk[p.plant_code]=1});
  fx.plantInferred=0;fx.prefixes=[];var seenPf={};
  ppl.forEach(function(p){
    if(p[3])return;var pf=idPrefix(p[0]);if(!pf)return;var pp=prefixPlant(pf,learned);
    if(pp&&plantsOk[pp.plant]){p[3]=pp.plant;fx.plantInferred++;if(!seenPf[pf]){seenPf[pf]=1;fx.prefixes.push({pf:pf,plant:pp.plant,how:pp.how})}}
  });
  res.byRole={};res.unmappedDes={};res.byZone={};
  ppl.forEach(function(p){res.byRole[p[6]||'(no matching role)']=(res.byRole[p[6]||'(no matching role)']||0)+1;res.byZone[p[2]||'(none)']=(res.byZone[p[2]||'(none)']||0)+1;if(!p[6]&&p[5])res.unmappedDes[p[5]]=(res.unmappedDes[p[5]]||0)+1});
  /* only people who still lack a plant or designation are listed */
  var byCode={};ppl.forEach(function(p){byCode[norm(p[0])]=p});
  if(res.s4){res.needs=res.needs.filter(function(n){var p=byCode[norm(n[1])];return p&&(!p[3]||!p[5])}).map(function(n){var p=byCode[norm(n[1])];return [n[0],n[1],n[2],(!p[3]&&!p[5]?'needs plant and designation':!p[3]?'needs plant':'needs designation')]})}
  else{res.needs=ppl.filter(function(p){return !p[3]}).map(function(p){return ['',p[0],p[1],'needs plant']})}
  fx.noPlant=ppl.filter(function(p){return !p[3]}).length;fx.noDes=ppl.filter(function(p){return !p[5]}).length;
  res.warn=res.warn||{};res.warn.noPlant=fx.noPlant;
}

/* ---- item master upload: panel ---- */
function itemFixes(r){
  var it=[{st:'info',t:'File layout',n:null,d:esc('Sheet "'+r.sheet+'", '+fmtN(r.read)+' items read.')},
   {st:r.outOfScope?'info':'info',t:'Not laminates (counted, not stored)',n:r.outOfScope,d:'Kept out by item category; see the list below to bring a category in.'}];
  var cu=r.catUnknown||{};if(Object.keys(cu).length)it.push({st:'sugg',t:'Categories outside the four groups',n:Object.keys(cu).reduce(function(a,k){return a+cu[k]},0),d:'<div class="note">Map a category to a group to bring it in, or to Out of scope to stop listing it. The file is checked again after each click.</div>'+mapTable('category',cu,'Category in the file')});
  if(r.warn&&r.warn.noSize)it.push({st:'need',t:'Items without a readable size',n:r.warn.noSize,d:'Sheet counts and sq ft need the size. Add it in SAP.'});
  if(r.rejected)it.push({st:'need',t:'Rows rejected',n:r.rejected,d:'Blank or duplicate item codes. Listed below.'});
  return fixesPanel(it,'Fixes applied');
}

/* ================= D32 (21 Oct 2026): date sanity check, replace guard, Undo upload ================= */
var MONTH_ABBR=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function expectedMonthFromName(name){
  var n=String(name||''),m=/(20\d{2})[-_.](0[1-9]|1[0-2])(?:[-_.](?:0[1-9]|[12]\d|3[01]))?(?!\d)/.exec(n);
  if(m)return m[1]+'-'+m[2];
  m=/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_.\-]*(20\d{2})/i.exec(n);
  if(m)return m[2]+'-'+pad(MONTH_ABBR.indexOf(m[1].toLowerCase())+1,2);
  return '';
}
function histMonths(hist,total){return Object.keys(hist).filter(function(k){return total&&hist[k]/total>=0.005}).sort()}
function sanityOf(res,name){
  var hist=res.monthHist||{},total=0;Object.keys(hist).forEach(function(k){total+=hist[k]});
  return {hist:hist,total:total,months:histMonths(hist,total),future:0,exp:res.exp||'',reasons:[],hard:false,suspect:false,swapOffer:null};
}
function replaceRisk(r){
  var out={},list=[];
  if(!r||!r.pm)return list;
  r.pm.forEach(function(P){
    var c=S.cells['INV_'+P.ym],old=c&&c.plants&&c.plants[P.plant];if(!old||old.demo)return;
    var nl=0;P.agg.forEach(function(a){nl+=a[6]});
    if((old.lines||0)>nl){var o=out[P.ym]||(out[P.ym]={ym:P.ym,plants:0,oldLines:0,newLines:0,sys:{}});o.plants++;o.oldLines+=old.lines||0;o.newLines+=nl;if(old.sys)o.sys[old.sys]=1}
  });
  Object.keys(out).sort().forEach(function(k){list.push(out[k])});return list;
}
function canLoad(r,locked){
  if(!r||!(r.good>0)||locked)return false;
  var closedQs=Object.keys(r.quarters).filter(function(k){return S.periods[k]&&S.periods[k].status==='closed'});
  if(closedQs.length&&U.reason.trim().length<3)return false;
  if(replaceRisk(r).length&&!U.confirmReplace)return false;
  return true;
}
function expSourceText(r){
  var s=r.expSrc;
  if(s==='name')return 'from the file name';
  if(s==='majority')return 'the month holding most of the dates';
  if(s==='data')return 'the file name says '+ymLabel(r.nameConflict.name)+' but '+(r.nameConflict.share*100).toFixed(0)+'% of the dates are in '+ymLabel(r.exp)+', so '+ymLabel(r.exp)+' is used';
  if(s==='picked')return 'chosen by you';
  if(s==='any')return 'any month: rows are split by their own dates';
  return 'no single month holds most of the dates, so rows are split by their own dates';
}
function expPickerHtml(r,locked){
  var opts=[['auto','Automatic']].concat([['any','Any month (split by date)']]),lo=histLoYm(),cur=TODAY().slice(0,7),ms=ymRange(lo,cur).reverse();
  var sel=U.expMonth||'auto';
  opts=opts.concat(ms.map(function(m){return [m,ymLabel(m)]}));
  var out=Object.keys(r.reasons||{}).filter(function(k){return /^Date outside/.test(k)}).reduce(function(a,k){return a+r.reasons[k]},0);
  return '<div class="row" style="align-items:flex-end"><div class="fld"><label for="u-exp">Expected month</label><select id="u-exp" data-chg="expm" '+(locked?'disabled':'')+'>'+opts.map(function(o){return '<option value="'+esc(o[0])+'"'+(sel===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')+'</select></div>'
   +'<div class="note" style="flex:1">'+(r.exp?'<b>'+esc(ymLabel(r.exp))+'</b> &middot; ':'')+esc(expSourceText(r))+'.'+(r.af.dateFixed?' <b>'+fmtN(r.af.dateFixed)+' date'+(r.af.dateFixed===1?'':'s')+' corrected to '+esc(ymLabel(r.exp))+'</b> (day and month were the wrong way round).':'')+(out?' '+fmtN(out)+' row'+(out===1?'':'s')+' outside '+esc(ymLabel(r.exp))+' skipped.':'')+'</div></div>';
}
function sanityHtml(r,locked){
  var h=expPickerHtml(r,locked),sa=effRole()==='Super admin'&&!readOnly();
  var rk=replaceRisk(r);
  if(rk.length){
    h+='<div class="banner warn" style="display:block"><b>Safety check stopped this file: it would replace '+rk.reduce(function(a,x){return a+x.plants},0)+' plant-months that hold more lines than the new data.</b> (Not a rejected-rows issue.) Replaced data cannot be restored by the Desk; you would have to upload it again.'
     +'<div class="tw hscroll" style="max-height:200px;overflow:auto"><table><thead><tr><th>Month</th><th class="num">Plant-months</th><th class="num">Lines held now</th><th class="num">Lines in this file</th></tr></thead><tbody>'+rk.map(function(x){return '<tr><td>'+esc(ymLabel(x.ym))+'</td><td class="num">'+x.plants+'</td><td class="num">'+fmtN(x.oldLines)+'</td><td class="num">'+fmtN(x.newLines)+'</td></tr>'}).join('')+'</tbody></table></div>'
     +'<label class="chip" style="margin-top:8px"><input type="checkbox" data-chg="confrep" '+(U.confirmReplace?'checked':'')+' '+(sa&&!locked?'':'disabled')+'> I confirm: replace these months ('+rk.map(function(x){return ymLabel(x.ym)}).join(', ')+')</label></div>';
  }
  return h;
}

/* ---- Undo upload ---- */
function undoPlan(uid){
  var u=S.uploads.find(function(x){return x._id===uid});if(!u)return null;
  var mine={},n=0;
  Object.keys(S.cells).forEach(function(k){var c=S.cells[k];if(c.entity!=='INV')return;Object.keys(c.plants||{}).forEach(function(p){var x=c.plants[p];if(x.upload===uid){(mine[c.ym]=mine[c.ym]||[]).push(p);n++}})});
  var aId=actionIdOf('R5',[uid,'upload']);
  return {u:u,mine:mine,months:Object.keys(mine).sort(),n:n,later:Math.max(0,(u.plantMonths||0)-n),actId:aId,act:S.actions.find(function(a){return a.id===aId}),fus:S.followups.filter(function(f){return f.action_id===aId})};
}
function undoDialog(uid){
  var us=S.uploads.find(function(x){return x._id===uid});
  if(us&&us.entity==='ST'){var sp=stockUndoPlan(uid);
    openDlg('<h3>Undo stock upload '+esc(uid)+'</h3><p class="note" style="margin:0">'+esc(us.file||'')+' &middot; '+esc(istStr(us.at))+' &middot; '+esc(us.by||'')+'</p><div class="banner warn" style="display:block"><b>'+(sp?'Removes the stock snapshot as on '+esc(sp.as_of)+' ('+sp.plants+' plants)':'This upload no longer holds a snapshot (a later upload for the same date replaced it)')+'</b> with its item rows. The upload stays in history marked Undone, and the undo is logged.</div><p><b>Upload again afterwards:</b> '+(sp?'the stock file as on '+esc(sp.as_of):'nothing')+'.</p><p class="note">Undo cannot bring back an earlier snapshot for the same date that this upload replaced.</p><div class="row"><button class="btn pri" data-act="undo-go" data-id="'+esc(uid)+'">Undo this upload</button><button class="btn" data-act="dlg-close">Cancel</button></div><div id="d-err"></div>');return}
  var pl=undoPlan(uid);if(!pl)return;
  var u=pl.u,sa=effRole()==='Super admin'&&!readOnly();
  openDlg('<h3>Undo upload '+esc(uid)+'</h3><p class="note" style="margin:0">'+esc(u.file||'')+' &middot; '+esc(istStr(u.at))+' &middot; '+esc(u.by||'')+'</p>'
   +'<div class="banner warn" style="display:block"><b>Removes '+pl.n+' plant-month'+(pl.n===1?'':'s')+' in '+pl.months.length+' month'+(pl.months.length===1?'':'s')+'</b> that still point to this upload: their stored invoice chunks, cells entries and roll-up documents. Also its rejected-rows record'+(pl.act?', its action':'')+(pl.fus.length?' and '+pl.fus.length+' follow-up draft'+(pl.fus.length===1?'':'s'):'')+'. The upload stays in history marked Undone, and the undo is logged.</div>'
   +'<p><b>Months to upload again afterwards:</b> '+(pl.months.length?esc(pl.months.map(ymLabel).join(', ')):'none')+'.</p>'
   +'<p class="note">Undo cannot bring back what this upload replaced. Any month it overwrote lost its earlier figures, so upload those months again. Months it created are simply removed. '+(pl.later?pl.later+' plant-month'+(pl.later===1?'':'s')+' written by this upload were already replaced by a later upload; those are left alone. ':'')+(u.closedQuarters&&u.closedQuarters.length?'Quarters it closed ('+esc(u.closedQuarters.map(qLabel).join(', '))+') stay closed; reopen them in the coverage grid if needed. ':'')+'</p>'
   +'<div class="row"><button class="btn pri" data-act="undo-go" data-id="'+esc(uid)+'" '+(sa&&pl.n+(pl.act?1:0)+pl.fus.length>=0?'':'disabled')+'>Undo this upload</button><button class="btn" data-act="dlg-close">Cancel</button></div><div id="d-err"></div>');
}
async function undoUpload(uid){
  if(!superOnly('undo an upload'))return;
  var us=S.uploads.find(function(x){return x._id===uid});
  if(us&&us.entity==='ST'){var sp=stockUndoPlan(uid);try{await stockUndo(uid);closeDlg();openDlg('<h3>Stock upload '+esc(uid)+' undone</h3><p>'+(sp?'Removed the snapshot as on '+esc(sp.as_of)+'. <b>Upload that stock file again if you still need it.</b>':'Nothing was left to remove.')+'</p><div class="row"><button class="btn pri" data-act="dlg-close">Close</button></div>')}catch(e){var el0=$('#d-err');if(el0)el0.innerHTML='<div class="banner err">Undo stopped: '+esc(dbErrText(e))+'.</div>'}return}
  var pl=undoPlan(uid);if(!pl)return;
  var jobs=[],months=pl.months.slice(),sets=[];
  pl.months.forEach(function(ym){
    var c=JSON.parse(JSON.stringify(S.cells['INV_'+ym]));
    pl.mine[ym].forEach(function(p){var x=c.plants[p];for(var i=0;i<(x.chunks||0);i++)jobs.push('inv/'+x.sys+'-'+p+'-'+ym+'-'+i);if(S.rollDocs[p+'-'+ym])jobs.push('roll/'+p+'-'+ym);delete c.plants[p]});
    sets.push([ym,c]);
  });
  var toast0=function(m){toast(m)};toast0('Undoing '+uid+': removing '+pl.n+' plant-months...');
  try{
    /* cells first, so the roll-up rebuilder never sees a month with chunks and no roll */
    for(var i=0;i<sets.length;i++){var ym=sets[i][0],c=sets[i][1];if(Object.keys(c.plants).length)await dset('cells/INV_'+ym,c);else await ddel('cells/INV_'+ym)}
    var q=jobs.slice();await Promise.all([0,1,2,3,4].map(async function(){while(q.length){var path=q.shift();await ddel(path)}}));
    await ddel('rejects/'+uid);
    if(pl.act)await ddel('actions/'+pl.act._id);
    for(var f=0;f<pl.fus.length;f++)await ddel('followups/'+pl.fus[f]._id);
    var up=Object.assign({},S.uploads.find(function(x){return x._id===uid}));delete up._id;
    await dset('uploads/'+uid,Object.assign(up,{status:'Undone',undone_at:nowISO(),undone_by:whoAmI(),undone_months:months,undone_plant_months:pl.n}));
    await auditW('upload undone','',{upload:uid,file:(up.file||'').slice(0,120),months:months,plant_months:pl.n});
    await dset('log/l'+Date.now().toString(36),{at:nowISO(),by:whoAmI(),event:'upload undone',upload:uid,months:months,plant_months:pl.n});
    closeDlg();
    openDlg('<h3>Upload '+esc(uid)+' undone</h3><p>Removed '+pl.n+' plant-month'+(pl.n===1?'':'s')+'. <b>Upload these months again:</b> '+(months.length?esc(months.map(ymLabel).join(', ')):'none')+'.</p><div class="row"><button class="btn pri" data-act="dlg-close">Close</button></div>');
  }catch(e){var el=$('#d-err');if(el)el.innerHTML='<div class="banner err">Undo stopped: '+esc(dbErrText(e))+'. Nothing else was changed; run it again.</div>'}
}
Object.assign(handlers,{
 'hist-undo':function(t){undoDialog(t.getAttribute('data-id'))},
 'undo-go':function(t){return undoUpload(t.getAttribute('data-id'))},
 'u-swap-serial':async function(){if(!U||!U.res)return;U.swapSerial=true;U.stage='validating';U.progressMsg='Reading date cells swapped...';renderUpload();await runValidation()},
 'u-unswap':async function(){if(!U||!U.res)return;U.swapSerial=false;U.stage='validating';renderUpload();await runValidation()}
});

/* ================= D33 (21 Oct 2026, Vijay): skipped rows never block; good rows load at once ================= */
function histStatusPill(u){
  var st=u.status,sk=u.rejected||0;
  if((st==='Loaded'||(st==='Partial'&&!u.stopped&&u.entity!=='INV'))&&sk>0)return '<span class="pill ok">Loaded &middot; '+fmtN(sk)+' row'+(sk===1?'':'s')+' skipped</span>';
  if(st==='Partial'&&!u.stopped&&sk>0&&(u.entity||'INV')!=='INV')return '<span class="pill ok">Loaded &middot; '+fmtN(sk)+' rows skipped</span>';
  return '<span class="pill '+(st==='Loaded'?'ok':st==='Failed'?'miss':'part')+'">'+esc(st)+'</span>';
}
async function afterValidate(){
  /* load at once when no safety check stops the file; rows with problems are skipped and kept in the upload's list */
  if(!U||U.stage!=='validated'||!U.res||window.__NOAUTOLOAD)return;
  if(canLoad(U.res,false)&&!readOnly()&&effRole()==='Super admin'){toast('Loading '+fmtN(U.res.good)+' good rows; '+fmtN(U.res.rejected)+' skipped');await runLoad({});return}
  var why=[];var z=U.res.sanity;
  if(z&&z.suspect&&!U.anyway)why.push('the dates look wrong for this file');
  if(replaceRisk(U.res).length&&!U.confirmReplace)why.push('it would replace months that hold more lines');
  if(U.res.dateInfo.mixed&&!U.confirmDates)why.push('the swapped-date range needs your confirmation');
  var closedQs=Object.keys(U.res.quarters).filter(function(k){return S.periods[k]&&S.periods[k].status==='closed'});
  if(closedQs.length&&U.reason.trim().length<3)why.push('a closed quarter needs a reload reason');
  if(why.length)toast('Not loaded yet: '+why.join('; ')+'. This is a safety check, not a rejected row.');
}
