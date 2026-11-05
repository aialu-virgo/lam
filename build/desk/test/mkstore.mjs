import { chromium, open } from './run.mjs';import fs from 'fs';
const browser=await chromium.launch();
const {page}=await open(browser,{store:{}});await page.waitForTimeout(2500);
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(600);
await page.evaluate(()=>window.__dbg.demoLoad());
await page.waitForFunction(()=>window.__dbg.S.uploads.length>=2,null,{timeout:250000});await page.waitForTimeout(10000);
fs.writeFileSync(process.argv[2],JSON.stringify(await page.evaluate(()=>window.__mockStore())));
await browser.close();
