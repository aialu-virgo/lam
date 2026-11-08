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
/* ---- plan workflow (check 11), now in the Targets & Potential tab (D70) ---- */
{const st=JSON.parse(JSON.stringify(store));
 const {page}=await open(browser,{store:st,viewer:{email:'bm.a@demo',name:'BM'}});await page.waitForTimeout(2500);
 const key='fy27_q3_1012_laminate_dealer';
 const get=()=>page.evaluate(k=>window.__dbg.S.potential.find(p=>p._id===k),key);
 const edit=async(p,f,v)=>{await p.fill('#tp-'+f+'-'+key,v);await p.dispatchEvent('#tp-'+f+'-'+key,'change');await p.waitForTimeout(250)};
 let x=await get();ok('seeded leaf is approved with original',x&&x.status==='Approved'&&x.original&&x.approved,x&&x.status);
 await page.evaluate(()=>{location.hash='#/targets'});await page.waitForTimeout(900);
 const trail=await page.evaluate(()=>{const d=document.querySelector('details.tp-row');d.open=true;return d.innerText});
 ok('row detail shows revision trail and sense-check',/Revision trail/i.test(trail)&&/Sense-check/i.test(trail),trail.slice(0,200));
 await edit(page,'share','12');await page.click('[data-act="tp-save"]');await page.waitForTimeout(700);
 x=await get();const apT=x.approved.share_pct;ok('new revision is Draft; current approved target unchanged; original kept',x.status==='Draft'&&apT===8&&x.original.share_pct===8&&x.share_pct===12,JSON.stringify([x.status,apT,x.original.share_pct]));
 await page.click('[data-act="tp-submit"]');await page.waitForSelector('#tp-s-reason');await page.click('[data-act="tp-submit-go"]');await page.waitForTimeout(300);
 let er=await page.innerText('#d-err');ok('submit without reason refused',/reason is required/i.test(er),er);
 await page.fill('#tp-s-reason','dealer survey up');await page.fill('#tp-s-part','Branch team');await page.click('[data-act="tp-submit-go"]');await page.waitForTimeout(700);
 x=await get();ok('Draft -> Discussed (reason/date/participants present)',x.status==='Discussed',x.status);
 const bmAp=await page.evaluate(k=>{const D=window.__dbg;return D.advanceDoc(D.S.potential.find(p=>p._id===k),D.effUser())},key);
 ok('Branch manager cannot approve (stays Discussed)',/Approval is by SP Sir/.test(bmAp.err||'')&&!(await page.$('[data-act="tp-approve"]')),JSON.stringify(bmAp.err));
 const store2=await page.evaluate(()=>window.__mockStore());await page.context().close();
 /* SP Sir approves */
 const {page:p2}=await open(browser,{store:store2,viewer:{email:'spa@virgoasia.com',name:'SP Sir'}});await p2.waitForTimeout(2500);
 await p2.evaluate(()=>{location.hash='#/targets'});await p2.waitForTimeout(900);
 await p2.check('[data-tp="sel"][data-key="'+key+'"]');await p2.click('[data-act="tp-approve"]');await p2.waitForTimeout(700);
 x=await p2.evaluate(k=>window.__dbg.S.potential.find(p=>p._id===k),key);
 ok('SP Sir approves -> current 12%, original stays 8%',x.status==='Approved'&&x.approved.share_pct===12&&x.original.share_pct===8,JSON.stringify([x.status,x.approved&&x.approved.share_pct,x.original&&x.original.share_pct]));
 /* lock quarter, then edit refused */
 await p2.click('[data-act="tp-lock-open"]');await p2.waitForSelector('[data-act="tp-lock-go"]');await p2.click('[data-act="tp-lock-go"]');await p2.waitForTimeout(3500);
 const lk=await p2.evaluate(()=>[window.__dbg.S.periods['FY27-Q3']&&window.__dbg.S.periods['FY27-Q3'].plan_locked,window.__dbg.S.potential.filter(p=>p.fy_quarter==='FY27-Q3'&&p.status==='Locked').length]);
 ok('Lock quarter freezes Approved targets',lk[0]===true&&lk[1]>0,JSON.stringify(lk));
 const dd=await p2.evaluate(()=>({inputs:document.querySelectorAll('[data-tp="pot"],[data-tp="share"]').length,bar:document.querySelector('.tp-sticky').innerText}));
 ok('locked quarter is read-only (no inputs, no save button)',dd.inputs===0&&/locked/i.test(dd.bar)&&!/Save draft/.test(dd.bar),JSON.stringify(dd));
 await p2.context().close()}
console.log(res.join('\n'));
await browser.close();
