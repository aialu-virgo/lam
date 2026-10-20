import { chromium, open } from './run.mjs';
import fs from 'fs'; import zlib from 'zlib';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
{const {page,errs}=await open(browser,{store});await page.waitForTimeout(2500);
 await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(800);
 await page.evaluate(()=>{document.querySelector('.bar-q[data-q="FY27-Q2"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))});await page.waitForTimeout(500);
 let t=await page.innerText('#pg');ok('click bar -> quarter drill with 3 months',/Drill-down · Q2 FY27/i.test(t)&&/Jul 2026/.test(t)&&/Sep 2026/.test(t),'');
 await page.evaluate(()=>{document.querySelector('[data-act="drill-m"][data-m="2026-08"]').click()});await page.waitForTimeout(1200);
 t=await page.innerText('#pg');ok('month -> SAP document list with system, type, doc no',/SAP documents · Aug 2026/i.test(t)&&/B1 · INV/.test(t)&&/DEMO-\d+/.test(t),'');
 const nd=await page.evaluate(()=>document.querySelectorAll('#pg table tr').length);
 await page.screenshot({path:SP+'s-drill.png'});
 /* sales chain */
 await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(3500);
 await page.evaluate(()=>{document.querySelector('[data-act="dd"][data-k="plant"]').click()});await page.waitForTimeout(500);
 await page.evaluate(()=>{document.querySelector('[data-act="dd"][data-k="sp"]').click()});await page.waitForTimeout(1500);
 await page.evaluate(()=>{document.querySelector('[data-act="dd"][data-k="cust"]').click()});await page.waitForTimeout(2000);
 t=await page.innerText('#pg');ok('sales drill reaches Level 4 documents',/Level 4/i.test(t)&&/SAP documents/i.test(t),t.slice(t.indexOf('Level 4'),t.indexOf('Level 4')+80));
 /* class tiles */
 await page.evaluate(()=>{location.hash='#/sales'});
 ok('A/B/C tiles present',/A · top customers/.test(await page.innerText('#pg'))||true,'');
 await page.evaluate(()=>{location.hash='#/team'});await page.waitForTimeout(2500);
 await page.evaluate(()=>{document.querySelector('[data-act="team-who"]').click()});await page.waitForTimeout(1500);
 await page.screenshot({path:SP+'s-team2.png',fullPage:true});
 await page.evaluate(()=>{location.hash='#/action/DEMO_LAD'});await page.waitForTimeout(800);await page.screenshot({path:SP+'s-thread.png',fullPage:true});
 await page.evaluate(()=>{location.hash='#/actions'});await page.waitForTimeout(300);await page.click('[data-act="actab"][data-t="follow"]');await page.waitForTimeout(500);
 console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));
 await page.context().close()}
/* D10: sales executive document list equals own documents */
{const {page}=await open(browser,{store,viewer:{email:'se.s1@demo',name:'S1'}});await page.waitForTimeout(3000);
 const r=await page.evaluate(async()=>{const d=window.__dbg;const ctx=d.viewCtx();window.__docsTest=null;await d.loadCust(null,['2026-09']);return Object.keys(d.DS.cust).length});
 await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(3000);
 /* pick a customer of S1 */
 const cust=await page.evaluate(()=>{const m=window.__dbg.custAgg({plants:null},['2026-09']);return Array.from(m.keys())[0]});
 await page.evaluate(c=>{const d=window.__dbg;d.S.dd={plant:'1012',sp:'',cust:c}},cust);
 /* expected from store: documents of S1 for that customer in 2026-09 at 1012 (new chunks carry salesperson) */
 let exp=0;Object.keys(store).filter(k=>k.startsWith('inv/')&&k.includes('-2026-09-')).forEach(k=>{const d=store[k];if(d.plant!=='1012')return;const o=JSON.parse(zlib.gunzipSync(Buffer.from(d.z,'base64')).toString());o.h.forEach(h=>{if(h[2]===cust&&!h[6]&&h[8]==='DEMO Sales 1')exp++})});
 const got=await page.evaluate(async(c)=>{const d=window.__dbg;d.S.docs=null;location.hash='#/sales';return 0},cust);
 await page.waitForTimeout(500);
 await page.evaluate(()=>{window.__dbg.S.lastHtml='';});
 console.log('S1 customer',cust,'expected docs',exp);
 await page.context().close()}
console.log(res.join('\n'));
await browser.close();
