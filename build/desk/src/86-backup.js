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
function bkAsk(){return new Promise(function(res){S.bkResolve=res;openDlg('<h3>No room for a backup</h3><p>The backups held already use the 20 MB limit and the data this upload replaces does not fit.</p><div class="banner warn" style="display:block"><b>Undo will not be able to restore the replaced months for this upload.</b></div><div class="row"><button class="btn pri" data-act="bk-go">Load anyway</button><button class="btn" data-act="bk-cancel">Cancel the load</button></div>')})}
Object.assign(handlers,{
 'bk-go':function(){closeDlg();var r=S.bkResolve;S.bkResolve=null;if(r)r(true)},
 'bk-cancel':function(){closeDlg();var r=S.bkResolve;S.bkResolve=null;if(r)r(false)}
});
/* write every backup document now; call once, before the first replacing write */
async function bkCommit(B){
  await bkPrep(B);
  if(!B.pend.length)return B;
  var need=B.pendBytes,total=bkStored(),now=nowISO();
  if(total+need>BK_CAP){
    var ex=S.backups.filter(function(d){return d.upload!==B.uid}).sort(function(a,b){var ea=(a.expires&&a.expires<now)?0:1,eb=(b.expires&&b.expires<now)?0:1;return ea!==eb?ea-eb:((a.at||'')<(b.at||'')?-1:1)});
    for(var k=0;k<ex.length&&total+need>BK_CAP;k++){total-=(ex[k].z||'').length;await ddel('backups/'+ex[k]._id)}
  }
  if(need>BK_CAP||total+need>BK_CAP){
    var go=await bkAsk();
    if(!go)throw new Error('the load was cancelled because the backup does not fit; nothing was changed.');
    B.pend=[];B.pendBytes=0;B.skipped=true;return B;
  }
  var exp=new Date(Date.now()+BK_DAYS*864e5).toISOString(),written=[];
  try{
    for(var g=0;g<B.pend.length;g++){var idx=B.i++;
      await dset('backups/'+B.uid+'_'+idx,{upload:B.uid,entity:B.entity,i:idx,n:B.pend[g].n,z:B.pend[g].z,at:nowISO(),expires:exp});written.push('backups/'+B.uid+'_'+idx)}
  }catch(e){
    for(var w=0;w<written.length;w++){try{await ddel(written[w])}catch(e2){}}
    throw new Error('the backup of the data being replaced could not be saved; nothing was changed.');
  }
  B.docs=B.pend.length;B.bytes=B.pendBytes;B.pend=[];B.pendBytes=0;
  return B;
}
function bkSummary(B){return B&&(B.docs||B.skipped)?{docs:B.docs,bytes:B.bytes,items:B.count,skipped:B.skipped||undefined}:undefined}
function bkFor(uid){return S.backups.filter(function(d){return d.upload===uid}).sort(function(a,b){return a.i-b.i})}
function bkHas(uid){return S.backups.some(function(d){return d.upload===uid})}
/* restore the saved documents for which allow(path) is true; cell entries of sales plant-months are returned for the caller to merge */
async function bkRestore(uid,allow){
  var docs=bkFor(uid),n=0,cells=[];
  var parts={};
  for(var i=0;i<docs.length;i++){var items=JSON.parse(await ungz(docs[i].z));
    for(var j=0;j<items.length;j++){var it=items[j];
      if(it.p.indexOf('part:')===0){var pp=it.p.slice(5);(parts[pp]=parts[pp]||[])[it.k]=it.s;if(parts[pp].filter(function(x){return x!=null}).length===it.n){it=JSON.parse(parts[pp].join(''));delete parts[pp]}else continue}
      if(allow&&!allow(it.p))continue;
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
