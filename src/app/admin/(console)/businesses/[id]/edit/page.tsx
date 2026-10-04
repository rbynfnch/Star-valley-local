import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/detail-input";
import { EditForm } from "./EditForm";

export const metadata: Metadata = { title: "Edit business" };

export default async function EditBusiness({ params }: PageProps<"/admin/businesses/[id]/edit">) {
  const staff = await requireArea("businesses");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createUserClient();
  const [detail, communities, categories] = await Promise.all([
    supabase.rpc("admin_business_detail", { p_tenant: staff.tenant.id, p_business: id }),
    supabase.from("communities").select("id,name").eq("tenant_id", staff.tenant.id).order("sort_order"),
    supabase.from("categories").select("id,name").eq("tenant_id", staff.tenant.id).eq("is_active", true).order("sort_order"),
  ]);
  if (detail.error) throw new Error("Could not load this business.");
  if (!detail.data) notFound();
  const b = (detail.data as { business: Record<string, string | null> }).business;
  const values = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ?? ""]));
  return (
    <>
      <p className="text-sm"><Link href={`/admin/businesses/${id}`} className="text-link underline">← {b.name}</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text">Edit business</h1>
      <p className="mt-1 text-sm text-text-muted">Anything you change here is recorded as a staff edit, and a re-import will never overwrite it.</p>
      <div className="mt-4 rounded-card bg-surface-card p-4 shadow-card">
        <EditForm business={id} values={values} communities={communities.data ?? []} categories={categories.data ?? []} published={b.status === "unclaimed" || b.status === "claimed"} />
      </div>
    </>
  );
}
