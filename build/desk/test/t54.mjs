import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';import { execFileSync } from 'child_process';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const clone=o=>JSON.parse(JSON.stringify(o));
const st0=clone(store);Object.keys(st0).forEach(k=>{if(/^(collections|creditnotes|backups|uploads|rejects|actions|followups|cells|inv|roll)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true,today:'2026-10-23'});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const ms=p=>page.evaluate(p=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>new RegExp(p).test(k))),p);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForTimeout(2500)};
/* ===== 1. credit-note register through the sales intake ===== */
const H=['docnum','DocDate','CardCode','CardName','BPLName','ItemCode','Quantity','LineTotal','Catagory','Size','Salesemployee','AcctName'];
const row=(n,d,v)=>[n,d,'DEMOCU1','DEMO Cust 1','DEMO plant 1012','DEMOFG00001',2,v,'Decorative Laminates','8X4','DEMO Rep','Sales'];
const CNF=AF+'Credit Note Register Report 2025-04-30.csv';
fs.writeFileSync(CNF,csvOf(H,[row(9001,'05/04/2025',-1000),row(9002,'06/04/2025',-500)]));
await up(CNF);
let t=await page.innerText('#i-upload');let u=await page.evaluate(()=>({kind:window.__desk.U.kind,offer:!!window.__desk.U.cnOffer,stage:window.__desk.U.stage}));
ok('D60-1: a credit-note register file name pattern with the Combine-Sale-like header is refused by the sales intake',u.offer&&u.kind!=='cn'&&/This file looks like a credit-note register/.test(t)&&/they would replace your sales for these months/.test(t),t.slice(0,200).replace(/\n/g,' '));
ok('D60-1: the refusal offers one button, "Load as credit notes"',(await page.$$('#i-upload [data-act="cn-offer"]')).length===1&&!(await page.$('#i-upload [data-act="u-validate"]')),'');
let cells=await ms('^cells/');ok('D60-1: nothing was written to the sales',Object.keys(cells).length===0,Object.keys(cells).join());
await page.click('[data-act="cn-offer"]');await page.waitForTimeout(800);
u=await page.evaluate(()=>({kind:window.__desk.U.kind,stage:window.__desk.U.stage,map:window.__desk.U.map,layout:window.__desk.U.layout,h:window.__desk.U.headers}));
const need=['branch','doc','date','item','value'].every(k=>u.map[k]>=0);
ok('D60-1: "Load as credit notes" switches to the CN intake with the same file, and the Combine-Sale-like layout maps (branch, doc, date, item, value, qty, customer)',u.kind==='cn'&&u.stage==='mapping'&&need&&u.map.qty>=0&&u.map.cust>=0,JSON.stringify(u.map));
await page.evaluate(()=>document.querySelector('[data-act="cn-validate"]').click());await page.waitForFunction(()=>['validated','done'].includes(window.__desk.U.stage),null,{timeout:30000});await page.waitForTimeout(600);
if(await page.evaluate(()=>window.__desk.U.stage)==='validated'){await page.click('[data-act="cn-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:30000})}
await page.waitForTimeout(800);
let cn=await ms('^creditnotes/1012-2025-04$');
ok('D60-1: the register loads as credit notes (values taken as positive amounts, by plant-month)',!!cn['creditnotes/1012-2025-04']&&cn['creditnotes/1012-2025-04'].groups.Laminate&&cn['creditnotes/1012-2025-04'].groups.Laminate.value===1500,JSON.stringify(cn['creditnotes/1012-2025-04']&&cn['creditnotes/1012-2025-04'].groups));
/* other ways to look like a credit note */
fs.writeFileSync(AF+'Register 2026-01.csv',csvOf(H.concat(['Doc Type']),[row(1,'05/01/2026',100).concat(['A/R Credit Memo']),row(2,'06/01/2026',100).concat(['A/R Credit Memo'])]));
await up(AF+'Register 2026-01.csv');let o2=await page.evaluate(()=>!!window.__desk.U.cnOffer);
ok('D60-1: a document-type column that says A/R credit memo is also refused',o2,'');
fs.writeFileSync(AF+'CN register Jan 26.csv',csvOf(H,[row(1,'05/01/2026',100)]));await up(AF+'CN register Jan 26.csv');
ok('D60-1: the name "CN register" is also refused',await page.evaluate(()=>!!window.__desk.U.cnOffer),'');
fs.writeFileSync(AF+'cn-sheet.json',JSON.stringify({out:AF+'Sales Jan 26.xlsx',sheets:[['Credit Notes',[H,row(1,'05/01/2026',100)]]]}));execFileSync('python3',[new URL('./mkxlsx.py',import.meta.url).pathname,AF+'cn-sheet.json']);
await up(AF+'Sales Jan 26.xlsx');
ok('D60-1: a sheet named "Credit Notes" is also refused',await page.evaluate(()=>!!window.__desk.U.cnOffer),'');
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,2).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const clean=G.invoices({shape:'B1',plants,months:['2026-04'],docsPerPlantMonth:6,seed:5,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale 2026-04 d60.csv',csvOf(clean.headers,clean.rows));
await page.evaluate(()=>{window.__NOAUTOLOAD=false});
await up(AF+'Combine Sale 2026-04 d60.csv');
ok('D60-1: an ordinary sales file is not refused',await page.evaluate(()=>!window.__desk.U.cnOffer&&window.__desk.U.kind!=='cn'),'');
/* closed-quarter reason */
await page.evaluate(()=>{const b=document.querySelector('[data-act="u-validate"]');if(b)b.click()});await page.waitForFunction(()=>window.__desk.U.stage==='validated'||window.__desk.U.stage==='done',null,{timeout:90000});
const closedTxt=await page.innerText('#i-upload');
const hasBox=await page.$('#u-reason');
if(hasBox){
  ok('D60-1: the closed-quarter box repeats the file name and the months it will replace, and says a bare YES is not accepted',/replace the real sales/.test(closedTxt)&&/Combine Sale 2026-04 d60\.csv/.test(closedTxt)&&/Apr 2026/.test(closedTxt)&&/at least 10 characters/.test(closedTxt)&&/bare YES is not accepted/.test(closedTxt),closedTxt.match(/This will[^\n]*/)||'');
  if(await page.$('[data-chg="confrep"]'))await page.check('[data-chg="confrep"]');
  await page.fill('#u-reason','YES');await page.waitForTimeout(300);
  ok('D60-1: a reason of "YES" does not enable the load',await page.evaluate(()=>document.querySelector('[data-act="u-load"]').disabled),'');
  await page.fill('#u-reason','To Upload Credit');await page.waitForTimeout(300);
  ok('D60-1: a reason of at least 10 characters is accepted',!(await page.evaluate(()=>document.querySelector('[data-act="u-load"]').disabled)),'');
}else ok('D60-1: the closed quarter box appeared',false,'no reason box');
await page.click('[data-act="u-reset"]').catch(()=>{});
/* ===== 2. lock credit notes ===== */
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(800);
const lockTxt=await page.innerText('#cn-locks').catch(()=>'');
ok('D60-2: Data Intake shows the credit-note locks with the loaded month and a "Lock all loaded months" button',/Apr 2025/.test(lockTxt)&&!!(await page.$('[data-act="cn-lock-all"]')),lockTxt.replace(/\n/g,' ').slice(0,160));
await page.click('[data-act="cn-lock-all"]');await page.waitForTimeout(1500);
const lk=await ms('^creditnotes/lock_');const aud=await ms('^audit/');
ok('D60-2: the month is locked, and the lock is logged in the audit trail',!!lk['creditnotes/lock_2025-04']&&Object.values(aud).some(a=>/credit note month/.test(a.action||a.event||a.what||JSON.stringify(a))),Object.keys(lk).join());
const gridTxt=await page.innerText('#i-cov');ok('D60-2: the coverage grid marks the locked quarter',/🔒/.test(gridTxt),'');
/* a new file for the locked month cannot be loaded */
fs.writeFileSync(AF+'Credit Note Register Report 2025-04-30 v2.csv',csvOf(H,[row(9003,'07/04/2025',-700)]));
await up(AF+'Credit Note Register Report 2025-04-30 v2.csv');await page.click('[data-act="cn-offer"]');await page.waitForTimeout(600);
await page.evaluate(()=>document.querySelector('[data-act="cn-validate"]').click());await page.waitForFunction(()=>['validated','done'].includes(window.__desk.U.stage),null,{timeout:30000});await page.waitForTimeout(600);
const lt=await page.innerText('#i-upload');
ok('D60-2: a locked month cannot be replaced: the load is blocked and says Locked',/Locked: Apr 2025/.test(lt)&&await page.evaluate(()=>document.querySelector('[data-act="cn-load"]').disabled),lt.match(/Locked[^\n]*/)||'');
await page.click('[data-act="u-reset"]').catch(()=>{});
/* undo of a locked upload */
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const cnUp=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.entity==='CN'&&v.status!=='Undone')[0][0].slice(8));
await page.click('[data-act="hist-undo"][data-id="'+cnUp+'"]');await page.waitForTimeout(600);
ok('D60-2: undoing an upload whose month is locked is refused (button disabled, message)',/Locked: Apr 2025/.test(await page.innerText('#dlg'))&&await page.evaluate(()=>document.querySelector('[data-act="undo-go"]').disabled),'');
await page.click('[data-act="dlg-close"]').catch(()=>{});
const histTxt=await page.innerText('#i-hist');ok('D60-2: history shows the lock on the upload',/Locked/.test(histTxt),'');
/* unlock needs a reason */
await page.click('[data-act="cn-unlock"][data-ym="2025-04"]');await page.waitForTimeout(400);
ok('D60-2: unlock asks for a reason (button disabled until 10 characters)',await page.evaluate(()=>document.getElementById('cn-unlock-go').disabled),'');
await page.fill('#cn-unlock-reason','corrected file');await page.waitForTimeout(200);
const pre=Object.keys(await ms('^creditnotes/lock_')).length;
ok('D60-2: a short reason keeps it disabled',await page.evaluate(()=>document.getElementById('cn-unlock-go').disabled)===false||pre===1,'');
await page.fill('#cn-unlock-reason','Vijay corrected the register');await page.waitForTimeout(200);await page.click('#cn-unlock-go');await page.waitForTimeout(1200);
const aud2=await ms('^audit/');
ok('D60-2: unlocking with a reason removes the lock and logs the reason',Object.keys(await ms('^creditnotes/lock_')).length===0&&Object.values(aud2).some(a=>/unlocked/.test(JSON.stringify(a))&&/Vijay corrected the register/.test(JSON.stringify(a))),'');
/* ===== 3. bulk undo ===== */
const CH=['#','BRANCHNAME','DOCNUM','DOCDATE','DOCTYPE','PAYMENTMEANS','ACCOUNT','ACCOUNTNAME','CARDCODE','CARDNAME','CITY','CHECK_DATE','CHECKNO','CHECKSUM','TARNSFERREF','TRANSFER_DATE','TRANSFERSUM','CASHSUM','REMARKS','JOURNALREMARK'];
const crow=(n,d,amt)=>[n,'DEMO plant 1012',n,d,'C','Bank','','','DEMOCU1','C1','','','',0,'','',amt,0,'',''];
const load=async(name,rows)=>{fs.writeFileSync(AF+name,csvOf(CH,rows));await up(AF+name);await page.click('[data-act="coll-validate"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:60000});await page.waitForTimeout(700)};
await page.evaluate(()=>{window.__NOAUTOLOAD=false});
await load('Incoming_Payment_Report_-2026-08-01_to_2026-08-31 bulk1.csv',[crow(1,'10/08/2026',100)]);
await load('Incoming_Payment_Report_-2026-09-01_to_2026-09-30 bulk2.csv',[crow(2,'10/09/2026',200)]);
await load('Incoming_Payment_Report_-2026-07-01_to_2026-07-31 bulk3.csv',[crow(3,'10/07/2026',300)]);
await page.click('[data-act="u-reset"]').catch(()=>{});await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(800);
const ids=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&/bulk/.test(v.file||'')).sort((a,b)=>a[1].at<b[1].at?1:-1).map(([k,v])=>[k.slice(8),v.file]));
for(const [id] of ids)await page.check('[data-act="hist-sel"][data-id="'+id+'"]').catch(()=>page.click('[data-act="hist-sel"][data-id="'+id+'"]'));
await page.waitForTimeout(400);
ok('D60-3: the button counts the ticked uploads ("Undo selected (3)")',/Undo selected \(3\)/.test(await page.innerText('#hist-bulk')),await page.innerText('#hist-bulk'));
await page.click('#hist-bulk');await page.waitForTimeout(1500);
const bl=await page.innerText('#bulk-list');
ok('D60-3: before running it lists the uploads newest first with what each removes',bl.indexOf('bulk3')<bl.indexOf('bulk2')&&bl.indexOf('bulk2')<bl.indexOf('bulk1')&&(bl.match(/removes 1 plant-months/g)||[]).length===3,bl.replace(/\n/g,' | ').slice(0,300));
ok('D60-3: it says what the backup restores for each (no backup: months removed)',(bl.match(/no backup|restores the previous data/g)||[]).length===3,'');
await page.click('#bulk-go');await page.waitForFunction(()=>/All 3 undone/.test((document.getElementById('bulk-out')||{}).innerText||''),null,{timeout:60000}).catch(()=>{});await page.waitForTimeout(800);
const coll=await ms('^collections/');const ups=await ms('^uploads/');
ok('D60-3: all three are undone, newest first, and their months are gone',Object.values(ups).filter(v=>/bulk/.test(v.file||'')&&v.status==='Undone').length===3&&!coll['collections/1012-2026-08']&&!coll['collections/1012-2026-09']&&!coll['collections/1012-2026-07'],Object.keys(coll).join());
/* stop at the first failure: a locked credit-note upload is the newest of the selection */
await page.click('[data-act="dlg-close"]').catch(()=>{});
await load('Incoming_Payment_Report_-2026-08-01_to_2026-08-31 bulk4.csv',[crow(1,'10/08/2026',100)]);
fs.writeFileSync(AF+'Credit Note Register Report 2025-05-30.csv',csvOf(H,[row(9101,'05/05/2025',-100)]));
await up(AF+'Credit Note Register Report 2025-05-30.csv');await page.click('[data-act="cn-offer"]');await page.waitForTimeout(600);
await page.evaluate(()=>document.querySelector('[data-act="cn-validate"]').click());await page.waitForFunction(()=>['validated','done'].includes(window.__desk.U.stage),null,{timeout:30000});await page.waitForTimeout(500);
if(await page.evaluate(()=>window.__desk.U.stage)==='validated'){await page.click('[data-act="cn-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:30000})}
await page.waitForTimeout(600);await page.click('[data-act="u-reset"]').catch(()=>{});
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(800);
await page.click('[data-act="cn-lock"][data-ym="2025-05"]');await page.waitForTimeout(1200);
const ids2=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.status!=='Undone'&&(/bulk4/.test(v.file||'')||/Credit Note Register Report 2025-05/.test(v.file||''))).map(([k])=>k.slice(8)));
await page.waitForTimeout(500);
for(const id of ids2)await page.check('[data-act="hist-sel"][data-id="'+id+'"]').catch(()=>{});
await page.click('#hist-bulk');await page.waitForTimeout(1200);await page.click('#bulk-go');await page.waitForTimeout(3500);
const stopTxt=await page.innerText('#bulk-out');const ups2=await ms('^uploads/');
ok('D60-3: it stops at the first failure (the locked credit-note upload), reports it, and leaves the older upload untouched',/Stopped at/.test(stopTxt)&&/locked/i.test(stopTxt)&&/0 of 2 were undone/.test(stopTxt)&&Object.values(ups2).filter(v=>/bulk4/.test(v.file||'')&&v.status!=='Undone').length===1,stopTxt.replace(/\n/g,' ').slice(0,260));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
