import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];process.on('exit',()=>console.log(res.join('\n')));const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const st=JSON.parse(JSON.stringify(store));Object.keys(st).forEach(k=>{if(/^potential\//.test(k)&&String(st[k].plant_code)==='1013')delete st[k]});
const {page,errs}=await open(browser,{store:st,today:'2026-10-23'});await page.waitForTimeout(5000);
await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(2500);
const pe=errs.filter(e=>/PAGEERROR/.test(e));
ok('D1: Overview opens with no page error when one branch has no target',pe.length===0&&/Branch rating/i.test(await page.innerText('body')),JSON.stringify(pe));
await page.click('[data-act="ox-open"][data-k="rating"]').catch(()=>{});await page.waitForTimeout(800);
const pe2=errs.filter(e=>/PAGEERROR/.test(e));
ok('D1: the all-branches rating table opens, with n/a for the branch without a target',pe2.length===0&&(await page.$('#ox-rating table'))!=null,JSON.stringify(pe2));
const r1=await page.evaluate(()=>{const R={rows:[{id:'1',name:'A',sh:1,sk:50,col:null,stk:5,ack:false},{id:'2',name:'B',sh:1,sk:null,col:70,stk:7,ck:true},{id:'3',name:'C',sh:1,sk:20,col:60,stk:9}],basis:'ach'};window.__dbg.ratingCalc(R.rows);return window.__dbg.oxRatingTable(R)});
ok('D1: table renders null sales/collections/stock without throwing',/n\/a/.test(r1),'');
const sf=await page.evaluate(()=>window.__dbg.oxSafe?window.__dbg.oxSafe('X',()=>{throw new Error('boom')}):'');
ok('D1: a failing card is replaced by a notice, not a crash',/could not be drawn/.test(sf)&&/boom/.test(sf),sf.slice(0,80));
/* D4 */
const d4=await page.evaluate(()=>{const mk=ck=>{const R=[{id:'1',name:'A',sh:1,sk:5,col:5,stk:5,ck:ck},{id:'2',name:'B',sh:1,sk:6,col:6,stk:6}];window.__dbg.ratingCalc(R);return R[0]};const a=mk(true);return [/Check target/.test(window.__dbg.oxRatingRow(a,1,'ach')),/Check target/.test(window.__dbg.oxRatingRow(a,1,'qoq'))]});
ok('D4: "Check target" note only where Ach is the basis',d4[0]===true&&d4[1]===false,JSON.stringify(d4));
/* D5 */
ok('D5: sidebar shows v44',/\bv44\b/.test(await page.innerText('.side'))&&!/desk-v1\.0/.test(await page.innerText('.side')),'');
await page.evaluate(async()=>{for(const p of window.__dbg.S.plants.slice())await window.__desk.dset('plants/'+p.plant_code,Object.assign({},p,{_id:undefined,zone:''}))});await page.waitForTimeout(800);
/* D2 partial */
const p2=await page.evaluate(async()=>{const S=window.__dbg.S,DS=window.__dbg.DS,SEP='\u0001',c=window.__dbg.viewCtx(),ms=c.res.cur.filter(x=>x.frac>0).map(x=>x.ym).concat((c.res.prior||[]).filter(x=>x.frac>0).map(x=>x.ym));
  const ps=new Set();ms.forEach(m=>{const ce=S.cells['INV_'+m];if(ce)Object.keys(ce.plants).forEach(p=>ps.add(p))});const L=Array.from(ps).sort();const half=L.slice(0,Math.ceil(L.length/2));
  ms.forEach(m=>{const ce=S.cells['INV_'+m];if(!ce)return;Object.keys(ce.plants).forEach(p=>{if(half.includes(p)){ce.plants[p]=Object.assign({},ce.plants[p],{dimFrom:1});DS.dim[p+SEP+m]={at:ce.plants[p].at,rows:[['1.00 MM','Brand A','Laminate','',5,100,100,1000],['0.80 MM','Brand B','Laminate','',5,50,50,500]]}}else ce.plants[p]=Object.assign({},ce.plants[p],{dimFrom:undefined})})});
  Object.values(DS.dim).forEach(d=>d.rows.forEach(r=>{r[3]=''}));DS.dimBusy=true;DS.dimVer++;S.lastHtml='';return {n:L.length,half:half.length}});
await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(300);await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(1500);
const t=await page.innerText('body');
ok('D2: partial split says "Loaded plants only", names how many plants are missing, and labels shares as of the loaded plants',/Loaded plants only/.test(t)&&new RegExp((p2.n-p2.half)+' plants? (is|are) missing').test(t)&&/% of loaded plants/.test(t),JSON.stringify(p2)+' '+(t.match(/Partial[^\n]*/)||[''])[0]);
/* D3 */
ok('D3: while zone detail is being read the Zones card says "Reading zones", not "Zones not set"',/Reading zones from sales lines/.test(t)&&!/Zones not set/.test(t),'');
await page.evaluate(()=>{window.__dbg.DS.dimBusy=false;window.__dbg.S.lastHtml=''});
console.log(errs.filter(e=>/PAGEERROR/.test(e)).slice(0,3));
await browser.close();
