import { safeRelativePath } from "./admin/access.ts";

/** Where a signed-in visitor may be sent back to after sign-in / sign-up: never off-site, never /admin. */
export const nextAfterAuth = (next: unknown): string =>
  safeRelativePath(typeof next === "string" ? next : null, "/", ["/list-your-business", "/account"]);
