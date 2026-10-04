import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './csv.ts';
import { planImport, suggestMapping, formatPhone, normalizeWebsite, slugify, summarize, type Lookups } from './plan.ts';

const lk: Lookups = {
  categories: [{ id: 'c-plumb', slug: 'plumbing', name: 'Plumbing', plural_name: 'Plumbers' }, { id: 'c-cafe', slug: 'restaurants-cafes', name: 'Restaurants & Cafes' }],
  communities: [{ id: 'm-thayne', slug: 'thayne', name: 'Thayne' }, { id: 'm-afton', slug: 'afton', name: 'Afton' }],
  existing: [{ id: 'b1', name: 'Sample Valley Plumbing', phone_digits: '3075550101', address_line1: '100 Main Street' }],
};
const H = 'Business Name,Street Address,Town,Phone,Web,Type\n';
const plan = (rows: string) => { const t = H + rows; return planImport(t, suggestMapping(parseCsv(t)[0]), lk); };

test('csv: quotes, escaped quotes, embedded newline, CRLF, BOM, blank lines', () => {
  const r = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"line1\nline2",z\r\n');
  assert.deepEqual(r, [['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
  assert.deepEqual(parseCsv('a,,c\n,,'), [['a', '', 'c']]);
  assert.throws(() => parseCsv('a,"oops'));
});
test('mapping is suggested from header names', () => {
  assert.deepEqual(suggestMapping(['Business Name', 'Street Address', 'Town', 'Phone', 'Web', 'Type']), { name: 0, address_line1: 1, city: 2, phone: 3, website: 4, category: 5 });
});
test('phone, website and slug normalisation', () => {
  assert.equal(formatPhone('1-307-555-0142'), '(307) 555-0142');
  assert.equal(formatPhone('555-0142'), null);
  assert.equal(normalizeWebsite('example.com/'), 'https://example.com');
  assert.equal(normalizeWebsite('javascript:alert(1)'), null);
  assert.equal(normalizeWebsite('localhost'), null);
  assert.equal(slugify("Joe's Café & Grill"), 'joe-s-cafe-and-grill');
});
test('clean row is created with category and community resolved', () => {
  const [p] = plan('Aspen Electric LLC,5 Oak St,Thayne,307-555-0142,aspenelectric.example,Plumbers\n');
  assert.equal(p.action, 'create');
  assert.equal(p.candidate!.primary_category_id, 'c-plumb');
  assert.equal(p.candidate!.home_community_id, 'm-thayne');
  assert.equal(p.candidate!.phone, '(307) 555-0142');
  assert.equal(p.candidate!.website, 'https://aspenelectric.example');
  assert.equal(p.candidate!.slug, 'aspen-electric-llc-thayne');
});
test('existing business: same name+phone, or name+address, is skipped; name alone goes to review', () => {
  const [a, b, c, d] = plan([
    'Valley Plumbing,1 Elm,Afton,(307) 555-0101,,Plumbing',
    'Sample Valley Plumbing,100 Main St,Afton,,,Plumbing',
    'Sample Valley Plumbing,9 Other Rd,Afton,307-555-9999,,Plumbing',
    'Totally Different Name,100 Main St,Afton,307-555-0101,,Plumbing',
  ].join('\n') + '\n');
  assert.equal(a.action, 'skip_duplicate'); assert.equal(a.duplicateOf, 'b1');
  assert.equal(b.action, 'skip_duplicate', 'abbreviated address still matches');
  assert.equal(c.action, 'review');
  assert.equal(d.action, 'create', 'same phone alone is not a duplicate');
});
test('duplicates within the file are skipped; slugs stay unique', () => {
  const r = plan('Bear Roofing,1 A St,Afton,307-555-0200,,Plumbing\nBear Roofing LLC,1 A Street,Afton,307-555-0200,,Plumbing\nBear Roofing,2 B St,Afton,307-555-0201,,Plumbing\n');
  assert.deepEqual(r.map((x) => x.action), ['create', 'skip_duplicate', 'create']);
  assert.notEqual(r[0].candidate!.slug, r[2].candidate!.slug);
});
test('bad optional values are dropped with a reason; missing name is invalid; unknown category needs review', () => {
  const r = plan('X Shop,,Afton,12345,not a url,Plumbing\n,1 A St,Afton,,,\nY Shop,,Nowhere,,,Basket Weaving\n');
  assert.equal(r[0].action, 'create'); assert.equal(r[0].candidate!.phone, null); assert.equal(r[0].candidate!.website, null);
  assert.equal(r[0].reasons.length, 2);
  assert.equal(r[1].action, 'invalid');
  assert.equal(r[2].action, 'review');
  assert.deepEqual(summarize(r), { create: 1, invalid: 1, review: 1 });
});
test('dangerous cell content is carried as data only', () => {
  const [p] = plan('"<script>alert(1)</script>",,Afton,,javascript:alert(1),Plumbing\n');
  assert.equal(p.candidate!.website, null);
  assert.ok(!/[<>]/.test(p.candidate!.slug));
});
test("row numbers match the spreadsheet even with blank lines (and keepBlank only changes that)", async () => {
  const { parseCsv } = await import("./csv.ts");
  assert.deepEqual(parseCsv("a\n\nb\n"), [["a"], ["b"]]);
  assert.deepEqual(parseCsv("a\n\nb\n", { keepBlank: true }), [["a"], [""], ["b"]]);
  assert.deepEqual(parseCsv("a\r\n\r\nb\r\n", { keepBlank: true }), [["a"], [""], ["b"]]);
  const lk2: Lookups = { categories: [], communities: [], existing: [] };
  const plans = planImport("Name\nOne\n\n\nTwo\n", { name: 0 }, lk2);
  assert.deepEqual(plans.map((p) => [p.line, p.candidate?.name]), [[2, "One"], [5, "Two"]]);
});
