import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { requireArea } from "@/lib/admin/session";
import { mediaBaseUrl } from "@/lib/media";
import { createUserClient } from "@/lib/supabase/server";
import { ContentEditor, type Content } from "./ContentEditor";

export const metadata: Metadata = { title: "Edit content" };

export default async function BusinessContent({ params }: PageProps<"/admin/businesses/[id]/content">) {
  const staff = await requireArea("businesses");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createUserClient();
  const [content, detail, communities, categories] = await Promise.all([
    supabase.rpc("business_content", { p_tenant: staff.tenant.id, p_business: id }),
    supabase.rpc("admin_business_detail", { p_tenant: staff.tenant.id, p_business: id }),
    supabase.from("communities").select("id,name").eq("tenant_id", staff.tenant.id).order("sort_order"),
    supabase.from("categories").select("id,name").eq("tenant_id", staff.tenant.id).eq("is_active", true).order("sort_order"),
  ]);
  if (content.error?.code === "P0002" || (!content.error && !content.data) || (!detail.error && !detail.data)) notFound();
  if (content.error || detail.error) throw new Error("Could not load this business.");
  const b = (detail.data as { business: { name: string; status: string } }).business;
  return (
    <>
      <p className="text-sm"><Link href={`/admin/businesses/${id}`} className="text-link underline">← {b.name}</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text [overflow-wrap:anywhere]">Edit content</h1>
      <p className="mt-1 text-sm text-text-muted">Each section saves on its own. Staff edits are recorded as such, and a re-import never overwrites them.</p>
      <ContentEditor business={id} content={content.data as Content} communities={communities.data ?? []} categories={categories.data ?? []} tz={staff.tenant.timezone} mediaBase={mediaBaseUrl()} />
    </>
  );
}

