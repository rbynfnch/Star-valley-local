import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, groupHours, openingHoursSpecification, type HourRow } from './hours.ts';

const r = (d: number, o: string, c: string): HourRow => ({ day_of_week: d, opens: o, closes: c });
test('12-hour clock formatting, including noon and midnight edges', () => {
  assert.deepEqual(['08:00:00', '12:00:00', '00:30:00', '13:05:00', '23:59:00', '9:00'].map(formatClock), ['8:00 AM', '12:00 PM', '12:30 AM', '1:05 PM', '11:59 PM', '9:00 AM']);
});
test('no hours at all is UNKNOWN, never "closed every day"', () => assert.deepEqual(groupHours([]), { kind: 'unknown' }));
test('Mon-Fri 8-5 groups into one line, weekend is "Closed", Monday first', () => {
  const rows = [1, 2, 3, 4, 5].map((d) => r(d, '08:00:00', '17:00:00'));
  assert.deepEqual(groupHours(rows), { kind: 'known', groups: [{ label: 'Mon–Fri', text: '8:00 AM – 5:00 PM', closed: false }, { label: 'Sat & Sun', text: 'Closed', closed: true }] });
});
test('a split day lists both ranges in order; different days are not merged', () => {
  const rows = [r(1, '13:00:00', '17:00:00'), r(1, '07:00:00', '12:00:00'), r(2, '07:00:00', '12:00:00'), r(2, '13:00:00', '17:00:00'), r(3, '09:00:00', '15:00:00')];
  const g = groupHours(rows); assert.equal(g.kind, 'known');
  if (g.kind === 'known') {
    assert.equal(g.groups[0].label, 'Mon & Tue'); assert.equal(g.groups[0].text, '7:00 AM – 12:00 PM, 1:00 PM – 5:00 PM');
    assert.equal(g.groups[1].label, 'Wednesday'); assert.equal(g.groups[1].text, '9:00 AM – 3:00 PM');
    assert.equal(g.groups[2].label, 'Thu–Sun'); assert.ok(g.groups[2].closed);
  }
});
test('non-adjacent identical days stay separate (Sunday and Monday are not "Sun–Mon")', () => {
  const g = groupHours([r(0, '10:00:00', '14:00:00'), r(1, '10:00:00', '14:00:00')]);
  assert.equal(g.kind === 'known' && g.groups.filter((x) => !x.closed).map((x) => x.label).join('|'), 'Monday|Sunday');
});
test('a 7-day business: Mon-Sun', () => {
  const g = groupHours([0, 1, 2, 3, 4, 5, 6].map((d) => r(d, '06:00:00', '22:00:00')));
  assert.deepEqual(g, { kind: 'known', groups: [{ label: 'Mon–Sun', text: '6:00 AM – 10:00 PM', closed: false }] });
});
test('schema.org: days with the same hours share one specification; times are HH:MM', () => {
  const spec = openingHoursSpecification([1, 2, 3, 4, 5].map((d) => r(d, '08:00:00', '17:00:00')).concat([r(6, '09:00:00', '12:00:00')]));
  assert.deepEqual(spec, [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '17:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:00', closes: '12:00' }]);
  assert.deepEqual(openingHoursSpecification([]), []);
});
