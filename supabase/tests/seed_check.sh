#!/usr/bin/env bash
# Loads seed.sql into a fresh database (stub + all migrations + seed) and asserts the demo data behaves.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${SEED_DB:-svl_seed}
PSQL="psql -X -q -t -A -o /dev/null -v ON_ERROR_STOP=1 -d $DB"
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -X -q -d "$DB" -c "alter database $DB set search_path = public, extensions"
$PSQL -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do $PSQL -f "$f"; done
echo "== seed.sql"; $PSQL -f seed.sql
echo "== tests/seed_assertions.sql"; $PSQL -f tests/seed_assertions.sql 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"
