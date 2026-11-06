/* ================= Full backup (Super admin, Admin > Tools) =================
 * Reads every collection the page knows and builds JSON part files (about 20 million characters each) plus one manifest
 * (documents, characters and a CRC-32 per collection; bytes and CRC-32 per file). The files are built in this browser tab and saved to the
 * viewer's own computer; nothing is sent anywhere. Doc ids and contents are kept exactly as stored.
 * Checksum of a collection: the sum (mod 2^32, 8 hex digits) of the CRC-32 of id + "\n" + JSON.stringify(data) + "\n" over its documents, so it does not depend on document order.
 * The claude.ai db contract (artifact-capabilities db.d.ts) gives get() no options, so a read cannot be told to bypass a cache. Instead a read counts only when its snapshot is server-definitive
 * (metadata.fromCache is not true); otherwise it is retried, and after 6 tries the backup stops with an error rather than saving a possibly stale copy.
 * After the export every collection is read AGAIN from the source and compared with the first read
 * (documents, characters and checksum); any difference, including an edit that changes no count, is flagged in the page and in the manifest (changedDuringExport).
 * Admin > Tools > "Store size" measures documents and characters per collection (a fresh read here; the Apps Script build asks its server instead). */
var FB_COLS=['users','plants','periods','cells','mappings','uploads','transfers','potential','planlocks','audit','actions','followups','settings','phasing','roll','receivables','collections','backups','customers','creditnotes','stock','itemmeta','salesmaster','inv','items','rejects','log','orders','deliveries'];
var FB_MAX=window.__FB_MAX||20000000;
S.fb={stage:'idle',msg:'',pct:0,files:null,manifest:null};
var FB_CRC_T=(function(){var t=new Uint32Array(256);for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function fbCrcAdd(crc,str){var u=new TextEncoder().encode(str);for(var i=0;i<u.length;i++)crc=FB_CRC_T[(crc^u[i])&255]^(crc>>>8);return crc>>>0}
function fbHex(c){return ('0000000'+((c^0xFFFFFFFF)>>>0).toString(16)).slice(-8)}
function fbCrcOf(str){return fbHex(fbCrcAdd(0xFFFFFFFF,str))}
function fbDocCrc(id,js){return (fbCrcAdd(0xFFFFFFFF,id+'\n'+js+'\n')^0xFFFFFFFF)>>>0}
function fbSumHex(n){return ('0000000'+(n>>>0).toString(16)).slice(-8)}
function fbOk(){return viewerRole()==='Super admin'&&!readOnly()}
function fbDefinitive(snap){return !(snap&&snap.metadata&&snap.metadata.fromCache===true)}
async function fbReadAll(col){
  var q=S.db.collection(col),snap=null;
  for(var a=0;a<6&&!snap;a++){
    var s1=q.get?await dbRetry(function(){return q.get()}):await new Promise(function(res,rej){var un=null,t=setTimeout(function(){try{un&&un()}catch(e){}res(null)},10000);un=q.onSnapshot(function(sn){if(!fbDefinitive(sn))return;clearTimeout(t);try{un&&un()}catch(e){}res(sn)},rej)});
    if(s1&&fbDefinitive(s1))snap=s1;else await sleep(1000);
  }
  if(!snap)throw new Error('The database did not give a server-confirmed read of '+col+'. Nothing was saved. Try again in a minute.');
  return snap.docs.map(function(d){return {id:d.id,data:d.data()||{}}}).sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0});
}
async function fbMake(){
  if(!fbOk()){toast('Only a Super admin can make a full backup');return}
  var F=S.fb;if(F.stage==='working')return;
  F.stage='working';F.files=null;F.manifest=null;F.changed=null;F.pct=0;F.msg='Starting';S.lastHtml='';schedule();
  try{
    var stamp=nowISO().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),files=[],cur=[],curLen=0,man={kind:'virgo-desk-backup-manifest',v:1,stamp:stamp,createdAt:nowISO(),by:whoAmI(),checksum:'sum mod 2^32 of CRC-32(id+"\\n"+JSON.stringify(data)+"\\n") over the documents of a collection (sumcrc32); files carry the CRC-32 of their whole text (crc32)',collections:{},files:[]};
    function flush(){
      if(!cur.length)return;var n=files.length+1;
      var name='desk-backup-'+stamp+'-part-'+('0'+n).slice(-2)+'.json';
      var text='{"kind":"virgo-desk-backup-part","v":1,"stamp":"'+stamp+'","part":'+n+',"docs":['+cur.join(',')+']}';
      files.push({name:name,text:text,docs:cur.length,saved:false});cur=[];curLen=0;
    }
    var st1={};
    for(var ci=0;ci<FB_COLS.length;ci++){
      var col=FB_COLS[ci];F.msg='Reading '+col+' ('+(ci+1)+' of '+FB_COLS.length+')';F.pct=Math.round(ci/FB_COLS.length*100);schedule();
      var docs=await fbReadAll(col),sum=0,chars=0,fnames={};
      for(var i=0;i<docs.length;i++){
        var js=JSON.stringify(docs[i].data);sum=(sum+fbDocCrc(docs[i].id,js))%4294967296;chars+=js.length;
        var e='['+JSON.stringify(col)+','+JSON.stringify(docs[i].id)+','+js+']';
        if(curLen&&curLen+e.length>(window.__FB_MAX||FB_MAX))flush();
        cur.push(e);curLen+=e.length;fnames[files.length]=1;
      }
      st1[col]={docs:docs.length,chars:chars,sum:sum};
      man.collections[col]={docs:docs.length,chars:chars,sumcrc32:fbSumHex(sum),files:Object.keys(fnames).map(function(k){return +k})};
    }
    flush();
    var changed=[];
    for(var cj=0;cj<FB_COLS.length;cj++){
      var c2=FB_COLS[cj];F.msg='Checking '+c2+' again';F.pct=Math.round(cj/FB_COLS.length*100);schedule();
      var d2=await fbReadAll(c2),sum2=0,chars2=0;
      for(var k2=0;k2<d2.length;k2++){var j2=JSON.stringify(d2[k2].data);sum2=(sum2+fbDocCrc(d2[k2].id,j2))%4294967296;chars2+=j2.length}
      var a1=st1[c2];
      if(d2.length!==a1.docs)changed.push({collection:c2,kind:'documents',before:a1.docs,after:d2.length});
      else if(chars2!==a1.chars||sum2!==a1.sum)changed.push({collection:c2,kind:'content',before:a1.docs,after:d2.length});
    }
    man.changedDuringExport=changed;F.changed=changed;
    files.forEach(function(f,i){f.bytes=new Blob([f.text]).size;f.crc32=fbCrcOf(f.text);man.files.push({name:f.name,bytes:f.bytes,crc32:f.crc32,docs:f.docs})});
    Object.keys(man.collections).forEach(function(c){man.collections[c].files=man.collections[c].files.map(function(i){return files[i].name})});
    var mt=JSON.stringify(man,null,1);
    files.push({name:'desk-backup-'+stamp+'-manifest.json',text:mt,docs:0,bytes:new Blob([mt]).size,manifest:true,saved:false});
    F.files=files;F.manifest=man;F.stage='ready';F.msg='';F.pct=100;
  }catch(e){F.stage='error';F.msg=dbErrText(e)}
  S.lastHtml='';schedule();
}
async function fbSaveFile(i){
  var f=S.fb.files&&S.fb.files[i];if(!f)return;
  var d=window.__downloads;
  if(d){try{await d.save({filename:f.name,data:f.text});f.saved=true;return}catch(e){if(e&&e.code==='declined'){toast('Save cancelled');return}}}
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([f.text],{type:'application/json'}));a.download=f.name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},4000);f.saved=true;
}
async function fbSizes(){
  var F=S.fb;if(!fbOk()||F.sizeBusy)return;F.sizeBusy=true;F.size=null;S.lastHtml='';schedule();
  try{
    var X=window.__deskExt,rows=[],note='';
    if(X&&X.sizes){var r=await X.sizes();Object.keys(r.cols).forEach(function(c){rows.push({c:c,docs:r.cols[c].docs,chars:r.cols[c].chars})});note=r.note||''}
    else for(var i=0;i<FB_COLS.length;i++){var d=await fbReadAll(FB_COLS[i]),ch=0;d.forEach(function(x){ch+=JSON.stringify(x.data).length});if(d.length)rows.push({c:FB_COLS[i],docs:d.length,chars:ch})}
    rows.sort(function(a,b){return b.chars-a.chars});F.size={rows:rows,note:note}
  }catch(e){F.size={err:dbErrText(e)}}
  F.sizeBusy=false;S.lastHtml='';schedule();
}
function fbSizeHtml(){
  var F=S.fb,h='<section class="card"><div class="hd"><h2>Store size</h2></div><p class="note">Documents and characters of stored JSON per collection, so the first live run shows real sizes.</p><div class="row"><button class="btn" data-act="fb-size"'+(F.sizeBusy?' disabled':'')+'>'+(F.sizeBusy?'Measuring...':'Measure store size')+'</button></div>';
  if(F.size&&F.size.err)h+='<div class="banner warn"><span>'+esc(F.size.err)+'</span></div>';
  if(F.size&&F.size.rows){var tot=0,td=0;h+='<div class="tw"><table><thead><tr><th>Collection</th><th class="num">Documents</th><th class="num">Characters</th><th class="num">MB</th></tr></thead><tbody>';
    F.size.rows.forEach(function(r){tot+=r.chars;td+=r.docs;h+='<tr><td>'+esc(r.c)+'</td><td class="num">'+fmtN(r.docs)+'</td><td class="num">'+fmtN(r.chars)+'</td><td class="num">'+(r.chars/1048576).toFixed(2)+'</td></tr>'});
    h+='<tr><td><b>Total</b></td><td class="num"><b>'+fmtN(td)+'</b></td><td class="num"><b>'+fmtN(tot)+'</b></td><td class="num"><b>'+(tot/1048576).toFixed(2)+'</b></td></tr></tbody></table></div>';if(F.size.note)h+='<p class="note">'+esc(F.size.note)+'</p>'}
  return h+'</section>';
}
function fbHtml(){
  if(!fbOk())return '';
  var F=S.fb,h='<section class="card"><div class="hd"><h2>Full backup</h2></div>'
   +'<p class="note">Saves every collection (all '+FB_COLS.length+', including users, plans, actions and the sales data) as JSON files on <b>this computer</b>, with a manifest that lists documents and a checksum per collection. Nothing is sent anywhere. Files are about 20 MB each. Keep them private: they hold Virgo business data.</p>'
   +'<div class="row"><button class="btn pri" data-act="fb-make"'+(F.stage==='working'?' disabled':'')+'>'+(F.stage==='ready'?'Make a new backup':'Download full backup')+'</button>'
   +(F.stage==='working'?'<progress max="100" value="'+F.pct+'" style="width:220px"></progress> <span class="note">'+esc(F.msg)+'</span>':'')+'</div>';
  if(F.stage==='working'||F.stage==='ready')h+='<div class="banner warn"><span><b>Do not upload files or edit anything on this Desk</b> until the backup has been restored on the new Desk. Anything changed after the download is not in the backup.</span></div>';
  if(F.changed&&F.changed.length)h+='<div class="banner warn"><span><b>Data changed while the backup was being made</b> ('+F.changed.map(function(c){return esc(c.collection)+(c.kind==='content'?' (edited)':' '+c.before+' to '+c.after)}).join(', ')+'). Make the backup again.</span></div>';
  if(F.stage==='error')h+='<div class="banner warn"><span>Backup failed: '+esc(F.msg)+'</span></div>';
  if(F.stage==='ready'){
    var docs=0;Object.keys(F.manifest.collections).forEach(function(c){docs+=F.manifest.collections[c].docs});
    h+='<p class="note">Ready: '+fmtN(docs)+' documents in '+(F.files.length-1)+' data file(s) plus the manifest. Save every file, then keep them together.</p><div class="tw"><table><thead><tr><th>File</th><th class="num">Documents</th><th class="num">Size</th><th></th></tr></thead><tbody>';
    F.files.forEach(function(f,i){h+='<tr><td>'+esc(f.name)+'</td><td class="num">'+(f.manifest?'manifest':fmtN(f.docs))+'</td><td class="num">'+fmtBytes(f.bytes)+'</td><td><button class="btn sm" data-act="fb-save" data-i="'+i+'">'+(f.saved?'Saved, save again':'Save')+'</button></td></tr>'});
    h+='</tbody></table></div><div class="row"><button class="btn" data-act="fb-saveall">Save all files</button></div>';
  }
  h+='</section>'+fbSizeHtml();
  var ext=window.__deskExt&&window.__deskExt.toolsHtml;if(ext){try{h+=ext()}catch(e){}}
  return h;
}
Object.assign(handlers,{
 'fb-make':function(){return fbMake()},
 'fb-size':function(){return fbSizes()},
 'fb-save':async function(t){if(!fbOk())return;await fbSaveFile(+t.getAttribute('data-i'));S.lastHtml='';schedule()},
 'fb-saveall':async function(){if(!fbOk())return;for(var i=0;i<S.fb.files.length;i++){await fbSaveFile(i);await sleep(400)}S.lastHtml='';schedule()}
});
window.__deskExt=Object.assign(window.__deskExt||{},{refresh:function(){S.lastHtml='';schedule()},isSuper:fbOk,crc:fbCrcOf,crcAdd:fbCrcAdd,hex:fbHex,docCrc:fbDocCrc,sumHex:fbSumHex,cols:FB_COLS,toast:toast,make:fbMake});
