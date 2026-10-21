import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
/* v0.1 data (no roll-ups, no 9th doc-index field) must still be read */
{const st=JSON.parse(JSON.stringify(store));Object.keys(st).forEach(k=>{if(k.startsWith('roll/')||k.startsWith('actions/')||k.startsWith('followups/'))delete st[k]});
 const n0=Object.keys(st).length;
 const {page,errs}=await open(browser,{store:st});await page.waitForTimeout(14000);
 const r=await page.evaluate(()=>({rolls:Object.keys(window.__mockStore()).filter(k=>k.startsWith('roll/')).length,tot:Math.round(window.__dbg.sumF({plants:null},window.__dbg.qMonths('FY27-Q2')).n),status:window.__dbg.DS.status}));
 ok('v0.1 data: roll-ups rebuilt from stored chunks',r.rolls===129+3&&r.tot===28224877,JSON.stringify(r));
 const inv=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>k.startsWith('inv/')).length);ok('existing inv chunks untouched',inv===132,String(inv));
 await page.context().close();}
/* empty database: ships empty */
{const {page,errs}=await open(browser,{store:{}});await page.waitForTimeout(2000);
 const pages=['overview','sales','receivables','inventory','today','actions','team'];const out=[];
 for(const p of pages){await page.evaluate(x=>{location.hash='#/'+x},p);await page.waitForTimeout(500);out.push(p+': '+(await page.innerText('#pg')).replace(/\n+/g,' ').slice(0,110))}
 console.log(out.join('\n'));
 const t=await page.innerText('#pg');ok('empty: no error banners',!errs.filter(e=>!/ERR_FAILED/.test(e)).length,JSON.stringify(errs.filter(e=>!/ERR_FAILED/.test(e))));
 await page.evaluate(()=>{location.hash='#/receivables'});await page.waitForTimeout(400);
 const rv=await page.innerText('#pg');ok('Receivables empty state names exports',/Receivable export needed/.test(rv)&&/Collection export needed/.test(rv),'');
 await page.evaluate(()=>{location.hash='#/inventory'});await page.waitForTimeout(400);
 ok('Inventory empty state names export',/Stock export needed/.test(await page.innerText('#pg')),'');
 await page.context().close();}
/* phasing upload */
{const {page}=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email:'data@virgoasia.com'}});await page.waitForTimeout(2500);
 await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(400);await page.click('[data-t="potential"]');await page.waitForTimeout(300);
 const csv='fy_quarter,plant_code,product_group,customer_segment,month_in_quarter,phasing_pct\nFY27-Q3,1012,Laminate,Dealer,1,30\nFY27-Q3,1012,Laminate,Dealer,2,30\nFY27-Q3,1012,Laminate,Dealer,3,40\n';
 fs.writeFileSync(SP+'ph.csv',csv);
 await page.setInputFiles('#up-ph',SP+'ph.csv');await page.waitForTimeout(1200);
 const r=await page.evaluate(()=>{const d=window.__dbg;const P=d.planQ({plant:'1012',group:'Laminate'},'FY27-Q3');return {m:P.months.map(x=>Math.round(x)),tgt:Math.round(P.tgt),ph:d.S.phasing.length}});
 ok('phasing 30/30/40: months sum to the quarter target, month 3 takes the remainder',r.ph===1&&r.m[0]+r.m[1]+r.m[2]-r.tgt<=1&&r.m[2]>r.m[0]&&Math.abs(r.m[0]-r.m[1])<=1,JSON.stringify(r));
 await page.context().close();}
console.log(res.join('\n'));
await browser.close();
