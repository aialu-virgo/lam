import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
const {page,errs}=await open(browser,{store,viewer:{email:'data@virgoasia.com'}});await page.waitForTimeout(2500);
await page.evaluate(()=>{location.hash='#/team'});await page.waitForTimeout(2500);
const people=await page.evaluate(()=>[...document.querySelectorAll('[data-act="team-who"]')].map(r=>[r.getAttribute('data-e'),r.innerText.split('\n')[0],r.innerText.split('\t')[1]]));
for(const [em,name] of people){
  await page.evaluate(e=>{document.querySelector('[data-act="team-who"][data-e="'+e+'"]').click()},em);await page.waitForTimeout(1200);
  const info=await page.evaluate(()=>{const c=document.querySelector('[id^="trend-"]');return {card:!!c,bars:document.querySelectorAll('.bar-q').length,tgt:document.querySelectorAll('svg.trend line[stroke="var(--orange)"]').length,ma:!!document.querySelector('svg.trend polyline'),trend:!!document.querySelector('svg.trend line[stroke-dasharray="6 4"]'),ach:[...document.querySelectorAll('svg.trend text.a-green,svg.trend text.a-orange,svg.trend text.a-red')].length,empty:!!document.querySelector('#pg .empty.dashed, #pg .empty'),title:c?c.querySelector('h2').innerText:''}});
  const good=info.card&&info.bars>=8&&info.ma;
  ok(`${name}: 12-quarter trend card (bars ${info.bars}, target markers ${info.tgt}, MA ${info.ma}, trend line ${info.trend}, ach labels ${info.ach})`,good||info.empty,info.title);
  if(good){await page.evaluate(()=>{const r=[...document.querySelectorAll('.bar-q')];r[r.length-2].dispatchEvent(new MouseEvent('click',{bubbles:true}))});await page.waitForTimeout(500);
    await page.locator('#drillp [data-act="drill-m"]').first().click();await page.waitForTimeout(1500);
    const tb=await page.locator('#drillp table').count(),rows=await page.locator('#drillp table').nth(1).locator('tbody tr').count().catch(()=>0);
    const hd=tb>1?(await page.locator('#drillp table').nth(1).locator('thead th').allInnerTexts()).slice(0,4).join(','):'';
    ok(`${name}: bar > quarter > month > documents (${rows} docs; ${hd})`,tb===2&&/SYSTEM,DOC TYPE,DOC NO,DATE/i.test(hd),'')}
}
console.log(res.join('\n'));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)));
await page.screenshot({path:SP+'s-acc.png',fullPage:false});
await browser.close();
