import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
Object.keys(store).forEach(k=>{if(k.startsWith('followups/'))delete store[k]});
/* keep only the example action so other drafts do not interfere */
Object.keys(store).forEach(k=>{if(k.startsWith('actions/')&&k!=='actions/DEMO_LAD')delete store[k]});
store['actions/DEMO_LAD'].due='2026-10-22';store['actions/DEMO_LAD'].created='2026-10-15T05:00:00.000Z';store['actions/DEMO_LAD'].thread=[];
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
const {page}=await open(browser,{store,viewer:{email:'coord.a@demo',name:'Coord'},today:'2026-10-20'});
await page.waitForTimeout(2500);
async function day(d,load=true){
  await page.evaluate(d=>{localStorage.setItem('desk-today',d)},d);
  if(!load)return [];
  await page.evaluate(async()=>{const x=window.__dbg;x.DS.cache={};x.S.ladSig=null;x.S.engSig=null});
  await page.evaluate(async()=>{await window.__dbg.runLadder()});
  await page.waitForTimeout(400);
  return page.evaluate(()=>window.__dbg.S.followups.filter(f=>f.action_id==='DEMO_LAD').sort((a,b)=>a.created_day<b.created_day?-1:a.created_day>b.created_day?1:(a.step<b.step?-1:1)).map(f=>f.step+'@'+f.created_day+' od'+f.days_overdue+' to:'+f.to_email+(f.cc_email?' cc:'+f.cc_email:'')));
}
const log=async(d,load)=>{const r=await day(d,load);return r};
let r;
r=await log('2026-10-20');ok('Tue 20 Oct (due-2): no draft',r.length===0,JSON.stringify(r));
r=await log('2026-10-21');ok('Wed 21 Oct: Reminder to S1',r.length===1&&/^Reminder@2026-10-21.*se.s1@demo/.test(r[0]),JSON.stringify(r));
r=await log('2026-10-22');ok('Thu 22 Oct (due day): none new',r.length===1,JSON.stringify(r));
r=await log('2026-10-23');ok('Fri 23 Oct: L1 to S1 (overdue 1)',r.length===2&&/L1@2026-10-23 od1 to:se.s1@demo/.test(r[1]),JSON.stringify(r));
r=await log('2026-10-24');ok('Sat 24 Oct: none',r.length===2,JSON.stringify(r));
await log('2026-10-25',false);
r=await log('2026-10-26');ok('Mon 26 Oct (Sun skipped): L2 overdue 4 to bm.a cc S1',r.length===3&&/L2@2026-10-26 od4 to:bm.a@demo cc:se.s1@demo/.test(r[2]),JSON.stringify(r));
r=await log('2026-10-27');ok('Tue 27 Oct: none',r.length===3,JSON.stringify(r));
r=await log('2026-10-29');ok('Thu 29 Oct: L3 to hod.sales',r.length===4&&/L3@2026-10-29 od7 to:hod.sales@demo/.test(r[3]),JSON.stringify(r));
const d3=await page.evaluate(()=>{const f=window.__dbg.S.followups.find(f=>f.step==='L2'&&f.action_id==='DEMO_LAD');return {subj:f.subject,wa:f.wa_text,link:f.link,body:f.body}});
console.log(d3.subj,'\n',d3.wa,'\n',d3.body);
ok('L2 text says overdue 4 days',/overdue 4 days/i.test(d3.subj)&&/4 days overdue/.test(d3.wa),'');
/* nothing auto-sends: no mailto/wa opened, drafts stay Drafted until marked */
ok('every draft is Drafted (nothing auto-sent)',await page.evaluate(()=>window.__dbg.S.followups.every(f=>f.status==='Drafted')),'');
/* gap variant */
const st2=JSON.parse(JSON.stringify(store));
const p2=await open(browser,{store:st2,viewer:{email:'coord.a@demo',name:'Coord'},today:'2026-11-05'});await p2.page.waitForTimeout(2500);
const gap=[];for(const d of ['2026-11-05','2026-11-06','2026-11-07','2026-11-08']){await p2.page.evaluate(d=>localStorage.setItem('desk-today',d),d);await p2.page.evaluate(async()=>{const x=window.__dbg;x.S.ladSig=null;await x.runLadder()});await p2.page.waitForTimeout(300);gap.push(await p2.page.evaluate(()=>window.__dbg.S.followups.filter(f=>f.action_id==='DEMO_LAD').sort((a,b)=>a.created_day<b.created_day?-1:a.created_day>b.created_day?1:(a.step<b.step?-1:1)).map(f=>f.step+' od'+f.days_overdue).join(',')))}
ok('Gap variant: L1 on 5 Nov (14 days), L2 6 Nov, L3 7 Nov, nothing 8 Nov',gap.join(' / ')==='L1 od14 / L1 od14,L2 od15 / L1 od14,L2 od15,L3 od16 / L1 od14,L2 od15,L3 od16',gap.join(' / '));
/* Mark sent + dismissal; closed-in-time stops */
await page.evaluate(()=>{location.hash='#/actions'});await page.waitForTimeout(500);
console.log(res.join('\n'));
await browser.close();
