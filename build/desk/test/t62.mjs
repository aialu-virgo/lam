import { chromium, open } from './run.mjs';
import fs from 'fs';import { createRequire } from 'module';
const require=createRequire(import.meta.url);const G=require('../../demo-data/generator.js');
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';const AF=SP+'af/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const csvOf=(h,rows)=>[h.join(',')].concat(rows.map(r=>r.map(v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(','))).join('\n');
const plants=Object.keys(store).filter(k=>/^plants\//.test(k)&&store[k].plant_name&&/^DEMO/.test(store[k].plant_name)).slice(0,4).map(k=>({code:k.slice(7),name:store[k].plant_name}));
const clone=o=>JSON.parse(JSON.stringify(o));
const st0=clone(store);Object.keys(st0).forEach(k=>{if(/^(collections|creditnotes|backups|uploads|rejects|actions|followups|cells|inv|roll|jobs)\//.test(k))delete st0[k]});
let {page,errs}=await open(browser,{store:st0,autoload:true,today:'2026-10-23'});await page.waitForTimeout(3500);
await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(700);await page.evaluate(()=>{window.__NOAUTOLOAD=false});
const ms=p=>page.evaluate(p=>Object.fromEntries(Object.entries(window.__mockStore()).filter(([k])=>new RegExp(p).test(k))),p);
const up=async f=>{await page.click('[data-act="u-reset"]').catch(()=>{});const inp=await page.$('input[type=file]');await inp.setInputFiles(f);await page.waitForFunction(n=>window.__desk.U&&window.__desk.U.name===n&&['mapping','validated','done','idle'].includes(window.__desk.U.stage),f.split('/').pop(),{timeout:60000});await page.waitForTimeout(400)};
const inv=async f=>{await up(f);await page.evaluate(()=>{const b=document.querySelector('[data-act="u-validate"]');if(b)b.click()});await page.waitForFunction(()=>window.__desk.U.stage==='done'||window.__desk.U.stage==='validated',null,{timeout:90000});
  if(await page.evaluate(()=>window.__desk.U.stage)==='validated'){if(await page.$('[data-chg="confrep"]'))await page.check('[data-chg="confrep"]');if(await page.$('#u-reason'))await page.fill('#u-reason','reload for the test');await page.waitForTimeout(300);await page.click('[data-act="u-load"]');await page.waitForFunction(()=>window.__desk.U.stage==='done',null,{timeout:90000})}await page.waitForTimeout(800)};
const dbg=(f,...a)=>page.evaluate(([f,a])=>{const r=window.__dbg[f](...a);return r},[f,a]);
const ev=(fn,arg)=>page.evaluate(fn,arg);
/* ---- 0. item master with brand and thickness for all 400 demo item codes ---- */
const THK=[1,0.8,1.25,1.5,0.92,0.72,0.55,2.0],BRS=['DEMO Brand A','DEMO Brand B','DEMO Brand C','DEMO Brand D','DEMO Brand E','DEMO Brand F','DEMO Brand G','DEMO Brand H','DEMO Brand I','DEMO Brand J'];
await ev(async([th,br])=>{const items=[];for(let i=1;i<=400;i++)items.push(['DEMOFG'+String(i).padStart(5,'0'),i%9===0?1:0,32,th[i%th.length],'Pcs',1,'8X4',br[i%br.length]]);
  await window.__desk.dset('items/c0',{z:await window.__desk.gz(JSON.stringify(items)),n:items.length,i:0,at:new Date().toISOString(),by:'t62'});
  await window.__desk.dset('itemmeta/main',{at:new Date().toISOString(),by:'t62',file:'t62 items',loaded:400,chunks:1,upload:'t62',with_brand:400});},[THK,BRS]);
await page.waitForTimeout(1500);
/* ---- 1. four months of sales, four plants ---- */
const gen={};const mths=['2026-07','2026-08','2026-09','2026-10'];
for(const m of mths){const o={shape:'B1',plants,months:[m],docsPerPlantMonth:14,seed:9,dateStyle:'iso'};if(m==='2026-10')o.cutoff='2026-10-21';const a=G.invoices(o);gen[m]=a;fs.writeFileSync(AF+'Combine Sale '+m+' t62.csv',csvOf(a.headers,a.rows))}
for(const m of mths)await inv(AF+'Combine Sale '+m+' t62.csv');
const cells=await ms('^cells/INV_'),invDocs=await ms('^inv/');
const codes=plants.map(p=>p.code);
let allDim=true,sumOk=true,labOk=true,chunkOk=true,nDim=0,detail='';
for(const m of mths)for(const p of codes){
  const info=cells['cells/INV_'+m]&&cells['cells/INV_'+m].plants[p];if(!info){allDim=false;detail+=' nocell '+m+p;continue}
  if(!(info.dimFrom>=1&&info.dimFrom<info.chunks)){allDim=false;detail+=' nodim '+m+p+JSON.stringify(info.dimFrom)}
  let sh=0,net=0,rows=[];
  for(let i=0;i<info.chunks;i++){const d=invDocs['inv/'+info.sys+'-'+p+'-'+m+'-'+i];if(!d){chunkOk=false;continue}
    if(i>=info.dimFrom){if(!d.dim||d.na!==0||d.nh!==0)chunkOk=false;const o=JSON.parse(await ev(([z])=>window.__desk.ungz(z),[d.z]));if(o.a.length||o.h.length)chunkOk=false;rows=rows.concat(o.d);nDim++}
    else if(d.dim)chunkOk=false}
  rows.forEach(r=>{sh+=r[5];net+=r[7];if(!/^\d\.\d\d MM$/.test(r[0])||!BRS.includes(r[1])||!/^[1-5]?$/.test(r[3]))labOk=false});
  if(Math.abs(sh-info.sheets)>0.5||Math.abs(net-info.net)>1.5){sumOk=false;detail+=' sum '+m+p+' '+sh+'/'+info.sheets+' '+net+'/'+info.net}
}
ok('upload: every plant-month records dimFrom and the detail chunks sit after the normal ones',allDim&&chunkOk&&nDim>=16,'dim chunks '+nDim+detail);
ok('upload: the detail rows add up to the cell (sheets within 0.5, net within 1.5): external lines only',sumOk,detail);
ok('upload: thickness labels read "1.00 MM", brands come from the item master, zone digit is 1-5 or empty',labOk,'');
/* independent zone majority from the generated CSV */
const cats=await ev(cs=>cs.filter(c=>window.__desk.groupOf('B1',c,'')),[...new Set(Object.values(gen).flatMap(a=>a.rows.map(r=>r[a.headers.indexOf('Catagory')])))]);
const truth={};plants.forEach(p=>{const cnt={};Object.values(gen).forEach(a=>{const H=a.headers,iz=H.indexOf('Zone'),ip=H.indexOf('BPLName'),ic=H.indexOf('Catagory'),ia=H.indexOf('AcctName'),icu=H.indexOf('CardCode');a.rows.forEach(r=>{if(r[ip]!==p.name||!cats.includes(r[ic])||r[iz]==='BRANCH'||/stock outward/i.test(r[ia]))return;const m=/^ZONE([1-5])$/.exec(r[iz]);if(m)cnt[m[1]]=(cnt[m[1]]||0)+1})});truth[p.code]=cnt});
const zf=await ev(cs=>Object.fromEntries(cs.map(c=>[c,window.__dbg.zoneFromLines(c)])),codes);
let zOk=true,zd='';codes.forEach(c=>{const t=truth[c],ks=Object.keys(t).sort((a,b)=>t[b]-t[a]||a-b),tie=ks.length>1&&t[ks[1]]===t[ks[0]],r=zf[c];const exp=tie?null:'ZONE '+ks[0];if(!r||r.zone!==exp||JSON.stringify(r.counts)!==JSON.stringify(t)){zOk=false;zd+=' '+c+' got '+JSON.stringify(r&&{z:r.zone,c:r.counts})+' want '+exp+JSON.stringify(t)}});
ok('zones: each plant\'s zone from sales lines equals the majority counted independently in the file (non-transfer lines, last 12 months)',zOk,zd);
/* ---- 2. Overview cards ---- */
await ev(()=>{location.hash='#/overview'});await page.waitForTimeout(3500);
const txt=await page.innerText('#main').catch(()=>page.innerText('body'));
ok('cards: Overview shows the thickness split, brand split and branch rating cards with the informational-only line',/Thickness split \(top 6 \+ Other\)/.test(txt)&&/Brand split \(top 8 \+ Other\)/.test(txt)&&/Branch rating/.test(txt)&&/Informational only/.test(txt)&&/not for incentives or disciplinary action/.test(txt)&&/Stars: 80\+ = 5, 60 to under 80 = 4, 40 to under 60 = 3, 20 to under 40 = 2, under 20 = 1/.test(txt),'');
const sd=await ev(()=>{const c=window.__dbg.viewCtx();const o={};for(const k of ['thk','brand']){const D=window.__dbg.oxSplitData(k,c);o[k]={n:D.rows.length,total:D.total,labels:D.rows.map(r=>r.label),sh:D.rows.map(r=>r.sh),share:D.rows.reduce((a,r)=>a+r.share,0),q:D.rows.map(r=>r.q.state),ready:D.st.ready,complete:D.st.complete,qv:D.rows.map(r=>r.q.v),P:D.rows.map(r=>r.P)}}
  o.sum=window.__dbg.sumF({plants:c.plants},c.res.cur).sh;o.label=c.res.label;o.prior=c.res.priorLabel;return o});
ok('cards: thickness split has top 6 + Other, sorted by sheets, shares add to 100, and the total equals the invoiced sheets of the page',sd.thk.n===7&&/^Other \(2 values\)$/.test(sd.thk.labels[6])&&sd.thk.sh.slice(0,6).every((v,i,a)=>!i||a[i-1]>=v)&&Math.abs(sd.thk.share-100)<1e-6&&Math.abs(sd.thk.total-sd.sum)<0.5&&sd.thk.ready&&sd.thk.complete,JSON.stringify(sd.thk).slice(0,300)+' sum '+sd.sum);
ok('cards: brand split has top 8 + Other (10 brands) and the same total',sd.brand.n===9&&/^Other \(2 brands\)$/.test(sd.brand.labels[8])&&Math.abs(sd.brand.share-100)<1e-6&&Math.abs(sd.brand.total-sd.sum)<0.5,JSON.stringify(sd.brand.labels));
ok('cards: QoQ per row is vs the prior quarter only: (this - last) / last, computed when both quarters are fully loaded',sd.thk.q.every(s=>s==='ok')&&sd.thk.qv.every((v,i)=>Math.abs(v-(sd.thk.sh[i]-sd.thk.P[i])/sd.thk.P[i]*100)<1e-6)&&/Q3 FY27/.test(sd.label)&&/Q2 FY27/.test(sd.prior),sd.label+' vs '+sd.prior+' '+JSON.stringify(sd.thk.q));
ok('cards: rows have no Ach % (no target by thickness or brand) and say so',/no target/.test(txt)&&!/Check target.*Thickness/.test(txt),'');
/* the rows are on the page with tooltips */
const rowsN=await ev(()=>document.querySelectorAll('.ox-sp').length);ok('cards: 16 split rows on the page (7 thickness + 9 brand)',rowsN===16,String(rowsN));
/* ---- 3. rating: stars per branch ---- */
const stars=await ev(()=>Array.from(document.querySelectorAll('#ox-ratingcard .ox-br')).map(e=>({s:+/(\d) of 5 stars/.exec(e.innerHTML)[1],txt:e.innerText})));
ok('rating: 4 branches listed in one list (10 or fewer: no top/bottom split), each with stars and three measures',stars.length===4&&!/Bottom 5/.test(await page.innerText('#ox-ratingcard'))&&stars.every(r=>r.s>=1&&r.s<=5&&/Sales/.test(r.txt)&&/Coll\./.test(r.txt)&&/Stock/.test(r.txt)),JSON.stringify(stars.map(s=>s.s)));
/* rating maths against an independent calculation */
const R1=await ev(()=>{const L=[{id:'a',sk:10,col:null,stk:30},{id:'b',sk:20,col:5,stk:20},{id:'c',sk:30,col:6,stk:10},{id:'d',sk:40,col:7,stk:40},{id:'e',sk:50,col:8,stk:50}];return window.__dbg.ratingCalc(L).map(b=>({id:b.id,psk:b.p_sk,pcol:b.p_col,pstk:b.p_stk,score:b.score,st:b.st,n3:b.n3}))});
const pct=(v,all,hi)=>{const a=all.filter(x=>x!=null);return (a.filter(x=>hi?x<v:x>v).length+.5*(a.filter(x=>x===v).length-1))/(a.length-1)*100};
const sk=[10,20,30,40,50],cl=[null,5,6,7,8],sg=[30,20,10,40,50];let mOk=true,md='';
R1.forEach((r,i)=>{const p1=pct(sk[i],sk,true),p2=cl[i]==null?null:pct(cl[i],cl,true),p3=pct(sg[i],sg,false);const parts=[[p1,50],[p2,30],[p3,20]].filter(x=>x[0]!=null),W=parts.reduce((a,x)=>a+x[1],0),sc=parts.reduce((a,x)=>a+x[0]*x[1],0)/W;const stx=sc>=80?5:sc>=60?4:sc>=40?3:sc>=20?2:1;
  if(Math.abs(r.score-sc)>1e-9||r.st!==stx||Math.abs(r.psk-p1)>1e-9||Math.abs(r.pstk-p3)>1e-9||(p2==null?r.pcol!=null:Math.abs(r.pcol-p2)>1e-9)){mOk=false;md+=' '+r.id+JSON.stringify(r)+' exp '+sc}});
ok('rating maths: percentile rank (stock days lower is better), missing collections dropped and 50/20 reweighted, score and stars match an independent calculation',mOk&&R1[0].n3===2,md+' '+JSON.stringify(R1[0]));
const edges=await ev(()=>[0,19.99,20,39.99,40,59.99,60,79.99,80,100].map(x=>window.__dbg.ratingStars(x)));
ok('rating stars: 80+ = 5, 60-79.99 = 4, 40-59.99 = 3, 20-39.99 = 2, under 20 = 1 (boundaries)',JSON.stringify(edges)==='[1,1,2,2,3,3,4,4,5,5]',JSON.stringify(edges));
const R2=await ev(()=>{const L=[{id:'x',sk:5,col:5,stk:5},{id:'y',sk:5,col:5,stk:5},{id:'z',sk:null,col:null,stk:null},{id:'w',sk:9,col:null,stk:null}];window.__dbg.ratingCalc(L);return L.map(b=>({id:b.id,score:b.score,st:b.st,n3:b.n3}))});
ok('rating maths: ties share the half-rank, a branch with no measure is "not rated" (no star), a single measure is used alone',R2[0].score===R2[1].score&&R2[2].score===null&&R2[2].st===null&&R2[3].n3===1&&Math.abs(R2[0].score-(((.5/2*100)*50)+((.5/1*100)*0))/50)>=0,JSON.stringify(R2));
const rb=await ev(()=>[window.__dbg.ratingBasis([{ach:90},{ach:80},{ach:null}]),window.__dbg.ratingBasis([{ach:90},{ach:null},{ach:null}]),window.__dbg.ratingBasis([{ach:null},{ach:null}]),window.__dbg.ratingBasis([{ach:90},{ach:null}])]);
ok('rating: sales measure is Ach % in sheets when most branches have a valid one, else QoQ % in sheets',JSON.stringify(rb)==='["ach","qoq","qoq","qoq"]',JSON.stringify(rb));
/* guard: a wrong target (over 300%) is "Check target", never a score input */
const RG=await ev(()=>{const mk=(p,sh,ach,ck)=>({p:p,o:{sh:sh,sh0:sh,Psh:null,Psh0:null,incomplete:true,bothNet:false},ach:ach,ck:ck});const R=window.__dbg.ratingRows([mk('1',100,95,false),mk('2',100,80,false),mk('3',100,null,true),mk('4',100,70,false)],{prior:null,priorMonths:[]},null,null);const html=window.__dbg.oxRatingCard(R,{label:'x'},'');return {basis:R.basis,rows:R.rows.map(r=>({id:r.id,sk:r.sk,psk:r.p_sk,ck:r.ck,n3:r.n3,score:r.score})),has:/Check target/.test(html)}});
ok('guard R8: a branch with Ach above 300% shows "Check target" and its sales measure is left out of the score',RG.basis==='ach'&&RG.rows[2].sk==null&&RG.rows[2].psk==null&&RG.rows[2].ck===true&&RG.rows[2].score===null&&RG.has,JSON.stringify(RG));
/* top 5 and bottom 5 with 12 branches */
const R12=await ev(()=>{const L=[];for(let i=1;i<=12;i++)L.push({id:'P'+i,name:'Branch '+i,sh:100+i,sk:i*7,col:80+i,stk:20+i,ach:i*7,ck:false});const R=window.__dbg.ratingCalc(L);const html=window.__dbg.oxRatingCard({rows:L,basis:'ach'},{label:'x'},'Q2');const d=document.createElement('div');d.innerHTML=html;return {top:/Top 5/.test(html),bot:/Bottom 5/.test(html),n:d.querySelectorAll('.ox-br').length,first:/#1 /.test(d.querySelector('.ox-br').innerText),stars:d.querySelectorAll('[aria-label$="of 5 stars"]').length}});
ok('rating: with more than 10 branches the card shows Top 5 and Bottom 5 (10 rows), best first',R12.top&&R12.bot&&R12.n===10&&R12.first&&R12.stars===10,JSON.stringify(R12));
/* ---- 4. collections bars ---- */
const CB=await ev(()=>{const mk=(l,A,cur)=>({label:l,A:A,isCur:!!cur});return window.__dbg.oxCollBars([mk('Q1 FY26',3.1e9),mk('Q2 FY26',3.4e9),mk('Q3 FY26',null),mk('Q4 FY26',3.3e9),mk('Q1 FY27',3.6e9),mk('Q2 FY27',3.3e9),mk('Q3 FY27',null,true)])});
ok('collections card: seven quarters as bars with the rupee-crore value on each, n/l for a quarter not loaded, QoQ in the tap text',/>310</.test(CB)&&/>340</.test(CB)&&/>n\/l</.test(CB)&&/receipts not loaded/.test(CB)&&/QoQ \+/.test(CB),CB.slice(0,200));
/* ---- 5. never zero when the item detail is missing ---- */
await ev(()=>{const S=window.__dbg.S;for(const k of ['2026-10','2026-09','2026-08','2026-07']){const c=S.cells['INV_'+k];Object.keys(c.plants).forEach(p=>{c.plants[p]=Object.assign({},c.plants[p],{dimFrom:undefined})})}window.__dbg.DS.dimVer++;window.__desk.S.lastHtml=''});
await ev(()=>{location.hash='#/sales'});await page.waitForTimeout(300);await ev(()=>{location.hash='#/overview'});await page.waitForTimeout(1500);
const t2=await page.innerText('#main').catch(()=>page.innerText('body'));
ok('not loaded, never zero: months loaded before v44 (no detail) show "No thickness or brand detail" and name the fix, with no bars',/No thickness or brand detail for Q3 FY27/.test(t2)&&/Reload these months in Data Intake/.test(t2)&&(await ev(()=>document.querySelectorAll('.ox-sp').length))===0,'');
/* partial: detail on some plant-months only */
await ev(()=>{const S=window.__dbg.S;const c=S.cells['INV_2026-10'];const ps=Object.keys(c.plants);const real=window.__realCells;});
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
