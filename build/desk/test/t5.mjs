import { chromium, open } from './run.mjs';
import fs from 'fs'; import zlib from 'zlib';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
/* independent expectation from the stored roll-ups */
function expected(plants,sp,months){let t=0;Object.keys(store).filter(k=>k.startsWith('roll/')).forEach(k=>{const d=store[k];if(plants&&!plants.includes(d.plant))return;if(months&&!months.includes(d.ym))return;JSON.parse(zlib.gunzipSync(Buffer.from(d.z,'base64')).toString()).forEach(r=>{if(r[2])return;if(sp&&r[1]!==sp)return;t+=r[7]})});return Math.round(t)}
const q2=['2026-07','2026-08','2026-09'];
const cases=[['super@demo','Super admin',null,null],['data@virgoasia.com','Super admin',null,null],['mgmt@demo','Management / HO',null,null],['hod.sales@demo','HOD',null,null],['bm.a@demo','Branch / depot manager',['1012'],null],['se.s1@demo','Sales executive',null,'DEMO Sales 1'],['coord.a@demo','Coordinator (sales / CRR)',['1012'],null],['acc.ab@demo','Accounts',['1012','1013'],null],['plant.b@demo','Plant',['1013'],null]];
for(const [email,role,plants,sp] of cases){
  const {page,errs}=await open(browser,{store,viewer:{email,name:email}});
  await page.waitForTimeout(2500);
  const got=await page.evaluate((q2)=>{const d=window.__dbg;const u=d.effUser();return {role:u&&u.role,total:Math.round(d.sumF({plants:null},q2).n),plants:d.DS.plants.join(','),nav:[...document.querySelectorAll('.side .nav .nl')].map(x=>x.textContent).join(',')}},q2);
  const exp=expected(plants,sp,q2);
  ok(`scope ${email} role`,got.role===role,got.role);
  ok(`scope ${email} Q2 total`,got.total===exp,`got ${got.total} exp ${exp}`);
  ok(`scope ${email} plants`,plants?got.plants===plants.join(','):got.plants.split(',').length===4,got.plants);
  console.log(email,'nav:',got.nav);
  if(errs.filter(e=>!/ERR_FAILED/.test(e)).length)console.log('ERRS',errs);
  await page.context().close();
}
/* stranger */
{const {page}=await open(browser,{store,viewer:{email:'stranger@demo',name:'S'}});await page.waitForTimeout(1500);const t=await page.innerText('body');ok('stranger sees only ask-your-admin',/Ask your admin for access/.test(t)&&!/Overview/.test(t.replace('Ask your admin for access','')),t.slice(0,80).replace(/\n/g,' '));await page.context().close()}
/* branch manager cannot see K3/K4 names even in DOM */
{const {page}=await open(browser,{store,viewer:{email:'bm.a@demo',name:'BM'}});await page.waitForTimeout(2500);
 await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(2500);
 const t=await page.innerText('#pg');ok('bm.a sales page lists only plant 1012',/1012/.test(t)&&!/DEMO plant 1013|DEMO plant 1001|DEMO plant 1011/.test(t),'');
 await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(1500);
 const t2=await page.innerText('#pg');ok('bm.a overview: no other plant names',!/DEMO plant 1013|DEMO plant 1001|DEMO plant 1011/.test(t2),'');
 await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(1500);
 const t3=await page.innerText('#pg');ok('bm.a admin shows plans only, no users tab',!/Users/.test(t3.slice(0,200)),t3.slice(0,100).replace(/\n/g,' '));
 await page.context().close()}
{const {page}=await open(browser,{store,viewer:{email:'se.s1@demo',name:'S1'}});await page.waitForTimeout(2500);
 const nav=await page.evaluate(()=>[...document.querySelectorAll('.side .nav .nl')].map(x=>x.textContent).join(','));ok('se.s1 nav has no Admin/Assign',!/Admin|Intake/.test(nav),nav);
 await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(800);const t=await page.innerText('#pg');ok('se.s1 admin by URL denied',/Ask your admin/.test(t),'');
 await page.context().close()}
console.log(res.join('\n'));
await browser.close();
