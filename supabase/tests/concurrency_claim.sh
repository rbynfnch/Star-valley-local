#!/usr/bin/env bash
# Two people verify DIFFERENT pending claims on the SAME business at the same instant, many times over.
# Required every round: exactly one becomes the owner, the other is told it is taken, nobody gets an error (no deadlock).
# Run by run.sh after the SQL suites (needs their fixtures).
set -uo pipefail
DB=${DB:-svl_test}
Q="psql -X -q -t -A -d $DB -v ON_ERROR_STOP=1"
T=$($Q -c "select test.id('tenantA')")
ROUNDS=${ROUNDS:-15}; BAD=0
start() { $Q -c "select (j->>'claim_id') || '|' || (j->>'secret') from (select public.claim_start('$T', '$1', '$2') as j) q"; }
for i in $(seq 1 "$ROUNDS"); do
  B=$($Q -c "insert into public.businesses (tenant_id, slug, name, status, home_community_id, primary_category_id, phone)
             values ('$T', 'race-$i-$RANDOM', 'Race $i', 'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0999') returning id")
  U1=$($Q -c "insert into auth.users (id, email) values (gen_random_uuid(), 'r1-$i-$RANDOM@example.test') returning id")
  U2=$($Q -c "insert into auth.users (id, email) values (gen_random_uuid(), 'r2-$i-$RANDOM@example.test') returning id")
  X1=$(start "$B" "$U1")
  $Q -c "update public.claims set created_at = created_at - interval '2 minutes' where business_id = '$B'" >/dev/null   # past the 60 s cooldown
  X2=$(start "$B" "$U2")
  V() { echo "select public.claim_verify('${1%%|*}', '$2', '${1##*|}')->>'result'"; }
  ( $Q -c "$(V "$X1" "$U1")" >/tmp/cc_a.out 2>&1; echo $? >/tmp/cc_a.rc ) &
  ( $Q -c "$(V "$X2" "$U2")" >/tmp/cc_b.out 2>&1; echo $? >/tmp/cc_b.rc ) &
  wait
  RA=$(cat /tmp/cc_a.rc); RB=$(cat /tmp/cc_b.rc)
  OWN=$($Q -c "select count(*) from public.business_owners where business_id = '$B'")
  NV=$(cat /tmp/cc_a.out /tmp/cc_b.out | grep -c '^verified$')
  if [ "$RA" != 0 ] || [ "$RB" != 0 ] || [ "$OWN" != 1 ] || [ "$NV" != 1 ]; then
    BAD=$((BAD + 1)); echo "round $i: rcA=$RA rcB=$RB owners=$OWN verified=$NV"; cat /tmp/cc_a.out /tmp/cc_b.out | head -4
  fi
done
if [ "$BAD" = 0 ]; then echo "ok   - concurrent claim verification: $ROUNDS rounds, exactly one owner each time, no errors"; else echo "FAIL: $BAD of $ROUNDS rounds broke the rules"; exit 1; fi
