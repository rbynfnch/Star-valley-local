-- Public submissions + moderation. Visitors can only create PENDING rows through the service-role function; staff review them.
-- (test.as_service() is defined in t_16_claim.sql; suites share one database.)
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone) values
 ('00000000-0000-0000-0000-0000000000a1', test.id('tenantA'), 'sub-live', 'Sub Live', 'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0701'),
 ('00000000-0000-0000-0000-0000000000a2', test.id('tenantA'), 'sub-hidden', 'Sub Hidden', 'prospect', null, null, null),
 ('00000000-0000-0000-0000-0000000000a3', test.id('tenantA'), 'sub-capped', 'Sub Capped', 'unclaimed', test.id('afton'), test.id('catPlumb'), null);
create function test.sub(k public.submission_kind, b uuid, p jsonb, n text default null, e text default null, ph text default null) returns uuid language sql as $$
  select public.submission_create(test.id('tenantA'), k, b, p, n, e, ph) $$;
create function test.subrow(id uuid, col text) returns text language plpgsql security definer as $$ declare r text; begin execute format('select %I::text from public.submissions where id = $1', col) into r using id; return r; end $$;
create function test.rev(id uuid, a text, notes text default null, apply boolean default false, force boolean default false) returns jsonb language sql as $$ select public.review_submission(test.id('tenantA'), id, a, notes, apply, force) $$;
create temp table sk (k text primary key, v uuid); grant all on sk to public;
create function test.keepid(k text, v uuid) returns void language sql as $$ insert into sk values (k, v) on conflict (k) do update set v = excluded.v $$;
create function test.kid(k text) returns uuid language sql as $$ select v from sk where sk.k = $1 $$;
create function test.future(days int) returns text language sql as $$ select (now() + make_interval(days => days))::text $$;

select test.as_service();
-- ---- creating: updates
select test.keepid('u1', test.sub('update', '00000000-0000-0000-0000-0000000000a1',
  '{"fields":{"phone":"  307-555-0999 ","website":"https://new.example","hours":"Mon-Fri 8-5","name":""},"note":"  New number  "}', '  Pat  ', '  Pat@Example.COM ', '307-555-0000'));
select test.as_root();
select test.ok(test.subrow(test.kid('u1'), 'status') = 'pending' and test.subrow(test.kid('u1'), 'kind') = 'update', 'U1: a new submission is pending');
select test.ok((select payload from public.submissions where id = test.kid('u1')) = '{"fields": {"phone": "307-555-0999", "hours": "Mon-Fri 8-5", "website": "https://new.example"}, "note": "New number"}'::jsonb, 'U2: payload is trimmed, empty values dropped, only whitelisted fields kept');
select test.ok(test.subrow(test.kid('u1'), 'submitter_email') = 'pat@example.com' and test.subrow(test.kid('u1'), 'submitter_name') = 'Pat', 'U3: submitter name trimmed, email lower-cased');
select test.as_service();
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{"phone":"1"},"status":"approved"}')$$, 'U4: an unknown top-level key is refused', '22023');
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{"verification_level":"gold"}}')$$, 'U5: an unknown field key is refused', '22023');
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{"phone":"1","verification_level":"gold"}}')$$, 'U5b: a forbidden field next to a valid one is still refused, not silently dropped', '22023');
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{},"note":"  "}')$$, 'U6: nothing to change is refused', '22023');
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a2', '{"note":"x"}')$$, 'U7: a hidden prospect cannot be the subject of an update', 'P0002');
select test.throws($$select test.sub('update', test.id('bizB'), '{"note":"x"}')$$, 'U8: another tenant''s business is not found', 'P0002');
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{"website":"javascript:alert(1)"}}')$$, 'U9: a javascript: website is refused', '22023');
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"note":"x"}', null, 'not-an-email')$$, 'U10: a malformed email is refused', '22023');
select test.ok(test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"closed":true}') is not null, 'U11: "this business has closed" alone is a valid update');
select test.ok(test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"note":"x","closed":"yes please"}') is not null, 'U12: a non-"true" closed value is simply ignored');
select test.as_root();
select test.ok((select count(*) from public.submissions where payload ? 'closed' and payload->>'closed' <> 'true') = 0, 'U13: closed is only ever stored as true');
-- cap per business
select test.as_service();
do $$ begin for i in 1..10 loop perform test.sub('update', '00000000-0000-0000-0000-0000000000a3', jsonb_build_object('note', 'n' || i)); end loop; end $$;
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a3', '{"note":"eleventh"}')$$, 'U14: more than 10 pending updates for one business is refused', '53400');

