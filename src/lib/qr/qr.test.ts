import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encodeQr, MAX_BYTES, qrSvgPath } from "./qr.ts";

const hash = (m: boolean[][]) => createHash("sha256").update(m.map((r) => r.map((c) => (c ? "1" : "0")).join("")).join("")).digest("hex");

// These golden hashes are of matrices that were decoded back to the exact input by an independent decoder (OpenCV) and, for the long
// inputs, matched module for module against python-qrcode with every mask. A change that alters them has changed the QR output.
test("known inputs encode to the verified matrices", () => {
  assert.equal(hash(encodeQr("https://svl.example/verify/postcard?c=K7Q2MXVB9P")), "9ebd3f8609bf5c3f3d3e4db8de032bb1a6b6e374336e87f728191ad4500ca2a2");
  assert.equal(hash(encodeQr("z".repeat(213))), "b2bb2b06366d48790e0fc55c779ff40a734b7299a0265cb6b9c8d990405e74ea");
  assert.equal(hash(encodeQr("A")), "2092585037e9da5651bc5530c31a5a1faebf5717f680e96bd47ad1394a60eeed");
});
test("the version grows with the payload (21, 33, 57 modules)", () => {
  assert.equal(encodeQr("A").length, 21); assert.equal(encodeQr("x".repeat(60)).length, 33); assert.equal(encodeQr("x".repeat(MAX_BYTES)).length, 57);
});
test("structure: finder patterns, timing pattern and the dark module", () => {
  const m = encodeQr("https://svl.example/verify/postcard?c=K7Q2MXVB9P"), n = m.length;
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) for (let d = 0; d < 7; d++) { assert.ok(m[oy][ox + d] && m[oy + 6][ox + d] && m[oy + d][ox] && m[oy + d][ox + 6], "finder border"); }
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[n - 8][8], true);
});
test("deterministic, and the empty and unicode strings work; too long throws", () => {
  assert.deepEqual(encodeQr("same"), encodeQr("same")); assert.ok(encodeQr("").length >= 21); assert.ok(encodeQr("é€ ✓").length >= 21);
  assert.throws(() => encodeQr("x".repeat(MAX_BYTES + 1)), /too long/);
});
test("the SVG path has one square per dark module and a quiet zone", () => {
  const m = encodeQr("A"), p = qrSvgPath(m);
  assert.equal(p.size, 29); assert.equal((p.d.match(/M/g) ?? []).length, m.flat().filter(Boolean).length); assert.match(p.d, /^M4,4h1v1h-1z/);
});
