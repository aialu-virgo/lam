// Splitting of the page into part files (Apps Script editor save limit). Used by build-gas.mjs and test/gas-split.mjs.
// The editor's HtmlService does not hand back exactly what was pasted (it removed 31,837 characters from Index on the live tenant), so a part is not
// checked by length or checksum. Every part instead ends with a SENTINEL that survives processing: a JS string statement inside the script, or a <meta> at the end of the page.
export const MAX_PART_BYTES = Number(process.env.MAX_PART_BYTES) > 0 ? Number(process.env.MAX_PART_BYTES) : 700000; // override: MAX_PART_BYTES=500000 node build-gas.mjs
export const SENTINEL_RESERVE = 96; // bytes kept free in each part for its sentinel
export const BOUNDARY = /\n\/\* ---- src\/[^ ]+ ---- \*\/\n/g; // start of a Desk module inside the one IIFE: always between two complete top-level statements
export function indexSum(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); } // FNV-1a over UTF-16 units: the build id
export const sentinelText = (k, n, id) => '@@PART ' + k + ' of ' + n + ' #' + id + '@@'; // k is 1-based
const SENT_JS = /\n'@@PART \d+ of \d+ #[0-9a-f]{8}@@';/g, SENT_META = /<meta name="desk-part" content="@@PART \d+ of \d+ #[0-9a-f]{8}@@">\n/g;
export const stripSentinels = t => t.replace(SENT_JS, '').replace(SENT_META, '');
const bytes = s => Buffer.byteLength(s, 'utf8');
// Cut `text` at boundary offsets (the newline before a module marker) so every part, with its sentinel, is <= maxBytes. Returns the parts without sentinels.
export function splitAtBoundaries(text, maxBytes = MAX_PART_BYTES, boundary = BOUNDARY) {
  const cuts = []; let m; boundary.lastIndex = 0; while ((m = boundary.exec(text))) cuts.push(m.index);
  const parts = []; let a = 0;
  while (bytes(text.slice(a)) + SENTINEL_RESERVE > maxBytes) {
    let best = -1; for (const c of cuts) { if (c <= a) continue; if (bytes(text.slice(a, c)) + SENTINEL_RESERVE <= maxBytes) best = c; else break; }
    if (best < 0) throw new Error('no module boundary after offset ' + a + ' keeps a part under ' + maxBytes + ' bytes');
    parts.push(text.slice(a, best)); a = best;
  }
  parts.push(text.slice(a));
  return parts;
}
// Adds the sentinels: all but the last part end with a string statement; the last gets a <meta> before its closing </html>.
export function addSentinels(parts, id) {
  const n = parts.length;
  return parts.map((p, i) => {
    const s = sentinelText(i + 1, n, id);
    if (i < n - 1) return p + "\n'" + s + "';";
    const k = p.lastIndexOf('</html>'); if (k < 0) throw new Error('last part has no </html>');
    return p.slice(0, k) + '<meta name="desk-part" content="' + s + '">\n' + p.slice(k);
  });
}
