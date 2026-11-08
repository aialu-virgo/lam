import { chromium, open } from './run.mjs';
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
const browser=await chromium.launch();
const {page,errs}=await open(browser,{store,today:'2026-10-23'});await page.waitForTimeout(5000);
await page.evaluate(()=>{location.hash='#/dashboard'});await page.waitForTimeout(3000);
const r=await page.evaluate(async()=>{
  const d=window.__dbg,bad=[],ok={n:0};
  const bys=['none','plant','zone','state','month','quarter','fy','group','thickness','brand','customer','salesperson','ageing'];
  const per=[{k:'follow'},{k:'MTD'},{k:'Q'},{k:'FY'}];
  for(const mk of Object.keys(d.MEAS)){
    const m=d.MEAS[mk];
    for(const by of bys){
      const c={id:'t',measure:mk,base:'sheets',by,filters:[],period:{k:'follow'},visual:'',n:0,dir:'top',sortBy:'value',span:2};
      const san=d.dSan(c);san.by=m.fixedBy||by;if(!d.dDimOk(san,san.by))continue;
      const fit=d.dVisFit(san);
      for(const v of Object.keys(d.D_VIS)){ if(fit[v])continue;
        const cc=Object.assign({},san,{visual:v});
        try{const R=d.dRun(cc);const h=d.dBodyHtml(cc);ok.n++;
          if(R.err||/could not be drawn/.test(h)){bad.push(mk+'/'+san.by+'/'+v+': '+(R.err||h.slice(0,160)))}
          if(/NaN|undefined|Infinity/.test(h.replace(/data-tip="[^"]*"/g,''))){bad.push(mk+'/'+san.by+'/'+v+' html has NaN/undefined: '+h.match(/.{30}(NaN|undefined|Infinity).{30}/)[0])}
        }catch(e){bad.push(mk+'/'+san.by+'/'+v+' threw '+e.message)}
      }
    }
  }
  return {n:ok.n,bad:bad.slice(0,30),nbad:bad.length};
});
console.log(JSON.stringify(r,null,1));
console.log('page errors',errs.filter(e=>/PAGEERROR/.test(e)));
await browser.close();
