import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,2).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const serial=(y,m,d)=>Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000);
const di=G.B1_HEADERS.indexOf('DocDate');
/* Excel's mix-up: a dd/mm text with day<=12 becomes a serial with month and day swapped; day>12 stays text */
const mixup=(file,month,seed,docs)=>{const g=G.invoices({shape:'B1',plants,months:[month],docsPerPlantMonth:docs||30,seed,dateStyle:'iso'});const [y,mo]=month.split('-').map(Number);let sw=0;
  g.rows.forEach(r=>{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(r[di]);const d=+m[3];if(d<=12){r[di]=serial(y,d,mo);if(d!==mo)sw++}else r[di]=pad2(d)+'/'+pad2(mo)+'/'+y});fs.writeFileSync(AF+file,csvOf(g.headers,g.rows));return {rows:g.rows.length,sw}};
const pad2=n=>String(n).padStart(2,'0');
const m1=mixup('01. Combine Sale 2026-03-31-CLAUDE.csv','2026-03',9);
const clean=G.invoices({shape:'B1',plants,months:['2026-04'],docsPerPlantMonth:20,seed:5,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale 2026-04 clean.csv',csvOf(clean.headers,clean.rows));
const m3=mixup('export-noname.csv','2026-08',11);
const multi=G.invoices({shape:'B1',plants,months:['2026-05','2026-06','2026-07'],docsPerPlantMonth:8,seed:4,dateStyle:'iso'});fs.writeFileSync(AF+'quarter-noname.csv',csvOf(multi.headers,multi.rows));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(cells|inv|roll|uploads|actions|followups|audit)\//.test(k))delete st0[k]});
Object.keys(st0).forEach(k=>{if(/^periods\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async(f,wait)=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForTimeout(2200);await page.click('[data-act="u-validate"]');await page.waitForFunction(w=>window.__desk.U.stage===w,wait||'done',{timeout:90000})};
const cellsOf=async()=>page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^cells\/INV_/.test(k)).sort());
/* A. the March case */
await up(AF+'01. Combine Sale 2026-03-31-CLAUDE.csv');
let r=await page.evaluate(()=>{const r=window.__desk.U.res;return {exp:r.exp,src:r.expSrc,fixed:r.af.dateFixed,rej:r.rejected,good:r.good,read:r.read,hist:r.monthHist,txt:document.querySelector('#i-upload').innerText}});
ok('March file: expected month comes from the file name',r.exp==='2026-03'&&r.src==='name',JSON.stringify([r.exp,r.src]));
ok('swapped serial dates are corrected to March and every row loads',r.fixed===m1.sw&&r.rej===0&&Object.keys(r.hist).join()==='2026-03'&&r.good===r.read,JSON.stringify([r.fixed,m1.sw,r.rej,r.hist]));
ok('the panel states "N dates corrected to Mar 2026"',new RegExp(r.fixed+' dates corrected to Mar 2026','i').test(r.txt.replace(/\s+/g,' '))||/dates corrected to Mar 2026/i.test(r.txt),'');
let c=await cellsOf();ok('nothing is written outside March',c.length===1&&c[0]==='cells/INV_2026-03',c.join());
/* B. a clean file: no corrections */
await up(AF+'Combine Sale 2026-04 clean.csv');
r=await page.evaluate(()=>({exp:window.__desk.U.res.exp,fixed:window.__desk.U.res.af.dateFixed,rej:window.__desk.U.res.rejected}));
ok('clean April file: no corrections, nothing skipped',r.exp==='2026-04'&&r.fixed===0&&r.rej===0,JSON.stringify(r));
/* C. no date in the name: the month holding most of the unambiguous dates */
await up(AF+'export-noname.csv');
r=await page.evaluate(()=>({exp:window.__desk.U.res.exp,src:window.__desk.U.res.expSrc,fixed:window.__desk.U.res.af.dateFixed,rej:window.__desk.U.res.rejected,hist:window.__desk.U.res.monthHist}));
ok('no date in the name: expected month is the majority month and the swapped dates are corrected',r.exp==='2026-08'&&r.src==='majority'&&r.fixed===m3.sw&&r.rej===0&&Object.keys(r.hist).join()==='2026-08',JSON.stringify(r));
c=await cellsOf();ok('still nothing outside the months of these three files',c.join()==='cells/INV_2026-03,cells/INV_2026-04,cells/INV_2026-08',c.join());
/* D. a genuine multi-month file with no month in its name is split by date, nothing skipped */
await up(AF+'quarter-noname.csv');
r=await page.evaluate(()=>({exp:window.__desk.U.res.exp,src:window.__desk.U.res.expSrc,rej:window.__desk.U.res.rejected,months:Object.keys(window.__desk.U.res.monthHist).join()}));
ok('multi-month file without a month in its name loads by document date',r.exp===''&&r.rej===0&&r.months==='2026-05,2026-06,2026-07',JSON.stringify(r));
/* E. the picker: choose another month and the rows outside it are skipped with the reason */
await page.click('[data-act="u-reset"]').catch(()=>{});
const inp=await page.$('input[type=file]');await inp.setInputFiles(AF+'quarter-noname.csv');await page.waitForTimeout(2200);
await page.evaluate(()=>{window.__NOAUTOLOAD=true});
await page.click('[data-act="u-validate"]');await page.waitForFunction(()=>window.__desk.U.stage==='validated',null,{timeout:60000});
await page.selectOption('#u-exp','2026-06');await page.waitForFunction(()=>window.__desk.U.stage==='validated'&&window.__desk.U.res.exp==='2026-06',null,{timeout:60000});
r=await page.evaluate(()=>({rej:window.__desk.U.res.rejected,why:Object.keys(window.__desk.U.res.reasons),months:Object.keys(window.__desk.U.res.monthHist).join()}));
ok('picker: May and July rows are skipped as "Date outside Jun 2026"; only June is kept',r.months==='2026-06'&&r.rej>0&&r.why.some(x=>x==='Date outside Jun 2026'),JSON.stringify(r));
/* F. replace guard + Undo (live-like mock) */
await page.evaluate(()=>{window.__NOAUTOLOAD=false});
const thin=G.invoices({shape:'B1',plants:[plants[0]],months:['2026-04'],docsPerPlantMonth:2,seed:5,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale 2026-04 thin.csv',csvOf(thin.headers,thin.rows));
await page.click('[data-act="u-reset"]').catch(()=>{});
const inp2=await page.$('input[type=file]');await inp2.setInputFiles(AF+'Combine Sale 2026-04 thin.csv');await page.waitForTimeout(2200);await page.click('[data-act="u-validate"]');await page.waitForTimeout(3500);
let tx=await page.innerText('#i-upload');
ok('re-upload with fewer lines than the month already holds waits for a confirm that lists the month',await page.evaluate(()=>window.__desk.U.stage==='validated')&&/it would replace \d+ plant-months/.test(tx)&&/Apr 2026/.test(tx),'');
await page.check('[data-chg="confrep"]');await page.waitForTimeout(300);
const rb=await page.$('#u-reason');if(rb)await rb.fill('reload');
await page.click('[data-act="u-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000});
await page.click('[data-act="u-reset"]').catch(()=>{});await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const ids=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.file&&/04 clean/.test(v.file)).map(([k])=>k.slice(8)));
await page.click('[data-act="hist-undo"][data-id="'+ids[0]+'"]');await page.waitForTimeout(500);
const dt=await page.innerText('#dlg');ok('undo dialog lists months to upload again, says previous data is not restored',/Months to upload again afterwards/.test(dt)&&/cannot bring back/.test(dt),'');
await page.click('[data-act="undo-go"]');await page.waitForTimeout(4000);
const w=await page.evaluate(()=>{const m=window.__mockStore();return {undone:Object.values(m).filter(v=>v&&v.status==='Undone').length,aud:Object.values(m).filter(v=>v&&v.event==='upload undone').length}});
ok('undo marks the upload Undone and logs it',w.undone===1&&w.aud>=1,JSON.stringify(w));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
