import { test } from "node:test";
import assert from "node:assert/strict";
import { isBot, optedOut, parseTrackBody, referrerHost, sessionHash, utcDay, MAX_BODY } from "./input.ts";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";

test("real browsers are not bots; crawlers, scripts, headless browsers and missing agents are", () => {
  assert.equal(isBot(CHROME), false);
  assert.equal(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"), false);
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)", "curl/8.4.0 something", "python-requests/2.31.0", "Mozilla/5.0 HeadlessChrome/126.0 Safari/537.36",
    "facebookexternalhit/1.1", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "GPTBot/1.0", "Go-http-client/2.0", "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)", "Slackbot-LinkExpanding 1.0", "Mozilla/5.0 (compatible; Yahoo! Slurp)", "Lighthouse Chrome-Lighthouse 12"]) assert.equal(isBot(ua), true, ua);
  for (const ua of [null, undefined, "", "x", "a".repeat(601)]) assert.equal(isBot(ua as string), true, String(ua));
});
test("Do Not Track and Global Privacy Control opt out", () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(optedOut(h({ dnt: "1" })), true); assert.equal(optedOut(h({ "sec-gpc": "1" })), true);
  assert.equal(optedOut(h({ dnt: "0" })), false); assert.equal(optedOut(h({})), false);
});
test("the visitor id is stable within a day and changes with the day, the salt, the tenant, the network and the browser", () => {
  const base = { salt: "s", day: "2026-10-05", tenant: "t", ip: "1.2.3.4", ua: CHROME };
  const h = sessionHash(base);
  assert.match(h, /^[0-9a-f]{32}$/); assert.equal(sessionHash({ ...base }), h);
  for (const o of [{ day: "2026-10-06" }, { salt: "s2" }, { tenant: "t2" }, { ip: "1.2.3.5" }, { ua: CHROME + " x" }]) assert.notEqual(sessionHash({ ...base, ...o }), h, JSON.stringify(o));
  assert.doesNotMatch(h, /1\.2\.3\.4/); assert.equal(utcDay(new Date("2026-10-05T23:59:59Z")), "2026-10-05");
});
test("a valid body keeps its events, lower-cases ids, and drops the unknown parts", () => {
  const r = parseTrackBody(JSON.stringify({ referrer: "WWW.Google.com", events: [
    { type: "profile_view", business_id: ID.toUpperCase(), surface: "profile", junk: 1 },
    { type: "search_appearance", business_id: ID, query: "plumber", surface: "search", community_id: ID, category_id: ID },
    { type: "deal_view", business_id: ID, deal_id: ID }] }))!;
  assert.deepEqual(r.events[0], { type: "profile_view", business_id: ID, surface: "profile" });
  assert.equal(r.events[1].query, "plumber"); assert.equal(r.events.length, 3); assert.equal(r.referrer, "www.google.com");
});
test("quote_request, unknown types, bad ids and non-objects are dropped one by one, not fatal", () => {
  const r = parseTrackBody(JSON.stringify({ events: [{ type: "quote_request", business_id: ID }, { type: "nope" }, { type: "profile_view", business_id: "x" }, { type: "profile_view", business_id: 5 }, 5, null, "s", { type: "phone_click", business_id: ID }] }))!;
  assert.deepEqual(r.events, [{ type: "phone_click", business_id: ID }]);
});
test("surfaces outside the known list are dropped; long queries are cut; at most 50 events are read", () => {
  const r = parseTrackBody(JSON.stringify({ events: [{ type: "profile_view", business_id: ID, surface: "<script>" }, { type: "search_appearance", business_id: ID, query: "q".repeat(1000) }, ...Array.from({ length: 100 }, () => ({ type: "profile_view", business_id: ID }))] }))!;
  assert.equal(r.events[0].surface, undefined); assert.equal(r.events[1].query!.length, 400); assert.equal(r.events.length, 50);
});
test("non-track bodies are refused: empty, oversized, not JSON, wrong shape", () => {
  for (const b of ["", "x", "{", "[]", "null", '{"events":"no"}', '{"events":{}}', "a".repeat(MAX_BODY + 1)]) assert.equal(parseTrackBody(b), null, b.slice(0, 20));
  assert.equal(parseTrackBody(5 as unknown as string), null);
});
test("a bad referrer is ignored; the referrer host helper keeps only the host and ignores our own", () => {
  assert.equal(parseTrackBody(JSON.stringify({ events: [], referrer: "evil.com/path?x=1" }))!.referrer, null);
  assert.equal(referrerHost("https://www.google.com/search?q=secret", "svl.example"), "www.google.com");
  assert.equal(referrerHost("https://svl.example/businesses", "svl.example:3000"), null);
  for (const r of [null, undefined, "", "not a url"]) assert.equal(referrerHost(r, "svl.example"), null);
});
