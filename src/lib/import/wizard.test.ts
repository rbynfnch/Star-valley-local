import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ROWS, parseLineList, previewCsv, sanitizeMapping, selectRows, summarizeResults } from "./wizard.ts";
import { planImport, type Lookups } from "./plan.ts";

const lk: Lookups = {
  categories: [{ id: "c1", slug: "plumbing", name: "Plumbing" }], communities: [{ id: "m1", slug: "thayne", name: "Thayne" }],
  existing: [{ id: "e1", name: "Sample Valley Plumbing", phone_digits: "3075550101", address_line1: "100 Main Street" }],
};
const csv = "Business Name,Phone,Town,Type\nAspen Electric,307-555-0142,Thayne,Plumbing\nSample Valley Plumbing,(307) 555-0101,Afton,Plumbing\nOdd Name,,Nowhere,Basket Weaving\n,,Afton,\n\nAspen Electric,307-555-0142,Thayne,Plumbing\n";

test("preview: headers, count, sample and a guessed mapping", () => {
  const r = previewCsv(csv); assert.ok(r.ok);
  assert.deepEqual(r.preview.headers, ["Business Name", "Phone", "Town", "Type"]);
  assert.equal(r.preview.rowCount, 5); assert.equal(r.preview.sample.length, 3); assert.equal(r.preview.mapping.name, 0);
});
test("preview refuses empty, header-only, oversized, too-long and broken files", () => {
  assert.equal(previewCsv("").ok, false); assert.equal(previewCsv("name\n").ok, false);
  assert.equal(previewCsv("a,b\n" + "x".repeat(1_000_001)).ok, false);
  assert.equal(previewCsv("name\n" + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `b${i}`).join("\n")).ok, false);
  const bad = previewCsv('name\n"unterminated'); assert.ok(!bad.ok && /unterminated/i.test(bad.error));
  assert.equal(previewCsv(Array.from({ length: 61 }, (_, i) => "c" + i).join(",") + "\nx").ok, false);
});
test("mapping: only known fields at real, distinct columns; name is required", () => {
  assert.deepEqual(sanitizeMapping('{"name":0,"phone":1,"bogus":2}', 4), { ok: true, mapping: { name: 0, phone: 1 } });
  assert.deepEqual(sanitizeMapping({ name: 0, phone: "" }, 4), { ok: true, mapping: { name: 0 } });
  for (const bad of ['{"phone":1}', '{"name":9}', '{"name":-1}', '{"name":"0"}', "not json", "[1]", "null", '{"name":1.5}']) assert.equal(sanitizeMapping(bad, 4).ok, false, bad);
});
test("mapping: one column may feed several fields (a Town column is both city and community)", () => {
  assert.deepEqual(sanitizeMapping({ name: 0, city: 2, community: 2 }, 4), { ok: true, mapping: { name: 0, city: 2, community: 2 } });
});
test("selectRows: create rows always; review rows only when chosen (forced); duplicates only when chosen to update; invalid never", () => {
  const plans = planImport(csv, { name: 0, phone: 1, community: 2, category: 3 }, lk);
  assert.deepEqual(plans.map((p) => [p.line, p.action]), [[2, "create"], [3, "skip_duplicate"], [4, "review"], [5, "invalid"], [7, "skip_duplicate"]]);   // row 6 is blank and skipped, but row numbers still match the spreadsheet
  const none = selectRows(plans, { addReview: [], updateExisting: [] });
  assert.deepEqual(none.lines, [2]);
  const all = selectRows(plans, { addReview: [4, 5], updateExisting: [3, 7] });
  assert.deepEqual(all.lines, [2, 3, 4]);                       // 5 is invalid; 7 duplicates a row in the FILE, so it has no existing id
  assert.equal(all.rows[1].existing_id, "e1"); assert.equal(all.rows[2].force, true); assert.equal(all.rows[0].force, undefined);
});
test("selectRows never invents data: only candidate fields are sent", () => {
  const plans = planImport(csv, { name: 0, phone: 1, community: 2, category: 3 }, lk);
  const keys = Object.keys(selectRows(plans, { addReview: [], updateExisting: [] }).rows[0]).sort();
  assert.deepEqual(keys, ["address_line1", "city", "email", "home_community_id", "name", "phone", "postal_code", "primary_category_id", "short_description", "slug", "website"]);
});
test("parseLineList: ids only, deduped, in range", () => {
  assert.deepEqual(parseLineList("2,3,3,4"), [2, 3, 4]);
  assert.deepEqual(parseLineList("1,0,-4,abc,99999,5"), [5]);
  assert.deepEqual(parseLineList(""), []); assert.deepEqual(parseLineList(null), []); assert.deepEqual(parseLineList(["2"]), []);
});
test("summarizeResults", () => {
  assert.deepEqual(summarizeResults([{ index: 1, result: "created" }, { index: 2, result: "created" }, { index: 3, result: "updated" }, { index: 4, result: "skipped_duplicate" }, { index: 5, result: "error" }]), { created: 2, updated: 1, skipped: 1, errors: 1 });
});
