import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const {page,errs}=await open(browser,{store});await page.waitForTimeout(2500);
const out=[];
for(const pg of ['overview','sales','team'])for(const m of ['MTD','QTD','YTD','CUSTOM']){
  await page.evaluate(([p,m])=>{location.hash='#/'+p;window.__dbg.S.f.mode=m;window.__dbg.S.f.q='';window.__dbg.S.lastHtml='';},[pg,m]);
  await page.waitForTimeout(600);
  await page.evaluate(m=>{document.querySelector('[data-act="mode"][data-m="'+m+'"]').click()},m);
  await page.waitForTimeout(1500);
  const t=await page.innerText('#pg');
  out.push(pg+' '+m+' len '+t.length+' '+(/could not be drawn/.test(t)?'ERROR '+t.match(/could not be drawn[^\n]*/)[0]:'ok')+' '+(/NaN|undefined|Infinity/.test(t)?'BADTEXT '+(t.match(/.{20}(NaN|undefined|Infinity).{20}/)||[''])[0].replace(/\n/g,' '):''));
}
console.log(out.join('\n'));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));
await browser.close();
