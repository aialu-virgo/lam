/* Stage real credit-note files headlessly: STORE (json of masters) + item master FILE, then each CN file with "covers all branches".
   Writes the creditnotes/uploads/backups/coverage docs to OUT. Not a test; output holds Virgo data and is never committed.
   Usage: node stage-cn.mjs STORE ITEM_FILE OUT CN_FILE... */
import { chromium, open } from './run.mjs';
import fs from 'fs';import path from 'path';
const [,, STORE, ITEMS, OUT, ...FILES]=process.argv;
const store=JSON.parse(fs.readFileSync(STORE));const before=JSON.parse(JSON.stringify(store));
const browser=await chromium.launch();
const {page,errs}=await open(browser,{store,autoload:false,viewer:{email:'data@virgoasia.com',name:'Vijay'}});
await page.waitForTimeout(3000);await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(1200);
await page.click('[data-act="atab"][data-t="items"]');await page.waitForTimeout(1000);
await (await page.$('#up-item')).setInputFiles(ITEMS);
await page.waitForFunction(()=>{const s=window.__dbg.S.mst.items;return s&&s.stage==='checked'},null,{timeout:600000});
await page.click('[data-act="mst-item-load"]');await page.waitForFunction(()=>window.__dbg.S.mst.items.stage!=='loading',null,{timeout:600000});await page.waitForTimeout(2000);
const itemKeys=new Set(Object.keys(await page.evaluate(()=>window.__mockStore())).filter(k=>/^(items|itemmeta|uploads)\//.test(k)));
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(1500);
const out=[];
for(const f of FILES){
  await page.click('[data-act="u-reset"]').catch(()=>{});
  await (await page.$('input[type=file]')).setInputFiles(f);await page.waitForTimeout(3500);
  if(await page.evaluate(()=>!!(window.__desk.U&&window.__desk.U.cnOffer)))await page.click('[data-act="cn-offer"]');
  await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.kind==='cn'&&window.__desk.U.stage==='mapping',null,{timeout:120000});
  await page.evaluate(()=>{window.__desk.U.allBranches=true});
  await page.evaluate(()=>document.querySelector('[data-act="cn-validate"]').click());
  await page.waitForFunction(()=>['validated','done','mapping'].includes(window.__desk.U.stage),null,{timeout:300000});
  const r=await page.evaluate(()=>{const U=window.__desk.U,u=U.res||{};return {stage:U.stage,msg:U.msg||'',good:u.good,rejected:u.rejected,xfer:u.xfer&&u.xfer.rows,acp:u.acp&&u.acp.rows,other:u.other&&u.other.rows,value:Math.round(u.value||0),sheets:Math.round(u.sheets||0),months:u.covMonths,allBr:U.allBranches}});
  if(r.stage==='validated'){await page.evaluate(()=>{window.__desk.U.allBranches=true});await page.click('[data-act="cn-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:300000})}
  r.done=await page.evaluate(()=>window.__desk.U.doneMsg||'');out.push([path.basename(f),r]);console.log(path.basename(f),JSON.stringify(r));
}
await page.waitForTimeout(2000);
const after=await page.evaluate(()=>window.__mockStore());fs.mkdirSync(OUT,{recursive:true});const ch={};
for(const k of Object.keys(after)){if(itemKeys.has(k)||/^items\/|^itemmeta\//.test(k))continue;if(JSON.stringify(after[k])!==JSON.stringify(before[k])){const c=k.split('/')[0];ch[c]=(ch[c]||0)+1;fs.writeFileSync(path.join(OUT,k.replace(/\//g,'__')+'.json'),JSON.stringify(after[k]))}}
console.log(JSON.stringify({changed:ch,errs:errs.filter(e=>!/ERR_FAILED|fonts/.test(e)).slice(0,5)}));
await browser.close();
