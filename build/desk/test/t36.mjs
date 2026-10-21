import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,2).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const mk=(file,month,badEvery,seed)=>{const g=G.invoices({shape:'B1',plants,months:[month],docsPerPlantMonth:30,seed,dateStyle:'iso'});const q=g.headers.indexOf('Quantity');let n=0;g.rows.forEach((r,i)=>{if(badEvery&&i%badEvery===0){r[q]='abc';n++}});fs.writeFileSync(AF+file,csvOf(g.headers,g.rows));return {n,rows:g.rows.length}};
const f1=mk('Combine Sale 2026-08 skip-few.csv','2026-08',60,21);   /* ~1.7% skipped */
const f2=mk('Combine Sale 2026-08 skip-many.csv','2026-08',8,22);   /* ~12% skipped */
const f3=mk('Combine Sale 2026-07 wrong.csv','2026-08',0,23);        /* named July, holds August */
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(cells|inv|roll|uploads|rejects|actions|followups|periods\/FY2[67]-Q[12]|audit)/.test(k))delete st0[k]});
const {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForTimeout(2200);await page.click('[data-act="u-validate"]')};
/* 1. few skipped rows: loads at once with no further click */
await up(AF+'Combine Sale 2026-08 skip-few.csv');
await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000});
let s=await page.evaluate(()=>{const m=window.__mockStore();const u=Object.entries(m).filter(([k,v])=>k.startsWith('uploads/')&&v.file).map(([k,v])=>({id:k.slice(8),status:v.status,rej:v.rejected,loaded:v.loaded,sk:v.skipped}));return {u,rej:Object.keys(m).filter(k=>k.startsWith('rejects/')).length,cells:Object.keys(m).filter(k=>/^cells\/INV_2026-08/.test(k)).length,act:Object.keys(m).filter(k=>/^actions\/R5/.test(k)).length}});
ok('rows with problems are skipped and the good rows load at once (no Load click)',s.u.length===1&&s.u[0].status==='Loaded'&&s.u[0].rej>0&&s.u[0].loaded>0&&s.cells===1,JSON.stringify(s));
ok('the skipped rows are kept in the upload\'s rejects list',s.rej===1,'');
await page.waitForTimeout(3500);
const a1=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^actions\//.test(k)&&/R5/.test(k)).length);
ok('no R5 action for a handful of skips (under 2%)',a1===0,String(a1));
let h=await page.innerText('#i-hist');
ok('history says "Loaded · N rows skipped" and links the count',/Loaded\s*·\s*\d+ rows? skipped/.test(h)&&!!(await page.$('#i-hist a[data-act="hist-rej"]')),h.match(/Loaded[^\n]*/));
await page.click('#i-hist a[data-act="hist-rej"]');await page.waitForTimeout(400);
const sv=await page.evaluate(()=>{const x=window.__saved||[];return x.length?x[x.length-1].filename:''});ok('the count link downloads the skipped-rows list',/rejected-rows/.test(sv),sv);
/* 2. many skipped rows: still loads; R5 raised because over 2% */
await up(AF+'Combine Sale 2026-08 skip-many.csv');
await page.waitForTimeout(4000);
const st2=await page.evaluate(()=>({stage:window.__desk.U.stage,txt:document.querySelector('#i-upload').innerText.slice(0,400)}));
console.log(JSON.stringify(st2));
/* the replace guard stops this one (bigger month already held? no: fewer lines) -> a safety stop, stated in one line */
ok('a file that would replace a bigger month is stopped by the safety check, not by rejects',st2.stage==='validated'&&/Safety check stopped this file: it would replace/.test(await page.innerText('#i-upload')),'');
await page.check('[data-chg="confrep"]');await page.waitForTimeout(300);
const rb=await page.$('#u-reason');if(rb)await rb.fill('reload');
await page.click('[data-act="u-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000});
await page.waitForTimeout(5000);
const a2=await page.evaluate(()=>Object.values(window.__mockStore()).filter(v=>v&&v.rule==='R5').length);
ok('R5 is raised when the skipped share is above the setting (12% > 2%)',a2===1,String(a2));
/* 3. file named for July holding August: no stop; the data decide (August), the conflict is shown */
await up(AF+'Combine Sale 2026-07 wrong.csv');await page.waitForTimeout(4000);
const t3=await page.innerText('#i-upload');const ex3=await page.evaluate(()=>window.__desk.U.res&&[window.__desk.U.res.exp,window.__desk.U.res.expSrc]);
ok('a file named for July holding August is not blocked; August is used and the conflict is stated',ex3&&ex3[0]==='2026-08'&&ex3[1]==='data'&&/file name says Jul 2026/.test(t3),JSON.stringify(ex3));
/* 4. undo of an auto-loaded upload works */
await page.click('[data-act="u-reset"]').catch(()=>{});
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const ids=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.file&&v.status!=='Undone').map(([k,v])=>[k.slice(8),v.at]).sort((a,b)=>a[1]<b[1]?1:-1));
await page.click('[data-act="hist-undo"][data-id="'+ids[0][0]+'"]');await page.waitForTimeout(500);
await page.click('[data-act="undo-go"]');await page.waitForTimeout(4000);
const w=await page.evaluate(()=>{const m=window.__mockStore();return {cells:Object.keys(m).filter(k=>/^cells\/INV_/.test(k)).length,inv:Object.keys(m).filter(k=>/^inv\//.test(k)).length,roll:Object.keys(m).filter(k=>/^roll\//.test(k)).length,undone:Object.values(m).filter(v=>v&&v.status==='Undone').length,r5:Object.values(m).filter(v=>v&&v.rule==='R5').length}});
ok('Undo upload works on an auto-loaded upload (cells, chunks, roll-ups, rejects and its R5 action removed)',w.cells===0&&w.inv===0&&w.roll===0&&w.undone===1&&w.r5===0,JSON.stringify(w));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
