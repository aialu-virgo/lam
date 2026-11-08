import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const go=async(page,h,w)=>{await page.evaluate(h=>{location.hash=h},h);await page.waitForTimeout(w||2200)};
const tx=async page=>(await page.innerText('#pg')).replace(/[ \t]+/g,' ');
const tile=(page,re)=>page.evaluate(src=>{const c=Array.from(document.querySelectorAll('#pg .ox-card')).find(c=>new RegExp(src).test(c.querySelector('h2').textContent));const b=c&&c.querySelector('.ox-tile-big');return b?b.textContent:null},re.source);
/* ===== demo store: targets, potential, collections, stock and receivables loaded ===== */
let {page,errs}=await open(browser,{store});await page.waitForTimeout(4000);
await go(page,'#/overview',3000);const ov=await tx(page);
const b=await page.evaluate(()=>[74.9,75,89.99,90,99.9,100,150].map(window.__desk.oxBand));
ok('bands: <75 Far behind, 75-<90 Behind, 90-<100 Watch, 100+ On target (edges 74.9/75/89.99/90/99.9/100)',JSON.stringify(b)==='[1,2,2,3,3,4,4]',JSON.stringify(b));
const chips=await page.evaluate(()=>Array.from(document.querySelectorAll('#pg .ox-chip.b1,#pg .ox-chip.b2,#pg .ox-chip.b3,#pg .ox-chip.b4')).map(e=>[+e.className.match(/\bb(\d)\b/)[1],e.textContent.trim()]));
const bad=chips.filter(([b,t])=>{const m=/(\d+(?:\.\d+)?)%/.exec(t);if(!m)return true;const a=+m[1],e=a>=100?4:a>=90?3:a>=75?2:1;return e!==b||!new RegExp(['','Far behind','Behind','Watch','On target'][b]).test(t)||!/[▼▲●]/.test(t)});
ok('every coloured chip: class, label, mark and the % agree (colour is never the only signal)',chips.length>=4&&!bad.length,chips.length+' chips, bad '+JSON.stringify(bad.slice(0,2)));
const bars=await page.evaluate(()=>Array.from(document.querySelectorAll('#pg .ox-grp')).map(g=>{const c=g.querySelector('.ox-chip[class*=" b"]'),f=g.querySelector('.ox-bul .f');return [c&&(c.className.match(/\bb(\d)\b/)||[])[1],f&&(f.className.match(/\bb(\d)\b/)||[])[1]]}));
ok('a group bar has the same band class as its chip',bars.length>=2&&bars.every(x=>x[0]&&x[0]===x[1]),JSON.stringify(bars));
ok('one legend on the page, no mock-up review control',(await page.$$('#pg .ox-banner')).length===1&&!/Review control|DRAFT|If targets and potential were loaded/.test(ov),'');
/* sheets first */
const secs=await page.evaluate(()=>({hero:document.querySelector('#pg .ox-hero-c h2').textContent,unit:document.querySelector('#pg .ox-big').textContent,h2:Array.from(document.querySelectorAll('#pg .ox-card h2')).map(h=>h.textContent)}));
ok('sheets first: hero is "Sales in sheets" in lakh sheets, trend and plant ranking are in sheets, ₹ is a smaller tile',/Sales in sheets/i.test(secs.hero)&&/lakh sheets/.test(secs.unit)&&secs.h2.some(t=>/lakh sheets/i.test(t))&&/thousand sheets/i.test(ov)&&secs.h2.some(t=>/^₹ value/.test(t)),JSON.stringify(secs.h2.slice(0,3)));
ok('nine figures on the hero (Potential, Target, Actual, Var, Ach %, Share %, Last Qtr, QoQ %, Trend)',(await page.$$('#pg .ox-nine div')).length===9,'');
/* equality with the existing pages */
const vals={big:await page.evaluate(()=>document.querySelector('#pg .ox-big').textContent),val:await tile(page,/^₹ value/),col:await tile(page,/K9/),stk:await tile(page,/K15/),rcv:await tile(page,/K10/)};
await go(page,'#/sales',3000);const sales=await tx(page);
const sk1=/K1 · (?:Invoiced|Net) sales[^₹]*(₹[\d.,]+ ?[A-Za-z]*)/i.exec(sales)||[];
ok('Overview ₹ tile equals the Sales page K1 value for the same scope and period',!!sk1[1]&&vals.val.replace(/\s+/g,' ').indexOf(sk1[1].trim().split(' ')[0])===0,vals.val+' vs '+sk1[1]);
const sh=await page.evaluate(()=>{const g=window.__desk;return g.figs({},g.viewCtx()).sh});
ok('Overview hero (lakh sheets) equals the sheets of the figures the Sales page uses',Math.abs(parseFloat(vals.big)*100000-sh)<=500&&sh>0,vals.big+' vs '+Math.round(sh));
await go(page,'#/receivables',3000);const rcvT=await tx(page);
const k9=/K9 · COLLECTIONS[^₹]*(₹[\d.,]+ ?[A-Za-z]*)/i.exec(rcvT)||[],k10=/K10 · OVERDUE SHARE[^%]*?(\d+\.\d)%/i.exec(rcvT)||[];
ok('Overview collections tile equals the Receivables page K9 value',!!k9[1]&&String(vals.col||'').replace(/\s+/g,' ').indexOf(k9[1].trim().split(' ')[0])===0,vals.col+' vs '+k9[1]);
ok('Overview K10 overdue share equals the Receivables page K10',!!k10[1]&&String(vals.rcv||'').indexOf(k10[1]+'%')===0,vals.rcv+' vs '+k10[1]);
await go(page,'#/inventory',3000);const invT=await tx(page);const k15=/K15 · STOCK DAYS\s*([\d.]+) d/i.exec(invT)||[];
ok('Overview stock days equals the Inventory page K15 (rounded)',!!k15[1]&&parseInt(vals.stk)===Math.round(+k15[1]),vals.stk+' vs '+k15[1]);
/* detail tables behind Table links */
await go(page,'#/overview',2500);
ok('detail tables are closed by default (no table on the page)',(await page.$$('#pg table')).length===0,'');
await page.click('#pg .ox-sm .ox-drill[data-k="group"]');await page.waitForTimeout(800);
const t1=await tx(page);ok('"Table ›" opens the product-group table with its existing columns',/PRODUCT GROUP/i.test(t1)&&/Potential/.test(t1)&&/Share %/.test(t1)&&/QoQ %/.test(t1)&&(await page.$$('#pg table')).length>=1,'');
ok('K7 is off the Overview and the alert card is gone (alerts are in Today)',!/K7 · New customers/i.test(t1)&&!/Alerts · tap to open/i.test(t1),'');
/* 360 px, both themes */
for(const scheme of ['light','dark']){const c=await open(browser,{store,size:{width:360,height:800},scheme});await c.page.waitForTimeout(3500);await go(c.page,'#/overview',3000);const w=await c.page.evaluate(()=>document.documentElement.scrollWidth);ok('360 px '+scheme+': no horizontal scroll on the Overview',w<=360,String(w));await c.ctx.close()}
/* role scope: a plant user sees only the own plant */
const pv=await open(browser,{store,viewer:{email:'plant.b@demo'}});await pv.page.waitForTimeout(3500);await go(pv.page,'#/overview',3000);
const pr=await pv.page.evaluate(()=>({rows:document.querySelectorAll('#pg .ox-rk').length,today:document.querySelectorAll('#pg .ox-act').length,n:window.__desk.viewCtx().plants.size}));
ok('row-level access: a plant user has only own plant(s) in scope and at most one ranking row per plant',pr.n>=1&&pr.n<=2&&pr.rows<=pr.n,JSON.stringify(pr));
ok('the Today panel never shows more than 3 actions',pr.today<=3,String(pr.today));
await pv.ctx.close();
/* ===== not loaded: no targets, potential, collections, stock, receivables or credit notes ===== */
const s2=JSON.parse(JSON.stringify(store));Object.keys(s2).forEach(k=>{if(/^(potential|phasing|collections|receivables|stock|creditnotes)\//.test(k))delete s2[k]});
const n=await open(browser,{store:s2});await n.page.waitForTimeout(4000);await go(n.page,'#/overview',3000);const nt=await tx(n.page);
ok('not loaded: hero says target and potential not loaded; the nine figures show "not loaded", never 0',/Target and potential not loaded/.test(nt)&&(nt.match(/not loaded/g)||[]).length>=8&&!/Ach % 0\.0/.test(nt),(nt.match(/not loaded/g)||[]).length+'');
ok('not loaded: K9, K15, K10 show their dashed "not loaded" panels',(await n.page.$$('#pg .ox-card .ox-empty')).length>=3&&/No receivables file yet/.test(nt)&&/No stock file yet/.test(nt)&&/No receipts file/.test(nt),'');
ok('not loaded: ranking says it needs targets; the answer strip says no Ach % yet',/Ranking needs targets/.test(nt)&&/no Ach % yet/.test(nt),'');
ok('not loaded: the basis reads Invoiced (credit notes not loaded)',/Basis: Invoiced sales/.test(nt),'');
await n.ctx.close();
const s3=JSON.parse(JSON.stringify(store));Object.keys(s3).forEach(k=>{if(/^collections\//.test(k))delete s3[k].plan});
const np=await open(browser,{store:s3});await np.page.waitForTimeout(4000);await go(np.page,'#/overview',3000);const npt=await tx(np.page);
ok('collections tile shows collected ÷ invoiced only as a labelled ratio when there is no collection plan',/Bar = collected ÷ invoiced/.test(npt)&&/a ratio, not an achievement/.test(npt)&&/Collection plan: not loaded/.test(npt),'');
ok('with a collection plan the tile shows Ach % against the plan in a band colour',/of plan/.test(ov)&&/K9 · Collections/i.test(ov),'');
await np.ctx.close();

/* ===== D53 ===== */
/* D3: a chip never shows a number that belongs to the next band */
const chipsTxt=await page.evaluate(()=>[74.96,89.96,99.96,75,90,100,89.99].map(v=>window.__desk.oxBandChip(v).replace(/<[^>]+>/g,'')));
ok('chips truncate: 74.96 Far behind 74.9, 89.96 Behind 89.9, 99.96 Watch 99.9 (never the next band\'s number)',/Far behind 74\.9%/.test(chipsTxt[0])&&/Behind 89\.9%/.test(chipsTxt[1])&&/Watch 99\.9%/.test(chipsTxt[2])&&/Behind 75\.0%/.test(chipsTxt[3])&&/Watch 90\.0%/.test(chipsTxt[4])&&/On target 100\.0%/.test(chipsTxt[5])&&/Behind 89\.9%/.test(chipsTxt[6]),JSON.stringify(chipsTxt));
/* D1: one plant in scope: listed once */
const bm=await open(browser,{store,viewer:{email:'bm.a@demo'}});await bm.page.waitForTimeout(3500);await go(bm.page,'#/overview',3000);
const rkNames=await bm.page.evaluate(()=>({n:window.__desk.viewCtx().plants.size,names:Array.from(document.querySelectorAll('#pg .ox-rk .nm')).map(e=>e.textContent)}));
ok('one plant in scope (bm.a@demo): "Furthest behind and ahead" lists it at most once',rkNames.n===1&&rkNames.names.length<=1&&new Set(rkNames.names).size===rkNames.names.length,JSON.stringify(rkNames));
await bm.ctx.close();
const all=await page.evaluate(()=>{const n=Array.from(document.querySelectorAll('#pg .ox-rk .nm')).map(e=>e.textContent);return {n:n,u:new Set(n).size}});
ok('with all plants: no plant appears twice in the ranking',all.n.length===all.u,JSON.stringify(all));
/* D2: every Table > opens the table that matches its own visual and unit */
const links=await page.evaluate(()=>Array.from(document.querySelectorAll('#pg .ox-drill[data-act="ox-open"]')).map(b=>[b.closest('.ox-card').querySelector('h2').textContent.replace(/Table ›|Trend ›/g,'').trim().slice(0,40),b.getAttribute('data-k')]));
const expect=[[/^K1 ·/i,'groupsh',/Lakh sheets/i,/Potential/i],[/^₹ value/i,'group',/₹/i,/Product group/i],[/^₹ value/i,'trendrs',/Quarters since/i,/Sales/i],[/^Quarterly trend/i,'trendsh',/Lakh sheets/i,/Target[^]*Actual[^]*Var[^]*Ach %[^]*QoQ %/i],[/^Product group mix/i,'groupsh',/Lakh sheets/i,/Share %/i],[/^Zones and plants/i,'branchsh',/Lakh sheets/i,/Zone \/ plant/i]];
const seen=[];
for(const [title,k] of links){
  const ex=expect.find(e=>e[0].test(title)&&e[1]===k);
  if(!ex){seen.push([title.slice(0,12),k,'link']);continue}
  await go(page,'#/overview',1800);
  await page.evaluate(([t,k])=>{const b=Array.from(document.querySelectorAll('#pg .ox-drill[data-act="ox-open"]')).find(b=>b.closest('.ox-card').querySelector('h2').textContent.trim().indexOf(t)===0&&b.getAttribute('data-k')===k);b.click()},[title,k]);await page.waitForTimeout(900);
  const sec=await page.evaluate(k=>{const e=document.getElementById('ox-'+k);return e?e.innerText:''},ex[1]);
  seen.push([title.slice(0,12),k,ex[2].test(sec)&&ex[3].test(sec)]);
}
ok('every "Table >" on a sheets visual opens a lakh-sheets table (K1, trend, group mix, zones/plants); the ₹ tile opens the ₹ table',seen.filter(x=>x[2]===true||x[2]===false).length>=6&&seen.filter(x=>x[2]===true||x[2]===false).every(x=>x[2]===true),JSON.stringify(seen));
for(const [t,hash] of [['Collections','#/receivables'],['Stock','#/inventory'],['Overdue','#/receivables']]){
  await go(page,'#/overview',1800);
  const has=await page.evaluate(t=>{const b=Array.from(document.querySelectorAll('#pg .ox-drill[data-act="ox-open"]')).find(b=>b.closest('.ox-card').querySelector('h2').textContent.indexOf(t)>=0);if(!b)return false;b.click();return true},t);await page.waitForTimeout(900);
  ok('Table > on the '+t+' tile opens '+hash,has&&(await page.evaluate(()=>location.hash))===hash,'');
}
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
