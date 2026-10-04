#!/usr/bin/env bash
# Local harness: fresh database -> stub -> all migrations -> every tests/t_*.sql.
# Usage: tests/run.sh   (needs a local Postgres 16 with a superuser reachable as $PGUSER, default postgres)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-svl_test}
PSQL="psql -X -q -t -A -o /dev/null -v ON_ERROR_STOP=1 -d $DB"
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -X -q -d "$DB" -c "alter database $DB set search_path = public, extensions"
$PSQL -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do echo "== $f"; $PSQL -f "$f"; done
for f in tests/t_*.sql; do echo "== $f"; $PSQL -f "$f" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"; done
tests/concurrency.sh
echo "ALL OK"
