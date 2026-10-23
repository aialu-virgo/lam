/* the real runtime returns frozen snapshot data; mirror that so tests catch mutation */
function dfz(o){if(o&&typeof o==='object'){Object.freeze(o);Object.keys(o).forEach(function(k){dfz(o[k])})}return o}
/* Test harness only: an in-memory stand-in for window.claude (db, user, downloads). Not shipped. */
(function(){
  var store=window.__INIT_STORE||{};var subs=[];var VIEWER=window.__VIEWER||{email:'data@virgoasia.com',name:'Vijay'};var MODE=window.__MODE||{};var HANG=function(){return new Promise(function(){})};var LATE=function(v){return new Promise(function(r){setTimeout(function(){r(v)},MODE.delay||0)})};
  var clone=function(x){return x===undefined?undefined:JSON.parse(JSON.stringify(x))};
  function parent(path){var i=path.lastIndexOf('/');return i<0?'':path.slice(0,i)}
  function childrenOf(col){return Object.keys(store).filter(function(p){return parent(p)===col}).sort().map(function(p){var id=p.slice(p.lastIndexOf('/')+1);return {id:id,exists:true,data:function(){return dfz(clone(store[p]))},metadata:{}}})}
  function notify(col){subs.forEach(function(s){if(s.col===col)s.fire()})}
  function snapOf(col,q){var docs=childrenOf(col);if(q&&q.order){var f=q.order[0],d=q.order[1];docs.sort(function(a,b){var x=a.data()[f],y=b.data()[f];return (x<y?-1:x>y?1:0)*(d==='desc'?-1:1)})}if(q&&q.lim)docs=docs.slice(0,q.lim);return {docs:docs,size:docs.length,empty:!docs.length,docChanges:function(){return []},metadata:{}}}
  function query(col,q){q=q||{};return {orderBy:function(f,d){return query(col,Object.assign({},q,{order:[f,d||'asc']}))},limit:function(n){return query(col,Object.assign({},q,{lim:n}))},where:function(){return query(col,q)},
    onSnapshot:function(next,err){if(MODE.err===col){setTimeout(function(){err({code:'permission_denied',message:'read refused'})},0);return function(){}}if(MODE.hang===col)return function(){};var s={col:col,fire:function(){setTimeout(function(){next(snapOf(col,q))},MODE.delay||0)}};subs.push(s);s.fire();return function(){subs=subs.filter(function(x){return x!==s})}},
    get:async function(){return snapOf(col,q)}}}
  var db={collection:function(c){return query(c)},doc:function(path){return {get:async function(){await new Promise(function(r){setTimeout(r,0)});var e=path in store;return {id:path.slice(path.lastIndexOf('/')+1),exists:e,data:function(){return dfz(clone(store[path]))}}},
    set:async function(d){await new Promise(function(r){setTimeout(r,0)});if(MODE.failSet&&new RegExp(MODE.failSet).test(path))throw {code:'unavailable',message:'write failed'};if(JSON.stringify(d).length>262144)throw {code:'invalid_argument',message:'too large'};store[path]=clone(d);notify(parent(path))},
    update:async function(d){if(!(path in store))throw {code:'invalid_argument',message:'missing'};store[path]=Object.assign({},store[path],clone(d));notify(parent(path))},
    delete:async function(){delete store[path];notify(parent(path))}}}};
  window.__mockStore=function(){return clone(store)};
  window.__saved=[];
  window.claude={use:async function(n){
    if(n==='db'){if(MODE.hang==='usedb')return HANG();return db}
    if(MODE.hang==='useuser'&&n==='user')return HANG();
    if(n==='user')return {me:async function(){if(MODE.hang==='me')return HANG();return {id:'u_'+VIEWER.email,name:VIEWER.name,email:VIEWER.email}},email:async function(){if(MODE.hang==='email')return HANG();return VIEWER.email},isOwner:async function(){return !!VIEWER.owner}};
    if(n==='downloads'){if(MODE.hang==='downloads')return HANG()}
    if(n==='downloads')return {save:async function(o){window.__saved.push(o)}};
    return null}};
})();
