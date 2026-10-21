import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const browser = await chromium.launch();
const { page, errs } = await open(browser);
await page.waitForTimeout(800);
await page.evaluate(()=>{location.hash='#/intake'});
await page.waitForTimeout(500);
await page.click('[data-act="demo-load"]');
const t0=Date.now();
await page.waitForFunction(()=>document.querySelector('#toast')&&/Demo data loaded/.test(document.querySelector('#toast').textContent),null,{timeout:240000}).catch(e=>console.log('timeout',e.message));
console.log('demo load ms',Date.now()-t0);
await page.waitForTimeout(3000);
const store=await page.evaluate(()=>window.__mockStore());
fs.writeFileSync(SP+'store-demo.json',JSON.stringify(store));
const cols={};Object.keys(store).forEach(k=>{const c=k.split('/')[0];cols[c]=(cols[c]||0)+1});
console.log(cols);
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));
for (const pg of ['overview','sales','today','actions','team','receivables','inventory']) {
  await page.evaluate(p=>{location.hash='#/'+p},pg);
  await page.waitForTimeout(2500);
  const txt=await page.innerText('#pg');
  console.log('=====',pg,txt.length,txt.slice(0,300).replace(/\n+/g,' | '));
  await page.screenshot({path:SP+'s-'+pg+'.png',fullPage:true});
}
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));
await browser.close();
