import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostCandidates, normalizeHost } from './host.ts';

test('lower-cases and strips the port', () => {
  assert.equal(normalizeHost('Star-Valley.LOCALHOST:3000'), 'star-valley.localhost');
  assert.equal(normalizeHost('starvalleylocal.com'), 'starvalleylocal.com');
  assert.equal(normalizeHost('starvalleylocal.com.'), 'starvalleylocal.com');
});
test('takes the first of a forwarded list', () => {
  assert.equal(normalizeHost('a.example.com, b.example.com'), 'a.example.com');
});
test('rejects empty and hostile values', () => {
  for (const bad of [null, undefined, '', '   ', 'exa mple.com', 'a/b', 'a.com/../x', "a.com'; drop table tenants;--", '<script>', 'a..com', '-a.com', 'a.com-', ':3000', 'x'.repeat(300)]) {
    assert.equal(normalizeHost(bad as string | null | undefined), null, String(bad));
  }
});
test('www falls back to the bare domain', () => {
  assert.deepEqual(hostCandidates('www.starvalleylocal.com'), ['www.starvalleylocal.com', 'starvalleylocal.com']);
  assert.deepEqual(hostCandidates('starvalleylocal.com'), ['starvalleylocal.com']);
  assert.deepEqual(hostCandidates(null), []);
});
