import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();
for(const [w,h,th,n] of [[1440,900,'light','red-1440-light'],[360,740,'dark','red-360-dark']]){
const {page,errs}=await open(browser,{store,viewer:{email:'data@virgoasia.com',name:'V'},size:{width:w,height:h}});await page.waitForTimeout(4000);
await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(2500);
await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),th);await page.waitForTimeout(500);
await page.screenshot({path:SP+'theme/'+n+'.png',fullPage:w<500});
console.log(n,await page.evaluate(()=>document.documentElement.scrollWidth+'/'+innerWidth),errs.filter(e=>!/ERR_FAILED/.test(e)));await page.context().close()}
await browser.close();
