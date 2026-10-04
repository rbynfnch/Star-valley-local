-- DEV / DEMO SEED -- never run against production.
-- Runs automatically on `supabase db reset`. Everything is fictional: business names start with "Sample",
-- phones are in the reserved 555-01xx range, websites use the reserved .example TLD, and the demo auth
-- users cannot log in (no password). Create real dev accounts in the Supabase dashboard if you need to sign in,
-- then add them to tenant_staff.
--
-- Demonstrates every state the app must render: prospect (hidden), unclaimed Free, claimed + Green, Gold,
-- Enhanced (services/links/FAQs/deals), paid Featured, and a comped (founding member) Featured with no Enhanced.

-- ------------------------------------------------------------------------------------------ tenant
insert into public.tenants (slug, name, tagline, timezone, theme)
values ('star-valley', 'Star Valley Local', 'Know Your Valley.', 'America/Denver', '{}'::jsonb);   -- theme tokens: slice 2

insert into public.tenant_domains (domain, tenant_id, is_primary)
select 'star-valley.localhost', id, true from public.tenants where slug = 'star-valley';
insert into public.tenant_settings (tenant_id, settings)
select id, '{"consumer_sending_domain": null, "business_sending_domain": null}'::jsonb from public.tenants where slug = 'star-valley';

insert into public.regions (tenant_id, slug, name)
select id, 'star-valley', 'Star Valley' from public.tenants where slug = 'star-valley';

insert into public.communities (tenant_id, region_id, slug, name, sort_order)
select t.id, r.id, v.slug, v.name, v.ord
from public.tenants t join public.regions r on r.tenant_id = t.id and r.slug = 'star-valley',
(values ('afton','Afton',1), ('alpine','Alpine',2), ('thayne','Thayne',3), ('star-valley-ranch','Star Valley Ranch',4),
        ('etna','Etna',5), ('freedom','Freedom',6), ('grover','Grover',7), ('smoot','Smoot',8), ('bedford','Bedford',9),
        ('auburn','Auburn',10), ('fairview','Fairview',11)) as v(slug, name, ord)
where t.slug = 'star-valley';

-- ------------------------------------------------------------------------------------------ taxonomy
-- color_token values are names in src/styles/tokens.ts (categoryColors); a test checks they exist.
with t as (select id from public.tenants where slug = 'star-valley')
insert into public.categories (tenant_id, slug, name, description, color_token, sort_order)
select t.id, v.slug, v.name, v.descr, v.tok, v.ord from t, (values
  ('eat-drink', 'Eat & Drink', 'Restaurants, cafes, bars & more', 'brick', 1),
  ('home-property', 'Home & Property', 'Contractors, real estate, services', 'lake', 2),
  ('health-wellness', 'Health & Wellness', 'Medical, fitness, beauty', 'sunset', 3),
  ('family', 'Family', 'Kids, sports, activities', 'lavender', 4),
  ('outdoor', 'Outdoor', 'Adventure, recreation, lodging', 'navy', 5),
  ('shopping', 'Shopping', 'Local retail, gifts and goods', 'plum', 6),
  ('professional-services', 'Professional Services', 'Legal, finance, marketing and more', 'lake', 7)
) as v(slug, name, descr, tok, ord);

