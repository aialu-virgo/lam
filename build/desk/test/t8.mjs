import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* ---- owner responses (check 6) as bm.a ---- */
{const {page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email:'bm.a@demo',name:'BM A'}});await page.waitForTimeout(2500);
 await page.evaluate(()=>{location.hash='#/action/DEMO_A1'});await page.waitForTimeout(800);
 let t=await page.innerText('#pg');ok('thread opens, shows ladder and Respond buttons',/Acknowledged/.test(t)&&/Mark done/.test(t)&&/Request reassign/.test(t),'');
 await page.click('[data-act="r-ack"]');await page.waitForTimeout(600);
 let a=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_A1'));ok('Acknowledge -> status Acknowledged, thread entry',a.status==='Acknowledged'&&a.thread.some(e=>e.kind==='ack'),a.status);
 await page.click('[data-act="r-update"]');await page.fill('#rd-text','Customer promised payment');await page.fill('#rd-eta','2026-10-28');await page.click('[data-act="resp-go"]');await page.waitForTimeout(600);
 a=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_A1'));ok('Update with comment + ETA -> In progress',a.status==='In progress'&&/ETA/.test(a.thread.slice(-1)[0].text),a.status);
 await page.click('[data-act="r-done"]');await page.click('[data-act="resp-go"]');await page.waitForTimeout(300);
 let err=await page.innerText('#d-err');ok('Done without closure note refused',/required/.test(err),err);
 await page.fill('#rd-text','Collected in full, receipt 5521');await page.click('[data-act="resp-go"]');await page.waitForTimeout(600);
 a=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_A1'));ok('Done with closure note -> Done',a.status==='Done'&&a.closure==='Collected in full, receipt 5521',a.status);
 await page.evaluate(()=>{location.hash='#/action/DEMO_A2'});await page.waitForTimeout(500);
 await page.click('[data-act="r-help"]');await page.fill('#rd-text','Need credit approval');await page.click('[data-act="resp-go"]');await page.waitForTimeout(500);
 await page.evaluate(()=>{location.hash='#/action/DEMO_A3'});await page.waitForTimeout(500);
 await page.click('[data-act="r-reassign"]');await page.fill('#rd-text','Customer belongs to another branch');await page.click('[data-act="resp-go"]');await page.waitForTimeout(500);
 const st=await page.evaluate(()=>['DEMO_A2','DEMO_A3'].map(id=>{const a=window.__dbg.S.actions.find(a=>a.id===id);return a.status+'/'+a.need_help+'/'+a.thread.slice(-1)[0].kind}));
 ok('Need help flags; Request reassign sets Reassign requested',st[0]==='Open/true/help'&&st[1]==='Reassign requested/false/reassign_req',st.join(' '));
 /* log + csv */
 await page.evaluate(()=>{location.hash='#/actions'});await page.waitForTimeout(400);await page.click('[data-act="actab"][data-t="log"]');await page.waitForTimeout(500);
 const lt=await page.innerText('#pg');ok('action log shows responses',/ack/.test(lt)&&/Collected in full/.test(lt),'');
 await page.click('[data-act="log-csv"]');await page.waitForTimeout(500);
 const sv=await page.evaluate(()=>window.__saved.map(s=>[s.filename,s.data.split('\n').length,s.data.split('\n')[0]]));ok('CSV export saves action-log.csv',sv.length===1&&sv[0][0]==='action-log.csv'&&sv[0][1]>10,JSON.stringify(sv));
 await page.context().close();
 /* ---- verify by assigner ---- */
}
{const st=JSON.parse(JSON.stringify(store));
 const {page}=await open(browser,{store:st,viewer:{email:'hod.sales@demo',name:'HOD'}});await page.waitForTimeout(2500);
 await page.evaluate(()=>{location.hash='#/action/DEMO_VER'});await page.waitForTimeout(600);
 const t=await page.innerText('#pg');ok('assigner sees Verify closed on a Done action',/Verify closed/.test(t)&&/Reopen with note/.test(t),'');
 await page.click('[data-act="verify-ok"]');await page.waitForTimeout(600);
 const a=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_VER'));ok('Verified closed by assigner',a.status==='Verified closed'&&a.verified_by==='hod.sales@demo',a.status);
 await page.context().close();
 /* owner (not assigner) cannot verify */
 const {page:p2}=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email:'bm.a@demo',name:'BM'}});await p2.waitForTimeout(2500);
 await p2.evaluate(()=>{location.hash='#/action/DEMO_VER'});await p2.waitForTimeout(600);
 const t2=await p2.innerText('#pg');ok('owner cannot verify own closure',!/Verify closed/.test(t2.replace('Verified closed','')),'');
 await p2.context().close();
}
/* ---- view as (Super admin) ---- */
{const {page}=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email:'data@virgoasia.com',name:'Vijay'}});await page.waitForTimeout(2500);
 await page.selectOption('#va-sel','bm.a@demo');await page.waitForTimeout(2500);
 const t=await page.innerText('body');ok('view-as banner labelled and read-only',/Viewing as Demo Branch Manager A/.test(t)&&/Read-only preview/.test(t),'');
 const tot=await page.evaluate(()=>Math.round(window.__dbg.sumF({plants:null},window.__dbg.qMonths('FY27-Q2')).n));ok('view-as bm.a shows plant 1012 only total',tot===7030286/* D28: fixture holds Q1 FY26 onward; 7,030,286 = plant 1012 net sales Jul-Sep 2026 summed straight from the stored chunks */,String(tot));
 await page.evaluate(()=>{location.hash='#/action/DEMO_A5'});await page.waitForTimeout(500);
 const before=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_A5').status);
 await page.click('[data-act="r-ack"]').catch(()=>{});await page.waitForTimeout(500);
 const after=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_A5').status);ok('preview cannot save a response',before===after,before+'->'+after);
 const logged=await page.evaluate(()=>window.__mockStore());ok('view-as is logged',Object.keys(logged).some(k=>k.startsWith('log/va')),'');
 await page.context().close()}
/* ---- plan workflow (check 11) moved to state records (D77-D80): covered by t59. Plant-keyed records are legacy, frozen read only ---- */
{const st=JSON.parse(JSON.stringify(store));
 const {page}=await open(browser,{store:st,viewer:{email:'bm.a@demo',name:'BM'}});await page.waitForTimeout(2500);
 const key='fy27_q3_1012_laminate_dealer';
 const x=await page.evaluate(k=>window.__dbg.S.potential.find(p=>p._id===k),key);ok('seeded plant leaf is approved with original',x&&x.status==='Approved'&&x.original&&x.approved,x&&x.status);
 const g=await page.evaluate(k=>{const D=window.__dbg;return [D.planGuard(D.S.potential.find(p=>p._id===k)),D.advanceDoc(D.S.potential.find(p=>p._id===k),D.effUser()).err]},key);
 ok('plant-keyed (legacy) records are read only: no edit, no approval',/legacy\) figures are read only/.test(g[0])&&/legacy\) figures are read only/.test(g[1]||''),JSON.stringify(g));
 await page.evaluate(()=>{location.hash='#/targets'});await page.waitForTimeout(900);await page.selectOption('#tp-q','FY27-Q2');await page.waitForTimeout(600);
 ok('legacy quarter shows plant figures read only',/Legacy \(by plant\)/.test(await page.innerText('#pg'))&&(await page.$$('[data-tp="pot"]')).length===0,'');
 await page.context().close()}
console.log(res.join('\n'));
await browser.close();
