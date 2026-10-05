import { test } from "node:test";
import assert from "node:assert/strict";
import { sendPostmark, type Fetch } from "./postmark.ts";

const msg = { from: "A <a@x.test>", to: "b@y.test", subject: "S", text: "T", html: "<p>T</p>", tag: "k", metadata: { notification_id: "n1" } };
const cfg = (f: Fetch) => ({ token: "tok", stream: "outbound", apiBase: "https://pm.test/", fetchImpl: f });
const reply = (status: number, body: unknown): Fetch => (async () => new Response(JSON.stringify(body), { status })) as Fetch;

test("sends the right request: token header, business stream, no tracking", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const r = await sendPostmark(msg, cfg((async (url, init) => { seen = { url: String(url), init: init! }; return new Response(JSON.stringify({ ErrorCode: 0, MessageID: "mid-1" })); }) as Fetch));
  assert.deepEqual(r, { ok: true, messageId: "mid-1" });
  assert.equal(seen!.url, "https://pm.test/email");
  assert.equal((seen!.init.headers as Record<string, string>)["X-Postmark-Server-Token"], "tok");
  const b = JSON.parse(seen!.init.body as string);
  assert.equal(b.MessageStream, "outbound"); assert.equal(b.To, "b@y.test"); assert.equal(b.TrackOpens, false); assert.equal(b.TrackLinks, "None"); assert.deepEqual(b.Metadata, { notification_id: "n1" });
});
test("inactive recipient and invalid address are permanent", async () => {
  for (const code of [406, 300]) { const r = await sendPostmark(msg, cfg(reply(422, { ErrorCode: code, Message: "bad" }))); assert.equal(r.ok, false); assert.equal((r as { permanent: boolean }).permanent, true, String(code)); }
});
test("server errors, rate limits, network failures and account problems are retried", async () => {
  for (const f of [reply(500, {}), reply(503, { ErrorCode: 0 }), reply(429, { ErrorCode: 0 }), reply(401, { ErrorCode: 10, Message: "bad token" }), reply(422, { ErrorCode: 400, Message: "sender" })]) {
    const r = await sendPostmark(msg, cfg(f)); assert.equal(r.ok, false); assert.equal((r as { permanent: boolean }).permanent, false);
  }
  const r = await sendPostmark(msg, cfg((async () => { throw new TypeError("fetch failed"); }) as Fetch));
  assert.deepEqual(r, { ok: false, permanent: false, error: "network: TypeError" });
});
test("a 200 without a message id is not trusted as sent", async () => {
  const r = await sendPostmark(msg, cfg(reply(200, { ErrorCode: 0 })));
  assert.equal(r.ok, false);
});
test("the error text never contains the token", async () => {
  const r = await sendPostmark(msg, cfg(reply(401, { ErrorCode: 10, Message: "bad token" })));
  assert.doesNotMatch(JSON.stringify(r), /tok"|X-Postmark/);
});
