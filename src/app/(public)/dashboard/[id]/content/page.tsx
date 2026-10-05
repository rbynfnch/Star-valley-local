import type { Metadata } from "next";
import { ContentEditor, type Content } from "@/app/admin/(console)/businesses/[id]/content/ContentEditor";
import { mediaBaseUrl } from "@/lib/media";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Photos and content" };
export default async function OwnerContent({ params }: PageProps<"/dashboard/[id]/content">) {
  const { id } = await params;
  const { tenant } = await requireOwnedBusiness(id, `/dashboard/${id}/content`);
  const supabase = await createUserClient();
  const [content, communities, categories] = await Promise.all([
    supabase.rpc("business_content", { p_tenant: tenant.id, p_business: id }),
    supabase.from("communities").select("id,name").eq("tenant_id", tenant.id).order("sort_order"),
    supabase.from("categories").select("id,name").eq("tenant_id", tenant.id).eq("is_active", true).order("sort_order"),
  ]);
  if (content.error || !content.data) throw new Error("Could not load your content.");
  return (
    <div className="max-w-4xl">
      <p className="text-text-muted">Hours, photos and the extras an Enhanced listing adds. Each section saves on its own and goes live when you save it.</p>
      <ContentEditor business={id} content={content.data as Content} communities={communities.data ?? []} categories={categories.data ?? []} tz={tenant.timezone} mediaBase={mediaBaseUrl()} owner planHref={`/dashboard/${id}/plan`} />
    </div>
  );
}
