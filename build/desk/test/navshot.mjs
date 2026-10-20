import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();
for(const [w,h,n] of [[1440,900,'ours-nav'],[360,740,'ours-nav-360']]){
const {page}=await open(browser,{store,viewer:{email:'data@virgoasia.com',name:'V'},size:{width:w,height:h}});await page.waitForTimeout(4000);
await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(2000);
await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));await page.waitForTimeout(400);
await page.screenshot({path:SP+'theme/'+n+'.png'});
console.log(n,await page.evaluate(()=>document.documentElement.scrollWidth+'/'+innerWidth));await page.context().close()}
await browser.close();
