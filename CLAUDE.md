# Star Valley Local — Build Directive

## 1. What we're building
A local business directory and community resource for Star Valley, Wyoming (Afton, Alpine, Thayne, Etna, Freedom, Grover, Smoot, Bedford, Star Valley Ranch, Auburn, Fairview, etc.).

- **Public brand:** Star Valley Local (consumer-facing, community-serving).
- **Operator:** Elevartemis (a marketing agency). The admin side doubles as Elevartemis's CRM and lead-generation engine. Keep the public site feeling like a community resource, never an agency disguised as a directory.
- **Business goals (both, in parallel):** generate local traffic AND start earning revenue as early as possible.

## 2. Architecture principle (read first)
**Build a reusable multi-tenant local discovery platform. Star Valley is tenant #1.** Future tenants (e.g., Teton Valley Local, Bear Lake Local) must not require rebuilding.

- Every table that holds tenant data carries `tenant_id` from day one. Enforce isolation with Postgres row-level security.
- Hierarchy: Tenant → Region → Community → Business.
- Tenant-specific branding (name, logo, colors, domain) lives in a `tenants` config, not hard-coded.

## 3. Stack (default unless we agree otherwise)
- Next.js (App Router, TypeScript), Tailwind
- Postgres via Supabase (auth, RLS, storage)
- Stripe (Payment Links first, full billing later)
- Resend or Postmark for email, with **separate sending subdomains** for consumer vs. business mail
- Search: Postgres full-text (upgrade to Meilisearch only if needed)
- Twilio (or similar) for SMS verification codes

## 4. Phasing
**V1 — Launchable (build now)**
- Public site: home, directory search, category pages, community pages, category × community pages, business profiles, events, deals, "Things to Do" / weekend guide, article pages
- Claim and verify flow
- "Suggest an Update" and "Suggest a Business" (the latter creates a prospect record)
- "Submit an Event" form
- Lean admin that doubles as simple CRM (see §8)
- Event tracking (see §9)
- Stripe Payment Links + admin "mark as paid / activate placement" (sell before the dashboard exists)

**V2 — Revenue self-serve**
- Business owner dashboard (profile editing, photos, deals, leads, analytics, upgrade, billing)
- Self-serve Stripe billing and Featured purchase with live inventory
- Leads inbox

**V3 — Media engine**
- Newsletter engine (two separate audiences), campaign automation, social scheduling, Business Spotlights

**Schema rule:** V2/V3 tables (placements, campaigns, articles, newsletters, leads) should exist in the V1 schema even if no UI uses them yet.

## 5. Core data model decisions
1. **Business ≠ Listing.** A `business` is a real-world entity that exists whether or not claimed. A `listing` is what's displayed (tier, status, dates). Prospects, claimed businesses, and paying clients are the same table in different states.
2. **Featured is a time-bound placement, not a flag.** `placements`: id, tenant_id, business_id, slot_type (homepage | category | community | things_to_do), scope_id (category or community, nullable), start_at, end_at, source (paid | founding_member | campaign | manual), status. Inventory limits, expiry, free trials, and waitlists are queries over this table. Never add an `is_featured` boolean.
3. **Field-level provenance.** Each editable field (phone, hours, description, etc.) records `source` (import | owner | admin), `updated_at`, and `updated_by`. Re-imports must never overwrite owner or admin edits.
4. **Multi-community service area.** A business has one home community and may serve many (a Thayne plumber serving the whole valley).
5. **Structured hours** (per-day open/close ranges), not free text.
6. **Business → People → Opportunities → Communications.** CRM entities: `contacts` (people attached to a business with role), `opportunities` (service interest + pipeline stage), `communications` (emails, calls, notes, visits).
7. **Account types:** consumer (optional; save businesses/events/deals), business (owner of one or more businesses), admin (Elevartemis staff).

## 6. Business rules (locked decisions)

### Tiers and products
- **Free listing:** name, category, community, address, phone, website, hours, short description. Shows **Call, Website, Directions** buttons only.
- **Enhanced (subscription, ~$19/mo or ~$199/yr):** more photos, services list, social links, deals, and the **Request a Quote** button and lead inbox.
- **Featured (scarce placement, ~$49/mo):** can only be bought **on top of Enhanced** and only if **verified**. Limited inventory per placement: **6 homepage, 3 per category, 4 per community, 6 Things to Do** (make these configurable per tenant).
- **No Premium tier for now.** Possibly a bundle later.
- Pricing page shows live scarcity ("2 of 3 plumbing spots remaining") and a waitlist when full.
- Rotate display order among featured businesses when more exist than visible slots, so no one is permanently on top.
- Expiry is automatic; send a renewal reminder 14 days before end.

### Request a Quote
Show the button **only** on paid listings (Enhanced and up). Never show a form whose submissions the owner won't receive.

### Verification ladder (clean, non-overlapping)
- **Unclaimed**
- **Green Verified:** claimed and confirmed by SMS code to the listing's phone, or by emailed claim link.
- **Gold Verified:** Green plus one additional proof: postcard with unique code (QR), Google Business Profile match, or business license check.
- Show the annual re-verification date only once verified.

### Reviews
**No native reviews.** No Reviews tab, no star-rating storage. Link out to Google reviews where the terms allow. (Mockup shows ratings and a Reviews tab; remove them.)

### Not shown
- **No distance ("5.2 mi") and no "Open now"** anywhere. Use community labels instead. Still store structured hours for the profile's hours display.

