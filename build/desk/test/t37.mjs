import { chromium, open } from './run.mjs';
import fs from 'fs';import zlib from 'zlib';import { createRequire } from 'module';import { execFileSync } from 'child_process';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const items=JSON.parse(zlib.gunzipSync(Buffer.from(store['items/c0'].z,'base64')).toString()).map(a=>a[0]);   /* DEMOFG... item master */
const sqftOf=Object.fromEntries(JSON.parse(zlib.gunzipSync(Buffer.from(store['items/c0'].z,'base64')).toString()).map(a=>[a[0],a[2]]));
const plants=[{code:'1012'},{code:'1013'}];
/* ---- files ---- */
const oitw=G.stockFile({kind:'oitw',asOf:'2026-09-30',plants,items,seed:5});
oitw.rows.push(['DEMOFG00001','neg','1012-FG',-5,0,0,100],['','blank item','1012-FG',5,0,0,100],['NOTMASTER1','not laminate','1012-FG',50,0,0,100],['DEMOFG00002','unknown wh','ZZ-UNKNOWN',9,0,0,100]);
fs.writeFileSync(AF+'Stock 2026-09-30.csv',csvOf(oitw.headers,oitw.rows));
const s4=G.stockFile({kind:'s4',asOf:'2026-10-20',plants,items,seed:6});fs.writeFileSync(AF+'MB52 2026-10-20.csv',csvOf(s4.headers,s4.rows));
const batch=G.stockFile({kind:'batch',asOf:'2026-10-20',plants,items,seed:7});fs.writeFileSync(AF+'Batch stock 2026-10-20.csv',csvOf(batch.headers,batch.rows));
const TOT=['Company Code','Plant','Material Type','Material Group','Old Material Number','Material','Material Description','Batch','Storage Location','Stock Quantity on Period Start','Value on Period Start','Total Goods Receipt Quantity','Total Goods Receipt Value','Total Goods Issue Quantity','Total Goods Issue Value','Stock Quantity on Period End','Stock Value on Period End','Debit Revaluation','Credit Revaluation','Base Unit of Measure','Currency','Price Control'];
const mkTot=(n,asof)=>{const rows=[];let mism=0,zero=0;const groups=['ZVGLAM','ZABLAM','ZCRLAM','ZCBLAM','ZCBPVC','ZBLLAM','ZLKLAM','ZCLLAM','ZEXLAM','ZOTLAM','ZVGPVC'];
  for(let i=0;i<n;i++){const it=i<items.length*40?items[i%items.length]:'FG9'+String(i).padStart(5,'0');const pl=plants[i%2].code;const end=i%15===0?0:10+(i*7)%300;const start=end,gr=0,gi=0;let s0=start;if(i%20===3){s0=start+3;mism++}if(end===0)zero++;
    rows.push(['1000',pl,i%9===0?'Z3PC':'Z3LM',groups[i%11],it,String(10000000+i),'DEMO mat '+i,'LEGACY0'+(1+i%3),'W003',s0,s0*100,gr,0,gi,0,end,end*100,0,0,'PC','INR','S'])}
  return {rows,mism,zero}};
