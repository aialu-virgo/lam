import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser = await chromium.launch();
for(const email of ['data@virgoasia.com','acc.ab@demo','se.s1@demo','plant.b@demo']){
const {page}=await open(browser,{store,viewer:{email}});await page.waitForTimeout(2500);
await page.evaluate(()=>{location.hash='#/team'});await page.waitForTimeout(2000);
if(email==='data@virgoasia.com')await page.evaluate(()=>{document.querySelector('[data-act="team-who"][data-e="acc.ab@demo"]').click()});await page.waitForTimeout(1200);
await page.evaluate(()=>{const r=[...document.querySelectorAll('.bar-q')];r[r.length-2].dispatchEvent(new MouseEvent('click',{bubbles:true}))});await page.waitForTimeout(600);
await page.locator('#drillp tr[data-act="drill-m"]').nth(1).click();await page.waitForTimeout(1200);
const isAcc=email==='data@virgoasia.com'||email==='acc.ab@demo';const heads=(await page.locator('#drillp table').nth(1).locator('thead th').allInnerTexts()).slice(0,4).join(',');
const row=(await page.locator('#drillp table').nth(1).locator('tbody tr').first().innerText()).replace(/\s+/g,' ');
const crumbs=(await page.locator('#drillp .crumbs .chip').allInnerTexts()).join(' > ');
console.log(/SYSTEM,DOC TYPE,DOC NO,DATE/i.test(heads)&&(isAcc?/^B1 RCT DEMO-RCT-\d+-\d+-\d \d{4}-\d\d-\d\d/.test(row):/^(B1|S4) INV DEMO-\d+ \d{4}-\d\d-\d\d/.test(row))?'PASS':'FAIL',email,'|',heads,'|',row.slice(0,70),'|',crumbs);
await page.context().close();}
await browser.close();
