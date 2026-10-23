/* ================= Backups for replacing uploads (D45, 23 Oct 2026) =================
 * When an upload replaces stored data (sales plant-months, collections, credit notes, receivables or stock snapshots) the previous documents are copied first
 * into backups/<uploadId>_<i> (gzip of a JSON list of {p: path, d: document}, at most ~450,000 characters before compression per document).
 * Undo of that upload restores them, but only the paths that still point to the undone upload (a later upload's data is never overwritten).
 * A backup is deleted when its upload is itself replaced or undone, or after 30 days. Demo loads keep no backup.
 * Cost: one backup document per ~450 KB of replaced JSON; bytes are about the size of the data replaced (sales chunks are already compressed, so they are stored near 1:1).
 * Nothing is backed up for a first load. */
S.backups=[];
var BK_DAYS=30;
function bkNew(uid,entity,demo){return {uid:uid,entity:entity,demo:!!demo,items:[],seen:{},i:0,docs:0,bytes:0,count:0}}
function bkAdd(B,path,data){if(B.demo||!data||B.seen[path])return;B.seen[path]=1;var o=Object.assign({},data);delete o._id;B.items.push({p:path,d:o})}
async function bkAddDb(B,path){if(B.demo||B.seen[path])return;var s=await dget(path);if(s.exists)bkAdd(B,path,s.data())}
async function bkFlush(B){
  var items=B.items;if(!items.length)return B;B.items=[];
  var groups=[],cur=[],len=0;
  items.forEach(function(it){var l=JSON.stringify(it).length;if(cur.length&&len+l>450000){groups.push(cur);cur=[];len=0}cur.push(it);len+=l});if(cur.length)groups.push(cur);
  var exp=new Date(Date.now()+BK_DAYS*864e5).toISOString();
  for(var g=0;g<groups.length;g++){var idx=B.i++,z=await gz(JSON.stringify(groups[g]));B.bytes+=z.length;
    await dset('backups/'+B.uid+'_'+idx,{upload:B.uid,entity:B.entity,i:idx,n:groups[g].length,z:z,at:nowISO(),expires:exp});B.docs++}
  B.count+=items.length;
  return B;
}
function bkSummary(B){return B&&B.docs?{docs:B.docs,bytes:B.bytes,items:B.count}:undefined}
function bkFor(uid){return S.backups.filter(function(d){return d.upload===uid}).sort(function(a,b){return a.i-b.i})}
function bkHas(uid){return S.backups.some(function(d){return d.upload===uid})}
/* restore the saved documents for which allow(path) is true; cell entries of sales plant-months are returned for the caller to merge */
async function bkRestore(uid,allow){
  var docs=bkFor(uid),n=0,cells=[];
  for(var i=0;i<docs.length;i++){var items=JSON.parse(await ungz(docs[i].z));
    for(var j=0;j<items.length;j++){var it=items[j];if(allow&&!allow(it.p))continue;
      if(it.p.indexOf('cellpart:')===0){cells.push(it);continue}
      await dset(it.p,it.d);n++}}
  return {n:n,cells:cells};
}
async function bkDelete(uid){var docs=bkFor(uid);for(var i=0;i<docs.length;i++)await ddel('backups/'+docs[i]._id)}
var bkTimer=0;
async function bkPurge(){
  if(readOnly()||effRole()!=='Super admin'||!S.uploads.length)return;
  var now=nowISO(),gone={};
  S.backups.forEach(function(d){
    var u=S.uploads.find(function(x){return x._id===d.upload});
    if((d.expires&&d.expires<now)||(u&&(u.status==='Undone'||histReplacedBy(u))))gone[d._id]=1});
  var ids=Object.keys(gone);for(var i=0;i<ids.length;i++){try{await ddel('backups/'+ids[i])}catch(e){}}
}
function bkSchedule(){clearTimeout(bkTimer);bkTimer=setTimeout(function(){bkPurge()},4000)}
/* the Undo dialog says so when a backup exists */
function bkDialogNote(uid){
  if(!bkHas(uid))return;
  var nodes=document.querySelectorAll('.note,p');
  Array.prototype.forEach.call(nodes,function(p){if(/^Undo cannot bring back/.test(p.textContent||''))p.textContent='Undo restores the previous data: what this upload replaced is put back (only where no later upload has changed it again).'});
  var e=document.getElementById('d-err');if(e)e.insertAdjacentHTML('beforebegin','<div class="banner ok" style="display:block"><b>Undo restores the previous data.</b> A copy taken before this upload replaced it is held for '+BK_DAYS+' days.</div>');
}
