/* Targets & Potential tab (D70): role views, save / submit / approve / return, approver != proposer, copy from last quarter,
   upload round trip, phasing totals, locked quarter, no DEMO into real data, Admin link. Uses the demo store from t22's family (store-demo.json). */
import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const TMP='/tmp/claude-0/-home-user-lam/cc66010f-b189-5207-a8a3-0de9659c9226/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,c?'':(d||'')].join(' | '));
const clone=o=>JSON.parse(JSON.stringify(o));
const Q='FY27-Q3',PQ='FY27-Q2';
/* a store where the current quarter has no plan yet (last quarter keeps its figures) */
const emptyQ3=()=>{const s=clone(store);Object.keys(s).forEach(k=>{if(/^potential\/fy27_q3_/.test(k))delete s[k]});return s};
const go=async(page,who,s,q)=>{};
const openAs=async(email,s)=>{const o=await open(browser,{store:clone(s),viewer:{email,name:email}});await o.page.waitForTimeout(3500);await o.page.evaluate(()=>{location.hash='#/targets'});await o.page.waitForTimeout(1500);return o};
const mock=p=>p.evaluate(()=>window.__mockStore());
const doc=(s,k)=>s['potential/'+k];
const fillCell=async(page,field,key,val)=>{const sel='#tp-'+field+'-'+key;await page.fill(sel,val);await page.dispatchEvent(sel,'change');await page.waitForTimeout(250)};
const barText=p=>p.innerText('.tp-sticky');
const pgText=p=>p.innerText('#pg');
const dbg=(p,fn,arg)=>p.evaluate(fn,arg);

/* ---------- A. role views ---------- */
{
  const views={};
  for(const [email,label] of [['bm.a@demo','bm'],['hod.sales@demo','hod'],['se.s1@demo','se'],['mgmt@demo','mg'],['super@demo','sa']]){
    const {page,errs}=await openAs(email,store);
    const v=await page.evaluate(()=>{
      const nav=[...document.querySelectorAll('.navg')].map(g=>g.querySelector('h4').innerText+':'+[...g.querySelectorAll('.nl')].map(x=>x.innerText).join('|'));
      return {nav,inputs:document.querySelectorAll('[data-tp="pot"]').length,rows:document.querySelectorAll('details.tp-row').length,plants:[...document.querySelectorAll('#tp-plant option')].map(o=>o.value).filter(Boolean),
        bar:document.querySelector('.tp-sticky').innerText,note:document.querySelector('.tp-note').innerText,hasLock:!!document.querySelector('[data-act="tp-lock-open"]'),hasApprove:!!document.querySelector('[data-act="tp-approve"]'),
        hasUp:!!document.querySelector('#up-pot'),hasCopy:!!document.querySelector('[data-act="tp-copy"]'),head:document.querySelector('h1').innerText,
        plantHdr:[...document.querySelectorAll('.tp-ph')].map(x=>x.innerText.slice(0,30)),canAdmin:window.__dbg.pagesFor(window.__dbg.effUser()).includes('admin')}});
    views[label]=v;
    ok(label+': page opens with no script error',!errs.filter(e=>!/ERR_FAILED/.test(e)).length,JSON.stringify(errs));
    ok(label+': nav has its own "Plan" group with Targets & Potential, after Team',v.nav.some(n=>/^PLAN:Targets & Potential$/i.test(n))&&v.nav.findIndex(n=>/^PLAN/i.test(n))>v.nav.findIndex(n=>/^TEAM/i.test(n)),JSON.stringify(v.nav));
    await page.context().close();
  }
  const b=views.bm;
  ok('bm view: edits own plant only (1012), inputs present, copy/upload/save/submit shown, no approve, no lock',b.plants.join()==='1012'&&b.inputs>0&&b.hasCopy&&b.hasUp&&/Save draft/.test(b.bar)&&/Submit/.test(b.bar)&&!b.hasApprove&&!b.hasLock&&/You are the Branch manager/.test(b.note),JSON.stringify([b.plants,b.inputs,b.bar,b.note.slice(0,60)]));
  ok('bm view: Admin page is gone for a Branch manager (no separate Plans screen)',!b.canAdmin&&!b.nav.some(n=>/Admin/.test(n)),JSON.stringify(b.nav));
  const h=views.hod;
  ok('hod view: view only, all plants, no inputs, no upload, no approve',h.inputs===0&&h.plants.length>=3&&/View only/.test(h.bar)&&!h.hasUp&&!h.hasApprove&&!h.hasCopy&&/View only\. You see all plants/.test(h.note)&&!h.canAdmin,JSON.stringify([h.inputs,h.plants,h.bar]));
  const s=views.se;
  ok('se view: view only, plant scope, no inputs, no upload',s.inputs===0&&/View only/.test(s.bar)&&!s.hasUp&&!s.hasApprove&&/View only\. You see the plant where your customers are/.test(s.note)&&s.plants.length>=1&&s.plants.length<=views.hod.plants.length,JSON.stringify([s.inputs,s.plants,s.bar]));
  const m=views.mg;
  ok('mg view: all plants, can edit, upload, return and approve, lock quarter, no Admin',m.inputs>0&&m.plants.length>=3&&m.hasUp&&m.hasApprove&&m.hasLock&&/Return with reason/.test(m.bar)&&/You can propose and approve, but never approve a row you proposed/.test(m.note)&&!m.canAdmin,JSON.stringify([m.inputs,m.plants,m.bar]));
  const a=views.sa;
  ok('sa view: all plants, edit, approve, lock, Admin kept',a.inputs>0&&a.hasApprove&&a.hasLock&&a.hasUp&&/Approval of a row you proposed still needs another approver/.test(a.note)&&a.canAdmin,JSON.stringify([a.inputs,a.bar]));
  /* Admin > Market potential is a link to the tab */
  const {page}=await openAs('super@demo',store);
  await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(600);
  await page.click('[data-act="atab"][data-t="potential"]');await page.waitForTimeout(400);
  const lk=await page.evaluate(()=>({href:(document.querySelector('#a-body a[href="#/targets"]')||{}).getAttribute&&document.querySelector('#a-body a[href="#/targets"]').getAttribute('href'),pot:!!document.querySelector('[data-act="pot-edit"]'),add:!!document.querySelector('[data-act="pot-add"]')}));
  ok('Admin > Market potential is a link to Targets & Potential (no second entry point)',lk.href==='#/targets'&&!lk.pot&&!lk.add,JSON.stringify(lk));
  await page.context().close();
}

