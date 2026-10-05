import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";

export interface OwnerBusiness {
  id: string; slug: string; name: string; status: "unclaimed" | "claimed" | string; verification_level: "none" | "green" | "gold"; verified_at: string | null; reverify_due_at: string | null;
  city: string | null; community_id: string | null; tier: "free" | "enhanced"; listing_ends_at: string | null; new_leads: number; has_postcard_pending: boolean;
}
type Tenant = NonNullable<Awaited<ReturnType<typeof getTenant>>>;
export interface OwnerContext { userId: string; email: string | null; tenant: Tenant; businesses: OwnerBusiness[] }

/**
 * The signed-in owner for THIS request's tenant and the businesses they own (the database decides: owner_dashboard runs as the user, so
 * row-level security is the gate). Not signed in -> sign-in and back; no tenant -> 404. A signed-in account that owns nothing gets an empty list
 * (the dashboard then explains how to claim a business).
 */
export const requireOwner = cache(async (nextPath = "/dashboard"): Promise<OwnerContext> => {
  const tenant = await getTenant();
  if (!tenant) notFound();
  if (!authConfigured()) redirect(`/account/sign-in?next=${encodeURIComponent(nextPath)}`);
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/account/sign-in?next=${encodeURIComponent(nextPath)}`);
  const { data, error } = await supabase.rpc("owner_dashboard", { p_tenant: tenant.id });
  if (error) throw new Error("Could not load your businesses.");
  return { userId: user.id, email: user.email ?? null, tenant, businesses: (data ?? []) as OwnerBusiness[] };
});

/** One owned business, or a 404 (a business the account does not own is indistinguishable from one that does not exist). */
export async function requireOwnedBusiness(id: string, nextPath: string): Promise<OwnerContext & { business: OwnerBusiness }> {
  if (!isUuid(id)) notFound();
  const ctx = await requireOwner(nextPath);
  const business = ctx.businesses.find((b) => b.id === id);
  if (!business) notFound();
  return { ...ctx, business };
}

/**
 * For server actions that both staff and owners may run (the content editor). Staff (sales or admin) pass as before; otherwise the business
 * must be one the signed-in account owns. The database functions check again as the caller.
 */
export async function requireBusinessWriter(businessId: string): Promise<{ tenant: Tenant; isStaff: boolean }> {
  const tenant = await getTenant();
  if (!tenant || !authConfigured() || !isUuid(businessId)) redirect("/dashboard");
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/account/sign-in?next=${encodeURIComponent("/dashboard")}`);
  const { data: role } = await supabase.rpc("my_staff_role", { p_tenant: tenant.id });
  if (role === "admin" || role === "sales") return { tenant, isStaff: true };
  const { data } = await supabase.rpc("owner_dashboard", { p_tenant: tenant.id });
  if (((data ?? []) as OwnerBusiness[]).some((b) => b.id === businessId)) return { tenant, isStaff: false };
  redirect("/dashboard");
}
