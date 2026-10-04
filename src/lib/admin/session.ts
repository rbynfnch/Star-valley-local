import { cache } from "react";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant/resolve";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import type { StaffRole } from "./access";

const ROLES: readonly string[] = ["admin", "sales", "editor"];

export interface StaffContext {
  userId: string;
  email: string | null;
  tenant: NonNullable<Awaited<ReturnType<typeof getTenant>>>;
  role: StaffRole;
}

/**
 * The signed-in staff member for THIS request's tenant, or a redirect. Called by every admin layout/page.
 * - not configured / not signed in -> /admin/login
 * - signed in but not staff of this tenant -> /admin/login?denied=1 (signed out first by the login page)
 * Role comes from the database (my_staff_role), never from the client or a cookie.
 */
export const requireStaff = cache(async (): Promise<StaffContext> => {
  if (!authConfigured()) redirect("/admin/login");
  const tenant = await getTenant();
  if (!tenant) redirect("/admin/login");
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: role, error } = await supabase.rpc("my_staff_role", { p_tenant: tenant.id });
  if (error || typeof role !== "string" || !ROLES.includes(role)) redirect("/admin/login?denied=1");
  return { userId: user.id, email: user.email ?? null, tenant, role: role as StaffRole };
});
