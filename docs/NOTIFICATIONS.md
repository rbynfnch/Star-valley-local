# Automated email notifications: how it works and what the backend worker must do

The database decides **who gets which email and when**, and queues it. A backend worker **sends** it.
Nothing in this document is built on the app side yet: the worker, the templates, and the provider
choice (Resend vs Postmark) come in slice 4. The database side is done and tested
(`supabase/tests/t_09_grace_notifications.sql`).

## Why Featured has a grace period

Featured requires a verified business. Verification can lapse: the annual re-verification date passes, a
proof is revoked, or the owner is removed. When a business that **holds an active Featured placement**
drops to unverified:

1. A **grace period** opens (default **14 days**, `tenant_policies.verification_grace_days`).
2. The placement **stays live and public** during grace.
3. The owner is emailed immediately, then reminded as the deadline nears.
4. **Re-verifying in time** closes the grace period and cancels any queued reminders.
5. If grace runs out, **all the business's placements end** (paid *and* comped, since verification
   applies to every source) and the owner gets a final email. A slot frees immediately.

A business with no active placement has nothing at risk, so no grace period and no email.

## What gets sent

All are **transactional service emails about the owner's own account** (not marketing), sent from the
**business-side** sending subdomain (`EMAIL_FROM_BUSINESS`).

| Kind | When | Payload (JSON) |
|---|---|---|
| `verification_reminder` | Annual re-verification due in 30, 14, 7 days (`reverify_reminder_days`). Any verified business, Featured or not. | `business_name`, `due_at`, `days_left` |
| `verification_lapsed` | Grace period starts | `grace_id`, `business_name`, `business_slug`, `ends_at`, `grace_days`, `placements[]` |
| `featured_grace_reminder` | 7 and 1 days before grace ends (`grace_reminder_days`) | `grace_id`, `ends_at`, `days_left`, `business_name`, `placements[]` |
| `featured_ended_unverified` | Grace ran out; placements ended | `grace_id`, `business_name`, `business_slug`, `placements_ended`, `credit_cents` (0 if none; tell the owner the credit) |
| `placement_renewal_reminder` | 14 days before a Featured placement ends (`renewal_reminder_days`) | `placement_id`, `ends_at`, `business_name` |
| `listing_renewal_reminder` | 14 days before a fixed-term Enhanced listing ends (`auto_renews = false`) | `listing_id`, `ends_at`, `business_name` |
| `staff_no_contact_alert` | Any grace-period step (start, 7 and 1 day reminders, end) where the business has **nobody to email**. Goes to the tenant's **admin and sales** staff, one email each. | the original step's payload plus `original_kind`, `reason: no_contact`, `business_id`, `business_name`, `business_slug` |

Notes:
- **Renewal reminders are only for fixed-term purchases.** Recurring Stripe subscriptions renew themselves and
  their end date moves forward every period, so a "14 days before" email would fire every month. Whatever
  creates or renews a subscription-backed listing or placement (the Stripe webhook, or admin "mark as paid" for
  a recurring Payment Link) **must set `auto_renews = true`**. Default is `false` (remind), because a missed
  reminder before a real expiry costs more than a redundant one. For annual subscriptions, turn on Stripe's
  built-in "upcoming renewal" emails in the Stripe dashboard instead of duplicating them here.
- Each reminder ladder sends **one email per step**, and if the daily job was down it sends only the step
  nearest the deadline, never a burst.
- Each email should link to the owner's business page with a clear "Verify now" action.

## Recipients

Resolved when the email is queued and stored as `notifications.recipient_email`:
1. every owner of the business (`business_owners` -> `auth.users.email`);
2. if the business has **no owner** (for example staff just removed them): `businesses.email`, then the
   primary CRM contact's email;
3. if there is nobody to email, **staff are alerted instead** (admin and sales, `staff_no_contact_alert`) at each
   step, so a person can phone or visit. The business also appears in `featured_at_risk`.

## Schedule

