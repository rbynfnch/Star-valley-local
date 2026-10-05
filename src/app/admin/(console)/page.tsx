import Link from "next/link";
import { requireStaff } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

const TILES: { key: string; label: string; hint: string; href?: string }[] = [
  { key: "pending_submissions", label: "Waiting for review", hint: "suggestions and events", href: "/admin/moderation" },
  { key: "total", label: "Businesses", hint: "not archived" },
  { key: "prospects", label: "Prospects", hint: "hidden until published" },
  { key: "verified", label: "Verified", hint: "Green or Gold, published" },
  { key: "needing_verification", label: "Needing verification", hint: "unverified, or due within 14 days" },
  { key: "enhanced", label: "Enhanced", hint: "live paid listing" },
  { key: "featured", label: "Featured", hint: "live placement" },
];

export default async function Dashboard() {
  const staff = await requireStaff();
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("admin_dashboard_counts", { p_tenant: staff.tenant.id });
  const counts = (data ?? {}) as Record<string, number>;
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-text">Dashboard</h1>
      {error && <p role="alert" className="mt-4 text-sm font-medium text-danger-text">Could not load the counts.</p>}
      <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {TILES.map((t) => (
          <div key={t.key} className="rounded-card bg-surface-card p-4 shadow-card">
            <dt className="text-sm font-medium text-text-muted">{t.href ? <Link href={t.href} className="text-link underline">{t.label}</Link> : t.label}</dt>
            <dd className="mt-1 font-heading text-3xl font-semibold text-text">{Number.isFinite(counts[t.key]) ? counts[t.key] : "–"}</dd>
            <dd className="text-xs text-text-subtle">{t.hint}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
