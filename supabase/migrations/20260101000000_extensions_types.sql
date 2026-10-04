-- Extensions, helper schema, enums.
-- `app` holds internal functions and is NOT exposed through the Supabase API (only `public` is).

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm   with schema extensions;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- Staff / accounts
create type public.staff_role as enum ('admin', 'sales', 'editor');

-- Directory
create type public.business_status    as enum ('prospect', 'unclaimed', 'claimed', 'archived');
create type public.verification_level as enum ('none', 'green', 'gold');
create type public.field_source       as enum ('import', 'owner', 'admin');
create type public.link_kind          as enum ('facebook','instagram','x','youtube','linkedin','tiktok',
                                                'google_business_profile','google_reviews','other');
create type public.photo_role         as enum ('logo', 'cover', 'gallery');

-- Money / inventory
create type public.listing_tier       as enum ('free', 'enhanced');
create type public.listing_status     as enum ('pending', 'active', 'expired', 'cancelled');
create type public.entitlement_source as enum ('paid', 'founding_member', 'campaign', 'manual');
create type public.slot_type          as enum ('homepage', 'category', 'community', 'things_to_do');
create type public.placement_status   as enum ('pending', 'waitlist', 'active', 'cancelled');
create type public.payment_status     as enum ('pending', 'paid', 'refunded', 'failed');
create type public.payment_channel    as enum ('stripe_payment_link', 'stripe_checkout', 'manual', 'comp');

-- Verification
create type public.proof_kind    as enum ('sms_code', 'email_link', 'postcard', 'google_business_profile', 'business_license');
create type public.claim_method  as enum ('sms_code', 'email_link', 'admin_assisted');
create type public.claim_status  as enum ('pending', 'verified', 'rejected', 'expired', 'cancelled');
create type public.postcard_status as enum ('issued', 'redeemed', 'void');

-- CRM
create type public.lead_stage       as enum ('new', 'contacted', 'interested', 'proposal', 'client', 'lost');
create type public.service_interest as enum ('website','seo_aeo','social','content','branding','advertising','full_marketing');
create type public.comm_kind        as enum ('email','call','sms','note','visit','dm','postcard','meeting');
create type public.visit_outcome    as enum ('visited','claimed_together','pitched','follow_up');

-- Consumer-facing engagement
create type public.inquiry_status    as enum ('new', 'contacted', 'in_progress', 'converted', 'lost');
create type public.submission_kind   as enum ('update', 'business', 'event');
create type public.submission_status as enum ('pending', 'approved', 'rejected', 'spam');
create type public.tracking_type     as enum ('profile_view','website_click','phone_click','directions_click',
                                              'quote_request','search_appearance','deal_view');

-- Content
create type public.content_status   as enum ('draft', 'scheduled', 'published', 'archived');
create type public.content_audience as enum ('public', 'business');   -- business = Elevartemis -> business owners
create type public.event_status     as enum ('pending', 'published', 'rejected', 'cancelled');
create type public.discount_type    as enum ('percent', 'amount', 'bogo', 'other');

-- Marketing (V3)
create type public.email_audience   as enum ('consumer', 'business');
create type public.subscriber_status as enum ('subscribed', 'unsubscribed', 'bounced', 'complained');
create type public.campaign_status  as enum ('draft', 'scheduled', 'active', 'completed', 'cancelled');
create type public.recipient_status as enum ('proposed','approved','sent','opened','clicked','accepted','declined','bounced','unsubscribed');
create type public.delivery_status  as enum ('queued','sent','delivered','opened','clicked','bounced','complained','failed');
create type public.social_status    as enum ('draft', 'approved', 'scheduled', 'posted', 'rejected');
create type public.social_platform  as enum ('facebook', 'instagram', 'google_business', 'x', 'linkedin', 'other');

create function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
