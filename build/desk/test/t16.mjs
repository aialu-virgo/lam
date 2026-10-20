import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
for(const email of ['data@virgoasia.com','mgmt@demo']){
const {page,errs}=await open(browser,{store,viewer:{email,name:email}});await page.waitForTimeout(2500);
await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(3500);
const step=async(sel,label)=>{const el=page.locator(sel).first();const n=await el.count();if(!n){console.log(email,label,'NO ELEMENT');return false}await el.click();await page.waitForTimeout(1800);const t=await page.innerText('#pg');console.log(email,label,'->',(t.match(/LEVEL \d[^\n]*/i)||[''])[0],'| crumbs:',(await page.locator('.crumbs .chip').allInnerTexts()).join(' > '));return true};
await step('tr[data-act="dd"][data-k="plant"]','click plant row');
await step('tr[data-act="dd"][data-k="sp"]','click salesperson row');
await step('tr[data-act="dd"][data-k="cust"]','click customer row');
const t=await page.innerText('#pg');console.log(t.slice(t.search(/LEVEL 4/i),t.search(/LEVEL 4/i)+500).replace(/\n+/g,' | '));console.log(email,'docs shown:',/B1 · INV/.test(t),(t.match(/DEMO-\d+/)||[''])[0]);
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));
await page.context().close();}
await browser.close();
