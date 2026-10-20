import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
/* ---- Today cap (check 2) ---- */
for(const cap of [5,3,20]){
  const st=JSON.parse(JSON.stringify(store));st['users/bm_a_demo'].today_cap=cap;
  const {page}=await open(browser,{store:st,viewer:{email:'bm.a@demo',name:'BM'}});await page.waitForTimeout(2500);
  const r=await page.evaluate(()=>{const d=window.__dbg,u=d.effUser(),c=d.todayCandidates(u);return {cands:c.length,cards:document.querySelectorAll('.acard').length,txt:(document.querySelector('.kpis.tiles')||{}).innerText}});
  ok(`today cap ${cap}: cards`,r.cards===Math.min(cap,r.cands),`cands ${r.cands} cards ${r.cards}`);
  if(cap===5)console.log((r.txt||'').replace(/\n+/g,' | '));
  await page.context().close();
}
/* ---- QoQ crossover (check 9) ---- */
{const {page}=await open(browser,{store,viewer:{email:'data@virgoasia.com'}});await page.waitForTimeout(2500);
 const r=await page.evaluate(()=>{const d=window.__dbg;const f={plants:null};
  const q1=d.resolvePeriod({mode:'QTD',q:'FY27-Q1'},'2026-10-20');
  const A=d.sumF(f,q1.cur).n,P=d.sumF(f,q1.prior).n,Q4=d.sumF(f,d.qMonths('FY26-Q4')).n,Q1L=d.sumF(f,d.qMonths('FY26-Q1')).n;
  const cur=d.resolvePeriod({mode:'QTD'},'2026-10-20'),m=d.resolvePeriod({mode:'MTD',m:'2026-10'},'2026-10-20'),m2=d.resolvePeriod({mode:'MTD',m:'2026-04'},'2026-10-20');
  const c3=d.resolvePeriod({mode:'CUSTOM',from:'2026-04',to:'2026-05'},'2026-10-20');
  return {q1prior:q1.priorMonths.join(','),P:Math.round(P),Q4:Math.round(Q4),Q1L:Math.round(Q1L),curPrior:cur.priorMonths.join(','),mtdOct:m.priorMonths.join(','),mtdApr:m2.priorMonths.join(','),custom:c3.priorMonths.join(','),label:q1.priorLabel,all:JSON.stringify([q1,cur,m,m2,c3]).match(/2025-(0[4-9]|1[0-2])|2025-0[1-3]/g)}});
 ok('Q1 FY27 prior = Jan-Mar 2026 (Q4 FY26)',r.q1prior==='2026-01,2026-02,2026-03'&&r.P===r.Q4&&r.P!==r.Q1L,JSON.stringify(r));
 ok('Q3 FY27 prior = Jul-Sep 2026',r.curPrior==='2026-07,2026-08,2026-09',r.curPrior);
 ok('Oct MTD prior = Jul; Apr MTD prior = Jan; custom Apr-May prior = Jan-Feb',r.mtdOct==='2026-07'&&r.mtdApr==='2026-01'&&r.custom==='2026-01,2026-02',[r.mtdOct,r.mtdApr,r.custom].join(' / '));
 ok('no 2025 month appears in any resolved comparison for 2026 periods',!r.all,JSON.stringify(r.all));
 /* worked example from comparison-basis: Oct 15 of 25 WD, Jul 26 WD */
 const wk=await page.evaluate(()=>{const d=window.__dbg;d.CFG.holidays='';return [d.WD('2026-10'),d.WD('2026-07'),d.WD('2026-08'),d.walk(['2026-07','2026-08','2026-09'],40).map(x=>x.frac.toFixed(4)).join(',')]});console.log('WD',wk);
 /* stretch hand calc (check 12) */
 const sh=await page.evaluate(()=>{const d=window.__dbg;const s=[400,420,410,430,450,445,465,480,470,500,520,540];const t=d.trendStats(s);return {avg:t.avg,qoqs:t.qoqs.map(x=>+x.toFixed(2)),ma:t.ma.map(x=>x==null?null:+x.toFixed(2)),slope:t.slope,icpt:t.icpt,dir:t.dir,cases:[550,620,570,572,589.38].map(x=>{const r=d.stretchOf(x,540,t);return [x,+r.required.toFixed(2),+r.threshold.toFixed(2),r.state]})}});
 ok('avg QoQ = 2.8094 (30.91/11)',Math.abs(sh.avg-2.8094)<0.0006,String(sh.avg));
 ok('QoQ steps match worked table',JSON.stringify(sh.qoqs)==='[5,-2.38,4.88,4.65,-1.11,4.49,3.23,-2.08,6.38,4,3.85]',JSON.stringify(sh.qoqs));
 ok('MA4 matches worked table',JSON.stringify(sh.ma.slice(3))==='[415,427.5,433.75,447.5,460,465,478.75,492.5,507.5]',JSON.stringify(sh.ma));
 ok('slope 11.82 intercept 384.02, rising',Math.abs(sh.slope-11.8182)<0.01&&Math.abs(sh.icpt-384.0152)<0.02&&sh.dir==='rising',sh.slope+' '+sh.icpt+' '+sh.dir);
 ok('Stretch: 550 no, 620 yes, 570 no, 572 yes, 589.38 yes',JSON.stringify(sh.cases.map(c=>c[3]))==='["ok","stretch","ok","stretch","stretch"]',JSON.stringify(sh.cases));
 await page.context().close()}
/* ---- source scan: no last-year comparison anywhere ---- */
const src=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const bad=[...src.matchAll(/shiftYm\([^)]*,\s*-?12\)|priorYear|last year|lastYear|\bYoY\b|same month last|getFullYear\(\)\s*-\s*1/gi)].map(m=>m[0]);
ok('source has no 12-month shift or last-year wording',bad.length===0,JSON.stringify(bad));
fs.writeFileSync(SP+'t6.txt',res.join('\n'));
console.log(res.join('\n'));
await browser.close();
