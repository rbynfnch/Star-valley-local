import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBusiness, parseEvent, parseUpdate } from "./input.ts";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const NOW = new Date("2026-10-04T12:00:00Z"); const TZ = "America/Denver";
const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
const val = <T,>(r: { ok: true; value: T } | { ok: false; error: string }) => { assert.ok(r.ok, r.ok ? "" : r.error); return (r as { value: T }).value; };
const err = (r: { ok: boolean; error?: string }) => { assert.ok(!r.ok); return (r as { error: string }).error; };

test("update: only filled fields are kept; website is normalised; closed becomes true", () => {
  const v = val(parseUpdate(form({ business: "sample-valley-plumbing", phone: " 307-555-0123 ", website: "example.com/", name: "", closed: "yes", note: "  moved  " })));
  assert.deepEqual(v.payload, { fields: { phone: "307-555-0123", website: "https://example.com" }, note: "moved", closed: true });
  assert.equal(v.business, "sample-valley-plumbing");
});
test("update: nothing to change, bad slug, bad website, short phone and bad email are refused", () => {
  assert.match(err(parseUpdate(form({ business: "x" }))), /what should change/i);
  assert.equal(parseUpdate(form({ business: "Bad Slug", note: "x" })).ok, false);
  assert.match(err(parseUpdate(form({ business: "x", website: "javascript:alert(1)" }))), /website/i);
  assert.match(err(parseUpdate(form({ business: "x", phone: "123" }))), /phone/i);
  assert.match(err(parseUpdate(form({ business: "x", note: "n", your_email: "nope" }))), /email/i);
});
test("update: contact is optional", () => { assert.deepEqual(val(parseUpdate(form({ business: "x", note: "n" }))).contact, { name: null, email: null, phone: null }); });
test("business: name and email are required; ids must be real; lengths capped", () => {
  assert.match(err(parseBusiness(form({ your_email: "a@b.co" }))), /called/i);
  assert.match(err(parseBusiness(form({ name: "Bakery" }))), /email/i);
  assert.equal(parseBusiness(form({ name: "B", your_email: "a@b.co", community_id: "thayne" })).ok, false);
  const v = val(parseBusiness(form({ name: " Sourdough Co ", your_email: " A@B.CO ", community_id: ID.toUpperCase(), note: "x".repeat(2000), your_name: "Robin" })));
  assert.equal(v.payload.name, "Sourdough Co"); assert.equal(v.payload.community_id, ID); assert.equal((v.payload.note as string).length, 1000);
  assert.deepEqual(v.contact, { name: "Robin", email: "a@b.co", phone: null });
});
test("event: wall-clock time is read in the tenant timezone (MDT = UTC-6)", () => {
  const v = val(parseEvent(form({ title: "Fair", start_date: "2026-10-17", start_time: "18:30", end_time: "21:00", your_email: "a@b.co" }), TZ, NOW));
  assert.equal(v.payload.starts_at, "2026-10-18T00:30:00.000Z"); assert.equal(v.payload.ends_at, "2026-10-18T03:00:00.000Z");
});
test("event: winter dates use MST (UTC-7); all-day events need no time", () => {
  assert.equal(val(parseEvent(form({ title: "Parade", start_date: "2026-12-05", start_time: "10:00", your_email: "a@b.co" }), TZ, NOW)).payload.starts_at, "2026-12-05T17:00:00.000Z");
  const a = val(parseEvent(form({ title: "Market", start_date: "2026-12-05", all_day: "yes", your_email: "a@b.co" }), TZ, NOW));
  assert.equal(a.payload.all_day, true); assert.equal(a.payload.starts_at, "2026-12-05T07:00:00.000Z");
});
test("event: refuses missing title, email or time; past, too-far, impossible and reversed dates", () => {
  const base = { title: "T", start_date: "2026-11-01", start_time: "10:00", your_email: "a@b.co" };
  assert.match(err(parseEvent(form({ ...base, title: "" }), TZ, NOW)), /called/i);
  assert.match(err(parseEvent(form({ ...base, your_email: "" }), TZ, NOW)), /email/i);
  assert.match(err(parseEvent(form({ ...base, start_time: "" }), TZ, NOW)), /time/i);
  assert.match(err(parseEvent(form({ ...base, start_date: "2026-09-01" }), TZ, NOW)), /passed/i);
  assert.match(err(parseEvent(form({ ...base, start_date: "2029-01-01" }), TZ, NOW)), /two years/i);
  assert.equal(parseEvent(form({ ...base, start_date: "2026-02-30" }), TZ, NOW).ok, false);
  assert.equal(parseEvent(form({ ...base, start_time: "25:00" }), TZ, NOW).ok, false);
  assert.match(err(parseEvent(form({ ...base, end_date: "2026-11-01", end_time: "09:00" }), TZ, NOW)), /before it starts/i);
  assert.match(err(parseEvent(form({ ...base, url: "javascript:alert(1)" }), TZ, NOW)), /link/i);
});
test("hostile text is carried as plain data: control characters stripped", () => {
  const v = val(parseBusiness(form({ name: "A\u0000B<script>", your_email: "a@b.co" })));
  assert.equal(v.payload.name, "AB<script>");   // escaping is the renderer's job; React escapes it
});
