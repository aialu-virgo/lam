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
 const tot=await page.evaluate(()=>Math.round(window.__dbg.sumF({plants:null},window.__dbg.qMonths('FY27-Q2')).n));ok('view-as bm.a shows plant 1012 only total',tot===7614017,String(tot));
 await page.evaluate(()=>{location.hash='#/action/DEMO_A5'});await page.waitForTimeout(500);
 const before=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_A5').status);
 await page.click('[data-act="r-ack"]').catch(()=>{});await page.waitForTimeout(500);
 const after=await page.evaluate(()=>window.__dbg.S.actions.find(a=>a.id==='DEMO_A5').status);ok('preview cannot save a response',before===after,before+'->'+after);
 const logged=await page.evaluate(()=>window.__mockStore());ok('view-as is logged',Object.keys(logged).some(k=>k.startsWith('log/va')),'');
 await page.context().close()}
/* ---- plan workflow (check 11) ---- */
{const st=JSON.parse(JSON.stringify(store));
 const {page}=await open(browser,{store:st,viewer:{email:'bm.a@demo',name:'BM'}});await page.waitForTimeout(2500);
 const key='fy27_q3_1012_laminate_dealer';
 const get=()=>page.evaluate(k=>window.__dbg.S.potential.find(p=>p._id===k),key);
 let x=await get();ok('seeded leaf is approved with original',x&&x.status==='Approved'&&x.original&&x.approved,x&&x.status);
 await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(500);
 await page.evaluate(k=>{document.querySelector('[data-act="pot-edit"][data-id="'+k+'"]').click()},key);await page.waitForTimeout(400);
 const dlg=await page.innerText('#dlg');ok('dialog shows sense-check and revision log',/Sense-check/i.test(dlg)&&/Revision log/i.test(dlg),dlg.slice(0,60));
 await page.fill('#d-sh','12');await page.click('[data-act="pot-save"]');await page.waitForTimeout(300);
 let er=await page.innerText('#d-err');ok('revision without reason refused',/Reason is required/.test(er),er);
 await page.fill('#d-reason','dealer survey up');await page.fill('#d-part','Branch team');await page.click('[data-act="pot-save"]');await page.waitForTimeout(700);
 x=await get();const apT=x.approved.share_pct;ok('new revision is Draft; current approved target unchanged; original kept',x.status==='Draft'&&apT===8&&x.original.share_pct===8&&x.share_pct===12,JSON.stringify([x.status,apT,x.original.share_pct]));
 const tgtApproved=await page.evaluate(()=>window.__dbg.planQ({plants:null},'FY27-Q3').tgt);
 /* proposer cannot approve; advance */
 await page.evaluate(k=>window.__desk&&0,key);
 await page.evaluate(k=>{document.querySelector('[data-act="pot-edit"][data-id="'+k+'"]').click()},key);await page.waitForTimeout(300);
 await page.click('[data-act="pot-adv"]');await page.waitForTimeout(500);x=await get();ok('Draft -> Discussed (reason/date/participants present)',x.status==='Discussed',x.status);
 await page.evaluate(k=>{document.querySelector('[data-act="pot-edit"][data-id="'+k+'"]').click()},key);await page.waitForTimeout(300);
 await page.click('[data-act="pot-adv"]');await page.waitForTimeout(500);x=await get();ok('Branch manager cannot approve (stays Discussed)',x.status==='Discussed',x.status);
 const store2=await page.evaluate(()=>window.__mockStore());await page.context().close();
 /* SP Sir approves */
 const {page:p2}=await open(browser,{store:store2,viewer:{email:'spa@virgoasia.com',name:'SP Sir'}});await p2.waitForTimeout(2500);
 await p2.evaluate(()=>{location.hash='#/admin'});await p2.waitForTimeout(500);await p2.click('[data-t="potential"]').catch(()=>{});await p2.waitForTimeout(300);
 await p2.evaluate(k=>{document.querySelector('[data-act="pot-edit"][data-id="'+k+'"]').click()},key);await p2.waitForTimeout(300);
 await p2.click('[data-act="pot-adv"]');await p2.waitForTimeout(600);
 x=await p2.evaluate(k=>window.__dbg.S.potential.find(p=>p._id===k),key);
 ok('SP Sir approves -> current 12%, original stays 8%',x.status==='Approved'&&x.approved.share_pct===12&&x.original.share_pct===8,JSON.stringify([x.status,x.approved&&x.approved.share_pct,x.original&&x.original.share_pct]));
 /* lock quarter, then edit refused */
 await p2.evaluate(()=>{document.querySelector('[data-act="plan-lock"][data-q="FY27-Q3"]').click()});await p2.waitForTimeout(3500);
 const lk=await p2.evaluate(()=>[window.__dbg.S.periods['FY27-Q3']&&window.__dbg.S.periods['FY27-Q3'].plan_locked,window.__dbg.S.potential.filter(p=>p.fy_quarter==='FY27-Q3'&&p.status==='Locked').length]);
 ok('Lock quarter freezes Approved targets',lk[0]===true&&lk[1]>0,JSON.stringify(lk));
 await p2.evaluate(k=>{document.querySelector('[data-act="pot-edit"][data-id="'+k+'"]').click()},key);await p2.waitForTimeout(300);
 const dd=await p2.innerText('#dlg');ok('locked quarter dialog is read-only (no save button)',/locked/i.test(dd)&&!/Save revision/.test(dd),'');
 await p2.context().close()}
console.log(res.join('\n'));
await browser.close();