`app.run_daily_maintenance()` runs daily at **13:15 UTC (07:15 Mountain)** via `pg_cron`
(scheduled by migration `...1300`; skipped where `pg_cron` is not installed). It:
1. expires stale verifications (which can open grace periods),
2. queues grace reminders,
3. ends expired grace periods and their placements,
4. queues re-verification and renewal reminders.

It is **idempotent**: every notification has a unique `dedupe_key`, so re-running (or a late run) never
duplicates.

## The worker contract (service role only)

The worker runs every minute or so (a Next.js route triggered by `pg_cron` + `pg_net`, or a hosting-platform
cron, protected by `CRON_SECRET`). Loop:

```
rows = rpc app.claim_notifications(limit := 20)      -- leases rows for 5 minutes, attempts += 1
for each row:
    render template for row.kind with row.payload     -- look up email_templates, fall back to code defaults
    send via provider to row.recipient_email          -- From: EMAIL_FROM_BUSINESS, physical address in footer
    on success: rpc app.complete_notification(row.id, provider_message_id)
    on error:   rpc app.fail_notification(row.id, error_text)
```

Behavior the database guarantees:
- **No double sends across workers**: `claim` uses `FOR UPDATE SKIP LOCKED` and a lease.
- **Crash recovery**: a row left `sending` past its lease is reclaimed.
- **Retries with backoff**: 1 min, 5 min, 30 min, 2 h; after **5 attempts** the row stays `failed` and is
  visible to admins.
- **Suppression**: at claim time, rows to an address with a **hard bounce or spam complaint** are cancelled.
  A marketing unsubscribe does **not** block these service emails.
- **Delivery webhooks** (bounce, complaint) should insert into `suppressions` with `reason` `bounce` or
  `complaint`.

Not decided yet: the provider (Resend or Postmark), and the email copy.

### Provider caveat: cold outreach

`CLAUDE.md` §11 says cold B2B email is allowed in the US under CAN-SPAM. That is a **legal** statement. Both
Resend and Postmark prohibit sending to people who have not opted in in their **acceptable use policies**, and
may suspend the account. Everything in this document is a service email to a business that claimed its
listing, which is fine. The V3 **campaign engine** (emailing unclaimed businesses) is a different matter and
should not run on the same account, because a suspension would also stop these notices. See PROPOSAL.md
item 14.

## Credits when a placement ends early

When a grace period runs out and a **paid** placement is ended, the business is **credited the unused part**
of what it paid (`account_credits`, `reason = verification_lapse`):

    credit = amount paid for the placement x (unused time / total time)

- A placement that never started is credited in full (and cancelled).
- A renewed placement uses the sum of its paid payments over its whole term.
- **Comped placements earn nothing.** A paid placement with **no payment record** earns nothing (add a manual
  credit). A pending/unpaid payment does not count.
- Ending a placement because the business cancelled its Enhanced listing is **not** a verification lapse and
  earns no credit.
- The ledger is `available -> applied` (or `void`). Only admins change it; the amount is immutable. In V1,
  staff apply the credit by hand (next invoice or Payment Link discount); in V2 it can go to Stripe customer
  balance.

**Backend responsibility (not in the database):** if the ended placement was a **recurring Stripe
subscription**, the backend or staff must **cancel that subscription**, or the business keeps being charged for
a placement that no longer exists. `placements.auto_renews` tells you which ones. Watch for `placements`
rows that end with `auto_renews = true` and cancel the matching subscription.

## Visibility

| Who | Sees |
|---|---|
| Admin | the full outbox (`notifications`): what was sent to whom, failures |
| Sales | `verification_grace`, the `featured_at_risk` dashboard view (who is counting down, days left), and `account_credits` (read) |
| Business owner | the grace state and credits of their own business (for an in-app banner); not the outbox |
| Public / consumers | nothing |

Per-tenant knobs live in `tenant_policies` (admin-editable): `verification_grace_days`,
`reverify_reminder_days`, `grace_reminder_days`, `renewal_reminder_days`.