-- ---- creating: businesses
select test.keepid('b1', test.sub('business', '00000000-0000-0000-0000-0000000000a1',
  jsonb_build_object('name', ' Sub New Bakery ', 'phone', '307-555-0801', 'address_line1', '5 Oak St', 'city', 'Thayne', 'category_text', 'Bakery', 'community_id', test.id('thayne'), 'category_id', test.id('catEat'), 'description', 'Sourdough', 'note', 'Opened last spring'),
  'Robin', 'robin@example.com', '307-555-0802'));
select test.as_root();
select test.ok(test.subrow(test.kid('b1'), 'business_id') is null, 'U15: a suggested business is not tied to any existing business');
select test.ok((select payload->>'name' from public.submissions where id = test.kid('b1')) = 'Sub New Bakery', 'U16: name trimmed');
select test.as_service();
select test.throws($$select test.sub('business', null, '{"name":"X"}')$$, 'U17: a suggested business needs an email to follow up', '22023');
select test.throws($$select test.sub('business', null, '{"phone":"1"}', null, 'a@b.co')$$, 'U18: a suggested business needs a name', '22023');
select test.throws($$select test.sub('business', null, jsonb_build_object('name', 'X', 'community_id', test.id('tcommB')), null, 'a@b.co')$$, 'U19: a community from another tenant is refused', '22023');
select test.throws($$select test.sub('business', null, '{"name":"X","website":"ftp://x.example"}', null, 'a@b.co')$$, 'U20: a non-http website is refused', '22023');

-- ---- creating: events
select test.keepid('e1', test.sub('event', null, jsonb_build_object('title', 'Sub Summer Fair', 'description', 'Pies', 'starts_at', test.future(20), 'ends_at', (now() + interval '20 days 3 hours')::text, 'venue_name', 'Town Park', 'community_id', test.id('afton'), 'url', 'https://fair.example', 'organizer', 'Fair Committee', 'all_day', true), 'Sam', 'sam@example.com'));
select test.as_root();
select test.ok((select payload->>'title' from public.submissions where id = test.kid('e1')) = 'Sub Summer Fair' and (select payload->>'all_day' from public.submissions where id = test.kid('e1')) = 'true', 'U21: event stored with canonical fields');
select test.as_service();
select test.throws($$select test.sub('event', null, jsonb_build_object('starts_at', test.future(3)), null, 'a@b.co')$$, 'U22: an event needs a title', '22023');
select test.throws($$select test.sub('event', null, jsonb_build_object('title', 'T', 'starts_at', test.future(3)))$$, 'U23: an event needs an email', '22023');
select test.throws($$select test.sub('event', null, '{"title":"T"}', null, 'a@b.co')$$, 'U24: an event needs a start time', '22023');
select test.throws($$select test.sub('event', null, '{"title":"T","starts_at":"banana"}', null, 'a@b.co')$$, 'U25: an invalid start time is refused', '22023');
select test.throws($$select test.sub('event', null, jsonb_build_object('title', 'T', 'starts_at', (now() - interval '3 days')::text), null, 'a@b.co')$$, 'U26: an event that started days ago is refused', '22023');
select test.throws($$select test.sub('event', null, jsonb_build_object('title', 'T', 'starts_at', test.future(900)), null, 'a@b.co')$$, 'U27: an event more than two years away is refused', '22023');
select test.throws($$select test.sub('event', null, jsonb_build_object('title', 'T', 'starts_at', test.future(10), 'ends_at', test.future(9)), null, 'a@b.co')$$, 'U28: an event cannot end before it starts', '22023');
select test.throws($$select test.sub('event', null, jsonb_build_object('title', 'T', 'starts_at', test.future(10), 'url', 'javascript:x'), null, 'a@b.co')$$, 'U29: a javascript: link is refused', '22023');
select test.throws($$select test.sub('update', '00000000-0000-0000-0000-0000000000a1', '[1]')$$, 'U30: a non-object payload is refused', '22023');
select test.as_root();
select test.as_service();
select test.keepid('long', test.sub('business', null, jsonb_build_object('name', repeat('n', 500), 'note', repeat('x', 5000), 'description', repeat('d', 5000)), repeat('p', 300), 'long@example.com'));
select test.as_root();
select test.ok((select length(payload->>'name') from public.submissions where id = test.kid('long')) = 200 and (select length(payload->>'note') from public.submissions where id = test.kid('long')) = 1000
               and (select length(payload->>'description') from public.submissions where id = test.kid('long')) = 500 and length(test.subrow(test.kid('long'), 'submitter_name')) = 100, 'U31: every text field is length-capped');

