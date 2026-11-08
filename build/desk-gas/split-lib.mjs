// Splitting of the page into part files (Apps Script editor save limit). Used by build-gas.mjs and test/gas-split.mjs.
export const MAX_PART_BYTES = 700000;
export function indexSum(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); } // FNV-1a over UTF-16 units; same code in Code.gs
export function splitPage(text, maxBytes = MAX_PART_BYTES) {
  const parts = []; let cur = [], curBytes = 0;
  const flush = () => { if (cur.length) { parts.push(cur.join('')); cur = []; curBytes = 0; } };
  for (const line of text.match(/[^\n]*\n|[^\n]+/g) || []) {   // lines keep their own \n
    let b = Buffer.byteLength(line, 'utf8');
    if (b > maxBytes) { // a single over-long line: cut it at code-point boundaries
      flush(); let piece = '', pb = 0;
      for (const ch of line) { const cb = Buffer.byteLength(ch, 'utf8'); if (pb + cb > maxBytes) { parts.push(piece); piece = ''; pb = 0; } piece += ch; pb += cb; }
      cur = [piece]; curBytes = pb; continue;
    }
    if (curBytes + b > maxBytes) flush();
    cur.push(line); curBytes += b;
  }
  flush();
  return parts;
}
