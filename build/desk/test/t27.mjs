import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const base=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
ok('demo store carries demo masters',!!base['salesmaster/main']&&base['salesmaster/main'].demo&&!!base['itemmeta/main']&&base['itemmeta/main'].demo,'');
for(const mode of ['master','nomaster']){
 const store=JSON.parse(JSON.stringify(base));if(mode==='nomaster'){delete store['salesmaster/main']}
 for(const email of ['se.s1@demo','se.s2@demo']){
  if(!store['users/'+email.split('@')[0].replace('.','')]&&email==='se.s2@demo'){}
  const {page,errs}=await open(browser,{store,viewer:{email,name:email}});await page.waitForTimeout(3000);
  const name=email==='se.s1@demo'?'DEMO Sales 1':'DEMO Sales 2';
  const r=await page.evaluate((name)=>{const d=window.__dbg,ctx=d.viewCtx(),sc=d.scopeOf(d.effUser());const o=d.figs({},ctx);
   const own=d.sumF({sp:name},d.resolvePeriod(ctx.f,d.TODAY()).cur).n;
   const plantWide=d.planW({plants:null},d.resolvePeriod(ctx.f,d.TODAY()).cur);
   return {sp:ctx.base.sp,A:o.A,own:own,tgt:o.tgt,pot:o.pot,plantTgt:plantWide.tgt,plants:d.DS.plants.join(','),keys:Object.keys(d.DS.spIdx).join('|')}},name);
  ok(`${mode} ${email}: own key resolved`,r.sp===name,JSON.stringify(r.sp));
  ok(`${mode} ${email}: only own salesperson in the data`,r.keys===name,r.keys);
  ok(`${mode} ${email}: actual equals own`,Math.abs(r.A-r.own)<1&&r.A>0,r.A+' vs '+r.own);
  ok(`${mode} ${email}: target is the person's, not the plant-wide plan`,(r.tgt==null||r.tgt<r.plantTgt*0.5)&&(r.pot==null||true),`tgt ${r.tgt} plant-wide ${r.plantTgt}`);
  for(const pg of ['overview','sales','team','receivables']){
   await page.evaluate((pg)=>{location.hash='#/'+pg},pg);await page.waitForTimeout(1800);
   const t=await page.innerText('#pg').catch(()=> '');
   const others=['DEMO Sales 1','DEMO Sales 2','DEMO Sales 3','DEMO Sales 4','DEMO Sales 5','DEMO Sales 6','DEMO Sales 7'].filter(n=>n!==name&&t.includes(n));
   ok(`${mode} ${email} ${pg}: no other salesperson named`,!others.length&&!/Target revision|Salesperson leaderboard/i.test(t),others.join()+t.slice(0,60).replace(/\n/g,' '));
  }
  if(errs.filter(e=>!/ERR_FAILED/.test(e)).length)console.log('ERRS',errs);
  await page.context().close();
 }
}
console.log(res.join('\n'));await browser.close();
