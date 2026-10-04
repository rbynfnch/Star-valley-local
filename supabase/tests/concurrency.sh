#!/usr/bin/env bash
# Two sessions race for the LAST slot in a category. Exactly one must win.
# Run by run.sh after the SQL suites (needs their fixtures). Not a t_*.sql because it needs two sessions.
set -uo pipefail
DB=${DB:-svl_test}
Q="psql -X -q -t -A -d $DB -v ON_ERROR_STOP=1"
CAT=$($Q -c "select test.id('catEat')"); T=$($Q -c "select test.id('tenantA')")
$Q -c "delete from public.placements where category_id='$CAT' and business_id in (test.id('biz3'),test.id('biz4'),test.id('biz5'))" >/dev/null   # rerunnable
$Q -c "update public.placement_limits set max_slots = 3 where tenant_id = '$T' and slot_type = 'category'" >/dev/null   # independent of other suites
# catEat limit is 3 and biz6 already holds one; add a second so exactly ONE slot is left.
$Q -c "select test.place(test.id('biz3'), 'category', '$CAT', now(), now() + interval '30 days')" >/dev/null
INS() { echo "insert into public.placements (tenant_id,business_id,slot_type,category_id,start_at,end_at,source,status)
         values ('$T', test.id('$1'), 'category', '$CAT', now(), now() + interval '30 days', 'paid', 'active')"; }
# session A holds its transaction open (and the advisory lock) for 2s before committing
( $Q -c "begin; $(INS biz4); select pg_sleep(2); commit;" >/tmp/conc_a.out 2>&1; echo $? >/tmp/conc_a.rc ) &
sleep 0.7
( $Q -c "$(INS biz5)" >/tmp/conc_b.out 2>&1; echo $? >/tmp/conc_b.rc ) &
wait
A=$(cat /tmp/conc_a.rc); B=$(cat /tmp/conc_b.rc)
N=$($Q -c "select count(*) from public.placements where category_id='$CAT' and status='active' and business_id in (test.id('biz3'),test.id('biz4'),test.id('biz5'),test.id('biz6'))")
echo "session A rc=$A, session B rc=$B, active in catEat=$N"
ONE_WON=0; if { [ "$A" = 0 ] && [ "$B" != 0 ]; } || { [ "$A" != 0 ] && [ "$B" = 0 ]; }; then ONE_WON=1; fi
if [ "$N" = "3" ] && [ "$ONE_WON" = 1 ]; then
  echo "ok   - concurrent activations: exactly one wins the last slot"; grep -h 'inventory full' /tmp/conc_[ab].out | head -1
else
  echo "FAIL: concurrency (limit breached or both rejected)"; cat /tmp/conc_a.out /tmp/conc_b.out; exit 1
fi
