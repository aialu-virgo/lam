// QA pass 4 simulation (scratch only). Every write is sent through the HEAD Code.gs mock as the viewer.
import { makeEnv } from '/home/user/lam/build/desk-gas/test/gas-env.mjs';
const E = makeEnv();
const set = (col, id, o) => ({ op: 'set', col, id, json: JSON.stringify(o) });
const merge = (col, id, o) => ({ op: 'merge', col, id, json: JSON.stringify(o) });
const U = [
  ['hod@virgoasia.com', 'HOD', { department: 'Sales' }],
  ['hod2@virgoasia.com', 'HOD', { department: 'Ops' }],
  ['mg@virgoasia.com', 'Management / HO', {}],
  ['bm@virgoasia.com', 'Branch / depot manager', { plant_codes: 'P1' }],
  ['coord@virgoasia.com', 'Coordinator (sales / CRR)', { plant_codes: 'P1' }],
  ['acc@virgoasia.com', 'Accounts', { plant_codes: 'P1' }],
  ['plant@virgoasia.com', 'Plant', { plant_codes: 'P1' }],
  ['se@virgoasia.com', 'Sales executive', { plant_codes: 'P1', department: 'Sales', reports_to_email: 'bm@virgoasia.com' }],
  ['ops1@virgoasia.com', 'Sales executive', { plant_codes: 'P2', department: 'Ops', reports_to_email: 'hod2@virgoasia.com' }],
];
E.call('deskWrite', [[set('users','u_admin',{email:'data@virgoasia.com',role:'Super admin',active:true}), ...U.map(([e,r,x],i)=>set('users','u'+i,{email:e,role:r,active:true,name:e.split('@')[0],...x}))]]);
E.call('deskWrite', [[
  set('actions','r_p1',{id:'r_p1',ref:'R1-P1',owner:'se@virgoasia.com',assigner:'Desk rule R1',department:'Sales',plant:'P1',status:'Open',rule:'R1'}),
  set('actions','r_ops',{id:'r_ops',ref:'R1-OPS',owner:'ops1@virgoasia.com',assigner:'Desk rule R1',department:'Ops',plant:'P2',status:'Open',rule:'R1'}),
  set('actions','m1',{id:'m1',ref:'M-1',owner:'se@virgoasia.com',assigner:'bm@virgoasia.com',department:'Sales',plant:'P1',status:'Open'}),
  set('actions','m2',{id:'m2',ref:'M-2',owner:'se@virgoasia.com',assigner:'mg@virgoasia.com',department:'Sales',plant:'P1',status:'Open'}),
]]);
const who = (e) => e.split('@')[0];
const verdict = (r) => r.ok ? 'ok' : 'REFUSED(' + r.code + ')';
const rows = [];
const run = (viewer, label, op) => { E.setEmail(viewer); const r = E.call('deskWrite', [[op]]); rows.push([who(viewer), label, verdict(r)]); return r; };
// Engine (runs only for Super admin, Management, HOD). Clears are attempted in S.actions order; the loop stops at the first refusal (saveAction throws).
function engineClears(viewer, ids) {
  E.setEmail(viewer); const out = [];
  for (const id of ids) { const r = E.call('deskWrite', [[merge('actions', id, { cleared: true })]]); out.push(id + ':' + verdict(r)); if (!r.ok) break; }
  rows.push([who(viewer), 'engine auto-clear loop [' + ids.join(',') + ']', out.join(' ; ')]);
}
engineClears('data@virgoasia.com', ['r_ops', 'r_p1']);
engineClears('mg@virgoasia.com', ['r_ops', 'r_p1']);
engineClears('hod@virgoasia.com', ['r_ops', 'r_p1']);
engineClears('hod2@virgoasia.com', ['r_ops', 'r_p1']);
// Follow-up draft creation (runLadder, any viewer who is iAmSender): sender = plant Coordinator (rule-made action), else owner's manager.
const draft = (id, action) => set('followups', id, { action_id: action, to_email: 'se@virgoasia.com', step: 'Reminder', status: 'Drafted', due: '2026-11-10' });
run('coord@virgoasia.com', 'follow-up draft on rule-made action r_p1 (coordinator is sender)', draft('f_c1', 'r_p1'));
run('bm@virgoasia.com', 'follow-up draft on rule-made action r_p1 (BM is owner manager)', draft('f_b1', 'r_p1'));
run('hod@virgoasia.com', 'follow-up draft on rule-made action r_p1 (HOD, dept Sales)', draft('f_h1', 'r_p1'));
run('hod@virgoasia.com', 'follow-up draft on rule-made action r_ops (HOD of other dept sends)', draft('f_h2', 'r_ops'));
run('mg@virgoasia.com', 'follow-up draft on rule-made action r_ops (Management)', draft('f_m1', 'r_ops'));
run('data@virgoasia.com', 'follow-up draft (Super admin, new)', draft('f_s1', 'r_ops'));
// Mark sent (existing draft): followup update, then the action thread save.
run('coord@virgoasia.com', 'mark sent on existing draft f_c1 (followup doc)', merge('followups', 'f_c1', { status: 'Sent' }));
run('bm@virgoasia.com', 'mark sent on existing draft f_b1', merge('followups', 'f_b1', { status: 'Sent' }));
run('bm@virgoasia.com', 'action thread save after mark sent (m1)', merge('actions', 'm1', { updated: 'x' }));
// Responses and management actions (page: canRespond / canManage / canVerify)
run('se@virgoasia.com', 'owner responds on own rule action r_p1', merge('actions', 'r_p1', { status: 'Done' }));
run('bm@virgoasia.com', 'BM responds on P1 action m1 owned by se (canManage: plant)', merge('actions', 'm1', { status: 'In progress' }));
run('bm@virgoasia.com', 'BM verifies rule action r_p1 (owner reports to BM)', merge('actions', 'r_p1', { status: 'Verified closed' }));
run('hod@virgoasia.com', 'HOD (Sales) assigns m1 (canManage: dept)', merge('actions', 'm1', { owner: 'se@virgoasia.com' }));
run('hod2@virgoasia.com', 'HOD (Ops) assigns m1 of Sales (page refuses)', merge('actions', 'm1', { owner: 'se@virgoasia.com' }));
run('acc@virgoasia.com', 'Accounts responds on P1 action r_p1 (page refuses)', merge('actions', 'r_p1', { status: 'Doing' }));
run('plant@virgoasia.com', 'Plant responds on P1 action m1 (page refuses)', merge('actions', 'm1', { status: 'Doing' }));
run('coord@virgoasia.com', 'Coordinator raises a manual action', set('actions', 'c_new', { id: 'c_new', owner: 'se@virgoasia.com', assigner: 'coord@virgoasia.com', department: 'Sales', plant: 'P1', status: 'Open' }));
run('se@virgoasia.com', 'Sales exec raises an action (page: not allowed)', set('actions', 's_new', { id: 's_new', owner: 'se@virgoasia.com', assigner: 'se@virgoasia.com', plant: 'P1', status: 'Open' }));
run('mg@virgoasia.com', 'Management verifies m2 (assigner is mg)', merge('actions', 'm2', { status: 'Verified closed' }));
for (const r of rows) console.log(r.join(' | '));
