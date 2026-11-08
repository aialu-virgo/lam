import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(creditnotes|backups|uploads|rejects|actions|followups)\//.test(k))delete st0[k]});
const plants=Object.entries(st0).filter(([k,v])=>/^plants\//.test(k)&&v.business!=='ACP'&&+v.plant_code<1050&&v.active!==false).map(([k,v])=>v);
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(n=>window.__desk.U&&window.__desk.U.name===n&&['mapping','validated','done'].includes(window.__desk.U.stage),f.split('/').pop(),{timeout:20000}).catch(()=>{});await page.waitForTimeout(400)};
const val=async()=>{await page.evaluate(()=>{const b=document.querySelector('[data-act="cn-validate"]');if(b&&!b.disabled)b.click()});await page.waitForFunction(()=>['validated','done'].includes(window.__desk.U.stage),null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(800)};
const H=['DocNum','LineNum','DocDate','CardCode','CardName','BPLName','ItemCode','Quantity','LineTotal','BaseRef'];
const mk=(ps,dates)=>{const rows=[];let n=7000;for(const p of ps)for(const d of dates)rows.push([n++,0,d,'DEMOCU1','DEMO Cust 1',p.b1_bpl_name||(p.plant_code+' DEMO plant'),'DEMOFG00001',2,100,9000]);return rows};
const p1012=plants.find(p=>p.plant_code==='1012');
/* QA repro: Apr-Jun, plant 1012 only, box unticked */
fs.writeFileSync(AF+'cn_q1_1012_-2026-04-01_to_2026-06-30.csv',csvOf(H,mk([p1012],['10/04/2026','10/05/2026','10/06/2026'])));
await up(AF+'cn_q1_1012_-2026-04-01_to_2026-06-30.csv');await val();
let v=await page.evaluate(()=>({stage:window.__desk.U.stage,all:window.__desk.U.allBranches,def:window.__desk.U.allDefault}));
ok('a one-plant file is not pre-ticked "covers all branches" and does not auto-load',v.stage==='validated'&&v.all===false,JSON.stringify(v));
await page.click('[data-act="cn-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:20000});await page.waitForTimeout(1200);
let m=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^creditnotes\/cov_/.test(k))));
ok('coverage mark lists only the plant that has rows; the upload stores the tick',Object.values(m).every(d=>JSON.stringify(d.plants)==='["1012"]'&&d.all_branches===false)&&Object.keys(m).length===3,JSON.stringify(Object.values(m).map(d=>d.plants)));
const q=await page.evaluate(()=>{const g=window.__desk;const f=pl=>g.quarterSeries(pl).find(z=>/Q1/.test(z.label)&&/27/.test(z.label));return {all:f({plants:null}),p13:f({plant:'1013'}),p12:f({plant:'1012'}),unc:g.cnFor({plants:null},['2026-04','2026-05','2026-06']).uncovered}});
ok('QA repro: Q1 FY27 for the company and for plant 1013 stays Invoiced; plant 1012 is Net',q.all&&!q.all.net&&q.p13&&!q.p13.net&&q.p12&&q.p12.net&&Math.abs(q.p12.A-q.p12.Anet-300)<0.01,JSON.stringify([q.all&&q.all.net,q.p13&&q.p13.net,q.p12&&q.p12.net]));
ok('uncovered plants are listed (all but 1012)',q.unc.length===plants.length-1&&q.unc.indexOf('1013')>=0&&q.unc.indexOf('1012')<0,q.unc.length+' of '+plants.length);
const note=await page.evaluate(()=>{const g=window.__desk;const ctx=g.viewCtx();const o=g.figs({},ctx);return o.qoq&&o.qoq.tip});
ok('tooltip names the uncovered plants, max 5 then "+n"',/credit notes are not loaded for plants \d{4}, \d{4}, \d{4}, \d{4}, \d{4} \(\+\d+\)/.test((await page.evaluate(()=>{const g=window.__desk;const c=g.cnFor({plants:null},['2026-04']);return 'credit notes are not loaded for '+(c.uncovered.length?'plants '+c.uncovered.slice(0,5).join(', ')+(c.uncovered.length>5?' (+'+(c.uncovered.length-5)+')':''):'')}))),note||'');
/* the same file with the box ticked covers all branches */
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(400);
await up(AF+'cn_q1_1012_-2026-04-01_to_2026-06-30.csv');await val();
await page.click('[data-chg="cn-allbr"]');await page.click('[data-act="cn-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:20000});await page.waitForTimeout(1200);
const q2=await page.evaluate(()=>{const g=window.__desk;const f=pl=>g.quarterSeries(pl).find(z=>/Q1/.test(z.label)&&/27/.test(z.label));return {all:f({plants:null}).net,p13:f({plant:'1013'}).net}});
ok('ticking "covers all branches": plants with no credit note count as covered, so company and plant 1013 use Net',q2.all&&q2.p13,JSON.stringify(q2));
/* a file with rows for more than half the plants is pre-ticked and loads at once */
fs.writeFileSync(AF+'cn_q2_all_-2026-07-01_to_2026-07-31.csv',csvOf(H,mk(plants,['10/07/2026'])));
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(400);
await up(AF+'cn_q2_all_-2026-07-01_to_2026-07-31.csv');await val();
v=await page.evaluate(()=>({stage:window.__desk.U.stage,all:window.__desk.U.allBranches}));
ok('rows for more than half the plants: pre-ticked and auto-loaded',v.stage==='done'&&v.all===true,JSON.stringify(v));
/* Overview K1 subtitle reflects the real coverage */
await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(2500);
const tx=(await page.innerText('#pg')).replace(/\s+/g,' ');
ok('Overview K1 subtitle no longer says "no feed yet"; it states the real coverage',!/no feed yet/i.test(tx)&&/credit notes not loaded|credit notes loaded/i.test(tx),(tx.match(/Invoiced · credit notes[^.]*\.|Net · credit[^.]*\./i)||[''])[0]);
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
