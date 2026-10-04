-- Public read surface for commercially sensitive tables.
-- The public (anon + signed-in consumers) needs to know a business's CURRENT tier and live Featured slots,
-- but not how it got them (source: paid / founding_member / campaign / manual), who created the row, or
-- anything that is not live. Base tables listings/placements are readable only by staff and owners.
-- Views run with the owner's rights (they bypass RLS by design); the filters below ARE the policy.

create view public.public_listings with (security_barrier = true) as
select l.id, l.tenant_id, l.business_id, l.tier, l.starts_at, l.ends_at
from public.listings l
join public.businesses b on b.id = l.business_id and b.status in ('unclaimed', 'claimed')
where l.status = 'active' and l.starts_at <= now() and (l.ends_at is null or l.ends_at > now());

create view public.public_placements with (security_barrier = true) as
select p.id, p.tenant_id, p.business_id, p.slot_type, p.category_id, p.community_id, p.scope_id, p.start_at, p.end_at
from public.placements p
join public.businesses b on b.id = p.business_id and b.status in ('unclaimed', 'claimed')
where p.status = 'active' and p.start_at <= now() and p.end_at > now();

grant select on public.public_listings, public.public_placements to anon, authenticated;
