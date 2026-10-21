import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,2).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const serial=(y,m,d)=>Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000);
/* ---- the live incident: a March file, real Excel serial dates (not swapped), a few text dates ---- */
const g=G.invoices({shape:'B1',plants,months:['2026-03'],docsPerPlantMonth:30,seed:9,dateStyle:'iso'});
const di=g.headers.indexOf('DocDate');
g.rows.forEach((r,i)=>{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(r[di]);if(!m)return;if(i%40===0)r[di]=m[3]+'/'+m[2]+'/'+m[1];else r[di]=serial(+m[1],+m[2],+m[3])});
fs.writeFileSync(AF+'01. Combine Sale 2026-03-31-CLAUDE.csv',csvOf(g.headers,g.rows));
/* a wrongly named / multi-month file */
const g2=G.invoices({shape:'B1',plants,months:['2026-03'],docsPerPlantMonth:20,seed:3,dateStyle:'iso'});
fs.writeFileSync(AF+'Combine Sale 2026-07.csv',csvOf(g2.headers,g2.rows));
const g3=G.invoices({shape:'B1',plants,months:['2026-05','2026-06','2026-07','2026-08'],docsPerPlantMonth:6,seed:4,dateStyle:'iso'});
fs.writeFileSync(AF+'four-months.csv',csvOf(g3.headers,g3.rows));
/* old defect: day/month swapped on serial cells (day<=12 written as month); named for the month it really holds */
const g4=G.invoices({shape:'B1',plants,months:['2026-09'],docsPerPlantMonth:30,seed:6,dateStyle:'iso'});
g4.rows.forEach(r=>{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(r[di]);if(!m)return;const d=+m[3],mo=+m[2];r[di]=d<=12?serial(+m[1],d,mo):m[3]+'/'+m[2]+'/'+m[1]});
fs.writeFileSync(AF+'Combine Sale 2026-09.csv',csvOf(g4.headers,g4.rows));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(cells|inv|roll|uploads)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0});await page.waitForTimeout(3000);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const upv=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForTimeout(2200);await page.click('[data-act="u-validate"]');await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.res&&window.__desk.U.stage==='validated',null,{timeout:90000})};
/* 1. serial dates are never swapped; the file is fine as it is */
await upv(AF+'01. Combine Sale 2026-03-31-CLAUDE.csv');
let r=await page.evaluate(()=>{const r=window.__desk.U.res;return {swapped:r.dateInfo.swapped,mixed:r.dateInfo.mixed,kinds:r.af.dateKinds,min:r.minDate,max:r.maxDate,months:Object.keys(r.monthHist),susp:r.sanity.suspect,rej:r.rejected,load:document.querySelector('[data-act="u-load"]').disabled}});
ok('serial dates are not swapped when the file mixes serial and text dates',r.swapped===0&&!r.mixed&&r.kinds.serial>0&&r.kinds.text>0&&r.min.startsWith('2026-03')&&r.max.startsWith('2026-03'),JSON.stringify(r));
ok('a one-month file named for its month passes the sanity check',!r.susp&&r.months.length===1,'');
/* 2. wrongly named file blocked; Load anyway needed */
await upv(AF+'Combine Sale 2026-07.csv');
r=await page.evaluate(()=>({s:window.__desk.U.res.sanity,load:document.querySelector('[data-act="u-load"]').disabled,txt:document.querySelector('#i-upload').innerText}));
ok('file named July holding March dates is blocked, histogram shown',r.s.suspect&&r.s.hard&&r.load&&/does not look like the month it is named for/.test(r.txt)&&/Mar 2026/.test(r.txt),JSON.stringify(r.s.reasons));
await page.check('[data-chg="anyway"]');await page.waitForTimeout(300);const rb=await page.$('#u-reason');if(rb)await rb.fill('test');await page.waitForTimeout(200);
ok('Load anyway (Super admin) enables the Load button',await page.evaluate(()=>!document.querySelector('[data-act="u-load"]').disabled),'');
/* 3. multi-month file */
await upv(AF+'four-months.csv');
r=await page.evaluate(()=>({s:window.__desk.U.res.sanity,load:document.querySelector('[data-act="u-load"]').disabled}));
ok('a file spanning four months stops before writing, with the month histogram',r.s.suspect&&r.s.months.length===4&&r.load,JSON.stringify(r.s.months));
/* 4. old swapped-serial defect: not repaired by itself, offered explicitly */
await upv(AF+'Combine Sale 2026-09.csv');
r=await page.evaluate(()=>({s:window.__desk.U.res.sanity,sw:window.__desk.U.res.dateInfo.swapped,load:document.querySelector('[data-act="u-load"]').disabled,btn:!!document.querySelector('[data-act="u-swap-serial"]')}));
ok('day/month-swapped serial cells are NOT repaired silently; the repair is offered as a choice',r.sw===0&&r.s.suspect&&r.s.swapOffer&&r.btn&&r.load,JSON.stringify([r.sw,r.s.suspect,r.s.swapOffer]));
await page.click('[data-act="u-swap-serial"]');await page.waitForTimeout(6000);console.log(JSON.stringify(await page.evaluate(()=>({st:window.__desk.U.stage,sw:window.__desk.U.swapSerial,sd:window.__desk.U.res&&window.__desk.U.res.dateInfo,msg:window.__desk.U.progressMsg}))));
r=await page.evaluate(()=>({sus:window.__desk.U.res.sanity.suspect,mon:Object.keys(window.__desk.U.res.monthHist),sw:window.__desk.U.res.dateInfo.swapped}));
ok('after the explicit choice the file reads as one month (Sep 2026) and still needs the range confirmed',!r.sus&&r.mon.length===1&&r.mon[0]==='2026-09'&&r.sw>0,JSON.stringify(r));
/* 5. replace guard + undo */
await page.click('[data-act="u-reset"]').catch(()=>{});
/* load the March file for real, then re-upload a thinner March file */
await upv(AF+'01. Combine Sale 2026-03-31-CLAUDE.csv');
await page.fill('#u-reason','test load').catch(()=>{});
await page.waitForTimeout(300);
const closedBox=await page.$('#u-reason');if(closedBox){await closedBox.fill('test load')}
await page.click('[data-act="u-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000});
const w1=await page.evaluate(()=>({cells:Object.keys(window.__mockStore()).filter(k=>/^cells\/INV_2026-03/.test(k)).length,up:Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')).map(([k])=>k.slice(8))}));
ok('the March file loads into March only',w1.cells===1&&w1.up.length===1,JSON.stringify(w1));
const firstId=w1.up[0];
const thin=G.invoices({shape:'B1',plants:[plants[0]],months:['2026-03'],docsPerPlantMonth:3,seed:9,dateStyle:'iso'});
fs.writeFileSync(AF+'Combine Sale 2026-03-thin.csv',csvOf(thin.headers,thin.rows));
await page.click('[data-act="u-reset"]').catch(()=>{});await upv(AF+'Combine Sale 2026-03-thin.csv');
r=await page.evaluate(()=>({txt:document.querySelector('#i-upload').innerText,load:document.querySelector('[data-act="u-load"]').disabled}));
ok('re-upload with fewer lines lists the months it would replace and asks for confirmation',/would replace \d+ plant-months/.test(r.txt)&&/Mar 2026/.test(r.txt)&&r.load,'');
await page.check('[data-chg="confrep"]');await page.waitForTimeout(300);
ok('the confirmation enables the Load button',await page.evaluate(()=>!document.querySelector('[data-act="u-load"]').disabled)||await page.evaluate(()=>!!document.querySelector('#u-reason')),'');
const rb2=await page.$('#u-reason');if(rb2)await rb2.fill('thin reload');await page.waitForTimeout(200);
await page.click('[data-act="u-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000});
const w3=await page.evaluate(()=>{const c=window.__mockStore()['cells/INV_2026-03'];return Object.fromEntries(Object.entries(c.plants).map(([p,x])=>[p,x.upload]))});
ok('the thin upload replaced one plant-month (now points to the new upload)',Object.keys(w3).length===2&&new Set(Object.values(w3)).size===2,JSON.stringify(w3));
/* undo of the first upload after the thin one replaced plant 1 only */
await page.click('[data-act="u-reset"]').catch(()=>{});
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(500);
await page.click('[data-act="hist-undo"][data-id="'+firstId+'"]');await page.waitForTimeout(400);
let dt=await page.innerText('#dlg');
ok('undo dialog lists months to upload again and says previous data is not restored',/Months to upload again afterwards/.test(dt)&&/Mar 2026/.test(dt)&&/cannot bring back/.test(dt),dt.slice(0,260).replace(/\n/g,' '));
await page.click('[data-act="undo-go"]');await page.waitForTimeout(3500);
const w2=await page.evaluate(()=>{const s=window.__mockStore();return {cells:Object.keys(s).filter(k=>/^cells\/INV_/.test(k)),inv:Object.keys(s).filter(k=>/^inv\//.test(k)).length,roll:Object.keys(s).filter(k=>/^roll\//.test(k)).length,upl:Object.entries(s).filter(([k])=>k.startsWith('uploads/')).map(([k,v])=>[k,v.status]),aud:Object.values(s).filter(v=>v&&v.event==='upload undone').length}});
ok('undo removes only what still points to that upload (the month replaced later is left alone) and logs it',w2.cells.length===1&&w2.inv>0&&w2.roll===1&&w2.upl.some(x=>x[1]==='Undone')&&w2.aud>=1,JSON.stringify(w2));
dt=await page.innerText('#dlg');ok('undo result names the months to upload again',/Upload these months again/.test(dt)&&/Mar 2026/.test(dt),dt.slice(0,160).replace(/\n/g,' '));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
await page.context().close();
console.log(res.join('\n'));await browser.close();