-- ---- creating: volume caps
select test.as_service();
select test.sub('business', null, '{"name":"Cap One"}', null, 'cap@example.com'); select test.sub('business', null, '{"name":"Cap Two"}', null, 'cap@example.com');
select test.sub('business', null, '{"name":"Cap Three"}', null, 'cap@example.com'); select test.sub('business', null, '{"name":"Cap Four"}', null, 'CAP@example.com');
select test.sub('business', null, '{"name":"Cap Five"}', null, 'cap@example.com');
select test.throws($$select test.sub('business', null, '{"name":"Cap Six"}', null, 'cap@example.com')$$, 'U32: more than 5 submissions per email per day is refused (case-insensitive)', '53400');
select test.as_root();
insert into public.submissions (tenant_id, kind, payload) select test.id('tenantA'), 'business', '{"name":"filler"}' from generate_series(1, 200);
select test.as_service();
select test.throws($$select test.sub('business', null, '{"name":"One more"}', null, 'fresh@example.com')$$, 'U33: the per-tenant daily cap stops floods', '53400');
select test.as_root();
delete from public.submissions where payload->>'name' = 'filler';

-- ---- who may create
select test.as_user(test.id('adminA'));
select test.throws($$select test.sub('business', null, '{"name":"X"}', null, 'a@b.co')$$, 'U34: not even staff can call submission_create', '42501');
select test.as_user(test.id('consumer'));
select test.throws($$select test.sub('business', null, '{"name":"X"}', null, 'a@b.co')$$, 'U35: a signed-in visitor cannot call it directly', '42501');
select test.as_anon();
select test.throws($$select test.sub('business', null, '{"name":"X"}', null, 'a@b.co')$$, 'U36: anon cannot call it', '42501');
select test.throws($$insert into public.submissions (tenant_id, kind, payload) values (test.id('tenantA'), 'business', '{}')$$, 'U37: anon cannot insert directly either', '42501');
select test.as_root();

-- ---- listing
select test.as_user(test.id('editorA'));
select test.ok((public.admin_list_submissions(test.id('tenantA'))->>'total')::int >= 5, 'L1: an editor can list the pending queue');
select test.ok((public.admin_list_submissions(test.id('tenantA'))->'pending_by_kind') ? 'update' and (public.admin_list_submissions(test.id('tenantA'))->'pending_by_kind') ? 'event', 'L2: counts per kind are included');
select test.ok((select bool_and(r->>'kind' = 'event') from jsonb_array_elements(public.admin_list_submissions(test.id('tenantA'), 'pending', 'event')->'rows') r), 'L3: the kind filter works');
select test.ok((select (r->>'business_name') from jsonb_array_elements(public.admin_list_submissions(test.id('tenantA'), 'pending', 'update', 100)->'rows') r where r->>'id' = test.kid('u1')::text) = 'Sub Live', 'L4: an update shows the business it is about');
select test.ok(jsonb_array_length(public.admin_list_submissions(test.id('tenantA'), 'pending', null, 2, 0)->'rows') = 2 and jsonb_array_length(public.admin_list_submissions(test.id('tenantA'), 'pending', null, 2, 1000)->'rows') = 0, 'L5: paging');
select test.ok((select (r->>'created_at')::timestamptz from jsonb_array_elements(public.admin_list_submissions(test.id('tenantA'), 'pending', null, 100)->'rows') r limit 1) <= (select max((r->>'created_at')::timestamptz) from jsonb_array_elements(public.admin_list_submissions(test.id('tenantA'), 'pending', null, 100)->'rows') r), 'L6: pending is oldest first');
select test.as_user(test.id('owner1')); select test.throws($$select public.admin_list_submissions(test.id('tenantA'))$$, 'L7: an owner cannot list the queue', '42501');
select test.as_user(test.id('adminB')); select test.throws($$select public.admin_list_submissions(test.id('tenantA'))$$, 'L8: another tenant''s admin cannot', '42501');
select test.as_anon(); select test.throws($$select public.admin_list_submissions(test.id('tenantA'))$$, 'L9: anon cannot', '42501');

