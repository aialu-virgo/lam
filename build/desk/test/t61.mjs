import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,2).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const clone=o=>JSON.parse(JSON.stringify(o));
const st0=clone(store);Object.keys(st0).forEach(k=>{if(/^(collections|creditnotes|backups|uploads|rejects|actions|followups|cells|inv|roll|jobs)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true,today:'2026-10-23'});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);await page.evaluate(()=>{window.__NOAUTOLOAD=false});
const ms=p=>page.evaluate(p=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>new RegExp(p).test(k))),p);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(n=>window.__desk.U&&window.__desk.U.name===n&&['mapping','validated','done','idle'].includes(window.__desk.U.stage),f.split('/').pop(),{timeout:60000});await page.waitForTimeout(400)};
const inv=async f=>{await up(f);await page.evaluate(()=>{const b=document.querySelector('[data-act="u-validate"]');if(b)b.click()});await page.waitForFunction(()=>window.__desk.U.stage==='done'||window.__desk.U.stage==='validated',null,{timeout:90000});
  if(await page.evaluate(()=>window.__desk.U.stage)==='validated'){if(await page.$('[data-chg="confrep"]'))await page.check('[data-chg="confrep"]');if(await page.$('#u-reason'))await page.fill('#u-reason','reload for the test');await page.waitForTimeout(300);await page.click('[data-act="u-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000})}await page.waitForTimeout(800)};
const months=['2026-01','2026-02','2026-03','2026-04'];
for(const m of months){const a=G.invoices({shape:'B1',plants,months:[m],docsPerPlantMonth:20,seed:5,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale '+m+' ja.csv',csvOf(a.headers,a.rows));const b=G.invoices({shape:'B1',plants:[plants[0]],months:[m],docsPerPlantMonth:2,seed:5,dateStyle:'iso'});fs.writeFileSync(AF+'Combine Sale '+m+' jb.csv',csvOf(b.headers,b.rows))}
for(const m of months)await inv(AF+'Combine Sale '+m+' ja.csv');
const cellsA=await ms('^cells/INV_');const linesA={};months.forEach(m=>{linesA[m]=cellsA['cells/INV_'+m].plants[plants[0].code].lines});
for(const m of months)await inv(AF+'Combine Sale '+m+' jb.csv');
const upl=await page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&/ jb\.csv/.test(v.file||'')).sort((a,b)=>a[1].at<b[1].at?1:-1).map(([k,v])=>[k.slice(8),v.file]));
const bk=await ms('^backups/');const damaged=upl[2][0];const bdoc=Object.entries(bk).find(([k,v])=>v.upload===damaged);
await page.evaluate(async([id,doc])=>{await window.__desk.dset(id,Object.assign({},doc,{ck:'damaged'}))},[bdoc[0],bdoc[1]]);await page.waitForTimeout(600);
const before=await ms('^cells/INV_');
await page.click('[data-act="u-reset"]').catch(()=>{});await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(800);
/* 1. QA's t56 scenario, run as a queued job (ids given in any order) */
const ids=[upl[1][0],upl[3][0],upl[0][0],upl[2][0]];
await page.evaluate(async ids=>{await window.__desk.dset('jobs/job1',{type:'undo',uploads:ids,requested_by:'coordinator',requested_at:new Date().toISOString(),reason:'D60 recovery test',status:'queued'})},ids);
await page.waitForFunction(()=>{const j=window.__mockStore()['jobs/job1'];return j&&(j.status==='failed'||j.status==='done')},null,{timeout:120000});await page.waitForTimeout(800);
const j1=(await ms('^jobs/'))['jobs/job1'];const after=await ms('^cells/INV_');
ok('job: the undo job ran once and ended "failed" at the damaged backup, with finished_at and a per-upload result',j1.status==='failed'&&!!j1.finished_at&&Array.isArray(j1.results)&&j1.results.length===3&&/^stopped: Backup incomplete/.test(j1.results[2].text),JSON.stringify(j1.results.map(r=>r.text)));
ok('job: newest first, restored: April and March report "restored 1 plant-month"',/restored 1 plant-month/.test(j1.results[0].text)&&/restored 1 plant-month/.test(j1.results[1].text)&&/2026-04/.test(j1.results[0].file)&&/2026-03/.test(j1.results[1].file),JSON.stringify(j1.results));
ok('job: April and March sales are back; the damaged February and untouched January keep their data',after['cells/INV_2026-04'].plants[plants[0].code].lines===linesA['2026-04']&&after['cells/INV_2026-03'].plants[plants[0].code].lines===linesA['2026-03']&&JSON.stringify(after['cells/INV_2026-02'].plants[plants[0].code])===JSON.stringify(before['cells/INV_2026-02'].plants[plants[0].code])&&JSON.stringify(after['cells/INV_2026-01'].plants[plants[0].code])===JSON.stringify(before['cells/INV_2026-01'].plants[plants[0].code]),'');
ok('job: the damaged backup is kept (nothing deleted without a successful restore)',Object.values(await ms('^backups/')).some(v=>v.upload===damaged),'');
const aud=await ms('^audit/');ok('job: an audit entry records the job, its type and the stop reason',Object.values(aud).some(a=>/admin job failed/.test(JSON.stringify(a))&&/Backup incomplete/.test(JSON.stringify(a))),'');
ok('job: the page shows the banner "Ran queued admin job: …"',/Ran queued admin job: undo \(4 uploads\) · FAILED/.test(await page.innerText('#banners')),(await page.innerText('#banners')).slice(0,160));
/* a second job on the remaining intact upload (January) runs after the first, in requested_at order, and is done */
await page.evaluate(async id=>{await window.__desk.dset('jobs/job2',{type:'undo',uploads:[id],requested_by:'coordinator',requested_at:new Date(Date.now()+1000).toISOString(),reason:'second',status:'queued'})},upl[3][0]);
await page.waitForFunction(()=>{const j=window.__mockStore()['jobs/job2'];return j&&(j.status==='failed'||j.status==='done')},null,{timeout:60000});await page.waitForTimeout(500);
const jj=await ms('^jobs/');
ok('job: a second queued job runs after the first and ends "done" ("restored N plant-months")',jj['jobs/job2'].status==='done'&&/restored 1 plant-month/.test(jj['jobs/job2'].results[0].text)&&jj['jobs/job2'].started_at>jj['jobs/job1'].finished_at,JSON.stringify(jj['jobs/job2'].results));
/* a finished job never runs again */
const runs0=Object.values(await ms('^audit/')).filter(a=>/admin job/.test(JSON.stringify(a))).length;
const again=await page.evaluate(()=>window.__desk.runJobs('tabZ',{otherTab:true}));await page.waitForTimeout(500);
ok('job: finished jobs are not run again',again===0&&Object.values(await ms('^audit/')).filter(a=>/admin job/.test(JSON.stringify(a))).length===runs0,'');
await page.context().close();
/* 2. clear_demo through a job, and the double-tab guard */
const dsT=clone(store);dsT['jobs/jd']={type:'clear_demo',requested_by:'coordinator',requested_at:new Date().toISOString(),reason:'clear the demo',status:'queued'};
let c=await open(browser,{store:dsT});await c.page.waitForFunction(()=>{const j=window.__mockStore()['jobs/jd'];return j&&(j.status==='done'||j.status==='failed')},null,{timeout:120000});await c.page.waitForTimeout(2000);
const jd=(await c.page.evaluate(()=>window.__mockStore()));
ok('job: clear_demo ran from the queue: done, finished_at set, the demo uploads and cells are gone',jd['jobs/jd'].status==='done'&&!!jd['jobs/jd'].finished_at&&!Object.values(jd).some(v=>v&&v.demo&&v.entity==='INV')&&!Object.keys(jd).some(k=>/^cells\/INV_/.test(k)&&Object.values(jd[k].plants||{}).some(p=>p.demo)),jd['jobs/jd'].status);
ok('job: clear_demo is audited and shown in the banner',Object.values(jd).some(v=>v&&/admin job done/.test(JSON.stringify(v))&&/clear_demo/.test(JSON.stringify(v)))&&/Ran queued admin job: clear_demo/.test(await c.page.innerText('#banners')),'');
await c.ctx.close();
/* double tab: two runners on one queued job: it runs once */
const d2=clone(store);
c=await open(browser,{store:d2});await c.page.waitForTimeout(4500);
await c.page.evaluate(async()=>{await window.__desk.dset('jobs/jt',{type:'clear_demo',requested_by:'coordinator',requested_at:new Date().toISOString(),reason:'tab guard',status:'queued'})});
const rr=await c.page.evaluate(()=>Promise.all([window.__desk.runJobs('tabA',{otherTab:true}),window.__desk.runJobs('tabB',{otherTab:true})]));
await c.page.waitForTimeout(3000);
const au=Object.values(await c.page.evaluate(()=>window.__mockStore())).filter(v=>v&&/admin job/.test(JSON.stringify(v))&&/jt/.test(JSON.stringify(v))).length;
ok('double tab: two runners claim one queued job and it runs exactly once (one runs it, the other is refused the lease)',rr[0]+rr[1]===1&&au===1,JSON.stringify(rr)+' audit '+au);
await c.ctx.close();
/* a non-Super-admin page never runs jobs */
const d3=clone(store);d3['jobs/jn']={type:'clear_demo',requested_by:'coordinator',requested_at:new Date().toISOString(),reason:'x',status:'queued'};
c=await open(browser,{store:d3,viewer:{email:'plant.b@demo'}});await c.page.waitForTimeout(9000);
ok('a page opened by someone who is not a Super admin leaves the job queued',(await c.page.evaluate(()=>window.__mockStore()['jobs/jn'].status))==='queued','');
await c.ctx.close();
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
