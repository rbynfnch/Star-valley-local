import { safeNextPath } from "./access.ts";

export type Gate = { action: "allow" } | { action: "redirect"; to: string };

/**
 * First-line check in the proxy: is this request allowed to reach an /admin page at all?
 * It only knows whether a user is signed in. Whether that user is STAFF for this tenant is checked again on the
 * server in the admin layout, and the database (RLS) is the final authority; never rely on this alone.
 */
export function gateDecision(pathname: string, search: string, signedIn: boolean): Gate {
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!isAdmin) return { action: "allow" };
  if (pathname === "/admin/login") return { action: "allow" };
  if (signedIn) return { action: "allow" };
  const next = safeNextPath(pathname + search);
  return { action: "redirect", to: `/admin/login?next=${encodeURIComponent(next)}` };
}
