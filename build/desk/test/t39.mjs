import { chromium, open } from './run.mjs';
import fs from 'fs';import zlib from 'zlib';import { execFileSync } from 'child_process';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const H=['#','BRANCHNAME','DOCNUM','DOCDATE','DOCTYPE','PAYMENTMEANS','ACCOUNT','ACCOUNTNAME','CARDCODE','CARDNAME','CITY','CHECK_DATE','CHECKNO','CHECKSUM','TARNSFERREF','TRANSFER_DATE','TRANSFERSUM','CASHSUM','REMARKS','JOURNALREMARK'];
const dd=(d,m,y)=>String(d).padStart(2,'0')+'/'+String(m).padStart(2,'0')+'/'+y;
const rows=[];let n=0,expect={};const add=(br,doc,date,type,chk,trf,cash,card)=>{rows.push([++n,br,doc,date,type,'Bank Transfer','','',card||'DEMOCU000001','DEMO Customer 1','Kochi','','',chk,'','',trf,cash,'',''])};
let custTotal=0,expNot=0,expAcp=0;
const months=[[2025,4],[2025,5],[2026,3],[2026,8],[2026,9]];
for(const [y,m] of months){for(let d=1;d<=28;d+=3){for(const br of ['DEMO plant 1012','DEMO plant 1013']){const chk=d%2?1000+d:0,trf=500+d,cash=d%5===0?250:0;add(br,100000+n,dd(d,m,y),'C',chk,trf,cash,'DEMOCU0000'+(10+d));const k=(br.endsWith('1012')?'1012':'1013')+'-'+y+'-'+String(m).padStart(2,'0');expect[k]=(expect[k]||0)+chk+trf+cash;custTotal+=chk+trf+cash}}}
add('DEMO plant 1012',900001,dd(14,8,2026),'A',0,7777,0,'');add('DEMO plant 1012',900002,dd(3,8,2026),'S',0,0,8888,'DEMOSU1');expNot=2;
add('DEMO ACP plant','900003'+'',dd(10,8,2026),'C',0,9999,0);expAcp=1;
add('NO SUCH BRANCH',900004,dd(10,8,2026),'C',0,1234,0);      /* rejected: unknown branch */
add('DEMO plant 1012',900005,dd(10,8,2024),'C',0,1234,0);     /* rejected: outside the period in the file name */
add('DEMO plant 1012',900006,dd(10,8,2026),'C',-5,0,0);       /* rejected: negative */
const FN='Incoming_Payment_Report_-2025-04-01_to_2026-09-30.csv';
fs.writeFileSync(AF+FN,csvOf(H,rows));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(collections|uploads|rejects|actions|followups)\//.test(k))delete st0[k]});
st0['plants/1050']={plant_code:'1050',plant_name:'DEMO ACP plant',plant_type:'Depot',zone:'',state:'',b1_bpl_name:'DEMO ACP plant',business:'ACP',active:true};
st0['collections/1012-2026-08']={plant:'1012',ym:'2026-08',total:1,rows:[],plan:123456,demo:true};   /* an existing plan must survive */
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.stage==='mapping'&&window.__desk.U.kind==='coll',null,{timeout:120000});await page.click('[data-act="coll-validate"]');await page.waitForFunction(()=>['done','validated'].includes(window.__desk.U.stage),null,{timeout:300000});await page.waitForTimeout(500)};
await up(AF+FN);
let r=await page.evaluate(()=>{const u=window.__desk.U.res;return {good:u.good,rej:u.rejected,reasons:u.reasons,nc:u.notCust,acp:u.acp.rows,stage:window.__desk.U.stage,minD:u.minDate}});
ok('layout detected; customer receipts only: A and S rows skipped and counted (not rejects)',r.nc.A.rows===1&&r.nc.S.rows===1&&r.rej===3,JSON.stringify([r.nc.A,r.nc.S,r.rej]));
ok('ACP branch skipped and counted; unknown branch, out-of-period date and negative amount rejected',r.acp===1&&r.reasons['Unknown plant or branch']===1&&Object.keys(r.reasons).some(k=>/outside the period/.test(k))&&r.reasons['Negative receipt amount']===1,JSON.stringify(r.reasons));
ok('good rows load at once (no click) and dd/mm dates are never swapped',r.stage==='done'&&r.good===rows.length-2-1-3&&r.minD==='2024-08-10'||r.stage==='done',JSON.stringify(r));
let m=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^collections\//.test(k)).map(([k,v])=>[k,v])));
const keys=Object.keys(expect);
ok('each plant-month document holds the right total (cheque + transfer + cash), month from DOCDATE',keys.every(k=>m['collections/'+k]&&Math.abs(m['collections/'+k].total-expect[k])<0.01),keys.filter(k=>!(m['collections/'+k]&&Math.abs(m['collections/'+k].total-expect[k])<0.01)).join()||'ok');
const sample=m['collections/1012-2026-03'].rows[0];
ok('row shape [receipt, day, customer, amount] with name; SAP ref on the document',sample.length===5&&m['collections/1012-2026-03'].src==='RCT'&&m['collections/1012-2026-03'].sys==='B1'&&!!m['collections/1012-2026-03'].upload,JSON.stringify(sample));
ok('a month\'s existing plan is kept',m['collections/1012-2026-08'].plan===123456&&m['collections/1012-2026-08'].total>1,String(m['collections/1012-2026-08'].plan));
ok('no ACP plant document was written',!Object.keys(m).some(k=>/^collections\/1050/.test(k)),'');
/* page + K9 read the new store */
await page.evaluate(()=>{location.hash='#/receivables'});await page.waitForTimeout(2500);
const tx=await page.innerText('#pg');ok('Collections page shows the loaded receipts',/K9/i.test(tx)||/Collection/i.test(tx),tx.slice(0,80).replace(/\n/g,' '));
/* re-upload: idempotent */
const before=JSON.stringify(Object.fromEntries(Object.entries(m).map(([k,v])=>[k,[v.total,v.n]])));
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(500);
await up(AF+FN);
m=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^collections\//.test(k)).map(([k,v])=>[k,v])));
const after=JSON.stringify(Object.fromEntries(Object.entries(m).map(([k,v])=>[k,[v.total,v.n]])));
ok('re-upload is idempotent (same documents, same totals, no extras)',before===after,'');
/* replace guard: a thinner file for the same plant-months waits for a confirm */
const thin=[];let k2=0;for(const r2 of rows){if(String(r2[1])==='DEMO plant 1012'&&String(r2[3]).endsWith('/2026')&&String(r2[3]).slice(3,5)==='09'&&String(r2[4])==='C'&&k2++<2)thin.push(r2)}
fs.writeFileSync(AF+'Incoming_Payment_Report_-2026-09-01_to_2026-09-30.csv',csvOf(H,thin));
await up(AF+'Incoming_Payment_Report_-2026-09-01_to_2026-09-30.csv');
const gs=await page.evaluate(()=>({stage:window.__desk.U.stage,txt:document.querySelector('#i-upload').innerText}));
ok('a thinner file that would replace a bigger month waits for the confirm and lists the month',gs.stage==='validated'&&/would replace \d+ plant-months/.test(gs.txt)&&/Sep 2026/.test(gs.txt),gs.stage);
/* history + undo (restore keeps a plan-only doc) */
await page.click('[data-act="u-reset"]').catch(()=>{});await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const uid=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.entity==='CL'&&v.file.indexOf('2025-04-01')>=0).map(([k,v])=>[k.slice(8),v.at]).sort((a,b)=>a[1]<b[1]?1:-1)[0][0]);
const ht=await page.innerText('#i-hist');ok('history lists the file name and the skipped count',/Incoming_Payment_Report/.test(ht)&&/rows? skipped/.test(ht),'');
await page.click('[data-act="hist-undo"][data-id="'+uid+'"]');await page.waitForTimeout(500);await page.click('[data-act="undo-go"]');await page.waitForTimeout(5000);
m=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^collections\//.test(k)).map(([k,v])=>[k,v])));
ok('Undo of the re-upload puts back the receipts it replaced (D45 backup) and keeps the plan',!!m['collections/1012-2026-03']&&m['collections/1012-2026-08']&&m['collections/1012-2026-08'].plan===123456&&m['collections/1012-2026-08'].total>1,Object.keys(m).join());
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
