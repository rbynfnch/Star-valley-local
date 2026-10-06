#!/usr/bin/env bash
# Sets up a HOSTED Supabase project for Star Valley Local: applies every migration (once each), optionally loads the demo seed, registers the
# site's domain for the Star Valley tenant, and creates the public `media` storage bucket.
#
#   DATABASE_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres' \
#     bash scripts/hosted/setup.sh [--seed] [--domain my-site.vercel.app]
#
# Safe to run again: applied migrations are recorded in public._applied_migrations and skipped. The seed only loads into an empty database.
# Never run the local test harness (supabase/tests/00_supabase_stub.sql) against a hosted project: Supabase already has those roles and schemas.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Set DATABASE_URL to your Supabase connection string (Project settings > Database > Connection string, URI)}"
command -v psql >/dev/null || { echo "psql is not installed or not on your PATH"; exit 1; }

SEED=0; DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) SEED=1 ;;
    --domain) DOMAIN="$(echo "${2:?--domain needs a value}" | tr 'A-Z' 'a-z')"; shift ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac; shift
done
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL")   # -d, not a bare argument: psql on Windows stops reading options after the first bare argument

echo "== connecting"; "${PSQL[@]}" -t -A -c "select 'connected to ' || current_database() || ' as ' || current_user" 
"${PSQL[@]}" -c "create table if not exists public._applied_migrations (name text primary key, applied_at timestamptz not null default now()); alter table public._applied_migrations enable row level security;"

for f in supabase/migrations/*.sql; do
  name="$(basename "$f")"
  done_already="$("${PSQL[@]}" -t -A -c "select 1 from public._applied_migrations where name = '$name'")"
  if [ "$done_already" = "1" ]; then echo "   skip  $name"; continue; fi
  echo "== applying $name"
  if ! out="$("${PSQL[@]}" --single-transaction -f "$f" 2>&1)"; then echo "$out"; echo "FAILED: $name (nothing from this file was applied; fix the problem and run the script again)"; exit 1; fi
  echo "$out" | grep -v "NOTICE" || true
  "${PSQL[@]}" -c "insert into public._applied_migrations (name) values ('$name')"
done

# The photo bucket is created by the content-editor migration (public read, 5 MB, images only; writes only through the server's service key).
ok="$("${PSQL[@]}" -t -A -c "select count(*) from storage.buckets where id = 'media' and public")"
[ "$ok" = "1" ] && echo "== storage bucket 'media' is ready" || { echo "storage bucket 'media' is missing or not public"; exit 1; }

if [ "$SEED" = "1" ]; then
  has="$("${PSQL[@]}" -t -A -c "select count(*) from public.tenants")"
  if [ "$has" != "0" ]; then echo "== seed skipped: the database already has a tenant"; else echo "== loading demo seed"; "${PSQL[@]}" --single-transaction -f supabase/seed.sql; fi
fi

if [ -n "$DOMAIN" ]; then
  "${PSQL[@]}" -v domain="$DOMAIN" <<'SQL'
insert into public.tenant_domains (domain, tenant_id, is_primary)
select :'domain', t.id, false from public.tenants t where t.slug = 'star-valley'
on conflict (domain) do nothing;
SQL
  echo "== domain registered: $DOMAIN"
fi
echo "== done"
