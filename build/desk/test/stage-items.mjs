/* Stage an item-master reload headlessly with a minimal store (one Super admin) and write the changed docs to OUT.
   Not a test; its output holds Virgo data and is never committed. Usage: node stage-items.mjs FILE OUT_DIR */
import { chromium, open } from './run.mjs';
import fs from 'fs';import path from 'path';
const [,, FILE, OUT]=process.argv;
const store={'users/data_virgoasia_com':{active:true,email:'data@virgoasia.com',name:'Vijay',role:'Super admin',plant_codes:'',today_cap:5}};
const browser=await chromium.launch();
const {page,errs}=await open(browser,{store,autoload:false,viewer:{email:'data@virgoasia.com',name:'Vijay'}});
await page.waitForTimeout(3000);await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(1500);
const tabs=await page.$$eval('[data-act="atab"]',b=>b.map(x=>x.getAttribute('data-t')));console.log('tabs',tabs.join());
const tb=tabs.find(t=>/mast|item/i.test(t));if(tb){await page.click('[data-act="atab"][data-t="'+tb+'"]');await page.waitForTimeout(1500)}
const inp=await page.$('#up-item');if(!inp)throw new Error('no item input');
await inp.setInputFiles(FILE);
await page.waitForFunction(()=>{const s=window.__dbg&&window.__dbg.S&&window.__dbg.S.mst.items;return s&&(s.stage==='checked'||s.stage==='idle')},null,{timeout:600000});
const chk=await page.evaluate(()=>{const s=window.__dbg.S.mst.items;const r=s.res||{};return {stage:s.stage,msg:s.msg,read:r.read,loaded:r.loaded,withBrand:r.withBrand,withThk:r.withThk,hasBrandCol:r.hasBrandCol,rejected:r.rejected,byGroup:r.byGroup}});
console.log(JSON.stringify(chk));
if(chk.stage!=='checked')process.exit(1);
await page.click('[data-act="mst-item-load"]');
await page.waitForFunction(()=>{const s=window.__dbg.S.mst.items;return s&&s.stage!=='loading'},null,{timeout:600000});await page.waitForTimeout(2000);
const after=await page.evaluate(()=>window.__mockStore());fs.mkdirSync(OUT,{recursive:true});const ks=[];
for(const k of Object.keys(after)){if(/^(items|itemmeta|uploads)\//.test(k)){ks.push(k);fs.writeFileSync(path.join(OUT,k.replace('/','__')+'.json'),JSON.stringify(after[k]))}}
console.log(JSON.stringify({written:ks,errs:errs.filter(e=>!/ERR_FAILED|fonts/.test(e)).slice(0,5)}));
await browser.close();
