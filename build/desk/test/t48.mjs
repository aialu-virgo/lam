import { chromium, open } from './run.mjs';
import fs from 'fs';import crypto from 'crypto';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(collections|backups|uploads|rejects|cells|inv|roll)\//.test(k))delete st0[k]});
const rnd=n=>crypto.randomBytes(n).toString('base64');   /* already-compressed data: gzip cannot shrink it */
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
/* 2. total cap: oldest purged first */
await page.evaluate(()=>window.__desk.bkSetCap(2500000));
const xa=rnd(112000),xb=rnd(112000);
const r4=await page.evaluate(async ([xa,xb])=>{const g=window.__desk;const B=g.bkNew('ucap','INV',false);g.bkAdd(B,'inv/B1-1000-2026-04-0',{z:xa});g.bkAdd(B,'inv/B1-1000-2026-04-1',{z:xb});await g.bkCommit(B);await new Promise(r=>setTimeout(r,600));return {stored:g.bkStored(),docs:B.docs}},[xa,xb]);
const ups=await page.evaluate(()=>[...new Set(window.__desk.bkFor('utest').concat(window.__desk.bkFor('ucap')).map(d=>d.upload))]);
ok('total backups stay under the cap: older backups were purged first',r4.stored<=2500000&&r4.docs>=1&&ups.indexOf('ucap')>=0,JSON.stringify(r4)+' '+ups);
/* 3. the cap cannot be met: ask; cancel stops the load, confirm loads without a backup */
await page.evaluate(()=>window.__desk.bkSetCap(100000));
const xc=rnd(112000),xd=rnd(112000);
await page.evaluate(([xc])=>{const g=window.__desk;window.__askP=(async()=>{const B=g.bkNew('uask','INV',false);g.bkAdd(B,'inv/B1-1000-2026-05-1',{z:xc});try{await g.bkCommit(B);return 'committed:'+B.skipped+':'+B.docs}catch(e){return 'err:'+e.message}})()},[xc]);
await page.waitForTimeout(1500);
const dlg=await page.innerText('#dlg').catch(()=>'');
ok('over the cap with nothing left to purge: asks "Undo will not be able to restore the replaced months for this upload."',/Undo will not be able to restore the replaced months for this upload/.test(dlg),dlg.slice(0,120));
await page.click('[data-act="bk-cancel"]');const outc=await page.evaluate(()=>window.__askP);
ok('cancel stops the load before anything is replaced',/^err:.*nothing was changed/.test(outc),outc);
await page.evaluate(([xd])=>{const g=window.__desk;window.__askP=(async()=>{const B=g.bkNew('uask2','INV',false);g.bkAdd(B,'inv/B1-1000-2026-05-1',{z:xd});await g.bkCommit(B);return 'committed:'+B.skipped+':'+B.docs})()},[xd]);
await page.waitForTimeout(1200);await page.click('[data-act="bk-go"]');const outg=await page.evaluate(()=>window.__askP);
ok('confirm loads without a backup (skipped, no backup docs written)',outg==='committed:true:0',outg);
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
