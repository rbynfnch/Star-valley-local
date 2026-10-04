-- Business detail + lead stage + communications. Fresh business, plus another tenant's business for isolation.
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, website, description)
 values ('00000000-0000-0000-0000-0000000000f1', test.id('tenantA'), 'det-one', 'Det One', 'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0801', 'https://det.example', 'Imported words');
insert into public.contacts (tenant_id, business_id, name, role, email, is_primary) values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'Pat Owner', 'Owner', 'pat@det.example', true);
insert into public.opportunities (tenant_id, business_id, service, stage) values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'website', 'contacted');
insert into public.business_links (tenant_id, business_id, kind, url) values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'facebook', 'https://facebook.com/det');
insert into public.verification_proofs (tenant_id, business_id, kind, evidence) values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'business_license', '{"license":"SECRET-12345"}');
create function test.det(b uuid default '00000000-0000-0000-0000-0000000000f1') returns jsonb language sql as $$ select public.admin_business_detail(test.id('tenantA'), b) $$;

select test.as_user(test.id('salesA'));
select test.ok(test.det()->'business'->>'name' = 'Det One' and test.det()->'business'->>'community' = 'Afton' and test.det()->'business'->>'category' is not null, 'T1: core fields with community and category names');
select test.ok(exists (select 1 from jsonb_array_elements(test.det()->'provenance') p where p->>'field' = 'phone' and p->>'source' = 'import'), 'T2: provenance lists the phone as import');
select test.ok(test.det()->'crm' is null or test.det()->'crm' = 'null'::jsonb, 'T3: no CRM row yet');
select test.ok(test.det()->'contacts'->0->>'name' = 'Pat Owner' and test.det()->'opportunities'->0->>'service' = 'website', 'T4: contacts and opportunities included');
select test.ok(test.det()->'indicators' = '{"has_website": true, "has_social": true, "has_google_profile": false}'::jsonb, 'T5: marketing indicators (website yes, social yes, google profile no)');
select test.ok(test.det()::text not like '%SECRET-12345%' and test.det()->'proofs'->0->>'kind' = 'business_license', 'T6: proofs are listed but their evidence never leaves the database');
select test.ok(test.det('00000000-0000-0000-0000-00000000dead') is null, 'T7: an unknown business is null');
select test.ok(test.det(test.id('bizB')) is null, 'T8: another tenant''s business is null, not leaked');

select test.ok(test.det()->'business'->>'home_community_id' = test.id('afton')::text and test.det()->'business'->>'primary_category_id' = test.id('catPlumb')::text, 'T8b: ids are included so the edit form can preselect them');

-- lead stage
select public.set_lead_stage(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'interested');
select test.ok(test.det()->'crm'->>'lead_stage' = 'interested', 'T9: stage set (row created)');
select test.ok(test.det()->'communications'->0->>'subject' = 'Lead stage: new → interested' and (test.det()->'communications'->0->>'by_me')::boolean, 'T10: the change is logged as a note by the caller');
select public.set_lead_stage(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'interested');
select test.ok(jsonb_array_length(test.det()->'communications') = 1, 'T11: setting the same stage again logs nothing');
select public.set_lead_stage(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'lost', '  too expensive  ');
select test.ok(test.det()->'crm'->>'lead_stage' = 'lost' and test.det()->'crm'->>'lost_reason' = 'too expensive', 'T12: lost keeps a trimmed reason');
select public.set_lead_stage(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'proposal', 'ignored');
select test.ok(test.det()->'crm'->>'lost_reason' is null, 'T13: leaving "lost" clears the reason');
select test.throws($$select public.set_lead_stage(test.id('tenantA'), test.id('bizB'), 'client')$$, 'T14: cannot set a stage on another tenant''s business', 'P0002');

-- communications
select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'visit', 'Dropped by', 'Met Pat, liked the badge', 'pitched', now() + interval '3 days');
select test.ok(test.det()->'communications'->0->>'kind' = 'visit' and test.det()->'communications'->0->>'outcome' = 'pitched' and test.det()->'communications'->0->>'follow_up_at' is not null, 'T15: visit with outcome and follow-up recorded');
select test.ok((select staff_id from public.communications where subject = 'Dropped by') = test.id('salesA'), 'T16: staff_id is the caller');
select test.throws($$select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'call')$$, 'T17: an empty entry is refused', '22023');
select test.throws($$select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'note', 'x', repeat('a', 5001))$$, 'T18: an over-long note is refused', '22001');
select test.throws($$select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'call', 'x', null, 'pitched')$$, 'T19: an outcome only goes with a visit', '22023');
select test.throws($$select public.add_communication(test.id('tenantA'), test.id('bizB'), 'note', 'x')$$, 'T20: cannot write a note on another tenant''s business', 'P0002');
select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'note', repeat('s', 500));
select test.ok((select max(length(subject)) from public.communications where subject like 'sss%') = 200, 'T21: subject is capped at 200');
select test.as_root();

-- access
select test.as_user(test.id('editorA')); select test.throws($$select test.det()$$, 'T22: editor cannot read detail', '42501');
select test.throws($$select public.set_lead_stage(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'client')$$, 'T23: editor cannot set a stage', '42501');
select test.throws($$select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'note', 'x')$$, 'T24: editor cannot add a note', '42501');
select test.as_user(test.id('owner1')); select test.throws($$select test.det()$$, 'T25: owner cannot read detail', '42501');
select test.throws($$select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'note', 'x')$$, 'T26: owner cannot add a note', '42501');
select test.as_user(test.id('adminB')); select test.throws($$select test.det()$$, 'T27: other tenant''s admin cannot read', '42501');
select test.throws($$select public.set_lead_stage(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'client')$$, 'T28: other tenant''s admin cannot set a stage', '42501');
select test.as_anon(); select test.throws($$select test.det()$$, 'T29: anon cannot', '42501');
select test.throws($$select public.add_communication(test.id('tenantA'), '00000000-0000-0000-0000-0000000000f1', 'note', 'x')$$, 'T30: anon cannot add a note', '42501');
select test.as_root();

-- an owner edit shows in provenance as owner (detail reflects who last touched the field)
insert into public.business_owners (business_id, tenant_id, user_id) values ('00000000-0000-0000-0000-0000000000f1', test.id('tenantA'), test.id('owner2'));
select test.as_user(test.id('owner2')); update public.businesses set phone = '307-555-0899' where id = '00000000-0000-0000-0000-0000000000f1'; select test.as_root();
select test.as_user(test.id('salesA'));
select test.ok(exists (select 1 from jsonb_array_elements(test.det()->'provenance') p where p->>'field' = 'phone' and p->>'source' = 'owner'), 'T31: after an owner edit, provenance says owner');
select test.as_root();
