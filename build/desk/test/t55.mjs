import { chromium, open } from './run.mjs';
import fs from 'fs';import { execFileSync } from 'child_process';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(creditnotes|backups|uploads|rejects|actions|followups|cells|inv|roll)\//.test(k))delete st0[k]});
st0['plants/1050']={plant_code:'1050',plant_name:'DEMO ACP plant',plant_type:'Depot',zone:'',state:'',b1_bpl_name:'DEMO ACP plant',business:'ACP',active:true};
let {page,errs}=await open(browser,{store:st0,autoload:true,today:'2026-10-23'});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
/* the exact header of the real register: one sheet DATA, one month per file, LineTotal and Quantity positive */
const H=['#','BPLId','BPLName','Salesemployee','DocDate','TaxDate','docnum','billNo','RefNo','RefDate','CardCode','CardName','ItemCode','Dscription','Thickness','Thickness Type','Size','hsn','GST RATE','Quantity','BILL GSTIN','LineTotal','CGST_Amt','SGST_Amt','IGST_Amt','DocTotal','WTAmount','Catagory','Account','AcctName','None'];
const mk=(n,bpl,card,item,qty,val,acct,doc,ref)=>[n,1,bpl,'DEMO Rep','05/04/2025','05/04/2025',doc,'B'+doc,ref,'01/04/2025',card,'Cust '+card,item,'Lam',0.8,'Std','8X4','4823',18,qty,'27AAA',val,0,0,0,val*1.18,0,'Decorative Laminates','4000',acct,''];
const rows=[mk(1,'DEMO plant 1012','DEMOCU1','DEMOFG00001',10,2000,'Sales GST','9001','INV-501'),mk(2,'DEMO plant 1012','DEMOCU1','DEMOFG00002',5,1500,'Sales GST','9001','INV-501'),mk(3,'DEMO plant 1013','DEMOCU2','DEMOFG00003',4,1200,'Sales GST','9002','INV-502'),
 mk(4,'DEMO plant 1012','DEMOCU1','DEMOFG00001',3,900,'Sales GST - Stock Outward','9003','INV-503'),mk(5,'DEMO ACP plant','DEMOCU3','DEMOFG00001',2,700,'Sales GST','9004','INV-504'),mk(6,'DEMO plant 1012','DEMOCU1','NOTINMASTER',2,333,'Sales GST','9005','INV-505')];
const FN='Credit_Note_Register_Report_2025-04-30.xlsx';
fs.writeFileSync(AF+'real-cn.json',JSON.stringify({out:AF+FN,sheets:[['DATA',[H].concat(rows)]]}));execFileSync('python3',[new URL('./mkxlsx.py',import.meta.url).pathname,AF+'real-cn.json']);
await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(AF+FN);await page.waitForTimeout(3500);
let t=await page.innerText('#i-upload');
ok('D60: the real register (name Credit_Note_Register_Report_YYYY-MM-DD, RefNo/RefDate, sheet DATA) never reaches the sales intake: it is detected as credit notes straight away',await page.evaluate(()=>window.__desk.U.kind==='cn'&&window.__desk.U.stage==='mapping'),t.slice(0,120));
ok('D60: no sales were written',Object.keys(await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^(cells|inv|roll)\//.test(k))))).length===0,'');
const mp=await page.evaluate(()=>{const U=window.__desk.U;const h=U.headers;const n=k=>U.map[k]>=0?h[U.map[k]]:null;return {kind:U.kind,branch:n('branch'),doc:n('doc'),date:n('date'),cust:n('cust'),item:n('item'),qty:n('qty'),value:n('value'),base:n('base'),acct:n('acct')}});
ok('D60: the CN intake maps the real layout: plant from BPLName, sheets from Quantity, value from LineTotal, DocDate, docnum, CardCode, ItemCode, RefNo as the base invoice, AcctName for transfers',mp.kind==='cn'&&mp.branch==='BPLName'&&mp.qty==='Quantity'&&mp.value==='LineTotal'&&mp.date==='DocDate'&&mp.doc==='docnum'&&mp.cust==='CardCode'&&mp.item==='ItemCode'&&mp.base==='RefNo'&&mp.acct==='AcctName',JSON.stringify(mp));
await page.evaluate(()=>document.querySelector('[data-act="cn-validate"]').click());await page.waitForFunction(()=>['validated','done'].includes(window.__desk.U.stage),null,{timeout:30000});await page.waitForTimeout(600);
const r=await page.evaluate(()=>{const u=window.__desk.U.res;return {good:u.good,xfer:u.xfer.rows,acp:u.acp.rows,other:u.other.rows,value:Math.round(u.value),sheets:Math.round(u.sheets),months:u.covMonths}});
ok('D60: the register counts: 3 lines loaded, 1 internal transfer excluded, 1 ACP excluded, 1 not in the item master; the credit amount is LineTotal (positive) and the sheets are Quantity',r.good===3&&r.xfer===1&&r.acp===1&&r.other===1&&r.value===4700&&r.sheets===19,JSON.stringify(r));
if(await page.evaluate(()=>window.__desk.U.stage)==='validated'){await page.click('[data-act="cn-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:30000})}
await page.waitForTimeout(800);
const cn=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>/^creditnotes\/1012-2025-04$|^creditnotes\/1013-2025-04$/.test(k))));
const lines=await page.evaluate(async z=>JSON.parse(await window.__desk.ungz(z)),cn['creditnotes/1012-2025-04'].z);
ok('D60: stored by plant-month and group with the original invoice (RefNo) kept per line; the ACP plant has no document',cn['creditnotes/1012-2025-04'].groups.Laminate.value===3500&&cn['creditnotes/1012-2025-04'].groups.Laminate.sheets===15&&cn['creditnotes/1013-2025-04'].groups.Laminate.value===1200&&lines[0][8]==='INV-501'&&!Object.keys(await page.evaluate(()=>window.__mockStore())).some(k=>/^creditnotes\/1050/.test(k)),JSON.stringify(lines[0]));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
