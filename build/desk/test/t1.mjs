import { chromium, open } from './run.mjs';
const browser = await chromium.launch();
const { page, errs } = await open(browser);
await page.waitForTimeout(1500);
console.log('title', await page.title());
console.log((await page.innerText('body')).slice(0, 400));
console.log(errs);
await browser.close();
