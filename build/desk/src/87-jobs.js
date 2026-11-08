/* ================= Admin job queue (D84, 8 Nov 2026) =================
 * jobs/<id> = {type:'undo'|'clear_demo'|'set_zones', uploads:[ids] (undo), requested_by, requested_at, reason, status:'queued'}.
 * A Super admin's page runs queued jobs in requested_at order about 4 s after load. A job runs once: the doc is claimed with a lease
 * (the platform's single-writer primitive) and its status is re-read and set to 'running' before anything starts, so two open tabs cannot both run it.
 * Undo jobs go newest first through the integrity-checked bulk Undo (stop at the first failure or incomplete backup, locks respected).
 * The result is written back (status done or failed, per-upload results, finished_at) with an audit entry and a banner. */
S.jobs=[];S.jobBusy=false;S.jobBanner='';S.jobTab='tab'+Math.random().toString(36).slice(2,8);
var jobTimer=0;
function jobSchedule(){clearTimeout(jobTimer);jobTimer=setTimeout(function(){runJobs(S.jobTab)},4000)}
async function jobExec(j){
  if(j.type==='undo'){
    var ids=(j.uploads||[]).slice(),list=[],skipped=[],missing=[];
    ids.forEach(function(id){var u=S.uploads.find(function(x){return x._id===id});if(!u)missing.push(id);else if(u.status==='Undone')skipped.push({id:id,file:u.file||'',text:'already undone'});else list.push(u)});
    list.sort(function(a,b){return a.at<b.at?1:-1});
    if(missing.length)return {ok:false,error:'upload(s) not found in the upload history: '+missing.join(', ')+'. Nothing was changed.',results:skipped};
    var r=await undoBulkRun(list);
    var res=skipped.concat(r.results);
    return r.stopped?{ok:false,error:'stopped at '+(r.stopped.file||r.stopped.id)+': '+r.stopped.msg+' ('+r.done.length+' of '+list.length+' done, the rest untouched)',results:res}:{ok:true,results:res};
  }
  if(j.type==='clear_demo'){await demoClear();return {ok:true,results:[{text:'demo data cleared'}]}}
  if(j.type==='set_zones'){var z=await setZonesFromSales();return {ok:true,results:[{text:z.text}],zones:z.set}}
  return {ok:false,error:'unknown job type '+j.type,results:[]};
}
async function runJobs(holder,opts){
  if(readOnly()||effRole()!=='Super admin'||!S.loaded.uploads)return 0;
  if(S.jobBusy&&!(opts&&opts.otherTab))return 0;
  S.jobBusy=true;var ran=0;
  try{
    var q=S.jobs.filter(function(j){return j.status==='queued'}).sort(function(a,b){return (a.requested_at||'')<(b.requested_at||'')?-1:1});
    for(var k=0;k<q.length;k++){
      var id=q[k]._id,ref=S.db.doc('jobs/'+id),ac=await ref.acquire({holder:holder,ttlMs:600000});
      if(!ac.acquired)continue;
      var snap=await ref.get(),cur=snap.exists?snap.data():null;if(!cur||cur.status!=='queued')continue;
      await ref.update({status:'running',started_at:nowISO(),started_by:whoAmI(),runner:holder});
      var out;try{out=await jobExec(cur)}catch(e){out={ok:false,error:dbErrText(e),results:[]}}
      await ref.update({status:out.ok?'done':'failed',results:out.results||[],error:out.error||null,finished_at:nowISO()});
      await auditW('admin job '+(out.ok?'done':'failed'),cur.type,{job:id,type:cur.type,reason:(cur.reason||'').slice(0,200),requested_by:cur.requested_by||'',error:(out.error||'').slice(0,300),results:(out.results||[]).slice(0,40).map(function(r){return (r.file||r.id||'')+': '+r.text})});
      S.jobBanner='Ran queued admin job: '+cur.type+(cur.type==='undo'?' ('+(cur.uploads||[]).length+' upload'+((cur.uploads||[]).length===1?'':'s')+')':'')+' · '+(out.ok?'done':'FAILED')+(out.error?' · '+out.error:'')+(cur.reason?' · reason: '+cur.reason:'');
      S.jobBannerOk=!!out.ok;ran++;S.lastHtml='';schedule();
    }
  }finally{S.jobBusy=false}
  return ran;
}
Object.assign(handlers,{'job-dismiss':function(){S.jobBanner='';S.lastHtml='';schedule()}});
/* set_zones (D85) is setZonesFromSales in src/53-splits.js: fills blank zones in the plant master from the zone on most sales lines (last 12 loaded months); it fails the job, with the reason, when no sales line carries a zone */