## 7. Data acquisition
- **Do not build on scraped or unlicensed data. Do not scrape Google or Yelp.** Google Places terms generally restrict long-term storage; if used at all, store only the place ID and fetch fresh. Check current terms before using.
- Import skeleton records from: Wyoming Secretary of State filings, chamber of commerce and town business license lists, OpenStreetMap, manual CSV curation by us, and Suggest-a-Business submissions.
- Build a CSV import tool with column mapping, dedupe (name + address/phone fuzzy match), and per-field provenance.
- Lifecycle: **unclaimed → claim → verify → enrich**.

## 8. Admin / CRM (V1, lean)
We have few email addresses, so launch outreach is **in-person, phone, postcard, and social DM**. Design the admin to be **mobile-friendly for field sales**.

Required views:
- **Dashboard counts:** total businesses, verified, Enhanced, Featured, needing verification, prospects.
- **Business list:** filter by community, category, status, tier, lead stage; bulk actions.
- **Business detail:** profile data with provenance, verification status, tier, placements, contacts, notes, communications log, opportunities, marketing opportunity indicators (website, social, Google profile).
- **Lead stage:** New → Contacted → Interested → Proposal → Client → Lost.
- **Potential services checklist:** Website, SEO/AEO, Social, Content, Branding, Advertising, Full Marketing.
- **Field-visit mode:** quick actions "visited / claimed together / pitched / follow up," with notes and photo.
- **Claim tools:** generate SMS or email claim link; generate postcard code batch for printing.
- **Placements manager:** inventory by slot, who's in each, expiry dates, waitlist, "mark as paid / activate / comp (founding member)."
- **Moderation queues:** Suggest an Update, Suggest a Business, Submit an Event, claim requests.
- **Content:** simple CRUD for articles, events, deals (V1), newsletters later.
- An admin design mockup is pending; follow it when provided.

## 9. Event tracking (V1, even without owner UI)
Log from day one, per business and per tenant: profile view, website click, phone click, directions click, quote request, search appearance (with query), deal view. Store as an append-only `events` table. This powers the V2 analytics dashboard and our sales pitch ("your listing got 212 views and 14 calls last month"). Exclude bots and admin traffic.

## 10. Public site requirements
- Pages per the design mockups (home, directory, business profile, events, deals, things-to-do article, mobile).
- **SEO is the long-term traffic engine:** auto-generate category × community pages ("Plumbers in Thayne"), schema.org `LocalBusiness` (and `Event`, `Article`) JSON-LD, clean sitemaps, canonical URLs, fast server-rendered pages. Structured, answer-ready content also supports AEO.
- **Retention content from V1:** weekend guide, events (recurring-event support), deals. Residents need a reason to return.
- **Owner-driven distribution:** verified businesses get a downloadable "Verified on Star Valley Local" badge/graphic and embed snippet linking to their profile.
- Accessibility: WCAG 2.1 AA. Mobile-first.

## 11. Email and messaging compliance
- Two separate sending subdomains and audiences: consumer newsletter vs. business outreach. A resident must never get marketing mail; a business owner must not get consumer mail unless opted in.
- All marketing email: physical address, working unsubscribe, honor suppression list. Cold B2B is allowed in the US under these rules.
- SMS: one-time verification codes only (transactional). No marketing SMS without explicit opt-in.
- Social posting is **approval-based** (draft + approve), starting via a scheduler or generated copy/images, not direct Meta API integration.

## 12. Campaign engine (V3, design the schema now)
Semi-automated first: the system proposes the next N candidates ranked by a priority score (verified, target category/community, profile completeness, email available, previously featured recently, etc.), and an admin approves the send. Campaign = target categories/communities, offer (e.g., 3 months Featured free), deadline, slot count, email sequence, auto-expand audience if slots remain. Do not make it fully autonomous until we've learned what predicts acceptance.

## 13. Design
- Mockups for public pages and the business dashboard are in `/design` (admin mockup to follow). Match layout, hierarchy, and component styles.
- Extract colors, type, and spacing from the mockups into design tokens (Tailwind theme + CSS variables, per-tenant overridable). Logo: mountain-and-sun wordmark "STAR VALLEY LOCAL," recolored to the new palette.
- Tone: professional, friendly, modern, community-minded.
- Where mockups conflict with this document (reviews, distance, open now, Premium tier, overlapping verified states, quote button on free listings), **this document wins.**

## 14. Working agreements
- Start by proposing a repo structure, schema (SQL migrations), and RLS policies for review **before** building UI.
- Build in small vertical slices; seed realistic Star Valley sample data (communities, categories, ~30 sample businesses).
- Write migrations, not ad-hoc schema changes. Include tests for placement inventory logic, verification state transitions, and tenant isolation.
- Keep secrets in env vars; provide `.env.example`.
- Ask before adding paid third-party services or new dependencies beyond §3.

## 15. Suggested first slices
1. Schema + RLS + seed data + tenant config
2. Public directory: home, search, category/community pages, business profile (free vs. Enhanced rendering)
3. Admin: auth, business list/detail, CSV import, notes and lead stages
4. Claim + verify flow (SMS code, Green) and Suggest an Update / Suggest a Business / Submit an Event
5. Event tracking + SEO markup + sitemaps
6. Placements manager + Stripe Payment Links + mark-as-paid activation
7. Events, deals, and article pages; weekend guide
8. Then V2: owner dashboard and self-serve billing
