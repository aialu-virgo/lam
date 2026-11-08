import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const go=async(page,h,w)=>{await page.evaluate(h=>{location.hash=h},h);await page.waitForTimeout(w||2200)};
const tx=async page=>(await page.innerText('#pg')).replace(/[ \t]+/g,' ');
const clone=o=>JSON.parse(JSON.stringify(o));
const realize=st=>{Object.keys(st).forEach(k=>{if(/^cells\//.test(k))Object.values(st[k].plants).forEach(p=>delete p.demo)});return st};
/* ===== 1 and 2: a real potential of 1,000 against real sales: Share % guard, and the R8 texts ===== */
const bad=realize(clone(store));
Object.keys(bad).forEach(k=>{if(/^potential\//.test(k))delete bad[k].demo;if(/^potential\/fy27_q3_1001_laminate/.test(k)){const p=bad[k];p.potential_value_inr=1000;p.potential_qty_sheets=10;p.potential_qty_sqft=320;if(p.approved){p.approved.potential_value_inr=1000;p.approved.potential_qty_sqft=320}if(p.original)p.original.potential_value_inr=1000}});
const gq=await open(browser,{store:bad});await gq.page.waitForTimeout(9000);
const sh=await gq.page.evaluate(()=>{const g=window.__desk;const c=g.viewCtx();const o=g.figs({plant:'1001',group:'Laminate'},c,{noTrend:true});return {share:o.share,chk:!!o.shareCheck,ach:o.ach,check:!!o.check}});
ok('D57-1: a real potential that gives a share above 300% is not printed as a number (figs)',sh.share==null&&sh.chk,JSON.stringify(sh));
await gq.page.evaluate(()=>{const S=window.__desk.S;S.f.plant='1001';S.f.group='Laminate'});await go(gq.page,'#/sales',2500);
await gq.page.evaluate(()=>{const s=document.getElementById('f-plant');if(s){s.value='1001';s.dispatchEvent(new Event('change',{bubbles:true}))}const g=document.getElementById('f-group');if(g){g.value='Laminate';g.dispatchEvent(new Event('change',{bubbles:true}))}});await gq.page.waitForTimeout(2500);
const sl=await tx(gq.page);
ok('D57-1: Sales shows "Check potential" and no absurd percentage anywhere',/Check potential/.test(sl)&&!/\b\d{4,}(\.\d)?%/.test(sl),(sl.match(/\d{4,}(\.\d)?%/)||[''])[0]);
await go(gq.page,'#/overview',2500);const ov=await tx(gq.page);
ok('D57-1: Overview shows "Check potential" and no absurd percentage',/Check potential/.test(ov)&&!/\b\d{4,}(\.\d)?%/.test(ov),(ov.match(/\d{4,}(\.\d)?%/)||[''])[0]);
const acts=await gq.page.evaluate(()=>Object.entries(window.__mockStore()).filter(([k])=>/^actions\/R8_/.test(k)).map(([k,v])=>[k,v.title,v.next_step,v.source&&v.source.label,v.owner]));
const potA=acts.find(a=>/_pot_/.test(a[0])||/_pot$/.test(a[0])||/Check potential/.test(a[1])),tgtA=acts.find(a=>/Check target/.test(a[1]));
ok('D57-1: an R8 "Check potential" action is raised for the Super admin',!!potA&&potA[4]==='data@virgoasia.com'&&/Share of potential is over 300%: check the potential \(/.test(potA[2]),JSON.stringify(potA));
ok('D57-2: the R8 target text says "Achievement is over 300% of the target: check the target (plant, group, quarter)."',!!tgtA&&/Achievement is over 300% of the target: check the target \([^)]+\)/.test(tgtA[2]),JSON.stringify(tgtA&&tgtA[2]));
ok('D57-2: no R8 title, source or next step prints a percentage of three or more digits',acts.length>=2&&acts.every(a=>!/\d{4,}\s?%/.test(a.slice(1,4).join(' '))),JSON.stringify(acts.map(a=>a[3])));
await go(gq.page,'#/today',2500);const td=await tx(gq.page);
ok('D57-2: the Today page never prints the absurd figure',!/\b\d{4,}%/.test(td)&&!/of the target to date/.test(td),'');
await gq.ctx.close();
/* ===== 5: a DEMO potential skipped against real sales says "Potential not set" ===== */
const real=realize(clone(store));
const rp=await open(browser,{store:real});await rp.page.waitForTimeout(4000);await go(rp.page,'#/sales',3000);const rs=await tx(rp.page);
ok('D57-5: Sales says "Potential not set" where a demo potential is skipped (cards and table), not a bare dash',/Share of potential\s*Potential not set/.test(rs)&&/Potential not set/.test(rs),(rs.match(/Share of potential[^\n]*/)||[''])[0]);
await rp.ctx.close();
/* ===== 3: partial label in plant-months, on the exact bar; label, value and aria-label agree ===== */
const part=clone(store);
for(const ym of ['2026-04','2026-05','2026-06']){const k='cells/INV_'+ym;if(part[k]){Object.keys(part[k].plants).slice(2).forEach(p=>delete part[k].plants[p])}}   /* Q1 FY27: 2 of 4 plants, all three months */
const pt=await open(browser,{store:part});await pt.page.waitForTimeout(4000);await go(pt.page,'#/sales',3000);
const lab=await pt.page.evaluate(()=>{
  const svg=document.querySelector('#pg svg.trend');const T=Array.from(svg.querySelectorAll('text'));
  const byQ={};T.filter(t=>/^Q\d \d\d\*?$/.test(t.textContent.trim())).forEach(t=>{byQ[t.textContent.trim()]=t.getAttribute('x')});
  const out={};for(const q of Object.keys(byQ)){const x=byQ[q];const same=T.filter(t=>t.getAttribute('x')===x).map(t=>t.textContent.trim());const i=same.indexOf('partial:');out[q]={partial:i>=0,label:i>=0?same[i+1]:null,value:(T.find(t=>t.classList.contains('vl')&&t.getAttribute('x')===x)||{}).textContent||null}}
  return {out:out,aria:svg.getAttribute('aria-label')}});
const q1=lab.out['Q1 27'],q0=lab.out['Q1 26'];
ok('D57-3: Q1 FY27 (2 of 4 plants, all 3 months) reads "6 of 12 plant-months" under its own bar, with a printed value',q1&&q1.partial&&q1.label==='6 of 12 plant-months'&&/Cr$/.test(q1.value||''),JSON.stringify(q1));
ok('D57-3: Q1 FY26 (every plant has 2 of 3 months) reads "2 of 3 months" beside its printed value',q0&&q0.partial&&q0.label==='2 of 3 months'&&/Cr$/.test(q0.value||''),JSON.stringify(q0));
ok('D57-3: the aria-label agrees: the partial quarters are not "not loaded" and carry their label',/Q1 FY26 partial, 2 of 3 months, ₹/.test(lab.aria)&&!/Q1 FY26 not loaded/.test(lab.aria)&&/Q1 FY27 partial, 6 of 12 plant-months, ₹/.test(lab.aria),lab.aria.slice(0,260));
await go(pt.page,'#/overview',3000);
const ob=await pt.page.evaluate(()=>{const svg=Array.from(document.querySelectorAll('#pg svg')).find(s=>/Quarterly sheets/.test(s.getAttribute('aria-label')||''));const t=svg.textContent;return {has:/6 of 12 plant-months/.test(t)&&/2 of 3 months/.test(t),old:/months missing|of \d+ plants/.test(t)}});
ok('D57-3: the Overview uses the same wording and no longer says "months missing"',ob.has&&!ob.old,JSON.stringify(ob));
await pt.ctx.close();
/* ===== 4: value labels sit on a halo drawn after every line, both themes, both widths ===== */
for(const [w,scheme] of [[1440,'light'],[1440,'dark'],[360,'light'],[360,'dark']]){
  const c=await open(browser,{store:clone(store),size:{width:w,height:900},scheme});await c.page.waitForTimeout(3500);
  const chk=async(h,sel)=>{await go(c.page,h,3000);return c.page.evaluate(sel=>{const svg=Array.from(document.querySelectorAll('#pg svg')).find(s=>sel==='trend'?s.classList.contains('trend'):/Quarterly sheets/.test(s.getAttribute('aria-label')||''));const kids=Array.from(svg.children);const labels=kids.filter(e=>e.tagName==='text'&&e.classList.contains('vl'));const lines=kids.filter(e=>/^(line|polyline|path)$/.test(e.tagName)&&!(e.getAttribute('stroke')||'').includes('var(--line)'));
    const lastLine=Math.max(-1,...lines.map(e=>kids.indexOf(e)));const first=Math.min(...labels.map(e=>kids.indexOf(e)));const cs=getComputedStyle(labels[0]);
    return {n:labels.length,after:first>lastLine,halo:cs.paintOrder.indexOf('stroke')===0&&cs.stroke!=='none'&&parseFloat(cs.strokeWidth)>=3,w:document.documentElement.scrollWidth}},sel)};
  const a=await chk('#/sales','trend'),b=await chk('#/overview','ox');
  ok('D57-4: '+w+'px '+scheme+': value labels are drawn after every line and have a halo (Sales and Overview trends)',a.n>=6&&a.after&&a.halo&&b.n>=6&&b.after&&b.halo&&b.w<=w,JSON.stringify([a,b]));
  await c.ctx.close();
}
console.log(res.join('\n'));await browser.close();
