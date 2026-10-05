import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { dateField } from "@/lib/admin/editorial-input";
import { centsToDollars } from "@/lib/admin/hotlist-input";
import { requireArea } from "@/lib/admin/session";
import { BADGE_LABELS, CATEGORIES, DEAL_BADGES } from "@/lib/hotlist/model";
import { mediaBaseUrl } from "@/lib/media";
import { createUserClient } from "@/lib/supabase/server";
import { CoverImage } from "../../content/EditorialBits";
import { DeleteHotlist, HotlistForm, ReviewPanel } from "../HotlistForms";

export const metadata: Metadata = { title: "Edit Hotlist item" };
type H = { id: string; slug: string; kind: "deal" | "pick"; category: string; badge: string; title: string; summary: string | null; body: string | null; status: string; starts_at: string; ends_at: string | null; original_cents: number | null; price_cents: number | null; quantity: number | null; code_prefix: string | null; redemption: string | null; terms: string | null; business_id: string; image_media_id: string | null; reject_reason: string | null; submitted_by: string | null };

export default async function EditHotlist({ params, searchParams }: PageProps<"/admin/hotlist/[id]">) {
  const staff = await requireArea("content");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const created = (await searchParams).created === "1";
  const supabase = await createUserClient(), tz = staff.tenant.timezone;
  const { data } = await supabase.from("hotlist_items").select("id,slug,kind,category,badge,title,summary,body,status,starts_at,ends_at,original_cents,price_cents,quantity,code_prefix,redemption,terms,business_id,image_media_id,reject_reason,submitted_by").eq("id", id).eq("tenant_id", staff.tenant.id).maybeSingle();
  if (!data) notFound();
  const h = data as H;
  const [biz, img, claims] = await Promise.all([
    supabase.from("businesses").select("slug,name").eq("id", h.business_id).maybeSingle(),
    h.image_media_id ? supabase.from("media_assets").select("storage_bucket,storage_path,alt_text").eq("id", h.image_media_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("hotlist_claims").select("id,redeemed_at").eq("item_id", id),
  ]);
  const b = biz.data as { slug: string; name: string } | null;
  const media = img.data as { storage_bucket: string; storage_path: string; alt_text: string | null } | null;
  const cl = (claims.data ?? []) as { redeemed_at: string | null }[];
  // The last valid day is stored as the start of the next local day; the form shows the day itself.
  const lastDay = h.ends_at ? dateField(new Date(new Date(h.ends_at).getTime() - 3600_000).toISOString(), tz) : "";
  return (
    <>
      <p className="text-sm"><Link href="/admin/hotlist" className="text-link underline">← Hotlist</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text [overflow-wrap:anywhere]">{h.title}</h1>
      {created && <p role="status" className="mt-3 rounded-card bg-surface-muted p-3 text-sm font-medium text-green-800">Draft created. Add a photo below, then publish.</p>}
      <p className="mt-1 text-sm text-text-muted">{h.status === "published" ? <>Live at <Link href={`/hotlist/${h.slug}`} target="_blank" className="font-medium text-link underline">/hotlist/{h.slug}</Link></> : `Status: ${h.status}. Not visible to the public.`}
        {h.kind === "deal" && <> · {cl.length}{h.quantity ? ` of ${h.quantity}` : ""} claimed, {cl.filter((c) => c.redeemed_at).length} redeemed</>}</p>
      <div className="mt-4 space-y-4">
        {h.status === "pending" && (
          <section aria-labelledby="rev-h" className="space-y-3 rounded-card bg-surface-card p-4 shadow-card">
            <h2 id="rev-h" className="font-heading text-lg font-semibold text-text">Review{h.submitted_by ? " (submitted by the business)" : ""}</h2>
            {!h.image_media_id && <p className="text-sm text-text-body">Add a photo before approving.</p>}
            <ReviewPanel id={h.id} />
          </section>
        )}
        {h.status === "rejected" && h.reject_reason && <p className="rounded-card bg-surface-muted p-3 text-sm text-text">Rejected: {h.reject_reason}</p>}
        <div className="rounded-card bg-surface-card p-4 shadow-card">
          <HotlistForm categories={CATEGORIES} badges={DEAL_BADGES.map((x) => ({ value: x, label: BADGE_LABELS[x] }))}
            v={{ id: h.id, kind: h.kind, business: b?.slug ?? "", category: h.category, badge: h.badge, title: h.title, summary: h.summary ?? "", body: h.body ?? "", start_date: dateField(h.starts_at, tz), end_date: lastDay,
              original: centsToDollars(h.original_cents), price: centsToDollars(h.price_cents), quantity: h.quantity ? String(h.quantity) : "", code_prefix: h.code_prefix ?? "", redemption: h.redemption ?? "", terms: h.terms ?? "", status: h.status === "rejected" ? "archived" : h.status }} />
        </div>
        <CoverImage kind="hotlist" id={h.id} mediaBase={mediaBaseUrl()} current={media ? { bucket: media.storage_bucket, path: media.storage_path, alt: media.alt_text } : null} />
        <div className="rounded-card bg-surface-card p-4 shadow-card"><DeleteHotlist id={h.id} /><p className="mt-2 text-xs text-text-muted">Only drafts, rejected and archived items without claims can be deleted.</p></div>
      </div>
    </>
  );
}
