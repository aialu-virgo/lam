import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const pages=['overview','sales','orders','receivables','inventory','today','actions','team','intake','admin'];
const out=[];
for(const [w,h] of [[360,740],[768,1000],[1440,900]]) for(const scheme of ['light','dark']){
  const {page,errs}=await open(browser,{store,size:{width:w,height:h},scheme});
  await page.waitForTimeout(2500);
  for(const pg of pages){
    await page.evaluate(p=>{location.hash='#/'+p},pg);await page.waitForTimeout(1200);
    const m=await page.evaluate(()=>{const de=document.documentElement;const wide=[];document.querySelectorAll('#pg *').forEach(e=>{const r=e.getBoundingClientRect();if(r.right>innerWidth+1&&r.width>0){let p=e,clipped=false;while(p&&p!==document.body){const cs=getComputedStyle(p);if(p!==e&&(cs.overflowX==='auto'||cs.overflowX==='scroll')){clipped=true;break}p=p.parentElement}if(!clipped&&wide.length<3)wide.push(e.tagName+'.'+e.className+' '+Math.round(r.right))}});return {sw:de.scrollWidth,iw:innerWidth,wide}});
    out.push(`${w} ${scheme} ${pg}: scrollWidth ${m.sw}/${m.iw} ${m.sw>m.iw?'OVERFLOW':'ok'} ${m.wide.join(';')}`);
    if(pg==='overview'||pg==='today'||pg==='sales')await page.screenshot({path:SP+`r-${w}-${scheme}-${pg}.png`,fullPage:true});
  }
  const e=errs.filter(x=>!/ERR_FAILED/.test(x));if(e.length)out.push('ERRS '+e.join(' ; '));
  await page.context().close();
}
console.log(out.join('\n'));
await browser.close();
