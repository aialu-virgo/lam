import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';import { execFileSync } from 'child_process';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,2).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
/* ---- synthetic B1 file reproducing the problems: no LineNum, ISO text dates, odd categories and zones, junk, repeated lines, group-named customers, odd salesperson names ---- */
const g=G.invoices({shape:'B1',plants,months:['2026-08','2026-09'],docsPerPlantMonth:10,seed:5,dateStyle:'iso'});
const H=g.headers,ix=n=>H.indexOf(n);const rows=g.rows.map(r=>r.slice());
const cat=ix('Catagory'),zone=ix('Zone'),itype=ix('Invoice Type'),cn=ix('CardName'),cc=ix('CardCode'),spc=ix('Salesemployee'),pos=ix('Place of Supply');
rows.forEach((r,i)=>{
  if(i%9===0)r[cat]='  Decorative  Laminates ';
  if(i%11===0)r[cat]='decorative laminates door';
  if(i===3)r[cat]='ZZ Widget Panels';if(i===4)r[cat]='ZZ Widget Panels';
  if(i===5)r[cat]='';
  if(i%7===1)r[zone]='zone-3';if(i%7===2)r[zone]='ZONE 1';if(i===6)r[zone]='zz';if(i===8)r[zone]='Mars';
  if(i===10&&itype>=0)r[itype]='z';
  if(i%13===0&&!/VIRGO/.test(String(r[cn]).toUpperCase())){r[cc]='DEMOCU800001';r[cn]='DEMO Virgo Stores Pvt Ltd'}
  if(i%5===0)r[spc]='demo  sales 1';else if(i%5===1)r[spc]='DEMO Sales2';else if(i%5===2)r[spc]='D. Sales 3';else if(i%5===3)r[spc]='DEMO Saels 4';else r[spc]='DEMO Sales 6 East';
});
const nBefore=rows.length;rows.push(rows[20].slice(),rows[21].slice());/* two repeated lines */
fs.writeFileSync(AF+'b1.csv',csvOf(H,rows));
const trRows=[['CardCode','CardName','Tranfser'],['DEMOCU900001','DEMO VIRGO BRANCH TRANSFER','Y']];
fs.writeFileSync(AF+'transfers.csv',trRows.map(r=>r.join(',')).join('\n'));
const sheets=(name)=>{fs.writeFileSync(AF+name+'.json',JSON.stringify({out:AF+name+'.xlsx',sheets:name==='sheets'?[['Transfers',trRows],['DATA',[H].concat(rows.slice(0,40))]]:name==='onlytr'?[['Transfers',trRows]]:[['Empty',[]],['Notes',[['hello','world']]]]}));execFileSync('python3',[new URL('./mkxlsx.py',import.meta.url).pathname,AF+name+'.json'])};
sheets('sheets');sheets('onlytr');sheets('weird');
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(cells|inv|roll|uploads|transfers)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0});await page.waitForTimeout(3000);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const up=async f=>{const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForTimeout(2500)};
/* #1 wrong file */
await up(AF+'transfers.csv');
let t=await page.innerText('#i-upload');
ok('#1 transfer list recognised, offer to load it',/internal-transfer list/i.test(t)&&!!(await page.$('[data-act="u-load-as-transfers"]')),t.slice(t.indexOf('This file'),t.indexOf('This file')+90));
await page.click('[data-act="u-load-as-transfers"]');await page.waitForTimeout(2500);
ok('#1 transfer list loaded from the intake page',await page.evaluate(()=>window.__desk.S.transfers.length===1),'');
await page.click('[data-act="u-reset"]').catch(()=>{});
await up(AF+'weird.xlsx');t=await page.innerText('#i-upload');
ok('#1 empty/unknown workbook names the expected sheet and export',/Expected the B1 Combine Sale export/.test(t)&&/Sheets in the workbook/.test(t),t.slice(t.indexOf('headers match'),t.indexOf('headers match')+160));
await up(AF+'onlytr.xlsx');t=await page.innerText('#i-upload');ok('#1 workbook holding only the transfer list is offered as such',!!(await page.$('[data-act="u-load-as-transfers"]')),'');
await up(AF+'sheets.xlsx');await page.waitForTimeout(1000);
ok('#1 workbook with transfer sheet first: invoice sheet DATA is picked',await page.evaluate(()=>window.__desk.U.sheetPicked==='DATA'&&window.__desk.U.stage==='mapping'),await page.evaluate(()=>window.__desk.U.sheetPicked));
/* main B1 file */
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(200);await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
await page.click('[data-act="u-reset"]').catch(()=>{});
await up(AF+'b1.csv');await page.waitForTimeout(1200);
await page.click('[data-act="u-validate"]');await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.res&&window.__desk.U.stage==='validated',null,{timeout:90000});
const r=await page.evaluate(()=>{const r=window.__desk.U.res,a=r.af;return {good:r.good,rej:r.rejected,read:r.read,af:{dateKinds:a.dateKinds,lineSynth:a.lineSynth,dup:a.dupNoLine,catAlias:a.catAlias,catUnknown:a.catUnknown,catBlank:a.catBlank,zoneNorm:a.zoneNorm,zoneUnknown:a.zoneUnknown,junk:a.junk,xs:Object.keys(a.xferSuggest),sp:Object.keys(a.spNames).length}}});
console.log(JSON.stringify(r));
const pnl=await page.innerText('#i-upload');
ok('#3 ISO text dates accepted and shown in the panel',r.af.dateKinds.iso>0&&/YYYY-MM-DD/.test(pnl),JSON.stringify(r.af.dateKinds));
ok('#4 line numbers created in row order (stable) and repeated lines removed',r.af.lineSynth>0&&r.af.dup===2&&/line numbers created/i.test(pnl)&&/Repeated lines removed/.test(pnl),r.af.lineSynth+' / '+r.af.dup);
ok('#4 duplicates and junk-type rows are not rejects',r.rej===0&&r.af.junk.itype===1,String(r.rej));
ok('#5 group-named customers suggested, not applied',r.af.xs.includes('DEMOCU800001')&&/Customers named like the Virgo group/.test(pnl)&&!!(await page.$('[data-act="af-xf"]')),r.af.xs.join(','));
ok('#6 category spellings normalised and counted',r.af.catAlias>0&&/Category spellings normalised/.test(pnl),String(r.af.catAlias));
ok('#6 unknown category listed for one-click mapping; blank counted as needs source',r.af.catUnknown['ZZ Widget Panels']===2&&r.af.catBlank===1&&!!(await page.$('[data-act="af-map"][data-kind="category"]'))&&/Category blank/.test(pnl),JSON.stringify(r.af.catUnknown));
ok('#7 zone spellings normalised, unknown listed, junk counted',r.af.zoneNorm>0&&r.af.zoneUnknown['Mars']===1&&r.af.junk.zone===1&&/Junk values counted/.test(pnl),JSON.stringify([r.af.zoneNorm,r.af.zoneUnknown,r.af.junk]));
ok('#2 and #11 named as needing the source',/Credit notes are not in this export/.test(pnl)&&/Quarters with no history loaded/.test(pnl),'');
/* one-click mapping of the unknown category -> counts change, file checked again */
await page.selectOption('[id^="afm-category-"]','Laminate');await page.click('[data-act="af-map"][data-kind="category"]');
await page.waitForFunction(()=>window.__desk.U.stage==='validated'&&!window.__desk.U.res.af.catUnknown['ZZ Widget Panels'],null,{timeout:60000});
const sv=await page.evaluate(()=>window.__mockStore()['settings/alias_category']);
ok('#6 mapping saved to settings/alias_category and applied at once',sv&&sv.map&&sv.map['zz widget panels']==='Laminate','');
/* #5 one click adds to the transfer list and the file is checked again */
const xfBefore=await page.evaluate(()=>window.__desk.U.res.xfer.rows);
await page.click('[data-act="af-xf"]');await page.waitForFunction(()=>window.__desk.U.stage==='validated'&&!window.__desk.U.res.af.xferSuggest['DEMOCU800001'],null,{timeout:60000});
const xfAfter=await page.evaluate(()=>({x:window.__desk.U.res.xfer.rows,list:window.__desk.S.transfers.map(t=>t.code)}));
ok('#5 one click adds the customer to the transfer list; its rows are now excluded',xfAfter.x>xfBefore&&xfAfter.list.includes('DEMOCU800001'),xfBefore+' -> '+xfAfter.x);
/* #9 salesperson matching */
const sp=await page.evaluate(()=>{const n=Object.keys(window.__desk.U.res.af.spNames);return n.map(x=>[x,(window.__dbg.spMatch(x)||{}).how||null,(window.__dbg.spMatch(x)||{}).name||null])});
console.log(JSON.stringify(sp));
const how=Object.fromEntries(sp.map(x=>[x[0],x[1]]));
ok('#9 case and spacing, compact spelling, initials, close spelling match',!!how['demo  sales 1']&&!!how['DEMO Sales2']&&how['D. Sales 3']==='initials'&&/spelling/.test(how['DEMO Saels 4']||''),JSON.stringify(how));
ok('#9 name with extra text stays unmatched and shows suggestions',how['DEMO Sales 6 East']==null&&!!(await page.$('[data-act="af-sp"]')),'');
const before=await page.evaluate(()=>window.__dbg.matchStats().names+'');
await page.click('[data-act="af-sp"]');await page.waitForTimeout(1500);
const al=await page.evaluate(()=>({s:window.__mockStore()['settings/alias_salesperson'],m:window.__dbg.spMatch('DEMO Sales 6 East')}));
ok('#9 one click saves an alias that applies at view time',al.s&&Object.values(al.s.map).length===1&&al.m&&!al.m.ambiguous&&al.m.how==='saved alias',JSON.stringify(al.s&&al.s.map));
await page.screenshot({path:SP+'af/panel-1440.png',fullPage:true});
/* load it, check upload record carries the fixes summary */
await page.fill('#u-reason','test reload').catch(()=>{});await page.waitForTimeout(500);console.log('btn',await page.evaluate(()=>{const b=document.querySelector('[data-act="u-load"]');return [b&&b.disabled,window.__desk.U.stage,window.__desk.U.reason,!!document.querySelector('#u-reason')]}));await page.click('[data-act="u-load"]').catch(()=>{});await page.waitForTimeout(9000);
const upl=await page.evaluate(()=>Object.values(window.__mockStore()).filter(v=>v&&v.entity==='INV'&&v.file).map(v=>v.fixes));
ok('upload record keeps the fixes summary',upl.length===1&&upl[0]&&upl[0].line_numbers_created>0,JSON.stringify(upl[0]));
await page.context().close();
/* ---- sales employees ---- */
const hd=['Employee Code','FullName','*CompanyCode','Designation','Email','Zone','Mobile No.'];
const ppl=[['E-DMO/101','DEMO Alpha','1012','Sales Executive','a@demo.test','ZONE 1','9111111101'],['E-DMO-0102','DEMO Beta','1012','sales executive','b@demo.test','ZONE 1','9111111102'],['E-DMO/103','DEMO Gamma','','Sales  Executive','c@demo.test','ZONE 1','9111111103'],['E-QQQ/201','DEMO Delta','','Branch Manager','','ZONE 2','9111111104'],['E-DMO-0104','DEMO Eps','1012','SALES EXECUTIVE','e@demo.test','ZONE 1','9111111105'],['E-DMO-0101','DEMO Alpha Again','1012','Sales Executive','','ZONE 1','']];
fs.writeFileSync(AF+'semp.json',JSON.stringify({out:AF+'semp.xlsx',sheets:[['Read me',[['x']]],['ZONE 1',[hd].concat(ppl)]]}));execFileSync('python3',[new URL('./mkxlsx.py',import.meta.url).pathname,AF+'semp.json']);
({page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(st0)),viewer:{email:'data@virgoasia.com',name:'Vijay'}}));await page.waitForTimeout(3000);
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(500);await page.click('[data-t="semp"]');await page.waitForTimeout(300);
await page.setInputFiles('#up-semp',AF+'semp.xlsx');await page.waitForFunction(()=>/Choose the sheets/i.test(document.querySelector('#pg').innerText),null,{timeout:30000});
await page.click('[data-act="mst-semp-check"]').catch(async()=>{await page.click('button.btn.pri')});
await page.waitForFunction(()=>/Check result/i.test(document.querySelector('#pg').innerText),null,{timeout:30000});
const sr=await page.evaluate(()=>{const r=window.__dbg.S.mst.semp.res;return {people:r.people.map(p=>[p[0],p[3],p[5],p[13]]),fx:r.fx,needs:r.needs,rej:r.rejected,rejects:r.rejects.map(x=>x[4])}});
console.log(JSON.stringify(sr));
const codes=sr.people.map(p=>p[0]);
ok('#14 IDs normalised (E-DMO/101 = E-DMO-0101), old spelling kept as alternate',codes.includes('E-DMO-0101')&&codes.includes('E-DMO-0103')&&sr.people.find(p=>p[0]==='E-DMO-0103')[3]==='E-DMO/103'&&sr.people.find(p=>p[0]==='E-DMO-0101')[1]==='1012',JSON.stringify(codes));
ok('#14 the same person under both spellings is rejected as a duplicate',sr.rejects.some(x=>/Duplicate/.test(x)),JSON.stringify(sr.rejects));
ok('#13 plant inferred from the ID prefix for the person with no plant',sr.people.find(p=>p[0]==='E-DMO-0103')[1]==='1012'&&sr.fx.plantInferred===1,JSON.stringify(sr.fx));
ok('#13 only people with no plant left are listed',sr.needs.length===1&&sr.needs[0][1]==='E-QQQ-0201',JSON.stringify(sr.needs));
ok('#8 designation spellings normalised through the alias table',sr.people.filter(p=>/^Sales Executive$/.test(p[2])).length>=3&&sr.fx.desFixed>0,JSON.stringify(sr.fx));
const ptxt=await page.innerText('#pg');ok('semp panel shows fixes and the email note',/Fixes applied/.test(ptxt)&&/cannot read viewers/.test(ptxt)&&/Plant filled from the ID prefix/.test(ptxt),'');
await page.screenshot({path:SP+'af/semp-1440.png',fullPage:true});
/* aliases tab */
await page.click('[data-act="mst-reset"][data-k="semp"]').catch(()=>{});
await page.click('[data-t="aliases"]');await page.waitForTimeout(500);
const at=await page.innerText('#pg');ok('Admin › Aliases shows all five tables, seeded',/Item category/i.test(at)&&/Zone spelling/i.test(at)&&/Designation spelling/i.test(at)&&/salesperson name/i.test(at)&&/Employee ID prefix/i.test(at)&&/decorative laminates/i.test(at),'');
await page.fill('#al-r-designation','Sales Exec Trainee');await page.fill('#al-c-designation','Sales Executive');await page.click('[data-act="al-add"][data-kind="designation"]');await page.waitForTimeout(800);
ok('Super admin can add an alias row',await page.evaluate(()=>!!window.__mockStore()['settings/alias_designation']),'');
await page.context().close();
/* ---- S/4 with empty Sales Executive ---- */
const stB=JSON.parse(JSON.stringify(st0));
({page,errs}=await open(browser,{store:stB}));await page.waitForTimeout(3000);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
const s4=G.invoices({shape:'S4',plants:[plants[0]],months:['2026-09'],docsPerPlantMonth:6,seed:12,dateStyle:'iso'});
const s4i=s4.headers.indexOf('Sales Executive');s4.rows.forEach(r=>{r[s4i]=''});
fs.writeFileSync(AF+'s4.csv',csvOf(s4.headers,s4.rows));
await up(AF+'s4.csv');await page.waitForTimeout(800);await page.click('[data-act="u-validate"]');await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.res&&window.__desk.U.stage==='validated',null,{timeout:90000});
let s4t=await page.innerText('#i-upload');
ok('#7 S/4: empty Sales Executive with no B1 sales loaded is stated, needs the source',/Sales Executive empty and cannot be filled from B1/.test(s4t)&&/Credit memos are absent/.test(s4t),'');
/* now with B1 loaded first, customer codes link */
await page.context().close();

