-- Admin business detail + the first two CRM writes (lead stage, notes/visits). Sales and admin only; raise for anyone else.
-- Detail returns one jsonb document (null when the business is not in that tenant). It deliberately omits
-- verification_proofs.evidence (can hold license numbers) and any owner contact data beyond what staff entered as contacts.
create function public.admin_business_detail(p_tenant uuid, p_business uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_res jsonb;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'legal_name', b.legal_name, 'status', b.status,
      'community', co.name, 'category', ca.name,
      'address_line1', b.address_line1, 'address_line2', b.address_line2, 'city', b.city, 'state', b.state, 'postal_code', b.postal_code,
      'phone', b.phone, 'website', b.website, 'email', b.email, 'short_description', b.short_description, 'description', b.description,
      'hours_note', b.hours_note, 'google_place_id', b.google_place_id,
      'verification_level', b.verification_level, 'verified_at', b.verified_at, 'reverify_due_at', b.reverify_due_at, 'claimed_at', b.claimed_at,
      'created_at', b.created_at, 'updated_at', b.updated_at),
    'provenance', coalesce((select jsonb_agg(jsonb_build_object('field', s.field_name, 'source', s.source, 'updated_at', s.updated_at,
                                                               'updated_by_me', s.updated_by is not distinct from (select auth.uid())) order by s.field_name)
                             from public.business_field_sources s where s.business_id = b.id), '[]'::jsonb),
    'crm', (select jsonb_build_object('lead_stage', c.lead_stage, 'services_interest', to_jsonb(c.services_interest), 'next_action', c.next_action,
                                     'next_action_at', c.next_action_at, 'lost_reason', c.lost_reason)
              from public.business_crm c where c.business_id = b.id),
    'listing', (select jsonb_build_object('tier', l.tier, 'status', l.status, 'source', l.source, 'starts_at', l.starts_at, 'ends_at', l.ends_at)
                  from public.listings l where l.business_id = b.id order by (l.status = 'active') desc, l.starts_at desc limit 1),
    'placements', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'slot_type', p.slot_type, 'scope', coalesce(pc.name, pm.name), 'status', p.status,
                                                                'source', p.source, 'start_at', p.start_at, 'end_at', p.end_at) order by p.start_at desc)
                             from public.placements p left join public.categories pc on pc.id = p.category_id left join public.communities pm on pm.id = p.community_id
                             where p.business_id = b.id), '[]'::jsonb),
    'proofs', coalesce((select jsonb_agg(jsonb_build_object('kind', v.kind, 'verified_at', v.verified_at, 'revoked_at', v.revoked_at) order by v.verified_at desc)
                         from public.verification_proofs v where v.business_id = b.id), '[]'::jsonb),
    'owners', (select count(*) from public.business_owners o where o.business_id = b.id),
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'role', k.role, 'email', k.email, 'phone', k.phone, 'is_primary', k.is_primary)
                                           order by k.is_primary desc, k.name) from public.contacts k where k.business_id = b.id), '[]'::jsonb),
    'opportunities', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'service', o.service, 'stage', o.stage, 'value_cents', o.value_cents, 'expected_close', o.expected_close)
                                               order by o.created_at desc) from public.opportunities o where o.business_id = b.id), '[]'::jsonb),
    'communications', coalesce((select jsonb_agg(q.item order by q.occurred_at desc) from (
        select jsonb_build_object('id', m.id, 'kind', m.kind, 'outcome', m.outcome, 'subject', m.subject, 'body', m.body, 'follow_up_at', m.follow_up_at,
                                  'occurred_at', m.occurred_at, 'by_me', m.staff_id is not distinct from (select auth.uid())) as item, m.occurred_at
          from public.communications m where m.business_id = b.id order by m.occurred_at desc limit 50) q), '[]'::jsonb),
    'indicators', jsonb_build_object(
      'has_website', b.website is not null,
      'has_social', exists (select 1 from public.business_links bl where bl.business_id = b.id and bl.kind in ('facebook', 'instagram', 'x', 'youtube', 'linkedin', 'tiktok')),
      'has_google_profile', b.google_place_id is not null
                            or exists (select 1 from public.business_links bl where bl.business_id = b.id and bl.kind = 'google_business_profile'))
  ) into v_res
  from public.businesses b
  left join public.communities co on co.id = b.home_community_id
  left join public.categories ca on ca.id = b.primary_category_id
  where b.id = p_business and b.tenant_id = p_tenant;
  return v_res;
end $$;

-- Lead stage: upserts the account-level CRM row and leaves an audit note in the communications log.
create function public.set_lead_stage(p_tenant uuid, p_business uuid, p_stage public.lead_stage, p_lost_reason text default null) returns void
language plpgsql security invoker set search_path = public as $$
declare v_old public.lead_stage; v_reason text := left(nullif(btrim(coalesce(p_lost_reason, '')), ''), 500);
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then
    raise exception 'business not found' using errcode = 'P0002';
  end if;
  select lead_stage into v_old from public.business_crm where business_id = p_business;
  insert into public.business_crm (business_id, tenant_id, lead_stage, lost_reason)
    values (p_business, p_tenant, p_stage, case when p_stage = 'lost' then v_reason end)
    on conflict (business_id) do update set lead_stage = excluded.lead_stage, lost_reason = excluded.lost_reason;
  if v_old is distinct from p_stage then
    insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
      values (p_tenant, p_business, 'note', 'Lead stage: ' || coalesce(v_old::text, 'new') || ' → ' || p_stage, v_reason, (select auth.uid()));
  end if;
end $$;

-- Notes, calls, visits, DMs... The staff member is always the caller (never taken from the client).
create function public.add_communication(
  p_tenant uuid, p_business uuid, p_kind public.comm_kind, p_subject text default null, p_body text default null,
  p_outcome public.visit_outcome default null, p_follow_up_at timestamptz default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_subject text := left(nullif(btrim(coalesce(p_subject, '')), ''), 200); v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then
    raise exception 'business not found' using errcode = 'P0002';
  end if;
  if v_subject is null and v_body is null and p_outcome is null then raise exception 'nothing to record' using errcode = '22023'; end if;
  if v_body is not null and length(v_body) > 5000 then raise exception 'note is too long (5000 characters max)' using errcode = '22001'; end if;
  if p_outcome is not null and p_kind <> 'visit' then raise exception 'an outcome only applies to a visit' using errcode = '22023'; end if;
  insert into public.communications (tenant_id, business_id, kind, outcome, subject, body, follow_up_at, staff_id)
    values (p_tenant, p_business, p_kind, p_outcome, v_subject, v_body, p_follow_up_at, (select auth.uid()))
    returning id into v_id;
  return v_id;
end $$;

revoke all on function public.admin_business_detail(uuid, uuid) from public, anon;
revoke all on function public.set_lead_stage(uuid, uuid, public.lead_stage, text) from public, anon;
revoke all on function public.add_communication(uuid, uuid, public.comm_kind, text, text, public.visit_outcome, timestamptz) from public, anon;
grant execute on function public.admin_business_detail(uuid, uuid) to authenticated, service_role;
grant execute on function public.set_lead_stage(uuid, uuid, public.lead_stage, text) to authenticated, service_role;
grant execute on function public.add_communication(uuid, uuid, public.comm_kind, text, text, public.visit_outcome, timestamptz) to authenticated, service_role;
