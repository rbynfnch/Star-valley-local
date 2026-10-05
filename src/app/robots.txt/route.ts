import { getDirectoryData } from "@/lib/directory/data";
import { buildRobotsTxt } from "@/lib/seo/sitemap";
import { normalizeHost } from "@/lib/tenant/host";
import { originFromRequest } from "@/lib/tenant/origin";
import { resolveTenantFor } from "@/lib/tenant/resolve-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const isProduction = process.env.NODE_ENV === "production";
  const hostHeader = request.headers.get("host");
  const tenant = await resolveTenantFor(getDirectoryData(), hostHeader, { isProduction, defaultSlug: process.env.DEFAULT_TENANT_SLUG });
  const origin = originFromRequest(normalizeHost(hostHeader) ? hostHeader : null, request.headers.get("x-forwarded-proto"), isProduction);
  if (!tenant || !origin) return new Response("Not found", { status: 404 });
  return new Response(buildRobotsTxt(origin, process.env.SVL_NOINDEX === "1"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
