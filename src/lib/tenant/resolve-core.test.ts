import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantFor } from './resolve-core.ts';
import type { Tenant } from '../directory/types.ts';

const mk = (slug: string): Tenant => ({ id: `id-${slug}`, slug, name: slug, tagline: null, logo_path: null, theme: {}, timezone: 'America/Denver' });
const sv = mk('star-valley'); const tv = mk('teton-valley');
const domains: Record<string, Tenant> = { 'starvalleylocal.com': sv, 'tetonvalleylocal.com': tv, 'star-valley.localhost': sv };
const calls: string[][] = [];
const data = {
  async tenantByHost(c: string[]) { calls.push(c); for (const d of c) if (domains[d]) return domains[d]; return null; },
  async tenantBySlug(s: string) { return [sv, tv].find((t) => t.slug === s) ?? null; },
};
const prod = { isProduction: true }; const dev = { isProduction: false, defaultSlug: 'star-valley' };

test('each registered domain resolves to ITS tenant (multi-tenant isolation at the front door)', async () => {
  assert.equal((await resolveTenantFor(data, 'starvalleylocal.com', prod))?.slug, 'star-valley');
  assert.equal((await resolveTenantFor(data, 'TetonValleyLocal.com:443', prod))?.slug, 'teton-valley');
});
test('www falls back to the bare domain', async () => {
  assert.equal((await resolveTenantFor(data, 'www.tetonvalleylocal.com', prod))?.slug, 'teton-valley');
});
test('PRODUCTION: an unknown host is null (404) even if a default slug is configured', async () => {
  assert.equal(await resolveTenantFor(data, 'evil.example', { isProduction: true, defaultSlug: 'star-valley' }), null);
  assert.equal(await resolveTenantFor(data, null, { isProduction: true, defaultSlug: 'star-valley' }), null);
});
test('DEVELOPMENT: an unknown host falls back to the default slug; none configured means null', async () => {
  assert.equal((await resolveTenantFor(data, 'localhost:3000', dev))?.slug, 'star-valley');
  assert.equal(await resolveTenantFor(data, 'localhost:3000', { isProduction: false }), null);
});
test('a registered host always beats the dev default', async () => {
  assert.equal((await resolveTenantFor(data, 'tetonvalleylocal.com', dev))?.slug, 'teton-valley');
});
test('hostile Host headers never reach the database lookup as anything but a clean hostname', async () => {
  calls.length = 0;
  await resolveTenantFor(data, "x.com'; drop table tenants;--", prod);
  await resolveTenantFor(data, '', prod);
  assert.ok(calls.every((c) => c.length === 0), 'invalid hosts must produce no lookup candidates');
});
