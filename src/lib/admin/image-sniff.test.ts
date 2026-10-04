import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffImage, MAX_PHOTO_BYTES } from "./image-sniff.ts";

const png = (w: number, h: number) => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
const jpeg = (w: number, h: number, sof = 0xc0) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, sof, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xd9]);
const riff = (fourcc: string, body: number[]) => { const b = new Uint8Array(30 + 4); b.set([...("RIFF" + "\0\0\0\0" + "WEBP" + fourcc).split("").map((c) => c.charCodeAt(0))]); b.set(body, 20); return b; };

test("PNG: type and size read from the header", () => {
  assert.deepEqual(sniffImage(png(800, 600)), { ok: true, type: "image/png", ext: "png", width: 800, height: 600 });
});
test("JPEG: size read from the frame header, including progressive", () => {
  assert.deepEqual(sniffImage(jpeg(1024, 768)), { ok: true, type: "image/jpeg", ext: "jpg", width: 1024, height: 768 });
  assert.equal((sniffImage(jpeg(640, 480, 0xc2)) as { width: number }).width, 640);
});
test("WebP: lossy, lossless and extended", () => {
  const x = riff("VP8X", [0, 0, 0, 0, 0x1f, 0x03, 0, 0xff, 0x01, 0]);                                    // width-1 = 799, height-1 = 511
  assert.deepEqual(sniffImage(x), { ok: true, type: "image/webp", ext: "webp", width: 800, height: 512 });
  const lossy = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02]);                         // 0x0320 = 800, 0x0258 = 600
  assert.deepEqual(sniffImage(lossy), { ok: true, type: "image/webp", ext: "webp", width: 800, height: 600 });
  const v = (799 | (599 << 14)) >>> 0;
  const ll = riff("VP8L", [0x2f, v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255]);
  assert.deepEqual(sniffImage(ll), { ok: true, type: "image/webp", ext: "webp", width: 800, height: 600 });
});
test("SVG, GIF, HTML, PDF and empty are refused whatever they are named", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  for (const body of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "GIF89a\x01\x00\x01\x00", "<html><script>x</script>", "%PDF-1.7 ....................", "MZ\x90\x00"]) assert.equal(sniffImage(enc(body)).ok, false, body.slice(0, 12));
  assert.equal(sniffImage(new Uint8Array()).ok, false);
});
test("a PNG header with a polyglot payload still only counts as a PNG (type comes from bytes)", () => {
  const b = new Uint8Array(100); b.set(png(300, 300)); b.set(new TextEncoder().encode("<script>"), 40);
  assert.equal((sniffImage(b) as { type: string }).type, "image/png");
});
test("size limits: over 5 MB, huge dimensions, tiny images, truncated headers", () => {
  assert.equal(sniffImage(new Uint8Array(MAX_PHOTO_BYTES + 1)).ok, false);
  assert.equal(sniffImage(png(10001, 500)).ok, false);
  assert.equal(sniffImage(png(0, 500)).ok, false);
  assert.equal(sniffImage(png(100, 100)).ok, false);
  assert.equal(sniffImage(png(300, 300).slice(0, 20)).ok, false);
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff])).ok, false);
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9, 0, 0, 0, 0, 0, 0])).ok, false);
});
test("a JPEG whose segment length is 0 or 1 cannot loop forever", () => {
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).ok, false);
});
