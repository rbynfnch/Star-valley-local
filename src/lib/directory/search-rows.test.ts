import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSearchRows } from './search-rows.ts';
import type { SearchRow } from './types.ts';

const row = (id: string, total: number | string) => ({ id, slug: id, name: id, total_count: total } as unknown as SearchRow & { total_count: number | string });
test('splits the total from the rows and removes it from each row', () => {
  const r = splitSearchRows([row('a', 26), row('b', 26)]);
  assert.equal(r.total, 26);
  assert.deepEqual(r.rows.map((x) => x.id), ['a', 'b']);
  assert.ok(r.rows.every((x) => !('total_count' in x)));
});
test('a bigint serialised as a string still works', () => assert.equal(splitSearchRows([row('a', '1234')]).total, 1234));
test('no rows means total 0; garbage totals never become NaN', () => {
  assert.deepEqual(splitSearchRows([]), { rows: [], total: 0 });
  assert.equal(splitSearchRows([row('a', 'x')]).total, 0);
});
