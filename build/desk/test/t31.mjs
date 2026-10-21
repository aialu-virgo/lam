import { chromium, open } from './run.mjs';
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const V={email:null,name:'',owner:true,id:'U123'};
let {page,errs}=await open(browser,{store:{},viewer:{email:'data@virgoasia.com',name:'Vijay'}});await page.waitForTimeout(2500);
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(600);
await page.evaluate(()=>window.__dbg.demoLoad());
await page.waitForFunction(()=>window.__dbg.S.uploads.length>=2,null,{timeout:200000});await page.waitForTimeout(8000);
let st=await page.evaluate(()=>window.__mockStore());
const cellK=Object.keys(st).filter(k=>/^cells\/INV_/.test(k)),invK=Object.keys(st).filter(k=>/^inv\//.test(k)),rollK=Object.keys(st).filter(k=>/^roll\//.test(k));
ok('empty store: demo loads',cellK.length>10&&invK.length>10,cellK.length+' cells '+invK.length+' inv');
// make 2026-09 plants real (mixed state like the incident)
const real=new Set();let realInv={};
for(const k of cellK){const c=st[k];if(c.ym!=='2026-09')continue;for(const p in c.plants){delete c.plants[p].demo;real.add(p)}}
for(const k of invK){if(/-2026-09-/.test(k)){delete st[k].demo;realInv[k]=JSON.stringify(st[k])}}
for(const k of rollK){if(/-2026-09$/.test(k))delete st[k].demo}
const rs=[...Object.keys(st).filter(k=>/^roll\/.*-2026-09$/.test(k))];
const upK=Object.keys(st).filter(k=>/^uploads\//.test(k)&&st[k].entity==='INV');
delete st[upK[0]].demo;
const realUp=upK[0];
await page.context().close();
({page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(st)),viewer:{email:'data@virgoasia.com',name:'Vijay'}}));await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(800);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);let t=await page.innerText('#pg');
ok('real data present: no Load demo button; Clear demo offered',!(await page.$('[data-act="demo-load"]'))&&!!(await page.$('[data-act="demo-clear"]')),'');
const before=await page.evaluate(()=>JSON.stringify(window.__mockStore()));
await page.evaluate(()=>window.__dbg.demoLoad());await page.waitForTimeout(2500);
const after=await page.evaluate(()=>JSON.stringify(window.__mockStore()));
ok('handler refuses demo load, database unchanged',before===after,'');
// forced write guard: call runLoad path directly via demo generator is covered by handler; test whoAmI
const who=await page.evaluate(()=>{const S=window.__dbg.S;const a=S.viewer;return a&&a.email});
ok('viewer email recorded',who==='data@virgoasia.com',who);
// clear demo on mixed state
await page.evaluate(()=>window.__dbg.demoClear());await page.waitForTimeout(6000);
const fin=await page.evaluate(()=>window.__mockStore());
const cells09=Object.keys(fin).filter(k=>k==='cells/INV_2026-09');
const kept=Object.keys(realInv).every(k=>fin[k]&&JSON.stringify(fin[k])===realInv[k]);
const plants09=cells09.length?Object.keys(fin['cells/INV_2026-09'].plants).length:0;
ok('Clear demo keeps real 2026-09 cells, inv chunks and roll docs',kept&&plants09===real.size&&rs.every(k=>fin[k]),plants09+' plants of '+real.size+', roll '+rs.filter(k=>fin[k]).length+'/'+rs.length);
ok('Clear demo removes demo-only cells, chunks, uploads',!Object.keys(fin).some(k=>/^cells\/INV_/.test(k)&&k!=='cells/INV_2026-09'&&Object.values(fin[k].plants).some(p=>p.demo))&&!Object.keys(fin).some(k=>/^uploads\//.test(k)&&fin[k].demo)&&!Object.keys(fin).some(k=>/^(actions|users|potential)\//.test(k)&&fin[k].demo),'');
ok('real upload record kept',!!fin[realUp],'');
await page.evaluate(()=>{const S=window.__dbg.S;S.uploads=S.uploads.filter(u=>!u.demo);window.__dbg.hasRealData()});await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(300);await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(800);t=await page.innerText('#pg');ok('only real data: message shown',/Demo is disabled because real SAP data is loaded/.test(t),'');
console.log(res.join('\n'));console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));await browser.close();
