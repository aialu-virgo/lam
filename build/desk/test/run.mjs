import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire('/opt/node22/lib/node_modules/');
export const { chromium } = require('playwright');
export const here = path.dirname(fileURLToPath(import.meta.url));
export const dist = path.join(here, '../dist/index.html');
export async function open(browser, { viewer, store, size = { width: 1440, height: 900 }, scheme = 'light', today } = {}) {
  const ctx = await browser.newContext({ viewport: size, colorScheme: scheme });
  await ctx.route(/fonts\.googleapis|fonts\.gstatic|cdnjs/, r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.addInitScript({ content: `window.__INIT_STORE=${JSON.stringify(store || {})};window.__VIEWER=${JSON.stringify(viewer || { email: 'data@virgoasia.com', name: 'Vijay' })};${today ? `try{localStorage.setItem('desk-today','${today}')}catch(e){}` : ''}` });
  await page.addInitScript({ path: path.join(here, 'mock-claude.js') });
  await page.goto('file://' + dist);
  return { ctx, page, errs };
}
