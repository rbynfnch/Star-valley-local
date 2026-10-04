import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateFeatured, seededShuffle } from './rotation.ts';

const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

test('shuffle is a permutation and never mutates the input', () => {
  const copy = [...items];
  const out = seededShuffle(items, 'x');
  assert.deepEqual(items, copy);
  assert.deepEqual([...out].sort(), [...items].sort());
});
test('same seed, same order; different seed, (almost always) different', () => {
  assert.deepEqual(seededShuffle(items, 's1'), seededShuffle(items, 's1'));
  const orders = new Set(Array.from({ length: 20 }, (_, i) => seededShuffle(items, `seed-${i}`).join('')));
  assert.ok(orders.size > 10);
});
test('everyone in the same hour sees the same order; it changes between hours', () => {
  const t = new Date('2026-10-04T10:05:00Z');
  assert.deepEqual(rotateFeatured(items, 6, 'sv:home', t), rotateFeatured(items, 6, 'sv:home', new Date('2026-10-04T10:55:00Z')));
  const hours = new Set(Array.from({ length: 24 }, (_, h) => rotateFeatured(items, 6, 'sv:home', new Date(Date.UTC(2026, 9, 4, h))).join('')));
  assert.ok(hours.size > 12, 'order should change hour to hour');
});
test('FAIRNESS: over many hours every business leads about equally often', () => {
  const first = new Map<string, number>();
  for (let h = 0; h < 800; h++) {
    const lead = rotateFeatured(items, 6, 'sv:home', new Date(Date.UTC(2026, 0, 1) + h * 3600_000))[0];
    first.set(lead, (first.get(lead) ?? 0) + 1);
  }
  for (const it of items) {
    const n = first.get(it) ?? 0;
    assert.ok(n > 60 && n < 140, `${it} led ${n} of 800 hours (expected about 100)`);
  }
});
test('only `visible` are returned, fewer items than slots returns all, empty is empty', () => {
  const t = new Date('2026-10-04T10:00:00Z');
  assert.equal(rotateFeatured(items, 6, 's', t).length, 6);
  assert.equal(rotateFeatured(['a', 'b'], 6, 's', t).length, 2);
  assert.deepEqual(rotateFeatured([], 6, 's', t), []);
  assert.deepEqual(rotateFeatured(items, 0, 's', t), []);
});
test('different slots rotate independently', () => {
  const t = new Date('2026-10-04T10:00:00Z');
  const a = new Set(Array.from({ length: 10 }, (_, i) => rotateFeatured(items, 6, `slot-${i}`, t).join('')));
  assert.ok(a.size > 5);
});
