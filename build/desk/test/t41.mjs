import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(receivables|uploads|rejects|actions|followups)\//.test(k))delete st0[k]});
st0['plants/1050']={plant_code:'1050',plant_name:'DEMO ACP plant',plant_type:'Depot',zone:'',state:'',b1_bpl_name:'DEMO ACP plant',business:'ACP',active:true};
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(n=>window.__desk.U&&window.__desk.U.name===n&&['mapping','validated','done'].includes(window.__desk.U.stage),f.split('/').pop(),{timeout:20000}).catch(()=>{});await page.waitForTimeout(400)};
const val=async()=>{await page.evaluate(()=>{const b=document.querySelector('[data-act="rc-validate"]');if(b&&!b.disabled)b.click()});await page.waitForFunction(()=>['validated','done'].includes(window.__desk.U.stage),null,{timeout:20000}).catch(()=>{});await page.waitForTimeout(1500);};
const rcStore=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^receivables\//.test(k))));
const layouts=[
 {fn:'OINV_open_2026-10-20.csv',h:['DocNum','DocDate','DocDueDate','CardCode','CardName','BPLName','DocTotal','PaidToDate'],
  rows:[[1001,'05/09/2026','05/10/2026','DEMOCU1','DEMO Cust 1','DEMO plant 1012',1000,200],[1002,'06/09/2026','06/09/2026','DEMOCU2','DEMO Cust 2','DEMO plant 1012',500,500],[1003,'01/08/2026','01/08/2026','DEMOCU1','DEMO Cust 1','DEMO plant 1013',900,0],[1004,'01/08/2026','01/08/2026','DEMOCU3','DEMO Cust 3','DEMO ACP plant',50,0],[1005,'01/08/2026','01/08/2026','DEMOCU3','DEMO Cust 3','NO SUCH',50,0],[1006,'xx','01/08/2026','DEMOCU3','DEMO Cust 3','DEMO plant 1012',50,0],[1003,'01/08/2026','01/08/2026','DEMOCU1','DEMO Cust 1','DEMO plant 1013',900,0]],
  layout:/OINV/,good:2,rej:2,acp:1,zero:1,dup:1,open:1700},
 {fn:'JDT1_open_2026-10-20.csv',h:['BaseRef','RefDate','DueDate','ShortName','BPLName','BalDueDeb','BalDueCred'],
  rows:[[2001,'05/09/2026','05/10/2026','DEMOCU1','DEMO plant 1012',700,0],[2002,'05/09/2026','05/09/2026','DEMOCU1','DEMO plant 1012',0,300],[2003,'05/09/2026','05/09/2026','DEMOCU2','DEMO plant 1013',400,0]],
  layout:/JDT1/,good:3,rej:0,acp:0,zero:0,dup:0,open:1100,credit:300},
 {fn:'S4_open_2026-10-20.csv',h:['Document Number','Posting Date','Net Due Date','Customer','Name','Plant','Amount in Local Currency'],
  rows:[[3001,'2026-09-05','2026-10-05','DEMOCU1','DEMO Cust 1','1012',800],[3002,'2026-09-05','2026-09-09','DEMOCU2','DEMO Cust 2','1013',600],[3003,'2026-09-05','2026-09-09','DEMOCU2','DEMO Cust 2','9999',600]],
  layout:/S\/4/,good:2,rej:1,acp:0,zero:0,dup:0,open:1400},
 {fn:'Custom_open_2026-10-20.csv',h:['BRANCHNAME','DOCNUM','DOCDATE','DUEDATE','CARDCODE','CARDNAME','BALANCE'],
  rows:[['DEMO plant 1012',4001,'05/09/2026','05/10/2026','DEMOCU1','DEMO Cust 1',250],['DEMO plant 1013',4002,'05/09/2026','05/09/2026','DEMOCU2','DEMO Cust 2',350]],
  layout:/custom/,good:2,rej:0,acp:0,zero:0,dup:0,open:600}];
