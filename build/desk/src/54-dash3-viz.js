/* ================= My Dashboard, part 3: visuals (infographic style, same tokens and band colours as the Overview, D51) ================= */
var D_COL=['var(--g1)','var(--g2)','var(--g3)','var(--g4)','var(--orange)','var(--ink3)'];
function dFmt(unit,v,base){
  if(v==null||isNaN(v))return '—';
  switch(unit){
    case 'sh':return Math.abs(v)>=100000?oxLakh(v)+' lakh sheets':fmtN(Math.round(v))+' sheets';
    case 'inr':return fmtMoney(v);
    case 'inr1':return '₹'+fmtN(Math.round(v));
    case 'sq':return fmtN(Math.round(v))+' sq ft';
    case 'pct':return v.toFixed(1)+'%';
    case 'n':return fmtN(Math.round(v));
    case 'days':return Math.round(v)+' days';
    case 'score':return Math.round(v)+' / 100';
    case 'rank':return '#'+v;
    case 'pctl':return 'P'+Math.round(v);
    case 'idx':return Math.round(v);
    default:return String(Math.round(v*100)/100);
  }
}
function dFmtS(unit,v){/* short, for bars and axes */
  if(v==null||isNaN(v))return '—';
  if(unit==='sh')return Math.abs(v)>=100000?oxLakh(v)+' L':fmtN(Math.round(v));
  if(unit==='inr')return fmtMoney(v).replace(' Cr',' Cr').replace(' L',' L');
  if(unit==='pct')return v.toFixed(1)+'%';
  return dFmt(unit,v);
}
function dUnit(R){return R.meas.unit==='base'?(R.baseMeas?R.baseMeas.unit:'n'):R.meas.unit}
function dFmtV(R,v){var u=dUnit(R);if(R.meas.unit==='base'&&v!=null)return (v>0?'+':v<0?'−':'')+dFmt(u,Math.abs(v));return dFmt(u,v)}
function dFmtVS(R,v){var u=dUnit(R);if(R.meas.unit==='base'&&v!=null)return (v>0?'+':v<0?'−':'')+dFmtS(u,Math.abs(v));return dFmtS(u,v)}
function dQoqChip(q,lower,label){
  label=label||'QoQ';
  if(q&&q.state==='ok'){var up=q.v>=0,good=lower?!up:up;
    var txt=q.pp?q.txt:Math.abs(q.v).toFixed(1)+'%';
    return '<span class="ox-chip '+(good?'ok':'bad')+'">'+(up?'▲ ':'▼ ')+(q.pp?txt.replace(/^[+−]/,function(c){return c}):(up?'+':'−')+txt)+' '+label+'</span>';
  }
  return '<span class="ox-chip nl">'+label+' · '+esc((q&&q.txt)||'—')+'</span>';
}
function dBandChipOf(row){
  if(row.check)return '<span class="ox-chip warn">'+(row.check==='potential'?'Check potential':'Check target')+'</span>';
  if(row.ach!=null)return oxBandChip(row.ach);
  return '';
}
function dBandCls(row,meas){var b=dBandOf(meas,row);return b?' b'+b:''}
function dFirstLoaded(){var ms=Object.keys(S.cells).filter(function(k){return S.cells[k].entity==='INV'}).map(function(k){return S.cells[k].ym}).sort();return ms.length?ymLabel(ms[0]):''}
function dStMsg(r,R){
  var st=r.st,x=r.x||{};
  if(st==='loading')return 'Reading the stored detail…';
  if(st==='nodetail')return 'Not loaded: these months carry no thickness or brand detail. Reload them in Data Intake › Sales';
  if(st==='nocn')return 'Credit notes are not loaded for '+(x.unc&&x.unc.length?cnUncText(x.unc):'every plant and month in this period');
  if(st==='partial')return 'Credit notes are loaded for only some plants or months';
  if(st==='noplan')return x.why||'Target not set for this selection';
  if(st==='nopot')return 'Potential not set for this selection';
  if(st==='check')return x.what==='potential'?'Check potential: share is above '+ACH_MAX+'%':'Check target: achievement is above '+ACH_MAX+'%';
  if(st==='na')return x.why||'Not available for this selection';
  if(st==='norate')return 'Not rated: no measure could be ranked';
  var fl=dFirstLoaded();
  return 'Not loaded for this period'+(fl?'. Sales are loaded from '+fl:'');
}
function dEmpty(title,msg){return '<div class="ox-empty"><b>'+esc(title)+'</b><span>'+esc(msg)+'</span></div>'}
function dNoVal(r,R){return '<span class="ox-nl" title="'+esc(dStMsg(r,R))+'">'+esc(r.st==='check'?(r.check==='potential'?'Check potential':'Check target'):r.st==='loading'?'reading…':r.st==='noplan'?'no target':r.st==='nopot'?'no potential':r.st==='nocn'?'credit notes not loaded':'not loaded')+'</span>'}
function dPartialChip(r){var p=r.partial;return p?'<span class="ox-chip nl dsh-hat" '+oxTip('Partial: '+p.k+' of '+p.n+' months loaded for every plant in this selection')+'>partial '+p.k+' of '+p.n+' months</span>':''}
function dDrillAttr(R,r){return r.dim?' data-act="d-drill" data-c="'+esc(R.card.id)+'" data-k="'+esc(r.k)+'"':''}
function dLabelBtn(R,r){return r.dim?'<button class="dsh-lb" data-act="d-drill" data-c="'+esc(R.card.id)+'" data-k="'+esc(r.k)+'" title="Drill into '+esc(r.label)+'">'+esc(r.label)+' ›</button>':'<span>'+esc(r.label)+'</span>'}
function dSecondary(R,row){
  /* sheets are primary; the rupee value is the second line (D51) */
  if(R.meas.id!=='sheets'||!row.mem)return '';
  var a=dSales(row.mem.m,row.mem.w||R.res.cur);if(a.st!=='ok')return '';
  return '<p class="ox-sec mono">'+fmtMoney(a.net?a.net.n:a.raw.n)+' <span class="ox-unit">'+(a.net?'net value':'invoiced value')+'</span></p>';
}
function dSpark(series,key){return oxSpark((series||[]).map(function(s){return s.v}))}
function dTip(R,r){
  var t=r.label+' · '+(r.v==null?dStMsg(r,R):dFmtV(R,r.v));
  if(r.tgt!=null&&R.meas.unit==='sh')t+=' · target '+dFmt('sh',r.tgt);
  if(r.ach!=null)t+=' · Ach '+oxPct(r.ach)+'%';
  if(r.q&&r.q.state==='ok')t+=' · QoQ '+(r.q.pp?r.q.txt:(r.q.v>=0?'+':'−')+Math.abs(r.q.v).toFixed(1)+'%');
  else if(r.q)t+=' · QoQ '+(r.q.txt||'—');
  return t;
}
/* ---- visuals ---- */
function dvKpi(R,card){
  var rows=R.sortedRows||R.rows,bm=R.baseMeas||R.meas;
  if(R.by==='none'||rows.length===1&&!R.members[0].dim){
    var r=R.total||rows[0];dNeedSeries(R,1);
    var h='<div class="ox-hero dsh-hero"><div'+oxTip(dTip(R,r))+'>';
    if(r.v==null)h+='<div class="ox-big"><span class="ox-nl dsh-nl">'+esc(r.st==='check'?(r.check==='potential'?'Check potential':'Check target'):'Not loaded')+'</span></div><p class="note" style="margin:6px 0 0">'+esc(dStMsg(r,R))+'</p>';
    else{
      var u=dUnit(R),big=u==='sh'?(Math.abs(r.v)>=100000?oxLakh(r.v)+'<span class="ox-unit"> lakh sheets</span>':fmtN(Math.round(r.v))+'<span class="ox-unit"> sheets</span>'):u==='inr'?esc(fmtMoney(r.v)):esc(dFmt(u,r.v));
      h+='<div class="ox-big dsh-big">'+big+'</div><div class="ox-row" style="margin-top:6px">'+(R.snap?'<span class="ox-chip nl">as on '+esc(fmtDate((r.x&&r.x.asOf)||S.stockAsOf||S.recvAsOf||TODAY()))+'</span>':dQoqChip(r.q,R.lower))+dBandChipOf(r)+dPartialChip(r)+'</div>'+dSecondary(R,r);
    }
    h+='</div><div>';
    if(r.v!=null&&r.tgt>0)h+=oxBul({act:r.v,tgt:r.tgt,pot:r.pot,band:r.ach!=null?oxBand(r.ach):null,aria:'Actual '+dFmtV(R,r.v)+', target '+dFmtV(R,r.tgt)})+'<p class="note" style="margin:6px 0 0">'+(r.ach!=null?OX_MARK[oxBand(r.ach)]+' '+OX_LBL[oxBand(r.ach)]+' · '+oxPct(r.ach)+'% of '+dFmtS(R.meas.unit,r.tgt)+' target':'Check target')+'</p>';
    else if(r.v!=null&&bm.tgt)h+='<div class="ox-bul nl"></div><p class="note ox-nl" style="margin:6px 0 0">Target not loaded: no scale to draw against</p>';
    if(r.series&&!R.snap)h+='<div class="ox-row" style="margin-top:8px">'+dSpark(r.series)+'<span class="note">7 quarters'+(r.series.some(function(s){return s.v==null})?', gaps = not loaded':'')+'</span></div>';
    return h+'</div></div>';
  }
  /* breakdown: tile grid */
  var list=rows.slice(0,card.n&&card.n>0?Math.min(card.n,24):12);dNeedSeries(R,list.length);
  return '<div class="dsh-tiles">'+list.map(function(r){
    return '<button class="dsh-tile'+dBandCls(r,bm)+(r.dim?'':' nodrill')+'"'+dDrillAttr(R,r)+oxTip(dTip(R,r))+'><small>'+esc(r.label)+'</small><b class="mono">'+(r.v==null?dNoVal(r,R):esc(dFmtVS(R,r.v)))+'</b><span class="ox-row">'+(R.snap||R.noQoq?'':dQoqChip(r.q,R.lower))+(r.ach!=null?'<span class="ox-chip sm">'+oxPct(r.ach,0)+'%</span>':'')+'</span>'+(r.series&&!R.snap?dSpark(r.series):'')+'</button>';
  }).join('')+'</div>'+(rows.length>list.length?'<p class="note" style="margin:6px 0 0">Showing '+list.length+' of '+rows.length+'. Edit the card to show more, or use the table.</p>':'');
}
function dvBullet(R,card){
  var rows=(R.sortedRows||R.rows).slice(0,card.n||8),bm=R.baseMeas||R.meas;
  var mx=Math.max.apply(null,rows.map(function(r){return Math.max(r.v||0,r.tgt||0)}).concat([1]));
  return rows.map(function(r){
    var h='<div class="dsh-row"><div class="h">'+dLabelBtn(R,r)+'<span class="mono">'+(r.v==null?dNoVal(r,R):'<b>'+esc(dFmtVS(R,r.v))+'</b>'+(r.tgt>0?' <span class="note">of '+esc(dFmtVS(R,r.tgt))+'</span>':''))+'</span></div>';
    if(r.v!=null&&r.tgt>0)h+=oxBul({act:r.v,tgt:r.tgt,pot:Math.max(mx,r.tgt)*1.0,band:r.ach!=null?oxBand(r.ach):null,aria:dTip(R,r)});
    else h+='<div class="ox-bul nl" role="img" aria-label="'+esc(dStMsg(r,R))+'"></div>';
    return h+'<div class="ox-row">'+dBandChipOf(r)+(R.snap?'':dQoqChip(r.q,R.lower))+dPartialChip(r)+(r.tgt>0||r.v==null?'':'<span class="ox-chip nl">no target</span>')+'</div></div>';
  }).join('')||dEmpty('Nothing to draw','No members in scope.');
}
function dvBar(R,card){
  var bm=R.baseMeas||R.meas;
  if(R.timeDim){
    var rows=R.rows,W=Math.max(240,rows.length*38),H=120,vals=rows.map(function(r){return r.v}).filter(function(v){return v!=null}),mx=Math.max.apply(null,vals.concat([1])),sl=W/rows.length;
    var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(R.meas.label+' by '+D_BY[R.by]+': '+rows.map(function(r){return r.label+' '+(r.v==null?'not loaded':dFmtVS(R,r.v))}).join(', '))+'"><defs><pattern id="dh'+esc(R.card.id)+'" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--act)" opacity=".35"/><rect width="2.5" height="6" fill="var(--act)"/></pattern></defs>';
    rows.forEach(function(r,i){var bx=i*sl+5,w=sl-10,tip=dTip(R,r)+(r.partialTime?' · to date (partial)':'');
      s+='<g'+oxTip(tip)+(r.dim?' class="dsh-g" data-act="d-drill" data-c="'+esc(R.card.id)+'" data-k="'+esc(r.k)+'"':'')+'>';
      if(r.v==null)s+='<rect x="'+bx.toFixed(1)+'" y="40" width="'+w.toFixed(1)+'" height="40" rx="3" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="'+(bx+w/2).toFixed(1)+'" y="64" text-anchor="middle" style="font-size:8px">n/l</text>';
      else{var h=Math.max(1,r.v/mx*70);s+='<rect x="'+bx.toFixed(1)+'" y="'+(88-h).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3" fill="'+(r.partialTime?'url(#dh'+esc(R.card.id)+')':'var(--act)')+'"/><text x="'+(bx+w/2).toFixed(1)+'" y="'+(84-h).toFixed(1)+'" text-anchor="middle" style="font-size:9px;font-weight:700;fill:var(--ink)">'+esc(dFmtVS(R,r.v))+'</text>'}
      s+='<text x="'+(bx+w/2).toFixed(1)+'" y="104" text-anchor="middle" class="st" style="font-size:9px">'+esc(r.label.replace(' to date','*').replace(' so far','*').replace(/ FY/,' ·'))+'</text></g>';});
    return s+'</svg><p class="note" style="margin:0">'+(rows.some(function(r){return r.partialTime})?'* to date, hatched = partial. ':'')+'n/l = not loaded.</p>';
  }
  var list=(R.sortedRows||R.rows).slice(0,card.n||10),mx2=Math.max.apply(null,list.map(function(r){return Math.max(r.v||0,r.tgt||0)}).concat([1]));
  return '<div class="dsh-bars">'+list.map(function(r,i){
    var b=dBandOf(bm,r),pc=r.v==null?0:Math.max(1,r.v/mx2*100),tg=r.tgt>0?Math.min(100,r.tgt/mx2*100):null;
    return '<div class="dsh-bar"'+oxTip(dTip(R,r))+'><span class="nm">'+dLabelBtn(R,r)+'</span><div class="ox-bul"><div class="f'+(b?' b'+b:'')+'" style="width:'+pc.toFixed(1)+'%"></div>'+(tg!=null?'<div class="tg" style="left:'+tg.toFixed(1)+'%"></div>':'')+'</div><span class="mono v">'+(r.v==null?dNoVal(r,R):esc(dFmtVS(R,r.v)))+'</span>'+(R.snap||R.noQoq?'':'<span class="q">'+dQoqChip(r.q,R.lower)+'</span>')+'</div>';
  }).join('')+'</div>'+((R.sortedRows||R.rows).length>list.length?'<p class="note" style="margin:6px 0 0">Top '+list.length+' of '+(R.rows.length)+'. Edit the card to change N.</p>':'');
}
function dvStacked(R,card){
  var bm=R.baseMeas||R.meas,rows=(R.sortedRows||R.rows).filter(function(r){return r.v!=null&&r.v>0}).slice(0,6);dNeedSeries(R,6);
  if(!rows.length)return dEmpty('Nothing to stack','No member has a value in this period.');
  var qs=dQuarters(),n=qs.length,tot=R.total&&R.total.series,W=Math.max(260,n*44),H=140,sl=W/n;
  var colMax=0,cols=qs.map(function(q,i){var segs=rows.map(function(r){var v=r.series&&r.series[i].v;return v==null?null:v}),sum=segs.reduce(function(a,b){return a+(b||0)},0),t=tot&&tot[i].v,other=t!=null&&t>sum?t-sum:0,loaded=segs.some(function(v){return v!=null});colMax=Math.max(colMax,sum+other);return {segs:segs,other:other,sum:sum,loaded:loaded,q:q}});
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(R.meas.label+' by '+D_BY[R.by]+', stacked, 7 quarters')+'">';
  cols.forEach(function(c,i){var bx=i*sl+6,w=sl-12,y=108;
    if(!c.loaded){s+='<rect x="'+bx.toFixed(1)+'" y="50" width="'+w.toFixed(1)+'" height="56" rx="3" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="'+(bx+w/2).toFixed(1)+'" y="82" text-anchor="middle" style="font-size:8px">n/l</text>'}
    else{
      rows.forEach(function(r,k){var v=c.segs[k];if(!v)return;var h=v/colMax*84;y-=h;s+='<rect x="'+bx.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+Math.max(h,0.5).toFixed(1)+'" fill="'+D_COL[k]+'" stroke="var(--card)" stroke-width=".8"'+oxTip(c.q.label+' · '+r.label+' · '+dFmtV(R,v))+'/>'});
      if(c.other>0){var h2=c.other/colMax*84;y-=h2;s+='<rect x="'+bx.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h2.toFixed(1)+'" fill="var(--track)" stroke="var(--ink3)" stroke-width=".8" stroke-dasharray="3 2"'+oxTip(c.q.label+' · other members · '+dFmtV(R,c.other))+'/>'}
      s+='<text x="'+(bx+w/2).toFixed(1)+'" y="'+(y-4).toFixed(1)+'" text-anchor="middle" style="font-size:9px;font-weight:700;fill:var(--ink)">'+esc(dFmtVS(R,c.sum+c.other))+'</text>';
    }
    s+='<text x="'+(bx+w/2).toFixed(1)+'" y="126" text-anchor="middle" class="st" style="font-size:9px">'+esc(c.q.label.replace(' FY',' ·')+(c.q.isCur?'*':''))+'</text>';});
  s+='</svg><div class="ox-legend">'+rows.map(function(r,k){return '<span><i class="sw" style="background:'+D_COL[k]+'"></i>'+esc(r.label)+'</span>'}).join('')+'<span><i class="sw" style="background:var(--track);border:1px dashed var(--ink3)"></i>Other</span></div><p class="note" style="margin:0">* quarter to date. n/l = not loaded. Top 6 members of '+R.rows.length+'; the rest is "Other".</p>';
  return s;
}
function dvLine(R,card){
  var bm=R.baseMeas||R.meas,lines=[],labels,xs;
  if(R.timeDim){labels=R.rows.map(function(r){return r.label});lines=[{name:R.meas.label,vals:R.rows.map(function(r){return r.v}),color:'var(--act)',partialLast:R.rows.length&&R.rows[R.rows.length-1].partialTime}]}
  else{
    labels=dQuarters().map(function(q){return q.label.replace(' FY',' ·')+(q.isCur?'*':'')});
    if(R.by==='none'){dNeedSeries(R,1);var t=R.total||R.rows[0];lines=[{name:R.meas.label,vals:(t.series||[]).map(function(s){return s.v}),color:'var(--act)',partialLast:true}]}
    else{var top=(R.sortedRows||R.rows).filter(function(r){return r.v!=null}).slice(0,Math.min(card.n||5,6));dNeedSeries(R,top.length);top.forEach(function(r,i){lines.push({name:r.label,vals:(r.series||[]).map(function(s){return s.v}),color:D_COL[i],partialLast:true})})}
  }
  var all=[];lines.forEach(function(l){l.vals.forEach(function(v){if(v!=null)all.push(v)})});
  if(all.length<2)return dEmpty('Not enough history','A line needs at least two loaded points. Shown as not loaded, never as zero.');
  var mn=Math.min.apply(null,all.concat([0])),mx=Math.max.apply(null,all),n=labels.length,W=300,H=140,px=function(i){return 30+i*((W-60)/Math.max(1,n-1))},py=function(v){return 14+(1-(v-mn)/Math.max(1e-9,mx-mn))*(H-46)};
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(R.meas.label+' trend: '+lines.map(function(l){return l.name}).join(', '))+'">';
  lines.forEach(function(l){var seg=[],prev=null;
    l.vals.forEach(function(v,i){if(v==null){seg.push(null);return}seg.push([px(i),py(v)])});
    var run=[];seg.forEach(function(p,i){if(p)run.push(p);if(!p||i===seg.length-1){if(run.length>1)s+='<polyline points="'+run.map(function(q){return q[0].toFixed(1)+','+q[1].toFixed(1)}).join(' ')+'" fill="none" stroke="'+l.color+'" stroke-width="2.2"/>';run=[]}});
    l.vals.forEach(function(v,i){if(v==null)return;var last=i===l.vals.length-1&&l.partialLast;s+='<circle cx="'+px(i).toFixed(1)+'" cy="'+py(v).toFixed(1)+'" r="'+(last?4:3)+'" fill="'+(last?'var(--card)':l.color)+'" stroke="'+l.color+'" stroke-width="2"'+oxTip(l.name+' · '+labels[i]+' · '+dFmtV(R,v))+' tabindex="0"/>';
      if(lines.length===1&&n<=8)s+='<text x="'+px(i).toFixed(1)+'" y="'+(py(v)-8).toFixed(1)+'" text-anchor="middle" style="font-size:8.5px;font-weight:700;fill:var(--ink)">'+esc(dFmtVS(R,v))+'</text>'});
  });
  labels.forEach(function(l,i){s+='<text x="'+px(i).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" class="st" style="font-size:8.5px">'+esc(l)+'</text>'});
  s+='</svg>';
  if(lines.length>1)s+='<div class="ox-legend">'+lines.map(function(l){return '<span><i class="sw" style="background:'+l.color+'"></i>'+esc(l.name)+'</span>'}).join('')+'</div>';
  return s+'<p class="note" style="margin:0">Hollow point = quarter to date. Gaps = not loaded.</p>';
}
function dvDonut(R,card){
  var rows=(R.sortedRows||R.rows).filter(function(r){return r.v!=null&&r.v>0}),top=rows.slice(0,6),rest=rows.slice(6),oth=rest.reduce(function(a,r){return a+r.v},0),tot=rows.reduce(function(a,r){return a+r.v},0);
  if(!rows.length)return dEmpty('Nothing to split','No member has a value in this period.');
  var parts=top.map(function(r,i){return {label:r.label,v:r.v,c:D_COL[i],r:r}});if(oth>0)parts.push({label:'Other ('+rest.length+')',v:oth,c:'var(--track)',r:null});
  var C=2*Math.PI*40,off=0,s='<svg viewBox="0 0 120 120" class="dsh-donut" role="img" aria-label="'+esc(R.meas.label+' by '+D_BY[R.by]+': '+parts.map(function(p){return p.label+' '+(p.v/tot*100).toFixed(1)+'%'}).join(', '))+'"><g transform="rotate(-90 60 60)">';
  parts.forEach(function(p){var len=p.v/tot*C;s+='<circle cx="60" cy="60" r="40" fill="none" stroke="'+p.c+'" stroke-width="18" stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'"'+oxTip(p.label+' · '+dFmtV(R,p.v)+' · '+(p.v/tot*100).toFixed(1)+'% of the total')+(p.r&&p.r.dim?' class="dsh-g" data-act="d-drill" data-c="'+esc(R.card.id)+'" data-k="'+esc(p.r.k)+'"':'')+'/>';off+=len});
  s+='</g><text x="60" y="58" text-anchor="middle" style="font-size:11px;font-weight:800;fill:var(--ink)">'+esc(dFmtVS(R,tot))+'</text><text x="60" y="71" text-anchor="middle" style="font-size:7px">total</text></svg>';
  var partial=R.nodetail||(R.rows.some(function(r){return r.x&&r.x.partialDetail}));
  return '<div class="dsh-dn">'+s+'<div class="dsh-dl">'+parts.map(function(p){return '<div>'+(p.r&&p.r.dim?'<button class="dsh-lb" data-act="d-drill" data-c="'+esc(R.card.id)+'" data-k="'+esc(p.r.k)+'">':'<span>')+'<i class="sw" style="background:'+p.c+'"></i>'+esc(p.label)+(p.r&&p.r.dim?' ›</button>':'</span>')+'<b class="mono">'+(p.v/tot*100).toFixed(1)+'%</b></div>'}).join('')+'</div></div>'+(partial?'<p class="note" style="margin:0"><b>Loaded plants only.</b> Some plant-months carry no item detail; shares are of the loaded plants.</p>':'');
}
function dvRanked(R,card){
  var bm=R.baseMeas||R.meas,all=R.sortedRows||R.rows,n=card.n||5,dir=card.dir||'top';
  if(R.meas.kind==='rating'&&R.rating){
    var rated=R.rating.RT.rows.filter(function(b){return b.score!=null}).sort(function(a,b){return dir==='bottom'?a.score-b.score:b.score-a.score});
    if(rated.length<2)return dEmpty('Needs at least 2 branches','The rating ranks branches against each other. Shown as not rated, never as a star.')+dRatingNote();
    return rated.slice(0,n).map(function(b,i){return oxRatingRow(b,dir==='bottom'?rated.length-i:i+1,R.rating.basis)}).join('')+dRatingNote();
  }
  var list=all.filter(function(r){return r.v!=null}).slice(0,n);
  if(!list.length)return dEmpty('Nothing to rank',all.length?dStMsg(all[0],R):'No members in scope.');
  var mx=Math.max.apply(null,list.map(function(r){return Math.abs(r.v)}).concat([1]));
  return list.map(function(r,i){var b=dBandOf(bm,r);
    return '<div class="dsh-rk"'+oxTip(dTip(R,r))+'><b class="mono rk">'+(i+1)+'</b><span class="nm">'+dLabelBtn(R,r)+'</span><div class="ox-bul"><div class="f'+(b?' b'+b:'')+'" style="width:'+Math.max(2,Math.abs(r.v)/mx*100).toFixed(1)+'%"></div></div><span class="mono v">'+esc(dFmtVS(R,r.v))+'</span><span class="q">'+(R.snap||R.noQoq?'':dQoqChip(r.q,R.lower))+'</span></div>'}).join('')
   +'<p class="note" style="margin:6px 0 0">'+(dir==='bottom'?'Bottom ':'Top ')+list.length+' of '+all.length+', by '+(card.sortBy==='qoq'?'QoQ %':'value')+(R.lower?' (lower is better)':'')+'.</p>';
}
function dRatingNote(){return '<p class="note" style="margin:6px 0 0"><b>Informational only.</b> Not for incentives or disciplinary action; those are SP Sir\'s decision alone.</p>'}
function dvHeat(R,card){
  var bm=R.baseMeas||R.meas,list=(R.sortedRows||R.rows).filter(function(r){return r.v!=null}).slice(0,card.n&&card.n>=5?Math.min(card.n,30):15),months=dNeedMonths(R,list.length);
  if(!list.length)return dEmpty('Nothing to draw','No member has a value in this period.');
  var mx=0;list.forEach(function(r){(r.ms||[]).forEach(function(c){if(c.v!=null&&c.v>mx)mx=c.v})});
  var h='<div class="dsh-hm" style="--cols:'+months.length+'"><div class="hr hh"><span></span>'+months.map(function(m){return '<span class="mono" style="font-size:10px">'+esc(MON[+m.slice(5,7)-1]+' '+m.slice(2,4))+(m===TODAY().slice(0,7)?'*':'')+'</span>'}).join('')+'</div>';
  list.forEach(function(r){
    h+='<div class="hr"><span class="nm">'+dLabelBtn(R,r)+'</span>'+(r.ms||[]).map(function(c){
      if(c.v==null)return '<span class="c nl"'+oxTip(r.label+' · '+ymLabel(c.ym)+' · not loaded')+'>n/l</span>';
      var pc=mx>0?Math.max(6,c.v/mx*80):6;
      return '<span class="c'+(c.partial?' pt':'')+'" style="background:color-mix(in srgb,var(--act) '+pc.toFixed(0)+'%,var(--card))"'+oxTip(r.label+' · '+ymLabel(c.ym)+' · '+dFmtV(R,c.v)+(c.partial?' (month to date)':''))+'>'+esc(dFmtVS(R,c.v))+'</span>'}).join('')+'</div>';
  });
  return h+'</div><p class="note" style="margin:6px 0 0">Darker = higher. * month to date. n/l = not loaded, never zero. '+list.length+' of '+R.rows.length+' members.</p>';
}
function dvTable(R,card){
  if(R.meas.kind==='rating'&&R.rating)return oxRatingTable(R.rating.RT)+dRatingNote();
  var bm=R.baseMeas||R.meas,all=R.sortedRows||R.rows,lim=S.dash.more[R.card.id]?300:(card.n&&card.n>0?Math.max(card.n,5):12),list=all.slice(0,lim);
  var tot=R.total&&R.total.v,hasT=all.some(function(r){return r.tgt!=null}),hasShare=bm.add&&R.by!=='none'&&!R.timeDim&&tot>0;
  var person=R.meas.kind==='person',bench=R.meas.kind==='bench';
  var h='<div class="tw dsh-tw"><table class="std"><thead><tr><th>'+esc(D_BY[R.by]||'Member')+'</th>'+(person?'<th>Person</th>':'')+'<th class="num">'+esc(R.meas.label)+'</th>'+(R.snap||R.noQoq?'':'<th class="num">QoQ</th>')+(hasT?'<th class="num">Target</th><th class="num">Ach %</th>':'')+((hasShare||person)?'<th class="num">Share</th>':'')+(person?'<th class="num">On-time closure</th>':'')+(bench?'<th class="num">Best</th><th class="num">Median</th><th class="num">Rank</th><th class="num">Pctl</th>':'')+'</tr></thead><tbody>';
  list.forEach(function(r){
    h+='<tr'+(r.dim?' class="clk" data-act="d-drill" data-c="'+esc(R.card.id)+'" data-k="'+esc(r.k)+'"':'')+'><td><b>'+esc(r.label)+'</b>'+(r.dim?' ›':'')+'</td>'+(person?'<td>'+esc(r.user||'')+'</td>':'')+'<td class="num">'+(r.v==null?dNoVal(r,R):esc(dFmtV(R,r.v)))+(r.partial?' '+dPartialChip(r):'')+'</td>'
     +(R.snap||R.noQoq?'':'<td class="num">'+(r.q&&r.q.state==='ok'?'<span class="'+((r.q.v>=0)!==!!R.lower?'up':'dn')+'">'+esc(r.q.pp?r.q.txt:fmtPct(r.q.v,true))+'</span>':'<span class="note">'+esc((r.q&&r.q.txt)||'—')+'</span>')+'</td>')
     +(hasT?'<td class="num">'+(r.tgt!=null?esc(dFmtVS(R,r.tgt)):'<span class="ox-nl">not set</span>')+'</td><td class="num">'+(r.check?'<b class="a-orange">Check target</b>':r.ach!=null?'<b>'+oxPct(r.ach)+'%</b>':'<span class="note">—</span>')+'</td>':'')
     +((hasShare||person)?'<td class="num">'+(person?(r.share!=null?r.share.toFixed(1)+'%':'—'):(r.v!=null&&tot>0?(r.v/tot*100).toFixed(1)+'%':'—'))+'</td>':'')
     +(person?'<td class="num">'+(r.closure!=null?r.closure.toFixed(0)+'% <span class="note">of '+r.closureN+'</span>':'<span class="note">—</span>')+'</td>':'')
     +(bench?'<td class="num">'+esc(dFmtS(dUnit(R),R.stats&&R.stats.best))+'</td><td class="num">'+esc(dFmtS(dUnit(R),R.stats&&R.stats.med))+'</td><td class="num">'+(r.rank||'—')+'</td><td class="num">'+(r.pctl!=null?'P'+Math.round(r.pctl):'—')+'</td>':'')+'</tr>';
  });
  if(R.total&&R.by!=='none'&&!bench&&!person)h+='<tr class="tot"><td>Total</td><td class="num">'+(R.total.v==null?'—':esc(dFmtV(R,R.total.v)))+'</td>'+(R.snap||R.noQoq?'':'<td class="num">'+(R.total.q&&R.total.q.state==='ok'?esc(R.total.q.pp?R.total.q.txt:fmtPct(R.total.q.v,true)):'<span class="note">'+esc((R.total.q&&R.total.q.txt)||'—')+'</span>')+'</td>')+(hasT?'<td class="num">'+(R.total.tgt!=null?esc(dFmtVS(R,R.total.tgt)):'—')+'</td><td class="num">'+(R.total.ach!=null?oxPct(R.total.ach)+'%':'—')+'</td>':'')+(hasShare?'<td class="num">100%</td>':'')+'</tr>';
  h+='</tbody></table></div>';
  if(all.length>list.length)h+='<button class="btn sm" data-act="d-more" data-c="'+esc(R.card.id)+'">Show all '+all.length+'</button>';
  if(person&&R.noPlanNote)h+='<p class="note" style="margin:6px 0 0">'+esc(R.noPlanNote)+'</p>';
  return h;
}
function dvMultiples(R,card){
  var bm=R.baseMeas||R.meas,list=(R.sortedRows||R.rows).slice(0,card.n&&card.n>=4?Math.min(card.n,24):12);dNeedSeries(R,list.length);
  if(!list.length)return dEmpty('Nothing to draw','No members in scope.');
  return '<div class="dsh-tiles ms">'+list.map(function(r){
    return '<button class="dsh-tile'+dBandCls(r,bm)+(r.dim?'':' nodrill')+'"'+dDrillAttr(R,r)+oxTip(dTip(R,r))+'><small>'+esc(r.label)+'</small><b class="mono">'+(r.v==null?dNoVal(r,R):esc(dFmtVS(R,r.v)))+'</b><span class="ox-row">'+(R.snap?'':dQoqChip(r.q,R.lower))+(r.ach!=null?'<span class="ox-chip sm">'+OX_MARK[oxBand(r.ach)]+' '+oxPct(r.ach,0)+'%</span>':'')+'</span>'+(r.series&&!R.snap?dSpark(r.series):'<span class="note">no history</span>')+'</button>';
  }).join('')+'</div>'+((R.rows.length>list.length)?'<p class="note" style="margin:6px 0 0">Showing '+list.length+' of '+R.rows.length+' members.</p>':'');
}
function dvBench(R,card){
  var list=(R.sortedRows||R.rows).filter(function(r){return r.v!=null}),bm=R.baseMeas||R.meas;
  if(list.length<2)return dEmpty('Needs at least 2 members','A benchmark compares members with each other. '+(list.length?'Only one member has a value here.':'No member has a value.'))+(R.meas.kind==='bench'?'':'');
  var st=R.stats||dBench(R.rows,'x',!!bm.lower),n=card.n&&card.n>=5?Math.min(card.n,30):15,vals=list.map(function(r){return r.bv!=null?r.bv:r.v});
  /* a bench measure reads value, the base value is what the track shows */
  var bvOf=function(r){return r.bv!=null?r.bv:r.v},mx=Math.max.apply(null,vals.concat([st.best||0,1])),pos=function(v){return Math.max(0,Math.min(100,v/mx*100))};
  var bu=R.meas.kind==='bench'?(R.baseMeas.unit):R.meas.unit;
  var ordered=list.slice().sort(function(a,b){return bm.lower?bvOf(a)-bvOf(b):bvOf(b)-bvOf(a)}).slice(0,n);
  var h='<div class="ox-legend"><span><i class="k-tg" style="display:inline-block"></i>Best '+esc(dFmtS(bu,st.best))+'</span><span><i class="k-run" style="display:inline-block"></i>Median '+esc(dFmtS(bu,st.med))+'</span><span>'+st.n+' members'+(bm.lower?' · lower is better':'')+'</span></div>';
  ordered.forEach(function(r){var v=bvOf(r),b=oxBand(100);
    h+='<div class="dsh-row"'+oxTip(r.label+' · '+dFmt(bu,v)+' · rank '+r.rank+' of '+st.n+' · percentile '+Math.round(r.pctl)+' · gap to best '+dFmtS(bu,r.gapBest)+' · gap to median '+dFmtS(bu,r.gapMed)+' · index '+Math.round(r.idx||0))+'><div class="h">'+dLabelBtn(R,r)+'<span class="mono"><b>'+esc(dFmtS(bu,v))+'</b> <span class="note">#'+r.rank+' · P'+Math.round(r.pctl)+'</span></span></div>'
     +'<div class="ox-bul"><div class="f" style="width:'+pos(v).toFixed(1)+'%"></div><div class="lq" style="left:'+pos(st.med).toFixed(1)+'%"></div><div class="tg" style="left:'+pos(st.best).toFixed(1)+'%"></div></div>'
     +'<div class="ox-row"><span class="note">'+(r.gapMed==null?'':(r.gapMed>=0?'+':'−')+esc(dFmtS(bu,Math.abs(r.gapMed)))+' vs median')+(r.gapBest!=null&&r.gapBest!==0?' · '+(r.gapBest>=0?'+':'−')+esc(dFmtS(bu,Math.abs(r.gapBest)))+' vs best':' · best')+'</span></div></div>'});
  if(R.meas.kind==='bench'&&R.meas.bench!=='rank'){h+='<p class="note" style="margin:6px 0 0">Showing the base measure ('+esc(R.baseMeas.label)+') against the best and median; the measure chosen ('+esc(R.meas.label)+') is in the tooltip and table.</p>'}
  return h;
}
function dvCoverage(R,card){
  var dh=R.dh,st={ok:['b4','Loaded','●'],part:['b3','Partial','◐'],miss:['b1','Missing','○']};
  var h='<div class="tw"><table class="std dsh-cov"><thead><tr><th>Export</th>'+dh.qs.map(function(q){return '<th>'+esc(qLabel(q))+'</th>'}).join('')+'<th>Last loaded</th></tr></thead><tbody>';
  dh.cov.forEach(function(r){var row=dh.rows.find(function(x){return x.k===r.ent});
    h+='<tr><td><b>'+esc(r.label)+'</b></td>'+r.cells.map(function(c){var s=st[c.st]||st.miss;return '<td><span class="ox-chip '+s[0]+'">'+s[2]+' '+s[1]+'</span></td>'}).join('')+'<td class="note">'+(row&&row.up?esc(istStr(row.up.at)):'<span class="ox-nl">never</span>')+'</td></tr>'});
  return h+'</tbody></table></div><p class="note" style="margin:6px 0 0">Loaded = at least 90% of plants in every month; partial = some; missing = none. Same grid as Data Intake.</p>';
}
function dvDhTile(R,card){
  var dh=R.dh,id=R.meas.id;
  if(id==='dh_cov')return '<div class="ox-big dsh-big">'+(dh.pct==null?'—':dh.pct.toFixed(0)+'%')+'</div><p class="note">of the export-quarters in the last four quarters are fully loaded.</p>'+dvCoverage(R,card);
  if(id==='dh_last')return '<div class="ox-tile-big">'+(dh.last?esc(istStr(dh.last)):'<span class="ox-nl">No upload yet</span>')+'</div><p class="note" style="margin:0">Most recent successful load (IST).</p><div class="tw"><table class="std"><thead><tr><th>Export</th><th>Last loaded</th><th>By</th></tr></thead><tbody>'+dh.rows.map(function(r){return '<tr><td>'+esc(r.label)+'</td><td>'+(r.up?esc(istStr(r.up.at)):'<span class="ox-nl">never</span>')+'</td><td class="note">'+esc(r.up?r.up.by||'':'')+'</td></tr>'}).join('')+'</tbody></table></div>';
  return '<div class="ox-big dsh-big">'+fmtN(dh.rej)+'<span class="ox-unit"> rows skipped</span></div><p class="note">In the latest load of each export.</p><div class="tw"><table class="std"><thead><tr><th>Export</th><th class="num">Skipped</th><th class="num">Read</th></tr></thead><tbody>'+dh.rows.map(function(r){return '<tr><td>'+esc(r.label)+'</td><td class="num">'+(r.up?fmtN(r.v):'<span class="ox-nl">n/l</span>')+'</td><td class="num">'+(r.up?fmtN(r.read):'')+'</td></tr>'}).join('')+'</tbody></table></div>';
}
var D_DRAW={kpi:dvKpi,bullet:dvBullet,bar:dvBar,stacked:dvStacked,line:dvLine,donut:dvDonut,ranked:dvRanked,heat:dvHeat,table:dvTable,multiples:dvMultiples,bench:dvBench,coverage:dvCoverage};
/* effective card = saved card + this session's drill-down steps (never saved) */
function dEff(card){
  var d=S.dash.dr[card.id];if(!d)return card;
  var o=Object.assign({},card);if(d.by)o.by=d.by;o.drill=(card.drill||[]).concat(d.stack||[]);if(d.period)o.period=d.period;
  if(d.by&&!MEAS[o.measure].fixedBy){var fit=dVisFit(o);if(fit[o.visual])o.visual=dAutoVisual(o)}
  return o;
}
function dBodyHtml(card){
  var eff=dEff(card),R=dRun(eff);
  if(R.err)return '<div class="ox-empty"><b>This card could not be drawn</b><span>'+esc(R.err)+'</span></div>';
  if(R.locked)return '<div class="ox-empty"><b>Locked for your role</b><span>'+esc(R.why)+'. Row-level access applies to every card.</span></div>';
  if(R.empty)return dEmpty('Nothing to show',R.empty);
  if(R.pending==='loading')return '<div class="ox-empty"><b>Reading the stored detail…</b><span>Customer, thickness and brand detail is read from the stored chunks for the plants in your scope. It appears here when read.</span></div>';
  if(R.pending==='nodetail')return '<div class="ox-empty"><b>Not loaded</b><span>These months carry no thickness or brand detail ('+(R.detailTotal||0)+' plant-months). Reload them in Data Intake › Sales. Shown as not loaded, never as zero.</span></div>';
  var vis=eff.visual||dAutoVisual(eff);
  if(R.meas.kind==='dh'){return dvDhTile(R,eff)}
  /* nothing loaded at all for this card */
  var allNo=R.rows.length&&R.rows.every(function(r){return r.v==null&&r.st!=='check'});
  if(allNo&&R.meas.kind!=='rating'){
    var r0=R.rows[0],ld=R.loading;
    return '<div class="ox-empty"><b>'+(ld?'Reading the stored detail…':'Not loaded')+'</b><span>'+esc(dStMsg(r0,R))+'. Shown as not loaded, never as zero.</span></div>';
  }
  var fn=D_DRAW[vis]||dvTable,h;
  try{h=fn(R,eff)}catch(e){h='<div class="ox-empty"><b>This visual could not be drawn</b><span>'+esc((e&&e.message)||e)+'</span></div>'}
  if(R.loading)h='<div class="ox-row"><span class="ox-chip nl">Reading detail…</span></div>'+h;
  return h;
}
