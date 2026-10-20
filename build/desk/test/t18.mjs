import { chromium, open } from './run.mjs';
import fs from 'fs'; import zlib from 'zlib';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
/* stored index carries system, doc type, doc no, date */
const k=Object.keys(store).find(k=>k.startsWith('inv/B1-1012-2026-09-0'));const o=JSON.parse(zlib.gunzipSync(Buffer.from(store[k].z,'base64')).toString());
ok('stored document index row has doc type (10 fields) and chunk has system',o.h[0].length===10&&o.h[0][9]==='INV'&&store[k].sys==='B1',JSON.stringify(o.h[0]));
for(const email of ['data@virgoasia.com','mgmt@demo']){
 const {page}=await open(browser,{store,viewer:{email,name:email}});await page.waitForTimeout(2500);
 await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(1200);
 /* trend bar */
 await page.evaluate(()=>{const r=[...document.querySelectorAll('.bar-q')];r[r.length-3].dispatchEvent(new MouseEvent('click',{bubbles:true}))});await page.waitForTimeout(700);
 let crumbs=await page.locator('#drillp .crumbs .chip').allInnerTexts();ok(`${email} Overview bar: quarter drill with chips`,crumbs.length>=2&&await page.locator('#drillp').count()===1,crumbs.join(' > '));
 await page.locator('#drillp [data-act="drill-m"]').nth(1).click();await page.waitForTimeout(1500);
 crumbs=await page.locator('#drillp .crumbs .chip').allInnerTexts();
 const heads=await page.locator('#drillp table').nth(1).locator('thead th').allInnerTexts();
 const row=(await page.locator('#drillp table').nth(1).locator('tbody tr').first().innerText()).replace(/\s+/g,' ');
 ok(`${email} Overview: month -> documents with System, Doc type, Doc no, Date`,heads.slice(0,4).join(',').toUpperCase()==='SYSTEM,DOC TYPE,DOC NO,DATE'&&/^(B1|S4) INV DEMO-\d+ \d{4}-\d\d-\d\d/.test(row)&&crumbs.length>=4,heads.slice(0,4).join(',')+' | '+row.slice(0,60)+' | '+crumbs.join(' > '));
 /* branch chart bar */
 await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(800);
 await page.locator('.hb[data-act="ov-branch"]').first().click();await page.waitForTimeout(2500);
 const t=await page.innerText('#pg'),cr=await page.locator('.crumbs .chip').allInnerTexts();
 ok(`${email} Overview branch bar -> that branch's salesperson list`,/LEVEL 2 · SALESPERSON/i.test(t)&&cr.length>=2,cr.join(' > '));
 await page.locator('tr[data-act="dd"][data-k="sp"]').first().click();await page.waitForTimeout(1500);
 await page.locator('tr[data-act="dd"][data-k="cust"]').first().click();await page.waitForTimeout(2500);
 const hd=await page.locator('#pg table').last().locator('thead th').allInnerTexts();
 ok(`${email} Sales level 4 table has System, Doc type, Doc no, Date`,hd.slice(0,4).join(',').toUpperCase()==='SYSTEM,DOC TYPE,DOC NO,DATE',hd.join(','));
 /* sales trend bar + product group bar */
 await page.evaluate(()=>{S=0;location.hash='#/sales'});await page.waitForTimeout(1500);
 await page.evaluate(()=>{const r=[...document.querySelectorAll('.bar-q')];r[r.length-2].dispatchEvent(new MouseEvent('click',{bubbles:true}))});await page.waitForTimeout(600);
 ok(`${email} Sales bar -> quarter drill`,await page.locator('#drillp').count()===1,'');
 await page.locator('.hb[data-act="ov-group"]').first().click();await page.waitForTimeout(1200);
 ok(`${email} Sales group bar filters to that group`,/Clear filters/.test(await page.innerText('#pg')),'');
 /* scorecard bar (sales exec person) */
 await page.evaluate(()=>{location.hash='#/team'});await page.waitForTimeout(2000);
 await page.evaluate(()=>{[...document.querySelectorAll('[data-act="team-who"]')].find(r=>/Demo Sales 1/.test(r.innerText)).click()});await page.waitForTimeout(1500);
 await page.evaluate(()=>{const r=[...document.querySelectorAll('.bar-q')];r[r.length-2].dispatchEvent(new MouseEvent('click',{bubbles:true}))});await page.waitForTimeout(700);
 await page.locator('#drillp [data-act="drill-m"]').first().click();await page.waitForTimeout(1500);
 ok(`${email} Scorecard bar -> quarter -> month -> documents`,await page.locator('#drillp table').count()===2,'');
 await page.context().close();
}
console.log(res.join('\n'));
await browser.close();
