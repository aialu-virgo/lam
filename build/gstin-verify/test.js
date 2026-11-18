// node build/gstin-verify/test.js — self-check of checksum and response parsing
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), ctx);
assert(ctx.isValidGstin('27AAPFU0939F1ZV'));   // public example GSTIN
assert(ctx.isValidGstin('29AAGCB7383J1Z4'));
assert(!ctx.isValidGstin('27AAPFU0939F1ZX'));  // bad check digit
assert(!ctx.isValidGstin('27AAPFU0939F1Z'));   // short
const ok = ctx.parseResponse({ flag: true, data: { lgnm: 'ABC PVT LTD', tradeNam: 'ABC', sts: 'Active',
  pradr: { addr: { bno: '12', st: 'MG Road', loc: 'Andheri', city: '', dst: 'Mumbai', stcd: 'Maharashtra', pncd: '400069' } } } });
assert(ok.found);
assert.deepStrictEqual(Array.from(ok.row), ['Valid - Active', 'ABC', 'Maharashtra', 'Mumbai', 'Andheri', '400069', '12, MG Road, Andheri, Mumbai, Maharashtra, 400069']);
const no = ctx.parseResponse({ flag: false, message: 'Invalid GSTIN' });
assert(!no.found); assert.deepStrictEqual(Array.from(no.row), ['Not found']); assert.strictEqual(no.note, 'Invalid GSTIN');
const cx = ctx.parseResponse({ data: { lgnm: 'CREDIT SOLUTIONS PVT LTD', sts: 'Cancelled' } });
assert(cx.found && cx.row[0] === 'Valid - Cancelled' && cx.row[1] === 'CREDIT SOLUTIONS PVT LTD'); // firm name with "credit" is not an account error
assert(!ctx.isValidGstin('00AAPFU0939F1ZV') && !ctx.isValidGstin('45AAPFU0939F1ZV')); // bad state codes
assert(ctx.ACCOUNT_ERROR.test(ctx.parseResponse({ flag: false, message: 'Invalid API Key' }).note));
assert(!ctx.ACCOUNT_ERROR.test(no.note));
console.log('extra checks passed');
