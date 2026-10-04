// Featured businesses rotate so nobody is permanently on top (CLAUDE.md §6): when more placements are live than
// there are visible slots, the order is reshuffled every time bucket. Deterministic for a given (seed, bucket) so
// every visitor in the same hour sees the same order (cache friendly) and tests are stable.

function hash(str: string): number {              // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rnd = mulberry32(hash(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const ROTATION_BUCKET_MS = 60 * 60 * 1000;

/** Shuffles by (scope, hour) and returns the first `visible`. `scope` should identify the slot, e.g. "tenant:homepage". */
export function rotateFeatured<T>(items: readonly T[], visible: number, scope: string, now: Date, bucketMs = ROTATION_BUCKET_MS): T[] {
  if (items.length <= 1) return [...items];
  const bucket = Math.floor(now.getTime() / bucketMs);
  return seededShuffle(items, `${scope}:${bucket}`).slice(0, Math.max(0, visible));
}