with t as (select id from public.tenants where slug = 'star-valley')
insert into public.categories (tenant_id, parent_id, slug, name, sort_order)
select t.id, p.id, v.slug, v.name, v.ord
from t cross join (values
  ('eat-drink','restaurants-cafes','Restaurants & Cafes',1), ('eat-drink','bars-breweries','Bars & Breweries',2),
  ('home-property','plumbing','Plumbing',1), ('home-property','roofing','Roofing',2), ('home-property','electrical','Electrical',3),
  ('home-property','contractors','Contractors',4), ('home-property','real-estate','Real Estate',5), ('home-property','landscaping','Landscaping',6),
  ('health-wellness','dentists','Dentists',1), ('health-wellness','medical','Medical',2), ('health-wellness','fitness','Fitness',3),
  ('health-wellness','beauty-salons','Beauty & Salons',4), ('health-wellness','pets-veterinary','Pets & Veterinary',5),
  ('family','kids-education','Kids & Education',1), ('family','child-care','Child Care',2),
  ('outdoor','outfitters-gear','Outfitters & Gear',1), ('outdoor','lodging','Lodging',2),
  ('shopping','retail-gifts','Retail & Gifts',1), ('shopping','hardware-mercantile','Hardware & Mercantile',2),
  ('professional-services','legal','Legal',1), ('professional-services','accounting-insurance','Accounting & Insurance',2),
  ('professional-services','marketing','Marketing',3)
) as v(parent, slug, name, ord)
join public.categories p on p.tenant_id = t.id and p.slug = v.parent and p.parent_id is null;

-- plural names for the SEO pages ("Plumbers in Thayne"); top-level categories keep their own name
update public.categories c set plural_name = v.plural
from (values ('restaurants-cafes','Restaurants & Cafes'), ('bars-breweries','Bars & Breweries'), ('plumbing','Plumbers'), ('roofing','Roofers'),
  ('electrical','Electricians'), ('contractors','Contractors'), ('real-estate','Real Estate Agents'), ('landscaping','Landscapers'),
  ('dentists','Dentists'), ('medical','Medical Providers'), ('fitness','Gyms & Fitness'), ('beauty-salons','Salons'),
  ('pets-veterinary','Veterinarians'), ('kids-education','Kids & Education'), ('child-care','Child Care'), ('outfitters-gear','Outfitters'),
  ('lodging','Lodging'), ('retail-gifts','Gift Shops'), ('hardware-mercantile','Hardware & General Stores'), ('legal','Lawyers'),
  ('accounting-insurance','Accountants & Insurance Agents'), ('marketing','Marketing Services')) as v(slug, plural)
where c.slug = v.slug and c.tenant_id = (select id from public.tenants where slug = 'star-valley');

insert into public.event_categories (tenant_id, slug, name, sort_order)
select t.id, v.slug, v.name, v.ord from public.tenants t, (values
  ('festivals-fairs','Festivals & Fairs',1), ('music-concerts','Music & Concerts',2), ('sports','Sports',3),
  ('food-drink','Food & Drink',4), ('arts-culture','Arts & Culture',5), ('family','Family',6), ('community','Community',7),
  ('outdoor','Outdoor',8), ('classes-workshops','Classes & Workshops',9)) as v(slug, name, ord)
where t.slug = 'star-valley';

insert into public.article_categories (tenant_id, slug, name, color_token, sort_order)
select t.id, v.slug, v.name, v.tok, v.ord from public.tenants t, (values
  ('local-news','Local News','navy',1), ('things-to-do','Things to Do','navy',2), ('guides-resources','Guides & Resources','sage',3),
  ('business-spotlights','Business Spotlights','brick',4), ('seasonal','Seasonal','slate',5), ('community','Community','sky',6)) as v(slug, name, tok, ord)
where t.slug = 'star-valley';

insert into public.tenant_products (tenant_id, code, name, kind, tier, slot_type, interval, amount_cents)
select t.id, v.code, v.name, v.kind, v.tier::public.listing_tier, v.slot::public.slot_type, v.iv, v.amt
from public.tenants t, (values
  ('enhanced_monthly', 'Enhanced (monthly)', 'listing', 'enhanced', null, 'month', 1900),
  ('enhanced_yearly',  'Enhanced (yearly)',  'listing', 'enhanced', null, 'year', 19900),
  ('featured_monthly', 'Featured placement (monthly)', 'placement', null, 'category', 'month', 4900)
) as v(code, name, kind, tier, slot, iv, amt)
where t.slug = 'star-valley';

