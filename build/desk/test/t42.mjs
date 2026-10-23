import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(creditnotes|uploads|rejects|actions|followups)\//.test(k))delete st0[k]});
st0['plants/1050']={plant_code:'1050',plant_name:'DEMO ACP plant',plant_type:'Depot',zone:'',state:'',b1_bpl_name:'DEMO ACP plant',business:'ACP',active:true};
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(n=>window.__desk.U&&window.__desk.U.name===n&&['mapping','validated','done'].includes(window.__desk.U.stage),f.split('/').pop(),{timeout:20000}).catch(()=>{});await page.waitForTimeout(400)};
const val=async()=>{await page.evaluate(()=>{const b=document.querySelector('[data-act="cn-validate"]');if(b&&!b.disabled)b.click()});await page.waitForFunction(()=>['validated','done'].includes(window.__desk.U.stage),null,{timeout:20000}).catch(()=>{});await page.waitForTimeout(1500)};
const cnStore=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^creditnotes\//.test(k))));
const B1H=['DocNum','LineNum','DocDate','CardCode','CardName','BPLName','ItemCode','Quantity','LineTotal','BaseRef'];
const rowsB1=[
 [5001,0,'05/08/2026','DEMOCU1','DEMO Cust 1','DEMO plant 1012','DEMOFG00001',10,2000,9001],
 [5001,1,'05/08/2026','DEMOCU1','DEMO Cust 1','DEMO plant 1012','DEMOFG00002',5,1500,9001],
 [5002,0,'10/09/2026','DEMOCU2','DEMO Cust 2','DEMO plant 1013','DEMOFG00003',4,1200,9002],
 [5003,0,'12/09/2026','DEMOCU2','DEMO Cust 2','DEMO ACP plant','DEMOFG00003',4,9999,9003],
 [5004,0,'12/09/2026','DEMOCU2','DEMO Cust 2','DEMO plant 1012','NOTALAMINATE',4,777,9003],
 [5005,0,'12/09/2026','DEMOCU2','DEMO Cust 2','NO SUCH','DEMOFG00003',4,100,9003],
 [5006,0,'12/10/2025','DEMOCU2','DEMO Cust 2','DEMO plant 1012','DEMOFG00003',4,100,9003],
 [5007,0,'12/09/2026','DEMOCU2','DEMO Cust 2','DEMO plant 1012','DEMOFG00003',4,'abc',9003],
 [5001,0,'05/08/2026','DEMOCU1','DEMO Cust 1','DEMO plant 1012','DEMOFG00001',10,2000,9001]];
