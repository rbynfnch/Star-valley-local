// Identify an uploaded image from its first bytes (never from the filename or the browser's claimed type), read its size,
// and accept only PNG, JPEG and WebP. SVG (can carry script), GIF and everything else are refused.
export const MAX_PHOTO_BYTES = 5_000_000;
export type Sniffed = { ok: true; type: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp"; width: number; height: number } | { ok: false; error: string };
const BAD = (error: string): Sniffed => ({ ok: false, error });
const UNSUPPORTED = "Use a JPEG, PNG or WebP photo.";

export function sniffImage(b: Uint8Array): Sniffed {
  if (b.length === 0) return BAD("Choose a photo to upload.");
  if (b.length > MAX_PHOTO_BYTES) return BAD("Photos can be at most 5 MB.");
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (i: number, s: string) => b.length >= i + s.length && [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  let r: { type: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp"; width: number; height: number } | null = null;

  if (b.length >= 24 && b[0] === 0x89 && ascii(1, "PNG") && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a && ascii(12, "IHDR")) {
    r = { type: "image/png", ext: "png", width: u32(16), height: u32(20) };
  } else if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;                                                                    // walk the segments to the first start-of-frame
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) break;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { r = { type: "image/jpeg", ext: "jpg", width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] }; break; }
      i += 2 + len;
    }
    if (!r) return BAD("That JPEG could not be read.");
  } else if (b.length >= 30 && ascii(0, "RIFF") && ascii(8, "WEBP")) {
    const le24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
    if (ascii(12, "VP8X")) r = { type: "image/webp", ext: "webp", width: le24(24) + 1, height: le24(27) + 1 };
    else if (ascii(12, "VP8 ") && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) r = { type: "image/webp", ext: "webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    else if (ascii(12, "VP8L") && b[20] === 0x2f) { const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0; r = { type: "image/webp", ext: "webp", width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
    else return BAD("That WebP could not be read.");
  } else return BAD(UNSUPPORTED);

  if (r.width < 1 || r.height < 1 || r.width > 10000 || r.height > 10000) return BAD("That image's size is not valid (up to 10,000 pixels on a side).");
  if (r.width < 200 || r.height < 200) return BAD("That photo is too small. Use one at least 200 pixels on each side.");
  return { ok: true, ...r };
}