-- ------------------------------------------------------------------------------------------ demo people (dev only)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'demo-admin@star-valley.example'),
  ('00000000-0000-4000-8000-000000000002', 'demo-sales@star-valley.example'),
  ('00000000-0000-4000-8000-000000000003', 'demo-editor@star-valley.example'),
  ('00000000-0000-4000-8000-000000000011', 'demo-owner-gold@star-valley.example'),
  ('00000000-0000-4000-8000-000000000012', 'demo-owner-green@star-valley.example'),
  ('00000000-0000-4000-8000-000000000013', 'demo-owner-featured@star-valley.example');
insert into public.tenant_staff (tenant_id, user_id, role)
select t.id, v.uid::uuid, v.role::public.staff_role from public.tenants t, (values
  ('00000000-0000-4000-8000-000000000001','admin'), ('00000000-0000-4000-8000-000000000002','sales'),
  ('00000000-0000-4000-8000-000000000003','editor')) as v(uid, role) where t.slug = 'star-valley';

-- ------------------------------------------------------------------------------------------ 30 fictional businesses
-- (slug, name, community, category, phone suffix, status, short description, price range, highlights)
create temp table seed_biz as
select * from (values
 ('sample-valley-plumbing',      'Sample Valley Plumbing',          'thayne',            'plumbing',            '0101','unclaimed','Residential and emergency plumbing across the valley.', null, array['Locally Owned','Emergency Service']),
 ('sample-high-country-roofing', 'Sample High Country Roofing',     'afton',             'roofing',             '0102','unclaimed','Roof repair, replacement and storm damage.',            null, array['Licensed & Insured','Free Estimates']),
 ('sample-aspen-electric',       'Sample Aspen Electric',           'alpine',            'electrical',          '0103','unclaimed','Wiring, panels and lighting for homes and shops.',      null, array['Licensed & Insured']),
 ('sample-cedar-ridge-builders', 'Sample Cedar Ridge Builders',     'etna',              'contractors',         '0104','unclaimed','New construction and remodels.',                        null, array['Locally Owned']),
 ('sample-willow-realty',        'Sample Willow Realty',            'afton',             'real-estate',         '0105','unclaimed','Homes, land and ranches in Star Valley.',               null, array[]::text[]),
 ('sample-green-thumb-landscape','Sample Green Thumb Landscaping',  'freedom',           'landscaping',         '0106','unclaimed','Lawn care, planting and irrigation.',                   null, array['Free Estimates']),
 ('sample-creekside-cafe',       'Sample Creekside Cafe',           'afton',             'restaurants-cafes',   '0107','unclaimed','Breakfast, coffee and baked goods.',                    1,    array['Locally Owned','Family Friendly']),
 ('sample-elk-horn-grill',       'Sample Elk Horn Grill',           'alpine',            'restaurants-cafes',   '0108','unclaimed','Burgers, steaks and local beer.',                       2,    array['Family Friendly']),
 ('sample-snake-river-brewing',  'Sample Snake River Brewing',      'alpine',            'bars-breweries',      '0109','unclaimed','Small-batch ales and a taproom.',                       2,    array['Live Music']),
 ('sample-thayne-diner',         'Sample Thayne Diner',             'thayne',            'restaurants-cafes',   '0110','unclaimed','Classic diner fare, open early.',                       1,    array[]::text[]),
 ('sample-smile-dental',         'Sample Smile Dental',             'afton',             'dentists',            '0111','unclaimed','Family dentistry and cleanings.',                       null, array['New Patients Welcome']),
 ('sample-valley-family-clinic', 'Sample Valley Family Clinic',     'afton',             'medical',             '0112','unclaimed','Primary care for all ages.',                            null, array[]::text[]),
 ('sample-peak-fitness',         'Sample Peak Fitness',             'star-valley-ranch', 'fitness',             '0113','unclaimed','Strength, cardio and group classes.',                   2,    array['Open Early']),
 ('sample-salon-twelve',         'Sample Salon Twelve',             'thayne',            'beauty-salons',       '0114','unclaimed','Cuts, color and styling.',                              2,    array[]::text[]),
 ('sample-animal-hospital',      'Sample Animal Hospital',          'star-valley-ranch', 'pets-veterinary',     '0115','unclaimed','Veterinary care for pets and livestock.',               null, array['Emergency Service']),
 ('sample-little-peaks-learning','Sample Little Peaks Learning',    'afton',             'kids-education',      '0116','unclaimed','Preschool and after-school programs.',                  null, array[]::text[]),
 ('sample-sunny-day-childcare',  'Sample Sunny Day Child Care',     'thayne',            'child-care',          '0117','unclaimed','Licensed child care.',                                  null, array['Licensed & Insured']),
 ('sample-wind-river-outfitters','Sample Wind River Outfitters',    'alpine',            'outfitters-gear',     '0118','unclaimed','Fishing, hiking and camping gear and guided trips.',    null, array['Locally Owned']),
 ('sample-lakeview-lodge',       'Sample Lakeview Lodge',           'alpine',            'lodging',             '0119','unclaimed','Cabins and rooms near the river.',                      3,    array['Pet Friendly']),
 ('sample-aspen-cabins',         'Sample Aspen Cabins',             'star-valley-ranch', 'lodging',             '0120','unclaimed','Private cabin rentals.',                                3,    array[]::text[]),
 ('sample-main-street-gifts',    'Sample Main Street Gifts',        'afton',             'retail-gifts',        '0121','unclaimed','Gifts, cards and local art.',                           2,    array['Locally Owned']),
 ('sample-valley-mercantile',    'Sample Valley Mercantile',        'afton',             'hardware-mercantile', '0122','unclaimed','Hardware, outdoor gear and home goods.',                2,    array['Locally Owned']),
 ('sample-ranch-supply',         'Sample Ranch & Farm Supply',      'etna',              'hardware-mercantile', '0123','unclaimed','Feed, fencing and farm supplies.',                      2,    array[]::text[]),
 ('sample-frontier-law',         'Sample Frontier Law',             'afton',             'legal',               '0124','unclaimed','Wills, property and small-business law.',               null, array[]::text[]),
 ('sample-ledger-tax',           'Sample Ledger Tax & Accounting',  'thayne',            'accounting-insurance','0125','unclaimed','Bookkeeping and tax preparation.',                      null, array[]::text[]),
 ('sample-northstar-insurance',  'Sample Northstar Insurance',      'afton',             'accounting-insurance','0126','unclaimed','Home, auto and farm coverage.',                         null, array[]::text[]),
 ('sample-prospect-welding',     'Sample Prospect Welding',         null,                null,                  '0127','prospect', 'Imported from a license list; awaiting review.',       null, array[]::text[]),
 ('sample-prospect-bakery',      'Sample Prospect Bakery',          null,                null,                  '0128','prospect', 'Suggested by a resident; awaiting review.',            null, array[]::text[]),
 ('sample-prospect-guides',      'Sample Prospect Guides',          null,                null,                  '0129','prospect', 'Imported from a chamber list; awaiting review.',       null, array[]::text[]),
 ('sample-prospect-auto',        'Sample Prospect Auto Repair',     null,                null,                  '0130','prospect', 'Imported; awaiting review.',                           null, array[]::text[])
) as v(slug, name, comm, cat, ph, status, descr, price, hl);

