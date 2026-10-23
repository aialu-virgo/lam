import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(customers|receivables|uploads|rejects)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
const mstore=p=>page.evaluate(p=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>new RegExp(p).test(k))),p);
/* receivables first (so the master has something to work on) */
const RH=['DocNum','DocDate','DocDueDate','CardCode','CardName','BPLName','DocTotal','PaidToDate'];
fs.writeFileSync(AF+'cu_open_2026-10-20.csv',csvOf(RH,[[1,'05/08/2026','05/09/2026','DEMOCU1','','DEMO plant 1012',9000,0],[2,'05/08/2026','05/09/2026','DEMOCU2','Own Name Kept','DEMO plant 1013',500,0]]));
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const inp=await page.$('input[type=file]');await inp.setInputFiles(AF+'cu_open_2026-10-20.csv');await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.stage==='mapping',null,{timeout:20000});
await page.evaluate(()=>document.querySelector('[data-act="rc-validate"]').click());await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:20000});
/* customer master, B1 OCRD */
const OH=['CardCode','CardName','CardType','GroupName','City','State','SlpName','CreditLine','Balance','PymntGroup'];
const rowsO=[['DEMOCU1','DEMO Customer One','C','Dealer','Kochi','Kerala','DEMO Rep A',5000,100,'Net 30'],['DEMOCU2','DEMO Customer Two','C','Dealer','Pune','MH','DEMO Rep B',0,0,'Net 45'],['DEMOSU1','DEMO Supplier','S','Supplier','','','',0,0,''],['DEMOCU3','DEMO Customer Three','C','','','','','abc',0,''],['','No code','C','','','','',0,0,''],['DEMOCU1','Dup','C','','','','',0,0,'']];
fs.writeFileSync(AF+'ocrd.csv',csvOf(OH,rowsO));
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(500);
await page.click('[data-t="customers"]');await page.waitForTimeout(300);
await page.setInputFiles('#up-cust',AF+'ocrd.csv');await page.waitForFunction(()=>window.__desk.S.cu&&window.__desk.S.cu.stage==='mapping',null,{timeout:20000});
let cu=await page.evaluate(()=>({layout:window.__desk.S.cu.layout,sys:window.__desk.S.cu.sys}));
ok('B1 OCRD layout detected',/OCRD/.test(cu.layout)&&cu.sys==='B1',JSON.stringify(cu));
await page.click('[data-act="cu-check"]');await page.waitForFunction(()=>window.__desk.S.cu.stage==='checked',null,{timeout:20000});
let r=await page.evaluate(()=>{const u=window.__desk.S.cu.res;return {loaded:u.loaded,rej:u.rejected,skip:u.skippedType,lim:u.withLimit,warn:u.warned}});
ok('customers only (supplier skipped and counted); empty code and duplicate code rejected; bad limit warned',r.loaded===3&&r.rej===2&&r.skip===1&&r.lim===1&&r.warn===1,JSON.stringify(r));
await page.click('[data-act="cu-load"]');await page.waitForFunction(()=>window.__desk.S.cu.stage==='done',null,{timeout:20000});await page.waitForTimeout(800);
let m=await mstore('^customers/');
ok('stored as customers/c0 with the index document and an upload record',!!m['customers/c0']&&m['customers/main'].loaded===3&&Object.keys(await mstore('^uploads/')).some(k=>true),Object.keys(m).join(','));
const info=await page.evaluate(()=>{const s=window.__desk.S;return {n:s.custIdx.size,one:s.custIdx.get('DEMOCU1')}});
ok('index decoded: name, group, city, salesperson, credit limit',info.n===3&&info.one[1]==='DEMO Customer One'&&info.one[5]==='DEMO Rep A'&&info.one[6]===5000,JSON.stringify(info));
/* Receivables page: names, suggestion, limit, over limit */
await page.evaluate(()=>{location.hash='#/receivables'});await page.waitForTimeout(2500);
const tx=await page.innerText('#pg');
ok('Receivables: master name where the file had none; the file name is kept where present',/DEMO Customer One/.test(tx)&&/Own Name Kept/.test(tx)&&!/DEMO Customer Two/.test(tx),tx.length+'');
ok('Receivables: salesperson shown as a suggestion, credit limit and "over limit by" (9,000 against 5,000)',/DEMO Rep A/.test(tx)&&/suggested/i.test(tx)&&/Credit limit/i.test(tx)&&/Over limit by/i.test(tx)&&/4,000|₹4\.00 L|₹4,000/.test(tx.replace(/\s+/g,' ')),(tx.match(/Over limit[^\n]*/i)||[''])[0]);
/* S/4 business partner, replace-all */
const SH=['Customer','Name','City','Region','Credit limit'];
fs.writeFileSync(AF+'bp.csv',csvOf(SH,[['DEMOCU9','DEMO Customer Nine','Delhi','DL',250000],['DEMOCU1','DEMO Customer One','Kochi','KL',10000]]));
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(500);await page.click('[data-t="customers"]');await page.waitForTimeout(300);
await page.setInputFiles('#up-cust',AF+'bp.csv');await page.waitForFunction(()=>window.__desk.S.cu&&window.__desk.S.cu.stage==='mapping',null,{timeout:20000});
cu=await page.evaluate(()=>({layout:window.__desk.S.cu.layout,sys:window.__desk.S.cu.sys}));
ok('S/4 business partner layout detected',/S\/4/.test(cu.layout)&&cu.sys==='S4',JSON.stringify(cu));
await page.click('[data-act="cu-check"]');await page.waitForFunction(()=>window.__desk.S.cu.stage==='checked',null,{timeout:20000});
await page.click('[data-act="cu-load"]');await page.waitForFunction(()=>window.__desk.S.cu.stage==='done',null,{timeout:20000});await page.waitForTimeout(800);
const n2=await page.evaluate(()=>window.__desk.S.custIdx.size);
ok('each load replaces the whole master (2 customers now, not 5)',n2===2,String(n2));
/* unknown layout -> mapping step */
fs.writeFileSync(AF+'weird.csv',csvOf(['Code','Who','Where'],[['DEMOCU5','DEMO Five','X']]));
await page.setInputFiles('#up-cust',AF+'weird.csv').catch(()=>{});await page.waitForTimeout(800);
ok('unknown customer headers show the mapping step',await page.evaluate(()=>window.__desk.S.cu&&window.__desk.S.cu.stage==='mapping'&&/unknown/.test(window.__desk.S.cu.layout)),'');
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