/* ---------- B. save / submit / approve / return, approver != proposer, default share is a suggestion ---------- */
let S1;
{
  const {page}=await openAs('bm.a@demo',emptyQ3());
  const kL='fy27_q3_1012_laminate_all',kD='fy27_q3_1012_door_all';
  const info=await page.evaluate(()=>{const D=window.__dbg,ser=D.quarterSeries({plant:'1012',group:'Laminate'}),en=ser.find(x=>x.q==='FY27-Q2'),pot=D.S.potential.filter(x=>x.fy_quarter==='FY27-Q2'&&x.plant_code==='1012'&&x.product_group==='Laminate').reduce((a,x)=>a+(+(x.approved||x).potential_value_inr),0);
    const r2=v=>Math.round(v*100)/100;return {A:en.H,loaded:en.loaded,pot:pot,dsh:r2(r2(en.H/pot*100)+2),isCur:en.isCur}});
  ok('empty quarter: guide card with three ways to start, "0 started"',/three ways to start/i.test(await pgText(page))&&/0 started/.test(await pgText(page)),(await pgText(page)).slice(0,300));
  const ph=await page.getAttribute('#tp-share-'+kL,'placeholder'),cls=await page.getAttribute('#tp-share-'+kL,'class');
  ok('default share is shown only as a suggestion: last quarter actual ÷ potential + 2 points, hatched, value empty',info.loaded&&!info.isCur&&ph===info.dsh.toFixed(2)&&/dflt/.test(cls)&&(await page.inputValue('#tp-share-'+kL))==='',JSON.stringify([ph,info,cls]));
  ok('nothing is saved just by opening an empty quarter',!Object.keys(await mock(page)).some(k=>/^potential\/fy27_q3_/.test(k)),'');
  await fillCell(page,'pot',kL,'2,00,00,000');
  const sugg=await page.getAttribute('#tp-tgt-'+kL,'placeholder');
  const expT=await page.evaluate(([p,s])=>window.__dbg.leafTgt(p,s).toLocaleString('en-IN',{maximumFractionDigits:2}),[20000000,info.dsh]);
  ok('potential typed: target suggestion = potential × default share, still unsaved',sugg===expT&&!Object.keys(await mock(page)).some(k=>/^potential\/fy27_q3_/.test(k)),sugg+' vs '+expT);
  /* share <-> target linkage on Door: enter potential and target, share follows */
  await fillCell(page,'pot',kD,'1,00,00,000');await fillCell(page,'tgt',kD,'45,00,000');
  ok('Target ₹ typed: Share % follows (45,00,000 ÷ 1,00,00,000 = 45.00)',(await page.inputValue('#tp-share-'+kD))==='45.00',await page.inputValue('#tp-share-'+kD));
  await fillCell(page,'share',kD,'50');
  ok('Share % typed last: Target ₹ follows (50% of 1,00,00,000 = 50,00,000)',(await page.inputValue('#tp-tgt-'+kD))==='50,00,000',await page.inputValue('#tp-tgt-'+kD));
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(900);
  let s=await mock(page),dl=doc(s,kL),dd=doc(s,kD);
  ok('Save draft: Laminate saved as Draft with the default share, no demo flag, SAP-free plan fields, one revision by the proposer',dl&&dl.status==='Draft'&&dl.potential_value_inr===20000000&&dl.share_pct===info.dsh&&!dl.demo&&dl.customer_segment==='All'&&dl.plant_code==='1012'&&dl.revisions.length===1&&dl.revisions[0].by==='bm.a@demo'&&dl.rev===1,JSON.stringify(dl));
  ok('Save draft: Door saved with the entered share 50 and target 50,00,000',dd&&dd.share_pct===50&&dd.status==='Draft',JSON.stringify(dd&&[dd.share_pct,dd.status]));
  ok('Save draft: "Draft" shown on the rows, not counted as an approved target',/2 Draft/.test(await pgText(page))&&(await page.evaluate(()=>window.__dbg.planQ({plants:null},'FY27-Q3').kind))==='draft','');
  /* submit needs reason, date, participants */
  await page.click('[data-act="tp-submit"]');await page.waitForSelector('#tp-s-reason');
  await page.click('[data-act="tp-submit-go"]');
  ok('Submit without a reason is refused',/reason is required/i.test(await page.innerText('#d-err')),await page.innerText('#d-err'));
  await page.fill('#tp-s-reason','Dealer survey up');await page.fill('#tp-s-part','Branch team');
  await page.click('[data-act="tp-submit-go"]');await page.waitForTimeout(900);
  s=await mock(page);dl=doc(s,kL);dd=doc(s,kD);
  ok('Submit: both rows are Proposed (stored as Discussed) with reason, date and participants on the revision',dl.status==='Discussed'&&dd.status==='Discussed'&&dl.revisions[0].reason==='Dealer survey up'&&dl.revisions[0].participants==='Branch team'&&/^\d{4}-\d\d-\d\d$/.test(dl.revisions[0].discussion_date),JSON.stringify(dl.revisions));
  ok('Submit: page shows Proposed; the Branch manager has no approve control',/Proposed/.test(await pgText(page))&&!(await page.$('[data-act="tp-approve"]')),'');
  const bmApprove=await page.evaluate(k=>{const D=window.__dbg,x=D.S.potential.find(p=>p._id===k);return D.advanceDoc(x,D.effUser())},kL);
  ok('Branch manager cannot approve (rule, not just a hidden button)',/Approval is by SP Sir or a Management/.test(bmApprove.err||''),JSON.stringify(bmApprove.err));
  S1=await mock(page);await page.context().close();
}
/* Management: proposes own row, cannot approve it; approves the Branch manager's rows; returns one */
let S2;
{
  const {page}=await openAs('mgmt@demo',S1);
  const kL='fy27_q3_1012_laminate_all',kD='fy27_q3_1012_door_all',kP='fy27_q3_1011_pvc_sheet_all';
  ok('Management sees the Branch manager rows as Proposed with a select box',(await page.$$('[data-tp="sel"]')).length===2,(await page.$$('[data-tp="sel"]')).length);
  /* Management proposes a row of its own on plant 1011 */
  await fillCell(page,'pot',kP,'80,00,000');await fillCell(page,'share',kP,'40');
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(800);
  await page.click('[data-act="tp-submit"]');await page.waitForSelector('#tp-s-reason');
  await page.fill('#tp-s-reason','HO view');await page.fill('#tp-s-part','HO team');await page.click('[data-act="tp-submit-go"]');await page.waitForTimeout(900);
  let s=await mock(page);
  ok('Management row 1011 PVC submitted by Management; proposer is Management',doc(s,kP)&&doc(s,kP).status==='Discussed'&&await page.evaluate(k=>window.__dbg.proposerOf(window.__dbg.S.potential.find(p=>p._id===k)),kP)==='mgmt@demo','');
  const own=await page.innerText('details.tp-row:has(#tp-pot-'+kP+')').catch(()=>'');
  const txt=await pgText(page);
  ok('Approver is not the proposer: Management sees "another approver needed" on its own row and no select box for it',/You proposed this: another approver needed/.test(txt)&&!(await page.$('[data-tp="sel"][data-key="'+kP+'"]')),txt.slice(0,200));
  const selfAp=await page.evaluate(k=>{const D=window.__dbg;return D.advanceDoc(D.S.potential.find(p=>p._id===k),D.effUser())},kP);
  ok('Approver is not the proposer: rule refuses the proposer even when called directly',/proposer cannot approve/.test(selfAp.err||''),JSON.stringify(selfAp));
  /* approve the Branch manager's Laminate; return Door */
  await page.check('[data-tp="sel"][data-key="'+kL+'"]');await page.waitForTimeout(300);
  ok('Approve button counts the ticked rows',/Approve 1 selected/.test(await barText(page)),await barText(page));
  await page.click('[data-act="tp-approve"]');await page.waitForTimeout(900);
  s=await mock(page);let dl=doc(s,kL);
  ok('Approve: Laminate is Approved by Management; approved and original recorded; achievement basis is the approved target',dl.status==='Approved'&&dl.approved&&dl.approved.by==='mgmt@demo'&&dl.original&&dl.approved.potential_value_inr===20000000,JSON.stringify([dl.status,dl.approved,dl.original]));
  const tg=await page.evaluate(()=>{const P=window.__dbg.planQ({plant:'1012',group:'Laminate'},'FY27-Q3');return [P.kind,Math.round(P.tgt),Math.round(P.orig)]});
  const exp=Math.round(dl.approved.potential_value_inr*dl.approved.share_pct/100);
  ok('Approve: planQ counts the approved target (current = original)',tg.join()==='approved,'+exp+','+exp,JSON.stringify([tg,exp]));
  await page.check('[data-tp="sel"][data-key="'+kD+'"]');
  await page.click('[data-act="tp-return-open"]');await page.waitForTimeout(300);
  await page.click('[data-act="tp-return-go"]');await page.waitForTimeout(500);
  ok('Return without a reason is refused and nothing changes',/reason is required/i.test(await page.innerText('#tp-msg'))&&doc(await mock(page),kD).status==='Discussed','');
  await page.fill('#tp-ret-text','Door potential looks high. Add the dealer survey note.');await page.dispatchEvent('#tp-ret-text','input');
  await page.click('[data-act="tp-return-go"]');await page.waitForTimeout(1200);
  s=await mock(page);const dr=doc(s,kD);
  const act=Object.values(s).filter(a=>a&&a.rule==='M'&&/Targets returned/.test(a.title||''));
  ok('Return: Door goes back to Draft with the reason on the revision trail',dr.status==='Draft'&&dr.revisions.slice(-1)[0].returned===true&&dr.revisions.slice(-1)[0].reason==='Door potential looks high. Add the dealer survey note.',JSON.stringify(dr.revisions.slice(-1)));
  const prop=await page.evaluate(k=>window.__dbg.proposerOf(window.__dbg.S.potential.find(p=>p._id===k)),kD);
  ok('Return: the proposer stays the Branch manager (the returner does not become proposer); an action lands on the proposer\'s list',prop==='bm.a@demo'&&act.length===1&&act[0].owner==='bm.a@demo'&&act[0].assigner==='mgmt@demo',JSON.stringify(act.map(a=>[a.owner,a.assigner,a.title])));
  S2=s;await page.context().close();
}
/* Super admin approves the Management-proposed row (a second approver), then locks the quarter */
{
  const {page}=await openAs('super@demo',S2);
  const kP='fy27_q3_1011_pvc_sheet_all',kL='fy27_q3_1012_laminate_all';
  await page.check('[data-tp="sel"][data-key="'+kP+'"]');await page.click('[data-act="tp-approve"]');await page.waitForTimeout(900);
  let s=await mock(page);
  ok('Another approver (Super admin) approves the Management-proposed row',doc(s,kP).status==='Approved'&&doc(s,kP).approved.by==='super@demo','');
  /* lock */
  await page.click('[data-act="tp-lock-open"]');await page.waitForSelector('[data-act="tp-lock-go"]');await page.click('[data-act="tp-lock-go"]');await page.waitForTimeout(3500);
  s=await mock(page);
  const lk=await page.evaluate(()=>[window.__dbg.isPlanLocked('FY27-Q3'),window.__dbg.S.potential.filter(x=>x.fy_quarter==='FY27-Q3'&&x.status==='Locked').length]);
  ok('Lock quarter: Approved rows become Locked and the quarter is plan-locked',lk[0]===true&&lk[1]===2,JSON.stringify(lk));
  const t=await page.evaluate(()=>({inputs:document.querySelectorAll('[data-tp="pot"]').length,bar:document.querySelector('.tp-sticky').innerText,opt:document.querySelector('#tp-q option:checked').innerText}));
  ok('Locked quarter is read-only even for Super admin, and the picker marks it Locked',t.inputs===0&&/is locked/.test(t.bar)&&/Locked/.test(t.opt),JSON.stringify(t));
  const w=await page.evaluate(()=>window.__dbg.tpSave());
  ok('Saving into a locked quarter is refused',w.saved===0,JSON.stringify(w));
  /* last quarter is locked in the demo store: view it */
  await page.selectOption('#tp-q',PQ);await page.waitForTimeout(700);
  const t2=await page.evaluate(()=>({inputs:document.querySelectorAll('[data-tp="pot"]').length,bar:document.querySelector('.tp-sticky').innerText,opts:[...document.querySelectorAll('#tp-q option')].filter(o=>/Locked/.test(o.innerText)).length}));
  ok('Locked quarters listed in the picker as read-only (Q2 FY27 shows plain figures)',t2.inputs===0&&/locked/.test(t2.bar)&&t2.opts>=2,JSON.stringify(t2));
  await page.context().close();
}

