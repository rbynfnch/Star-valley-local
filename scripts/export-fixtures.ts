// DEVELOPMENT ONLY. Exports what the ANONYMOUS role can read from a seeded local database into
// .fixtures/directory.json, for SVL_DATA_SOURCE=fixtures (see src/lib/directory/fixtures.ts).
// Usage: SVL_FIXTURE_DB=svl_seed npm run fixtures     (build the DB first: supabase/tests/seed_check.sh)
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PUBLIC_READS } from '../src/lib/directory/queries.ts';

const db = process.env.SVL_FIXTURE_DB ?? 'svl_seed';
const out: Record<string, unknown> = {};
for (const [table, columns] of Object.entries(PUBLIC_READS)) {
  const sql = `begin; set local role anon; select coalesce(jsonb_agg(t), '[]'::jsonb) from (select ${columns.join(', ')} from public.${table}) t; rollback;`;
  const r = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(`export ${table} failed:\n${r.stderr}`); process.exit(1); }
  const json = r.stdout.split('\n').find((l) => l.startsWith('['));
  out[table] = JSON.parse(json ?? '[]');
}
mkdirSync('.fixtures', { recursive: true });
writeFileSync('.fixtures/directory.json', JSON.stringify(out, null, 1));
console.log('wrote .fixtures/directory.json:', Object.entries(out).map(([k, v]) => `${k}=${(v as unknown[]).length}`).join(' '));
