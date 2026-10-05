# Hosted test site: Supabase + Vercel

This puts a private test copy of Star Valley Local on the internet, with real accounts, so you can test sign-in, the owner dashboard, the admin, Hotlist claims and postcards. About 45 minutes, all on free plans.

You will make two accounts (Supabase for the database, Vercel for the website), copy a few keys, and run four commands. Nothing here costs money. **Do not paste any key into a chat or commit it to the repository.**

Run commands in **Git Bash**, from the project folder (`Projects/SVlocal`), after `git pull` on branch `claude/repo-schema-rls-design-9atppo`.

---

## 1. Create the Supabase project (database, accounts, photo storage)

1. Sign in at https://supabase.com and choose **New project**.
2. Name: `star-valley-local-test`. Region: the one nearest you (US East is fine). Choose a **database password** and write it down (you will need it in step 2).
3. Wait until the project says it is ready (a couple of minutes).

## 2. Collect four values

| What | Where in Supabase | Looks like |
|---|---|---|
| **Project URL** | Project Settings → API → Project URL | `https://abcdxyz.supabase.co` |
| **anon key** | Project Settings → API → Project API keys → `anon` `public` | long text starting `eyJ…` |
| **service_role key** | same place → `service_role` (click Reveal). **Secret.** | long text starting `eyJ…` |
| **Connection string** | Click **Connect** at the top → **Session pooler** → URI | `postgresql://postgres.abcdxyz:[YOUR-PASSWORD]@aws-0-…pooler.supabase.com:5432/postgres` |

Replace `[YOUR-PASSWORD]` in the connection string with the database password from step 1. Use the **Session pooler** string, not the "Direct connection" one (the direct one needs IPv6, which many home networks lack).

## 3. Build the database

In Git Bash (put your own connection string in the quotes):

```bash
export PATH="/c/Program Files/PostgreSQL/16/bin:$PATH"      # so psql is found
export DATABASE_URL='postgresql://postgres.abcdxyz:YOURPASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
bash scripts/hosted/setup.sh --seed
```

You should see `== applying …` for each migration, then `storage bucket 'media' is ready` and `loading demo seed`. It is safe to run again: finished migrations are skipped. If a migration fails, the script stops and says which one; send me the message.

Then upload the demo photos:

```bash
export NEXT_PUBLIC_SUPABASE_URL='https://abcdxyz.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='eyJ…the service_role key…'
node scripts/hosted/upload-seed-media.mjs
```

It should print `uploaded 19 file(s), 0 failed`.

## 4. Supabase sign-in settings

Authentication → **Sign In / Providers** → **Email**: turn **Confirm email** OFF for this test site. (Supabase's built-in email sender is limited to a few messages an hour, and the test site has no mail service yet. With confirmation off, new accounts work immediately.)

You will come back in step 7 to set the site's address under Authentication → **URL Configuration**.

## 5. Create the Vercel project (the website)

1. Sign in at https://vercel.com with your GitHub account → **Add New… → Project** → import `rbynfnch/Star-valley-local`.
2. Leave the framework as **Next.js**. Under **Production Branch** (Settings → Git, after creation) choose `claude/repo-schema-rls-design-9atppo`, or merge that branch into `main` first.
3. **Environment Variables** (add these before the first deploy; the public ones are baked in at build time):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (Cloudflare's always-passes test key) |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` (its matching test secret) |
| `TRACKING_SALT` | any random text, 32+ characters |
| `CRON_SECRET` | any random text, 32+ characters |
| `SVL_NOINDEX` | `1` (asks search engines not to list the test site) |

Do **not** set `SVL_DATA_SOURCE` or `DEFAULT_TENANT_SLUG` (they are for local development only; the site refuses fixtures mode in production).

4. Click **Deploy**. When it finishes, note the address, for example `star-valley-local-test.vercel.app`.

## 6. Tell the database about the site's address

The site finds its tenant from the address it is served on. Register yours (no `https://`):

```bash
bash scripts/hosted/setup.sh --domain star-valley-local-test.vercel.app
```

Open the address. You should see the Star Valley Local home page with the Hotlist strip. A "not found" page means this step was skipped or mistyped.

## 7. Point sign-in at the site

Supabase → Authentication → **URL Configuration**: set **Site URL** to `https://star-valley-local-test.vercel.app` and add `https://star-valley-local-test.vercel.app/**` to **Redirect URLs**.

## 8. Make yourself staff and an owner

1. On the site, go to `/account/sign-up` and create your account (use a real email you control).
2. Make that account an admin, and the verified owner of a sample business:

```bash
bash scripts/hosted/make-staff.sh you@example.com admin
bash scripts/hosted/make-owner.sh you@example.com sample-valley-plumbing
```

3. Sign in at `/admin/login` (the admin) and visit `/dashboard` (the owner dashboard).

`make-owner.sh` is for test sites only: it skips the text-message or email claim step (those need Twilio and Postmark, which are not set up) and records a proof marked as a test.

## 9. Check that it is closed to the public

```bash
export SITE_URL='https://star-valley-local-test.vercel.app'
export NEXT_PUBLIC_SUPABASE_URL='https://abcdxyz.supabase.co'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='eyJ…the anon key…'
node scripts/hosted/smoke.mjs
```

It loads the public pages and then tries, with the same public key every visitor's browser has, to read private columns and tables and to call functions that must be closed. Every line should say `ok`. Send me any `FAIL` line. Run it again after every deploy or database change.

---

## What you can test

- All public pages, search, Hotlist (browse and filters), events, articles, pricing.
- Sign-up and sign-in; the owner dashboard for the business you own (profile, hours, photos, requests, plan, Hotlist offers, verified badge).
- The admin: businesses, content, Hotlist (approve, slots, redeem codes, newsletter block), placements ("mark as paid" makes a business Enhanced), postcards (make a batch, print, then redeem the code from the owner account), moderation, import.
- **Get deal** on a Hotlist deal while signed in.

## What will not work yet (and why)

- **Claim by text message or by emailed link**, and the admin "send claim link": they need Twilio (SMS) and Postmark (email). Use `make-owner.sh` instead.
- **Emails of any kind** (renewal reminders, lead notices): no mail service is connected.
- **Online checkout** buttons on the pricing page: they show "not open yet" until Stripe Payment Links are added to the products.
- **The scheduled email job**: not scheduled. It has nothing to send without Postmark.

## Keeping it safe

- The service_role key bypasses all database protections. It belongs only in Vercel's environment variables. If it ever leaks, rotate it in Supabase (Project Settings → API).
- This is a test copy of fictional data. Do not put real customer information in it.
- The site is public to anyone with the address; it is marked noindex, but treat the address as unlisted, not secret. Vercel's paid plans can add a password.
- When you move to a production site later, use new keys and a new Supabase project, real Turnstile keys (Cloudflare, free), and remove `SVL_NOINDEX`.