insert into public.businesses (tenant_id, slug, name, status, home_community_id, primary_category_id, phone, website,
                               address_line1, city, postal_code, short_description, price_range, highlights)
select t.id, b.slug, b.name, b.status::public.business_status, c.id, k.id, '307-555-' || b.ph,
       case when b.status = 'unclaimed' then 'https://' || b.slug || '.example' end,
       case when b.status = 'unclaimed' then (100 + (row_number() over (order by b.slug)) * 10)::text || ' Sample Street' end,
       c.name, '83110'::text, b.descr, b.price::smallint, b.hl
from public.tenants t
cross join seed_biz b
left join public.communities c on c.tenant_id = t.id and c.slug = b.comm
left join public.categories  k on k.tenant_id = t.id and k.slug = b.cat
where t.slug = 'star-valley';

-- Hours: restaurants Tue-Sat 11-21 with a Sunday brunch; everything else Mon-Fri 08-17.
insert into public.business_hours (tenant_id, business_id, day_of_week, opens, closes)
select b.tenant_id, b.id, d.dow,
       case when k.slug in ('restaurants-cafes','bars-breweries') then time '11:00' else time '08:00' end,
       case when k.slug in ('restaurants-cafes','bars-breweries') then time '21:00' else time '17:00' end
from public.businesses b
join public.categories k on k.id = b.primary_category_id
cross join lateral (select unnest(case when k.slug in ('restaurants-cafes','bars-breweries') then array[2,3,4,5,6] else array[1,2,3,4,5] end) dow) d
where b.status = 'unclaimed';