-- ---- reviewing
select test.as_user(test.id('editorA'));
select test.ok(test.rev(test.kid('u1'), 'reject', '  not accurate  ')->>'result' = 'rejected', 'R1: an editor can reject');
select test.as_root();
select test.ok(test.subrow(test.kid('u1'), 'status') = 'rejected' and test.subrow(test.kid('u1'), 'reviewed_by') = test.id('editorA')::text and test.subrow(test.kid('u1'), 'resolution_notes') = 'not accurate' and test.subrow(test.kid('u1'), 'reviewed_at') is not null, 'R2: review is recorded: who, when, notes (trimmed)');
select test.as_user(test.id('editorA'));
select test.throws($$select test.rev(test.kid('u1'), 'approve')$$, 'R3: a reviewed submission cannot be reviewed again', '22023');
select test.throws($$select test.rev(gen_random_uuid(), 'reject')$$, 'R4: an unknown submission is not found', 'P0002');
select test.throws($$select test.rev(test.kid('b1'), 'delete')$$, 'R5: an unknown action is refused', '22023');
select test.as_root();
-- an update to apply
select test.as_service();
select test.keepid('u2', test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{"phone":"(307) 555-0777","website":"https://applied.example","hours":"By appointment","city":"Afton"},"note":"moved"}', 'Lee', 'lee@example.com'));
select test.keepid('u3', test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{"phone":"(307) 555-0666"}}'));
select test.keepid('u4', test.sub('update', '00000000-0000-0000-0000-0000000000a1', '{"fields":{"phone":"(307) 555-0555"}}'));
select test.as_user(test.id('salesA'));
select test.ok(test.rev(test.kid('u3'), 'approve')->>'result' = 'approved', 'R6: approving without "apply" marks it approved');
select test.as_root();
select test.ok((select phone from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = '307-555-0701', 'R7: and does NOT change the business');
select test.as_user(test.id('editorA'));
select test.throws($$select test.rev(test.kid('u2'), 'approve', null, true)$$, 'R8: an editor cannot apply changes to a business', '22023');
select test.as_user(test.id('salesA'));
create temp table rr as select test.rev(test.kid('u2'), 'approve', 'thanks', true) as r; grant all on rr to public;
select test.as_root();
select test.ok((select r->'applied' from rr) = '["city", "phone", "website"]'::jsonb, 'R9: sales can apply; hours (free text) are never applied automatically');
select test.ok((select phone from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = '(307) 555-0777' and (select website from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = 'https://applied.example' and (select city from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = 'Afton', 'R10: the suggested values are now on the business');
select test.ok((select source from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'phone') = 'admin', 'R11: applied changes are recorded as staff edits (imports cannot overwrite them)');
select test.ok(exists (select 1 from public.communications where business_id = '00000000-0000-0000-0000-0000000000a1' and subject = 'Suggested update applied'), 'R12: the CRM log shows it');
-- spam by sales
select test.as_user(test.id('salesA'));
select test.ok(test.rev(test.kid('u4'), 'spam')->>'result' = 'spam', 'R13: sales can mark spam');
select test.as_root();
select test.ok((select phone from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = '(307) 555-0777', 'R14: spam changes nothing');

-- business suggestions
select test.as_user(test.id('editorA'));
select test.throws($$select test.rev(test.kid('b1'), 'approve')$$, 'R15: an editor cannot add a business', '22023');
select test.as_user(test.id('salesA'));
create temp table rb as select test.rev(test.kid('b1'), 'approve') as r; grant all on rb to public;
select test.as_root();
select test.ok((select r->>'result' from rb) = 'approved' and (select status from public.businesses where id = (select (r->>'business_id')::uuid from rb)) = 'prospect', 'R16: approving a business suggestion creates a HIDDEN prospect');
select test.ok((select name || '|' || phone || '|' || home_community_id::text || '|' || primary_category_id::text from public.businesses where id = (select (r->>'business_id')::uuid from rb)) = 'Sub New Bakery|307-555-0801|' || test.id('thayne')::text || '|' || test.id('catEat')::text, 'R17: the prospect carries the suggested details');
select test.ok(test.subrow(test.kid('b1'), 'business_id') = (select r->>'business_id' from rb), 'R18: the submission links to the prospect');
select test.ok(exists (select 1 from public.communications where business_id = (select (r->>'business_id')::uuid from rb) and body like '%robin@example.com%' and body like '%Bakery%' and body like '%Opened last spring%'), 'R19: the CRM log keeps who suggested it and what they said');
-- duplicates
select test.as_service();
select test.keepid('b2', test.sub('business', null, '{"name":"Sub New Bakery","phone":"(307) 555-0801"}', null, 'dup@example.com'));
select test.as_user(test.id('adminA'));
create temp table rd as select test.rev(test.kid('b2'), 'approve') as r; grant all on rd to public;
select test.as_root();
select test.ok((select r->>'result' from rd) = 'duplicate' and (select r->>'business_name' from rd) = 'Sub New Bakery', 'R20: a likely duplicate is reported, not created');
select test.ok(test.subrow(test.kid('b2'), 'status') = 'pending', 'R21: and the submission stays pending');
select test.as_user(test.id('adminA'));
select test.ok(test.rev(test.kid('b2'), 'approve', null, false, true)->>'result' = 'approved', 'R22: staff can force it (admin may add businesses)');
select test.as_root();
select test.ok((select count(*) from public.businesses where name = 'Sub New Bakery' and tenant_id = test.id('tenantA')) = 2 and (select count(distinct slug) from public.businesses where name = 'Sub New Bakery') = 2, 'R23: the forced copy gets its own slug');

-- events
select test.as_user(test.id('salesA'));
select test.throws($$select test.rev(test.kid('e1'), 'approve')$$, 'R24: sales cannot publish an event', '22023');
select test.as_user(test.id('editorA'));
create temp table re as select test.rev(test.kid('e1'), 'approve') as r; grant all on re to public;
select test.as_root();
select test.ok((select r->>'result' from re) = 'approved' and (select status from public.community_events where id = (select (r->>'event_id')::uuid from re)) = 'published', 'R25: an editor approves an event and it is published');
select test.ok((select title || '|' || venue_name || '|' || submitted_by_email || '|' || all_day::text from public.community_events where id = (select (r->>'event_id')::uuid from re)) = 'Sub Summer Fair|Town Park|sam@example.com|true', 'R26: the event carries the submitted details and who sent it');
select test.ok((select description from public.community_events where id = (select (r->>'event_id')::uuid from re)) like '%Pies%' and (select description from public.community_events where id = (select (r->>'event_id')::uuid from re)) like '%Organizer: Fair Committee%', 'R27: the organizer is kept in the description');
create temp table e1p as select jsonb_build_object('title', 'Sub Summer Fair', 'starts_at', payload->>'starts_at') as p from public.submissions where id = test.kid('e1'); grant all on e1p to public;
select test.as_service();
select test.keepid('e2', test.sub('event', null, (select p from e1p), null, 'sam@example.com'));
select test.as_user(test.id('adminA'));
select test.rev(test.kid('e2'), 'approve');
select test.as_root();
select test.ok((select count(distinct slug) from public.community_events where title = 'Sub Summer Fair') = 2, 'R28: two events with the same title and day get different slugs');

-- who may review
select test.as_service();
select test.keepid('x1', test.sub('business', null, '{"name":"Access Probe"}', null, 'probe@example.com'));
select test.as_user(test.id('owner1'));  select test.throws($$select test.rev(test.kid('x1'), 'reject')$$, 'R29: an owner cannot review', '42501');
select test.as_user(test.id('consumer')); select test.throws($$select test.rev(test.kid('x1'), 'reject')$$, 'R30: a consumer cannot review', '42501');
select test.as_user(test.id('adminB'));  select test.throws($$select test.rev(test.kid('x1'), 'reject')$$, 'R31: another tenant''s admin cannot review', '42501');
select test.as_anon(); select test.throws($$select test.rev(test.kid('x1'), 'reject')$$, 'R32: anon cannot review', '42501');
select test.as_root();
select test.ok(test.subrow(test.kid('x1'), 'status') = 'pending', 'R33: nothing changed');
