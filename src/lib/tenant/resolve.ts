import { cache } from "react";
import { headers } from "next/headers";
import { getDirectoryData } from "../directory/data.ts";
import type { Tenant } from "../directory/types.ts";
import { resolveTenantFor } from "./resolve-core.ts";

/** The tenant for this request (rule and tests in resolve-core.ts). Memoised per request. */
export const getTenant = cache(async (): Promise<Tenant | null> => {
  // Read the request FIRST: it opts the page into per-request rendering, so nothing below (including creating the
  // data client, which needs runtime env vars) can run at build time.
  const host = (await headers()).get("host");
  return resolveTenantFor(getDirectoryData(), host, {
    isProduction: process.env.NODE_ENV === "production",
    defaultSlug: process.env.DEFAULT_TENANT_SLUG,
  });
});
