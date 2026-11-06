import vm from 'vm'; import fs from 'fs';
import { makeEnv } from '/home/user/lam/build/desk-gas/test/gas-env.mjs';
const E = makeEnv();
const runner = (h = {}) => new Proxy({}, { get(_, fn) {
  if (fn === 'withSuccessHandler') return (s) => runner({ ...h, s });
  if (fn === 'withFailureHandler') return (f) => runner({ ...h, f });
  return (...args) => setTimeout(() => { try { const r = E.callRaw(fn, args); h.s && h.s(r); } catch (e) { h.f && h.f(e); } }, 0);
} });
const win = { google: { script: { run: runner() } }, __GAS_BOOT: { email: 'hod@virgoasia.com', owner: false, name: 'HOD', url: 'x' }, location: { hash: '' } };
const doc = { hidden: false, addEventListener() {}, createElement() { return { style: {}, click() {}, remove() {} }; }, body: { appendChild() {} } };
const ctx = { window: win, document: doc, location: win.location, setTimeout, clearTimeout, Promise, Map, Set, Blob, URL, TextEncoder, console, JSON, Math, Date, Object, Array, Number, String, Error };
ctx.URL.createObjectURL = () => 'blob:x'; ctx.URL.revokeObjectURL = () => {};
vm.createContext(ctx); vm.runInContext(fs.readFileSync('/home/user/lam/build/desk-gas/src/shim.js', 'utf8'), ctx);
const db = await win.claude.use('db');
E.setEmail('data@virgoasia.com');
E.call('deskWrite', [[{op:'set',col:'users',id:'u1',json:JSON.stringify({email:'hod@virgoasia.com',role:'HOD',active:true,department:'Sales'})},{op:'set',col:'actions',id:'ops_rule',json:JSON.stringify({id:'ops_rule',owner:'x@virgoasia.com',assigner:'Desk rule R1',department:'Ops',status:'Open'})},{op:'set',col:'actions',id:'sales_rule',json:JSON.stringify({id:'sales_rule',owner:'x@virgoasia.com',assigner:'Desk rule R1',department:'Sales',status:'Open'})}]]);
E.setEmail('hod@virgoasia.com');
// same tick: a legit creation (new rule action, Sales) and a refused clear of an Ops rule action
const legit = db.collection('actions').doc('new_rule').set({id:'new_rule',owner:'x@virgoasia.com',assigner:'Desk rule R2',department:'Sales',status:'Open'});
const refused = db.collection('actions').doc('ops_rule').update({cleared:true});
const res = await Promise.allSettled([legit, refused]);
console.log('legit create:', res[0].status, res[0].reason ? JSON.stringify(res[0].reason) : '');
console.log('refused clear:', res[1].status, res[1].reason ? JSON.stringify(res[1].reason).slice(0,90) : '');
console.log('new_rule stored on server:', !!E.call('deskGetMany', [['actions/new_rule']]).docs[0].json);
process.exit(0);
