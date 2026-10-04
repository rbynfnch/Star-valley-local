import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, canWritePlacements, safeNextPath, safeRelativePath, visibleAreas, type AdminArea, type StaffRole } from './access.ts';

const AREAS: AdminArea[] = ['dashboard', 'businesses', 'import', 'crm', 'placements', 'moderation', 'content', 'settings'];

test('admin may open everything; nobody signed in may open nothing', () => {
  for (const a of AREAS) { assert.ok(canAccess('admin', a), a); assert.ok(!canAccess(null, a)); assert.ok(!canAccess(undefined, a)); }
});
test('sales: the field-sales areas, not content or settings', () => {
  assert.deepEqual(visibleAreas('sales'), ['dashboard', 'businesses', 'import', 'crm', 'placements', 'moderation']);
});
test('editor: content and moderation only (no business or CRM data)', () => {
  assert.deepEqual(visibleAreas('editor'), ['dashboard', 'moderation', 'content']);
  assert.ok(!canAccess('editor', 'businesses') && !canAccess('editor', 'crm') && !canAccess('editor', 'import'));
});
test('only admin may change placements', () => {
  assert.ok(canWritePlacements('admin')); assert.ok(!canWritePlacements('sales')); assert.ok(!canWritePlacements('editor')); assert.ok(!canWritePlacements(null));
});
test('an unknown role string gets nothing', () => {
  for (const a of AREAS) assert.ok(!canAccess('owner' as StaffRole, a));
});
test('safeNextPath: only same-site /admin paths survive', () => {
  assert.equal(safeNextPath('/admin/businesses?status=prospect'), '/admin/businesses?status=prospect');
  assert.equal(safeNextPath('/admin'), '/admin');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '/admin/../x@evil', '%2F%2Fevil.example', 'javascript:alert(1)', '/businesses', '/administrator', '/%2F%2Fevil.example', '/admin\n/x', '', null, undefined, '/' + 'a'.repeat(400)]) {
    assert.equal(safeNextPath(bad as string), '/admin', String(bad));
  }
});
test('safeRelativePath: allowed prefixes only, with the same traversal and scheme rules', () => {
  const P = ['/list-your-business', '/account'];
  assert.equal(safeRelativePath('/list-your-business?claim=a-b', '/', P), '/list-your-business?claim=a-b');
  assert.equal(safeRelativePath('/account/sign-in', '/', P), '/account/sign-in');
  for (const bad of ['/admin', '/list-your-businessx', '//evil.example', 'https://evil.example', '/list-your-business/../admin', '/%2F%2Fevil', '/list-your-business\\x', '']) {
    assert.equal(safeRelativePath(bad, '/', P), '/', bad);
  }
});
