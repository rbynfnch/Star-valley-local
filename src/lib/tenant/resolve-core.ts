import type { DirectoryData, Tenant } from "../directory/types.ts";
import { hostCandidates, normalizeHost } from "./host.ts";

/**
 * Pure tenant-resolution rule (no Next.js imports, so it is unit-tested):
 *  1. the Host header, via tenant_domains (a leading "www." falls back to the bare domain);
 *  2. DEVELOPMENT ONLY: `defaultSlug` for hosts that are not registered (e.g. localhost);
 *  3. otherwise null, which the caller turns into a 404. Production never falls back to a default tenant.
 */
export async function resolveTenantFor(
  data: Pick<DirectoryData, "tenantByHost" | "tenantBySlug">,
  hostHeader: string | null,
  opts: { isProduction: boolean; defaultSlug?: string },
): Promise<Tenant | null> {
  const found = await data.tenantByHost(hostCandidates(normalizeHost(hostHeader)));
  if (found) return found;
  return !opts.isProduction && opts.defaultSlug ? data.tenantBySlug(opts.defaultSlug) : null;
}
