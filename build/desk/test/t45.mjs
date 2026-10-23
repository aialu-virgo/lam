import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(receivables|uploads|rejects)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForTimeout(1500)};
const WH=['Cust','Inv no','Bal','Due on','Branch'];
fs.writeFileSync(AF+'weird_open.csv',csvOf(WH,[['DEMOCU1','A1',700,'05/09/2026','DEMO plant 1012'],['DEMOCU2','A2',300,'01/12/2026','DEMO plant 1013']]));
/* 1. with Receivable chosen as the entity: the mapping step, never "headers match no known file" */
await page.selectOption('[data-chg="u-ent"]','RC').catch(()=>{});
await up(AF+'weird_open.csv');
let s=await page.evaluate(()=>({kind:window.__desk.U.kind,stage:window.__desk.U.stage,msg:window.__desk.U.msg,lay:window.__desk.U.layout,txt:document.querySelector('#i-upload').innerText}));
ok('unrecognised receivable headers reach the column-mapping step',s.kind==='recv'&&s.stage==='mapping'&&!/no known file/i.test(s.txt+s.msg),JSON.stringify([s.kind,s.stage,s.lay]));
ok('required fields not yet mapped: validation stays blocked and says what to map',/Map these first/.test(s.txt)&&await page.evaluate(()=>document.querySelector('[data-act="rc-validate"]').disabled),'');
const map={branch:'Branch',doc:'Inv no',due:'Due on',cust:'Cust',open:'Bal'};
for(const [k,h] of Object.entries(map)){await page.selectOption('[data-chg="rc-map"][data-k="'+k+'"]',{label:h})}
await page.fill('#rc-asof','2026-10-20');await page.dispatchEvent('#rc-asof','change');await page.waitForTimeout(300);
await page.evaluate(()=>document.querySelector('[data-act="rc-validate"]').click());await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:20000});
const r=await page.evaluate(()=>{const u=window.__desk.U.res;return {good:u.good,rej:u.rejected,open:Math.round(u.open)}});
ok('after mapping, the file validates and loads',r.good===2&&r.rej===0&&r.open===1000,JSON.stringify(r));
/* 2. no entity chosen: the "Import as" button leads to the same mapping step */
await page.selectOption('[data-chg="u-ent"]','INV').catch(()=>{});
await up(AF+'weird_open.csv');
s=await page.evaluate(()=>({stage:window.__desk.U.stage,kind:window.__desk.U.kind,txt:document.querySelector('#i-upload').innerText}));
const btn=await page.$('[data-act="imp-rc"]');
ok('no entity chosen: the message offers "Import as receivables"',!!btn&&/Import as receivables/.test(s.txt),s.stage);
if(btn){await btn.click();await page.waitForTimeout(500)}
s=await page.evaluate(()=>({kind:window.__desk.U.kind,stage:window.__desk.U.stage}));
ok('"Import as receivables" opens the mapping step',s.kind==='recv'&&s.stage==='mapping',JSON.stringify(s));
/* 3. K10 / lower-is-better: plan / actual x 100 capped at 200, actual 0 is "Within plan" */
const a=await page.evaluate(()=>{const f=window.__desk.achLower;return [f(0,15),f(30,15),f(5,15),f(1,15),f(10,0),f(null,15)]});
ok('achLower: 0 → Within plan (200); 30 vs 15 → 50%; 5 vs 15 → 200% cap; 10 vs 15 → 150',a[0].within&&a[0].ach===200&&Math.abs(a[1].ach-50)<1e-9&&a[2].ach===200&&Math.abs(a[3].ach-200)<1e-9&&a[4].ach===null&&a[5].ach===null,JSON.stringify(a));
await page.evaluate(()=>{location.hash='#/receivables'});await page.waitForTimeout(2500);
let tx=(await page.innerText('#pg')).replace(/\s+/g,' ');
ok('Receivables K10: overdue 0% (nothing overdue) shows "Within plan", not 15000%',/Within plan/.test(tx)&&!/15000/.test(tx),(tx.match(/K10[^]{0,260}/)||[''])[0]);
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
