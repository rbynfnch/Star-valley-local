import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { BADGE_LABELS, CATEGORIES, DEAL_BADGES } from "@/lib/hotlist/model";
import { HotlistForm } from "../HotlistForms";

export const metadata: Metadata = { title: "New Hotlist item" };
export default async function NewHotlist({ searchParams }: PageProps<"/admin/hotlist/new">) {
  await requireArea("content");
  const sp = await searchParams;
  const business = typeof sp.business === "string" ? sp.business : "";
  return (
    <>
      <p className="text-sm"><Link href="/admin/hotlist" className="text-link underline">← Hotlist</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text">New Hotlist item</h1>
      <p className="mt-1 text-sm text-text-muted">Save it as a draft first, add a photo, then publish.</p>
      <div className="mt-4 rounded-card bg-surface-card p-4 shadow-card">
        <HotlistForm categories={CATEGORIES} badges={DEAL_BADGES.map((b) => ({ value: b, label: BADGE_LABELS[b] }))}
          v={{ id: null, kind: "deal", business, category: "eat_drink", badge: "hot_deal", title: "", summary: "", body: "", start_date: "", end_date: "", original: "", price: "", quantity: "", code_prefix: "", redemption: "", terms: "", status: "draft" }} />
      </div>
    </>
  );
}
