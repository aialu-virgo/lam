/* ================= Targets & Potential (plan P1, design/wireframes/targets-potential.html, D70) =================
   One tab for market potential, share %, target, monthly phasing, copy / upload, submit, approve, return and lock.
   Stores are the existing ones: potential (one document per quarter x plant x product group x segment, with its revisions), phasing, planlocks.
   Rules are the ones in 70-admin.js (planGuard, proposerOf, advanceDoc) and the plan-lock handler in index.src.html. */
S.tp={q:'',plant:'',seg:false,ed:{},ph:{},open:{},sel:{},ret:false,retText:'',msg:''};
var TP_SRC=[['dealer / market survey','Dealer survey'],['branch estimate','Branch estimate'],['industry data','Industry data']];
function tpSrcLabel(v){var t=TP_SRC.find(function(s){return s[0]===v});return t?t[1]:(v||'Source')}
function tpCanEdit(){var r=effRole();return !readOnly()&&(r==='Branch / depot manager'||r==='Management / HO'||r==='Super admin')}
function tpCanApprove(){var r=effRole();return !readOnly()&&(r==='Management / HO'||r==='Super admin')}
/* role view keys used by the mock-up: bm, hod, se, mg, sa */
function tpView(){var r=effRole();return r==='Branch / depot manager'?'bm':r==='HOD'?'hod':r==='Sales executive'?'se':r==='Management / HO'?'mg':'sa'}
function tpIN(n,dp){if(n==null||isNaN(n))return '';return Number(n).toLocaleString('en-IN',{maximumFractionDigits:dp==null?2:dp,minimumFractionDigits:0})}
function tpNum(s){if(s==null)return null;var n=toNum(s);return isNaN(n)?null:n}
function tpQ(){if(!S.tp.q)S.tp.q=curQuarterKey();return S.tp.q}
function tpQRange(k){var m=qMonths(k);return MON[+m[0].slice(5,7)-1]+'–'+MON[+m[2].slice(5,7)-1]+' '+m[2].slice(0,4)}
function tpQuarters(){
  var cur=curQuarterKey(),set={};closedQuarters().concat([cur,nextQ(cur),nextQ(nextQ(cur))]).forEach(function(k){set[k]=1});
  S.potential.forEach(function(x){if(/^FY\d\d-Q[1-4]$/.test(x.fy_quarter||''))set[x.fy_quarter]=1});
  return Object.keys(set).sort().reverse();
}
/* a DEMO plan record never stands in for a plant-quarter that has real sales (D55); nothing DEMO is ever written by this tab onto a real quarter */
function tpVisible(x){return !(x.demo&&realActual(x.plant_code,x.fy_quarter))}
function tpLeaves(q){return S.potential.filter(function(x){return x.fy_quarter===q&&x.plant_code&&tpVisible(x)})}
function tpKey(q,plant,group,seg){return slug([q,plant,group,seg].join('_'))}
function tpPlantList(q,cq,pL){
  var u=effUser(),sc=SC(),r=u.role,held=codesOf(u),has={};
  cq.concat(pL).forEach(function(x){has[x.plant_code]=1});(DS.plants||[]).forEach(function(c){has[c]=1});
  var list=S.plants.filter(function(p){return p.active!==false&&p.business!=='ACP'}).map(function(p){return p.plant_code}).filter(function(c){
    if(!plantInScope(sc,c))return false;
    if(r==='Branch / depot manager')return held.indexOf(c)>=0;
    if(r==='Sales executive')return held.indexOf(c)>=0||(DS.plants||[]).indexOf(c)>=0;
    return !!has[c]||held.indexOf(c)>=0;
  });
  return list.sort();
}
function tpSeries(plant,group){
  var k=['tps',plant,group,DS.ver,S.potVer,Object.keys(S.cells).length,TODAY()].join('|'),hit=DS.cache[k];if(hit)return hit;
  var ser=quarterSeries({plant:plant,group:group},undefined),r={ser:ser,ts:trendOfSeries(ser)};DS.cache[k]=r;return r;
}
/* last quarter's actual (net basis when credit notes are loaded), potential and default share for one plant x group */
function tpLast(plant,group,q,pL){
  var pq=prevQ(q),cur=curQuarterKey(),sc=SC(),r={A:null,state:'ok',pq:pq,pot:null,dsh:null,ts:null};
  var lp=0,any=false;pL.forEach(function(x){if(x.plant_code===plant&&x.product_group===group){var s=approvedOf(x)||x;if(+s.potential_value_inr>0){lp+=+s.potential_value_inr;any=true}}});if(any)r.pot=lp;
  if(pq>=cur){r.state='open';return r}
  var ms=qMonths(pq);
  if(sc.sp){
    if(monthsLoaded(ms,new Set([plant]))){var a=0,mo=DS.ptot&&DS.ptot[plant+SEP+group];ms.forEach(function(m){if(mo&&mo[m])a+=mo[m]});r.A=a}else r.state='incomplete';
  }else{
    var s=tpSeries(plant,group),en=s.ser.find(function(x){return x.q===pq});r.ts=s.ts;
    if(en&&en.loaded&&en.H!=null)r.A=en.H;else r.state='incomplete';
  }
  if(r.A!=null&&r.pot>0)r.dsh=r2(r2(r.A/r.pot*100)+(+CFG.default_share_uplift_pts||0));
  return r;
}
function tpKnownSegs(){var o={};S.potential.forEach(function(x){if(x.customer_segment&&x.customer_segment!=='All')o[x.customer_segment]=1});return Object.keys(o).sort()}
/* one editable leaf: saved document (x) overlaid with the person's unsaved edits */
function tpVM(q,plant,group,seg,x,dsh){
  var key=tpKey(q,plant,group,seg),e=S.tp.ed[key]||{};
  var sPot=x&&x.potential_value_inr!==''&&x.potential_value_inr!=null?+x.potential_value_inr:null,sShare=x&&x.share_pct!==''&&x.share_pct!=null?+x.share_pct:null;
  var pot=e.pot!==undefined?tpNum(e.pot):sPot,share=e.share!==undefined?tpNum(e.share):sShare;
  var tgt=e.tgt!==undefined?tpNum(e.tgt):(pot!=null&&share!=null?leafTgt(pot,share):null);
  var sugg=(share==null&&tgt==null&&pot!=null&&dsh!=null)?leafTgt(pot,dsh):null;
  var src=e.src!==undefined?e.src:(x?x.source_type:'branch estimate'),note=e.note!==undefined?e.note:(x?x.source_note||'':'');
  var sh=e.sh!==undefined?tpNum(e.sh):(x&&+x.potential_qty_sheets>0?+x.potential_qty_sheets:null),sq=e.sq!==undefined?tpNum(e.sq):(x&&+x.potential_qty_sqft>0?+x.potential_qty_sqft:null);
  var dirty=!!S.tp.ed[key]&&(x?(pot!==sPot||share!==sShare||src!==x.source_type||note!==(x.source_note||'')||sh!==(+x.potential_qty_sheets>0?+x.potential_qty_sheets:null)||sq!==(+x.potential_qty_sqft>0?+x.potential_qty_sqft:null)||(e.tgt!==undefined&&Math.abs((tgt||0)-(sShare!=null&&sPot!=null?leafTgt(sPot,sShare):0))>0.005)):(pot!=null||share!=null||tgt!=null));
  return {key:key,plant:plant,group:group,seg:seg,x:x||null,e:e,pot:pot,share:share,tgt:tgt,sugg:sugg,src:src,note:note,sh:sh,sq:sq,dirty:dirty,status:x?x.status:null,
    proposer:x?proposerOf(x):'',ap:x?approvedOf(x):null};
}
function tpAggStatus(vms){
  var st=vms.filter(function(v){return v.x}).map(function(v){return v.status});
  if(!st.length)return 'Not started';
  if(st.indexOf('Draft')>=0)return 'Draft';
  if(st.indexOf('Discussed')>=0)return 'Proposed';
  if(st.every(function(s){return s==='Locked'}))return 'Locked';
  return 'Approved';
}
function tpModel(){
  var q=tpQ(),pq=prevQ(q),locked=isPlanLocked(q),cq=tpLeaves(q),pL=tpLeaves(pq),plants=tpPlantList(q,cq,pL),segs=tpKnownSegs(),u=effUser(),held=codesOf(u);
  var own=u.role==='Branch / depot manager';
  var out={q:q,locked:locked,plants:[],rows:[],started:false,territory:S.potential.filter(function(x){return x.fy_quarter===q&&!x.plant_code&&tpVisible(x)}).length};
  plants.forEach(function(pc){
    if(S.tp.plant&&S.tp.plant!==pc)return;
    var grp=[];
    GROUPS.forEach(function(g){
      var leaves=cq.filter(function(x){return x.plant_code===pc&&x.product_group===g});
      var last=tpLast(pc,g,q,pL);
      var prevHas=pL.some(function(x){return x.plant_code===pc&&x.product_group===g});
      if(!(own&&held.indexOf(pc)>=0)&&!leaves.length&&!prevHas&&!(last.A>0))return;
      var allL=leaves.find(function(x){return x.customer_segment==='All'}),segL=leaves.filter(function(x){return x.customer_segment!=='All'});
      var mode=segL.length&&!(allL&&+allL.potential_value_inr>0)?'seg':'all';
      var kids=[],main=null;
      if(mode==='all'){
        main=tpVM(q,pc,g,'All',allL,last.dsh);
        if(S.tp.seg&&!(allL&&+allL.potential_value_inr>0)&&!main.dirty)segs.forEach(function(sg){kids.push(tpVM(q,pc,g,sg,segL.find(function(x){return x.customer_segment===sg}),null))});
      }else{
        var names={};segL.forEach(function(x){names[x.customer_segment]=1});if(S.tp.seg)segs.forEach(function(sg){names[sg]=1});
        Object.keys(names).sort().forEach(function(sg){kids.push(tpVM(q,pc,g,sg,segL.find(function(x){return x.customer_segment===sg}),null))});
      }
      var vms=mode==='seg'?kids:(kids.some(function(k){return k.x||k.dirty})?kids:[main]);
      var parentEditable=mode==='all'&&!kids.length;
      var pot=null,tgt=null,orig=null,cur=null,anyAp=false;
      vms.forEach(function(v){if(v.pot!=null)pot=(pot||0)+v.pot;if(v.tgt!=null)tgt=(tgt||0)+v.tgt;
        if(v.ap){anyAp=true;var og=v.x&&v.x.original||v.ap;orig=(orig||0)+leafTgt(og.potential_value_inr,og.share_pct);cur=(cur||0)+leafTgt(v.ap.potential_value_inr,v.ap.share_pct)}});
      var sugg=main&&main.sugg!=null?main.sugg:null,tShow=tgt!=null?tgt:sugg;
      var status=tpAggStatus(vms.filter(function(v){return v.x}));
      var started=vms.some(function(v){return v.x||v.dirty});
      var row={plant:pc,group:g,mode:mode,main:main,kids:kids,vms:vms,last:last,pot:pot,tgt:tgt,sugg:sugg,tShow:tShow,orig:orig,cur:cur,anyAp:anyAp,status:status,started:started,parentEditable:parentEditable,gkey:slug([q,pc,g].join('_'))};
      var stretch=tShow!=null&&last.A!=null&&last.ts?stretchOf(tShow,last.A,last.ts):{state:'na'};
      row.stretch=stretch.state==='stretch';row.qoq=tShow!=null?qoqOf(tShow,last.A,{incomplete:last.A==null&&last.state==='incomplete',noPrior:false}):null;
      if(started)out.started=true;
      grp.push(row);out.rows.push(row);
    });
    out.plants.push({code:pc,rows:grp});
  });
  return out;
}
/* ---------- rendering ---------- */
function tpPill(st,extra){
  var m={Approved:'tp-ok',Draft:'tp-draft',Proposed:'tp-prop',Locked:'tp-lock','Not started':'tp-ns'}[st]||'tp-ns';
  return '<span class="tp-pill '+m+'">'+esc(st)+'</span>'+(extra||'');
}
function tpInput(vm,field,val,ph,label,cls,editable,dflt){
  if(!editable)return val!==''&&val!=null?'<span class="mono">'+esc(val)+'</span>':(ph?'<span class="tp-mut">'+esc(ph)+'</span>':'<span class="tp-mut">—</span>');
  return '<input class="tp-in '+cls+(dflt?' dflt':'')+'" id="tp-'+field+'-'+vm.key+'" data-tp="'+field+'" data-key="'+esc(vm.key)+'" value="'+esc(val==null?'':val)+'" placeholder="'+esc(ph||'')+'" aria-label="'+esc(label)+'" inputmode="decimal">';
}
function tpSrcSel(vm,editable){
  if(!editable)return '<span>'+esc(tpSrcLabel(vm.src))+'</span>';
  return '<select class="tp-in" id="tp-src-'+vm.key+'" data-tp="src" data-key="'+esc(vm.key)+'" aria-label="Source of potential '+esc(vm.group)+'">'+TP_SRC.map(function(s){return '<option value="'+esc(s[0])+'"'+(vm.src===s[0]?' selected':'')+'>'+esc(s[1])+'</option>'}).join('')+'</select>';
}
function tpLastCell(row){
  var l=row.last;
  return '<div class="tp-c tp-n" data-l="Last quarter actual">'+(l.A!=null?'<span class="mono">'+tpIN(l.A)+'</span><small class="tp-mut">'+qLabel(l.pq)+(l.pot!=null?' · potential '+tpIN(l.pot):' · no potential')+'</small>':'<span class="tp-mut">'+(l.state==='open'?'Quarter still open':'incomplete history')+'</span>')+'</div>';
}
function tpCells(vm,row,editable,isChild){
  var lab=vm.group+(isChild?' '+vm.seg:''),dsh=(!isChild&&vm.share==null)?row.last.dsh:null;
  var potIn=tpInput(vm,'pot',editable?(vm.e.pot!==undefined?vm.e.pot:(vm.pot!=null?tpIN(vm.pot):'')):(vm.pot!=null?tpIN(vm.pot):''),editable?'enter potential':'','Potential ₹ '+lab,'pot',editable,false);
  var shVal=vm.e.share!==undefined?(tpNum(vm.e.share)!=null?tpNum(vm.e.share).toFixed(2):vm.e.share):(vm.share!=null?vm.share.toFixed(2):'');
  var shIn=tpInput(vm,'share',shVal,editable&&dsh!=null?dsh.toFixed(2):'','Share % '+lab,'share',editable,editable&&vm.share==null&&dsh!=null);
  var tgVal=vm.e.tgt!==undefined?vm.e.tgt:(vm.tgt!=null?tpIN(vm.tgt):'');
  var tgIn=tpInput(vm,'tgt',tgVal,editable&&vm.tgt==null&&vm.sugg!=null?tpIN(vm.sugg):'','Target ₹ '+lab,'tgt',editable,editable&&vm.tgt==null&&vm.sugg!=null);
  return {pot:'<div class="tp-c" data-l="Potential ₹">'+potIn+'</div>',share:'<div class="tp-c" data-l="Share %">'+shIn+'</div>',tgt:'<div class="tp-c" data-l="Target ₹">'+tgIn+'</div>',src:'<div class="tp-c" data-l="Source">'+tpSrcSel(vm,editable)+'</div>'};
}
function tpQoq(row){
  if(row.tShow==null)return '<span class="tp-mut">'+(row.pot==null?'—':'—')+'</span>';
  var q=row.qoq;if(!q||q.state!=='ok')return qoqCell(q);
  return '<span class="mono '+(q.v>=0?'up':'dn')+'">'+fmtPct(q.v,true,2)+'</span>'+(row.stretch?' <span class="tp-pill tp-str" title="For discussion; never blocks approval">Stretch</span>':'');
}
function tpStatusCell(row,model,sel){
  var vms=row.vms.filter(function(v){return v.x}),h='';
  var st=row.status;
  var extra='';
  if(st==='Approved'||st==='Locked'){var ap=vms.map(function(v){return v.ap&&v.ap.by}).filter(Boolean);extra=ap.length?'<small>approved by '+esc(userName(ap[ap.length-1]))+'</small>':''}
  else if(st==='Proposed'){var pr=vms.map(function(v){return v.proposer}).filter(Boolean);extra='<small>by '+esc(pr[0]||'')+'</small>'}
  else if(st==='Draft'){var dv=vms.filter(function(v){return v.status==='Draft'});extra='<small>rev '+((dv[0]&&dv[0].x.rev)||1)+' · '+esc(userName(dv[0]&&dv[0].proposer||''))+'</small>'}
  h=tpPill(st,extra);
  /* approver checkboxes sit on each Proposed leaf; the proposer sees "another approver needed" */
  if(sel&&!model.locked&&row.mode==='all'&&row.main&&row.main.x&&row.main.status==='Discussed'&&row.vms[0]===row.main){
    var u=effUser(),v=row.main;
    if(v.proposer===u.email)h+='<small class="tp-own">You proposed this: another approver needed</small>';
    else h+='<label class="tp-ck"><input type="checkbox" data-tp="sel" data-key="'+esc(v.key)+'" aria-label="Select for approval '+esc(row.group)+'"'+(S.tp.sel[v.key]?' checked':'')+'> select</label>';
  }
  return '<div class="tp-c" data-l="Status">'+h+'</div>';
}
function tpOrigCell(row){
  var h;
  if(row.anyAp&&row.cur!=null){
    if(Math.abs((row.orig||0)-row.cur)<0.005)h='<div><span class="tp-mut">Original = current</span> <b class="mono">'+tpIN(row.cur)+'</b></div>';
    else h='<div><span class="tp-mut">Original</span> <span class="mono">'+tpIN(row.orig)+'</span><br><span class="tp-mut">Current</span> <b class="mono">'+tpIN(row.cur)+'</b></div>';
    if(row.status==='Draft'||row.status==='Proposed')h+='<small class="tp-mut">Newer revision pending</small>';
  }else if(row.started)h='<div class="tp-mut">No approved target yet. Draft is shown, not counted.</div>';
  else h='<div class="tp-mut">No approved target yet</div>';
  return '<div class="tp-c" data-l="Original vs current target">'+h+'</div>';
}
function tpPhasing(row,model,editable){
  var vm=row.main||row.vms[0],t=row.tgt;
  if(t==null||!vm)return '<div class="tp-phs"><b>Monthly phasing</b><p class="tp-mut">Appears once a target exists. Default: equal split.</p></div>';
  var q=model.q,ms=qMonths(q),wd=ms.map(WD),wsum=wd.reduce(function(a,b){return a+b},0),wpct=wd.map(function(d){return d/wsum*100});
  var x=vm.x||{fy_quarter:q,plant_code:row.plant,product_group:row.group,customer_segment:'All'},cur=phasingFor(x);
  var near=function(a,b){return a.every(function(v,i){return Math.abs(v-b[i])<0.01})};
  var st=S.tp.ph[row.gkey],m=st?st.m:(near(cur,[100/3,100/3,100/3])?'equal':near(cur,wpct)?'wd':'custom');
  var cust=st?st.c:(m==='custom'?cur.map(function(v){return String(r2(v))}):['','','']);
  var eq=monthsOfTarget(t,[100/3,100/3,100/3]),wm=monthsOfTarget(t,wpct);
  var csum=cust.reduce(function(a,v){return a+(tpNum(v)||0)},0);
  var rad=function(v,l){return '<label><input type="radio" name="tp-ph-'+row.gkey+'" data-tp="ph" data-g="'+esc(row.gkey)+'" value="'+v+'"'+(m===v?' checked':'')+(editable?'':' disabled')+'> '+l+'</label>'};
  return '<div class="tp-phs"><div class="tp-phh"><b>Monthly phasing</b><span class="tp-seg2" role="radiogroup" aria-label="Phasing method">'+rad('equal','Equal split')+rad('wd','Working days')+rad('custom','Custom %')+'</span></div>'
   +'<div class="tw"><table><thead><tr><th>Month</th><th class="num">Equal split ₹</th><th class="num">Working days</th><th class="num">By working days ₹</th><th class="num">Custom %</th></tr></thead><tbody>'
   +ms.map(function(mm,i){return '<tr><td>'+ymLabel(mm)+'</td><td class="num mono">'+tpIN(eq[i],2)+'</td><td class="num">'+wd[i]+'</td><td class="num mono">'+tpIN(wm[i],2)+'</td><td class="num">'+(editable&&m==='custom'?'<input class="tp-in sm" id="tp-phc-'+row.gkey+'-'+i+'" data-tp="phc" data-g="'+esc(row.gkey)+'" data-i="'+i+'" value="'+esc(cust[i])+'" placeholder="%" aria-label="Custom % '+ymLabel(mm)+'" inputmode="decimal">':'<span class="mono">'+esc(m==='custom'?cust[i]:'')+'</span>')+'</td></tr>'}).join('')
   +'<tr class="tt"><td>Quarter</td><td class="num mono">'+tpIN(t,2)+'</td><td class="num">'+wsum+'</td><td class="num mono">'+tpIN(t,2)+'</td><td class="num mono">'+(m==='custom'?tpIN(csum,2):'100')+'</td></tr></tbody></table></div>'
   +'<p class="tp-mut">Months 1 and 2 are rounded to 2 decimals; month 3 takes the remainder, so months always add up to the quarter. Working days: Mon to Sat less the holidays in Admin › Settings. A change is saved as a revision.'+(m==='custom'&&Math.abs(csum-100)>0.01?' <b class="tp-own">Custom % must add up to 100 (now '+tpIN(csum,2)+').</b>':'')+'</p></div>';
}
function tpRevTrail(vm){
  var x=vm.x;if(!x)return '';
  var revs=(x.revisions||[]).slice().reverse().slice(0,8);if(!revs.length)return '';
  return '<div><b>Revision trail</b><ul class="tp-tl">'+revs.map(function(r){return '<li>Rev '+r.n+' · '+esc(userName(r.by))+' · '+esc(istStr(r.at))+' · <b>'+esc(r.status)+'</b>'+(r.change?' · '+esc(r.change):'')+(r.reason&&r.reason!=='Status change'?' · reason: “'+esc(r.reason)+'”':'')+(r.participants?' · with '+esc(r.participants):'')+'</li>'}).join('')+'</ul></div>';
}
function tpDetail(row,model,editable){
  var vm=row.main;
  if(row.mode==='seg'){
    var kx=row.vms.filter(function(v){return v.x});
    return '<div class="tp-dbody"><p class="tp-mut">This group is planned by segment. Potential, share, target and source are set on the segment rows below; the group figures are their sum. Phasing applies to the whole group'+(editable?':':'.')+'</p>'+tpPhasing(row,model,editable)
      +kx.map(function(v){return '<div><b>'+esc(v.seg)+'</b>'+tpRevTrail(v)+'</div>'}).join('')+(kx.length?senseHtml(kx[0].x):'')+'</div>';
  }
  var ed=editable&&!model.locked;
  var dsh=row.last.dsh;
  var shLbl=function(f,l,v,ph){return '<label class="fld">'+l+(ed?'<input class="tp-in" id="tp-'+f+'-'+vm.key+'" data-tp="'+f+'" data-key="'+esc(vm.key)+'" value="'+esc(vm.e[f]!==undefined?vm.e[f]:(v!=null?tpIN(v):''))+'" placeholder="'+ph+'" inputmode="numeric">':'<span class="mono">'+(v!=null?tpIN(v):'—')+'</span>')+'</label>'};
  return '<div class="tp-dbody"><div class="tp-dgrid">'+shLbl('sh','Potential, sheets (optional)',vm.sh,'Sheets')+shLbl('sq','Potential, sq ft (optional)',vm.sq,'Sq ft')
   +'<label class="fld">Source of potential'+(ed?'<select class="tp-in" id="tp-src2-'+vm.key+'" data-tp="src" data-key="'+esc(vm.key)+'">'+TP_SRC.map(function(s){return '<option value="'+esc(s[0])+'"'+(vm.src===s[0]?' selected':'')+'>'+esc(s[1])+'</option>'}).join('')+'</select>':'<span>'+esc(tpSrcLabel(vm.src))+'</span>')+'</label>'
   +'<label class="fld" style="grid-column:span 1">Note on potential'+(ed?'<input class="tp-in txt" id="tp-note-'+vm.key+'" data-tp="note" data-key="'+esc(vm.key)+'" value="'+esc(vm.note)+'" placeholder="Where does this figure come from?">':'<span>'+esc(vm.note||'—')+'</span>')+'</label></div>'
   +(dsh!=null?'<p class="tp-mut">Default share for this row: last quarter '+tpIN(row.last.A)+' ÷ '+tpIN(row.last.pot)+' = '+r2(row.last.A/row.last.pot*100).toFixed(2)+'% + '+(+CFG.default_share_uplift_pts||0)+' points = <b>'+dsh.toFixed(2)+'%</b>. Used only when no share is entered; saved as Draft.</p>'
     :'<p class="tp-mut">No default share for this row: last quarter has no potential or no loaded actual, so a person enters the share.</p>')
   +tpPhasing(row,model,ed)+tpRevTrail(vm)+(vm.x&&vm.x.plant_code?senseHtml(vm.x):'')+'</div>';
}
function tpRowHtml(row,model,u){
  var v=tpView(),editable=tpCanEdit()&&!model.locked,canSel=tpCanApprove();
  var h='',pe=editable&&row.parentEditable;
  var ref=row.mode==='all'?row.main:null,cells,lastC=tpLastCell(row);
  if(ref)cells=tpCells(ref,row,pe,false);
  else cells={pot:'<div class="tp-c" data-l="Potential ₹">'+(row.pot!=null?'<span class="mono">'+tpIN(row.pot)+'</span>':'<span class="tp-mut">—</span>')+'<small>sum of segments</small></div>',share:'<div class="tp-c" data-l="Share %">'+(row.pot>0&&row.tgt!=null?'<span class="mono">'+(row.tgt/row.pot*100).toFixed(2)+'</span>':'<span class="tp-mut">—</span>')+'<small>blended</small></div>',
    tgt:'<div class="tp-c" data-l="Target ₹">'+(row.tgt!=null?'<span class="mono">'+tpIN(row.tgt)+'</span>':'<span class="tp-mut">—</span>')+'<small>sum of segments</small></div>',src:'<div class="tp-c" data-l="Source"></div>'};
  if(ref&&row.kids.length)cells.share=cells.share.replace(/<\/div>$/,'<small>sum of segments</small></div>');
  var open=S.tp.open[row.plant+'|'+row.group]?' open':'';
  h+='<details class="tp-row tp-par" data-okey="'+esc(row.plant+'|'+row.group)+'"'+open+'><summary class="tp-g"><span class="tp-chev" aria-hidden="true">▸</span><div class="tp-c tp-cg" data-l="Product group"><b>'+esc(row.group)+'</b><small class="tp-mut">Segment: '+(row.mode==='seg'?'by segment':'All')+'</small></div>'
   +cells.pot+cells.share+cells.tgt+cells.src+lastC+'<div class="tp-c tp-n" data-l="QoQ vs last quarter">'+tpQoq(row)+'</div>'+tpStatusCell(row,model,canSel)+tpOrigCell(row)+'<span class="tp-more">Phasing, sheets, sq ft, note</span></summary>'+tpDetail(row,model,editable)+'</details>';
  row.kids.forEach(function(k){
    var kc=tpCells(k,row,editable,true);
    var ks=k.x?k.status:null,kst=ks?{Draft:'Draft',Discussed:'Proposed',Approved:'Approved',Locked:'Locked'}[ks]:'Not started';
    var sub='';if(k.x&&k.status==='Discussed'&&canSel&&!model.locked){sub=k.proposer===u.email?'<small class="tp-own">You proposed this: another approver needed</small>':'<label class="tp-ck"><input type="checkbox" data-tp="sel" data-key="'+esc(k.key)+'" aria-label="Select for approval '+esc(row.group+' '+k.seg)+'"'+(S.tp.sel[k.key]?' checked':'')+'> select</label>'}
    h+='<div class="tp-row tp-child tp-g"><span class="tp-chev" aria-hidden="true"></span><div class="tp-c tp-cg" data-l="Segment"><span class="tp-ind">↳ '+esc(row.group)+' · <b>'+esc(k.seg)+'</b></span></div>'+kc.pot+kc.share+kc.tgt+kc.src+'<div class="tp-c tp-n" data-l="Last quarter actual"></div><div class="tp-c tp-n" data-l="QoQ vs last quarter"></div><div class="tp-c" data-l="Status">'+tpPill(kst)+sub+'</div><div class="tp-c" data-l="Original vs current target"><span class="tp-mut">Leaf of the group total</span></div></div>';
  });
  return h;
}
function tpTotals(rows,label,all){
  var pot=null,tgt=null,la=0,laN=0,tN=0,appr=0,noPot=0,allT=true,allA=true;
  rows.forEach(function(r){
    if(r.pot!=null){pot=(pot||0)+r.pot}else noPot++;
    if(r.tgt!=null)tgt=(tgt||0)+r.tgt;
    if(r.last.A!=null){la+=r.last.A;laN++}else allA=false;
    if(r.status==='Approved'||r.status==='Locked')appr++;
  });
  var started=rows.filter(function(r){return r.started}).length;
  var potCell=pot!=null?'<b class="mono">'+tpIN(pot)+'</b>':'<span class="tp-pill tp-miss">Potential not set</span>';
  var blended=pot>0&&tgt!=null?(tgt/pot*100).toFixed(2):null;
  var qoq=(tgt!=null&&laN===rows.length&&la>0)?qoqOf(tgt,la,{}):null;
  var allT0=rows.every(function(r){return r.tgt!=null});
  return '<div class="tp-tot'+(all?' tp-all':'')+' tp-g"><span class="tp-chev"></span><div class="tp-c tp-cg" data-l="">'+esc(label)+'</div><div class="tp-c" data-l="Potential ₹">'+potCell+'</div>'
   +'<div class="tp-c" data-l="Share %">'+(blended?'<b class="mono">'+blended+'</b><small>blended</small>':'—')+'</div><div class="tp-c" data-l="Target ₹">'+(tgt!=null?'<b class="mono">'+tpIN(tgt)+'</b>':'—')+'</div><div class="tp-c"></div>'
   +'<div class="tp-c tp-n" data-l="Last quarter actual">'+(laN?'<span class="mono">'+tpIN(la)+'</span>':'—')+(laN&&laN<rows.length?'<small>'+laN+' of '+rows.length+' rows loaded</small>':'')+'</div>'
   +'<div class="tp-c tp-n" data-l="QoQ">'+(qoq&&qoq.state==='ok'&&allT0?'<b class="mono '+(qoq.v>=0?'up':'dn')+'">'+fmtPct(qoq.v,true,2)+'</b>':'—')+'</div>'
   +'<div class="tp-c" data-l="Status">'+(started?appr+' of '+rows.length+' approved':'0 of '+rows.length+' started')+(started?'<small>'+(noPot?noPot+' row'+(noPot>1?'s':'')+' without potential':'All rows have potential')+'</small>':'')+'</div><div class="tp-c"></div></div>';
}
function tpBarHtml(model,u){
  var v=tpView(),can=tpCanEdit(),q=model.q;
  var ro=function(t){return '<div class="tp-bar"><span class="tp-mut">'+t+'</span></div>'};
  if(readOnly())return ro('Viewing as another user: preview is read-only. Nothing can be saved.');
  if(model.locked)return ro(qLabel(q)+' is locked. Locked quarters open read-only for everyone, including Super admin.');
  if(!can)return ro(model.started?'View only. You see the figures; a Branch manager edits and Management approves.':'View only. Nothing to show until a Branch manager starts the quarter.');
  var drafts=0,dirty=0,sel=0;
  model.rows.forEach(function(r){r.vms.concat(r.kids).forEach(function(x){if(x.dirty)dirty++});r.vms.forEach(function(x){if(x.x&&x.status==='Draft'&&!planGuard(x.x))drafts++;if(S.tp.sel[x.key]&&x.status==='Discussed')sel++})});
  var emp=!model.started;
  var left='<div class="tp-bl"><button class="btn'+(emp?' pri':'')+'" data-act="tp-copy">Copy from last quarter</button>'
   +'<details class="tp-menu"><summary class="btn">Download template</summary><div class="tp-pop"><button class="btn sm" data-act="tp-tmpl" data-t="potential">Market-potential file</button><button class="btn sm" data-act="tp-tmpl" data-t="phasing">Monthly phasing file</button></div></details>'
   +'<details class="tp-menu"><summary class="btn">Upload</summary><div class="tp-pop"><label class="btn sm" for="up-pot">Market-potential file (CSV)</label><label class="btn sm" for="up-ph">Monthly phasing file (CSV)</label></div></details>'
   +'<input id="up-pot" class="tp-hid" data-file="potential" type="file" accept=".csv"><input id="up-ph" class="tp-hid" data-file="phasing" type="file" accept=".csv"></div>';
  var right='<div class="tp-br"><button class="btn" data-act="tp-save">Save draft</button>';
  var subLbl='Submit '+(drafts||'')+(drafts?' Draft row'+(drafts===1?'':'s')+' for approval':'for approval');
  if(emp)right+='<button class="btn" disabled>Submit for approval</button>';
  else if(v==='bm'||drafts||dirty)right+='<button class="btn'+(v==='bm'?' pri':'')+'" data-act="tp-submit"'+(drafts||dirty?'':' disabled')+'>'+subLbl+'</button>';
  if(!emp&&(v==='mg'||v==='sa'))right+='<button class="btn" data-act="tp-return-open">Return with reason</button><button class="btn pri" data-act="tp-approve"'+(sel?'':' disabled')+'>Approve '+sel+' selected</button>';
  if(v==='mg'||v==='sa')right+='<button class="btn" data-act="tp-lock-open" title="Freeze every Approved target of this quarter; cannot be undone in v1.0">Lock quarter</button>';
  return '<div class="tp-bar">'+left+right+'</div></div>';
}
function pageTargets(){
  var u=effUser(),v=tpView(),model=tpModel(),q=model.q,qs=tpQuarters();
  var plantsAll=tpPlantList(q,tpLeaves(q),tpLeaves(prevQ(q)));
  var plantOpts='<option value="">'+(v==='bm'?'My plants ('+plantsAll.map(plantShort).join(', ')+')':v==='se'?'My plant'+(plantsAll.length>1?'s':''):'All plants')+'</option>'+plantsAll.map(function(c){return '<option value="'+c+'"'+(S.tp.plant===c?' selected':'')+'>'+esc(plantName(c))+'</option>'}).join('');
  var h='<div class="tp-tools"><div class="fld"><label for="tp-q">Quarter</label><select id="tp-q" data-tp="q">'+qs.map(function(k){return '<option value="'+k+'"'+(k===q?' selected':'')+'>'+qLabel(k)+' · '+tpQRange(k)+(isPlanLocked(k)?' · Locked (read-only)':'')+'</option>'}).join('')+'</select></div>'
   +'<div class="fld"><label for="tp-plant">Plants</label><select id="tp-plant" data-tp="plant">'+plantOpts+'</select></div>'
   +'<label class="tp-ck" style="align-self:end"><input type="checkbox" id="tp-seg" data-tp="seg"'+(S.tp.seg?' checked':'')+'> Show segment rows</label></div>';
  var roleNote={bm:'You are the Branch manager for '+(plantsAll.length>1?'plants ':'plant ')+plantsAll.map(plantShort).join(' and ')+'. Edit Potential ₹ and either Share % or Target ₹, save a draft, then submit for approval.',
   hod:'View only. You see all plants; a Branch manager edits and Management approves.',se:'View only. You see the plant where your customers are.',
   mg:'You see all plants. You can propose and approve, but never approve a row you proposed.',sa:'You see all plants and can edit, approve and lock. Approval of a row you proposed still needs another approver.'}[v];
  if(model.locked)roleNote=qLabel(q)+' is locked: every figure is read-only for everyone, including Super admin.';
  h+='<div class="tp-note">'+esc(roleNote)+' Growth is shown quarter on quarter only: target against last quarter\'s actual. Edit Share % and Target ₹ moves the other; the last one you touch wins.</div>';
  var rows=model.rows;
  var cnt={Approved:0,Locked:0,Draft:0,Proposed:0,none:0};rows.forEach(function(r){if(r.status==='Approved'||r.status==='Locked')cnt.Approved++;else if(r.status==='Draft')cnt.Draft++;else if(r.status==='Proposed')cnt.Proposed++;if(r.pot==null)cnt.none++});
  var plantNames=model.plants.map(function(p){return plantShort(p.code)}).join(', ');
  if(!model.started)h+='<div class="tp-strip"><span class="tp-pill tp-ns">0 started</span><span class="tp-mut">'+qLabel(q)+' has no potential, share or target entered yet.</span></div>';
  else h+='<div class="tp-strip"><span class="tp-pill tp-ok">'+cnt.Approved+' Approved</span><span class="tp-pill tp-draft">'+cnt.Draft+' Draft</span>'+(v==='se'?'':'<span class="tp-pill tp-prop">'+cnt.Proposed+' Proposed</span><span class="tp-pill tp-miss">'+cnt.none+' Potential not set</span>')+'<span class="tp-mut">'+rows.length+' rows · plants '+esc(plantNames)+'</span></div>';
  if(!model.started&&!model.locked){
    if(tpCanEdit())h+='<div class="card tp-guide"><h3>'+qLabel(q)+' is empty. Three ways to start</h3><ol><li><b>Copy from last quarter.</b> Takes last quarter\'s potential and share into this quarter as Draft. Edit what changed.</li><li><b>Download template, fill, Upload.</b> The market-potential file and the monthly phasing file.</li><li><b>Type it in.</b> Enter Potential ₹ per row. Share % is already filled with the default.</li></ol>'
      +'<p class="tp-mut"><b>Default.</b> Share % = last quarter\'s actual ÷ last quarter\'s potential for the same row, plus '+(+CFG.default_share_uplift_pts||0)+' points (setting in Admin). Target = potential × share, saved as a <span class="tp-pill tp-draft">Draft</span> only when you save. With no potential entered there is no target and the row says "Potential not set". The default share applies only where last quarter had a potential.</p></div>';
    else h+='<div class="card tp-guide"><h3>'+qLabel(q)+' is empty</h3><p class="tp-mut">No Branch manager has entered potential or targets yet. Rows below show last quarter\'s actuals for reference.</p></div>';
  }
  if(model.territory&&!S.tp.plant)h+='<div class="tp-note">'+model.territory+' territory-level figure'+(model.territory>1?'s are':' is')+' stored for '+qLabel(q)+' and not plant-based; this grid shows plant × product group only.</div>';
  h+='<div id="tp-msg">'+(S.tp.msg||'')+'</div>';
  if(!model.plants.length){
    h+='<div class="card"><div class="empty">'+(v==='bm'?'No plant is assigned to you in Admin › Users, so there is nothing to plan yet. Ask your admin to set your plant codes.':'No plants to show yet. Plants appear here once sales are loaded or a potential figure exists.')+'</div></div>';
  }else{
    h+='<div class="card tp-gridcard"><div class="tp-h"><h3>'+qLabel(q)+' · plant × product group</h3><span class="tp-mut">₹ net of GST · actuals from SAP · segment All unless expanded</span></div><div class="tp-gridwrap">'
     +'<div class="tp-g tp-gh" aria-hidden="true"><span></span><div>Product group</div><div>Potential ₹</div><div>Share % ⇄</div><div>Target ₹ ⇄</div><div>Source</div><div class="tp-n">Last quarter actual</div><div class="tp-n">QoQ</div><div>Status</div><div>Original vs current</div></div>';
    model.plants.forEach(function(p){
      var bm=bmFor(p.code);
      h+='<div class="tp-ph"><b>'+esc(plantShort(p.code))+'</b> <span class="tp-mut">· plant '+esc(p.code)+' · proposer '+esc(bm?bm.email:'no Branch manager assigned')+'</span></div>';
      p.rows.forEach(function(r){h+=tpRowHtml(r,model,u)});
      h+=tpTotals(p.rows,plantShort(p.code)+' total');
    });
    if(model.plants.length>1)h+=tpTotals(rows,v==='bm'?'Total, your plants ('+plantNames+')':'Total, all plants',true);
    h+='</div></div>';
  }
  if(S.tp.ret&&tpCanApprove()&&!model.locked){
    var ticked=[];model.rows.forEach(function(r){r.vms.forEach(function(x){if(S.tp.sel[x.key]&&x.status==='Discussed')ticked.push(plantShort(r.plant)+' '+r.group+(x.seg&&x.seg!=='All'?' '+x.seg:''))})});
    h+='<details class="card tp-ret" open><summary><b>Return with a reason</b> <span class="tp-mut">· '+ticked.length+' row'+(ticked.length===1?'':'s')+' ticked'+(ticked.length?': '+esc(ticked.join(', ')):'. Tick Proposed rows first.')+'</span></summary>'
     +'<label class="fld">Reason (required, shown to the proposer)<textarea class="tp-in txt" id="tp-ret-text" data-tp="rettext" rows="2">'+esc(S.tp.retText)+'</textarea></label>'
     +'<div class="tp-rbtn"><button class="btn" data-act="tp-return-cancel">Cancel</button><button class="btn pri" data-act="tp-return-go"'+(ticked.length?'':' disabled')+'>Return '+ticked.length+' row'+(ticked.length===1?'':'s')+' to Draft</button></div>'
     +'<p class="tp-mut">The approver can never be the proposer of that revision. Rows you proposed show "another approver needed". Returned rows go back to the proposer as a Draft with the reason on the revision trail and an action on their Today list.</p></details>';
  }
  h+='<div class="tp-sticky">'+tpBarHtml(model,u)+'</div>';
  h+='<div id="up-msg">'+(S.upMsg||'')+'</div>';
  h+='<div class="tp-note">Locked quarters (for example the previous quarter once locked) open read-only for everyone, including Super admin. Sheets and sq ft never change a target; ₹ is the basis. '+SEGMENT_NOTE+'</div>';
  return h;
}
/* ---------- actions ---------- */
function tpMsg(kind,txt){S.tp.msg='<div class="banner '+kind+'" style="display:block">'+txt+'</div>';var m=$('#tp-msg');if(m)m.innerHTML=S.tp.msg}
function tpRelabel(vm){return plantShort(vm.plant)+' '+vm.group+(vm.seg&&vm.seg!=='All'?' '+vm.seg:'')}
function tpLeafPut(key,doc){
  return dset('potential/'+key,doc).then(function(){var d=Object.assign({_id:key},doc);var i=S.potential.findIndex(function(p){return p._id===key});if(i>=0)S.potential[i]=d;else S.potential.push(d);S.potVer++;DS.cache={}});
}
async function tpSave(opts){
  opts=opts||{};if(!guardWrite())return {saved:0,errs:['read-only']};
  var model=tpModel(),q=model.q,u=effUser(),errs=[],jobs=[];
  if(model.locked){tpMsg('err','That quarter is locked.');return {saved:0,errs:['locked']}}
  if(!tpCanEdit()){toast('Your role cannot propose sales targets');return {saved:0,errs:['role']}}
  model.rows.forEach(function(r){r.vms.concat(r.kids).forEach(function(v){
    if(jobs.some(function(j){return j.v.key===v.key}))return;
    if(!v.dirty)return;
    var lab=tpRelabel(v),g=planGuard({plant_code:v.plant});if(g){errs.push(lab+': '+g);return}
    if(v.pot==null){errs.push(lab+': enter the potential ₹ first');return}
    if(!(v.pot>=0)){errs.push(lab+': potential ₹ must be 0 or more');return}
    var share=v.share;
    if(share==null&&v.tgt!=null){if(v.pot>0)share=Math.round(v.tgt/v.pot*100*1e8)/1e8;else{errs.push(lab+': a target needs a potential above 0');return}}
    if(share==null&&r.mode==='all'&&v.seg==='All'&&r.last.dsh!=null)share=r.last.dsh;
    if(share!=null&&!(share>=0&&share<=100)){errs.push(lab+': share % must be 0 to 100');return}
    /* a group is planned either by segment or as All, never both */
    var other=S.potential.filter(function(x){return x.fy_quarter===q&&x.plant_code===v.plant&&x.product_group===v.group&&tpVisible(x)&&((v.seg==='All')!==(x.customer_segment==='All'))&&+x.potential_value_inr>0});
    if(other.length&&v.pot>0){errs.push(lab+': this group already has '+(v.seg==='All'?'segment':'All-segment')+' figures; use one or the other');return}
    jobs.push({v:v,share:share,row:r});
  })});
  /* phasing edits are validated before anything is written */
  var phJobs=[];
  Object.keys(S.tp.ph).forEach(function(gk){
    var row=model.rows.find(function(r){return r.gkey===gk});if(!row)return;var st=S.tp.ph[gk],pct;
    if(st.m==='equal')pct=[100/3,100/3,100/3];
    else if(st.m==='wd'){var wd=qMonths(q).map(WD),s=wd.reduce(function(a,b){return a+b},0);pct=wd.map(function(d){return d/s*100})}
    else{var c=st.c.map(tpNum);if(c.some(function(n){return n==null||n<0||n>100})||Math.abs(c.reduce(function(a,b){return a+b},0)-100)>0.01){errs.push(plantShort(row.plant)+' '+row.group+': custom phasing % must be three numbers adding up to 100');return}pct=c}
    var vm=row.main||row.vms[0],x=vm&&vm.x||{fy_quarter:q,plant_code:row.plant,product_group:row.group,customer_segment:'All'},cur=phasingFor(x);
    if(cur.every(function(v,i){return Math.abs(v-pct[i])<0.0001}))return;
    var g=planGuard({plant_code:row.plant});if(g){errs.push(plantShort(row.plant)+' '+row.group+' phasing: '+g);return}
    phJobs.push({row:row,pct:pct,gk:gk});
  });
  if(errs.length){if(!opts.quiet)tpMsg('err','<b>Nothing was saved.</b><ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>');return {saved:0,errs:errs}}
  var n=0,phWarn='';
  for(var i=0;i<jobs.length;i++){
    var j=jobs[i],v=j.v,x=v.x,rev=(x?x.rev||1:0)+1,now=nowISO();
    var chg=x?('₹ '+fmtMoney(x.potential_value_inr)+' to '+fmtMoney(v.pot)+', share '+(x.share_pct===''||x.share_pct==null?'-':x.share_pct)+' to '+(j.share==null?'-':j.share)):'new figure';
    var rvn={n:rev,at:now,by:u.email,status:'Draft',reason:'Draft saved',discussion_date:'',participants:'',change:chg,old:x?{potential_value_inr:x.potential_value_inr,share_pct:x.share_pct}:null,new:{potential_value_inr:v.pot,share_pct:j.share==null?'':j.share}};
    var fields={fy_quarter:q,plant_code:v.plant,territory:'',product_group:v.group,customer_segment:v.seg,potential_value_inr:v.pot,potential_qty_sheets:v.sh||0,potential_qty_sqft:v.sq||0,share_pct:j.share==null?'':j.share,source_type:v.src,source_note:v.note,owner_email:(x&&x.owner_email)||u.email};
    var doc=x?Object.assign({},x,fields,{status:'Draft',rev:rev,revisions:(x.revisions||[]).concat([rvn]).slice(-40)}):Object.assign(fields,{status:'Draft',rev:rev,revisions:[rvn]});
    delete doc._id;
    await tpLeafPut(v.key,doc);delete S.tp.ed[v.key];n++;
  }
  var ph=0;
  for(var k=0;k<phJobs.length;k++){
    var pj=phJobs[k];
    try{
      var pdoc={fy_quarter:q,plant_code:pj.row.plant,product_group:pj.row.group,customer_segment:'',pct:pj.pct,by:u.email,at:nowISO()};
      await dset('phasing/'+pj.row.gkey,pdoc);
      var pi=S.phasing.findIndex(function(p){return p._id===pj.row.gkey});var pd=Object.assign({_id:pj.row.gkey},pdoc);if(pi>=0)S.phasing[pi]=pd;else S.phasing.push(pd);DS.cache={};S.potVer++;
      await dset('log/l'+Date.now().toString(36)+k,{at:nowISO(),by:u.email,event:'phasing changed',quarter:q});
      delete S.tp.ph[pj.gk];ph++;
    }catch(e){phWarn+=(phWarn?' ':'')+plantShort(pj.row.plant)+' '+pj.row.group+': '+dbErrText(e)}
  }
  S.lastHtml='';
  if(!opts.quiet){
    if(!n&&!ph&&!phWarn)tpMsg('info','Nothing to save: no figure was changed.');
    else tpMsg(phWarn?'warn':'ok',(n?'Saved '+n+' row'+(n===1?'':'s')+' as Draft':'No figure changed')+(ph?(n?' and ':'; ')+ph+' phasing change'+(ph>1?'s':''):'')+'.'+(phWarn?' <b>Phasing not saved</b> ('+esc(phWarn)+'). '+(n?'The figures are saved. ':'')+'Ask a Super admin to change the phasing.':''));
  }
  schedule();
  return {saved:n,phasing:ph,phWarn:phWarn,errs:[]};
}
function tpSubmitList(){
  var model=tpModel(),out=[];
  model.rows.forEach(function(r){r.vms.forEach(function(v){if(v.x&&v.status==='Draft'&&!planGuard(v.x))out.push(v)})});
  return out;
}
async function tpSubmitOpen(){
  if(!guardWrite())return;
  var s=await tpSave({quiet:true});if(s.errs&&s.errs.length){tpMsg('err','<b>Fix these first.</b><ul style="margin:6px 0 0 18px">'+s.errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>');return}
  var list=tpSubmitList();if(!list.length){tpMsg('info','No Draft rows to submit.');return}
  var bad=list.filter(function(v){return !(+v.x.potential_value_inr>0)||v.x.share_pct===''||v.x.share_pct==null});
  if(bad.length){tpMsg('err','<b>Not ready to submit.</b><ul style="margin:6px 0 0 18px">'+bad.map(function(v){return '<li>'+esc(tpRelabel(v))+': '+(!(+v.x.potential_value_inr>0)?'potential ₹ is not set':'no share % and no default to use')+'</li>'}).join('')+'</ul>');return}
  openDlg('<h3>Submit '+list.length+' row'+(list.length===1?'':'s')+' for approval</h3><p class="note">'+esc(list.map(tpRelabel).join(', '))+'</p><div class="fgrid"><div class="fld"><label for="tp-s-reason">Reason for these figures (required)</label><input id="tp-s-reason" class="in"></div><div class="fld"><label for="tp-s-date">Discussion date (required)</label><input id="tp-s-date" type="date" class="in" value="'+TODAY()+'"></div><div class="fld"><label for="tp-s-part">Participants (required)</label><input id="tp-s-part" class="in"></div></div><p class="note">An approver other than you moves each row to Approved.</p><div id="d-err"></div><div class="row"><button class="btn pri" data-act="tp-submit-go">Submit</button><button class="btn" data-act="dlg-close">Cancel</button></div>');
}
async function tpSubmitGo(){
  var reason=gv('tp-s-reason'),date=gv('tp-s-date'),part=gv('tp-s-part'),u=effUser();
  if(!reason){dlgErr('A reason is required');return}if(!/^\d{4}-\d\d-\d\d$/.test(date)){dlgErr('A discussion date is required');return}if(!part){dlgErr('Participants are required');return}
  var list=tpSubmitList(),n=0,errs=[];
  for(var i=0;i<list.length;i++){
    var x=list[i].x,revs=(x.revisions||[]).slice(),ix=-1;for(var k=revs.length-1;k>=0;k--){if(revs[k].status==='Draft'&&!revs[k].returned){ix=k;break}}
    if(ix>=0)revs[ix]=Object.assign({},revs[ix],{reason:reason,discussion_date:date,participants:part});
    var x2=Object.assign({},x,{revisions:revs}),r=advanceDoc(x2,u);
    if(r.err){errs.push(tpRelabel(list[i])+': '+r.err);continue}
    await tpLeafPut(list[i].key,r.doc);n++;
  }
  closeDlg();S.lastHtml='';
  tpMsg(errs.length?'warn':'ok','Submitted '+n+' row'+(n===1?'':'s')+' for approval.'+(errs.length?'<ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>':''));toast('Submitted '+n);schedule();
}
function tpSelected(){var model=tpModel(),out=[];model.rows.forEach(function(r){r.vms.forEach(function(v){if(S.tp.sel[v.key]&&v.x&&v.status==='Discussed')out.push(v)})});return out}
async function tpApprove(){
  if(!guardWrite())return;var u=effUser(),list=tpSelected(),n=0,errs=[];
  if(!tpCanApprove()){toast('Approval is by SP Sir or a Management / HO user');return}
  for(var i=0;i<list.length;i++){
    var r=advanceDoc(list[i].x,u);
    if(r.err){errs.push(tpRelabel(list[i])+': '+r.err);continue}
    await tpLeafPut(list[i].key,r.doc);delete S.tp.sel[list[i].key];n++;
  }
  S.lastHtml='';tpMsg(errs.length?(n?'warn':'err'):'ok','Approved '+n+' row'+(n===1?'':'s')+'.'+(errs.length?'<ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>':''));schedule();
}
async function tpReturn(){
  if(!guardWrite())return;var u=effUser(),reason=(S.tp.retText||'').trim(),list=tpSelected(),n=0,errs=[],byProp={};
  if(!tpCanApprove()){toast('Only SP Sir or a Management / HO user can return a row');return}
  if(!reason){tpMsg('err','A reason is required. The proposer sees it.');return}
  for(var i=0;i<list.length;i++){
    var x=list[i].x,g=planGuard(x);if(g){errs.push(tpRelabel(list[i])+': '+g);continue}
    if(isPlanLocked(x.fy_quarter)){errs.push(tpRelabel(list[i])+': quarter is locked');continue}
    var prop=proposerOf(x);
    var doc=Object.assign({},x,{status:'Draft',revisions:(x.revisions||[]).concat([{n:x.rev||1,at:nowISO(),by:u.email,status:'Draft',returned:true,reason:reason,discussion_date:'',participants:'',change:'Returned to Draft by '+u.name}]).slice(-40)});delete doc._id;
    await tpLeafPut(list[i].key,doc);delete S.tp.sel[list[i].key];n++;
    if(prop){(byProp[prop]=byProp[prop]||[]).push(tpRelabel(list[i]))}
  }
  var emails=Object.keys(byProp);
  for(var k=0;k<emails.length;k++){
    if(!uByEmail(emails[k]))continue;
    try{await raiseAction({title:'Targets returned · '+qLabel(tpQ())+' · '+byProp[emails[k]].join(', '),owner:emails[k],due:addDays(TODAY(),2),next:'Open Plan › Targets & Potential, read the reason on the revision trail, correct the figures and submit again.',source:'Returned by '+u.name+': '+reason,page:'targets',plant:''})}catch(e){errs.push('Action for '+emails[k]+' not created: '+dbErrText(e))}
  }
  S.tp.ret=false;S.tp.retText='';S.lastHtml='';
  tpMsg(errs.length?'warn':'ok','Returned '+n+' row'+(n===1?'':'s')+' to Draft with your reason.'+(errs.length?'<ul style="margin:6px 0 0 18px">'+errs.map(function(e){return '<li>'+esc(e)+'</li>'}).join('')+'</ul>':''));schedule();
}
async function tpCopy(){
  if(!guardWrite())return;var model=tpModel(),q=model.q,pq=prevQ(q),u=effUser();
  if(model.locked){tpMsg('err',qLabel(q)+' is locked.');return}
  if(!tpCanEdit()){toast('Your role cannot propose sales targets');return}
  var src=S.potential.filter(function(x){return x.fy_quarter===pq&&x.plant_code&&!planGuard(x)&&!(x.demo&&realActual(x.plant_code,pq))});
  var shown=S.tp.plant,n=0,skipped=0,none=0;
  if(!src.length){tpMsg('info',qLabel(pq)+' has no potential figures to copy.');return}
  for(var i=0;i<src.length;i++){
    var s=src[i];if(shown&&s.plant_code!==shown)continue;
    var key=tpKey(q,s.plant_code,s.product_group,s.customer_segment),ex=S.potential.find(function(p){return p._id===key&&tpVisible(p)});
    if(ex&&(+ex.potential_value_inr>0||(ex.share_pct!==''&&ex.share_pct!=null))){skipped++;continue}
    var a=approvedOf(s),use=a||s;
    var other=S.potential.some(function(x){return x.fy_quarter===q&&x.plant_code===s.plant_code&&x.product_group===s.product_group&&tpVisible(x)&&((s.customer_segment==='All')!==(x.customer_segment==='All'))&&+x.potential_value_inr>0});
    if(other){skipped++;continue}
    var sh=use.share_pct===''||use.share_pct==null?'':+use.share_pct;
    var rv={n:1,at:nowISO(),by:u.email,status:'Draft',reason:'Copied from '+qLabel(pq),discussion_date:'',participants:'',change:'copied from '+qLabel(pq)+' (₹ '+fmtMoney(use.potential_value_inr)+(sh===''?'':', share '+sh)+')',old:null,new:{potential_value_inr:+use.potential_value_inr||0,share_pct:sh}};
    var doc={fy_quarter:q,plant_code:s.plant_code,territory:'',product_group:s.product_group,customer_segment:s.customer_segment,potential_value_inr:+use.potential_value_inr||0,potential_qty_sheets:+use.potential_qty_sheets||0,potential_qty_sqft:+use.potential_qty_sqft||0,share_pct:sh,source_type:s.source_type||'branch estimate',source_note:s.source_note||'',owner_email:u.email,status:'Draft',rev:(ex?ex.rev||1:0)+1,revisions:((ex&&ex.revisions)||[]).concat([rv]).slice(-40)};
    if(s.demo)doc.demo=true;/* a DEMO source stays DEMO so Clear demo removes the copy; a real quarter never receives it (filtered above) */
    await tpLeafPut(key,doc);delete S.tp.ed[key];n++;
  }
  S.lastHtml='';
  tpMsg(n?'ok':'info','Copied '+n+' row'+(n===1?'':'s')+' from '+qLabel(pq)+' as Draft'+(skipped?'; '+skipped+' already had figures and were left alone':'')+'. Edit what changed, then submit.');schedule();
}
/* template: one row per plant x product group in view, the quarter filled in, potential blank (blank rows are skipped on upload) */
function tpTemplateCsv(kind){
  var model=tpModel(),q=model.q,u=effUser(),lines=[];
  if(kind==='phasing'){
    lines.push(TEMPLATES.phasing);
    model.rows.forEach(function(r){var vm=r.main||r.vms[0],x=vm&&vm.x||{fy_quarter:q,plant_code:r.plant,product_group:r.group,customer_segment:'All'},p=phasingFor(x);
      p.forEach(function(v,i){lines.push(csvLine([q,r.plant,r.group,'',i+1,Math.round(v*1e6)/1e6]))})});
  }else{
    lines.push(TEMPLATES.potential);
    model.rows.forEach(function(r){r.vms.forEach(function(v){lines.push(csvLine([q,r.plant,'',r.group,v.seg||'All',v.x&&+v.x.potential_value_inr>0?v.x.potential_value_inr:'',v.x&&+v.x.potential_qty_sheets>0?v.x.potential_qty_sheets:'',v.x&&+v.x.potential_qty_sqft>0?v.x.potential_qty_sqft:'',v.src||'branch estimate',v.note||'',(v.x&&v.x.owner_email)||u.email]))})});
  }
  return lines.join('\n')+'\n';
}
/* ---------- events ---------- */
function tpRerender(){S.lastHtml='';schedule()}
function tpLink(key,field,val,touched){
  /* Share % and Target ₹ move each other; the last one touched wins */
  var e=S.tp.ed[key]=S.tp.ed[key]||{};
  var model=tpModel(),vm=null;model.rows.forEach(function(r){r.vms.concat(r.kids).forEach(function(v){if(v.key===key)vm=v})});
  if(!vm)return;
  if(field==='pot'){
    e.pot=val;var pot=tpNum(val);
    if(pot==null){if(e.touch!=='tgt')delete e.tgt;return}
    if(e.touch==='tgt'&&tpNum(e.tgt)!=null&&pot>0){e.share=String(Math.round(tpNum(e.tgt)/pot*100*1e8)/1e8)}
    else{var sh=e.share!==undefined?tpNum(e.share):(vm.x&&vm.x.share_pct!==''&&vm.x.share_pct!=null?+vm.x.share_pct:null);if(sh!=null)e.tgt=tpIN(leafTgt(pot,sh))}
  }else if(field==='share'){
    e.share=val;e.touch='share';var s=tpNum(val),p=e.pot!==undefined?tpNum(e.pot):vm.pot;
    if(s!=null&&p!=null)e.tgt=tpIN(leafTgt(p,s));else if(s==null)delete e.tgt;
  }else if(field==='tgt'){
    e.tgt=val;e.touch='tgt';var t=tpNum(val),p2=e.pot!==undefined?tpNum(e.pot):vm.pot;
    if(t!=null&&p2!=null&&p2>0)e.share=String(Math.round(t/p2*100*1e8)/1e8);
  }
}
document.addEventListener('input',function(ev){
  var t=ev.target,f=t.getAttribute&&t.getAttribute('data-tp');if(!f)return;
  if(f==='rettext'){S.tp.retText=t.value;return}
  var key=t.getAttribute('data-key');
  if(f==='phc'){var st=S.tp.ph[t.getAttribute('data-g')];if(st)st.c[+t.getAttribute('data-i')]=t.value;return}
  if(!key)return;
  var e=S.tp.ed[key]=S.tp.ed[key]||{};
  if(f==='pot'||f==='share'||f==='tgt')e[f]=t.value;else if(f==='note')e.note=t.value;else if(f==='sh'||f==='sq')e[f]=t.value;
});
document.addEventListener('change',function(ev){
  var t=ev.target,f=t.getAttribute&&t.getAttribute('data-tp');if(!f)return;
  var key=t.getAttribute('data-key');
  if(f==='q'){S.tp.q=t.value;S.tp.ed={};S.tp.ph={};S.tp.sel={};S.tp.ret=false;S.tp.msg='';S.upMsg='';S.lastTop=null;tpRerender();return}
  if(f==='plant'){S.tp.plant=t.value;S.tp.msg='';tpRerender();return}
  if(f==='seg'){S.tp.seg=t.checked;tpRerender();return}
  if(f==='sel'){if(t.checked)S.tp.sel[key]=1;else delete S.tp.sel[key];tpRerender();return}
  if(f==='src'){var e=S.tp.ed[key]=S.tp.ed[key]||{};e.src=t.value;tpRerender();return}
  if(f==='pot'||f==='share'||f==='tgt'){var nv=t.value;if((f==='pot'||f==='tgt')&&tpNum(nv)!=null)nv=tpIN(tpNum(nv));tpLink(key,f,nv);tpRerender();return}
  if(f==='note'||f==='sh'||f==='sq'){var e2=S.tp.ed[key]=S.tp.ed[key]||{};e2[f]=(f!=='note'&&tpNum(t.value)!=null)?tpIN(tpNum(t.value)):t.value;tpRerender();return}
  if(f==='ph'){var g=t.getAttribute('data-g'),st=S.tp.ph[g]||(S.tp.ph[g]={m:t.value,c:['','','']});st.m=t.value;
    if(st.m==='custom'&&st.c.every(function(c){return c===''})){var model=tpModel(),row=model.rows.find(function(r){return r.gkey===g});if(row){var vm=row.main||row.vms[0],x=vm&&vm.x||{fy_quarter:model.q,plant_code:row.plant,product_group:row.group,customer_segment:'All'};st.c=phasingFor(x).map(function(v){return String(r2(v))})}}
    tpRerender();return}
  if(f==='phc'){var st2=S.tp.ph[t.getAttribute('data-g')];if(st2)st2.c[+t.getAttribute('data-i')]=t.value;tpRerender();return}
});
/* details open state survives a redraw (toggle does not bubble, so listen in the capture phase) */
document.addEventListener('toggle',function(ev){var d=ev.target;if(d&&d.getAttribute&&d.getAttribute('data-okey')){if(d.open)S.tp.open[d.getAttribute('data-okey')]=1;else delete S.tp.open[d.getAttribute('data-okey')]}},true);
Object.assign(handlers,{
 'tp-save':function(){return tpSave()},
 'tp-copy':function(){return tpCopy()},
 'tp-submit':function(){return tpSubmitOpen()},
 'tp-submit-go':function(){return tpSubmitGo()},
 'tp-approve':function(){return tpApprove()},
 'tp-return-open':function(){S.tp.ret=true;tpRerender()},
 'tp-return-cancel':function(){S.tp.ret=false;S.tp.retText='';tpRerender()},
 'tp-return-go':function(){return tpReturn()},
 'tp-tmpl':function(t){var k=t.getAttribute('data-t');return download((k==='phasing'?'target-phasing':'market-potential')+'-'+tpQ()+'.csv',tpTemplateCsv(k))},
 'tp-lock-open':function(){
   if(!tpCanApprove()){toast('Only Management / HO or Super admin can lock a quarter');return}
   var q=tpQ(),n=S.potential.filter(function(x){return x.fy_quarter===q&&x.status==='Approved'}).length,d=S.potential.filter(function(x){return x.fy_quarter===q&&x.status!=='Approved'&&x.status!=='Locked'}).length;
   openDlg('<h3>Lock '+qLabel(q)+'?</h3><p class="note">Locking freezes the '+n+' Approved target'+(n===1?'':'s')+' of '+qLabel(q)+'. '+(d?d+' row'+(d===1?' is':'s are')+' still Draft or Proposed and will stay uncounted. ':'')+'A locked quarter cannot be edited by anyone and cannot be unlocked in v1.0.</p><div class="row"><button class="btn pri" data-act="tp-lock-go" data-q="'+q+'">Lock '+qLabel(q)+'</button><button class="btn" data-act="dlg-close">Cancel</button></div>')},
 'tp-lock-go':async function(t){await handlers['plan-lock'](t);closeDlg();S.lastHtml='';schedule()}
});
