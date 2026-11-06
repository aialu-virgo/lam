import { makeEnv } from '/home/user/lam/build/desk-gas/test/gas-env.mjs';
const E = makeEnv();
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const merge = (col, id, o) => ({ op: 'merge', col, id, json: JSON.stringify(o) });
E.call('deskWrite', [[set('users','u_admin',{email:'data@virgoasia.com',role:'Super admin',active:true}),
  set('users','coord',{email:'coord@virgoasia.com',role:'Coordinator (sales / CRR)',active:true,plant_codes:'P1'}),
  set('users','se',{email:'se@virgoasia.com',role:'Sales executive',active:true,plant_codes:'P1',department:'Sales',reports_to_email:'bm@virgoasia.com'}),
  set('actions','r_p1',{id:'r_p1',owner:'se@virgoasia.com',assigner:'Desk rule R1',department:'Sales',plant:'P1',status:'Open'}),
  set('followups','f_engine',{id:'f_engine',action_id:'r_p1',to_email:'se@virgoasia.com',status:'Drafted',step:'L1'})]]);
E.setEmail('coord@virgoasia.com');
const sent = E.call('deskWrite', [[merge('followups','f_engine',{status:'Sent'})]]);
const dism = E.call('deskWrite', [[merge('followups','f_engine',{status:'Dismissed'})]]);
console.log('coordinator Mark sent on engine draft of rule action:', sent.ok ? 'ok' : 'REFUSED ' + sent.code);
console.log('coordinator Dismiss on engine draft of rule action:', dism.ok ? 'ok' : 'REFUSED ' + dism.code);