for(const L of layouts){
  fs.writeFileSync(AF+L.fn,csvOf(L.h,L.rows));
  await up(AF+L.fn);
  const det=await page.evaluate(()=>({kind:window.__desk.U.kind,layout:window.__desk.U.layout,asOf:window.__desk.U.asOf,stage:window.__desk.U.stage}));
  ok(L.fn+': detected as receivables, layout named, as-on date read from the file name',det.kind==='recv'&&L.layout.test(det.layout)&&det.asOf==='2026-10-20',JSON.stringify(det));
  await val();
  console.log(await page.evaluate(()=>JSON.stringify({st:window.__desk.U.stage,msg:window.__desk.U.msg,name:window.__desk.U.name,txt:document.querySelector('#i-upload').innerText.slice(0,300)})));
  const r=await page.evaluate(()=>{const u=window.__desk.U.res;return {good:u.good,rej:u.rejected,acp:u.acp.rows,zero:u.zero,dup:u.dup,open:Math.round(u.open),credit:Math.round(u.credit.value),stage:window.__desk.U.stage}});
  ok(L.fn+': counts (good, rejected, ACP skipped, zero, repeated, open, credit items)',r.good===L.good&&r.rej===L.rej&&r.acp===L.acp&&r.zero===L.zero&&r.dup===L.dup&&r.open===L.open&&(L.credit==null||r.credit===L.credit)&&r.stage==='done',JSON.stringify(r));
}
/* last load = custom layout, as on 2026-10-20: snapshot stored; re-upload of the same date replaces, not adds */
let m=await rcStore();const snaps=Object.keys(m).filter(k=>/^receivables\/rsnap_/.test(k));
ok('one snapshot for the date (same as-on replaced the earlier loads)',snaps.length===1&&snaps[0]==='receivables/rsnap_20261020'&&m[snaps[0]].open===600,JSON.stringify(snaps)+' '+(m[snaps[0]]||{}).open);
ok('no ACP plant stored; SAP file name and upload recorded',!Object.keys(m).some(k=>/_1050_/.test(k))&&m[snaps[0]].file==='Custom_open_2026-10-20.csv'&&!!m[snaps[0]].upload,'');
/* credits: JDT1 again, then page */
fs.writeFileSync(AF+'JDT1_open_2026-10-21.csv',csvOf(layouts[1].h,layouts[1].rows));
await up(AF+'JDT1_open_2026-10-21.csv');await val();
await page.evaluate(()=>{location.hash='#/receivables'});await page.waitForTimeout(2500);
const tx=await page.innerText('#pg');
ok('Receivables page: credit items shown apart; buckets exclude them',/credit items/i.test(tx)&&/DEMOCU1/.test(tx),tx.slice(0,100).replace(/\n/g,' '));
const bk=await page.evaluate(()=>{const s=window.__desk.S;return {have:s.recv.length,neg:s.recv.some(d=>d.rows.some(r=>r[4]<=0)),cr:(s.recvCredit||[]).reduce((a,d)=>a+d.rows.length,0),asOf:s.recvAsOf}});
ok('S.recv holds positive open items only; credits kept separately; as-on date drives the ageing',bk.have>0&&!bk.neg&&bk.cr===1&&bk.asOf==='2026-10-21',JSON.stringify(bk));
/* undo */
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const uid=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.entity==='RC'&&v.file.indexOf('2026-10-21')>=0).map(([k])=>k.slice(8))[0]);
await page.click('[data-act="hist-undo"][data-id="'+uid+'"]');await page.waitForTimeout(500);await page.click('[data-act="undo-go"]');await page.waitForTimeout(4000);
m=await rcStore();
ok('Undo removes that snapshot only; the earlier one stays',!m['receivables/rsnap_20261021']&&!!m['receivables/rsnap_20261020']&&!Object.keys(m).some(k=>/_20261021_/.test(k)),Object.keys(m).join(','));
/* no date in the file name: picker required */
await page.click('[data-act="dlg-close"]').catch(()=>{});
fs.writeFileSync(AF+'open_items_nodate.csv',csvOf(layouts[3].h,layouts[3].rows));
await up(AF+'open_items_nodate.csv');
const nd=await page.evaluate(()=>({asOf:window.__desk.U.asOf,dis:document.querySelector('[data-act="rc-validate"]').disabled}));
ok('no date in the file name: the as-on date is required before validating',nd.asOf===''&&nd.dis===true,JSON.stringify(nd));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
