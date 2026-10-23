/* Stage a real SAP file headlessly against a copy of live state and write the changed docs to OUT.
   Not a test; its output holds Virgo data and is never committed. Usage: node stage-upload.mjs KIND PREFIX LIVE_DIR FILE OUT_DIR
   KIND = U.kind of the intake (stock, coll ...), PREFIX = its data-act prefix (stk, coll ...). */
import { chromium, open } from './run.mjs';
import fs from 'fs';import path from 'path';
const [,, KIND, P, LIVE, FILE, OUT]=process.argv;
const store={};for(const c of fs.readdirSync(LIVE)){for(const f of fs.readdirSync(path.join(LIVE,c)))store[c+'/'+f.replace(/\.json$/,'')]=JSON.parse(fs.readFileSync(path.join(LIVE,c,f)))}
const before=JSON.parse(JSON.stringify(store));
const browser=await chromium.launch();
const {page,errs}=await open(browser,{store,autoload:false,viewer:{email:'data@virgoasia.com',name:'Vijay'}});
await page.waitForTimeout(4000);await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(1000);
await page.click('[data-act="u-reset"]').catch(()=>{});
await (await page.$('input[type=file]')).setInputFiles(FILE);
await page.waitForFunction(k=>window.__desk.U&&window.__desk.U.stage==='mapping'&&window.__desk.U.kind===k,KIND,{timeout:300000});
await page.click('[data-act="'+P+'-validate"]');
await page.waitForFunction(()=>['validated','done','mapping'].includes(window.__desk.U.stage),null,{timeout:900000});
const st=await page.evaluate(()=>({stage:window.__desk.U.stage,msg:window.__desk.U.msg||'',txt:(document.querySelector('#i-upload')||document.body).innerText.slice(0,1500)}));
console.log('after validate:',st.stage,st.msg);
if(st.stage==='validated'){
  if(await page.$('[data-act="'+P+'-confrep"]')){console.log('REPLACE CONFIRM NEEDED:\n'+st.txt);await page.click('[data-act="'+P+'-confrep"]');await page.waitForTimeout(500)}
  await page.click('[data-act="'+P+'-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:900000});
}
await page.waitForTimeout(3000);
const res=await page.evaluate(()=>{const u=window.__desk.U.res||{};const o={};for(const k in u){const v=u[k];if(Array.isArray(v))o[k]='['+v.length+']';else if(v instanceof Map||v instanceof Set)o[k]='{'+v.size+'}';else if(v&&typeof v==='object'&&JSON.stringify(v).length>800)o[k]='{...}';else o[k]=v}return {res:o,done:window.__desk.U.doneMsg}});
const after=await page.evaluate(()=>window.__mockStore());
fs.mkdirSync(OUT,{recursive:true});const ch=[];
for(const k of Object.keys(after)){if(JSON.stringify(after[k])!==JSON.stringify(before[k])){ch.push(['set',k]);fs.writeFileSync(path.join(OUT,k.replace('/','__')+'.json'),JSON.stringify(after[k]))}}
for(const k of Object.keys(before))if(!(k in after))ch.push(['delete',k]);
fs.writeFileSync(path.join(OUT,'_changes.json'),JSON.stringify(ch));
console.log(JSON.stringify({...res,changes:ch.length,byCol:ch.reduce((a,[o,k])=>{const c=o+':'+k.split('/')[0];a[c]=(a[c]||0)+1;return a},{}),errs:errs.filter(e=>!/ERR_FAILED|fonts/.test(e)).slice(0,5)},null,1));
await browser.close();
