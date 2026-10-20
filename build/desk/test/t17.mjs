import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
const res=[];const ok=(n,c,d)=>{res.push([c?'PASS':'FAIL',n,d||''].join(' | '));};
/* check 10: closed-quarter reopen */
for(const [email,allowed] of [['mgmt@demo',false],['hod.sales@demo',false],['bm.a@demo',false],['data@virgoasia.com',true]]){
  const {page}=await open(browser,{store:JSON.parse(JSON.stringify(store)),viewer:{email,name:email}});await page.waitForTimeout(2500);
  const closed=await page.evaluate(()=>Object.keys(window.__dbg.S.periods).filter(k=>window.__dbg.S.periods[k].status==='closed')[0]);
  /* forge the control the way a hostile console would */
  await page.evaluate(q=>{const b=document.createElement('button');b.setAttribute('data-act','reopen');b.setAttribute('data-q',q);document.body.appendChild(b);b.click()},closed);await page.waitForTimeout(500);
  const dlg=await page.evaluate(()=>document.querySelector('#dlg').innerHTML.length>0),toast=await page.evaluate(()=>document.querySelector('#toast').textContent);
  if(!allowed){ok(`${email}: reopen refused with message, no dialog`,!dlg&&/Only a Super admin/.test(toast),toast);
    await page.evaluate(q=>{const b=document.createElement('button');b.setAttribute('data-act','reopen-go');b.setAttribute('data-q',q);document.body.appendChild(b);b.click()},closed);await page.waitForTimeout(500);
    const st=await page.evaluate(q=>window.__mockStore()['periods/'+q].status,closed);ok(`${email}: reopen-go cannot change the period`,st==='closed',st)}
  else{ok('super admin: reopen dialog opens',dlg,'');
    await page.evaluate(q=>{document.querySelector('[data-act="reopen-go"]').click()},closed);await page.waitForTimeout(300);
    let st=await page.evaluate(q=>window.__mockStore()['periods/'+q].status,closed);ok('super admin: no reason, no reopen',st==='closed',st);
    await page.fill('#d-reason','Correction of a rejected plant-month');await page.click('[data-act="reopen-go"]');await page.waitForTimeout(600);
    st=await page.evaluate(q=>window.__mockStore()['periods/'+q].status,closed);const lg=await page.evaluate(()=>Object.values(window.__mockStore()).some(v=>v.event==='quarter reopened'&&v.reason));ok('super admin: reopened with reason, logged',st==='open'&&lg,st)}
  await page.context().close();
}
/* mgmt sees no reopen button in the grid */
{const {page}=await open(browser,{store,viewer:{email:'mgmt@demo',name:'M'}});await page.waitForTimeout(2500);await page.evaluate(()=>{location.hash='#/intake'});await page.waitForTimeout(800);
 const q=await page.evaluate(()=>Object.keys(window.__dbg.S.periods).filter(k=>window.__dbg.S.periods[k].status==='closed')[0]);
 await page.evaluate(q=>{document.querySelector('[data-act="cov"][data-q="'+q+'"]').click()},q);await page.waitForTimeout(300);
 const t=await page.innerText('#i-cov');ok('mgmt: no Reopen/Close/Upload buttons in coverage detail',!/Reopen quarter|Close quarter|Upload this quarter/.test(t),'');await page.context().close()}
/* check 3: drill by row clicks (real clicks) and from a chart bar */
for(const email of ['data@virgoasia.com','mgmt@demo','bm.a@demo']){
  const {page}=await open(browser,{store,viewer:{email,name:email}});await page.waitForTimeout(2500);
  await page.evaluate(()=>{location.hash='#/sales'});await page.waitForTimeout(3500);
  const clickRow=async(k)=>{const el=page.locator('tr[data-act="dd"][data-k="'+k+'"]').first();if(!(await el.count()))return false;await el.click();await page.waitForTimeout(1800);return true};
  const a=await clickRow('plant'),b=await clickRow('sp'),c=await clickRow('cust');
  await page.waitForTimeout(1500);
  const t=await page.innerText('#pg'),crumbs=await page.locator('.crumbs .chip').allInnerTexts();
  const docs=await page.locator('#pg table tbody tr').filter({hasText:/INV/}).count();
  ok(`${email}: branch>salesperson>customer>document by row clicks`,a&&b&&c&&crumbs.length>=4&&docs>0&&/B1|S4/.test(t),`crumbs ${crumbs.join(' > ')} docs ${docs}`);
  if(docs){const row=await page.locator('#pg table tbody tr').filter({hasText:/INV/}).first().innerText();console.log(email,'first doc row:',row.replace(/\s+/g,' '))}
  /* breadcrumb back */
  await page.locator('[data-act="dd-up"][data-l="1"]').click();await page.waitForTimeout(800);ok(`${email}: breadcrumb chip returns to salesperson level`,/LEVEL 2/i.test(await page.innerText('#pg')),'');
  /* chart point */
  await page.evaluate(()=>{const r=[...document.querySelectorAll('.bar-q')];r[r.length-3].dispatchEvent(new MouseEvent('click',{bubbles:true}))});await page.waitForTimeout(600);
  await page.locator('[data-act="drill-m"]').nth(1).click();await page.waitForTimeout(1500);
  const n2=await page.locator('#pg table tbody tr').filter({hasText:/INV/}).count();ok(`${email}: chart bar > quarter > month > documents`,n2>0,String(n2));
  await page.context().close();
}
console.log(res.join('\n'));
await browser.close();
