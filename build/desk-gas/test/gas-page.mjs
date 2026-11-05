// Opens the Apps Script build (out/Desk-Index.txt, boot data injected by Code.gs doGet) in headless Chromium with google.script.run bridged to Code.gs running in Node against an in-memory sheet.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire('/opt/node22/lib/node_modules/');
export const { chromium } = require('playwright');
const XLSX = '/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/xlsx.full.min.js';
export async function openGas(browser, env, email, { size = { width: 1440, height: 900 }, hash = '', autoload = false } = {}) {
  const ctx = await browser.newContext({ viewport: size, acceptDownloads: true });
  await ctx.route(/fonts\.googleapis|fonts\.gstatic/, r => r.abort());
  await ctx.route(/cdnjs.*xlsx/, r => r.fulfill({ path: XLSX, contentType: 'application/javascript' }));
  await ctx.route(/cdnjs(?!.*xlsx)/, r => r.abort());
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.exposeFunction('__srv', async (name, argsJson) => { env.setEmail(email); await new Promise(r => setTimeout(r, 2)); return JSON.stringify(env.ctx[name] ? JSON.parse(JSON.stringify(env.ctx[name](...JSON.parse(argsJson)))) : { ok: false, code: 'invalid_argument', message: 'no such function ' + name }); });
  await page.addInitScript(`window.__NOAUTOLOAD=${autoload ? 'false' : 'true'};
    (function(){
      /* strict google.script.run semantics: the base runner has no handlers; withSuccessHandler/withFailureHandler return a NEW runner;
         a server method reads the handlers from the runner it is called ON (this), so detaching or applying it to the base runner loses them */
      var HK='__handlers__';
      function mk(h){return new Proxy({},{get:function(t,n){
        if(n===HK)return h;
        if(n==='withSuccessHandler')return function(f){return mk({ok:f,fail:h.fail})};
        if(n==='withFailureHandler')return function(g){return mk({ok:h.ok,fail:g})};
        if(typeof n!=='string')return undefined;
        return function(){var hh=(this&&this[HK])||{};var a=JSON.stringify(Array.prototype.slice.call(arguments));
          window.__srv(n,a).then(function(r){hh.ok&&hh.ok(JSON.parse(r))},function(e){hh.fail?hh.fail(new Error(e.message)):console.error('google.script.run failure: '+e.message)})}}})}
      window.google={script:{run:mk({})}}})();`);
  env.setEmail(email);
  const html = env.ctx.doGet({ parameter: hash ? { h: hash } : {} }).html;
  const f = path.join(os.tmpdir(), 'gas-' + Math.random().toString(36).slice(2) + '.html'); fs.writeFileSync(f, html);
  await page.goto('file://' + f);
  return { ctx, page, errs, file: f };
}
