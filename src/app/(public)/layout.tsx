import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ClickTracker } from "@/components/tracking/Tracker";
import { buildThemeStyle } from "@/lib/tenant/theme";
import { originFromRequest } from "@/lib/tenant/origin";
import { normalizeHost } from "@/lib/tenant/host";
import { getTenant } from "@/lib/tenant/resolve";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  if (!tenant) return {};
  const h = await headers();
  const origin = originFromRequest(normalizeHost(h.get("host")) && h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title: { default: tenant.name, template: `%s | ${tenant.name}` },
    description: tenant.tagline ?? `Local businesses, events, and deals: ${tenant.name}.`,
    alternates: { canonical: "./" },
    openGraph: { type: "website", locale: "en_US", siteName: tenant.name },
    twitter: { card: "summary" },
  };
}

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  // Tenant branding: only allow-listed, contrast-checked colour overrides ever reach the style attribute.
  const { style } = buildThemeStyle(tenant.theme);
  return (
    <div style={style as React.CSSProperties} className="flex flex-1 flex-col bg-surface-page text-text-body">
      <ClickTracker />
      <Header tenantName={tenant.name} />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer tenantName={tenant.name} tagline={tenant.tagline} />
    </div>
  );
}
