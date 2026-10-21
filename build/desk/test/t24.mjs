import { chromium, open } from './run.mjs';
import fs from 'fs'; import zlib from 'zlib';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-masters.json'));
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
/* duplicate names: two people called DEMO Sales 4, told apart by branch suffix */
const doc=store['salesmaster/main'];const arr=JSON.parse(zlib.gunzipSync(Buffer.from(doc.z,'base64')).toString());
const s4=arr.find(a=>a[1]==='DEMO Sales 4');s4[4]='DEMO plant 1012';
arr.push(['E-DMX/1','DEMO Sales 4','Zone 2','1013','DEMO plant 1013','Sale Executive','Sales executive','','']);
doc.z=zlib.gzipSync(Buffer.from(JSON.stringify(arr))).toString('base64');doc.n=arr.length;
const codeS1=arr.find(a=>a[1]==='DEMO Sales 1')[0];
store['users/se_s1_demo'].sales_employee_code=codeS1;
const browser = await chromium.launch();
{const {page}=await open(browser,{store,viewer:{email:'data@virgoasia.com'}});await page.waitForTimeout(3000);
 const r=await page.evaluate(()=>{const d=window.__dbg;const m=n=>{const x=d.spMatch(n);return x?(x.ambiguous?'AMBIG':x.code+'/'+x.how):null};return {exact:m('DEMO Sales 2'),caseSpace:m('demo  sales 2'),suffix:m('DEMO Sales 3 - DEMO plant 1012'),dup:m('DEMO Sales 4'),dupSuffix12:m('DEMO Sales 4 - DEMO plant 1012'),dupSuffix13:m('DEMO Sales 4 - DEMO plant 1013'),none:m('DEMO Sales 7'),canon:d.spCanon('DEMO Sales 3 - DEMO plant 1012')}});
 console.log(JSON.stringify(r));
 ok('match: exact, case/space, suffix removed',/E-DM/.test(r.exact)&&r.exact.endsWith('exact')&&r.caseSpace===r.exact&&/suffix removed/.test(r.suffix),JSON.stringify([r.exact,r.caseSpace,r.suffix]));
 ok('match: duplicate name ambiguous without suffix, settled by branch suffix, unmatched stays unmatched',r.dup==='AMBIG'&&/E-DM/.test(r.dupSuffix12)&&r.dupSuffix13.startsWith('E-DMX/1')&&r.none===null,JSON.stringify([r.dup,r.dupSuffix12,r.dupSuffix13,r.none]));
 const fz=await page.evaluate(()=>['D. Sales 1','DEMO Saels 1','Demo Sale 1'].map(n=>window.__dbg.spMatch(n)));
 ok('fuzzy names (initials, close spelling) never match automatically, so no scope can widen',fz.every(x=>x===null),JSON.stringify(fz));
 await page.context().close()}
{const {page}=await open(browser,{store,viewer:{email:'se.s1@demo',name:'S1'}});await page.waitForTimeout(3500);
 const tot=await page.evaluate(()=>Math.round(window.__dbg.sumF({plants:null},window.__dbg.qMonths('FY27-Q2')).n));
 ok('sales executive with the employee code sees only own sales (5037172)',tot===5037172/* DEMO Sales 1 only: equals the sum of that name in the stored chunks (fixture regenerated for D28) */,String(tot));
 await page.context().close()}
{const {page}=await open(browser,{store,viewer:{email:'data@virgoasia.com'}});await page.waitForTimeout(2500);
 await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(400);await page.click('[data-t="semp"]');await page.waitForTimeout(500);
 const t=await page.innerText('#pg');ok('semp tab shows match rate and the unmatched list with download',/B1 names matched/i.test(t)&&/Unmatched B1 salesperson names/i.test(t)&&/Download unmatched list/.test(t),'');
 await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(500);
 await page.evaluate(()=>{document.querySelector('[data-act="hist-rej"]')&&document.querySelector('[data-act="hist-rej"]').click()});await page.waitForTimeout(500);
 await page.context().close()}
console.log(res.join('\n'));
await browser.close();
