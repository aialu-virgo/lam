/* ================= Backups for replacing uploads (D45, 23 Oct 2026) =================
 * When an upload replaces stored data (sales plant-months, collections, credit notes, receivables or stock snapshots) the previous documents are copied first
 * into backups/<uploadId>_<i> (gzip of a JSON list of {p: path, d: document}, at most ~450,000 characters before compression per document).
 * Undo of that upload restores them, but only the paths that still point to the undone upload (a later upload's data is never overwritten).
 * A backup is deleted when its upload is itself replaced or undone, or after 30 days. Demo loads keep no backup.
 * Cost: one backup document per ~450 KB of replaced JSON; bytes are about the size of the data replaced (sales chunks are already compressed, so they are stored near 1:1).
 * Nothing is backed up for a first load. */
S.backups=[];
var BK_DAYS=30,BK_MAX=240000,BK_CAP=20*1024*1024;
/* D46: the database caps a document at 256 KiB, so every backup document is sized by what is finally stored (after gzip and encoding): at most 240,000 bytes of z.
 * All backup documents are written BEFORE any replacing starts; if that fails nothing has been replaced. All backups together stay under 20 MB:
 * expired and then oldest backups are purged first; if the new one still does not fit, the uploader must confirm that Undo cannot restore it. */
function bkNew(uid,entity,demo){return {uid:uid,entity:entity,demo:!!demo,items:[],seen:{},raw:0,pend:[],pendBytes:0,i:0,docs:0,bytes:0,count:0,skipped:false}}
function bkAdd(B,path,data){if(B.demo||!data||B.seen[path])return;B.seen[path]=1;var o=Object.assign({},data);delete o._id;var it={p:path,d:o};B.raw+=JSON.stringify(it).length;B.items.push(it)}
async function bkAddDb(B,path){if(B.demo||B.seen[path])return;var s=await dget(path);if(s.exists)bkAdd(B,path,s.data())}
/* compress the collected items into documents of at most BK_MAX stored bytes (split until they fit; one oversized item is cut into parts) */
async function bkPack(items){
  var out=[];
  async function go(list){
    var z=await gz(JSON.stringify(list));
    if(z.length<=BK_MAX){out.push({z:z,n:list.length});return}
    if(list.length>1){var h=list.length>>1;await go(list.slice(0,h));await go(list.slice(h));return}
    var js=JSON.stringify(list[0]),n=Math.ceil(js.length/120000);
    for(var k=0;k<n;k++)await go([{p:'part:'+list[0].p,k:k,n:n,s:js.slice(k*120000,(k+1)*120000)}]);
  }
  var cur=[],len=0;
  for(var a=0;a<items.length;a++){var l=JSON.stringify(items[a]).length;if(cur.length&&len+l>400000){await go(cur);cur=[];len=0}cur.push(items[a]);len+=l}
  if(cur.length)await go(cur);
  return out;
}
async function bkPrep(B){
  if(!B.items.length)return B;var items=B.items;B.items=[];B.raw=0;B.seen={};
  var docs=await bkPack(items);docs.forEach(function(d){B.pend.push(d);B.pendBytes+=d.z.length});B.count+=items.length;
  return B;
}
async function bkMaybe(B){if(B.raw>600000)await bkPrep(B)}
function bkStored(){return S.backups.reduce(function(a,d){return a+(d.z||'').length},0)}
function bkAsk(kind,list){return new Promise(function(res){S.bkResolve=res;
  var body=kind==='purge'?'<p>The backups held use the 20 MB limit. To keep a backup of what this upload replaces, these older uploads would lose theirs (Undo would no longer restore them):</p><ul>'+list.map(function(u){return '<li>'+esc(u.file||u.id)+' &middot; '+esc(u.at?istStr(u.at):'')+'</li>'}).join('')+'</ul><div class="row"><button class="btn pri" data-act="bk-go">Remove those backups and load</button><button class="btn" data-act="bk-cancel">Cancel the load</button></div>'
    :'<p>The data this upload replaces does not fit in the 20 MB of backups, even with every older backup removed. Nothing has been removed.</p><div class="banner warn" style="display:block"><b>Undo will not be able to restore the replaced months for this upload.</b></div><div class="row"><button class="btn pri" data-act="bk-go">Load anyway</button><button class="btn" data-act="bk-cancel">Cancel the load</button></div>';
  openDlg('<h3>'+(kind==='purge'?'Older backups must go':'No room for a backup')+'</h3>'+body)})}
