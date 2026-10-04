import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaBaseUrl, mediaUrl } from './media.ts';

const BASE = 'https://abc.supabase.co/storage/v1/object/public';
test('builds the public object URL and encodes each segment', () => {
  assert.equal(mediaUrl(BASE, 'media', 'biz/cover photo.jpg'), `${BASE}/media/biz/cover%20photo.jpg`);
  assert.equal(mediaUrl(BASE + '/', 'media', 'a.png'), `${BASE}/media/a.png`);
  assert.equal(mediaUrl('/demo-media', 'media', 'a.png'), '/demo-media/media/a.png');
});
test('hostile paths, buckets and bases become null, never a URL', () => {
  for (const p of ['../secret', 'a/../../b', '/abs', 'a//b', '', 'a/./b', 'a\\b', 'a?x=1', 'a#frag', 'javascript:alert(1)', 'a%2e%2e/b', '<img>']) assert.equal(mediaUrl(BASE, 'media', p), null, p);
  for (const b of ['me dia', '../x', 'a/b', '']) assert.equal(mediaUrl(BASE, b, 'a.png'), null, b);
  for (const base of [null, undefined, '', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x']) assert.equal(mediaUrl(base, 'media', 'a.png'), null, String(base));
});
test('base URL comes from Supabase; the override works in development only', () => {
  assert.equal(mediaBaseUrl({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/' }), BASE);
  assert.equal(mediaBaseUrl({ SVL_MEDIA_BASE_URL: '/demo-media', NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' }), '/demo-media');
  assert.equal(mediaBaseUrl({ SVL_MEDIA_BASE_URL: '/demo-media', NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NODE_ENV: 'production' }), BASE);
  assert.equal(mediaBaseUrl({}), null);
});
