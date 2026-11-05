import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,2).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(collections|creditnotes|backups|uploads|rejects|actions|followups|cells|inv|roll)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true,today:'2026-10-23'});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);await page.evaluate(()=>{window.__NOAUTOLOAD=false});
const ms=p=>page.evaluate(p=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>new RegExp(p).test(k))),p);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(n=>window.__desk.U&&window.__desk.U.name===n&&['mapping','validated','done','idle'].includes(window.__desk.U.stage),f.split('/').pop(),{timeout:60000});await page.waitForTimeout(400)};
const inv=async f=>{await up(f);await page.evaluate(()=>{const b=document.querySelector('[data-act="u-validate"]');if(b)b.click()});await page.waitForFunction(()=>window.__desk.U.stage==='done'||window.__desk.U.stage==='validated',null,{timeout:90000});
  if(await page.evaluate(()=>window.__desk.U.stage)==='validated'){if(await page.$('[data-chg="confrep"]'))await page.check('[data-chg="confrep"]');if(await page.$('#u-reason'))await page.fill('#u-reason','reload for the test');await page.waitForTimeout(300);await page.click('[data-act="u-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000})}await page.waitForTimeout(800)};
/* QA repro: 4 sales months, 4 replacing uploads, one damaged backup, then bulk undo */
const months=['2026-01','2026-02','2026-03','2026-04'];
for(const m of months){
  const a=G.invoices({shape:'B1',plants,months:[m],docsPerPlantMonth:20,seed:5,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale '+m+' a.csv',csvOf(a.headers,a.rows));
  const b=G.invoices({shape:'B1',plants:[plants[0]],months:[m],docsPerPlantMonth:2,seed:5,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale '+m+' b.csv',csvOf(b.headers,b.rows));
}
for(const m of months)await inv(AF+'Combine Sale '+m+' a.csv');
const cellsA=await ms('^cells/INV_');const linesA={};months.forEach(m=>{linesA[m]=cellsA['cells/INV_'+m].plants[plants[0].code].lines});
for(const m of months)await inv(AF+'Combine Sale '+m+' b.csv');
const upl=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&/ b\.csv/.test(v.file||'')).sort((a,b)=>a[1].at<b[1].at?1:-1).map(([k,v])=>[k.slice(8),v.file]));
const bk=await ms('^backups/');
ok('QA repro setup: four sales months were replaced by four uploads and each kept a backup',upl.length===4&&Object.keys(bk).length>=4,upl.length+' uploads, '+Object.keys(bk).length+' backup docs');
const damaged=upl[2][0];/* the second oldest: February */
const bdoc=Object.entries(bk).find(([k,v])=>v.upload===damaged);
await page.evaluate(async([id,doc])=>{await window.__desk.dset(id,Object.assign({},doc,{ck:'damaged'}))},[bdoc[0],bdoc[1]]);await page.waitForTimeout(600);
const before=await ms('^cells/INV_');
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(900);
for(const [id] of upl)await page.click('[data-act="hist-sel"][data-id="'+id+'"]').catch(()=>{});
await page.waitForTimeout(400);
await page.click('#hist-bulk');await page.waitForTimeout(1500);
const lt=await page.innerText('#bulk-list');
ok('bulk: the list shows the damaged backup before running',/backup incomplete: nothing will be restored/.test(lt),lt.replace(/\n/g,' | ').slice(0,300));
await page.click('#bulk-go');await page.waitForFunction(()=>/Stopped at|All \d+ undone/.test((document.getElementById('bulk-out')||{}).innerText||''),null,{timeout:120000});await page.waitForTimeout(800);
const out=await page.innerText('#bulk-out');
ok('bulk: it stops at the damaged upload, names it, says why, and says how many were done',/Stopped at/.test(out)&&/Backup incomplete/.test(out)&&/2 of 4 were undone/.test(out)&&out.indexOf('b.csv')>=0,out.replace(/\n/g,' ').slice(0,300));
const after=await ms('^cells/INV_');const ups=await ms('^uploads/');
const st=Object.fromEntries(upl.map(([id,f])=>[f.match(/\d{4}-\d\d/)[0],ups['uploads/'+id].status]));
ok('bulk: April and March were undone (newest first) and their earlier sales restored; February and January were not touched',st['2026-04']==='Undone'&&st['2026-03']==='Undone'&&st['2026-02']!=='Undone'&&st['2026-01']!=='Undone'&&after['cells/INV_2026-04'].plants[plants[0].code].lines===linesA['2026-04']&&after['cells/INV_2026-03'].plants[plants[0].code].lines===linesA['2026-03'],JSON.stringify(st));
ok('bulk: the damaged month\'s data is intact (February still holds the replacing upload, with its chunks and roll-up) and so is January',JSON.stringify(after['cells/INV_2026-02'].plants[plants[0].code])===JSON.stringify(before['cells/INV_2026-02'].plants[plants[0].code])&&JSON.stringify(after['cells/INV_2026-01'].plants[plants[0].code])===JSON.stringify(before['cells/INV_2026-01'].plants[plants[0].code])&&Object.keys(await ms('^roll/'+plants[0].code+'-2026-02')).length===1,'');
ok('the damaged backup was not deleted',Object.values(await ms('^backups/')).some(v=>v.upload===damaged),'');
/* the explicit confirm on the single dialog removes without restoring */
await page.click('[data-act="dlg-close"]').catch(()=>{});await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
await page.click('[data-act="hist-undo"][data-id="'+damaged+'"]');await page.waitForTimeout(700);
const dt=await page.innerText('#dlg'),btn=await page.innerText('[data-act="undo-go"]');
ok('single Undo of the damaged one asks for the explicit "Undo and remove these months" confirm',/Backup incomplete/.test(dt)&&/Undo and remove these months/.test(btn),btn);
/* locks: credit-note locks protect the sales months too */
await page.click('[data-act="dlg-close"]').catch(()=>{});
await page.evaluate(async()=>{await window.__desk.dset('creditnotes/lock_2026-01',{lock:true,ym:'2026-01',by:'data@virgoasia.com',at:new Date().toISOString()})});await page.waitForTimeout(800);
await page.click('[data-act="hist-undo"][data-id="'+upl[3][0]+'"]');await page.waitForTimeout(700);
await page.click('[data-act="undo-go"]');await page.waitForTimeout(2500);
const lkTxt=await page.innerText('#dlg');
ok('INV Undo respects a credit-note lock on the month',/credit notes are locked for Jan 2026/.test(lkTxt)&&(await ms('^cells/INV_'))['cells/INV_2026-01'].plants[plants[0].code].upload===upl[3][0],lkTxt.replace(/\n/g,' ').slice(0,200));
await page.click('[data-act="dlg-close"]').catch(()=>{});
const again=G.invoices({shape:'B1',plants,months:['2026-01'],docsPerPlantMonth:20,seed:7,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale 2026-01 c.csv',csvOf(again.headers,again.rows));
await up(AF+'Combine Sale 2026-01 c.csv');await page.evaluate(()=>{const b=document.querySelector('[data-act="u-validate"]');if(b)b.click()});await page.waitForFunction(()=>window.__desk.U.stage==='validated'||window.__desk.U.stage==='done',null,{timeout:90000});await page.waitForTimeout(500);
const lt2=await page.innerText('#i-upload');
ok('the sales intake will not replace a month whose credit notes are locked',/Locked: Jan 2026/.test(lt2)&&await page.evaluate(()=>{const b=document.querySelector('[data-act="u-load"]');return !b||b.disabled}),lt2.match(/Locked[^\n]*/)||'');
/* content-based refusal */
const H=['docnum','DocDate','CardCode','CardName','BPLName','ItemCode','Quantity','LineTotal','Catagory','Size','Salesemployee','AcctName'];
const row=(n,acct)=>[n,'05/05/2026','DEMOCU1','C1','DEMO plant 1012','DEMOFG00001',2,100,'Decorative Laminates','8X4','Rep',acct];
fs.writeFileSync(AF+'Register 2026-05.csv',csvOf(H,[row(1,'Credit Memo'),row(2,'Credit Memo')]));await up(AF+'Register 2026-05.csv');
ok('a file with a plain name is refused when AcctName names a credit memo',await page.evaluate(()=>!!window.__desk.U.cnOffer),'');
fs.writeFileSync(AF+'Sales plain 2026-05.csv',csvOf(H.concat(['RefNo','RefDate','Invoice Type']),[row(1,'Sales GST').concat(['INV-1','01/05/2026','Tax'])]));await up(AF+'Sales plain 2026-05.csv');
ok('RefNo and RefDate next to docnum (with an Invoice Type column, so not auto-detected) are still refused by content',await page.evaluate(()=>!!window.__desk.U.cnOffer),'');
const H2=['#','BPLId','BPLName','Salesemployee','DocDate','TaxDate','docnum','billNo','RefNo','RefDate','CardCode','CardName','ItemCode','Dscription','Thickness','Thickness Type','Size','hsn','GST RATE','Quantity','BILL GSTIN','LineTotal','CGST_Amt','SGST_Amt','IGST_Amt','DocTotal','WTAmount','Catagory','Account','AcctName','None'];
fs.writeFileSync(AF+'plain-register.csv',csvOf(H2,[[1,1,'DEMO plant 1012','Rep','05/05/2026','05/05/2026',1,'b1','INV-9','01/05/2026','DEMOCU1','C1','DEMOFG00001','x',0.8,'s','8X4','h',18,2,'g',100,0,0,0,118,0,'Decorative Laminates','a','Sales GST','']]));await up(AF+'plain-register.csv');
const k=await page.evaluate(()=>({kind:window.__desk.U.kind,base:window.__desk.U.map&&window.__desk.U.headers[window.__desk.U.map.base]}));
ok('the register layout auto-detects as credit notes with RefNo as the base invoice (no manual mapping)',k.kind==='cn'&&k.base==='RefNo',JSON.stringify(k));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
