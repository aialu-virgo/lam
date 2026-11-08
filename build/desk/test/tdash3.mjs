import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+(process.env.BIG||'store-big-dash.json')));
const browser=await chromium.launch();const res=[];process.on('exit',()=>console.log(res.join('\n')));const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const {page,errs}=await open(browser,{store,today:'2026-10-23'});
let t0=Date.now();
await page.waitForFunction(()=>window.__dbg&&window.__dbg.DS&&window.__dbg.DS.ready&&window.__dbg.DS.plants.length>=40,null,{timeout:240000});
const tLoad=Date.now()-t0;
t0=Date.now();await page.evaluate(()=>{location.hash='#/dashboard'});
await page.waitForSelector('.dsh-card',{timeout:120000});const tFirst=Date.now()-t0;
await page.waitForTimeout(6000);
const info=await page.evaluate(()=>({plants:window.__dbg.DS.plants.length,months:window.__dbg.DS.months.length,cards:document.querySelectorAll('.dsh-card').length}));
ok('perf: store is 45 plants x 19 months',info.plants>=45&&info.months>=19,JSON.stringify(info));
console.log('store load (roll-ups decoded) ms',tLoad,' first dashboard paint ms',tFirst);
/* each library card cold (caches cleared), main-thread time of the synchronous build */
const T=await page.evaluate(async()=>{
  const d=window.__dbg,out=[];
  for(const e of d.D_LIB){
    const c=d.dFromLib(e.id);d.dBump();
    const t=performance.now();let h='';try{h=d.dCardHtml(c,{preview:true})}catch(x){h='ERR '+x.message}
    const ms=performance.now()-t;
    out.push([e.id,Math.round(ms),/could not be drawn|ERR/.test(h)?'ERR':'',/Reading|loading/i.test(h)?'reading':'']);
    await new Promise(r=>setTimeout(r,0));
  }
  return out;
});
await page.waitForTimeout(5000);
/* warm: after detail chunks are read */
const W=await page.evaluate(async()=>{
  const d=window.__dbg,out=[];
  for(const e of d.D_LIB){const c=d.dFromLib(e.id);d.dBump();const t=performance.now();let h=d.dCardHtml(c,{preview:true});out.push([e.id,Math.round(performance.now()-t),/Reading|reading/.test(h)?'reading':'',/could not be drawn/.test(h)?'ERR':''])}
  return out;
});
const slow=W.filter(x=>x[1]>400),mx=Math.max.apply(null,W.map(x=>x[1])),sum=W.reduce((a,x)=>a+x[1],0);
console.log('cold per-card ms:',T.map(x=>x[0]+':'+x[1]+(x[3]?'*':'')).join(' '));
console.log('warm (detail read) per-card ms:',W.map(x=>x[0]+':'+x[1]+x[2]).join(' '));
ok('perf: every card on 45 plants x 19 months renders without error',W.every(x=>!x[3])&&T.every(x=>!x[2]),JSON.stringify(W.filter(x=>x[3])));
ok('perf: no single card blocks the main thread over 600 ms (warm)',mx<600,'max '+mx+' ms, total of '+W.length+' cards '+sum+' ms');
const tr=await page.evaluate(()=>{const t=performance.now();window.__dbg.dBump();window.__dbg.S.dash.html={};return new Promise(r=>requestAnimationFrame(()=>{setTimeout(()=>r(Math.round(performance.now()-t)),0)}))});
console.log('full dashboard re-render after cache clear ms',tr);
ok('perf: full 12-card dashboard re-render under 2.5 s',tr<2500,tr+' ms');
const warmRe=await page.evaluate(()=>{const t=performance.now();window.__dbg.S.dash.html={};window.__dbg.S.lastHtml='';window.__desk&&0;return new Promise(r=>requestAnimationFrame(()=>setTimeout(()=>r(Math.round(performance.now()-t)),0)))});
console.log('re-render with warm memo ms',warmRe);
console.log('heap MB',await page.evaluate(()=>performance.memory&&Math.round(performance.memory.usedJSHeapSize/1048576)));
ok('perf: no page errors',errs.filter(e=>/PAGEERROR/.test(e)).length===0,JSON.stringify(errs.filter(e=>/PAGEERROR/.test(e)).slice(0,3)));
await browser.close();
