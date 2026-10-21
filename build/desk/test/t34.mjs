import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const st=JSON.parse(JSON.stringify(store));Object.keys(st).forEach(k=>{if(/^uploads\//.test(k))delete st[k]});
const base=Date.parse('2026-10-01T05:00:00Z');
for(let i=0;i<40;i++){st['uploads/uh'+String(i).padStart(2,'0')]={at:new Date(base+i*3600e3).toISOString(),by:'data@virgoasia.com',sys:i%3===0?'S4':'B1',entity:i%7===0?'SE':'INV',file:(i%5===0?'DEMO ':'')+'Combine Sale Report - September 2026 - very long file name number '+i+'.xlsx',size:1234567,mode:'historic',periodLabel:'Q2 FY27',read:1000+i,loaded:990+i,rejected:i%4===0?10:0,warned:0,status:i%9===0?'Partial':'Loaded',demo:i%5===0||undefined}}
for(const size of [{width:1440,height:900},{width:360,height:740}]){
  const {page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(st)),size});await page.waitForTimeout(3500);
  await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(900);
  const tag=size.width+'';
  const full=await page.evaluate(()=>{const c=document.querySelector('#i-hist'),p=document.querySelector('#p-intake');return {w:c.offsetWidth,pw:p.offsetWidth,hasFile:/file/i.test(c.innerText),rows:c.querySelectorAll('tbody tr.clk').length}});
  ok(tag+': history is a full-width card with a File column, 15 rows first',full.w>=full.pw-4&&full.hasFile&&full.rows===15,JSON.stringify(full));
  const box=await page.$('#i-hist .tw');await box.scrollIntoViewIfNeeded();const bb=await box.boundingBox();
  await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.wheel(0,150);await page.waitForTimeout(400);
  const s1=await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollTop);
  /* more rows so the table is taller than the box */
  if(!s1){await page.click('[data-act="hist-more"]');await page.click('[data-act="hist-more"]');await page.waitForTimeout(300);await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.wheel(0,150);await page.waitForTimeout(400)}
  const s1b=await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollTop);
  ok(tag+': mouse wheel scrolls the table',s1b>0,String(s1b));
  await page.focus('#i-hist .tw');await page.keyboard.press('PageDown');await page.waitForTimeout(400);
  const s2=await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollTop);ok(tag+': keyboard (focus + PageDown) scrolls the table',s2>s1b,s1b+' -> '+s2);
  await page.evaluate(async()=>{const db=await window.claude.use('db');await db.doc('uploads/uhzz').set({at:new Date(Date.now()-86400e3*400).toISOString(),by:'x@y',sys:'B1',entity:'INV',file:'late.csv',read:1,loaded:1,rejected:0,status:'Loaded'})});
  await page.waitForTimeout(900);
  const s3=await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollTop);ok(tag+': scroll position held when a snapshot adds an upload',Math.abs(s3-s2)<3&&s3>0,s2+' -> '+s3);
  for(let k=0;k<3;k++){await page.evaluate(()=>{window.dispatchEvent(new Event('resize'))});await page.waitForTimeout(300)}
  const s4=await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollTop);ok(tag+': scroll position held across other re-renders',Math.abs(s4-s2)<3,String(s4));
  const moreN=await page.evaluate(()=>document.querySelectorAll('#i-hist tbody tr.clk').length);
  await page.click('[data-act="hist-more"]').catch(()=>{});await page.waitForTimeout(300);
  ok(tag+': Show more adds 15',await page.evaluate(()=>document.querySelectorAll('#i-hist tbody tr.clk').length)===Math.min(moreN+15,41),String(moreN));
  await page.selectOption('#hf-st','Partial');await page.waitForTimeout(300);
  const nP=await page.evaluate(()=>document.querySelectorAll('#i-hist tbody tr.clk').length);ok(tag+': status filter',nP>0&&nP<15,String(nP));
  await page.selectOption('#hf-st','');await page.fill('#hf-q','number 17');await page.waitForTimeout(300);
  const nq=await page.evaluate(()=>[document.querySelectorAll('#i-hist tbody tr.clk').length,document.activeElement.id]);ok(tag+': search by file name keeps focus while typing',nq[0]===1&&nq[1]==='hf-q',JSON.stringify(nq));
  await page.fill('#hf-q','');await page.selectOption('#hf-src','S4');await page.waitForTimeout(300);
  ok(tag+': source filter',await page.evaluate(()=>[...document.querySelectorAll('#i-hist tbody tr.clk')].every(r=>/S4/.test(r.innerText))),'');
  await page.selectOption('#hf-src','');await page.selectOption('#hf-ent','SE');await page.waitForTimeout(300);
  ok(tag+': entity filter',await page.evaluate(()=>{const r=[...document.querySelectorAll('#i-hist tbody tr.clk')];return r.length>0&&r.every(x=>/Sales employees/.test(x.innerText))}),'');
  await page.selectOption('#hf-ent','');await page.waitForTimeout(300);
  const fc=await page.evaluate(()=>{const td=document.querySelector('#i-hist td.hfile'),sp=td.querySelector('span'),cs=getComputedStyle(sp);return {title:td.getAttribute('title'),ell:cs.textOverflow,white:cs.whiteSpace}});
  ok(tag+': file name in title; '+(size.width<500?'ellipsis at 360':'wraps on desktop'),/very long file name/.test(fc.title)&&(size.width<500?(fc.ell==='ellipsis'&&fc.white==='nowrap'):fc.white!=='nowrap'),JSON.stringify(fc));
  await page.click('#i-hist tbody tr.clk td.mono');await page.waitForTimeout(300);
  ok(tag+': row detail shows the full file name',await page.evaluate(()=>/File:\s*.*very long file name number/.test(document.querySelector('#i-hist tr.hdet').innerText)),'');
  await page.click('[data-act="hist-csv"]');await page.waitForTimeout(400);
  const csv=await page.evaluate(()=>{const x=window.__saved||[];return x.length?x[x.length-1].data:''});
  ok(tag+': CSV export has the file column and the DEMO label',/^when_ist,file,/.test(csv)&&/very long file name/.test(csv)&&/,DEMO\b/.test(csv),csv.split('\n')[0]);
  ok(tag+': no horizontal page scroll',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'');
  await page.screenshot({path:SP+'af/hist-'+tag+'.png'});
  console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
  await page.context().close();
}
/* touch scroll at 360 (iOS-style) */
{const ctx=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,isMobile:true,deviceScaleFactor:2});
 await ctx.route(/fonts\.googleapis|fonts\.gstatic/,r=>r.abort());await ctx.route(/cdnjs/,r=>r.abort());
 const page=await ctx.newPage();
 await page.addInitScript({content:`window.__MODE={};window.__INIT_STORE=${JSON.stringify(st)};window.__VIEWER={email:'data@virgoasia.com',name:'Vijay'};`});
 await page.addInitScript({path:new URL('./mock-claude.js',import.meta.url).pathname});
 await page.goto('file://'+new URL('../dist/index.html',import.meta.url).pathname);await page.waitForTimeout(3500);
 await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(900);
 await page.click('[data-act="hist-more"]');await page.click('[data-act="hist-more"]');await page.waitForTimeout(300);
 await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollIntoView({block:'center'}));await page.waitForTimeout(300);
 const bb=await (await page.$('#i-hist .tw')).boundingBox();
 const cdp=await ctx.newCDPSession(page);const cx=bb.x+bb.width/2,cy=bb.y+bb.height/2+40;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});
 for(let k=1;k<=8;k++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx,y:cy-k*20}]});await page.waitForTimeout(20)}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(700);
 const ts=await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollTop);
 ok('360 touch: swipe scrolls the table',ts>0,String(ts));
 await page.evaluate(async()=>{const db=await window.claude.use('db');await db.doc('uploads/uhzz').set({at:new Date(Date.now()-86400e3*400).toISOString(),by:'x@y',sys:'B1',entity:'INV',file:'late.csv',read:1,loaded:1,rejected:0,status:'Loaded'})});await page.waitForTimeout(800);
 const ts2=await page.evaluate(()=>document.querySelector('#i-hist .tw').scrollTop);ok('360 touch: position held when a snapshot arrives',Math.abs(ts2-ts)<3,ts+' -> '+ts2);
 await ctx.close();}
console.log(res.join('\n'));await browser.close();
