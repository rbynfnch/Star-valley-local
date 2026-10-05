import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { SLOT_LIMITS } from "@/lib/admin/hotlist-input";
import { BADGE_LABELS, categoryLabel, dealState, money, STATE_LABELS } from "@/lib/hotlist/model";
import { createUserClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/admin/format";
import { renderHotlistBlock } from "@/lib/email/hotlist-block";
import { mediaBaseUrl, mediaUrl } from "@/lib/media";
import { requestOrigin } from "@/lib/tenant/request-origin";
import { FeatureSlot, RedeemForm } from "./HotlistForms";

export const metadata: Metadata = { title: "Hotlist" };
type Item = { id: string; slug: string; title: string; kind: "deal" | "pick"; category: string; badge: keyof typeof BADGE_LABELS; status: string; business_id: string; ends_at: string | null; price_cents: number | null; original_cents: number | null; quantity: number | null; submitted_by: string | null; image_media_id: string | null };
const SECTIONS: [string, string, string][] = [["pending", "Waiting for review", "Submissions from businesses and items marked pending."], ["published", "Published", "Live on the site (ended offers stay here until archived)."], ["draft", "Drafts", "Not visible."], ["rejected", "Rejected", "Kept for the record."], ["archived", "Archived", "Hidden."]];

export default async function HotlistAdmin({ searchParams }: PageProps<"/admin/hotlist">) {
  const staff = await requireArea("content");
  const sp = await searchParams;
  const supabase = await createUserClient(), t = staff.tenant.id, tz = staff.tenant.timezone, now = new Date();
  const { data } = await supabase.from("hotlist_items").select("id,slug,title,kind,category,badge,status,business_id,ends_at,price_cents,original_cents,quantity,submitted_by,image_media_id").eq("tenant_id", t).order("created_at", { ascending: false }).limit(300);
  const items = (data ?? []) as Item[];
  const [biz, claims, feats] = await Promise.all([
    items.length ? supabase.from("businesses").select("id,name").in("id", [...new Set(items.map((i) => i.business_id))]) : Promise.resolve({ data: [] }),
    items.length ? supabase.from("hotlist_claims").select("item_id").in("item_id", items.map((i) => i.id)) : Promise.resolve({ data: [] }),
    supabase.from("hotlist_features").select("item_id,slot,position").eq("tenant_id", t).order("position"),
  ]);
  const names = new Map(((biz.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const claimed = new Map<string, number>(); for (const c of (claims.data ?? []) as { item_id: string }[]) claimed.set(c.item_id, (claimed.get(c.item_id) ?? 0) + 1);
  const live = items.filter((i) => i.status === "published" && (!i.ends_at || new Date(i.ends_at) > now));
  const options = live.map((i) => ({ value: i.id, label: `${i.title} (${names.get(i.business_id) ?? ""})` }));
  const slotIds = (s: string) => ((feats.data ?? []) as { item_id: string; slot: string }[]).filter((f) => f.slot === s).map((f) => f.item_id);
  // The newsletter block: the editors' hottest items first, then this week's, then the rest of what is live.
  const order = [...slotIds("hottest"), ...slotIds("this_week"), ...live.map((i) => i.id)];
  const seen = new Set<string>(), picked = order.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).map((id) => live.find((i) => i.id === id)).filter((i): i is Item => !!i).slice(0, 5);
  const imgIds = picked.map((i) => i.image_media_id).filter((x): x is string => !!x);
  const mediaRows = imgIds.length ? ((await supabase.from("media_assets").select("id,storage_bucket,storage_path").in("id", imgIds)).data ?? []) as { id: string; storage_bucket: string; storage_path: string }[] : [];
  const origin = await requestOrigin();
  const block = origin ? renderHotlistBlock({ origin, tz, items: picked.map((i) => { const m = mediaRows.find((x) => x.id === i.image_media_id); return { title: i.title, slug: i.slug, kind: i.kind, category: i.category as never, businessName: names.get(i.business_id) ?? "", imageUrl: m ? mediaUrl(mediaBaseUrl(), m.storage_bucket, m.storage_path) : null, originalCents: i.original_cents, priceCents: i.price_cents, endsAt: i.ends_at }; }) }) : null;
  const card = "rounded-card bg-surface-card p-4 shadow-card";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold text-text">Hotlist</h1>
        <Link href="/admin/hotlist/new" className="rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">New item</Link>
      </div>
      <p className="mt-1 text-sm text-text-muted">Curated offers and picks. Nothing goes live without an editor. <Link href="/hotlist" target="_blank" className="font-medium text-link underline">View the public Hotlist</Link></p>
      {sp.deleted === "1" && <p role="status" className="mt-3 rounded-card bg-surface-muted p-3 text-sm font-medium text-green-800">Item deleted.</p>}

      <div className="mt-6 space-y-6">
        {SECTIONS.map(([status, title, hint]) => {
          const rows = items.filter((i) => i.status === status);
          if (rows.length === 0 && status !== "pending") return null;
          return (
            <section key={status} aria-labelledby={`h-${status}`} className={card}>
              <h2 id={`h-${status}`} className="font-heading text-lg font-semibold text-text">{title} <span className="font-normal text-text-muted">({rows.length})</span></h2>
              <p className="text-sm text-text-muted">{hint}</p>
              {rows.length === 0 ? <p className="mt-3 text-sm text-text-subtle">Nothing waiting.</p> : (
                <ul className="mt-3 divide-y divide-slate-600/15">
                  {rows.map((i) => {
                    const state = dealState({ ...i, claimed_count: claimed.get(i.id) ?? 0 }, now);
                    return (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0">
                          <Link href={`/admin/hotlist/${i.id}`} className="font-medium text-link underline [overflow-wrap:anywhere]">{i.title}</Link>
                          <p className="text-text-muted">{names.get(i.business_id) ?? "Unknown business"} · {categoryLabel(i.category)} · {BADGE_LABELS[i.badge]}{i.submitted_by ? " · submitted by the business" : ""}{!i.image_media_id ? " · no photo yet" : ""}</p>
                        </div>
                        <p className="text-right text-text-muted">
                          {i.kind === "deal" ? <>{money(i.price_cents)} (was {money(i.original_cents)}) · {claimed.get(i.id) ?? 0}{i.quantity ? ` of ${i.quantity}` : ""} claimed<br /></> : null}
                          {i.ends_at ? `ends ${formatDay(i.ends_at, tz)}` : "no end date"}{state && status === "published" ? ` · ${STATE_LABELS[state]}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        <section aria-labelledby="slots-h" className={`${card} space-y-6`}>
          <div><h2 id="slots-h" className="font-heading text-lg font-semibold text-text">What is featured</h2><p className="text-sm text-text-muted">Choose what sits in each slot on the landing page. Only published, current items can be featured; unpublishing an item removes it from its slots.</p></div>
          <FeatureSlot slot="hottest" title="The hottest right now" hint="Up to 3. Position 1 gets the big treatment." options={options} selected={slotIds("hottest")} max={SLOT_LIMITS.hottest} />
          <FeatureSlot slot="this_week" title="On the Hotlist this week" hint="Up to 8, in the order shown." options={options} selected={slotIds("this_week")} max={SLOT_LIMITS.this_week} />
          <FeatureSlot slot="business" title="Hotlist business" hint="One item whose business gets the spotlight." options={options} selected={slotIds("business")} max={SLOT_LIMITS.business} />
        </section>

        {block && block.count > 0 && (
          <section aria-labelledby="nl-h" className={card}>
            <h2 id="nl-h" className="font-heading text-lg font-semibold text-text">This week&apos;s Hotlist for the newsletter</h2>
            <p className="mb-3 text-sm text-text-muted">Built from the slots above. Copy the HTML into the consumer newsletter (never the business list). {block.count} item{block.count === 1 ? "" : "s"}.</p>
            <iframe title="Newsletter block preview" sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:16px;background:#fff">${block.html}`} className="h-[34rem] w-full rounded-card border border-slate-600/30 bg-white" />
            <label htmlFor="nl-html" className="mt-3 block text-sm font-medium text-text">HTML</label>
            <textarea id="nl-html" readOnly rows={5} value={block.html} className="mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 font-mono text-xs text-text" />
            <label htmlFor="nl-text" className="mt-3 block text-sm font-medium text-text">Plain text</label>
            <textarea id="nl-text" readOnly rows={6} value={block.text} className="mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 font-mono text-xs text-text" />
          </section>
        )}

        <section aria-labelledby="redeem-h" className={card}>
          <h2 id="redeem-h" className="font-heading text-lg font-semibold text-text">Redeem a code</h2>
          <p className="mb-3 text-sm text-text-muted">When a business reads a customer&apos;s code to you, mark it used here.</p>
          <RedeemForm />
        </section>
      </div>
    </>
  );
}
