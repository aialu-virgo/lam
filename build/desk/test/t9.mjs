import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const {page}=await open(browser,{store,viewer:{email:'bm.a@demo',name:'BM'}});await page.waitForTimeout(2500);
await page.evaluate(()=>{location.hash='#/targets'});await page.waitForTimeout(900);
console.log((await page.innerText('#pg')).slice(0,1500));
await browser.close();
