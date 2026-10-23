import { chromium, open } from './run.mjs';
import fs from 'fs';import crypto from 'crypto';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(collections|backups|uploads|rejects|cells|inv|roll)\//.test(k))delete st0[k]});
const rnd=n=>crypto.randomBytes(n).toString('base64');   /* already-compressed data: gzip cannot shrink it */
for(const u of ['utest','upart'])st0['uploads/'+u]={at:u==='utest'?'2026-10-01T10:00:00.000Z':'2026-10-02T10:00:00.000Z',sys:'B1',entity:'INV',file:u+'.csv',status:'Loaded',quarters:['Q1 FY27']};
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
/* 1. > 1 MB of already-compressed chunks, plus one document of ~250 KB: several backup docs, each under 240 KB stored, restoring exactly */
const items=[];for(let i=0;i<7;i++)items.push(['inv/B1-1012-2026-04-'+i,{z:rnd(150000),n:i,sys:'B1'}]);items.push(['inv/B1-1013-2026-04-0',{z:rnd(190000),n:9}]);
const total=items.reduce((a,x)=>a+JSON.stringify(x[1]).length,0);
const r=await page.evaluate(async items=>{const g=window.__desk;const B=g.bkNew('utest','INV',false);items.forEach(x=>g.bkAdd(B,x[0],x[1]));try{await g.bkCommit(B)}catch(e){return {err:JSON.stringify(e)+(e&&e.message)}}return {docs:B.docs,bytes:B.bytes}},items);console.log(JSON.stringify(r));
await page.waitForTimeout(800);
let m=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^backups\//.test(k))));
const sizes=Object.values(m).map(d=>JSON.stringify(d).length),zs=Object.values(m).map(d=>d.z.length);
ok('more than 1 MB of already-compressed chunks ends up as several backup documents',total>1000000&&Object.keys(m).length>=5,total+' bytes in '+Object.keys(m).length+' docs');
ok('every backup document is at most 240,000 bytes as stored (and far below the 256 KiB limit)',Math.max(...zs)<=240000&&Math.max(...sizes)<250000,'z max '+Math.max(...zs)+', doc max '+Math.max(...sizes));
/* restore exactly: write the originals away, restore, compare */
const back=await page.evaluate(async items=>{const g=window.__desk;try{const rs=await g.bkRestore('utest',null);return rs.n}catch(e){return 'ERR '+JSON.stringify(e)+(e&&e.message)}},items);
const m2=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^inv\/B1-101/.test(k))));
ok('restore returns every document exactly',back===items.length&&items.every(x=>JSON.stringify(m2[x[0]])===JSON.stringify(x[1])),back+' of '+items.length);
/* one document larger than the limit when wrapped: cut into parts and joined again */
const big=rnd(190000);const r3=await page.evaluate(async big=>{const g=window.__desk;const B=g.bkNew('upart','INV',false);g.bkAdd(B,'inv/B1-1099-2026-04-0',{z:big});try{await g.bkCommit(B);await new Promise(r=>setTimeout(r,500));const rs=await g.bkRestore('upart',null);return {docs:B.docs,n:rs.n}}catch(e){return {err:JSON.stringify(e)+(e&&e.message)+(e&&e.stack)}}},big);console.log(JSON.stringify(r3));
const m3=await page.evaluate(()=>window.__mockStore()['inv/B1-1099-2026-04-0']);
ok('a single item larger than one document is split into parts and restored whole',r3.docs>=2&&r3.n===1&&m3&&m3.z===big,JSON.stringify(r3));
/* 2. total cap, D47: whole uploads only, oldest first; planned before anything is deleted; marked in history */
const stBk=()=>page.evaluate(()=>{const m=window.__mockStore();const by={};Object.entries(m).filter(([k])=>/^backups\//.test(k)).forEach(([k,v])=>{by[v.upload]=(by[v.upload]||0)+1});return {by:by,marked:Object.entries(m).filter(([k,v])=>/^uploads\//.test(k)&&v.backup_removed).map(([k])=>k.slice(8))}});
await page.evaluate(()=>window.__desk.bkSetCap(2150000));
const before=await stBk();
const xa=rnd(112000),xb=rnd(112000);
await page.evaluate(([xa,xb])=>{const g=window.__desk;window.__capP=(async()=>{const B=g.bkNew('ucap','INV',false);g.bkAdd(B,'inv/B1-1000-2026-04-0',{z:xa});g.bkAdd(B,'inv/B1-1000-2026-04-1',{z:xb});try{await g.bkCommit(B);return 'ok:'+B.docs}catch(e){return 'err:'+e.message}})()},[xa,xb]);
await page.waitForTimeout(1500);
const dlg2=await page.innerText('#dlg').catch(()=>'');
ok('D3: it fits after purging older uploads, so the confirm lists those uploads (not "no room")',/Older backups must go/.test(dlg2)&&/utest|Upload|\.csv|u/.test(dlg2)&&!/Undo will not be able to restore the replaced months/.test(dlg2),dlg2.replace(/\s+/g,' ').slice(0,200));
const mid=await stBk();
ok('D3: nothing has been deleted while the confirm is shown',JSON.stringify(mid.by)===JSON.stringify(before.by)&&mid.marked.length===0,JSON.stringify(mid));
await page.click('[data-act="bk-cancel"]');const cc=await page.evaluate(()=>window.__capP);await page.waitForTimeout(500);const aft=await stBk();
ok('D3: Cancel changes nothing: the load stops, every older backup is still there and unmarked',/^err:.*nothing was changed/.test(cc)&&JSON.stringify(aft.by)===JSON.stringify(before.by)&&aft.marked.length===0,cc+' '+JSON.stringify(aft));
await page.evaluate(([xa,xb])=>{const g=window.__desk;window.__capP=(async()=>{const B=g.bkNew('ucap','INV',false);g.bkAdd(B,'inv/B1-1000-2026-04-0',{z:xa});g.bkAdd(B,'inv/B1-1000-2026-04-1',{z:xb});try{await g.bkCommit(B);return 'ok:'+B.docs}catch(e){return 'err:'+e.message}})()},[xa,xb]);
await page.waitForTimeout(1200);await page.click('[data-act="bk-go"]');const gg=await page.evaluate(()=>window.__capP);await page.waitForTimeout(1200);const aft2=await stBk();
const gone=Object.keys(before.by).filter(u=>!aft2.by[u]);
ok('D2: "Load anyway" purges whole uploads (all of an upload\'s docs together), oldest first, then loads',/^ok:/.test(gg)&&gone.length>=1&&Object.keys(aft2.by).every(u=>u==='ucap'||before.by[u]===aft2.by[u])&&aft2.by.ucap>=1,JSON.stringify([gg,before.by,aft2.by]));
ok('D2: each purged upload is marked "backup removed" in its history record',gone.every(u=>aft2.marked.indexOf(u)>=0),JSON.stringify([gone,aft2.marked]));
/* history shows it */
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(1200);
if(await page.$('#hf-rep'))await page.check('#hf-rep');await page.waitForTimeout(500);const ht=await page.innerText('#i-hist').catch(()=>'');
ok('D2: history shows "Undo no longer restores (backup removed <date>)"',/Undo no longer restores \(backup removed/.test(ht),(ht.match(/Undo no longer[^\n]*/)||[''])[0]);
/* 3. the cap cannot be met even with everything purged: purge nothing, ask, cancel changes nothing, go loads without a backup */
await page.evaluate(()=>window.__desk.bkSetCap(100000));
const before3=await stBk();const xc=rnd(112000),xd=rnd(112000);
await page.evaluate(([xc])=>{const g=window.__desk;window.__askP=(async()=>{const B=g.bkNew('uask','INV',false);g.bkAdd(B,'inv/B1-1000-2026-05-1',{z:xc});try{await g.bkCommit(B);return 'committed:'+B.skipped+':'+B.docs}catch(e){return 'err:'+e.message}})()},[xc]);
await page.waitForTimeout(1500);
const dlg=await page.innerText('#dlg').catch(()=>'');
ok('over the cap even after purging everything: asks "Undo will not be able to restore the replaced months for this upload."',/Undo will not be able to restore the replaced months for this upload/.test(dlg)&&/Nothing has been removed/.test(dlg),dlg.replace(/\s+/g,' ').slice(0,160));
await page.click('[data-act="bk-cancel"]');const outc=await page.evaluate(()=>window.__askP);const a3=await stBk();
ok('cancel stops the load and changes nothing: no backup was purged',/^err:.*nothing was changed/.test(outc)&&JSON.stringify(a3.by)===JSON.stringify(before3.by),outc+JSON.stringify(a3.by));
await page.evaluate(([xd])=>{const g=window.__desk;window.__askP=(async()=>{const B=g.bkNew('uask2','INV',false);g.bkAdd(B,'inv/B1-1000-2026-05-1',{z:xd});await g.bkCommit(B);return 'committed:'+B.skipped+':'+B.docs})()},[xd]);
await page.waitForTimeout(1200);await page.click('[data-act="bk-go"]');const outg=await page.evaluate(()=>window.__askP);const a4=await stBk();
ok('confirm loads without a backup (skipped, no backup docs) and still purges nothing',outg==='committed:true:0'&&JSON.stringify(a4.by)===JSON.stringify(before3.by),outg);
await page.evaluate(()=>window.__desk.bkSetCap(20*1024*1024));
/* 4. a backup write that fails stops the load before anything is replaced */
let ctx2=await open(browser,{store:Object.assign(JSON.parse(JSON.stringify(st0)),{'collections/1012-2026-08':{plant:'1012',ym:'2026-08',total:77,n:2,rows:[['1',1,'X',77,'']],upload:'uOld'},'uploads/uOld':{at:'2026-10-01T10:00:00.000Z',sys:'B1',entity:'CL',file:'old.csv',status:'Loaded',months:['2026-08']}}),autoload:true,mode:{failSet:'^backups/'}});
const p2=ctx2.page;await p2.waitForTimeout(3500);await p2.evaluate(()=>{location.hash='#/intake'});await p2.waitForTimeout(600);
const CH=['#','BRANCHNAME','DOCNUM','DOCDATE','DOCTYPE','PAYMENTMEANS','ACCOUNT','ACCOUNTNAME','CARDCODE','CARDNAME','CITY','CHECK_DATE','CHECKNO','CHECKSUM','TARNSFERREF','TRANSFER_DATE','TRANSFERSUM','CASHSUM','REMARKS','JOURNALREMARK'];
const row=(n,a)=>[n,'DEMO plant 1012',n,'10/08/2026','C','Bank','','','DEMOCU1','C1','','','',0,'','',a,0,'',''];
fs.writeFileSync(AF+'Incoming_Payment_Report_-2026-08-01_to_2026-08-31 fail.csv',[CH.join(',')].concat([row(1,50),row(2,60),row(3,70)].map(r=>r.join(','))).join('\n'));
await (await p2.$('input[type=file]')).setInputFiles(AF+'Incoming_Payment_Report_-2026-08-01_to_2026-08-31 fail.csv');await p2.waitForFunction(()=>window.__desk.U&&window.__desk.U.stage==='mapping',null,{timeout:20000});
await p2.click('[data-act="coll-validate"]');await p2.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:20000});
const msg=await p2.evaluate(()=>window.__desk.U.doneMsg);const cdoc=await p2.evaluate(()=>window.__mockStore()['collections/1012-2026-08']);
ok('if the backup cannot be saved the load stops and says nothing was changed',/Load stopped: the backup of the data being replaced could not be saved; nothing was changed\./.test(msg),msg);
ok('and the data being replaced is untouched',cdoc.total===77&&cdoc.upload==='uOld',JSON.stringify([cdoc.total,cdoc.upload]));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
