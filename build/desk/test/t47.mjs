import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();const res=[];const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||''].join(' | '));
const st0=JSON.parse(JSON.stringify(store));Object.keys(st0).forEach(k=>{if(/^(collections|backups|uploads|rejects)\//.test(k))delete st0[k]});
const up=(id,at,months,extra)=>Object.assign({at,by:'data@virgoasia.com',sys:'B1',entity:'CL',file:id+'.csv',mode:'historic',read:1,loaded:1,rejected:0,status:'Loaded',months,plantMonths:1},extra||{});
st0['uploads/uOld']=up('uOld','2026-10-01T10:00:00.000Z',['2026-05']);          /* backup older than 30 days */
st0['uploads/uA']=up('uA','2026-10-10T10:00:00.000Z',['2026-08']);               /* replaced by uB: nothing points to it */
st0['uploads/uB']=up('uB','2026-10-11T10:00:00.000Z',['2026-08']);               /* current holder */
st0['uploads/uC']=up('uC','2026-10-12T10:00:00.000Z',['2026-09']);               /* current holder, backup kept */
st0['collections/1012-2026-08']={plant:'1012',ym:'2026-08',total:5,n:1,rows:[['1',1,'X',5,'']],upload:'uB'};
st0['collections/1012-2026-09']={plant:'1012',ym:'2026-09',total:5,n:1,rows:[['1',1,'X',5,'']],upload:'uC'};
st0['collections/1012-2026-05']={plant:'1012',ym:'2026-05',total:5,n:1,rows:[['1',1,'X',5,'']],upload:'uOld'};
const bk=(id,upl,exp)=>({upload:upl,entity:'CL',i:0,n:0,z:'H4sIAAAAAAAAA4uOBQApu0wNAgAAAA==',at:'2026-10-01T00:00:00.000Z',expires:exp});
st0['backups/uOld_0']=bk('uOld','uOld','2026-09-01T00:00:00.000Z');
st0['backups/uA_0']=bk('uA','uA','2027-01-01T00:00:00.000Z');
st0['backups/uB_0']=bk('uB','uB','2027-01-01T00:00:00.000Z');
st0['backups/uC_0']=bk('uC','uC','2027-01-01T00:00:00.000Z');
let {page,errs}=await open(browser,{store:st0,autoload:true});await page.waitForTimeout(9000);
const b=await page.evaluate(()=>Object.keys(window.__mockStore()).filter(k=>/^backups\//.test(k)).sort());
ok('a backup older than 30 days is deleted',b.indexOf('backups/uOld_0')<0,JSON.stringify(b));
ok('a backup whose upload was itself replaced is deleted',b.indexOf('backups/uA_0')<0,JSON.stringify(b));
ok('backups of uploads that still hold data are kept',b.indexOf('backups/uB_0')>=0&&b.indexOf('backups/uC_0')>=0,JSON.stringify(b));
console.log(errs.filter(e=>!/ERR_FAILED/.test(e)).slice(0,3));
console.log(res.join('\n'));await browser.close();