-- Multi-community service area: the plumber, roofer and electrician serve the whole valley.
insert into public.business_service_areas (tenant_id, business_id, community_id)
select b.tenant_id, b.id, c.id from public.businesses b
join public.communities c on c.tenant_id = b.tenant_id and c.id <> b.home_community_id
where b.slug in ('sample-valley-plumbing', 'sample-high-country-roofing', 'sample-aspen-electric');

-- ------------------------------------------------------------------------------------------ lifecycle demos
-- Owners link demo users; proofs derive the verification level (the DB forbids setting it directly).
insert into public.business_owners (tenant_id, business_id, user_id)
select b.tenant_id, b.id, v.uid::uuid from public.businesses b
join (values ('sample-valley-plumbing','00000000-0000-4000-8000-000000000011'),   -- Gold + Enhanced + paid Featured
             ('sample-high-country-roofing','00000000-0000-4000-8000-000000000013'), -- Green + Enhanced + paid Featured
             ('sample-creekside-cafe','00000000-0000-4000-8000-000000000012'),       -- Green, Free
             ('sample-willow-realty','00000000-0000-4000-8000-000000000012')         -- Green, comped Featured (no Enhanced)
     ) v(slug, uid) on v.slug = b.slug;

insert into public.verification_proofs (tenant_id, business_id, kind, evidence)
select b.tenant_id, b.id, v.kind::public.proof_kind, v.ev::jsonb from public.businesses b
join (values ('sample-valley-plumbing','sms_code','{}'), ('sample-valley-plumbing','postcard','{"batch":"seed"}'),
             ('sample-high-country-roofing','email_link','{}'),
             ('sample-creekside-cafe','sms_code','{}'),
             ('sample-willow-realty','sms_code','{}')) v(slug, kind, ev) on v.slug = b.slug;

insert into public.listings (tenant_id, business_id, tier, status, source, starts_at)
select b.tenant_id, b.id, 'enhanced', 'active', v.src::public.entitlement_source, now() - interval '20 days'
from public.businesses b
join (values ('sample-valley-plumbing','paid'), ('sample-high-country-roofing','paid'),
             ('sample-wind-river-outfitters','paid'), ('sample-valley-mercantile','founding_member')) v(slug, src) on v.slug = b.slug;

-- Photos (placeholder images in supabase/seed-media; with the Supabase CLI, `[storage.buckets.media] objects_path = "./seed-media"`
-- uploads them). The cafe is a FREE listing with a cover and three gallery photos: the profile shows only ONE of them.
insert into public.media_assets (tenant_id, business_id, storage_bucket, storage_path, alt_text, width, height)
select b.tenant_id, b.id, 'media', v.path, v.alt, v.w, v.h from public.businesses b
join (values
  ('sample-valley-plumbing', 'demo/plumber-logo.png',  'Sample Valley Plumbing logo', 200, 200),
  ('sample-valley-plumbing', 'demo/plumber-cover.png', 'A plumbing van parked in front of a mountain', 1600, 500),
  ('sample-valley-plumbing', 'demo/plumber-g1.png',    'Technician repairing a water heater', 800, 600),
  ('sample-valley-plumbing', 'demo/plumber-g2.png',    'A freshly installed water heater', 800, 600),
  ('sample-valley-plumbing', 'demo/plumber-g3.png',    'The crew at a job site', 800, 600),
  ('sample-creekside-cafe',  'demo/cafe-cover.png',    'The cafe dining room in morning light', 1600, 500),
  ('sample-creekside-cafe',  'demo/cafe-g1.png',       'A breakfast plate', 800, 600),
  ('sample-creekside-cafe',  'demo/cafe-g2.png',       'Fresh baked goods', 800, 600),
  ('sample-creekside-cafe',  'demo/cafe-g3.png',       'The patio', 800, 600)) v(slug, path, alt, w, h) on v.slug = b.slug;
