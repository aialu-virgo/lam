/* ================= My Dashboard, part 6: card builder (Measure x Breakdown x Filters x Period x Visual, live preview) and library ================= */
function dBuilderOpen(card,tab){
  var D=S.dash;
  D.builder={tab:tab||'build',card:card?dClone(card):dBlank(),editId:card?card.id:null,q:'',mod:''};
  dBuilderRender(true);
}
function dBlank(){return dSan({id:dUid(),measure:'sheets',by:'none',visual:'kpi',span:2,filters:[],period:{k:'follow'}})}
function dMeasOpts(card,role){
  return D_MODS.map(function(mod){
    var items=Object.keys(MEAS).filter(function(k){return MEAS[k].mod===mod&&(MEAS[k].kind!=='bench'||true)});
    return '<optgroup label="'+esc(mod)+'">'+items.map(function(k){var m=MEAS[k],bad=!dRoleOk(role,m);return '<option value="'+k+'"'+(card.measure===k?' selected':'')+(bad?' disabled':'')+'>'+esc(m.label)+(bad?' (not for '+esc(role)+')':'')+'</option>'}).join('')+'</optgroup>';
  }).join('');
}
function dFilterValsCtl(i,f,card){
  var id='dsh-fv'+i,dim=f.dim,sc=dScope(),opts=null;
  if(dim==='plant')opts=sc.plants.slice().sort().map(function(p){return [p,plantShort(p)]});
  else if(dim==='zone'){var z={};sc.plants.forEach(function(p){z[dZone(p)]=1});opts=Object.keys(z).sort().map(function(x){return [x,x]})}
  else if(dim==='state'){var z2={};sc.plants.forEach(function(p){z2[dState(p)]=1});opts=Object.keys(z2).sort().map(function(x){return [x,x]})}
  else if(dim==='group')opts=GROUPS.map(function(g){return [g,g]});
  if(opts)return '<select id="'+id+'" class="in" multiple size="4" data-dsh="b" data-f="fval" data-i="'+i+'" aria-label="Values">'+opts.map(function(o){return '<option value="'+esc(o[0])+'"'+(f.vals.indexOf(o[0])>=0?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')+'</select>';
  var list='';
  if(dim==='salesperson')list=distinct('sp').slice(0,300).map(function(s){return '<option value="'+esc(s)+'">'}).join('');
  else if(dim==='thickness'||dim==='brand'){var seen={};Object.keys(DS.dim).forEach(function(k){DS.dim[k].rows.forEach(function(r){seen[r[dim==='thickness'?0:1]]=1})});list=Object.keys(seen).sort().slice(0,200).map(function(s){return '<option value="'+esc(s)+'">'}).join('')}
  return '<input id="'+id+'" class="in" list="'+id+'-l" value="'+esc(f.vals.join(', '))+'" placeholder="'+(dim==='customer'?'customer code':'value, value')+'" data-dsh="b" data-f="fval" data-i="'+i+'" aria-label="Values"><datalist id="'+id+'-l">'+list+'</datalist>';
}
function dBuilderForm(B){
  var c=B.card,role=effRole(),meas=MEAS[c.measure],fit=dVisFit(c),by=meas.fixedBy||c.by||'none';
  var h='<div class="fld"><label for="dsh-title">Title</label><input id="dsh-title" class="in" maxlength="80" value="'+esc(c.title||'')+'" placeholder="'+esc(dDefTitle(c))+'" data-dsh="b" data-f="title"></div>';
  h+='<div class="fld"><label for="dsh-meas">Measure (what)</label><select id="dsh-meas" class="in" data-dsh="b" data-f="measure">'+dMeasOpts(c,role)+'</select><span class="note">Binds to: '+esc(meas.src)+'</span></div>';
  if(meas.kind==='bench'){h+='<div class="fld"><label for="dsh-base">Benchmark of</label><select id="dsh-base" class="in" data-dsh="b" data-f="base">'+Object.keys(MEAS).filter(function(k){var m=MEAS[k];return m.kind!=='bench'&&m.kind!=='dh'&&m.kind!=='person'&&m.kind!=='rating'&&dRoleOk(role,m)}).map(function(k){return '<option value="'+k+'"'+(c.base===k?' selected':'')+'>'+esc(MEAS[k].mod+' · '+MEAS[k].label)+'</option>'}).join('')+'</select></div>'}
  h+='<div class="fld"><label for="dsh-by">Breakdown (by)</label><select id="dsh-by" class="in" data-dsh="b" data-f="by"'+(meas.fixedBy?' disabled':'')+'>'+Object.keys(D_BY).map(function(k){var ok=k!=='item'&&dDimOk(c,k),why=k==='item'?dByWhy(c,'item'):dByWhy(c,k);return '<option value="'+k+'"'+((meas.fixedBy||c.by)===k?' selected':'')+(ok?'':' disabled')+(ok?'':' title="'+esc(why)+'"')+'>'+esc(D_BY[k]+(ok?'':' (not available)'))+'</option>'}).join('')+'</select>'+(meas.fixedBy?'<span class="note">This measure is always by '+esc(D_BY[meas.fixedBy])+'.</span>':'')+'</div>';
  h+='<fieldset class="dsh-fs"><legend>Filters (where), up to 3, all must match</legend>';
  (c.filters||[]).forEach(function(f,i){
    h+='<div class="dsh-frow"><select class="in" id="dsh-fd'+i+'" data-dsh="b" data-f="fdim" data-i="'+i+'" aria-label="Filter '+(i+1)+' dimension">'+D_FILTER_DIMS.map(function(d){return '<option value="'+d+'"'+(f.dim===d?' selected':'')+'>'+esc(D_BY[d])+'</option>'}).join('')+'</select>'+dFilterValsCtl(i,f,c)+'<button class="btn sm" data-act="d-b-frm" data-i="'+i+'" aria-label="Remove filter">Remove</button></div>';
  });
  if((c.filters||[]).length<3)h+='<button class="btn sm" data-act="d-b-fadd">+ Add filter</button>';
  h+='</fieldset><fieldset class="dsh-fs"><legend>Period (when)</legend><div class="dsh-per">'+dPerCtl(c.period,'draft',true)+'</div><span class="note">Growth is always against the previous quarter (three months back). There is no last-year option.</span></fieldset>';
  h+='<fieldset class="dsh-fs"><legend>Visual (how)</legend><div class="dsh-vis">'+Object.keys(D_VIS).map(function(v){var why=fit[v];return '<label class="dsh-vc'+(why?' off':'')+(c.visual===v?' on':'')+'"'+(why?' title="'+esc(why)+'"':'')+'><input type="radio" name="dsh-vis" value="'+v+'" data-dsh="b" data-f="visual"'+(c.visual===v?' checked':'')+(why?' disabled':'')+'>'+esc(D_VIS[v])+'</label>'}).join('')+'</div></fieldset>';
  h+='<div class="dsh-opt"><div class="fld"><label for="dsh-n">Show top N (0 = automatic)</label><input id="dsh-n" class="in" type="number" min="0" max="50" value="'+(c.n||0)+'" data-dsh="b" data-f="n"></div>'
   +'<div class="fld"><label for="dsh-dir">Top or bottom</label><select id="dsh-dir" class="in" data-dsh="b" data-f="dir"><option value="top"'+(c.dir!=='bottom'?' selected':'')+'>Top (best first)</option><option value="bottom"'+(c.dir==='bottom'?' selected':'')+'>Bottom (worst first)</option></select></div>'
   +'<div class="fld"><label for="dsh-sort">Sort by</label><select id="dsh-sort" class="in" data-dsh="b" data-f="sortBy"><option value="value"'+(c.sortBy==='value'?' selected':'')+'>Value</option><option value="qoq"'+(c.sortBy==='qoq'?' selected':'')+'>QoQ %</option><option value="label"'+(c.sortBy==='label'?' selected':'')+'>Name</option></select></div>'
   +'<div class="fld"><label for="dsh-span">Width</label><select id="dsh-span" class="in" data-dsh="b" data-f="span">'+[1,2,3,4].map(function(w){return '<option value="'+w+'"'+(c.span===w?' selected':'')+'>'+w+' of 4 columns</option>'}).join('')+'</select></div></div>';
  return h;
}
function dBuilderPrevHtml(B){
  var c=dSan(Object.assign({},B.card,{id:B.card.id}))||B.card;
  if(!MEAS[c.measure])return '';
  return '<p class="note dsh-read" style="margin:0 0 8px">'+esc(dReadLine(c))+'</p><div class="dsh-prevcard ox">'+dCardHtml(c,{preview:true})+'</div>';
}
function dBuilderLib(B){
  var role=effRole(),q=(B.q||'').toLowerCase(),mod=B.mod;
  var list=D_LIB.filter(function(e){return (!mod||e.mod===mod)&&(!q||(e.title+' '+e.desc+' '+e.mod+' '+(MEAS[e.s.measure]?MEAS[e.s.measure].label:'')).toLowerCase().indexOf(q)>=0)});
  if(!list.length)return '<div class="ox-empty"><b>No card matches</b><span>Try another word, or build your own.</span></div>';
  var h='';
  D_MODS.forEach(function(m){var es=list.filter(function(e){return e.mod===m});if(!es.length)return;
    h+='<h4 class="dsh-lh"><span class="dsh-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'+D_MOD_ICON[m]+'</svg></span>'+esc(m)+'</h4><div class="dsh-lib">'+es.map(function(e){
      var why=dLibLocked(e,role),cur=S.dash.cards.some(function(c){return c.lib===e.id});
      return '<div class="dsh-le'+(why?' lock':'')+'"><b>'+esc(e.title)+'</b><span class="note">'+esc(e.desc)+'</span>'+(why?'<span class="ox-chip sm nl" title="'+esc(why)+'">Locked: '+esc(why)+'</span>':'<div class="ox-row"><button class="btn sm pri" data-act="d-b-add" data-id="'+e.id+'">Add</button><button class="btn sm" data-act="d-b-custom" data-id="'+e.id+'">Customise</button>'+(cur?'<span class="ox-chip sm ok">on your dashboard</span>':'')+'</div>')+'</div>'}).join('')+'</div>';
  });
  return h;
}
function dBuilderRender(open){
  var B=S.dash.builder;if(!B)return;var role=effRole();
  var ae=document.activeElement,aid=ae&&ae.id,pos=ae&&ae.selectionStart;
  var head='<div class="hd"><h3>'+(B.editId?'Edit card':'Add card')+'</h3><button class="btn sm" data-act="d-b-close">Close</button></div><div class="seg dsh-seg" role="group" aria-label="Builder tab"><button data-act="d-b-tab" data-t="lib" aria-pressed="'+(B.tab==='lib')+'">Starter library</button><button data-act="d-b-tab" data-t="build" aria-pressed="'+(B.tab==='build')+'">Build your own</button></div>';
  var body;
  if(B.tab==='lib'){
    body='<div class="dsh-libbar"><div class="fld"><label for="dsh-q">Search the library</label><input id="dsh-q" class="in" type="search" value="'+esc(B.q||'')+'" placeholder="sales, collections, thickness, rating…" data-dsh="b" data-f="q"></div><div class="dsh-mods" role="group" aria-label="Module">'+['']
      .concat(D_MODS).map(function(m){return '<button class="chip'+(B.mod===m?' on':'')+'" data-act="d-b-mod" data-m="'+esc(m)+'" aria-pressed="'+(B.mod===m)+'">'+esc(m||'All')+'</button>'}).join('')+'</div></div><div id="dsh-liblist" class="dsh-liblist">'+dBuilderLib(B)+'</div>';
  }else{
    body='<div class="dsh-bgrid"><div class="dsh-prev" id="dsh-prev" aria-live="polite">'+dBuilderPrevHtml(B)+'</div><div class="dsh-form" id="dsh-form">'+dBuilderForm(B)+'</div></div>'
     +'<div id="d-err"></div><div class="row"><button class="btn pri" data-act="d-b-save">'+(B.editId?'Save changes':'Add to dashboard')+'</button><button class="btn" data-act="d-b-close">Cancel</button></div>';
  }
  var html='<div class="dsh-bld" id="dsh-bld">'+head+body+'</div>';
  if(open||!document.getElementById('dsh-bld')){openDlg(html);var dl=document.querySelector('#dlg .dlg');if(dl)dl.classList.add('dsh-dlg')}
  else document.getElementById('dsh-bld').outerHTML=html;
  if(aid){var n=document.getElementById(aid);if(n&&n.focus){n.focus();try{if(pos!=null&&n.setSelectionRange&&(n.type==='text'||n.type==='search'))n.setSelectionRange(pos,pos)}catch(e){}}}
}
function dBldPrev(){var B=S.dash.builder,el=document.getElementById('dsh-prev');if(B&&el)el.innerHTML=dBuilderPrevHtml(B)}
function dBuilderChange(t,k){
  var B=S.dash.builder;if(!B||k!=='b')return;var c=B.card,f=t.getAttribute('data-f'),i=+t.getAttribute('data-i');
  if(f==='q'){B.q=t.value;var el=document.getElementById('dsh-liblist');if(el)el.innerHTML=dBuilderLib(B);return}
  if(f==='title'){c.title=t.value.slice(0,80);dBldPrev();return}
  if(f==='measure'){var prevT=dDefTitle(c);c.measure=t.value;var m=MEAS[c.measure];if(m.fixedBy)c.by=m.fixedBy;else if(!dDimOk(c,c.by))c.by='none';if(m.kind==='bench'&&!MEAS[c.base])c.base='sheets';if(c.title===prevT)c.title='';if(dVisFit(c)[c.visual]||!c.visual)c.visual=dAutoVisual(c)}
  else if(f==='base'){c.base=t.value;if(dVisFit(c)[c.visual])c.visual=dAutoVisual(c)}
  else if(f==='by'){var pb=c.by;c.by=t.value;if(dVisFit(c)[c.visual]||(c.visual==='kpi'&&pb==='none'&&c.by!=='none'))c.visual=dAutoVisual(c)}
  else if(f==='visual')c.visual=t.value;
  else if(f==='n')c.n=Math.max(0,Math.min(50,parseInt(t.value,10)||0));
  else if(f==='dir')c.dir=t.value==='bottom'?'bottom':'top';
  else if(f==='sortBy')c.sortBy=t.value;
  else if(f==='span')c.span=+t.value;
  else if(f==='fdim'){c.filters[i]={dim:t.value,vals:[]}}
  else if(f==='fval'){var vals=t.tagName==='SELECT'?Array.prototype.map.call(t.selectedOptions,function(o){return o.value}):t.value.split(',').map(function(x){return x.trim()}).filter(Boolean);c.filters[i]=Object.assign({},c.filters[i],{vals:vals});if(t.tagName!=='SELECT'){dBldPrev();return}}
  /* the card always draws through dSan so a half-filled filter never breaks the preview */
  dBuilderRender();
}
document.addEventListener('input',function(ev){
  var t=ev.target,k=t.getAttribute&&t.getAttribute('data-dsh');if(k!=='b')return;var f=t.getAttribute('data-f');
  if(f==='title'||f==='q'||(f==='fval'&&t.tagName==='INPUT')){clearTimeout(dBuilderChange.tm);dBuilderChange.tm=setTimeout(function(){dBuilderChange(t,'b')},180)}
});
Object.assign(handlers,{
 'd-b-close':function(){S.dash.builder=null;closeDlg()},
 'd-b-tab':function(t){S.dash.builder.tab=t.getAttribute('data-t');dBuilderRender()},
 'd-b-mod':function(t){S.dash.builder.mod=t.getAttribute('data-m');dBuilderRender()},
 'd-b-add':function(t){var c=dFromLib(t.getAttribute('data-id'));if(!c)return;S.dash.cards.push(c);S.dash.edit=false;dTouch();dBuilderRender();toast('Added: '+dCardTitle(c))},
 'd-b-custom':function(t){var c=dFromLib(t.getAttribute('data-id'));if(!c)return;var B=S.dash.builder;B.card=c;B.editId=null;B.tab='build';dBuilderRender()},
 'd-b-fadd':function(){var c=S.dash.builder.card;if((c.filters||[]).length<3){c.filters=(c.filters||[]).concat([{dim:'plant',vals:[]}])}dBuilderRender()},
 'd-b-frm':function(t){var c=S.dash.builder.card;c.filters.splice(+t.getAttribute('data-i'),1);dBuilderRender()},
 'd-b-save':function(){
   var B=S.dash.builder,c=dSan(Object.assign({},B.card));if(!c){var el=$('#d-err');if(el)el.innerHTML='<div class="banner err">Pick a measure first</div>';return}
   if(!dRoleOk(effRole(),MEAS[c.measure])){var e2=$('#d-err');if(e2)e2.innerHTML='<div class="banner err">'+esc(dRoleWhy(effRole(),MEAS[c.measure]))+'</div>';return}
   var D=S.dash;
   if(B.editId){var i=D.cards.findIndex(function(x){return x.id===B.editId});if(i>=0){c.id=B.editId;D.cards[i]=c}else D.cards.push(c)}else D.cards.push(c);
   delete D.dr[c.id];S.dash.builder=null;closeDlg();dTouch();toast(B.editId?'Card updated':'Card added')
 }
});
