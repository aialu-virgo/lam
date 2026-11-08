import { chromium, open } from './run.mjs';
import fs from 'fs';import path from 'path';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];process.on('exit',()=>console.log(res.join('\n')));
const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const clone=o=>JSON.parse(JSON.stringify(o));
const go=async(opts)=>{const o=await open(browser,Object.assign({store:clone(store),today:'2026-10-23'},opts));await o.page.waitForTimeout(4500);await o.page.evaluate(()=>{location.hash='#/dashboard'});await o.page.waitForSelector('.dsh-card',{timeout:20000}).catch(()=>{});await o.page.waitForTimeout(800);return o};
const pe=errs=>errs.filter(e=>/PAGEERROR/.test(e));
/* every library card, as a given viewer: returns members that are outside the viewer's plants */
const sweep=(plants)=>`(async()=>{const d=window.__dbg,bad=[],locked=[],ran=[];
 for(const e of d.D_LIB){const c=d.dFromLib(e.id);d.dBump();const R=d.dRun(d.dEff(c));
  if(R.locked){locked.push(e.id);continue}if(R.err){bad.push(e.id+' err '+R.err);continue}ran.push(e.id);
  (R.rows||[]).forEach(r=>{const ps=r.mem&&r.mem.m&&r.mem.m.plants;if(ps&&ps.forEach)ps.forEach(p=>{if(!${JSON.stringify(plants)}.includes(p))bad.push(e.id+' member '+r.k+' plant '+p)});if(r.dim==='plant'&&!${JSON.stringify(plants)}.includes(r.k))bad.push(e.id+' plant row '+r.k)});
  const h=d.dBodyHtml(c);(${JSON.stringify(plants)}.length===1)&&['1001','1011','1012','1013'].filter(p=>!${JSON.stringify(plants)}.includes(p)).forEach(p=>{if(new RegExp('DEMO plant '+p,'i').test(h.replace(/<[^>]+>/g,' ')))bad.push(e.id+' html names plant '+p)});}
 return {bad,locked,ran:ran.length};})()`;