/* S/4 with B1 already loaded: link by customer code */
for(const variant of ['link','nolink']){
  ({page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(store))}));await page.waitForTimeout(3500);
  await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(600);
  const s4b=G.invoices({shape:'S4',plants:[plants[0]],months:['2026-09'],docsPerPlantMonth:6,seed:12,dateStyle:'iso'});
  const ci=s4b.headers.indexOf('Sold-to-Party Number'),ei=s4b.headers.indexOf('Sales Executive');
  s4b.rows.forEach(r=>{r[ei]='';const dg=String(r[ci]).replace(/\D/g,'');if(variant==='nolink')r[ci]='5000'+dg.slice(-4);else r[ci]='DEMOCU'+dg.padStart(6,'0')});
  fs.writeFileSync(AF+'s4-'+variant+'.csv',csvOf(s4b.headers,s4b.rows));
  const inp=await page.$('input[type=file]');await inp.setInputFiles(AF+'s4-'+variant+'.csv');await page.waitForTimeout(2500);
  await page.click('[data-act="u-validate"]');await page.waitForFunction(()=>window.__desk.U&&window.__desk.U.res&&window.__desk.U.stage==='validated',null,{timeout:120000});
  const a=await page.evaluate(()=>{const a=window.__desk.U.res.af;return {blank:a.blankSp,filled:a.spFilled,unl:a.spUnlinked,why:a.link&&a.link.why,matched:a.link&&a.link.matched}});
  const tx=await page.innerText('#i-upload');console.log(variant,JSON.stringify(a));
  if(variant==='link')ok('#7 S/4: Sales Executive filled from the customer\'s B1 salesperson, counted in the panel',a.filled>0&&a.filled===a.blank-a.unl&&/salesperson taken from the customer/.test(tx),JSON.stringify(a));
  else ok('#7 S/4: codes that cannot be linked are said so, naming the missing key',a.filled===0&&/cannot be linked|cannot be filled/.test(tx)&&/GSTIN|partner function/.test(tx),a.why||'');
  if(variant==='link')await page.screenshot({path:SP+'af/s4-1440.png',fullPage:true});
  await page.context().close();
}
console.log(res.join('\n'));console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,5));await browser.close();
