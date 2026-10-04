import { getDirectoryData } from "@/lib/directory/data";
import { buildSitemapXml, sitemapPaths } from "@/lib/seo/sitemap";
import { normalizeHost } from "@/lib/tenant/host";
import { originFromRequest } from "@/lib/tenant/origin";
import { resolveTenantFor } from "@/lib/tenant/resolve-core";

export const dynamic = "force-dynamic";   // one sitemap per tenant, chosen by the request host

export async function GET(request: Request) {
  const isProduction = process.env.NODE_ENV === "production";
  const hostHeader = request.headers.get("host");
  const data = getDirectoryData();
  const tenant = await resolveTenantFor(data, hostHeader, { isProduction, defaultSlug: process.env.DEFAULT_TENANT_SLUG });
  const origin = originFromRequest(normalizeHost(hostHeader) ? hostHeader : null, request.headers.get("x-forwarded-proto"), isProduction);
  if (!tenant || !origin) return new Response("Not found", { status: 404 });
  const [categories, communities, counts] = await Promise.all([data.categories(tenant.id), data.communities(tenant.id), data.counts(tenant.id)]);
  return new Response(buildSitemapXml(origin, sitemapPaths(categories, communities, counts)), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