Object.assign(handlers,{
 'bk-go':function(){closeDlg();var r=S.bkResolve;S.bkResolve=null;if(r)r(true)},
 'bk-cancel':function(){closeDlg();var r=S.bkResolve;S.bkResolve=null;if(r)r(false)}
});
/* backups grouped by upload: oldest upload first, expired ones before the others */
function bkGroups(exceptUid){
  var by={},now=nowISO();
  S.backups.forEach(function(d){if(d.upload===exceptUid)return;var g=by[d.upload]||(by[d.upload]={id:d.upload,docs:[],bytes:0,at:d.at||'',expired:false});g.docs.push(d);g.bytes+=(d.z||'').length;if((d.at||'')<g.at)g.at=d.at;if(d.expires&&d.expires<now)g.expired=true});
  return Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return a.expired!==b.expired?(a.expired?-1:1):(a.at<b.at?-1:1)});
}
/* delete whole uploads' backups together and mark each upload in history */
async function bkRemoveUploads(groups,why){
  for(var g=0;g<groups.length;g++){
    for(var k=0;k<groups[g].docs.length;k++)await ddel('backups/'+groups[g].docs[k]._id);
    var u=S.uploads.find(function(x){return x._id===groups[g].id});
    if(u&&why){var up=Object.assign({},u);delete up._id;up.backup_removed=nowISO();up.backup_removed_why=why;await dset('uploads/'+groups[g].id,up)}
  }
}
/* write every backup document now; call once, before the first replacing write */
async function bkCommit(B){
  await bkPrep(B);
  if(!B.pend.length)return B;
  var need=B.pendBytes,total=bkStored(),plan=[],toRemove=[],loud=false;
  if(total+need>BK_CAP){
    /* plan first, delete nothing yet: whole uploads, expired then oldest first */
    var gs=bkGroups(B.uid),t=total;
    for(var k=0;k<gs.length&&t+need>BK_CAP;k++){plan.push(gs[k]);t-=gs[k].bytes}
    if(need>BK_CAP||t+need>BK_CAP){
      var go=await bkAsk('nofit');/* nothing is removed in this case */
      if(!go)throw new Error('the load was cancelled because the backup does not fit; nothing was changed.');
      B.pend=[];B.pendBytes=0;B.skipped=true;return B;
    }
    loud=plan.some(function(g){return !g.expired});
    if(loud){
      var ok=await bkAsk('purge',plan.map(function(g){var u=S.uploads.find(function(x){return x._id===g.id})||{};return {id:g.id,file:u.file,at:u.at||g.at}}));
      if(!ok)throw new Error('the load was cancelled; nothing was changed.');
    }
    toRemove=plan;
  }
  var exp=new Date(Date.now()+BK_DAYS*864e5).toISOString(),written=[];
  try{
    for(var g=0;g<B.pend.length;g++){var idx=B.i++;
      await dset('backups/'+B.uid+'_'+idx,{upload:B.uid,entity:B.entity,i:idx,of:B.pend.length,ck:bkHash(B.pend[g].z),n:B.pend[g].n,z:B.pend[g].z,at:nowISO(),expires:exp});written.push('backups/'+B.uid+'_'+idx)}
  }catch(e){
    for(var w=0;w<written.length;w++){try{await ddel(written[w])}catch(e2){}}
    throw new Error('the backup of the data being replaced could not be saved; nothing was changed.');
  }
  B.docs=B.pend.length;B.bytes=B.pendBytes;B.pend=[];B.pendBytes=0;
  if(toRemove.length)await bkRemoveUploads(toRemove,'room for a newer backup');/* after the new backup is safely written */
  return B;
}
function undoDoneP(removed,months,kind,generic){
  var L=S.bkLast||{units:0,incomplete:false};
  if(L.incomplete)return '<p><b>Backup incomplete:</b> nothing was restored. The months this upload held were removed. <b>Upload these months again:</b> '+(months&&months.length?esc(months.map(ymLabel).join(', ')):'none')+'.</p>';
  if(L.units>0){if(kind==='snap')return '<p>Restored the previous snapshot.</p>';var rest=removed!=null?Math.max(0,removed-L.units):0;return '<p>Restored the previous data for '+L.units+' plant-month'+(L.units===1?'':'s')+'.'+(rest>0?' '+rest+' more had no earlier data and were removed; <b>upload those again</b> if you need them.':'')+'</p>'}
  return generic;
}
function bkSummary(B){return B&&(B.docs||B.skipped)?{docs:B.docs,bytes:B.bytes,items:B.count,skipped:B.skipped||undefined}:undefined}
function bkHash(str){var h=2166136261;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h.toString(16)}
/* integrity: every part of an upload's backup must be present and match its checksum */
function bkCheck(uid){
  var docs=bkFor(uid);if(!docs.length)return {ok:true,none:true};
  var of=docs[0].of;if(of==null)return {ok:true};/* written before checksums existed */
  var have={},bad=0;docs.forEach(function(d){have[d.i]=1;if(d.ck!==bkHash(d.z||''))bad++});
  var missing=[];for(var i=0;i<of;i++)if(!have[i])missing.push(i);
  return {ok:!missing.length&&!bad&&docs.length===of,missing:missing,bad:bad,of:of,have:docs.length};
}
function bkFor(uid){return S.backups.filter(function(d){return d.upload===uid}).sort(function(a,b){return a.i-b.i})}
function bkHas(uid){return S.backups.some(function(d){return d.upload===uid})}
/* restore the saved documents for which allow(path) is true; cell entries of sales plant-months are returned for the caller to merge */
async function bkRestore(uid,allow){
  var docs=bkFor(uid),n=0,cells=[];S.bkLast={units:0,incomplete:false};
  var chk=bkCheck(uid);if(!chk.ok){S.bkLast.incomplete=true;return {n:0,cells:[],incomplete:true}}
  var parts={};
  for(var i=0;i<docs.length;i++){var items=JSON.parse(await ungz(docs[i].z));
    for(var j=0;j<items.length;j++){var it=items[j];
      if(it.p.indexOf('part:')===0){var pp=it.p.slice(5);(parts[pp]=parts[pp]||[])[it.k]=it.s;if(parts[pp].filter(function(x){return x!=null}).length===it.n){it=JSON.parse(parts[pp].join(''));delete parts[pp]}else continue}
      if(allow&&!allow(it.p))continue;
      if(it.p.indexOf('cellpart:')===0){cells.push(it);continue}
      await dset(it.p,it.d);n++;if(/^collections\/|^creditnotes\/[^~]*$|\/rsnap_|\/snap_/.test(it.p))S.bkLast.units++}}
  S.bkLast.units+=cells.length;
  return {n:n,cells:cells};
}
async function bkDelete(uid){var docs=bkFor(uid);for(var i=0;i<docs.length;i++)await ddel('backups/'+docs[i]._id)}
var bkTimer=0;
async function bkPurge(){
  if(readOnly()||effRole()!=='Super admin'||!S.uploads.length)return;
  var now=nowISO(),by={};
  S.backups.forEach(function(d){var g=by[d.upload]||(by[d.upload]={id:d.upload,docs:[]});g.docs.push(d)});
  var exp=[],gone=[];
  Object.keys(by).forEach(function(id){var g=by[id],u=S.uploads.find(function(x){return x._id===id});
    var expired=g.docs.some(function(d){return d.expires&&d.expires<now});
    if(u&&(u.status==='Undone'||histReplacedBy(u)))gone.push(g);else if(expired)exp.push(g)});
  try{await bkRemoveUploads(gone,null);await bkRemoveUploads(exp,'older than '+BK_DAYS+' days')}catch(e){}
}
function bkSchedule(){clearTimeout(bkTimer);bkTimer=setTimeout(function(){bkPurge()},4000)}
/* the Undo dialog says so when a backup exists */
function bkDialogNote(uid){
  if(!bkHas(uid))return;
  var chk=bkCheck(uid);
  if(!chk.ok){var e0=document.getElementById('d-err');if(e0)e0.insertAdjacentHTML('beforebegin','<div class="banner warn" style="display:block"><b>Backup incomplete:</b> Undo will remove these months; upload them again. Nothing will be restored.</div>');var gb=document.querySelector('[data-act="undo-go"]');if(gb)gb.textContent='Undo and remove these months';return}
  var nodes=document.querySelectorAll('.note,p');
  Array.prototype.forEach.call(nodes,function(p){if(/^Undo cannot bring back/.test(p.textContent||''))p.textContent='Undo restores the previous data: what this upload replaced is put back (only where no later upload has changed it again).'});
  var e=document.getElementById('d-err');if(e)e.insertAdjacentHTML('beforebegin','<div class="banner ok" style="display:block"><b>Undo restores the previous data.</b> A copy taken before this upload replaced it is held for '+BK_DAYS+' days.</div>');
}
