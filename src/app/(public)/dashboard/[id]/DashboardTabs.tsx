"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardTabs({ id, newLeads, slug }: { id: string; newLeads: number; slug: string }) {
  const path = usePathname();
  const base = `/dashboard/${id}`;
  const tabs = [
    { href: base, label: "Overview" }, { href: `${base}/profile`, label: "Profile" }, { href: `${base}/content`, label: "Photos and content" },
    { href: `${base}/leads`, label: newLeads > 0 ? `Requests (${newLeads} new)` : "Requests" }, { href: `${base}/hotlist`, label: "Hotlist" }, { href: `${base}/plan`, label: "Plan and billing" },
  ];
  return (
    <nav aria-label="Business dashboard" className="mt-4 border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-x-5 gap-y-1">
        {tabs.map((t) => {
          const active = t.href === base ? path === base : path.startsWith(t.href);
          return <li key={t.href}><Link href={t.href} aria-current={active ? "page" : undefined} className={`inline-block border-b-2 px-1 py-2 text-sm font-semibold ${active ? "border-brand text-text" : "border-transparent text-text-muted hover:text-text"}`}>{t.label}</Link></li>;
        })}
        <li className="ml-auto"><Link href={`/business/${slug}`} className="inline-block px-1 py-2 text-sm font-semibold text-link underline">View public page</Link></li>
      </ul>
    </nav>
  );
}
