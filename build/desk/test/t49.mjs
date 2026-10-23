import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.join(','))).join('\n');
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(collections|backups|uploads|rejects)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);
const ms=p=>page.evaluate(p=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>new RegExp(p).test(k))),p);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(n=>window.__desk.U&&window.__desk.U.name===n&&['mapping','validated','done'].includes(window.__desk.U.stage),f.split('/').pop(),{timeout:60000});await page.waitForTimeout(300)};
const CH=['#','BRANCHNAME','DOCNUM','DOCDATE','DOCTYPE','PAYMENTMEANS','ACCOUNT','ACCOUNTNAME','CARDCODE','CARDNAME','CITY','CHECK_DATE','CHECKNO','CHECKSUM','TARNSFERREF','TRANSFER_DATE','TRANSFERSUM','CASHSUM','REMARKS','JOURNALREMARK'];
const crow=(n,amt)=>[n,'DEMO plant 1012',n,'10/08/2026','C','Bank','','','DEMOCU1','C1','','','',0,'','',amt,0,'',''];
const load=async(name,rows)=>{const f=AF+name;fs.writeFileSync(f,csvOf(CH,rows));await up(f);await page.click('[data-act="coll-validate"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:20000});await page.waitForTimeout(700)};
const undo=async re=>{await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(500);await page.click('[data-act="u-reset"]').catch(()=>{});
  const id=await page.evaluate(re=>Object.entries(window.__mockStore()).filter(([k,v])=>k.startsWith('uploads/')&&v.file&&new RegExp(re).test(v.file)&&v.status!=='Undone').sort((a,b)=>a[1].at<b[1].at?1:-1).map(([k])=>k.slice(8))[0],re);
  await page.click('[data-act="hist-undo"][data-id="'+id+'"]');await page.waitForTimeout(600);const dt=await page.innerText('#dlg');const btn=await page.innerText('[data-act="undo-go"]');
  await page.click('[data-act="undo-go"]');await page.waitForTimeout(5000);const after=await page.innerText('#dlg').catch(()=>'');await page.click('[data-act="dlg-close"]').catch(()=>{});return {id,dt,btn,after}};
/* D1 without a backup: the "removed" wording stays */
await load('Incoming_Payment_Report_-2026-08-01_to_2026-08-31 a.csv',[crow(1,1000)]);
let u=await undo(' a\\.csv');
ok('D1: with no backup the message still says Removed ... Upload these months again',/Removed 1 plant-months/.test(u.after)&&/Upload these months again/.test(u.after)&&!/Restored the previous data/.test(u.after),u.after.replace(/\s+/g,' ').slice(0,200));
/* D1 with a backup */
await load('Incoming_Payment_Report_-2026-08-01_to_2026-08-31 b.csv',[crow(1,1000)]);
await load('Incoming_Payment_Report_-2026-08-01_to_2026-08-31 c.csv',[crow(1,1000),crow(2,500)]);
u=await undo(' c\\.csv');
ok('D1: after a restoring Undo the dialog says "Restored the previous data for 1 plant-month" and not "Upload these months again"',/Restored the previous data for 1 plant-month/.test(u.after)&&!/Removed 1 plant-months|Upload these months again/.test(u.after),u.after.replace(/\s+/g,' ').slice(0,200));
let c=await ms('^collections/');ok('and the earlier data is back',c['collections/1012-2026-08']&&c['collections/1012-2026-08'].total===1000,'');
/* integrity: a tampered backup */
await load('Incoming_Payment_Report_-2026-08-01_to_2026-08-31 d.csv',[crow(1,1000),crow(2,700)]);
const bk=await ms('^backups/');const bid=Object.keys(bk)[0];
await page.evaluate(async ([id,doc])=>{await window.__desk.dset(id,Object.assign({},doc,{ck:'bad'}))},[bid,bk[bid]]);await page.waitForTimeout(600);
const chk=await page.evaluate(()=>{const g=window.__desk;const id=g.bkFor?Object.keys(window.__mockStore()).filter(k=>k.startsWith('uploads/')).map(k=>k.slice(8)):[];return id.map(i=>[i,g.bkCheck(i).ok])});
u=await undo(' d\\.csv');
ok('integrity: the dialog warns "Backup incomplete: Undo will remove these months; upload them again" and the button says so',/Backup incomplete: Undo will remove these months; upload them again/.test(u.dt)&&/Undo and remove these months/.test(u.btn),u.dt.replace(/\s+/g,' ').slice(0,300)+' | '+u.btn);
c=await ms('^collections/');
ok('integrity: nothing is restored; the months are removed and the result says upload them again',!c['collections/1012-2026-08']&&/Backup incomplete/.test(u.after)&&/Upload these months again/.test(u.after),u.after.replace(/\s+/g,' ').slice(0,200));
/* minor: plan 0, actual above 0 on a lower-is-better KPI */
const a=await page.evaluate(()=>{const f=window.__desk.achLower;return [f(5,0),f(0,0),f(3,10)]});
ok('plan 0 with actual above 0 is "Over plan"; actual 0 is "Within plan"',a[0].over===true&&a[1].within===true&&a[2].ach>0,JSON.stringify(a));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
