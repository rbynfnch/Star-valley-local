import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedRrule, upcomingOccurrences, zonedToUtc, type RecurringEvent } from './recurrence.ts';

const TZ = 'America/Denver';
const ev = (o: Partial<RecurringEvent> = {}): RecurringEvent => ({ starts_at: '2026-10-03T14:00:00Z', ends_at: '2026-10-03T19:00:00Z', rrule: null, recurrence_until: null, exdates: [], ...o });
const local = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(d);

test('one-off events: upcoming yes, past no, in-progress yes', () => {
  const e = ev();
  assert.equal(upcomingOccurrences(e, new Date('2026-10-01T00:00:00Z'), 5, TZ).length, 1);
  assert.equal(upcomingOccurrences(e, new Date('2026-10-04T00:00:00Z'), 5, TZ).length, 0);
  assert.equal(upcomingOccurrences(e, new Date('2026-10-03T16:00:00Z'), 5, TZ).length, 1);
});

test('weekly on Saturday: next four, all Saturdays at 8:00 local, duration preserved', () => {
  const e = ev({ rrule: 'FREQ=WEEKLY;BYDAY=SA' });   // 2026-10-03 is a Saturday, 8:00 MDT
  const occ = upcomingOccurrences(e, new Date('2026-10-04T00:00:00Z'), 4, TZ);
  assert.deepEqual(occ.map((o) => local(o.start)), ['Sat, Oct 10, 08:00', 'Sat, Oct 17, 08:00', 'Sat, Oct 24, 08:00', 'Sat, Oct 31, 08:00']);
  assert.ok(occ.every((o) => o.end!.getTime() - o.start.getTime() === 5 * 3600_000));
});

test('DST: a weekly 8:00 event stays at 8:00 local after the clocks change on 2026-11-01', () => {
  const e = ev({ rrule: 'FREQ=WEEKLY;BYDAY=SA' });
  const occ = upcomingOccurrences(e, new Date('2026-10-25T00:00:00Z'), 3, TZ);
  assert.deepEqual(occ.map((o) => local(o.start)), ['Sat, Oct 31, 08:00', 'Sat, Nov 7, 08:00', 'Sat, Nov 14, 08:00']);
  assert.equal(occ[0].start.toISOString(), '2026-10-31T14:00:00.000Z');   // MDT = UTC-6
  assert.equal(occ[1].start.toISOString(), '2026-11-07T15:00:00.000Z');   // MST = UTC-7
});

test('weekly with several days and an interval: exact dates', () => {
  // Tue Oct 6 08:00 local, every second week on Tue and Thu: Oct 6, 8, (skip a week) 20, 22, Nov 3
  const e = ev({ rrule: 'FREQ=WEEKLY;BYDAY=TU,TH;INTERVAL=2', starts_at: '2026-10-06T14:00:00Z', ends_at: null });
  const occ = upcomingOccurrences(e, new Date('2026-10-01T00:00:00Z'), 5, TZ);
  assert.deepEqual(occ.map((o) => local(o.start)), ['Tue, Oct 6, 08:00', 'Thu, Oct 8, 08:00', 'Tue, Oct 20, 08:00', 'Thu, Oct 22, 08:00', 'Tue, Nov 3, 08:00']);
});

test('daily and monthly', () => {
  const d = upcomingOccurrences(ev({ rrule: 'FREQ=DAILY', ends_at: null }), new Date('2026-10-04T00:00:00Z'), 3, TZ);
  assert.deepEqual(d.map((o) => local(o.start)), ['Sun, Oct 4, 08:00', 'Mon, Oct 5, 08:00', 'Tue, Oct 6, 08:00']);
  const m = upcomingOccurrences(ev({ rrule: 'FREQ=MONTHLY', starts_at: '2026-01-31T15:00:00Z', ends_at: null }), new Date('2026-02-01T00:00:00Z'), 3, TZ);
  assert.deepEqual(m.map((o) => local(o.start).split(',')[1].trim().split(' ')[0]), ['Mar', 'May', 'Jul']);   // months without a 31st are skipped
});

test('until and exdates are honoured', () => {
  const e = ev({ rrule: 'FREQ=WEEKLY;BYDAY=SA', recurrence_until: '2026-10-20T00:00:00Z', exdates: ['2026-10-10T14:00:00Z'] });
  const occ = upcomingOccurrences(e, new Date('2026-10-04T00:00:00Z'), 10, TZ);
  assert.deepEqual(occ.map((o) => local(o.start)), ['Sat, Oct 17, 08:00']);
});

test('occurrences before the first start are never produced', () => {
  const e = ev({ rrule: 'FREQ=WEEKLY;BYDAY=SA', starts_at: '2026-10-17T14:00:00Z', ends_at: null });
  const occ = upcomingOccurrences(e, new Date('2026-10-01T00:00:00Z'), 2, TZ);
  assert.deepEqual(occ.map((o) => local(o.start)), ['Sat, Oct 17, 08:00', 'Sat, Oct 24, 08:00']);
});

test('unsupported rules fall back to the event start, they never loop or lie', () => {
  for (const r of ['FREQ=MONTHLY;BYSETPOS=1;BYDAY=SA', 'FREQ=YEARLY', 'FREQ=WEEKLY;BYMONTH=10', 'garbage', 'FREQ=WEEKLY;INTERVAL=0', 'FREQ=DAILY;BYDAY=MO']) {
    assert.equal(isSupportedRrule(r), false, r);
    const occ = upcomingOccurrences(ev({ rrule: r }), new Date('2026-10-01T00:00:00Z'), 5, TZ);
    assert.equal(occ.length, 1, r);
  }
  assert.equal(isSupportedRrule(null), true);
});

test('zonedToUtc handles both sides of the DST change', () => {
  assert.equal(zonedToUtc({ y: 2026, m: 10, d: 31, h: 8, mi: 0 }, TZ).toISOString(), '2026-10-31T14:00:00.000Z');
  assert.equal(zonedToUtc({ y: 2026, m: 11, d: 1, h: 12, mi: 0 }, TZ).toISOString(), '2026-11-01T19:00:00.000Z');
  assert.equal(zonedToUtc({ y: 2026, m: 3, d: 8, h: 12, mi: 0 }, TZ).toISOString(), '2026-03-08T18:00:00.000Z');
});
