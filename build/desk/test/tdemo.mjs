import { chromium } from './run.mjs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const ctx=await browser.newContext({viewport:{width:1440,height:900}});const page=await ctx.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file:')||u.includes('xlsx'))return r.continue();return r.abort()});
await page.goto('file:///home/user/lam/build/demo-site/dist/index.html');
await page.waitForFunction(()=>document.body.classList.contains('dm-login'),null,{timeout:150000});
let t=await page.innerText('body');
ok('login shows the Virgo logo slot and no old V circle',/Virgo/.test(t)&&!(await page.$('.logo')),'');
await page.screenshot({path:SP+'theme/demo-login.png'});
async function login(user,newpw){
  await page.fill('#dl-u',user);await page.fill('#dl-p','Demo@123');await page.click('#dl-form button[type=submit]');
  await page.waitForSelector('#dl-n1',{timeout:20000});await page.fill('#dl-n1',newpw);await page.fill('#dl-n2',newpw);await page.click('#dl-form button[type=submit]');
  await page.waitForSelector('.side',{timeout:150000});await page.waitForTimeout(3500);
}
await login('demo.salesexec@demo','Newpass1x');
t=await page.innerText('body');
ok('sales exec opens the Desk with the new brand header',/Lam Performance Desk|Lam Desk/.test(t)&&/DEMO/.test(t),t.slice(0,80).replace(/\n/g,' '));
const sc=await page.evaluate(()=>{const d=window.__dbg;return {role:d.effUser().role,keys:Object.keys(d.DS.spIdx).join('|'),brand:getComputedStyle(document.querySelector('.btn.pri')||document.body).backgroundColor}});
ok('sales exec scoped to own salesperson only',sc.role==='Sales executive'&&/^DEMO Sales \d$/.test(sc.keys),JSON.stringify(sc));
await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(2500);
t=await page.innerText('#pg');ok('quantity shown in sheets with sq ft secondary',/sheets/.test(t),'');
await page.screenshot({path:SP+'theme/demo-sales-exec.png'});
console.log(res.join('\n'));console.log(errs);await browser.close();
