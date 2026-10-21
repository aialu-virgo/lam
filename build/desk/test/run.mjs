import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire('/opt/node22/lib/node_modules/');
export const { chromium } = require('playwright');
export const here = path.dirname(fileURLToPath(import.meta.url));
export const dist = process.env.DIST || path.join(here, '../dist/index.html');
export async function open(browser, { viewer, store, size = { width: 1440, height: 900 }, scheme = 'light', today, mode } = {}) {
  const ctx = await browser.newContext({ viewport: size, colorScheme: scheme });
  await ctx.route(/fonts\.googleapis|fonts\.gstatic/, r => r.abort());
  await ctx.route(/cdnjs.*xlsx/, r => r.fulfill({ path: '/tmp/claude-0/-home-user-lam/d7306c55-60da-5c6b-9450-11043959e763/scratchpad/xlsx.full.min.js', contentType: 'application/javascript' }));
  await ctx.route(/cdnjs(?!.*xlsx)/, r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.addInitScript({ content: `window.__MODE=${JSON.stringify(mode || {})};window.__INIT_STORE=${JSON.stringify(store || {})};window.__VIEWER=${JSON.stringify(viewer || { email: 'data@virgoasia.com', name: 'Vijay' })};${today ? `try{localStorage.setItem('desk-today','${today}')}catch(e){}` : ''}` });
  await page.addInitScript({ path: path.join(here, 'mock-claude.js') });
  await page.goto('file://' + dist);
  return { ctx, page, errs };
}
