import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const {page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email:'data@virgoasia.com',name:'V'}});await page.waitForTimeout(4000);
await page.evaluate(()=>{location.hash='#/today'});await page.waitForTimeout(1500);
const aud=Object.keys(store).filter(k=>k.startsWith('audit/')).length;
ok('demo load wrote audit entries',aud>=2,aud);
let t=await page.innerText('#pg');ok('clean demo store: no integrity alert',!/Integrity alert/.test(t),'');
/* forged writes straight into the database */
await page.evaluate(async()=>{const db=await window.claude.use('db');const p=await db.doc('periods/FY27-Q2').get();const d=p.data();d.plan_locked=false;await db.doc('periods/FY27-Q2').set(d);
  const c=await db.doc('cells/INV_2026-04').get();const cd=c.data();const pl=Object.keys(cd.plants)[0];cd.plants[pl].at=new Date().toISOString();await db.doc('cells/INV_2026-04').set(cd);});
await page.waitForTimeout(2500);
t=await page.innerText('#pg');
ok('forged unlock raises an integrity alert on Super admin Today',/Integrity alert/.test(t)&&/Q2 FY27/.test(t),t.match(/Integrity alert[^\n]*/));
ok('forged closed-quarter data change raises an alert',/invoice data for plant/.test(t),'');
await page.screenshot({path:SP+'s-integrity.png',fullPage:true});
await page.click('[data-act="integ-accept"]');await page.waitForTimeout(2500);
t=await page.innerText('#pg');ok('accepting logs it and clears the alert',!/Integrity alert/.test(t),'');
const acc=await page.evaluate(()=>Object.values(window.__mockStore()).filter(v=>v.event==='integrity accepted').length);ok('acceptance written to audit',acc===1,acc);
/* a non-Super viewer never sees it */
{const {page:p2}=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email:'mgmt@demo',name:'M'}});await p2.waitForTimeout(3500);await p2.evaluate(()=>{location.hash='#/today'});await p2.waitForTimeout(800);
 await p2.evaluate(async()=>{const db=await window.claude.use('db');const p=await db.doc('periods/FY27-Q2').get();const d=p.data();d.plan_locked=false;await db.doc('periods/FY27-Q2').set(d)});await p2.waitForTimeout(1500);
 ok('management user does not see the alert',!/Integrity alert/.test(await p2.innerText('#pg')),'')}
/* legit close/reopen through the page leaves no alert */
console.log(res.join('\n'));console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));await browser.close();
