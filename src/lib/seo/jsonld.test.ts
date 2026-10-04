import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLdString, organizationJsonLd, websiteJsonLd } from './jsonld.ts';

test('cannot break out of the script tag, and still round-trips as JSON', () => {
  const evil = { name: '</script><script>alert(1)</script>', note: '<!-- x --> & \u2028 \u2029' };
  const s = jsonLdString(evil);
  for (const bad of ['</script', '<script', '<!--', '-->']) assert.ok(!s.includes(bad), bad);
  assert.deepEqual(JSON.parse(s), evil);
});
test('WebSite JSON-LD has a SearchAction with the expected template', () => {
  const j = websiteJsonLd({ name: 'Star Valley Local', url: 'https://x.example', searchUrlTemplate: 'https://x.example/businesses?q={search_term_string}' });
  assert.equal(j['@type'], 'WebSite');
  assert.equal(j.potentialAction.target.urlTemplate, 'https://x.example/businesses?q={search_term_string}');
});
test('Organization omits logo when absent', () => {
  assert.ok(!('logo' in organizationJsonLd({ name: 'N', url: 'https://x.example' })));
  assert.equal(organizationJsonLd({ name: 'N', url: 'https://x.example', logoUrl: 'https://x.example/l.png' }).logo, 'https://x.example/l.png');
});
