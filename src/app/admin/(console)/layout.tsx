import Link from "next/link";
import { requireStaff } from "@/lib/admin/session";
import { visibleAreas } from "@/lib/admin/access";
import { buildThemeStyle } from "@/lib/tenant/theme";
import { signOut } from "../login/actions";

export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const staff = await requireStaff();            // redirects to login when not signed in / not staff
  const { style } = buildThemeStyle(staff.tenant.theme);
  const areas = visibleAreas(staff.role);
  return (
    <div style={style as React.CSSProperties} className="flex flex-1 flex-col">
      <header className="no-print bg-surface-inverse text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="font-heading text-lg font-semibold">{staff.tenant.name} <span className="font-sans text-sm font-normal opacity-80">admin</span></p>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-90">{staff.email} · {staff.role}</span>
            <form action={signOut}><button className="rounded-button border border-white/60 px-3 py-1 hover:bg-white/10">Sign out</button></form>
          </div>
        </div>
        <nav aria-label="Admin" className="mx-auto w-full max-w-6xl px-4 pb-2 text-sm">
          <ul className="flex flex-wrap gap-4">
            {areas.includes("dashboard") && <li><Link href="/admin" className="text-white underline-offset-4 hover:underline">Dashboard</Link></li>}
            {areas.includes("content") && <li><Link href="/admin/content" className="text-white underline-offset-4 hover:underline">Content</Link></li>}
            {areas.includes("content") && <li><Link href="/admin/hotlist" className="text-white underline-offset-4 hover:underline">Hotlist</Link></li>}
            {areas.includes("placements") && <li><Link href="/admin/placements" className="text-white underline-offset-4 hover:underline">Placements</Link></li>}
            {areas.includes("import") && <li><Link href="/admin/import" className="text-white underline-offset-4 hover:underline">Import</Link></li>}
            {areas.includes("crm") && <li><Link href="/admin/postcards" className="text-white underline-offset-4 hover:underline">Postcards</Link></li>}
            {areas.includes("crm") && <li><Link href="/admin/email" className="text-white underline-offset-4 hover:underline">Email</Link></li>}
            {areas.includes("moderation") && <li><Link href="/admin/moderation" className="text-white underline-offset-4 hover:underline">Moderation</Link></li>}
            {areas.includes("businesses") && <li><Link href="/admin/businesses" className="text-white underline-offset-4 hover:underline">Businesses</Link></li>}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