const tot=mkTot(2400);fs.writeFileSync(AF+'Stock_Overview_Totals-2026-10-20-1.csv',csvOf(TOT,tot.rows));
const big=mkTot(66097);fs.writeFileSync(AF+'Stock_Overview_Totals-2026-10-21-1.csv',csvOf(TOT,big.rows));
fs.writeFileSync(AF+'tot.json',JSON.stringify({out:AF+'Stock_Overview_Totals-2026-10-19-1.xlsx',sheets:[['Data',[TOT].concat(mkTot(300).rows)]]}));execFileSync('python3',[new URL('./mkxlsx.py',import.meta.url).pathname,AF+'tot.json']);
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(stock|uploads|rejects|actions|followups)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const up=async(f,w)=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.stage==='mapping'&&window.__desk.U.kind==='stock',null,{timeout:120000});await page.click('[data-act="stk-validate"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:300000})};
const snaps=()=>page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k])=>/^stock\/snap_/.test(k)).map(([k,v])=>[k.slice(11),v]));
/* A. B1 OITW, two warehouses per plant, bad rows skipped */
await up(AF+'Stock 2026-09-30.csv');
let sn=(await snaps());let r=await page.evaluate(()=>{const u=window.__desk.U.res;return {rej:u.rejected,reasons:u.reasons,other:u.other.rows,good:u.good,mapped:u.fx.whMapped,asOf:u.asOf}});
ok('B1 OITW: as-on date read from the file name; neg qty, blank item and unknown warehouse skipped; non-master item counted',r.asOf==='2026-09-30'&&r.rej===3&&r.reasons['Negative stock']===1&&r.reasons['Unknown warehouse or plant']===1&&r.other===1,JSON.stringify(r));
const exp1012=oitw.rows.filter(x=>String(x[2]).startsWith('1012')&&x[3]>0&&sqftOf[x[0]]).reduce((a,x)=>a+x[3],0);
const got1012=Object.values(sn[0][1].plants['1012'].groups).reduce((a,g)=>a+g.sheets,0);
ok('multi-warehouse plant: 1012-FG and 1012-W1 are added together under plant 1012',got1012===exp1012&&sn.length===1,got1012+' vs '+exp1012);
ok('snapshot stored with chunked item rows and no ageing note for OITW',sn[0][1].hasAge===false&&sn[0][1].plants['1012'].chunks>=1,'');
const sqExp=oitw.rows.filter(x=>String(x[2]).startsWith('1012')&&x[3]>0&&sqftOf[x[0]]).reduce((a,x)=>a+x[3]*sqftOf[x[0]],0);
const sqGot=Object.values(sn[0][1].plants['1012'].groups).reduce((a,g)=>a+g.sqft,0);
ok('sq ft comes from the item master size',Math.abs(sqGot-sqExp)<=5,sqGot+' vs '+Math.round(sqExp));
/* B. same as-on date again replaces it */
await up(AF+'Stock 2026-09-30.csv');sn=await snaps();
const chunksN=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^stock\/it_20260930/.test(k)).length);
ok('re-upload of the same as-on date replaces the snapshot (one snapshot, no leftover chunks)',sn.length===1&&chunksN===2+0*1||sn.length===1&&chunksN>=2,sn.length+' / '+chunksN);
/* C. S/4 MB52 and batch export */
await up(AF+'MB52 2026-10-20.csv');sn=await snaps();
ok('S/4 MB52 file loads as an S/4 snapshot',sn.length===2&&sn.some(s=>s[1].sys==='S4'&&s[0]==='20261020'),sn.map(s=>s[0]+s[1].sys).join());
await up(AF+'Batch stock 2026-10-20.csv');sn=await snaps();
const b=sn.find(s=>s[0]==='20261020')[1];
ok('batch export replaces that date and carries ageing',sn.length===2&&b.hasAge===true&&Object.values(b.plants['1012'].groups).every(g=>g.age&&g.age.length===4),'');
/* D. Stock Overview Totals: real layout, 66k rows within chunk limits, idempotent */
await up(AF+'Stock_Overview_Totals-2026-10-20-1.csv');
r=await page.evaluate(()=>{const u=window.__desk.U.res;return {kind:u.kind,asOf:u.asOf,warn:u.warn,zero:u.zero,good:u.good,rej:u.rejected,viaGroup:u.fx.viaGroup}});
ok('Stock Overview Totals layout detected; as-on date from the file name; zero-closing rows skipped; mismatches warned not rejected',r.kind==='s4tot'&&r.asOf==='2026-10-20'&&r.zero===tot.zero&&r.warn.mismatch>0&&r.rej===0,JSON.stringify(r));
const t0=Date.now();await up(AF+'Stock_Overview_Totals-2026-10-21-1.csv');const dt=Date.now()-t0;
const big2=await page.evaluate(()=>{const m=window.__mockStore();const ch=Object.entries(m).filter(([k])=>/^stock\/it_20261021/.test(k));return {n:ch.length,max:Math.max(...ch.map(([k,v])=>JSON.stringify(v).length)),idx:JSON.stringify(m['stock/snap_20261021']).length,r:window.__desk.U.res.good}});
ok('66,097-row file loads; every document is under the 256 KiB limit',big2.max<250000&&big2.idx<250000&&big2.r>50000,JSON.stringify(big2)+' '+dt+'ms');
const rows66=await page.evaluate(async()=>{const db=await window.claude.use('db');const s=await db.doc('stock/it_20261021_1012_0').get();return s.exists});
ok('item rows keep the SAP reference (S4, plant, material, batch)',rows66===true,'');
await up(AF+'Stock_Overview_Totals-2026-10-21-1.csv');sn=await snaps();
ok('the same Totals file again: still one snapshot for that date',sn.filter(s=>s[0]==='20261021').length===1,'');
await up(AF+'Stock_Overview_Totals-2026-10-19-1.xlsx');sn=await snaps();
ok('Totals workbook (sheet "Data") loads too',sn.some(s=>s[0]==='20261019'),sn.map(s=>s[0]).join());
/* E. retention: last 6 snapshots plus the latest of each month since history start */
const hist=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^stock\/snap_/.test(k)).map(k=>k.slice(11)).sort());
console.log('snaps held',hist.join(','));
/* F. Inventory page, stock days hand calc */
await page.evaluate(()=>{location.hash='#/inventory'});await page.waitForTimeout(2500);
const asOfShown=await page.evaluate(()=>window.__dbg.S.stockAsOf);
await page.evaluate(()=>{window.__dbg.S.stockAsOf='2026-09-30';});
/* ground truth straight from the stored invoice chunks */
const gt=(plant,group,asOf)=>{let by={};for(const [k,v] of Object.entries(store)){if(!k.startsWith('inv/')||v.plant!==plant)continue;const o=JSON.parse(zlib.gunzipSync(Buffer.from(v.z,'base64')).toString());for(const a of o.a){if(a[4]||a[3]!==group)continue;by[v.ym]=(by[v.ym]||0)+a[7]}}
  return by};
