/* ================= Full backup (Super admin, Admin > Tools) =================
 * Reads every collection the page knows and builds JSON part files (about 20 million characters each) plus one manifest
 * (documents, characters and a CRC-32 per collection; bytes and CRC-32 per file). The files are built in this browser tab and saved to the
 * viewer's own computer; nothing is sent anywhere. Doc ids and contents are kept exactly as stored.
 * Checksum of a collection: CRC-32 over, for each document in id order (plain string order), id + "\n" + JSON.stringify(data) + "\n". */
var FB_COLS=['users','plants','periods','cells','mappings','uploads','transfers','potential','planlocks','audit','actions','followups','settings','phasing','roll','receivables','collections','backups','customers','creditnotes','stock','itemmeta','salesmaster','inv','items','rejects','log','orders','deliveries'];
var FB_MAX=window.__FB_MAX||20000000;
S.fb={stage:'idle',msg:'',pct:0,files:null,manifest:null};
var FB_CRC_T=(function(){var t=new Uint32Array(256);for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function fbCrcAdd(crc,str){var u=new TextEncoder().encode(str);for(var i=0;i<u.length;i++)crc=FB_CRC_T[(crc^u[i])&255]^(crc>>>8);return crc>>>0}
function fbHex(c){return ('0000000'+((c^0xFFFFFFFF)>>>0).toString(16)).slice(-8)}
function fbCrcOf(str){return fbHex(fbCrcAdd(0xFFFFFFFF,str))}
function fbOk(){return viewerRole()==='Super admin'&&!readOnly()}
async function fbReadAll(col){
  var q=S.db.collection(col);
  var snap=q.get?await dbRetry(function(){return q.get()}):await new Promise(function(res,rej){var un=q.onSnapshot(function(s){try{un&&un()}catch(e){}res(s)},rej)});
  return snap.docs.map(function(d){return {id:d.id,data:d.data()||{}}}).sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0});
}
async function fbMake(){
  if(!fbOk()){toast('Only a Super admin can make a full backup');return}
  var F=S.fb;if(F.stage==='working')return;
  F.stage='working';F.files=null;F.manifest=null;F.pct=0;F.msg='Starting';S.lastHtml='';schedule();
  try{
    var stamp=nowISO().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),files=[],cur=[],curLen=0,man={kind:'virgo-desk-backup-manifest',v:1,stamp:stamp,createdAt:nowISO(),by:whoAmI(),checksum:'CRC-32 over id+"\\n"+JSON.stringify(data)+"\\n" per document, documents in id order',collections:{},files:[]};
    function flush(){
      if(!cur.length)return;var n=files.length+1;
      var name='desk-backup-'+stamp+'-part-'+('0'+n).slice(-2)+'.json';
      var text='{"kind":"virgo-desk-backup-part","v":1,"stamp":"'+stamp+'","part":'+n+',"docs":['+cur.join(',')+']}';
      files.push({name:name,text:text,docs:cur.length,saved:false});cur=[];curLen=0;
    }
    for(var ci=0;ci<FB_COLS.length;ci++){
      var col=FB_COLS[ci];F.msg='Reading '+col+' ('+(ci+1)+' of '+FB_COLS.length+')';F.pct=Math.round(ci/FB_COLS.length*100);schedule();
      var docs=await fbReadAll(col),crc=0xFFFFFFFF,chars=0,fnames={};
      for(var i=0;i<docs.length;i++){
        var js=JSON.stringify(docs[i].data),line=docs[i].id+'\n'+js+'\n';crc=fbCrcAdd(crc,line);chars+=js.length;
        var e='['+JSON.stringify(col)+','+JSON.stringify(docs[i].id)+','+js+']';
        if(curLen&&curLen+e.length>(window.__FB_MAX||FB_MAX))flush();
        cur.push(e);curLen+=e.length;fnames[files.length]=1;
      }
      man.collections[col]={docs:docs.length,chars:chars,crc32:fbHex(crc),files:Object.keys(fnames).map(function(k){return +k})};
    }
    flush();
    var idx={};
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
function fbHtml(){
  if(!fbOk())return '';
  var F=S.fb,h='<section class="card"><div class="hd"><h2>Full backup</h2></div>'
   +'<p class="note">Saves every collection (all '+FB_COLS.length+', including users, plans, actions and the sales data) as JSON files on <b>this computer</b>, with a manifest that lists documents and a checksum per collection. Nothing is sent anywhere. Files are about 20 MB each. Keep them private: they hold Virgo business data.</p>'
   +'<div class="row"><button class="btn pri" data-act="fb-make"'+(F.stage==='working'?' disabled':'')+'>'+(F.stage==='ready'?'Make a new backup':'Download full backup')+'</button>'
   +(F.stage==='working'?'<progress max="100" value="'+F.pct+'" style="width:220px"></progress> <span class="note">'+esc(F.msg)+'</span>':'')+'</div>';
  if(F.stage==='error')h+='<div class="banner warn"><span>Backup failed: '+esc(F.msg)+'</span></div>';
  if(F.stage==='ready'){
    var docs=0;Object.keys(F.manifest.collections).forEach(function(c){docs+=F.manifest.collections[c].docs});
    h+='<p class="note">Ready: '+fmtN(docs)+' documents in '+(F.files.length-1)+' data file(s) plus the manifest. Save every file, then keep them together.</p><div class="tw"><table><thead><tr><th>File</th><th class="num">Documents</th><th class="num">Size</th><th></th></tr></thead><tbody>';
    F.files.forEach(function(f,i){h+='<tr><td>'+esc(f.name)+'</td><td class="num">'+(f.manifest?'manifest':fmtN(f.docs))+'</td><td class="num">'+fmtBytes(f.bytes)+'</td><td><button class="btn sm" data-act="fb-save" data-i="'+i+'">'+(f.saved?'Saved, save again':'Save')+'</button></td></tr>'});
    h+='</tbody></table></div><div class="row"><button class="btn" data-act="fb-saveall">Save all files</button></div>';
  }
  h+='</section>';
  var ext=window.__deskExt&&window.__deskExt.toolsHtml;if(ext){try{h+=ext()}catch(e){}}
  return h;
}
Object.assign(handlers,{
 'fb-make':function(){return fbMake()},
 'fb-save':async function(t){if(!fbOk())return;await fbSaveFile(+t.getAttribute('data-i'));S.lastHtml='';schedule()},
 'fb-saveall':async function(){if(!fbOk())return;for(var i=0;i<S.fb.files.length;i++){await fbSaveFile(i);await sleep(400)}S.lastHtml='';schedule()}
});
window.__deskExt=Object.assign(window.__deskExt||{},{refresh:function(){S.lastHtml='';schedule()},isSuper:fbOk,crc:fbCrcOf,crcAdd:fbCrcAdd,hex:fbHex,cols:FB_COLS,toast:toast,make:fbMake});
