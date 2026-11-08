// Splitting of the page into part files (Apps Script editor save limit). Used by build-gas.mjs and test/gas-split.mjs.
// Parts are read by Code.gs with createTemplateFromFile(name).getRawContent(), which is exact, so the join of the parts IS the page, byte for byte, and each part has a length and checksum.
export const MAX_PART_BYTES = Number(process.env.MAX_PART_BYTES) > 0 ? Number(process.env.MAX_PART_BYTES) : 700000; // override: MAX_PART_BYTES=500000 node build-gas.mjs
export const BOUNDARY = /\n\/\* ---- src\/[^ ]+ ---- \*\/\n/g; // start of a Desk module inside the one IIFE: a line boundary between two complete top-level statements
export function indexSum(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); } // FNV-1a over UTF-16 units; same code in Code.gs
const bytes = s => Buffer.byteLength(s, 'utf8');
// Cut `text` at boundary offsets (the newline before a module marker) so every part is <= maxBytes. The parts joined are `text`.
export function splitAtBoundaries(text, maxBytes = MAX_PART_BYTES, boundary = BOUNDARY) {
  const cuts = []; let m; boundary.lastIndex = 0; while ((m = boundary.exec(text))) cuts.push(m.index);
  const parts = []; let a = 0;
  while (bytes(text.slice(a)) > maxBytes) {
    let best = -1; for (const c of cuts) { if (c <= a) continue; if (bytes(text.slice(a, c)) <= maxBytes) best = c; else break; }
    if (best < 0) throw new Error('no module boundary after offset ' + a + ' keeps a part under ' + maxBytes + ' bytes');
    parts.push(text.slice(a, best)); a = best;
  }
  parts.push(text.slice(a));
  return parts;
}
