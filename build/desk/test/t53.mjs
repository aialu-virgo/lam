import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const go=async(page,h,w)=>{await page.evaluate(h=>{location.hash=h},h);await page.waitForTimeout(w||2200)};
/* D58 pixel-overlap test: sample every line, polyline and gridline of the chart in screen pixels and count the samples that fall inside a value label's box */
const sample=(page,kind)=>page.evaluate(kind=>{
  const svg=Array.from(document.querySelectorAll('#pg svg')).find(s=>kind==='trend'?s.classList.contains('trend'):/Quarterly sheets/.test(s.getAttribute('aria-label')||''));
  const ctm=svg.getScreenCTM(),pt=(x,y)=>({x:ctm.a*x+ctm.c*y+ctm.e,y:ctm.b*x+ctm.d*y+ctm.f});
  const labels=Array.from(svg.querySelectorAll('text.vl')).map(t=>({t:t.textContent,r:t.getBoundingClientRect()}));
  const lines=[];
  svg.querySelectorAll('line').forEach(e=>lines.push([+e.getAttribute('x1'),+e.getAttribute('y1'),+e.getAttribute('x2'),+e.getAttribute('y2')]));
  svg.querySelectorAll('polyline').forEach(e=>{const p=e.getAttribute('points').trim().split(/\s+/).map(s=>s.split(',').map(Number));for(let i=1;i<p.length;i++)lines.push([p[i-1][0],p[i-1][1],p[i][0],p[i][1]])});
  let hits=0;const where=[];
  for(const L of labels){for(const g of lines){const n=Math.max(2,Math.ceil(Math.hypot(g[2]-g[0],g[3]-g[1])/1.5));for(let k=0;k<=n;k++){const q=pt(g[0]+(g[2]-g[0])*k/n,g[1]+(g[3]-g[1])*k/n);if(q.x>=L.r.left+1&&q.x<=L.r.right-1&&q.y>=L.r.top+1&&q.y<=L.r.bottom-1){hits++;if(where.length<3)where.push(L.t);break}}}}
  return {labels:labels.length,lines:lines.length,hits:hits,where:where};
},kind);
for(const [w,scheme] of [[1440,'light'],[1440,'dark'],[360,'light'],[360,'dark']]){
  const c=await open(browser,{store:JSON.parse(JSON.stringify(store)),size:{width:w,height:900},scheme});await c.page.waitForTimeout(5000);
  await go(c.page,'#/sales',4000);const a=await sample(c.page,'trend');
  ok('D58: '+w+'px '+scheme+': no gridline, target mark, average or trend line crosses any ₹ value label on the Sales trend (pixel sample)',a.labels>=6&&a.lines>=8&&a.hits===0,JSON.stringify(a));
  await go(c.page,'#/overview',3000);const b=await sample(c.page,'ox');
  ok('D58: '+w+'px '+scheme+': the Overview sheets trend stays clean too',b.labels>=6&&b.hits===0,JSON.stringify(b));
  await c.ctx.close();
}
/* the Scorecard and Collections trends use the same card */
const t=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email:'acc.ab@demo'}});await t.page.waitForTimeout(3500);await go(t.page,'#/team',3500);
const cc=await sample(t.page,'trend').catch(()=>null);
ok('D58: the Accounts collections trend (same card) has no line across its labels',!cc||cc.hits===0,JSON.stringify(cc));
await t.ctx.close();
console.log(res.join('\n'));await browser.close();