/* ---------- C. copy from last quarter; DEMO never enters real data ---------- */
{
  const {page}=await openAs('bm.a@demo',store);
  await page.selectOption('#tp-q','FY27-Q4');await page.waitForTimeout(700);
  ok('Q4 FY27 is empty before the copy',/0 started/.test(await pgText(page)),'');
  await page.click('[data-act="tp-copy"]');await page.waitForTimeout(1500);
  let s=await mock(page);const cp=Object.keys(s).filter(k=>/^potential\/fy27_q4_1012_/.test(k));
  const src=s['potential/fy27_q3_1012_laminate_dealer'],c=s['potential/fy27_q4_1012_laminate_dealer'];
  ok('Copy: every own-plant row of last quarter lands in the new quarter as Draft, with potential and share, not other plants',cp.length===6&&!Object.keys(s).some(k=>/^potential\/fy27_q4_(1001|1011|1013)_/.test(k))&&c.status==='Draft'&&c.potential_value_inr===src.approved.potential_value_inr&&c.share_pct===src.approved.share_pct&&c.revisions[0].by==='bm.a@demo'&&/Copied from Q3 FY27/.test(c.revisions[0].reason),JSON.stringify([cp.length,c&&[c.status,c.potential_value_inr,c.share_pct]]));
  ok('Copy: a DEMO source stays DEMO so Clear demo removes the copy (demo-only store)',c.demo===true,'');
  const m1=await page.innerText('#tp-msg');
  await page.click('[data-act="tp-copy"]');await page.waitForTimeout(1200);
  const m2=await page.innerText('#tp-msg');s=await mock(page);
  ok('Copy again leaves existing figures alone',/Copied 0 rows/.test(m2)&&/already had figures/.test(m2)&&Object.keys(s).filter(k=>/^potential\/fy27_q4_1012_/.test(k)).length===6,m1+' || '+m2);
  await page.context().close();
  /* real sales for plant 1012: its DEMO potential must neither show nor be copied, and a new row carries no demo flag */
  const r=clone(store);Object.keys(r).forEach(k=>{if(/^cells\//.test(k)){const c=r[k];Object.keys(c.plants||{}).forEach(p=>{if(p==='1012')delete c.plants[p].demo})}});
  const {page:p2}=await openAs('bm.a@demo',r);
  const sh=await pgText(p2);
  ok('Real sales for plant 1012: its DEMO plan figures are not shown (rows Not started)',/0 started/.test(sh)&&!/Approved/.test((await p2.innerText('.tp-gridcard')).replace(/approved/g,'')),sh.slice(0,200));
  await p2.selectOption('#tp-q','FY27-Q4');await p2.waitForTimeout(600);
  await p2.click('[data-act="tp-copy"]');await p2.waitForTimeout(1200);
  const s3=await mock(p2);
  ok('Real sales: copy from last quarter takes no DEMO value',!Object.keys(s3).some(k=>/^potential\/fy27_q4_1012_/.test(k))&&/no potential figures to copy/.test(await p2.innerText('#tp-msg')),await p2.innerText('#tp-msg'));
  await p2.selectOption('#tp-q',Q);await p2.waitForTimeout(500);
  const kL='fy27_q3_1012_laminate_all';await fillCell(p2,'pot',kL,'1,00,00,000');await fillCell(p2,'share',kL,'45');await p2.click('[data-act="tp-save"]');await p2.waitForTimeout(800);
  const s4=await mock(p2),nd=s4['potential/'+kL];
  ok('Real sales: a saved row has no demo flag and overwrites nothing DEMO as an approved target',nd&&nd.status==='Draft'&&!nd.demo&&!nd.approved&&nd.revisions.length===1,JSON.stringify(nd));
  await p2.context().close();
}

/* ---------- D. upload round trip ---------- */
{
  const {page}=await openAs('bm.a@demo',emptyQ3());
  const csv0=await page.evaluate(()=>window.__dbg.tpTemplateCsv('potential'));
  const L=csv0.trim().split('\n');
  ok('Template: header of the market-potential file, one row per own plant × product group, quarter filled, potential blank',L[0]==='fy_quarter,plant_code,territory,product_group,customer_segment,potential_value_inr,potential_qty_sheets,potential_qty_sqft,source_type,source_note,owner_email'&&L.length===5&&L.every((l,i)=>i===0||(l.startsWith('FY27-Q3,1012,,')&&/,bm\.a@demo$/.test(l))),csv0);
  const f=L.slice();
  f[1]=L[1].split(',').slice(0,5).join(',')+',"3,00,00,000",,,branch estimate,from dealers,bm.a@demo';
  f[2]=L[2].split(',').slice(0,5).join(',')+',12000000,,,branch estimate,,bm.a@demo';
  f.push('FY27-Q3,1013,,Laminate,All,5000000,,,branch estimate,,bm.a@demo');/* not this Branch manager's plant */
  fs.writeFileSync(TMP+'t59-pot.csv',f.join('\n')+'\n');
  await page.setInputFiles('#up-pot',TMP+'t59-pot.csv');await page.waitForTimeout(1800);
  let s=await mock(page);const msg=await page.innerText('#up-msg');
  const k1=Object.keys(s).filter(k=>/^potential\/fy27_q3_1012_/.test(k));
  ok('Upload: two filled rows saved as Draft revisions by the uploader; blank template rows skipped, not rejected',k1.length===2&&k1.every(k=>s[k].status==='Draft'&&s[k].revisions[0].by==='bm.a@demo'&&!s[k].demo)&&/Template rows left blank \(skipped\)\s*2/.test(msg.replace(/\n/g,' ')),msg.slice(0,300)+JSON.stringify(k1));
  ok('Upload: the row for another Branch manager\'s plant is rejected with the plant rule',/1 row\(s\) rejected/.test(msg)&&/own plants only/.test(msg)&&!s['potential/fy27_q3_1013_laminate_all'],msg.slice(0,400));
  ok('Upload: values in the grid, default share (a suggestion) not yet stored',s['potential/fy27_q3_1012_laminate_all'].potential_value_inr===30000000&&s['potential/fy27_q3_1012_laminate_all'].share_pct==='','');
  /* round trip: the new template carries the uploaded figures */
  const csv1=await page.evaluate(()=>window.__dbg.tpTemplateCsv('potential'));
  ok('Round trip: downloading again returns the uploaded potential',/Laminate,All,30000000,/.test(csv1)&&/Door,All,12000000,/.test(csv1),csv1);
  /* phasing upload: Laminate custom 30/30/40 */
  const ph0=await page.evaluate(()=>window.__dbg.tpTemplateCsv('phasing')).then(t=>t.trim().split('\n'));
  ok('Phasing template: header and three month rows per row, current phasing prefilled',ph0[0]==='fy_quarter,plant_code,product_group,customer_segment,month_in_quarter,phasing_pct'&&ph0.length===1+4*3&&/^FY27-Q3,1012,Laminate,,1,33\.33/.test(ph0[1]),ph0.slice(0,3).join(' / '));
  const pcsv=ph0[0]+'\nFY27-Q3,1012,Laminate,,1,30\nFY27-Q3,1012,Laminate,,2,30\nFY27-Q3,1012,Laminate,,3,40\nFY27-Q3,1013,Laminate,,1,30\nFY27-Q3,1013,Laminate,,2,30\nFY27-Q3,1013,Laminate,,3,40\n';
  fs.writeFileSync(TMP+'t59-ph.csv',pcsv);
  await page.setInputFiles('#up-ph',TMP+'t59-ph.csv');await page.waitForTimeout(1500);
  s=await mock(page);const pm=await page.innerText('#up-msg');
  const phd=Object.keys(s).filter(k=>/^phasing\//.test(k)).map(k=>s[k]);
  ok('Phasing upload: own plant accepted (30/30/40), another plant rejected',phd.length===1&&phd[0].plant_code==='1012'&&phd[0].pct.join()==='30,30,40'&&/own plants only/.test(pm),pm.slice(0,300)+JSON.stringify(phd));
  await fillCell(page,'share','fy27_q3_1012_laminate_all','50');
  const rd=await page.evaluate(()=>{const row=window.__dbg.tpModel().rows.find(r=>r.plant==='1012'&&r.group==='Laminate');return {m:document.querySelector('input[name^="tp-ph-"]:checked').value}});
  ok('Uploaded phasing shows as Custom % in the row',rd.m==='custom','');
  await page.context().close();
  /* a HOD cannot upload: the same rule refuses every row */
  const {page:ph}=await openAs('hod.sales@demo',emptyQ3());
  fs.writeFileSync(TMP+'t59-hod.csv',L[0]+'\nFY27-Q3,1012,,Laminate,All,1000,,,branch estimate,,bm.a@demo\n');
  await ph.evaluate(async txt=>{await window.__dbg.masterUpload('potential',{name:'hod.csv',text:async()=>txt})},fs.readFileSync(TMP+'t59-hod.csv','utf8'));await ph.waitForTimeout(800);
  const hm=await ph.evaluate(()=>(document.querySelector('#up-msg')||{innerText:''}).innerText),hs=await mock(ph);
  const hodGuard=await ph.evaluate(()=>window.__dbg.planGuard({plant_code:'1012'}));
  ok('HOD upload refused: role cannot propose sales targets, nothing written',/cannot propose or approve sales targets/.test(hodGuard)&&!Object.keys(hs).some(k=>/^potential\/fy27_q3_1012_laminate_all/.test(k)),hodGuard+' | '+hm.slice(0,200));
  await ph.context().close();
}

/* ---------- E. phasing totals ---------- */
{
  const kL='fy27_q3_1012_laminate_all';
  const {page}=await openAs('bm.a@demo',emptyQ3());
  await fillCell(page,'pot',kL,'2,00,00,000');await fillCell(page,'share',kL,'50');
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(800);
  const sumM=(q)=>page.evaluate(()=>{const P=window.__dbg.planQ({plant:'1012',group:'Laminate'},'FY27-Q3');return {t:P.tgt,m:P.months.slice(),sum:P.months.reduce((a,b)=>a+b,0)}});
  let r=await sumM();
  ok('Equal split: months 33,33,333.33 + 33,33,333.33 + remainder add up to 1,00,00,000',r.t===10000000&&Math.abs(r.sum-10000000)<0.005&&Math.abs(r.m[0]-3333333.33)<0.006&&Math.abs(r.m[2]-3333333.34)<0.006,JSON.stringify(r));
  /* custom 30/30/40 through the page */
  await page.evaluate(()=>{const d=document.querySelector('details.tp-row');d.open=true});await page.waitForTimeout(300);
  await page.check('input[name^="tp-ph-"][value="custom"]');await page.waitForTimeout(400);
  await page.fill('[id^="tp-phc-"][data-i="0"]','30');await page.fill('[id^="tp-phc-"][data-i="1"]','30');await page.fill('[id^="tp-phc-"][data-i="2"]','30');await page.dispatchEvent('[id^="tp-phc-"][data-i="2"]','change');await page.waitForTimeout(300);
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(700);
  ok('Custom % not adding to 100 is refused and nothing is written',/adding up to 100/.test(await page.innerText('#tp-msg'))&&!Object.keys(await mock(page)).some(k=>/^phasing\//.test(k)),await page.innerText('#tp-msg'));
  await page.fill('[id^="tp-phc-"][data-i="2"]','40');await page.dispatchEvent('[id^="tp-phc-"][data-i="2"]','change');await page.waitForTimeout(300);
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(900);
  r=await sumM();
  ok('Custom 30/30/40: months 30,00,000 / 30,00,000 / 40,00,000, sum equals the quarter target',r.m.join()==='3000000,3000000,4000000'&&r.sum===10000000,JSON.stringify(r));
  ok('Phasing change is logged',Object.values(await mock(page)).some(l=>l&&l.event==='phasing changed'&&l.quarter==='FY27-Q3'),'');
  /* working days */
  await page.evaluate(()=>{document.querySelector('details.tp-row').open=true});
  await page.check('input[name^="tp-ph-"][value="wd"]');await page.waitForTimeout(400);
  await page.click('[data-act="tp-save"]');await page.waitForTimeout(900);
  const wd=await page.evaluate(()=>window.__dbg.qMonths('FY27-Q3').map(window.__dbg.WD));
  const S=wd.reduce((a,b)=>a+b,0),T=10000000,r2=v=>Math.round(v*100)/100,e1=r2(T*(wd[0]/S*100)/100),e2=r2(T*(wd[1]/S*100)/100),e3=r2(T-e1-e2);
  r=await sumM();
  ok('Working days ('+wd.join('/')+'): months follow the days, month 3 takes the remainder, sum = quarter target',Math.abs(r.m[0]-e1)<0.006&&Math.abs(r.m[1]-e2)<0.006&&Math.abs(r.m[2]-e3)<0.006&&Math.abs(r.sum-T)<0.005,JSON.stringify([r,e1,e2,e3]));
  /* equal split again */
  await page.evaluate(()=>{document.querySelector('details.tp-row').open=true});
  await page.check('input[name^="tp-ph-"][value="equal"]');await page.waitForTimeout(400);await page.click('[data-act="tp-save"]');await page.waitForTimeout(900);
  r=await sumM();
  ok('Back to equal split: months differ by at most 0.01 and add up',Math.abs(r.m[0]-r.m[1])<0.006&&Math.abs(r.sum-T)<0.005,JSON.stringify(r));
  await page.context().close();
}
console.log(res.join('\n'));
console.log('TOTAL',res.length,'PASS',res.filter(x=>x.startsWith('PASS')).length,'FAIL',res.filter(x=>x.startsWith('FAIL')).length);
await browser.close();
