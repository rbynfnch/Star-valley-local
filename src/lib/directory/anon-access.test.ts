import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PUBLIC_READS } from './queries.ts';

// Runs every table/column the public site reads AS THE ANONYMOUS DATABASE ROLE against a seeded database.
// This is what stands in for PostgREST locally: a permission error here would be a runtime error in production.
// Needs a local Postgres with the migrations + supabase/seed.sql applied (supabase/tests/seed_check.sh builds `svl_seed`).
// Override the database with SVL_TEST_DB. Skips (with the reason) when no database is reachable.
const db = process.env.SVL_TEST_DB ?? 'svl_seed';
function psql(sql: string) {
  return spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { encoding: 'utf8' });
}
const reachable = psql('select 1').status === 0;
const skip = reachable ? false : `no reachable Postgres database "${db}" (run supabase/tests/seed_check.sh, or set SVL_TEST_DB)`;

for (const [table, columns] of Object.entries(PUBLIC_READS)) {
  test(`anon can read public.${table}(${columns.length} columns)`, { skip }, () => {
    const r = psql(`begin; set local role anon; select ${columns.join(', ')} from public.${table} limit 1; rollback;`);
    assert.equal(r.status, 0, r.stderr);
  });
}

test('the seed gives the home page something to show, as anon', { skip }, () => {
  const n = (sql: string) => Number(psql(`begin; set local role anon; ${sql}; rollback;`).stdout.trim().split('\n').find((l) => /^\d+$/.test(l)));
  assert.ok(n('select count(*) from public.categories where parent_id is null') >= 7);
  assert.ok(n(`select count(*) from public.public_placements where slot_type = 'homepage'`) >= 1);
  assert.ok(n(`select count(*) from public.community_events where status = 'published'`) >= 3);
});

test('anon cannot read what it must not (guard against widening the public surface)', { skip }, () => {
  for (const t of ['listings', 'placements', 'business_crm', 'contacts', 'leads', 'payments', 'notifications', 'account_credits', 'tracking_events']) {
    const r = psql(`begin; set local role anon; select 1 from public.${t} limit 1; rollback;`);
    assert.notEqual(r.status, 0, `anon unexpectedly read public.${t}`);
    assert.match(r.stderr, /permission denied/);
  }
});
