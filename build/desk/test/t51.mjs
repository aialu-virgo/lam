import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const go=async(page,h,w)=>{await page.evaluate(h=>{location.hash=h},h);await page.waitForTimeout(w||2200)};
const tx=async page=>(await page.innerText('#pg')).replace(/[ \t]+/g,' ');
const clone=o=>JSON.parse(JSON.stringify(o));
/* ===== 1. DEMO plan records are never used against real sales ===== */
const real=clone(store);Object.keys(real).forEach(k=>{if(/^cells\//.test(k))Object.values(real[k].plants).forEach(p=>delete p.demo)});   /* the sales are real, the potential records stay demo:true */
let {page,errs}=await open(browser,{store:real});await page.waitForTimeout(4000);
const f1=await page.evaluate(()=>{const g=window.__desk;const t=g.figs({},g.viewCtx());return {tgt:t.tgt,ach:t.ach,pot:t.pot,check:!!t.check}});
ok('D55-1: a demo target/potential is not used for a plant-quarter with real sales (no target, no potential, no Ach %)',f1.tgt==null&&f1.ach==null&&f1.pot==null,JSON.stringify(f1));
await go(page,'#/sales',2500);const sl=await tx(page);
ok('D55-1: Sales shows "Target not set", never a huge percentage',/Target not set/.test(sl)&&!/\b\d{4,}\.\d%/.test(sl),(sl.match(/\d{4,}\.\d%/)||[''])[0]);
await go(page,'#/overview',3000);const ov=await tx(page);
ok('D55-1: Overview shows the target as not loaded and no Ach % number',/Target and potential not loaded/.test(ov)&&!/\b\d{4,}(\.\d)?%/.test(ov),'');
/* the same demo records still work against demo sales */
const dm=await open(browser,{store});await dm.page.waitForTimeout(4000);
const f2=await dm.page.evaluate(()=>{const g=window.__desk;const t=g.figs({},g.viewCtx());return {tgt:t.tgt,ach:t.ach}});
ok('D55-1: demo plans still work against demo sales',f2.tgt>0&&f2.ach>0,JSON.stringify(f2));
await dm.ctx.close();
/* sanity guard: a real target giving more than 300% shows "Check target" and raises an R8 action for the Super admin */
const bad=clone(store);Object.keys(bad).forEach(k=>{if(/^cells\//.test(k))Object.values(bad[k].plants).forEach(p=>delete p.demo);if(/^potential\//.test(k)){delete bad[k].demo}});
Object.keys(bad).forEach(k=>{if(/^potential\/fy27_q3_1001_laminate/.test(k)){const p=bad[k];p.potential_value_inr=1000;p.potential_qty_sheets=10;p.potential_qty_sqft=320;if(p.approved){p.approved.potential_value_inr=1000;p.approved.potential_qty_sqft=320}if(p.original){p.original.potential_value_inr=1000}}});
const gq=await open(browser,{store:bad});await gq.page.waitForTimeout(9000);
const ck=await gq.page.evaluate(()=>{const g=window.__desk;const ctx=g.viewCtx();const o=g.figs({plant:'1001',group:'Laminate'},ctx,{noTrend:true});return {tgt:o.tgt,ach:o.ach,check:!!o.check}});
ok('D55-1: a real target that gives >300% shows "Check target" (no number)',ck.check&&ck.ach==null,JSON.stringify(ck));
await go(gq.page,'#/overview',2500);await gq.page.click('[data-act="ox-tog"][data-k="group"]').catch(()=>{});await gq.page.waitForTimeout(800);
const gt=await tx(gq.page);ok('D55-1: Overview shows "Check target"',/Check target/.test(gt)||/Check target/.test(await gq.page.innerText('body')),'');
const act=await gq.page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^actions\/R8_/.test(k)).map(k=>[k,window.__mockStore()[k].owner]));
ok('D55-1: an R8 "Check target" action is raised for the Super admin',act.length>=1&&act.every(a=>a[1]==='data@virgoasia.com'),JSON.stringify(act.slice(0,2)));
await gq.ctx.close();
/* ===== 2. trends: partial quarters are drawn, labelled and valued ===== */
const part=clone(store);
for(const ym of ['2026-04','2026-05','2026-06']){const k='cells/INV_'+ym;if(part[k]){const ps=Object.keys(part[k].plants);ps.slice(2).forEach(p=>delete part[k].plants[p])}}   /* Q1 FY27: only 2 plants loaded */
const pt=await open(browser,{store:part});await pt.page.waitForTimeout(4000);
const sr=await pt.page.evaluate(()=>{const g=window.__desk;return g.quarterSeries({plants:null}).map(s=>({q:s.label,A:s.A,Ap:s.Ap,partial:s.partial,cov:s.cov}))});
const q1=sr.find(s=>/Q1 FY27/.test(s.q));
ok('D55-2: a quarter with some plants loaded is a partial series point with its loaded value and "n of N plants"',q1&&q1.partial&&q1.A==null&&q1.Ap>0&&q1.cov&&q1.cov.n===2&&q1.cov.N>=2,JSON.stringify(q1));
await go(pt.page,'#/sales',3000);
const bars=await pt.page.evaluate(()=>({bars:document.querySelectorAll('#pg svg.trend .bar-q').length,dashed:document.querySelectorAll('#pg svg.trend rect[stroke-dasharray="4 3"]').length,vl:Array.from(document.querySelectorAll('#pg svg.trend .vl')).map(e=>e.textContent),txt:document.querySelector('#pg svg.trend').textContent}));
ok('D55-2: the ₹ trend draws a bar for every quarter with data (partial included) and a dashed box only for no data',bars.bars>=sr.filter(s=>s.A!=null||s.Ap!=null).length&&bars.dashed===sr.filter(s=>s.A==null&&s.Ap==null).length,JSON.stringify([bars.bars,bars.dashed]));
ok('D55-2: every bar prints its value in ₹ Cr, and the partial bar says "partial:" and "2 of N plants"',bars.vl.length>=bars.bars&&bars.vl.every(t=>/Cr$/.test(t))&&/partial:/.test(bars.txt)&&/2 of \d+ plants/.test(bars.txt),JSON.stringify(bars.vl.slice(0,3))+' '+(bars.txt.match(/\d+ of \d+ plants/)||[''])[0]);
ok('D55-2: the QoQ chain is marked "vs partial" after a partial quarter',/vs partial/.test(bars.txt)&&/partial/.test(bars.txt),'');
await go(pt.page,'#/overview',3000);
const ob=await pt.page.evaluate(()=>{const svg=Array.from(document.querySelectorAll('#pg svg')).find(s=>/Quarterly sheets/.test(s.getAttribute('aria-label')||''));return {vl:Array.from(svg.querySelectorAll('.vl')).map(e=>e.textContent),txt:svg.textContent,hatched:svg.querySelectorAll('rect[fill="url(#oxh)"]').length}});
ok('D55-2: the Overview sheets trend prints lakh sheets on every bar, hatches the partial one and labels it',ob.vl.length>=6&&ob.hatched>=1&&/partial:/.test(ob.txt)&&/2 of \d+ plants/.test(ob.txt)&&/vs partial/.test(ob.txt),JSON.stringify(ob.vl)+' '+ob.hatched);
await pt.ctx.close();
/* ===== 3. item master: thickness and brand are kept ===== */
const it=await open(browser,{store:{}});await it.page.waitForTimeout(2500);
const H='Item No.,Item Description,Inventory UoM,Active,Thickness,Size,Item Category,Brand';
fs.writeFileSync(AF+'items-brand.csv',[H,'ITB001,Lam A,Pcs,Y,0.8,8X4,Decorative Laminates,Virgo','ITB002,Lam B,Pcs,Y,1.0,8X4,Decorative Laminates,Greenlam','ITB003,Lam C,Pcs,Y,1.25,7X3,Decorative Laminates,'].join('\n'));
await go(it.page,'#/admin',800);await it.page.click('[data-t="items"]');await it.page.waitForTimeout(300);
await it.page.setInputFiles('#up-item',AF+'items-brand.csv');await it.page.waitForFunction(()=>/Check result/i.test(document.querySelector('#pg').innerText),null,{timeout:30000});
const ir=await it.page.evaluate(()=>{const r=window.__dbg.S.mst.items.res;return {loaded:r.loaded,wb:r.withBrand,items:r.items.map(a=>a.slice(0,1).concat(a.slice(3,4),a.slice(7)))}});
ok('D55-3: the item check reads Brand and Thickness per item',ir.loaded===3&&ir.wb===2&&JSON.stringify(ir.items[0])==='["ITB001",0.8,"Virgo"]',JSON.stringify(ir));
ok('D55-3: the page tells how many items carry a brand',/Brand column found: 2 of 3/.test(await it.page.innerText('#pg')),'');
await it.page.click('[data-act="mst-item-load"]');await it.page.waitForFunction(()=>/Loaded/i.test(document.querySelector('#pg').innerText),null,{timeout:30000});await it.page.waitForTimeout(1200);
const stI=await it.page.evaluate(async()=>{const m=window.__mockStore();const c=m['items/c0'];return {rows:JSON.parse(await window.__desk.ungz(c.z)),meta:m['itemmeta/main'],fmt:c.fmt}});
ok('D55-3: stored rows carry thickness (index 3) and brand (index 7); the format note says so; the meta counts them',stI.rows[0][3]===0.8&&stI.rows[0][7]==='Virgo'&&stI.rows[0].length===8&&/brand\]$/.test(stI.fmt)&&stI.meta.with_brand===2&&stI.meta.with_thickness===3,JSON.stringify(stI.rows[0])+JSON.stringify(stI.meta.with_brand));
/* backward compatible: old chunks (7 fields) still read; a re-upload refreshes the index */
const idx1=await it.page.evaluate(async()=>{const g=window.__dbg;const i=await window.__dbg.loadItemIdx();const e=i.get('ITB002');return [e[0],e[1],e[2],e[3],e[4]]});
ok('D55-3: the item index offers group, sq ft, active, thickness and brand',idx1[0]==='Laminate'&&idx1[3]===1&&idx1[4]==='Greenlam',JSON.stringify(idx1));
fs.writeFileSync(AF+'items-brand2.csv',[H,'ITB001,Lam A,Pcs,Y,0.8,8X4,Decorative Laminates,Merino','ITB002,Lam B,Pcs,Y,1.0,8X4,Decorative Laminates,Greenlam','ITB003,Lam C,Pcs,Y,1.25,7X3,Decorative Laminates,Century'].join('\n'));
await it.page.click('[data-act="mst-reset"][data-k="items"]').catch(()=>{});await it.page.waitForTimeout(300);
await it.page.setInputFiles('#up-item',AF+'items-brand2.csv');await it.page.waitForFunction(()=>/Check result/i.test(document.querySelector('#pg').innerText),null,{timeout:30000});
await it.page.click('[data-act="mst-item-load"]');await it.page.waitForFunction(()=>/Loaded 3/i.test(document.querySelector('#pg').innerText),null,{timeout:30000});await it.page.waitForTimeout(1500);
const idx2=await it.page.evaluate(async()=>{const i=await window.__dbg.loadItemIdx();return [i.get('ITB001')[4],i.get('ITB003')[4]]});
ok('D55-3: an item-master re-upload refreshes brand in the item index',idx2[0]==='Merino'&&idx2[1]==='Century',JSON.stringify(idx2));
/* a file with no Brand column is stored without brand and says so */
fs.writeFileSync(AF+'items-nobrand.csv',['Item No.,Item Description,Inventory UoM,Active,Thickness,Size,Item Category','ITN001,X,Pcs,Y,0.8,8X4,Decorative Laminates'].join('\n'));
await it.page.click('[data-act="mst-reset"][data-k="items"]').catch(()=>{});await it.page.waitForTimeout(300);
await it.page.setInputFiles('#up-item',AF+'items-nobrand.csv');await it.page.waitForFunction(()=>/Check result/i.test(document.querySelector('#pg').innerText),null,{timeout:30000});
ok('D55-3: a file with no Brand column warns and stores no brand',/No Brand column in this file/.test(await it.page.innerText('#pg')),'');
await it.ctx.close();
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