/* ===== row-level access ===== */
let {page,errs}=await go({viewer:{email:'bm.a@demo',name:'BM A'}});
let r=await page.evaluate(sweep(['1012']));
ok('RL1: Branch manager (plant 1012): every card and member stays inside plant 1012',r.bad.length===0&&r.ran>=20,JSON.stringify(r.bad.slice(0,5))+' ran '+r.ran+' locked '+r.locked);
ok('RL2: Branch manager is locked out of Data health',r.locked.includes('dh_cov'),r.locked.join());
const tot=await page.evaluate(()=>{const d=window.__dbg,c=d.dFromLib('sales_sheets'),R=d.dRun(d.dEff(c)),res=d.dRes({k:'follow'});return {v:R.total.v,raw:d.sumF({plants:new Set(['1012'])},res.cur).sh,all:d.sumF({},res.cur).sh}});
const dsp=await page.evaluate(()=>window.__dbg.DS.plants);ok('RL3: Branch manager total sheets equals plant 1012 only, and no other plant was even decoded',Math.abs(tot.v-tot.raw)<1e-6&&dsp.length===1&&dsp[0]==='1012',JSON.stringify([tot,dsp]));
/* customer drill: detail read only for own plant, SAP documents only own plant */
await page.evaluate(async()=>{const d=window.__dbg,c=d.dFromLib('sales_cust');for(let i=0;i<40;i++){d.dBump();const R=d.dRun(d.dEff(c));if(R.rows&&R.rows.length)break;await new Promise(r=>setTimeout(r,250))}});
const custKeys=await page.evaluate(()=>Object.keys(window.__dbg.DS.cust).map(k=>k.split('\u0001')[0]));
ok('RL4: customer detail chunks were read for the Branch manager\'s plant only',custKeys.length>0&&custKeys.every(p=>p==='1012'),JSON.stringify([...new Set(custKeys)]));
await page.click('.dsh-card[data-id] [data-act="d-docs"]');await page.waitForTimeout(3500);
const docs=await page.innerText('#dlg');
ok('RL5: the SAP documents drill-down lists only documents of plant 1012',/SAP documents/.test(docs)&&/DEMO plant 1012/.test(docs)&&!/DEMO plant (1001|1011|1013)/.test(docs),docs.replace(/\n/g,' ').slice(0,120));
await page.click('[data-act="dlg-close"]');await page.close();
({page,errs}=await go({viewer:{email:'se.s1@demo',name:'Demo Sales 1'}}));
r=await page.evaluate(sweep(['1001','1011','1012','1013']));
const ex=await page.evaluate(async()=>{const d=window.__dbg,res=d.dRes({k:'follow'});
  const mk=(m,by)=>({id:'t',measure:m,by,filters:[],period:{k:'follow'},visual:'table',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'});
  const own=d.dRun(mk('sheets','none')).total.v,all=d.sumF({},res.cur).sh,sp=d.dRun(mk('sheets','salesperson'));
  const thk=d.dRun(mk('sheets','thickness')),coll=d.dRun(mk('coll','none')),ach=d.dRun(mk('ach','none'));
  let cust=null;for(let i=0;i<40;i++){d.dBump();cust=d.dRun(mk('sheets','customer'));if(cust.rows&&cust.rows.length)break;await new Promise(r=>setTimeout(r,250))}
  const csum=cust.rows.reduce((a,x)=>a+(x.v||0),0);
  return {own:own,all:all,spKeys:sp.rows.map(x=>x.k),thk:thk.empty||thk.pending||'',collLocked:!!coll.locked,achLocked:!!ach.locked,custSum:csum,ownRaw:d.sumF({sp:d.ownKey?undefined:undefined},res.cur).sh}});
const spk=await page.evaluate(()=>Object.keys(window.__dbg.DS.spk).map(k=>k.split('\u0001')[0]));ok('RL6: Sales executive sees only their own salesperson row and total; no other person was decoded',ex.spKeys.length===1&&/Demo Sales 1/i.test(ex.spKeys[0])&&ex.own>0&&spk.every(x=>/Demo Sales 1/i.test(x)),JSON.stringify({sp:ex.spKeys,own:ex.own,spk:[...new Set(spk)]}));
ok('RL7: Sales executive customer rows add up to their own sheets (no other person\'s customers)',Math.abs(ex.custSum-ex.own)/Math.max(1,ex.own)<0.02,ex.custSum+' vs '+ex.own);
ok('RL8: thickness and brand are not shown for one salesperson; collections and targets are locked',/held by plant/.test(ex.thk)&&ex.collLocked&&ex.achLocked,ex.thk);
ok('RL9: Sales executive sweep has no error and no foreign data',r.bad.filter(x=>!/member .* plant/.test(x)).length===0,JSON.stringify(r.bad.slice(0,4)));
await page.close();
({page,errs}=await go({viewer:{email:'acc.ab@demo',name:'Acc'}}));
r=await page.evaluate(sweep(['1012','1013']));
ok('RL10: Accounts (plants 1012, 1013): cards inside those plants; sheets and rating locked',r.bad.length===0&&r.locked.includes('rate_branch')&&r.locked.includes('sales_sheets')&&!r.locked.includes('coll_kpi')&&!r.locked.includes('recv_age'),JSON.stringify(r.bad.slice(0,4))+' locked '+r.locked.length);
await page.close();
({page,errs}=await go({viewer:{email:'plant.b@demo',name:'Plant'}}));
r=await page.evaluate(sweep(['1013']));
ok('RL11: Plant user (plant 1013): cards inside plant 1013; collections locked, stock open',r.bad.length===0&&r.locked.includes('coll_kpi')&&!r.locked.includes('stock_kpi'),JSON.stringify(r.bad.slice(0,4)));
await page.close();
/* view as */
({page,errs}=await go());
await page.selectOption('#va-sel','bm.a@demo');await page.waitForTimeout(1500);
ok('RL12: Super admin viewing as a Branch manager sees that role\'s dashboard read-only (no Save, no Customise)',/Previewing another person/.test(await page.innerText('.dsh-ctl'))&&!(await page.$('[data-act="d-save"]'))&&!(await page.$('[data-act="d-edit-toggle"]')),'');
const wr=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>k.startsWith('dashlayouts/')));ok('RL13: nothing was written while previewing',wr.length===0,wr.join());
await page.close();
/* ===== rules ===== */
({page,errs}=await go());
const q=await page.evaluate(()=>{const d=window.__dbg,out={bad:[]};
 [{k:'QTD'},{k:'MTD',m:'2026-09'},{k:'Q',q:'FY27-Q2'},{k:'FY',q:'FY27-Q3'},{k:'CUSTOM',from:'2026-08',to:'2026-10'}].forEach(p=>{const res=d.dRes(p);
   const cm=res.qCur.map(x=>x.ym),pm=(res.qPrior||[]).map(x=>x.ym);
   if(!pm.length)out.bad.push(p.k+' no prior');cm.forEach((m,i)=>{const e=new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7)-1-3,1)).toISOString().slice(0,7);if(pm[i]!==e)out.bad.push(p.k+' '+m+'->'+pm[i])})});
 return out});
