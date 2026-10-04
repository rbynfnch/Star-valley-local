import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionsHref, formatEventDay, formatTimeRange, safeExternalUrl, telHref, websiteLabel } from './format.ts';

const TZ = 'America/Denver';
test('event day is computed in the tenant timezone, not the server timezone', () => {
  // 2026-10-19T03:00Z is still Oct 18 evening in Denver
  assert.deepEqual(formatEventDay(new Date('2026-10-19T03:00:00Z'), TZ), { month: 'OCT', day: '18', weekday: 'Sunday' });
  assert.equal(formatEventDay(new Date('2026-10-19T03:00:00Z'), 'UTC').day, '19');
});
test('time ranges', () => {
  assert.equal(formatTimeRange(new Date('2026-10-18T14:00:00Z'), new Date('2026-10-18T19:00:00Z'), TZ, false), '8:00 AM – 1:00 PM');
  assert.equal(formatTimeRange(new Date('2026-10-18T14:00:00Z'), null, TZ, false), '8:00 AM');
  assert.equal(formatTimeRange(new Date('2026-10-18T14:00:00Z'), null, TZ, true), 'All day');
});
test('tel links only for plausible US numbers', () => {
  assert.equal(telHref('307-555-0101'), 'tel:+13075550101');
  assert.equal(telHref('(307) 555-0101'), 'tel:+13075550101');
  assert.equal(telHref('1-307-555-0101'), 'tel:+13075550101');
  for (const bad of [null, undefined, '', '555-0101', '12345678901234', 'call us', '+44 20 7946 0958']) assert.equal(telHref(bad), null, String(bad));
});
test('directions link-out needs a street address and is URL-encoded', () => {
  const u = directionsHref({ address_line1: '110 Sample Street', city: 'Afton', state: 'WY', postal_code: '83110' })!;
  assert.match(u, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=110%20Sample%20Street%2C%20Afton%2C%20WY%2C%2083110$/);
  assert.equal(directionsHref({ address_line1: null, city: 'Afton' }), null);
  assert.ok(!directionsHref({ address_line1: 'A & B <x>', city: 'Afton' })!.includes('<'));
});
test('only http(s) URLs become links', () => {
  assert.equal(safeExternalUrl('https://sample.example/path'), 'https://sample.example/path');
  assert.equal(safeExternalUrl('http://sample.example'), 'http://sample.example/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', '//evil.example', 'not a url', '', null, undefined]) {
    assert.equal(safeExternalUrl(bad), null, String(bad));
  }
});
test('website label', () => assert.equal(websiteLabel('https://www.sample.example/x'), 'sample.example'));
