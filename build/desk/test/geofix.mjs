/* Builds the geography test store from store-demo.json: DEMO customer master (B1) with states, PINs; states, districts and PINs in the geography master. All DEMO, no Virgo data. */
import { chromium, open } from './run.mjs';
import fs from 'fs';
export const SP='/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/';
export const STATES=['Maharashtra','Gujarat','Karnataka'];
export async function geoStore(browser,out){
  const store=JSON.parse(fs.readFileSync(SP+'store-demo.json'));
  const {page,ctx}=await open(browser,{store,viewer:{email:'super@demo',name:'S'}});await page.waitForTimeout(3000);
  const info=await page.evaluate(async(STATES)=>{
    const D=window.__dbg,yms=Object.keys(D.S.cells).filter(k=>/^INV_/.test(k)).map(k=>k.slice(4));
    await D.geoLoadMonths(yms);
    const codes=new Set();Object.values(D.GEOA.rows).forEach(R=>R.a.forEach(r=>codes.add(r[0])));
    const list=[...codes].sort();
    /* customer i: state STATES[i%3]; Maharashtra customers with i%2==0 get a Pune PIN (411001), i%6==3 a Nagpur PIN (440001), others no PIN */
    const rows=list.map((c,i)=>{const st=STATES[i%3];let pin='';if(st==='Maharashtra'){pin=i%2===0?'411001':(i%6===3?'440001':'')}if(st==='Gujarat'&&i%2===1)pin='380001';return [c,'DEMO customer '+c,'','',st,'',0,0,'',pin,'','B1']});
    await D.dset('customers/B1_c0',{z:await D.gz(JSON.stringify(rows)),n:rows.length,i:0,sys:'B1',upload:'ugeofix',fmt:'gz-json v2',demo:true});
    await D.dset('customers/main_B1',{at:new Date().toISOString(),by:'super@demo',file:'DEMO customers',layout:'B1 customer master (OCRD)',sys:'B1',read:rows.length,loaded:rows.length,rejected:0,chunks:1,upload:'ugeofix',demo:true});
    const now=new Date().toISOString();
    await D.dset('geography/st_27',{kind:'state',state_code:'27',state_name:'Maharashtra',aliases:'MH',default_plant_code:'1012',active:true,map_source:'entered',confirmed_by:'super@demo',confirmed_at:now});
    await D.dset('geography/st_24',{kind:'state',state_code:'24',state_name:'Gujarat',aliases:'GJ',default_plant_code:'1013',active:true,map_source:'entered',confirmed_by:'super@demo',confirmed_at:now});
    await D.dset('geography/st_29',{kind:'state',state_code:'29',state_name:'Karnataka',aliases:'KA',default_plant_code:'',active:true,map_source:''});
    const di=[['MH-PUNE','27','Pune','1012'],['MH-NAGPUR','27','Nagpur','1013'],['MH-KOLHAPUR','27','Kolhapur',''],['GJ-AHMEDABAD','24','Ahmedabad','1012'],['GJ-SURAT','24','Surat','1013']];
    for(const d of di)await D.dset('geography/di_'+d[0].toLowerCase().replace(/[^a-z0-9]+/g,'_'),{kind:'district',district_id:d[0],state_code:d[1],district_name:d[2],responsible_plant_code:d[3],map_source:d[3]?'entered':'',active:true});
    const pins=[['411001','27','MH-PUNE','public list',0],['440001','27','MH-NAGPUR','public list',0],['380001','24','GJ-AHMEDABAD','public list',0]];
    await D.dset('geography/pin_c0',{kind:'pins',i:0,z:await D.gz(JSON.stringify(pins)),n:pins.length});
    await D.dset('geography/pin_main',{kind:'pinmeta',chunks:1,n:pins.length,at:now,by:'super@demo'});
    return {customers:list.length,months:yms.length};
  },STATES);
  await page.waitForTimeout(1500);
  const st=await page.evaluate(()=>window.__mockStore());fs.writeFileSync(out,JSON.stringify(st));
  await ctx.close();return info;
}
if(process.argv[2]){const b=await chromium.launch();console.log(await geoStore(b,process.argv[2]));await b.close()}
