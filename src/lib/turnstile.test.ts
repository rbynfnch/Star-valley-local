import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile } from "./turnstile.ts";

const ok = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
const no = async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 });

test("no secret: allowed in development, refused in production (fail closed)", async () => {
  assert.equal(await verifyTurnstile("t", { isProduction: false }), true);
  assert.equal(await verifyTurnstile("t", { isProduction: true }), false);
});
test("a valid token passes; an invalid one fails", async () => {
  assert.equal(await verifyTurnstile("tok", { secret: "s", isProduction: true, fetchImpl: ok }), true);
  assert.equal(await verifyTurnstile("tok", { secret: "s", isProduction: true, fetchImpl: no }), false);
});
test("missing, empty, non-string or oversized tokens fail without calling Cloudflare", async () => {
  let n = 0; const f = async () => { n++; return ok(); };
  for (const t of [undefined, null, "", 5, "x".repeat(2049)]) assert.equal(await verifyTurnstile(t, { secret: "s", isProduction: true, fetchImpl: f }), false);
  assert.equal(n, 0);
});
test("sends the secret, token and ip as form data", async () => {
  let body = "";
  await verifyTurnstile("tok", { secret: "sec", ip: "1.2.3.4", isProduction: true, fetchImpl: async (_u, init) => { body = String(init!.body); return ok(); } });
  const p = new URLSearchParams(body); assert.equal(p.get("secret"), "sec"); assert.equal(p.get("response"), "tok"); assert.equal(p.get("remoteip"), "1.2.3.4");
});
test("Cloudflare errors, bad status and bad JSON all fail closed", async () => {
  assert.equal(await verifyTurnstile("t", { secret: "s", isProduction: true, fetchImpl: async () => { throw new Error("down"); } }), false);
  assert.equal(await verifyTurnstile("t", { secret: "s", isProduction: true, fetchImpl: async () => new Response("", { status: 500 }) }), false);
  assert.equal(await verifyTurnstile("t", { secret: "s", isProduction: true, fetchImpl: async () => new Response("not json", { status: 200 }) }), false);
});
