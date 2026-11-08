/* ================= Activity indicator (Vijay, 8 Nov 2026): a thin bar at the top and a status chip, shown whenever background work runs =================
 * Read-only observer: it never changes data or figures. It reads the state the page already keeps (collection loads, roll-up stages, rules engine, intake, backup,
 * restore, SAP feed, database calls in flight, Apps Script calls in flight) every 250 ms and shows the most important task. Hidden when idle. Errors turn it red. */
var AC={since:{},shownAt:0,hideAt:0,lastKey:'',lastTxt:'',lastTxtAt:0,dismissed:'',on:false};
function acNum(s,re){var m=re.exec(s||'');return m?[+m[1],+m[2]]:null}
/* current list of tasks and errors, most important first. t: {label, done, total, pct} (progress optional) */
function acCollect(){
  var tasks=[],errs=[];
  try{
    var names=Object.keys(ACT.subs),ld=names.filter(function(n){return S.loaded[n]}).length;
    Object.keys(S.errs||{}).forEach(function(k){errs.push({key:'sub:'+k,msg:'Could not read '+k+' ('+S.errs[k]+')'})});
    if(DS.spErr)errs.push({key:'sp',msg:'Salesperson history failed: '+DS.spErr});
    if(ACT.err&&Date.now()-ACT.err.at<30000&&ACT.err.at!==ACT.errSeen)errs.push({key:'db'+ACT.err.at,msg:(ACT.err.kind==='w'?'A save failed: ':'A read failed: ')+ACT.err.msg});
    if(S.fb&&S.fb.stage==='error')errs.push({key:'fb',msg:'Backup failed: '+S.fb.msg});
    if(typeof U!=='undefined'&&U&&U.stage==='done'&&U.doneOk===false)errs.push({key:'up'+(U.uid||''),msg:'The upload did not finish'});
    if(typeof SAPF!=='undefined'&&SAPF.err)errs.push({key:'sap',msg:'SAP feed: '+SAPF.err});
    var R=window.__gasRestoreState&&window.__gasRestoreState();
    if(R){
      if(R.stage==='error')errs.push({key:'rs',msg:'Restore failed: '+R.err});
      if(R.stage==='incomplete')errs.push({key:'ri',msg:'Restore incomplete: run it again'});
      if(R.stage==='working'){var cols=R.man&&R.man.collections?Object.keys(R.man.collections).length:0,dn=Object.keys(R.written||{}).length;tasks.push({label:cols?'Restoring '+Math.min(dn,cols)+' of '+cols+' collections':'Restoring',pct:R.pct,order:0})}
    }
    if(S.fb&&S.fb.stage==='working')tasks.push({label:'Making backup'+(S.fb.msg?' · '+S.fb.msg:''),pct:S.fb.pct,order:1});
    if(typeof U!=='undefined'&&U){
      if(U.stage==='loading')tasks.push({label:'Uploading file',pct:U.progress,order:2});
      else if(U.stage==='validating')tasks.push({label:'Checking file',pct:U.progress,order:2});
      else if(U.stage==='parsing')tasks.push({label:'Reading file',order:2});
    }
    if(typeof SAPF!=='undefined'&&SAPF.busy)tasks.push({label:'Loading SAP feed',order:3});
    if(S.engBusy||S.ladBusy)tasks.push({label:'Running checks',order:4});
    if(S.rbBusy){var rb=acNum(DS.status,/Building roll-ups (\d+) of (\d+)/);tasks.push({label:'Building roll-ups'+(rb?' '+rb[0]+' of '+rb[1]:''),done:rb&&rb[0],total:rb&&rb[1],order:5})}
    if(DS.busy||DS.spReady===false){
      if(DS.spReady===false&&!DS.spErr){var sp=acNum(DS.status,/Reading salesperson detail (\d+) of (\d+)/);tasks.push({label:'Reading salesperson history'+(sp?' '+sp[0]+' of '+sp[1]:''),done:sp&&sp[0],total:sp&&sp[1],order:6})}
      else if(DS.busy){var h=acNum(DS.status,/Reading history (\d+) of (\d+)/);tasks.push({label:'Reading history'+(h?' '+h[0]+' of '+h[1]:''),done:h&&h[0],total:h&&h[1],order:6})}
    }
    if(DS.custJobs>0)tasks.push({label:'Reading customer detail '+DS.custDone+' of '+DS.custJobs,done:DS.custDone,total:DS.custJobs,order:7});
    if(S.jobBusy)tasks.push({label:'Running admin jobs',order:8});
    if(S.dbState==='init')tasks.push({label:'Opening the Desk',order:9});
    else if(names.length&&ld<names.length&&!Object.keys(S.errs||{}).length)tasks.push({label:'Loading data '+ld+' of '+names.length,done:ld,total:names.length,order:9});
    if(ACT.w>0)tasks.push({label:'Saving '+ACT.w+' change'+(ACT.w>1?'s':''),order:3.5});
    else if(ACT.r>0&&!tasks.length)tasks.push({label:'Loading data',order:11});
    if((window.__gasInflight||0)>0&&!tasks.length)tasks.push({label:'Waiting for the server ('+window.__gasInflight+')',order:12});
  }catch(e){}
  tasks.sort(function(a,b){return a.order-b.order});
  return {tasks:tasks,errs:errs.filter(function(e){return AC.dismissed.indexOf('|'+e.key+'|')<0})};
}
function acEl(){
  var bar=document.getElementById('act-bar');
  if(!bar){
    bar=document.createElement('div');bar.id='act-bar';bar.setAttribute('aria-hidden','true');bar.innerHTML='<i></i>';document.body.appendChild(bar);
    var chip=document.createElement('div');chip.id='act-chip';chip.setAttribute('role','status');chip.setAttribute('aria-live','polite');chip.hidden=true;
    chip.innerHTML='<span class="act-dot" aria-hidden="true"></span><span class="act-txt"></span><a href="#" class="act-det" hidden>Details</a><button type="button" class="act-x" aria-label="Dismiss" hidden>×</button>';
    document.body.appendChild(chip);
    chip.querySelector('.act-det').addEventListener('click',function(e){e.preventDefault();var t=document.getElementById('banners')||document.getElementById('pg');if(t){if(!t.hasAttribute('tabindex'))t.setAttribute('tabindex','-1');try{t.scrollIntoView({block:'start'})}catch(x){}t.focus({preventScroll:true})}});
    chip.querySelector('.act-x').addEventListener('click',function(){AC.dismissed+= (AC.curErrKeys||[]).map(function(k){return '|'+k+'|'}).join('');if(ACT.err)ACT.errSeen=ACT.err.at;acTick()});
  }
  return bar;
}
function acTick(){
  var bar=acEl(),chip=document.getElementById('act-chip'),now=Date.now(),c=acCollect(),txtEl=chip.querySelector('.act-txt'),det=chip.querySelector('.act-det'),x=chip.querySelector('.act-x');
  var err=c.errs[0],t=c.tasks[0],more=Math.max(0,c.tasks.length-1),label,pct=null,state;
  if(err){state='err';label=err.msg.length>110?err.msg.slice(0,107)+'…':err.msg;AC.curErrKeys=c.errs.map(function(e){return e.key});if(c.errs.length>1)label+=' (+'+(c.errs.length-1)+' more)'}
  else if(t){
    state='busy';label=t.label;
    if(t.pct!=null&&isFinite(t.pct))pct=Math.max(0,Math.min(100,t.pct));else if(t.total)pct=Math.max(0,Math.min(100,t.done/t.total*100));
    var k=label.replace(/\d+/g,'#');if(!AC.since[k])AC.since[k]=now;
    if(pct==null&&now-AC.since[k]>5000)label+=' · '+Math.round((now-AC.since[k])/1000)+' s';
    if(more)label+=' · +'+more+' more';
    Object.keys(AC.since).forEach(function(kk){if(!c.tasks.some(function(tt){return tt.label.replace(/\d+/g,'#')===kk}))delete AC.since[kk]});
  }else{state='idle';AC.since={}}
  if(state==='idle'){
    /* stay visible 400 ms after the last task so a quick flicker is not a blink; then hide */
    if(AC.on&&!AC.hideAt)AC.hideAt=now+400;
    if(AC.on&&now>=AC.hideAt){AC.on=false;AC.hideAt=0;chip.hidden=true;bar.className='';txtEl.textContent='';AC.lastTxt=''}
    if(!AC.on)return;
  }else{AC.hideAt=0;AC.on=true}
  if(state!=='idle'){
    chip.hidden=false;chip.className=state==='err'?'act-err':'';bar.className=state==='err'?'on err':(pct==null?'on ind':'on');
    bar.firstChild.style.width=pct==null?'':pct.toFixed(1)+'%';
    /* the live region is rewritten only when the words change (numbers at most once a second) so a screen reader is not flooded */
    var words=label.replace(/\d+/g,'#');
    if(words!==AC.lastKey||now-AC.lastTxtAt>1000){AC.lastKey=words;AC.lastTxt=label;AC.lastTxtAt=now;txtEl.textContent=label}
    det.hidden=x.hidden=state!=='err';
  }
}
try{acEl()}catch(e){}
setInterval(function(){if(document.visibilityState==='hidden'&&!AC.on)return;try{acTick()}catch(e){}},250);