insert into public.business_photos (tenant_id, business_id, media_asset_id, role, sort_order)
select m.tenant_id, m.business_id, m.id,
       case when m.storage_path like '%logo%' then 'logo'::public.photo_role when m.storage_path like '%cover%' then 'cover'::public.photo_role else 'gallery'::public.photo_role end,
       coalesce(nullif(substring(m.storage_path from 'g(\d)\.png$'), '')::int, 0)
from public.media_assets m;

-- Long descriptions, highlights and a public email are ENHANCED-only on the profile (the Free ones below stay short).
update public.businesses set
  description = 'Sample Valley Plumbing is a fictional business used to demonstrate an Enhanced profile. It offers residential and commercial plumbing, water heater installation and repair, drain cleaning and leak detection across Star Valley, with emergency service available.',
  email = 'hello@sample-valley-plumbing.example', hours_note = 'Emergency service available 24/7'
where slug = 'sample-valley-plumbing';
update public.businesses set
  description = 'Sample High Country Roofing is a fictional business. It repairs and replaces roofs and handles storm damage for homes and shops throughout the valley.',
  email = 'office@sample-high-country-roofing.example'
where slug = 'sample-high-country-roofing';
update public.businesses set description = 'A fictional cafe. Because it is a FREE listing, this long description is NOT shown on its profile; only the short description is.',
  email = 'hi@sample-creekside-cafe.example' where slug = 'sample-creekside-cafe';

insert into public.business_services (tenant_id, business_id, name, sort_order)
select b.tenant_id, b.id, v.name, v.ord from public.businesses b
join (values ('sample-valley-plumbing','Water heaters',1), ('sample-valley-plumbing','Drain cleaning',2), ('sample-valley-plumbing','Leak detection',3),
             ('sample-high-country-roofing','Roof repair',1), ('sample-high-country-roofing','Roof replacement',2), ('sample-high-country-roofing','Storm damage',3),
             ('sample-wind-river-outfitters','Guided fishing trips',1), ('sample-wind-river-outfitters','Gear rental',2),
             ('sample-valley-mercantile','Hardware',1), ('sample-valley-mercantile','Outdoor gear',2)) v(slug, name, ord) on v.slug = b.slug;

insert into public.business_links (tenant_id, business_id, kind, url)
select b.tenant_id, b.id, v.kind::public.link_kind, v.url from public.businesses b
join (values ('sample-valley-plumbing','facebook','https://facebook.example/sample-valley-plumbing'),
             ('sample-valley-plumbing','instagram','https://instagram.example/sample-valley-plumbing'),
             ('sample-high-country-roofing','facebook','https://facebook.example/sample-high-country-roofing')) v(slug, kind, url) on v.slug = b.slug;

insert into public.business_faqs (tenant_id, business_id, question, answer, sort_order)
select b.tenant_id, b.id, v.q, v.a, v.ord from public.businesses b
join (values ('sample-valley-plumbing','Do you offer emergency service?','Yes. Call any time for urgent leaks and no-heat situations.',1),
             ('sample-valley-plumbing','Which communities do you serve?','All of Star Valley, from Alpine to Fairview.',2),
             ('sample-high-country-roofing','Do you give free estimates?','Yes, for residential and commercial roofs.',1)) v(slug, q, a, ord) on v.slug = b.slug;

