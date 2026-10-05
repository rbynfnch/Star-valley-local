// A small QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1 to 10 (up to 213 bytes). Written here so the
// postcard cards need no new dependency. Output is a square matrix of booleans (true = dark module). Verified against an independent
// encoder in qr.test.ts (fixed vectors) and by the structural checks below.

const ECC_M: Record<number, { ecc: number; groups: [number, number][] }> = {
  1: { ecc: 10, groups: [[1, 16]] }, 2: { ecc: 16, groups: [[1, 28]] }, 3: { ecc: 26, groups: [[1, 44]] }, 4: { ecc: 18, groups: [[2, 32]] },
  5: { ecc: 24, groups: [[2, 43]] }, 6: { ecc: 16, groups: [[4, 27]] }, 7: { ecc: 18, groups: [[4, 31]] }, 8: { ecc: 22, groups: [[2, 38], [2, 39]] },
  9: { ecc: 22, groups: [[3, 36], [2, 37]] }, 10: { ecc: 26, groups: [[4, 43], [1, 44]] },
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const VERSION_INFO: Record<number, number> = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };
const REMAINDER_BITS = (v: number) => (v === 1 ? 0 : v <= 6 ? 7 : 0);
const dataCodewords = (v: number) => ECC_M[v].groups.reduce((n, [c, d]) => n + c * d, 0);
export const MAX_BYTES = 213;

// ---- Reed-Solomon over GF(256), primitive polynomial 0x11d
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
function generator(deg: number): number[] {
  let g = [1];
  for (let i = 0; i < deg; i++) { const next = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); } g = next; }
  return g;
}
function rsRemainder(data: number[], deg: number): number[] {
  const g = generator(deg), rem = new Array(deg).fill(0);
  for (const d of data) { const factor = d ^ rem.shift()!; rem.push(0); if (factor !== 0) for (let i = 0; i < deg; i++) rem[i] ^= mul(g[i + 1], factor); }
  return rem;
}

function utf8(s: string): number[] { return [...new TextEncoder().encode(s)]; }

function buildCodewords(bytes: number[], v: number): number[] {
  const bits: number[] = [];
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); push(bytes.length, v <= 9 ? 8 : 16); for (const b of bytes) push(b, 8);
  const cap = dataCodewords(v) * 8;
  push(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  const cw: number[] = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; cw.length < dataCodewords(v); pad ^= 0xec ^ 0x11) cw.push(pad);
  // split into blocks, add error correction, interleave
  const { ecc, groups } = ECC_M[v]; const blocks: { data: number[]; ecc: number[] }[] = []; let at = 0;
  for (const [count, len] of groups) for (let i = 0; i < count; i++) { const data = cw.slice(at, at + len); at += len; blocks.push({ data, ecc: rsRemainder(data, ecc) }); }
  const out: number[] = []; const maxLen = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecc; i++) for (const b of blocks) out.push(b.ecc[i]);
  return out;
}

type Grid = { size: number; mod: boolean[][]; fn: boolean[][] };
function newGrid(v: number): Grid { const size = 17 + 4 * v; return { size, mod: Array.from({ length: size }, () => new Array(size).fill(false)), fn: Array.from({ length: size }, () => new Array(size).fill(false)) }; }
const setFn = (g: Grid, x: number, y: number, dark: boolean) => { if (x < 0 || y < 0 || x >= g.size || y >= g.size) return; g.mod[y][x] = dark; g.fn[y][x] = true; };

function drawFunctionPatterns(g: Grid, v: number) {
  for (let i = 0; i < g.size; i++) { setFn(g, 6, i, i % 2 === 0); setFn(g, i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [g.size - 4, 3], [3, g.size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); setFn(g, cx + dx, cy + dy, d !== 2 && d !== 4); }
  const pos = ALIGN[v];
  for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(g, pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(g, 0);                                  // reserve the format areas (real bits are written after masking)
  if (v >= 7) { const info = VERSION_INFO[v]; for (let i = 0; i < 18; i++) { const bit = ((info >> i) & 1) === 1, a = g.size - 11 + (i % 3), b = Math.floor(i / 3); setFn(g, a, b, bit); setFn(g, b, a, bit); } }
}
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;                   // level M = 00
  let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function drawFormat(g: Grid, mask: number) {
  const bits = formatBits(mask), bit = (i: number) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFn(g, 8, i, bit(i));
  setFn(g, 8, 7, bit(6)); setFn(g, 8, 8, bit(7)); setFn(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(g, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setFn(g, g.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(g, 8, g.size - 15 + i, bit(i));
  setFn(g, 8, g.size - 8, true);
}
function placeData(g: Grid, cw: number[], v: number) {
  const bits: boolean[] = []; for (const c of cw) for (let i = 7; i >= 0; i--) bits.push(((c >> i) & 1) === 1);
  for (let i = 0; i < REMAINDER_BITS(v); i++) bits.push(false);
  let k = 0;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < g.size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? g.size - 1 - vert : vert;
      if (!g.fn[y][x] && k < bits.length) g.mod[y][x] = bits[k++];
    }
  }
}
const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
function applyMask(g: Grid, m: number) { for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fn[y][x] && MASKS[m](x, y)) g.mod[y][x] = !g.mod[y][x]; }
function penalty(g: Grid): number {
  const n = g.size, m = g.mod; let p = 0;
  const run = (get: (i: number) => boolean) => {
    let count = 1, score = 0;
    for (let i = 1; i <= n; i++) { if (i < n && get(i) === get(i - 1)) count++; else { if (count >= 5) score += 3 + (count - 5); count = 1; } }
    // finder-like patterns 1:1:3:1:1 with 4 light modules either side
    const s = Array.from({ length: n }, (_, i) => (get(i) ? 1 : 0)).join("");
    for (const pat of ["10111010000", "00001011101"]) { let from = 0, at; while ((at = s.indexOf(pat, from)) !== -1) { score += 40; from = at + 1; } }
    return score;
  };
  for (let y = 0; y < n; y++) p += run((i) => m[y][i]);
  for (let x = 0; x < n; x++) p += run((i) => m[i][x]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  let dark = 0; for (const row of m) for (const c of row) if (c) dark++;
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

/** Encodes text (UTF-8, byte mode, level M). Throws if it does not fit in version 10 (213 bytes). */
export function encodeQr(text: string, forceMask?: number): boolean[][] {
  const bytes = utf8(text);
  if (bytes.length > MAX_BYTES) throw new Error("QR payload too long");
  let v = 1; while (v <= 10 && bytes.length > dataCodewords(v) - (v <= 9 ? 2 : 3)) v++;
  const cw = buildCodewords(bytes, v);
  let best: { mod: boolean[][]; score: number } | null = null;
  for (let m = forceMask ?? 0; m < (forceMask === undefined ? 8 : forceMask + 1); m++) {
    const g = newGrid(v); drawFunctionPatterns(g, v); placeData(g, cw, v); applyMask(g, m); drawFormat(g, m);
    const score = penalty(g);
    if (!best || score < best.score) best = { mod: g.mod.map((r) => [...r]), score };
  }
  return best!.mod;
}

/** The matrix as one SVG path (one square per dark module) with a 4-module quiet zone, for inline use. */
export function qrSvgPath(matrix: boolean[][]): { d: string; size: number } {
  const q = 4; let d = "";
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + q},${y + q}h1v1h-1z`; }));
  return { d, size: matrix.length + 2 * q };
}
