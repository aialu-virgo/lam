import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const OUT=SP+'theme/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();
const {page}=await open(browser,{store,viewer:{email:'data@virgoasia.com',name:'V'},size:{width:1440,height:900}});await page.waitForTimeout(4000);
await page.evaluate(()=>{location.hash='#/overview'});await page.waitForTimeout(2500);
for(const th of ['light','dark']){await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),th);await page.waitForTimeout(500);await page.screenshot({path:OUT+'ours-overview-'+th+'.png'})}
const cs=await page.evaluate(()=>{const g=(e)=>getComputedStyle(e);const b=g(document.body),s=g(document.querySelector('.side')),c=g(document.querySelector('.card'));return {body:b.backgroundColor,side:s.backgroundColor,card:c.backgroundColor,shadow:c.boxShadow}});console.log('ours dark',JSON.stringify(cs));
/* theirs */
const ctx=await browser.newContext({viewport:{width:1440,height:900}});const p2=await ctx.newPage();
await p2.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file:'))return r.continue();return r.abort()});
try{await p2.goto('file:///root/.claude/projects/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/tool-results/artifact-a36b12c8-1791949186-f552.html',{timeout:30000});await p2.waitForTimeout(4000);
 for(const th of ['light','dark']){await p2.evaluate(t=>document.documentElement.setAttribute('data-theme',t),th);await p2.waitForTimeout(500);await p2.screenshot({path:OUT+'reference-overview-'+th+'.png'})}
 console.log('theirs',await p2.evaluate(()=>{const g=e=>e?getComputedStyle(e):null;const b=g(document.body),s=g(document.querySelector('aside')),c=g(document.querySelector('.card'));return JSON.stringify({body:b.backgroundColor,side:s&&s.backgroundColor,card:c&&c.backgroundColor,shadow:c&&c.boxShadow,text:document.body.innerText.slice(0,120)})}));
}catch(e){console.log('theirs failed',e.message)}
await browser.close();