-- Featured: two paid (need Enhanced + verified), one comped founding member with NO Enhanced listing.
insert into public.placements (tenant_id, business_id, slot_type, category_id, community_id, start_at, end_at, source, status)
select b.tenant_id, b.id, v.slot::public.slot_type,
       case when v.slot = 'category'  then b.primary_category_id end,
       case when v.slot = 'community' then b.home_community_id end,
       now() - interval '5 days', now() + interval '25 days', v.src::public.entitlement_source, 'active'
from public.businesses b
join (values ('sample-valley-plumbing','homepage','paid'), ('sample-valley-plumbing','category','paid'),
             ('sample-high-country-roofing','community','paid'),
             ('sample-willow-realty','homepage','founding_member')) v(slug, slot, src) on v.slug = b.slug;

-- Waitlist example: Enhanced but not yet verified -> waits, consumes nothing.
insert into public.placements (tenant_id, business_id, slot_type, category_id, start_at, end_at, source, status)
select b.tenant_id, b.id, 'category', b.primary_category_id, now(), now() + interval '30 days', 'paid', 'waitlist'
from public.businesses b where b.slug = 'sample-wind-river-outfitters';

-- ------------------------------------------------------------------------------------------ CRM
insert into public.business_crm (tenant_id, business_id, lead_stage, services_interest, next_action, next_action_at)
select b.tenant_id, b.id, v.stage::public.lead_stage, v.svc::public.service_interest[], v.next, now() + (v.days || ' days')::interval
from public.businesses b
join (values ('sample-valley-plumbing','client','{website,seo_aeo}','Quarterly check-in',60),
             ('sample-high-country-roofing','proposal','{social,content}','Send proposal',3),
             ('sample-creekside-cafe','interested','{social}','Follow up after visit',5),
             ('sample-elk-horn-grill','contacted','{website}','Call back',2),
             ('sample-prospect-welding','new','{}','Visit in person',7)) v(slug, stage, svc, next, days) on v.slug = b.slug;

insert into public.contacts (tenant_id, business_id, name, role, phone, is_primary)
select b.tenant_id, b.id, 'Sample Owner', 'Owner', '307-555-' || right(b.phone, 4), true
from public.businesses b where b.slug in ('sample-valley-plumbing', 'sample-high-country-roofing', 'sample-creekside-cafe');

insert into public.communications (tenant_id, business_id, kind, outcome, subject, body, occurred_at)
select b.tenant_id, b.id, 'visit', 'pitched', 'In-person visit', 'Walked through Enhanced and Featured options.', now() - interval '3 days'
from public.businesses b where b.slug = 'sample-creekside-cafe';

-- ------------------------------------------------------------------------------------------ content
insert into public.authors (tenant_id, name, bio)
select t.id, v.name, v.bio from public.tenants t, (values
  ('Sample Staff Writer', 'Fictional author for demo content.'), ('Sample Guest Contributor', 'Fictional author for demo content.')) v(name, bio)
where t.slug = 'star-valley';

insert into public.articles (tenant_id, slug, title, excerpt, body_md, status, publish_at, category_id, author_id, read_minutes, featured_rank, audience, spotlight_business_id)
select t.id, v.slug, v.title, v.excerpt, v.body, 'published', now() - (v.days || ' days')::interval,
       (select id from public.article_categories where tenant_id = t.id and slug = v.cat),
       (select id from public.authors where tenant_id = t.id and name = v.author),
       v.mins, v.fr, v.aud::public.content_audience,
       (select id from public.businesses where tenant_id = t.id and slug = v.spot)
