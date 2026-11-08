/* Targets & Potential by State (D77-D80): role views, who edits, keys and the state-only rule, optional districts (silent when empty, sum rule, unallocated derived),
   save / submit / approve / return, approver != proposer, lock with actuals snapshot, legacy (by plant) and the start quarter, actuals by customer state and unassigned,
   plant roll-up by responsible plant, copy, upload in two steps, phasing, Admin › Geography (draft, bands, ties, save), customer master by (system, code) and the SAP customer feed hook.
   Fixture: store-demo.json plus a DEMO customer master and DEMO geography masters (geofix.mjs). DEMO data only. */
import { chromium, open } from './run.mjs';
import { geoStore } from './geofix.mjs';
import fs from 'fs';
const TMP='/tmp/claude-0/-home-user/cc66010f-b189-5207-a8a3-0de9659c9226/scratchpad/';fs.mkdirSync(TMP,{recursive:true});
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,c?'':(d||'')].join(' | '));
const clone=o=>JSON.parse(JSON.stringify(o));
await geoStore(browser,TMP+'t59-geo.json');
const base=JSON.parse(fs.readFileSync(TMP+'t59-geo.json'));
const Q='FY27-Q3',PQ='FY27-Q2';
const K=(st,did,g,seg)=>('geo_'+[Q,st,did||'_state',g,seg||'All'].join('_')).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const openAs=async(email,s,hash='#/targets')=>{const o=await open(browser,{store:clone(s),viewer:{email,name:email}});await o.page.waitForTimeout(3000);await o.page.evaluate(h=>{location.hash=h},hash);await o.page.waitForFunction(()=>!window.__dbg.GEOA.jobs,null,{timeout:60000}).catch(()=>{});await o.page.waitForTimeout(1500);return o};
const mock=p=>p.evaluate(()=>window.__mockStore());
const fill=async(p,f,key,v)=>{const s='#tp-'+f+'-'+key;await p.fill(s,v);await p.dispatchEvent(s,'change');await p.waitForTimeout(250)};
const txt=p=>p.innerText('#pg');
const has=(p,sel)=>p.$(sel).then(x=>!!x);

/* ---------- A. role views and who edits ---------- */
{
  const v={};
  for(const [email,l] of [['bm.a@demo','bmA'],['bm.b@demo','bmB'],['hod.sales@demo','hod'],['se.s1@demo','se'],['mgmt@demo','mg'],['super@demo','sa']]){
    const {page,errs}=await openAs(email,base);
    v[l]=await page.evaluate(()=>({nav:[...document.querySelectorAll('.navg')].map(g=>g.querySelector('h4').innerText+':'+[...g.querySelectorAll('.nl')].map(x=>x.innerText).join('|')),
      states:window.__dbg.tpModel().states.map(s=>s.code+(s.canSt?'*':'')),pot:[...document.querySelectorAll('[data-tp="pot"]')].map(i=>i.getAttribute('data-key')),
      bar:document.querySelector('.tp-sticky').innerText,note:document.querySelector('.tp-note').innerText,geo:window.__dbg.pagesFor(window.__dbg.effUser()).includes('geography'),hdr:[...document.querySelectorAll('.tp-ph')].map(x=>x.innerText)}));
    ok(l+': opens with no script error, own "Plan" group with Targets & Potential',!errs.filter(e=>!/ERR_FAILED/.test(e)).length&&v[l].nav.some(n=>/^PLAN:Targets & Potential$/i.test(n)),JSON.stringify([errs,v[l].nav]));
    await page.context().close();
  }
  const a=v.bmA,b=v.bmB;
  ok('rows are state × product group; state header names the default plant',/Maharashtra/.test(v.mg.hdr.join())&&/default plant: DEMO plant 1012/.test(v.mg.hdr.join())&&/Karnataka.*no default plant/.test(v.mg.hdr.join()),JSON.stringify(v.mg.hdr));
  ok('BM A (plant 1012): edits Maharashtra (default plant 1012) state rows; Gujarat (default 1013) shown view only; Karnataka (no default plant, no district) not listed',a.states.join()==='24,27*'&&a.pot.some(k=>k===K('27','_state','Laminate'))&&!a.pot.some(k=>/_24_state_/.test(k)),JSON.stringify(a));
  ok('BM B (plant 1013): edits Gujarat state rows; sees Maharashtra (Nagpur is its district) view only',b.states.join()==='24*,27'&&b.pot.some(k=>k===K('24','_state','Laminate'))&&!b.pot.some(k=>/_27_state_/.test(k)),JSON.stringify(b.states));
  ok('Management: all states, edits every state incl. Karnataka (no default plant); approve, return, lock',v.mg.states.every(s=>/\*$/.test(s))&&v.mg.states.length===3&&/Lock quarter/.test(v.mg.bar),JSON.stringify([v.mg.states,v.mg.bar]));
  ok('Super admin: edits all states, sees Geography page',v.sa.states.every(s=>/\*$/.test(s))&&v.sa.geo&&v.mg.geo,JSON.stringify(v.sa.states));
  ok('HOD: view only (no inputs, no upload), no Geography page',v.hod.pot.length===0&&/View only/.test(v.hod.bar)&&!v.hod.geo&&v.hod.states.length===3,JSON.stringify(v.hod));
  ok('Sales executive: view only, states of own customers only',v.se.pot.length===0&&/View only/.test(v.se.bar)&&v.se.states.length>=1&&v.se.states.length<=3,JSON.stringify(v.se.states));
  ok('BM role note names the rule (default plant; other states view only, own districts editable)',/default plant is yours/.test(a.note)&&/Gujarat/.test(a.note)&&/districts mapped to your plant/.test(a.note),a.note);
}

