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
assert.deepStrictEqual(Array.from(ok.row), ['Yes', 'Active', 'ABC', 'ABC PVT LTD', 'Maharashtra', 'Mumbai', '', '400069', 'Andheri', '12, MG Road, Andheri, Mumbai, Maharashtra, 400069']);
const no = ctx.parseResponse({ flag: false, message: 'Invalid GSTIN' });
assert.deepStrictEqual(Array.from(no.row), ['No', 'Not found']); assert.strictEqual(no.note, 'Invalid GSTIN');
assert.strictEqual(ctx.parseResponse({ data: { lgnm: 'X', sts: 'Cancelled' } }).row[0], 'No');
console.log('all checks passed');
assert(!ctx.isValidGstin('00AAPFU0939F1ZV') && !ctx.isValidGstin('45AAPFU0939F1ZV')); // bad state codes
assert(ctx.ACCOUNT_ERROR.test('{"flag":false,"message":"Invalid API Key"}'));
assert(!ctx.ACCOUNT_ERROR.test('{"flag":false,"message":"Invalid GSTIN"}'));
console.log('extra checks passed');
