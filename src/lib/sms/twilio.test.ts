import { test } from "node:test";
import assert from "node:assert/strict";
import { isE164, sendSms, smsConfigFromEnv, SmsError, type SmsConfig } from "./twilio.ts";

const cfg: SmsConfig = { accountSid: "ACtest", authToken: "secret-token", from: "+13075550100", apiBase: "https://api.twilio.test" };

test("config: all three variables are required; production ignores the API base override", () => {
  assert.equal(smsConfigFromEnv({}), null);
  assert.equal(smsConfigFromEnv({ TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b" }), null);
  const ok = { TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b", TWILIO_FROM_NUMBER: "+1", TWILIO_API_BASE: "http://evil.test" };
  assert.equal(smsConfigFromEnv({ ...ok, NODE_ENV: "development" })!.apiBase, "http://evil.test");
  assert.equal(smsConfigFromEnv({ ...ok, NODE_ENV: "production" })!.apiBase, "https://api.twilio.com");
});
test("isE164", () => { assert.ok(isE164("+13075550601")); for (const b of ["3075550601", "+0123456789", "+1307555", "+1307555060123456", "+1 307 555 0601", "", "+13075550601; x"]) assert.ok(!isE164(b), b); });
test("sendSms posts form data with basic auth to the right URL", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  await sendSms(cfg, "+13075550601", "Your code is 123456", async (url, init) => { seen = { url: String(url), init: init! }; return new Response("{}", { status: 201 }); });
  assert.equal(seen!.url, "https://api.twilio.test/2010-04-01/Accounts/ACtest/Messages.json");
  assert.equal(seen!.init.method, "POST");
  const h = seen!.init.headers as Record<string, string>;
  assert.equal(h.Authorization, "Basic " + Buffer.from("ACtest:secret-token").toString("base64"));
  const p = new URLSearchParams(String(seen!.init.body));
  assert.equal(p.get("To"), "+13075550601"); assert.equal(p.get("From"), "+13075550100"); assert.equal(p.get("Body"), "Your code is 123456");
});
test("a provider error throws SmsError without leaking the body, the number or the token", async () => {
  await assert.rejects(
    sendSms(cfg, "+13075550601", "x", async () => new Response('{"message":"bad number +13075550601","token":"secret-token"}', { status: 400 })),
    (e: unknown) => e instanceof SmsError && e.status === 400 && !/secret-token|\+1307/.test(String((e as Error).message)),
  );
});
test("a non-E.164 destination is refused before any request is made", async () => {
  let called = false;
  await assert.rejects(sendSms(cfg, "3075550601", "x", async () => { called = true; return new Response("{}"); }), SmsError);
  assert.equal(called, false);
});
test("a network failure propagates (the caller treats it as 'could not send')", async () => {
  await assert.rejects(sendSms(cfg, "+13075550601", "x", async () => { throw new TypeError("fetch failed"); }));
});