const FN='Credit_Notes_-2026-07-01_to_2026-09-30.csv';
fs.writeFileSync(AF+FN,csvOf(B1H,rowsB1));
await up(AF+FN);
let d=await page.evaluate(()=>({kind:window.__desk.U.kind,layout:window.__desk.U.layout,per:window.__desk.U.period}));
ok('B1 ORIN/RIN1 layout detected as credit notes; period read from the file name',d.kind==='cn'&&/B1 credit notes/.test(d.layout)&&d.per&&d.per.from==='2026-07-01',JSON.stringify(d));
await val();
let r=await page.evaluate(()=>{const u=window.__desk.U.res;return {good:u.good,rej:u.rejected,reasons:Object.keys(u.reasons),acp:u.acp.rows,other:u.other.rows,dup:u.dup,months:u.covMonths,stage:window.__desk.U.stage,value:u.value}});
ok('counts: 3 lines loaded, ACP skipped, non-laminate counted, repeated line removed, 3 rejected (branch, out of period, value)',r.good===3&&r.rej===3&&r.acp===1&&r.other===1&&r.dup===1&&r.stage==='done',JSON.stringify(r));
ok('covers Jul, Aug, Sep 2026 from the period in the file name',JSON.stringify(r.months)===JSON.stringify(['2026-07','2026-08','2026-09']),JSON.stringify(r.months));
let m=await cnStore();
const d1012=m['creditnotes/1012-2026-08'],d1013=m['creditnotes/1013-2026-09'];
ok('plant-month documents by product group with SAP reference per line',d1012&&d1012.groups.Laminate&&d1012.groups.Laminate.sheets===15&&Math.abs(d1012.groups.Laminate.value-3500)<0.01&&d1013&&d1013.groups.Laminate.sheets===4&&d1012.sys==='B1'&&!!d1012.upload,JSON.stringify(d1012&&d1012.groups));
const lines=await page.evaluate(async d=>JSON.parse(await window.__desk.ungz(d)),d1012.z);
ok('each stored line keeps document, line, item and base invoice',lines.length===2&&lines[0][0]==='5001'&&lines[0][4]==='DEMOFG00001'&&lines[0][8]==='9001',JSON.stringify(lines[0]));
ok('coverage marks written for the three months; no ACP document',['2026-07','2026-08','2026-09'].every(y=>m['creditnotes/cov_'+y])&&!Object.keys(m).some(k=>/^creditnotes\/1050/.test(k)),Object.keys(m).join(','));
/* re-upload idempotent */
const sig=o=>JSON.stringify(Object.fromEntries(Object.entries(o).map(([k,v])=>[k,[v.groups&&v.groups.Laminate&&v.groups.Laminate.value,v.n]])));
const b0=sig(m);await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(400);await up(AF+FN);await val();m=await cnStore();
ok('re-upload is idempotent',sig(m)===b0,'');
/* D40: the quarter is covered, Q2 FY27 is a closed quarter */
const q2=await page.evaluate(()=>{const f={plants:null,plant:'1012'};const s=window.__desk.quarterSeries(f);const x=s.find(z=>/Q2/.test(z.label)&&/27/.test(z.label));return x&&{A:x.A,Anet:x.Anet,H:x.H,net:x.net,label:x.label}});
ok('D40: Q2 FY27 (every month covered) uses Net = invoiced − credit notes; headline is Net',q2&&q2.net&&Math.abs((q2.A-q2.Anet)-3500)<0.01&&q2.H===q2.Anet,JSON.stringify(q2));
const q1=await page.evaluate(()=>{const s=window.__desk.quarterSeries({plants:null,plant:'1012'});const x=s.find(z=>/Q1/.test(z.label)&&/27/.test(z.label));return x&&{net:x.net,H:x.H,A:x.A}});
ok('D40: Q1 FY27 (no credit notes loaded) stays on invoiced',q1&&!q1.net&&q1.H===q1.A,JSON.stringify(q1));
const cur=await page.evaluate(()=>{const s=window.__desk.quarterSeries({plants:null,plant:'1012'});const x=s[s.length-1];return {net:x.net,isCur:x.isCur}});
ok('current quarter without credit notes loaded stays on invoiced (never zero)',cur.isCur&&!cur.net,JSON.stringify(cur));
/* the Sales page shows Invoiced, Credit notes, Net side by side; "not loaded" where none */
await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(2500);
const tx=await page.innerText('#pg');
ok('Sales page shows the Invoiced · Credit notes · Net panel with "Credit notes not loaded" for Oct',/Invoiced · Credit notes · Net/i.test(tx)&&/Credit notes not loaded/i.test(tx),tx.length+'');
/* QoQ basis: previous quarter net, current invoiced -> invoiced vs invoiced with a tooltip */
const qb=await page.evaluate(()=>{const ctx=window.__desk.viewCtx();const o=window.__desk.figs({},ctx);return {basis:o.basis,tip:o.qoq&&o.qoq.tip}});
ok('QoQ tooltip says which basis is compared',/Invoiced against invoiced/.test(qb.tip||'')&&qb.basis==='Invoiced',JSON.stringify(qb));
/* second file: October to date -> current quarter covered, net vs net */
const rows2=[[6001,0,'05/10/2026','DEMOCU1','DEMO Cust 1','DEMO plant 1012','DEMOFG00001',2,400,9101]];
const FN2='Credit_Notes_-2026-10-01_to_2026-10-23.csv';fs.writeFileSync(AF+FN2,csvOf(B1H,rows2));
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(400);await up(AF+FN2);await val();
const net=await page.evaluate(()=>{const ctx=window.__desk.viewCtx();const o=window.__desk.figs({plant:'1012'},ctx);return {basis:o.basis,pBasis:o.pBasis,tip:o.qoq&&o.qoq.tip,cn:o.cn}});
ok('after October is covered: current quarter is Net, and QoQ compares Net with Net',net.basis==='Net'&&net.pBasis==='Net'&&/Net sales against net sales/.test(net.tip||'')&&net.cn>0&&net.cn<=400,JSON.stringify(net));
/* S/4 billing credit memos */
const S4H=['Invoice Document Number','Invoice Document item','Plant','Invoice Date','Sold-to-Party Number','Product Code','Invoice Qty','Total Amount (Item)','Billing Type','Reference Document'];
const rowsS4=[[7001,10,'1012','2026-08-07','DEMOCU1','DEMOFG00001',3,600,'G2',9201],[7002,10,'1013','2026-08-09','DEMOCU2','DEMOFG00002',2,500,'RE',9202],[7003,10,'1013','2026-08-09','DEMOCU2','DEMOFG00002',2,500,'F2',9203],[7004,10,'1012','2026-08-11','DEMOCU1','DEMOFG00001',1,100,'S1',9204]];
const FN3='S4_credit_memos_-2026-08-01_to_2026-08-31.csv';fs.writeFileSync(AF+FN3,csvOf(S4H,rowsS4));
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(400);await up(AF+FN3);
d=await page.evaluate(()=>({kind:window.__desk.U.kind,sys:window.__desk.U.sys}));
ok('S/4 billing credit memos (non-F2 billing types) detected as credit notes',d.kind==='cn'&&d.sys==='S4',JSON.stringify(d));
await val();
r=await page.evaluate(()=>{const u=window.__desk.U.res;return {good:u.good,nc:u.nonCredit,stage:window.__desk.U.stage}});
ok('S/4: F2 invoice rows skipped and counted; credit memos loaded',r.good===3&&r.nc===1&&r.stage==='done',JSON.stringify(r));
m=await cnStore();
ok('S/4 replaced August for the plants in the file (replace by plant-month); sys S4',m['creditnotes/1012-2026-08']&&m['creditnotes/1012-2026-08'].sys==='S4'&&m['creditnotes/1012-2026-08'].groups.Laminate.sheets===4,JSON.stringify(m['creditnotes/1012-2026-08']&&m['creditnotes/1012-2026-08'].groups));
/* Undo the S/4 upload */
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const uid=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.entity==='CN'&&v.file.indexOf('S4_credit')>=0).map(([k])=>k.slice(8))[0]);
await page.click('[data-act="hist-undo"][data-id="'+uid+'"]');await page.waitForTimeout(500);await page.click('[data-act="undo-go"]');await page.waitForTimeout(4000);
m=await cnStore();
ok('Undo removes the plant-months of that upload',!m['creditnotes/1012-2026-08']&&!!m['creditnotes/1013-2026-09']&&!!m['creditnotes/1012-2026-10'],Object.keys(m).join(','));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
