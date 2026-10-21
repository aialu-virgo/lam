/* Stage a real stock file headlessly against a copy of live state; writes the changed docs to OUT. Not a test; never commit its output. */
import { chromium, open } from './run.mjs';
import fs from 'fs';import path from 'path';
const [,, LIVE, FILE, OUT]=process.argv;
const store={};for(const c of fs.readdirSync(LIVE)){for(const f of fs.readdirSync(path.join(LIVE,c)))store[c+'/'+f.replace(/\.json$/,'')]=JSON.parse(fs.readFileSync(path.join(LIVE,c,f)))}
const before=JSON.parse(JSON.stringify(store));
const browser=await chromium.launch();
const {page,errs}=await open(browser,{store,autoload:false,viewer:{email:'data@virgoasia.com',name:'Vijay'}});
await page.waitForTimeout(4000);await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(1000);
await page.click('[data-act="u-reset"]').catch(()=>{});
const inp=await page.$('input[type=file]');await inp.setInputFiles(FILE);
await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.stage==='mapping'&&window.__desk.U.kind==='stock',null,{timeout:180000});
const pre=await page.evaluate(()=>({sk:window.__desk.U.sk,asOf:window.__desk.U.asOf,map:window.__desk.U.map}));
await page.click('[data-act="stk-validate"]');
await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:600000});
await page.waitForTimeout(3000);
const res=await page.evaluate(()=>{const u=window.__desk.U.res;return {kind:u.kind,asOf:u.asOf,read:u.read,good:u.good,rejected:u.rejected,reasons:u.reasons,zero:u.zero,other:{rows:u.other.rows,sheets:u.other.sheets},unknownWh:u.unknownWh,warn:u.warn,fx:u.fx,itemMaster:u.itemMaster}});
const after=await page.evaluate(()=>window.__mockStore());
fs.mkdirSync(OUT,{recursive:true});const ch=[];
for(const k of Object.keys(after)){if(JSON.stringify(after[k])!==JSON.stringify(before[k])){ch.push(['set',k]);fs.writeFileSync(path.join(OUT,k.replace('/','__')+'.json'),JSON.stringify(after[k]))}}
for(const k of Object.keys(before))if(!(k in after))ch.push(['delete',k]);
fs.writeFileSync(path.join(OUT,'_changes.json'),JSON.stringify(ch));
console.log(JSON.stringify({pre:{sk:pre.sk,asOf:pre.asOf},res,changes:ch.length,byCol:ch.reduce((a,[o,k])=>{const c=o+':'+k.split('/')[0];a[c]=(a[c]||0)+1;return a},{}),errs:errs.filter(e=>!/ERR_FAILED|fonts/.test(e)).slice(0,5)},null,1));
await browser.close();