/* ---------- B. keys, state required, save, district optional and silent, sum rule, unallocated derived ---------- */
let S1;
{
  const {page}=await openAs('bm.a@demo',base);
  const g=await page.evaluate(()=>{const D=window.__dbg;return [D.planGuard({plant_code:'1012'}),D.planGuard({}),D.planGuard({state_code:'24',district_id:'_state'}),D.planGuard({state_code:'24',district_id:'GJ-AHMEDABAD'}),D.planGuard({state_code:'27',district_id:'MH-NAGPUR'}),D.planGuard({state_code:'27',district_id:'MH-KOLHAPUR'}),D.planGuard({state_code:'29',district_id:'_state'})]});
  ok('State is required; plant-keyed records are legacy read only',/legacy\) figures are read only/.test(g[0])&&/A state is required/.test(g[1]),JSON.stringify(g));
  ok('BM A: Gujarat state refused (default plant 1013), Ahmedabad district (mapped to 1012) allowed inside Gujarat, Nagpur (1013) refused, Kolhapur (no plant) refused, Karnataka (no default plant) refused',/default plant is DEMO plant 1013, not yours/.test(g[2])&&g[3]===''&&/belongs to DEMO plant 1013/.test(g[4])&&/no responsible plant/.test(g[5])&&/no default plant/.test(g[6]),JSON.stringify(g));
  ok('District mapping is collapsed and silent while empty (no warning, "nothing to fix")',(await page.evaluate(()=>{const d=document.querySelector('details.tp-dist');return d&&!d.open&&/Not split into districts\. Nothing to fix/.test(d.textContent)&&!/▲/.test(d.textContent)})),'');
  const kL=K('27','_state','Laminate'),kD=K('27','_state','Door');
  const dsh=await page.evaluate(k=>{const r=window.__dbg.tpModel().rows.find(x=>x.st==='27'&&x.group==='Laminate');return {ph:document.getElementById('tp-share-'+k).getAttribute('placeholder'),dsh:r.last.dsh,A:r.last.A,pot:r.last.pot}},kL);
  ok('First state quarter: no last-quarter state potential, so no default share (trade-off D79)',dsh.dsh===null&&dsh.pot===null&&dsh.ph==='',JSON.stringify(dsh));
  await fill(page,'pot',kL,'9,00,00,000');await fill(page,'share',kL,'48');
  await fill(page,'pot',kD,'1,00,00,000');await fill(page,'tgt',kD,'45,00,000');
  ok('Share % and Target ₹ move each other',(await page.inputValue('#tp-share-'+kD))==='45.00'&&(await page.inputValue('#tp-tgt-'+kL))==='4,32,00,000','');
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(900);
  let s=await mock(page),d=s['potential/'+kL];
  ok('Saved as Draft with key (quarter, state, _state, group, segment) and id geo_…; no plant on the record',d&&d.status==='Draft'&&d.state_code==='27'&&d.district_id==='_state'&&d.customer_segment==='All'&&d.fy_quarter===Q&&!d.plant_code&&d.potential_value_inr===90000000&&d.share_pct===48&&kL==='geo_fy27_q3_27_state_laminate_all',JSON.stringify(d));
  /* district split: Pune 5,00,00,000 → unallocated 4,00,00,000 × 48% */
  await page.evaluate(()=>{document.querySelector('details.tp-dist').open=true});await page.waitForTimeout(300);
  const kP=K('27','MH-PUNE','Laminate'),kN=K('27','MH-NAGPUR','Laminate');
  ok('BM A edits Pune (own plant), not Nagpur (plant 1013)',await has(page,'#tp-pot-'+kP)&&!(await has(page,'#tp-pot-'+kN)),'');
  await fill(page,'pot',kP,'5,00,00,000');await fill(page,'share',kP,'50');
  let dt=await page.evaluate(()=>document.querySelector('details.tp-dist').textContent);
  ok('With a district filled: "Split across districts" and a derived "Unallocated to districts" row (4,00,00,000 × 48% = 1,92,00,000)',/Split across districts: 5,00,00,000 of 9,00,00,000/.test(dt)&&/Unallocated to districts/.test(dt)&&/1,92,00,000/.test(dt)&&/Maharashtra – unassigned/.test(dt),dt.slice(0,600));
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(900);s=await mock(page);
  ok('Unallocated is never stored: only the state and Pune records exist for Maharashtra Laminate',Object.keys(s).filter(k=>/^potential\/geo_fy27_q3_27_.*laminate/.test(k)).sort().join()===['potential/'+kP,'potential/'+kL].sort().join()&&s['potential/'+kP].district_id==='MH-PUNE',Object.keys(s).filter(k=>/geo_fy27_q3_27/.test(k)).join());
  /* over the state total: save allowed, submit refused */
  await page.evaluate(()=>{document.querySelector('details.tp-dist').open=true});await fill(page,'pot',kP,'9,40,00,000');
  dt=await page.evaluate(()=>document.querySelector('details.tp-dist').textContent);
  ok('Districts over the state total: point-of-entry warning names the excess',/over the Maharashtra total of 9,00,00,000 by 40,00,000/.test(dt),dt.slice(0,400));
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(800);
  ok('Draft above the state total can be saved',(await mock(page))['potential/'+kP].potential_value_inr===94000000,'');
  await page.click('[data-act="tp-submit"]');await page.waitForTimeout(800);
  ok('Submit refused while districts exceed the state',/districts exceed the state by 40,00,000/.test(await page.innerText('#tp-msg'))&&!(await has(page,'#tp-s-reason')),await page.innerText('#tp-msg'));
  await page.evaluate(()=>{document.querySelector('details.tp-dist').open=true});await fill(page,'pot',kP,'5,00,00,000');
  await page.click('[data-act="tp-submit"]');await page.waitForSelector('#tp-s-reason');
  await page.click('[data-act="tp-submit-go"]');
  ok('Submit asks reason, date and participants (reason missing refused)',/reason is required/i.test(await page.innerText('#d-err'))&&await has(page,'#tp-s-date')&&await has(page,'#tp-s-part'),'');
  await page.fill('#tp-s-reason','Dealer survey up');await page.fill('#tp-s-part','Branch team');await page.click('[data-act="tp-submit-go"]');await page.waitForTimeout(1200);
  s=await mock(page);
  ok('Submit: state rows and Pune are Proposed (stored Discussed) with reason, date, participants',['potential/'+kL,'potential/'+kD,'potential/'+kP].every(k=>s[k].status==='Discussed'&&s[k].revisions.some(r=>r.reason==='Dealer survey up'&&r.participants==='Branch team'&&/^\d{4}-\d\d-\d\d$/.test(r.discussion_date))),'');
  S1=s;await page.context().close();
}
/* ---------- C. approve, approver != proposer, return ---------- */
let S2;
{
  const {page}=await openAs('mgmt@demo',S1);
  const kL=K('27','_state','Laminate'),kD=K('27','_state','Door'),kK=K('29','_state','Laminate');
  await fill(page,'pot',kK,'1,90,00,000');await fill(page,'share',kK,'41');await page.click('[data-act="tp-save"]');await page.waitForTimeout(700);
  await page.click('[data-act="tp-submit"]');await page.waitForSelector('#tp-s-reason');await page.fill('#tp-s-reason','HO view');await page.fill('#tp-s-part','HO');await page.click('[data-act="tp-submit-go"]');await page.waitForTimeout(1000);
  ok('Management proposes Karnataka (no default plant); its own row shows "another approver needed", no select box',/You proposed this: another approver needed/.test(await txt(page))&&!(await has(page,'[data-tp="sel"][data-key="'+kK+'"]')),'');
  const self=await page.evaluate(k=>{const D=window.__dbg;return D.advanceDoc(D.S.potential.find(p=>p._id===k),D.effUser()).err},kK);
  ok('Approver is never the proposer (rule refuses even when called directly)',/proposer cannot approve/.test(self||''),self);
  await page.check('[data-tp="sel"][data-key="'+kL+'"]');await page.click('[data-act="tp-approve"]');await page.waitForTimeout(900);
  let s=await mock(page);
  ok('Management approves the BM row: Approved, approved and original recorded',s['potential/'+kL].status==='Approved'&&s['potential/'+kL].approved.by==='mgmt@demo'&&s['potential/'+kL].original,'');
  await page.check('[data-tp="sel"][data-key="'+kD+'"]');await page.click('[data-act="tp-return-open"]');await page.waitForTimeout(300);
  await page.fill('#tp-ret-text','Door looks high');await page.dispatchEvent('#tp-ret-text','input');await page.click('[data-act="tp-return-go"]');await page.waitForTimeout(1200);
  s=await mock(page);const act=Object.values(s).filter(a=>a&&a.rule==='M'&&/Targets returned/.test(a.title||''));
  ok('Return: Door back to Draft with the reason; proposer stays the BM; action on the BM\'s list',s['potential/'+kD].status==='Draft'&&s['potential/'+kD].revisions.slice(-1)[0].returned&&await page.evaluate(k=>window.__dbg.proposerOf(window.__dbg.S.potential.find(p=>p._id===k)),kD)==='bm.a@demo'&&act.length===1&&act[0].owner==='bm.a@demo',JSON.stringify(act.map(a=>a.owner)));
  /* plan figures count by responsible plant: Maharashtra (default plant 1012) */
  const pq=await page.evaluate(()=>{const P=window.__dbg.planQ({plant:'1012',group:'Laminate'},'FY27-Q3');return [P.kind,P.tgt,P.pot]});
  ok('Approved state target reaches plant 1012 (responsible plant) in plan roll-ups; Pune is not approved, so the approved state slice is 9,00,00,000 × 48% and potential is not double counted',pq[0]==='mixed'&&Math.abs(pq[1]-43200000)<0.01&&Math.abs(pq[2]-90000000)<0.01,JSON.stringify(pq));
  S2=s;await page.context().close();
}
{
  const {page}=await openAs('super@demo',S2);
  const kK=K('29','_state','Laminate');
  await page.check('[data-tp="sel"][data-key="'+kK+'"]');await page.click('[data-act="tp-approve"]');await page.waitForTimeout(900);
  ok('A second approver (Super admin) approves the Management-proposed row',(await mock(page))['potential/'+kK].status==='Approved','');
  /* plant roll-up */
  await page.check('input[data-tp="view"][value="plant"]');await page.waitForTimeout(800);
  const rt=await txt(page);
  ok('Plant roll-up by responsible plant, labelled "not invoicing plant"; Karnataka under "No responsible plant"; totals name the row base',/Responsible plant, from customer geography\. This is not invoicing plant/.test(rt)&&/No responsible plant/.test(rt)&&/DEMO plant 1012/.test(rt)&&/vs last quarter of the same rows|—/.test(rt),rt.slice(0,800));
  await page.check('input[data-tp="view"][value="state"]');await page.waitForTimeout(500);
  /* actuals by customer state: independent sum from the customer master states */
  const ac=await page.evaluate(()=>{const D=window.__dbg,ms=D.qMonths('FY27-Q2');let mh=0,un=0;Object.keys(D.GEOA.rows).forEach(k=>{const [p,ym]=k.split('\u0001');if(ms.indexOf(ym)<0)return;D.GEOA.rows[k].a.forEach(r=>{if(r[4]||r[3]!=='Laminate')return;const c=D.custInfo(r[0]);if(c&&c[4]==='Maharashtra'){mh+=r[9];if(!c[9])un+=r[9]}})});
    const row=D.tpModel().rows.find(x=>x.st==='27'&&x.group==='Laminate');return {mh,un,A:row.last.A,lun:row.last.un}});
  ok('Last quarter actual of Maharashtra Laminate = sales of customers whose state is Maharashtra (by customer state, all invoicing plants)',Math.abs(ac.mh-ac.A)<0.5&&ac.mh>0,JSON.stringify(ac));
  ok('Customers with no PIN sit in "Maharashtra – unassigned"',Math.abs(ac.un-ac.lun)<0.5&&ac.un>0,JSON.stringify(ac));
  const tot=await page.evaluate(()=>[...document.querySelectorAll('.tp-tot')].map(x=>x.innerText).join(' || '));
  ok('Totals: QoQ uses the same rows that have a target and names the base',/target vs last quarter of the same \d+ rows?/.test(tot),tot.slice(0,600));
  /* lock with snapshot; later master change does not move the locked quarter */
  const before=await page.evaluate(()=>window.__dbg.tpModel().rows.find(x=>x.st==='27'&&x.group==='Laminate').ach);
  await page.click('[data-act="tp-lock-open"]');await page.waitForSelector('[data-act="tp-lock-go"]');await page.click('[data-act="tp-lock-go"]');await page.waitForTimeout(5000);
  const lk=await page.evaluate(()=>{const D=window.__dbg;return {l:D.isPlanLocked('FY27-Q3'),snap:!!(D.S.planlocks['FY27-Q3']&&D.S.planlocks['FY27-Q3'].geo_snap),inputs:document.querySelectorAll('[data-tp="pot"]').length}});
  ok('Lock: quarter read only for Super admin too; attributed actuals snapshotted on the lock',lk.l&&lk.snap&&lk.inputs===0,JSON.stringify(lk));
  /* move every customer to Gujarat in the master: the locked quarter keeps its figures */
  await page.evaluate(async()=>{const D=window.__dbg;const rows=[...D.S.custIdx.values()].map(a=>{const b=a.slice();b[4]='Gujarat';return b});await D.dset('customers/B1_c0',{z:await D.gz(JSON.stringify(rows)),n:rows.length,i:0,sys:'B1',upload:'ugeofix2',demo:true});await D.dset('customers/main_B1',{at:new Date().toISOString(),by:'x',sys:'B1',loaded:rows.length,chunks:1,upload:'ugeofix2',demo:true})});
  await page.waitForTimeout(2500);
  const after=await page.evaluate(()=>{const D=window.__dbg;return [D.tpModel().rows.find(x=>x.st==='27'&&x.group==='Laminate').ach,D.custInfo([...D.S.custIdx.keys()][0])[4]]});
  ok('Locked quarter: actuals do not move when the master is edited later',after[1]==='Gujarat'&&Math.abs(after[0]-before)<0.5&&before>0,JSON.stringify([before,after]));
  await page.context().close();
}
/* ---------- D. legacy and the start quarter ---------- */
{
  const {page}=await openAs('super@demo',base);
  ok('Geography starts at the current open quarter when it has no real Approved plant record (DEMO records do not count)',(await page.evaluate(()=>window.__dbg.geoStartQ()))===Q,'');
  await page.selectOption('#tp-q',PQ);await page.waitForTimeout(800);
  const t=await txt(page);
  ok('An earlier quarter opens "Legacy (by plant)", read only, no inputs, no upload',/Legacy \(by plant\)/.test(t)&&/cannot be edited/.test(t)&&(await page.$$('[data-tp="pot"]')).length===0&&!(await has(page,'#up-pot')),t.slice(0,300));
  await page.selectOption('#tp-q',Q);await page.waitForTimeout(600);await page.click('[data-act="tp-copy"]');await page.waitForTimeout(800);
  ok('Copy into the first state quarter from a plant quarter converts nothing',/not converted to states/.test(await page.innerText('#tp-msg'))&&!Object.keys(await mock(page)).some(k=>/^potential\/geo_/.test(k)),await page.innerText('#tp-msg'));
  await page.context().close();
  const r=clone(base);const k=Object.keys(r).find(x=>/^potential\/fy27_q3_1012_laminate_dealer$/.test(x));delete r[k].demo;
  const {page:p2}=await openAs('super@demo',r);
  ok('A real Approved plant record in the open quarter moves the start to the next quarter',(await p2.evaluate(()=>window.__dbg.geoStartQ()))==='FY27-Q4'&&(await p2.inputValue('#tp-q'))==='FY27-Q4','');
  await p2.context().close();
}
/* ---------- E. copy, upload in two steps, phasing ---------- */
{
  const {page}=await openAs('bm.a@demo',S1);
  await page.selectOption('#tp-q','FY27-Q4');await page.waitForTimeout(800);await page.click('[data-act="tp-copy"]');await page.waitForTimeout(1500);
  let s=await mock(page);const cp=Object.keys(s).filter(k=>/^potential\/geo_fy27_q4_/.test(k));
  ok('Copy from last quarter (state records): own rows land as Draft in Q4, nothing of another plant',cp.length===3&&cp.every(k=>s[k].status==='Draft'&&s[k].state_code==='27'),cp.join());
  await page.selectOption('#tp-q',Q);await page.waitForTimeout(800);
  const csv=await page.evaluate(()=>window.__dbg.tpTemplateCsv('potential'));const L=csv.trim().split('\n');
  ok('Template: data-map header, one row per editable state × group (Maharashtra only for BM A), saved values pre-filled',L[0]==='fy_quarter,state_code,district_id,product_group,customer_segment,potential_value_inr,potential_qty_sheets,potential_qty_sqft,share_pct,source_type,source_note,owner_email'&&L.length===5&&L.slice(1).every(l=>l.startsWith('FY27-Q3,27,_state,')),csv);
  const f=L.slice();f[2]=f[2].replace(',1,00,00,000,',',1,10,00,000,').replace(/,10000000,/,',11000000,');
  f.push('FY27-Q3,Maharashtr,_state,PVC sheet,All,5000000,,,,branch estimate,,bm.a@demo');f.push('FY27-Q3,24,_state,Laminate,All,6000000,,,,branch estimate,,bm.a@demo');f.push('FY27-Q3,27,_state,Laminat,All,6000000,,,,branch estimate,,bm.a@demo');
  fs.writeFileSync(TMP+'t59-up.csv',f.join('\n')+'\n');
  await page.setInputFiles('#up-pot',TMP+'t59-up.csv');await page.waitForSelector('.tp-upres');
  const ut=await page.innerText('.tp-upres');s=await mock(page);
  ok('Upload step 1 checks only: result per row, nothing saved before Load',/nothing is saved until you press Load/.test(ut)&&s['potential/'+K('27','_state','Door')].potential_value_inr===10000000,ut.slice(0,200));
  ok('Unchanged rows skipped with status kept; did-you-mean for state and group; another plant\'s state rejected',/Unchanged/.test(ut)&&/Did you mean Maharashtra\?/.test(ut)&&/Did you mean Laminate\?/.test(ut)&&/default plant is DEMO plant 1013, not yours/.test(ut),ut);
  await page.click('[data-act="tp-up-load"]');await page.waitForTimeout(1500);s=await mock(page);
  ok('Load: changed row becomes a Draft revision; unchanged Approved row keeps its status',s['potential/'+K('27','_state','Door')].potential_value_inr===11000000&&s['potential/'+K('27','_state','Door')].status==='Draft'&&s['potential/'+K('27','_state','Laminate')].status===S1['potential/'+K('27','_state','Laminate')].status&&!s['potential/'+K('24','_state','Laminate')],JSON.stringify(s['potential/'+K('27','_state','Door')]&&s['potential/'+K('27','_state','Door')].potential_value_inr));
  /* phasing: custom 30/30/40 on Maharashtra Laminate reaches plant 1012's months */
  await page.evaluate(k=>{document.querySelector('details[data-okey="27|Laminate"]').open=true},null);await page.waitForTimeout(300);
  await page.check('input[name^="tp-ph-"][value="custom"]');await page.waitForTimeout(300);
  for(const [i,v] of [['0','30'],['1','30'],['2','40']]){const sel='[id^="tp-phc-"][data-i="'+i+'"]';await page.fill(sel,v);await page.dispatchEvent(sel,'change');await page.waitForTimeout(150)}
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(1000);s=await mock(page);
  const ph=s['phasing/geo_fy27_q3_27_state_laminate'];
  const m=await page.evaluate(()=>{const P=window.__dbg.planQ({plant:'1012',group:'Laminate'},'FY27-Q3');return {m:P.months,t:P.tgt}});
  ok('Phasing by state (key without segment): 30/30/40 stored; months add up to the target',ph&&ph.pct.join()==='30,30,40'&&ph.state_code==='27'&&Math.abs(m.m.reduce((a,b)=>a+b,0)-m.t)<0.01&&Math.abs(m.m[0]-m.t*0.3)<0.02,JSON.stringify([ph,m]));
  await page.context().close();
}
/* ---------- F. Admin › Geography ---------- */
{
  const {page}=await openAs('super@demo',base,'#/geography');
  const b=await page.evaluate(()=>{const D=window.__dbg,v=(a,b)=>D.geoBand({share:a/100},b==null?null:{share:b/100});return [v(60,40),v(59,41),v(50,49),v(47,38),v(46,44),v(45,40),D.geoBand(null,null)]});
  ok('Bands: High ≥60%; Check 50–59% or <50% with a lead >5 points; Unmapped otherwise',b.join()==='High,Check,Check,Check,Unmapped,Unmapped,Unmapped',b.join());
  const t=await page.evaluate(()=>{const D=window.__dbg,lq=['2026-09'];return [D.geoVote({'1013':{n:100,sh:5,m:{}},'1012':{n:100,sh:9,m:{}}},lq).top.p,D.geoVote({'1013':{n:100,sh:5,m:{'2026-09':60}},'1012':{n:100,sh:5,m:{'2026-09':40}}},lq).top.p,D.geoVote({'1013':{n:100,sh:5,m:{}},'1012':{n:100,sh:5,m:{}}},lq).top.p]});
  ok('Tie rule: more sheets, then the latest quarter, then the lower plant code',t.join()==='1012,1013,1012',t.join());
  await page.click('[data-act="geo-draft"]');await page.waitForFunction(()=>!window.__dbg.GEOA.jobs,null,{timeout:60000});await page.waitForTimeout(1500);
  const dr=await page.evaluate(()=>{const d=window.__dbg.geoDraft();return {mh:d.states['27']&&d.states['27'].top&&d.states['27'].top.p,band:d.states['27']&&d.states['27'].band,share:d.states['27']&&d.states['27'].top.share,pune:d.districts['MH-PUNE']&&d.districts['MH-PUNE'].total>0,expBand:window.__dbg.geoBand(d.states['27'].top,d.states['27'].second)}});
  const gt=await txt(page);
  ok('Draft from sales history: each state voted by invoicing plant over the last 4 closed quarters, with a band from the top two shares',dr.mh&&dr.band===dr.expBand&&/Top plant share of state sales/i.test(gt)&&dr.pune,JSON.stringify(dr));
  await page.selectOption('select[data-chg="geo-st"][data-k="29"]','1011');await page.click('[data-act="geo-save"]');await page.waitForTimeout(1500);
  const s=await mock(page);
  ok('Correct and save: Karnataka default plant 1011 stored as "entered", confirmed by the person',s['geography/st_29'].default_plant_code==='1011'&&s['geography/st_29'].map_source==='entered'&&s['geography/st_29'].confirmed_by==='super@demo',JSON.stringify(s['geography/st_29']));
  /* state upload adds an SAP region alias */
  await page.evaluate(async()=>window.__dbg.geoUpload('state','state_code,state_name,aliases,default_plant_code,active\n27,Maharashtra,MH|SAP:13,1012,Y\n2,Bad,,9999,Y\n'));await page.waitForTimeout(800);
  const gm=await page.innerText('#pg');const s2=await mock(page);
  ok('State template upload: alias SAP:13 stored for Maharashtra; bad rows rejected with reasons',/MH\|SAP:13/.test(s2['geography/st_27'].aliases)&&/1 rejected/.test(gm)&&/not a laminates plant/.test(gm),gm.slice(-300));
  await page.context().close();
  const {page:p3}=await openAs('hod.sales@demo',base,'#/geography');
  ok('HOD has no Admin › Geography',/Ask your admin for access|does not include this page/.test(await p3.innerText('#pg')),'');
  await p3.context().close();
}
/* ---------- G. customer master by (system, code), SAP customer feed hook, PIN and district reach attribution ---------- */
{
  const {page}=await openAs('super@demo',base,'#/admin');
  const H=['Customer','Name','Customer Group','City','Region','Postal Code','District','GSTIN','Sales Executive','Payment Terms','Sales District','Blocked','Legacy Code','Address Count'];
  const r1=await page.evaluate(async H=>{const D=window.__dbg;
    await D.geoUpload('state','state_code,state_name,aliases,default_plant_code,active\n27,Maharashtra,MH|SAP:13,1012,Y\n');
    const before=D.S.custIdx.size;
    const r=await D.custFeedLoad({sys:'S4',headers:H,rows:[['50001000','Synthetic Customer 1','01','PUNE','13','411001','','27ABCDE1234F1Z5','S01','0001','','','',1],['50001001','Synthetic Customer 2','01','X','99','','','','','','','','',1],['50001002','Synthetic Customer 3','01','NASHIK','13','','Pune','','','','','','',1]],name:'mock staged customers',layout:'S/4 business partner (SAP feed)'});
    return {r,before}},H);
  await page.waitForTimeout(2500);
  const r2=await page.evaluate(()=>{const D=window.__dbg;return {size:D.S.custIdx.size,b1:D.custInfo([...D.S.custIdx.keys()].find(k=>/^DEMO/.test(k)))||null,s4:D.custInfo('50001000'),g1:D.custGeo('50001000',''),g2:D.custGeo('50001001',''),g3:D.custGeo('50001002',''),gaps:D.custRegionGaps(),docs:Object.keys(window.__mockStore()).filter(k=>/^customers\//.test(k)).sort()}});
  ok('SAP feed hook: a staged mock customer set loads (3 customers, ok)',r1.r.ok&&r1.r.loaded===3,JSON.stringify(r1));
  ok('Keyed by (system, code): B1 customers survive the S/4 load',r2.size===r1.before+3&&r2.b1&&r2.b1[11]==='B1'&&r2.docs.includes('customers/main_B1')&&r2.docs.includes('customers/main_S4'),JSON.stringify([r2.size,r1.before,r2.docs]));
  ok('Region is the SAP region code (SAP:13) mapped through the state alias; PIN 411001 resolves to Pune; District text resolves too; GSTIN stored',r2.s4[4]==='SAP:13'&&r2.g1.st==='27'&&r2.g1.dist==='MH-PUNE'&&r2.g3.dist==='MH-PUNE'&&r2.s4[12]==='27ABCDE1234F1Z5',JSON.stringify([r2.s4,r2.g1,r2.g3]));
  ok('Unmapped region counts as "state unknown" and is listed',r2.g2.st==='00'&&r2.gaps.n===1&&r2.gaps.regions['99']===1,JSON.stringify([r2.g2,r2.gaps]));
  /* GSTIN fallback: order master state > mapped SAP region > GSTIN prefix > invoice state > State not known */
  const gx=await page.evaluate(async H=>{const D=window.__dbg;
    await D.custFeedLoad({sys:'S4',headers:H,rows:[['50002000','G1','01','X','99','','','24ABCDE1234F1Z5','','','','','',1],['50002001','G2','01','X','','','','29ABCDE1234F1Z5','','','','','',1],['50002002','G3','01','X','13','','','24ABCDE1234F1Z5','','','','','',1],['50002003','G4','01','X','99','','','','','','','','',1],['50002004','G5','01','X','99','','','XXABCDE1234F1Z5','','','','','',1]],name:'gstin'});
    await new Promise(r=>setTimeout(r,2500));
    const g=c=>D.custGeo(c,'Kerala');return {a:g('50002000'),b:g('50002001'),c:g('50002002'),d:g('50002003'),e:g('50002004'),n:D.custGstinPlaced(),gaps:D.custRegionGaps()}},H);
  ok('GSTIN fallback: unmapped region 99 + GSTIN 24 → Gujarat; blank state + GSTIN 29 → Karnataka (placed by GSTIN)',gx.a.st==='24'&&gx.a.how==='gstin'&&gx.b.st==='29'&&gx.b.how==='gstin',JSON.stringify([gx.a,gx.b]));
  ok('GSTIN fallback order: a mapped region wins over the GSTIN; no GSTIN or a bad one falls to the invoice state',gx.c.st==='27'&&gx.c.how==='region'&&gx.d.st==='32'&&gx.d.how==='invoice'&&gx.e.st==='32',JSON.stringify([gx.c,gx.d,gx.e]));
  ok('GSTIN count: customers placed by GSTIN counted (2, S/4); unmapped-region list keeps only those still unknown',gx.n.n===2&&gx.n.by.S4===2&&gx.gaps.regions['99']===3,JSON.stringify([gx.n,gx.gaps]));
  await page.evaluate(()=>{location.hash='#/geography'});await page.waitForTimeout(1200);
  ok('Admin › Geography shows how many customers were placed by GSTIN',/Customers placed by GSTIN\s*2/i.test(await page.innerText('#pg')),'');
  const b1g=await page.evaluate(async()=>{const D=window.__dbg;await D.custFeedLoad({sys:'B1',headers:['CardCode','CardName','CardType','State','LicTradNum'],rows:[['VRGLCU000101','B1 A','C','','24ABCDE1234F1Z5'],['VRGLCU000102','B1 B','C','Maharashtra','24ABCDE1234F1Z5']],name:'b1g'});await new Promise(r=>setTimeout(r,2500));return [D.custGeo('VRGLCU000101',''),D.custGeo('VRGLCU000102','')]});
  ok('B1 file customers: blank state + GSTIN (LicTradNum) → Gujarat; the master\'s own state wins over the GSTIN',b1g[0].st==='24'&&b1g[0].how==='gstin'&&b1g[1].st==='27'&&b1g[1].how==='master',JSON.stringify(b1g));
  await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(800);
  /* reverse: a B1 load leaves S/4 customers alone */
  const r3=await page.evaluate(async()=>{const D=window.__dbg;const r=await D.custFeedLoad({sys:'B1',headers:['CardCode','CardName','CardType','State','ZipCode'],rows:[['VRGLCU000001','B1 Customer','C','Maharashtra','411001']],name:'b1'});return r});
  await page.waitForTimeout(2500);
  const r4=await page.evaluate(()=>{const D=window.__dbg;return {s4:!!D.custInfo('50001000'),b1new:D.custInfo('VRGLCU000001'),oldB1:[...D.S.custIdx.keys()].filter(k=>/^DEMO/.test(k)).length}});
  ok('B1 load replaces only B1 customers: S/4 customers survive, the old B1 set is replaced',r3.ok&&r4.s4&&r4.b1new&&r4.b1new[9]==='411001'&&r4.oldB1===0,JSON.stringify(r4));
  await page.context().close();
}
console.log(res.join('\n'));
console.log('TOTAL',res.length,'PASS',res.filter(x=>x.startsWith('PASS')).length,'FAIL',res.filter(x=>x.startsWith('FAIL')).length);
await browser.close();