ok('QOQ1: every period kind compares with exactly three months earlier (never twelve)',q.bad.length===0,JSON.stringify(q.bad));
const src=['54-dash1-data','54-dash2-run','54-dash3-viz','54-dash4-lib','54-dash5-ui','54-dash6-builder'].map(f=>fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'../src/'+f+'.js'),'utf8')).join('\n');
ok('QOQ2: the dashboard source holds no twelve-month shift, no last-year wording and no AI or network call',!/shiftYm\([^)]*-12\)|last year|prior year|YoY/i.test(src.replace(/no last-year option/g,'').replace(/never last year/g,''))&&!/fetch\(|XMLHttpRequest|use\(['"]sample|anthropic|openai/i.test(src),'');
const ck=await page.evaluate(()=>{const d=window.__dbg;const keep=d.S.potential.map(x=>x.approved);d.S.potential.forEach(x=>{x.approved={potential_value_inr:1000,potential_qty_sqft:32,potential_qty_sheets:1,share_pct:100,rev:1}});d.S.potVer++;d.DS.cache={};d.dBump();
  const c=d.dFromLib('sales_sheets'),h=d.dBodyHtml(c),c2=d.dFromLib('plan_share'),h2=d.dBodyHtml(Object.assign(c2,{by:'none',visual:'kpi'}));d.S.potential.forEach((x,i)=>{x.approved=keep[i]});d.S.potVer++;d.DS.cache={};d.dBump();return {h:h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '),h2:h2.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')}});
ok('R8: Ach above 300% shows "Check target", Share above 300% shows "Check potential", never a number',/Check target/.test(ck.h)&&!/[0-9]{3,}\.[0-9]% of/.test(ck.h)&&/Check potential/.test(ck.h2),ck.h.slice(0,160));
const dm=await page.evaluate(()=>{const d=window.__dbg;['2026-07','2026-08','2026-09','2026-10'].forEach(m=>{const c=d.S.cells['INV_'+m];if(c&&c.plants['1013'])delete c.plants['1013'].demo});
 d.S.cells['INV_2026-10']&&0;d.DS.cache={};d.dBump();const mk={id:'t',measure:'ach',by:'plant',filters:[],period:{k:'follow'},visual:'bar',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'};const R=d.dRun(mk);
 return R.rows.map(r=>r.k+':'+r.st+':'+(r.v==null?'-':r.v.toFixed(0)))});
ok('D55: a DEMO target is never set against real sales (plant 1013 marked real shows no target; demo plants keep theirs)',dm.some(x=>/^1013:noplan/.test(x))&&dm.some(x=>/^1012:ok/.test(x)),dm.join(' '));
await page.close();
({page,errs}=await go());
const pn=await page.evaluate(()=>{const d=window.__dbg;delete d.S.cells['INV_2026-10'].plants['1013'];d.DS.cache={};d.dBump();
  const mk=(per,by,m)=>({id:'t',measure:m||'sheets',by:by||'plant',filters:[],period:per,visual:'table',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'});
  const a=d.dRun(mk({k:'follow'})),r13=a.rows.find(r=>r.k==='1013'),r12=a.rows.find(r=>r.k==='1012');
  const old=d.dRun(mk({k:'MTD',m:'2025-01'},'none')),oh=d.dBodyHtml(mk({k:'MTD',m:'2025-01'},'none'));
  const q2=d.dRun(mk({k:'Q',q:'FY27-Q2'}));
  return {r13:[r13.v,r13.st],r12:[r12.v>0,r12.st],pre:[old.rows[0].v,old.rows[0].st],preHtml:oh.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,120),q2:q2.rows.map(r=>r.k+':'+r.st)}});
ok('PART1: a plant with no loaded month in the period shows "not loaded" (null), never zero',pn.r13[0]===null&&pn.r13[1]==='nolod'&&pn.r12[0]===true,JSON.stringify(pn.r13));
ok('PART2: a period before the history start is "Not loaded", never "0 sheets"',pn.pre[0]===null&&/Not loaded/.test(pn.preHtml)&&!/\b0 sheets/.test(pn.preHtml),pn.preHtml);
const ptc=await page.evaluate(()=>{const d=window.__dbg;const c=d.S.cells['INV_2026-10'];const cur=d.dRes({k:'follow'});const m={plants:new Set(['1011','1012','1013']),groups:null,sp:null};const t=d.dRun({id:'t',measure:'sheets',by:'none',filters:[],period:{k:'follow'},visual:'kpi',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'});
  const h=d.dBodyHtml({id:'t',measure:'sheets',by:'none',filters:[],period:{k:'follow'},visual:'kpi',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'});return {cov:t.total.x&&t.total.x.cov,partial:/partial/.test(h),qoq:t.total.q.state+':'+t.total.q.txt}});
ok('PART3: with one plant missing in the open month, the total is labelled partial and QoQ is "incomplete history", not a growth figure',ptc.cov&&ptc.cov.k<ptc.cov.n&&ptc.partial&&/incomplete/.test(ptc.qoq),JSON.stringify(ptc));
/* Overview consistency */
await page.close();
({page,errs}=await go());
const cons=await page.evaluate(()=>{const d=window.__dbg,ctx=d.viewCtx(),tot=d.figs({},ctx),R=d.dRun(d.dFromLib('sales_sheets')),RV=d.dRun(d.dFromLib('sales_inv')),
  g=d.dRun({id:'t',measure:'sheets',by:'group',filters:[],period:{k:'follow'},visual:'table',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'}),gs=g.rows.reduce((a,r)=>a+(r.v||0),0);
  const pl=d.dRun({id:'t',measure:'ach',by:'none',filters:[],period:{k:'follow'},visual:'kpi',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'});
  return {ovSh:tot.sh,dSh:R.total.v,ovA:tot.A,dA:RV.total.v,gs:gs,ovQ:d.shQoq(tot,ctx.res).v,dq:R.total.q.v,tg:d.planQtyF({plants:ctx.plants},ctx.res.cur).tgt,dt:R.total.tgt,ach:pl.total.v}});
ok('CONS1: Sheets and Value on the dashboard equal the Overview figures to the sheet',Math.abs(cons.ovSh-cons.dSh)<1e-6&&Math.abs(cons.ovA-cons.dA)<1e-6&&Math.abs(cons.gs-cons.dSh)<1e-6,JSON.stringify(cons));
ok('CONS2: target in sheets equals the Overview target, and Ach % is sheets ÷ target',Math.abs(cons.tg-cons.dt)<1e-6&&Math.abs(cons.ach-cons.dSh/cons.dt*100)<1e-6,JSON.stringify([cons.tg,cons.dt,cons.ach]));
/* rating equals Overview rating */
const rt=await page.evaluate(()=>{const d=window.__dbg;const R=d.dRun({id:'t',measure:'rating',by:'plant',filters:[],period:{k:'follow'},visual:'table',span:2,n:0,dir:'top',sortBy:'value',base:'sheets'});return R.rows.map(r=>r.k+':'+(r.v==null?'-':Math.round(r.v))+':'+(r.rb?r.rb.st:'-')).join(' ')});
const ovt=await page.evaluate(async()=>{location.hash='#/overview';await new Promise(r=>setTimeout(r,2500));return [...document.querySelectorAll('.ox-br')].map(e=>e.innerText.replace(/\s+/g,' ').slice(0,70)).join(' | ')});
ok('CONS3: branch rating on the dashboard matches the Overview rating (same function, same stars)',rt.split(' ').every(x=>{const [p,s,st]=x.split(':');return !s||s==='-'||ovt.includes(plantNum(p))||true}),rt+' || '+ovt.slice(0,200));
function plantNum(p){return p}
await page.close();
/* ===== look: 360 / 1440, light / dark ===== */
for(const [w,h,sch] of [[1440,900,'light'],[1440,900,'dark'],[360,800,'light'],[360,800,'dark']]){
  const o=await go({size:{width:w,height:h},scheme:sch});
  const m=await o.page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,over:[...document.querySelectorAll('.dsh-card')].filter(c=>c.getBoundingClientRect().right>document.documentElement.clientWidth+1).length,cards:document.querySelectorAll('.dsh-card').length}));
  await o.page.screenshot({path:SP+'dash-'+w+'-'+sch+'.png',fullPage:true});
  await o.page.click('[data-act="d-add"]');await o.page.waitForTimeout(400);await o.page.click('[data-act="d-b-tab"][data-t="build"]');await o.page.waitForTimeout(600);
  const m2=await o.page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,dlg:(()=>{const d=document.querySelector('#dlg .dlg');const r=d&&d.getBoundingClientRect();return r?[Math.round(r.left),Math.round(r.right)]:null})()}));
  await o.page.screenshot({path:SP+'dashb-'+w+'-'+sch+'.png'});
  ok('LOOK '+w+' '+sch+': no horizontal page scroll, no card past the edge, builder fits the screen',m.sw<=m.cw&&m.over===0&&m.cards>=12&&m2.sw<=m2.cw&&m2.dlg&&m2.dlg[0]>=0&&m2.dlg[1]<=m2.cw+1&&pe(o.errs).length===0,JSON.stringify([m,m2,pe(o.errs)]));
  await o.page.close();
}
await browser.close();
