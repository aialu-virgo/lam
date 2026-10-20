import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const waitToast=(page,re)=>page.waitForFunction((s)=>document.querySelector('#toast')&&new RegExp(s).test(document.querySelector('#toast').textContent),re,{timeout:240000});
/* A: fresh store, demo load then clear */
{const {page}=await open(browser);await page.waitForTimeout(800);await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(500);
 await page.click('[data-act="demo-load"]');await waitToast(page,'Demo data loaded');await page.waitForTimeout(3000);
 const a=await page.evaluate(()=>{const s=window.__mockStore(),d=window.__dbg;return {sm:s['salesmaster/main']&&s['salesmaster/main'].demo,im:s['itemmeta/main']&&s['itemmeta/main'].demo,rate:d.matchStats().rate,n:d.S.salesMaster&&d.S.salesMaster.n,ver:document.querySelector('.brand small').textContent}});
 ok('header says desk-v1.0',a.ver==='desk-v1.0',a.ver);
 ok('demo loads demo sales and item masters',a.sm===true&&a.im===true,JSON.stringify(a));
 ok('match rate meaningful (6 of 7 names)',a.rate>80&&a.rate<100,a.rate);
 await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(500);await page.click('[data-t="semp"]');await page.waitForTimeout(500);
 const t=await page.innerText('#pg');ok('Admin shows people and match rate',/people/.test(t)&&/B1 names matched/.test(t),'');
 await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(500);await page.click('[data-act="demo-clear"]');await waitToast(page,'Demo data cleared');await page.waitForTimeout(1500);
 const b=await page.evaluate(()=>{const s=window.__mockStore();return Object.keys(s).filter(k=>/^(salesmaster|itemmeta|items)\//.test(k)||(k.startsWith('uploads/')&&s[k].entity))});
 ok('Clear demo removes the demo masters',b.length===0,b.join());
 await page.context().close()}
/* B: real masters present, demo load must leave them alone, clear must keep them */
{const m=JSON.parse(fs.readFileSync(SP+'store-masters.json'));const keep={};Object.keys(m).forEach(k=>{if(/^(salesmaster|itemmeta|items)\//.test(k))keep[k]=JSON.parse(JSON.stringify(m[k]))});
 Object.values(keep).forEach(v=>{delete v.demo});
 const {page}=await open(browser,{store:JSON.parse(JSON.stringify(keep))});await page.waitForTimeout(1500);
 const before=JSON.stringify(Object.fromEntries(Object.entries(keep).map(([k,v])=>[k,v.at])));
 await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(500);await page.click('[data-act="demo-load"]');await waitToast(page,'Demo data loaded');await page.waitForTimeout(2500);
 const s1=await page.evaluate(()=>{const s=window.__mockStore();return Object.fromEntries(Object.keys(s).filter(k=>/^(salesmaster|itemmeta|items)\//.test(k)).map(k=>[k,[s[k].at,!!s[k].demo]]))});
 ok('real masters untouched by Load demo data',Object.keys(keep).every(k=>s1[k]&&!s1[k][1]&&s1[k][0]===keep[k].at),JSON.stringify(s1).slice(0,200));
 await page.click('[data-act="demo-clear"]');await waitToast(page,'Demo data cleared');await page.waitForTimeout(1500);
 const s2=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^(salesmaster|itemmeta|items)\//.test(k)));
 ok('real masters survive Clear demo',Object.keys(keep).every(k=>s2.indexOf(k)>=0),s2.join());
 await page.context().close()}
console.log(res.join('\n'));await browser.close();
