import type { Metadata } from "next";
import Link from "next/link";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { createUserClient } from "@/lib/supabase/server";
import { ProfileForm } from "../../OwnerForms";

export const metadata: Metadata = { title: "Profile" };
export default async function Profile({ params }: PageProps<"/dashboard/[id]/profile">) {
  const { id } = await params;
  const { business: b } = await requireOwnedBusiness(id, `/dashboard/${id}/profile`);
  const { data } = await (await createUserClient()).from("businesses").select("name,address_line1,address_line2,city,postal_code,phone,website,email,short_description,description,hours_note").eq("id", id).maybeSingle();
  const v = Object.fromEntries(Object.entries((data ?? {}) as Record<string, string | null>).map(([k, x]) => [k, x ?? ""]));
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-text-muted">What customers see on your public listing. Changes go live as soon as you save, and a re-import of public records will never overwrite what you write here.</p>
      <div className="rounded-card bg-surface-card p-5 shadow-card"><ProfileForm business={id} v={v} enhanced={b.tier === "enhanced"} /></div>
      {b.tier !== "enhanced" && <p className="rounded-card bg-surface-muted p-4 text-sm text-text-body">The longer description and a public email address are part of an Enhanced listing. <Link href={`/dashboard/${id}/plan`} className="font-semibold text-link underline">See the plans</Link>.</p>}
      <p className="text-sm text-text-muted">To change your community, category or legal name, <Link href="/suggest-update" className="font-semibold text-link underline">ask us</Link>.</p>
    </div>
  );
}