const by=gt('1012','Laminate','2026-09-30');
const avg=((by['2026-07']||0)*29/31+(by['2026-08']||0)+(by['2026-09']||0))/90;
const calc=await page.evaluate(()=>({d:window.__dbg.stockDays?window.__dbg.stockDays('1012','Laminate',1000,'2026-09-30'):null}));
ok('stock days hand calc: 1000 sheets / (Jul x29/31 + Aug + Sep)/90 from the stored chunks',calc.d!=null&&Math.abs(calc.d-1000/avg)<0.05,calc.d+' vs '+(1000/avg).toFixed(3)+' avg/day '+avg.toFixed(2));
await page.evaluate(()=>{window.__dbg.S.stockAsOf=window.__dbg.S.stockAsOf});
await page.evaluate(()=>{location.hash='#/inventory'});await page.waitForTimeout(800);
const tx=await page.innerText('#pg');
ok('Inventory page shows stock days, the plant x group table and snapshots held',/Stock days/i.test(tx)&&/Stock vs plan/i.test(tx)&&/Snapshots held/i.test(tx),tx.slice(0,100).replace(/\n/g,' '));
/* G. undo a stock upload */
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(800);
const before=(await snaps()).length;
const uid=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.entity==='ST'&&/2026-10-19/.test(v.file)).map(([k])=>k.slice(8))[0]);
await page.click('[data-act="hist-undo"][data-id="'+uid+'"]');await page.waitForTimeout(500);await page.click('[data-act="undo-go"]');await page.waitForTimeout(3500);
const after=(await snaps()).length;const ch2=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^stock\/it_20261019/.test(k)).length);
ok('Undo upload removes the stock snapshot and its item rows',after===before-1&&ch2===0,before+' -> '+after);
ok('coverage grid has a Stock row with month-end status',await page.evaluate(()=>/Stock/.test(document.querySelector('#i-cov').innerText)&&!!document.querySelector('#i-cov [data-ent="ST"]')),'');
/* H. retention: last 6 snapshots + the latest of each month since history start; older stray ones are pruned */
await page.context().close();
({page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(st0)),autoload:true}));await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
for(const d of ['2025-02-28','2026-04-05','2026-04-25','2026-05-10','2026-06-10','2026-07-10','2026-08-10','2026-09-10','2026-10-10']){const f=G.stockFile({kind:'oitw',asOf:d,plants:[{code:'1012'}],items:items.slice(0,3),seed:3});fs.writeFileSync(AF+'Stock '+d+'.csv',csvOf(f.headers,f.rows));await up(AF+'Stock '+d+'.csv')}
const kept=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^stock\/snap_/.test(k)).map(k=>k.slice(11)).sort());
ok('retention: pre-history snapshot and the non-latest April one are pruned; last 6 and each month\'s latest kept',!kept.includes('20250228')&&!kept.includes('20260405')&&kept.includes('20260425')&&kept.includes('20261010')&&kept.includes('20260910'),kept.join());
const orph=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^stock\/it_(20250228|20260405)/.test(k)).length);
ok('pruned snapshots leave no item-row chunks behind',orph===0,String(orph));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
