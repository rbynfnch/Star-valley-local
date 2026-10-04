import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { HubPage, hubPageUrl } from "@/components/directory/HubPage";
import { hubText, isIndexable, type HubKind } from "@/lib/directory/hub";
import { loadHub } from "@/lib/directory/hub-data";
import { parseSearchParams } from "@/lib/directory/search-params";
import { normalizeHost } from "@/lib/tenant/host";
import { originFromRequest } from "@/lib/tenant/origin";
import { getTenant } from "@/lib/tenant/resolve";

type Raw = Record<string, string | string[] | undefined>;

export async function hubMetadata(kind: HubKind, category: string | null, community: string | null, raw: Raw): Promise<Metadata> {
  const tenant = await getTenant();
  if (!tenant) return {};
  const page = parseSearchParams(raw).page;
  const hub = await loadHub(tenant, kind, category, community, page);
  if (!hub) return {};
  const t = hubText({ category: hub.category, community: hub.community, region: hub.region, count: hub.count });
  return {
    title: t.title, description: t.description,
    alternates: { canonical: hubPageUrl(hub, page) },                       // unknown query parameters never create new URLs
    robots: isIndexable(hub.count) ? undefined : { index: false, follow: true },   // thin hubs work for visitors but are not indexed
  };
}

export async function renderHub(kind: HubKind, category: string | null, community: string | null, raw: Raw) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const page = parseSearchParams(raw).page;
  const hub = await loadHub(tenant, kind, category, community, page);
  if (!hub) notFound();                                                     // unknown slug, or a combination with no businesses
  if (hub.count > 0 && page > hub.totalPages) redirect(hubPageUrl(hub, hub.totalPages));
  const h = await headers();
  const host = normalizeHost(h.get("host")) ? h.get("host") : null;
  const origin = originFromRequest(host, h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
  return <HubPage hub={hub} tenantName={tenant.name} origin={origin} />;
}