from public.tenants t, (values
  ('ten-things-to-do-this-weekend','10 Things to Do in Star Valley This Weekend','A sample guide to making the most of the weekend.','Sample article body. Replace with real content.','things-to-do','Sample Staff Writer',2,2,1,'public',null),
  ('sample-business-spotlight','Sample Valley Plumbing: Serving the Whole Valley','A sample Business Spotlight.','Sample spotlight body.','business-spotlights','Sample Staff Writer',4,2,null,'public','sample-valley-plumbing'),
  ('fall-hiking-guide','The Ultimate Guide to Fall Hiking in Star Valley','Trails, what to pack, and safety tips.','Sample guide body.','guides-resources','Sample Guest Contributor',6,3,null,'public',null),
  ('sample-owner-marketing-tips','5 Marketing Tips for Small Business Owners','Elevartemis resources for business owners.','Owner-only sample body.','guides-resources','Sample Staff Writer',8,3,null,'business',null)
) as v(slug, title, excerpt, body, cat, author, days, mins, fr, aud, spot)
where t.slug = 'star-valley';

insert into public.article_items (tenant_id, article_id, position, title, body, business_id)
select a.tenant_id, a.id, v.pos, v.title, v.body, (select id from public.businesses where tenant_id = a.tenant_id and slug = v.biz)
from public.articles a, (values
  (1,'Hike the Salt River Range','Sample item text.',null), (2,'Visit the Farmers Market','Sample item text.','sample-main-street-gifts'),
  (3,'Catch a high school football game','Sample item text.',null), (4,'Explore local shops','Sample item text.','sample-valley-mercantile')) v(pos, title, body, biz)
where a.slug = 'ten-things-to-do-this-weekend';

insert into public.community_events (tenant_id, slug, title, description, status, community_id, category_id, venue_name, starts_at, ends_at, rrule)
select t.id, v.slug, v.title, v.descr, 'published',
       (select id from public.communities where tenant_id = t.id and slug = v.comm),
       (select id from public.event_categories where tenant_id = t.id and slug = v.cat),
       v.venue,
       (date_trunc('day', now() at time zone t.timezone) + (v.days || ' days')::interval + v.start_t) at time zone t.timezone,   -- wall-clock times in the TENANT's timezone
       (date_trunc('day', now() at time zone t.timezone) + (v.days || ' days')::interval + v.end_t) at time zone t.timezone, v.rr
from public.tenants t, (values
  ('sample-farmers-market','Sample Farmers Market','Weekly produce and crafts.','afton','food-drink','Sample Town Square',1,interval '8 hours',interval '13 hours','FREQ=WEEKLY;BYDAY=SA'),
  ('sample-pumpkin-fest','Sample Pumpkin Festival','Family harvest festival.','etna','festivals-fairs','Sample Fairgrounds',6,interval '10 hours',interval '16 hours',null),
  ('sample-football-night','Sample Friday Night Football','Home game.','afton','sports','Sample Stadium',3,interval '19 hours',interval '21 hours',null),
  ('sample-craft-fair','Sample Fall Craft Fair','Local makers and food trucks.','alpine','arts-culture','Sample Civic Center',9,interval '10 hours',interval '16 hours',null),
  ('sample-trivia-night','Sample Trivia Night','Weekly trivia at the taproom.','alpine','community','Sample Snake River Brewing',2,interval '19 hours',interval '21 hours','FREQ=WEEKLY;BYDAY=TU')
) as v(slug, title, descr, comm, cat, venue, days, start_t, end_t, rr)
where t.slug = 'star-valley';

insert into public.deals (tenant_id, business_id, title, description, discount_type, discount_value, status, starts_at, ends_at)
select b.tenant_id, b.id, v.title, v.descr, v.dt::public.discount_type, v.val, 'published', now() - interval '2 days', now() + (v.days || ' days')::interval
from public.businesses b
join (values ('sample-valley-plumbing','20% off water heater tune-up','Sample deal.','percent',20,30),
             ('sample-wind-river-outfitters','$10 off gear rental','Sample deal.','amount',10,45),
             ('sample-valley-mercantile','Buy 1 get 1 on select items','Sample deal.','bogo',null,20)) v(slug, title, descr, dt, val, days) on v.slug = b.slug;
