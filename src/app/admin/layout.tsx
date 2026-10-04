import type { Metadata } from "next";

// Staff pages are per-request and per-user: never prerendered or cached, whatever env vars exist at build time.
export const dynamic = "force-dynamic";

// Nothing under /admin is ever indexed or cached (the proxy also sets X-Robots-Tag and no-store).
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex flex-1 flex-col bg-surface-page text-text-body">{children}</div>;
}
