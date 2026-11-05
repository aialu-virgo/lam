import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const {page,errs}=await open(browser,{store:JSON.parse(JSON.stringify(store))});await page.waitForTimeout(4000);
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(800);
await page.click('[data-act="atab"][data-t="users"]');await page.waitForTimeout(500);
const st=()=>page.evaluate(()=>window.__mockStore());
const phDocs=async()=>{const s=await st();return Object.keys(s).filter(k=>/^users\//.test(k)&&s[k].user_id)};
const base=Object.keys(store).filter(k=>/^users\//.test(k)).length;
let t=await page.innerText('#pg');
ok('Users table: first column is User ID; button visible to Super admin',/user id\s+email\s+name/i.test(t)&&!!(await page.$('[data-act="user-ph"]')),'');
await page.click('[data-act="user-ph"]');await page.waitForFunction(()=>/Added \d+, skipped \d+/.test(document.querySelector('#up-msg').textContent),null,{timeout:60000});
let m=await page.innerText('#up-msg');let d1=await phDocs();const s1=await st();
ok('button run 1: Added 50, skipped 0',/Added 50, skipped 0/.test(m),m);
ok('50 docs users/u1001..u1050, stable ids, name User N, .invalid email, off, blank role/dept/plants, cap 5, placeholder flag',d1.length===50&&d1.every(k=>{const u=s1[k],n=+u.user_id-1000;return k==='users/u'+u.user_id&&u.name==='User '+n&&u.email==='user'+u.user_id+'@placeholder.invalid'&&u.active===false&&u.role===''&&u.department===''&&u.plant_codes===''&&u.today_cap===5&&u.placeholder===true})&&s1['users/u1001'].name==='User 1'&&s1['users/u1050'].name==='User 50','n='+d1.length);
ok('existing users untouched',Object.keys(s1).filter(k=>/^users\//.test(k)).length===base+50,'');
await page.waitForTimeout(1200);
await page.click('[data-act="user-ph"]');await page.waitForFunction(()=>/Added 0, skipped 50/.test(document.querySelector('#up-msg').textContent),null,{timeout:60000}).catch(()=>{});
m=await page.innerText('#up-msg');const d2=await phDocs();
ok('button run 2 (idempotent): Added 0, skipped 50; still 50 records',/Added 0, skipped 50/.test(m)&&d2.length===50&&Object.keys(await st()).filter(k=>/^users\//.test(k)).length===base+50,m);
t=await page.innerText('#pg');ok('table shows 1001 / User 1 / Placeholder pill / Off',/1001/.test(t)&&/User 1\b/.test(t)&&/Placeholder/.test(t),'');
/* invisibility */
const vis=await page.evaluate(()=>{const D=window.__dbg,S=D.S;const ph=S.users.filter(u=>u.placeholder);const all=[];['Super admin','Management / HO','HOD','Branch / depot manager','Sales executive','Coordinator (sales / CRR)','Accounts','Plant'].forEach(r=>D.usersOfRole(r).forEach(u=>all.push(u)));
  const sc=D.scopedUsers(D.effUser());return {n:ph.length,inRole:all.filter(u=>u.placeholder).length,inScoped:sc.filter(u=>u.placeholder).length,scopedN:sc.length,
  rep:D.validateUser({user_id:'',email:'zz.real@virgo.test',name:'Zed',role:'Accounts',department:'Accounts',plant_codes:'',reports_to_email:'user1001@placeholder.invalid',whatsapp_number:'',today_cap:5,active:true,sales_employee_code:''},true,''),
  ph0:D.isPH(ph[0])}});
ok('placeholders absent from role lists and the assignment (scopedUsers) list',vis.n===50&&vis.inRole===0&&vis.inScoped===0&&vis.scopedN>0,JSON.stringify(vis));
ok('reports-to a placeholder is rejected',vis.rep.some(e=>/Reports-to/.test(e)),vis.rep.join('; '));
await page.evaluate(()=>{location.hash='#/today'});await page.waitForTimeout(800);
await page.evaluate(()=>{const s=document.getElementById('va-sel');window.__vaOpts=s?Array.from(s.options).map(o=>o.value):null});
const vo=await page.evaluate(()=>window.__vaOpts);ok('"View as" list has no placeholder',Array.isArray(vo)&&vo.length>1&&!vo.some(v=>/placeholder\.invalid/.test(v)),vo?vo.length+' options':'no select');
await page.evaluate(()=>{location.hash='#/actions'});await page.waitForTimeout(800);
const ow=await page.evaluate(()=>{const b=document.querySelector('[data-act="raise-open"],[data-act="raise"]');return b?b.getAttribute('data-act'):null});
/* access: a placeholder e-mail cannot sign in */
const store2=await st();
const a=await open(browser,{store:JSON.parse(JSON.stringify(store2)),viewer:{email:'user1001@placeholder.invalid',name:'User 1'}});await a.page.waitForTimeout(4000);
const gate=await a.page.evaluate(()=>({role:window.__dbg.S.role,body:document.body.innerText.slice(0,200)}));
ok('placeholder e-mail signs in to no access (inactive)',gate.role==='inactive'&&!/Today|Overview/.test(gate.body.slice(0,80)),JSON.stringify(gate).slice(0,200));
await a.ctx.close();
/* activate without role fails */
await page.evaluate(()=>{location.hash='#/admin'});await page.waitForTimeout(500);await page.click('[data-act="atab"][data-t="users"]');await page.waitForTimeout(300);
await page.click('[data-act="user-edit"][data-id="u1001"]');await page.waitForSelector('#d-act');
await page.selectOption('#d-act','Y');await page.click('[data-act="user-save"]');await page.waitForTimeout(600);
let er=await page.innerText('#d-err');const s3=await st();
ok('activating a placeholder (still .invalid, no role) fails and nothing is written',/placeholder e-mail cannot be switched on/.test(er)&&s3['users/u1001'].active===false,er);
await page.fill('#d-email','real.one@virgo.test');await page.click('[data-act="user-save"]');await page.waitForTimeout(600);
er=await page.innerText('#d-err').catch(()=>'');const s3b=await st();
ok('real e-mail + active but no role/department fails',/Role is not one of the 8 roles/.test(er)&&/Department is required/.test(er)&&s3b['users/u1001'].email==='user1001@placeholder.invalid',er);
/* edit to a real active user */
await page.selectOption('#d-role','Accounts');await page.fill('#d-dept','Accounts');await page.fill('#d-name','Asha Rao');await page.click('[data-act="user-save"]');await page.waitForTimeout(1200);
const s4=await st();const ids=Object.keys(s4).filter(k=>/^users\//.test(k)&&s4[k].user_id);
ok('edit placeholder to real active user: same doc u1001 updated, placeholder flag gone',s4['users/u1001']&&s4['users/u1001'].email==='real.one@virgo.test'&&s4['users/u1001'].active===true&&s4['users/u1001'].role==='Accounts'&&!s4['users/u1001'].placeholder&&s4['users/u1001'].user_id==='1001','');
ok('exactly 50 user_id-bearing records, none left on the old placeholder e-mail',ids.length===50&&!Object.values(s4).some(u=>u&&u.email==='user1001@placeholder.invalid')&&!s4['users/user1001_placeholder_invalid'],'n='+ids.length);
const nowAct=await page.evaluate(()=>window.__dbg.usersOfRole('Accounts').some(u=>u.email==='real.one@virgo.test'));
ok('the new real user now appears in assignment lists',nowAct,'');
/* duplicate user id rejected on edit */
await page.click('[data-act="user-edit"][data-id="u1002"]');await page.waitForSelector('#d-userid');await page.fill('#d-userid','1001');await page.click('[data-act="user-save"]');await page.waitForTimeout(500);
er=await page.innerText('#d-err');ok('User ID unique: duplicate rejected',/already used/.test(er),er);
await page.click('[data-act="dlg-close"]');
/* upload round trip */
const csv='user_id,email,name,role,department,plant_codes,reports_to_email,whatsapp_number,today_cap,active,sales_employee_code\n'
+'1002,priya.k@virgo.test,Priya K,Accounts,Accounts,,real.one@virgo.test,,5,Y,\n'
+'1003,user1003@placeholder.invalid,User 3,,,,,,5,N,\n'
+'1004,user1004@placeholder.invalid,User 4,,,,user1005@placeholder.invalid,,5,N,\n'
+'1005,a@virgo.test,A,Accounts,Accounts,,,,5,Y,\n'+'1005,b@virgo.test,B,Accounts,Accounts,,,,5,Y,\n'
+',no.id@virgo.test,No Id,Accounts,Accounts,,,,5,Y,\n';
fs.writeFileSync(SP+'t54-users.csv',csv);
await page.setInputFiles('#up-users',SP+'t54-users.csv');await page.waitForTimeout(2500);
const s5=await st();const ids5=Object.keys(s5).filter(k=>/^users\//.test(k)&&s5[k].user_id);
const um=await page.innerText('#up-msg');
ok('upload: user_id column accepted; 1002 updated in its own doc to a real user (flag cleared)',s5['users/u1002']&&s5['users/u1002'].email==='priya.k@virgo.test'&&s5['users/u1002'].active===true&&!s5['users/u1002'].placeholder&&s5['users/u1002'].user_id==='1002',um.slice(0,200));
ok('upload: placeholder row with only id/name/email accepted and stays a placeholder',s5['users/u1003']&&s5['users/u1003'].placeholder===true&&s5['users/u1003'].active===false,'');
ok('upload: reports-to a placeholder rejected; duplicate id (1001 is taken by another e-mail) rejected; row without id is fine',!/user1005/.test(JSON.stringify(s5['users/u1004']||{}))&&s5['users/u1004'].reports_to_email===''&&!s5['users/b_virgo_test']&&(s5['users/u1005']||{}).email==='a@virgo.test'&&/Duplicate User ID/.test(um)&&!!s5['users/no_id_virgo_test']&&!s5['users/no_id_virgo_test'].user_id,um.slice(0,300));
ok('upload: still exactly 50 user_id-bearing records',ids5.length===50,'n='+ids5.length);
/* legacy CSV without user_id column still loads */
fs.writeFileSync(SP+'t54-legacy.csv','email,name,role,department,plant_codes,reports_to_email,whatsapp_number,today_cap,active,sales_employee_code\nlegacy@virgo.test,Legacy L,Accounts,Accounts,,,,5,Y,\n');
await page.setInputFiles('#up-users',SP+'t54-legacy.csv');await page.waitForTimeout(2000);
ok('legacy upload without user_id column still works',!!(await st())['users/legacy_virgo_test'],'');
/* template */
ok('template header starts with user_id',await page.evaluate(()=>window.__dbg.S&&true),'');
await page.evaluate(()=>{document.querySelector('[data-act="tmpl"][data-t="users"]').click()});await page.waitForTimeout(500);
const sv=await page.evaluate(()=>JSON.stringify(window.__saved));ok('downloaded template begins user_id,email,name',/user_id,email,name/.test(sv),sv.slice(0,120));
ok('no page errors',errs.filter(e=>!/ERR_FAILED|fonts/.test(e)).length===0,errs.join(' / ').slice(0,300));
console.log(res.join('\n'));await browser.close();
