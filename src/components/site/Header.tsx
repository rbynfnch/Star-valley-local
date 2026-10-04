import Link from "next/link";
import { MenuIcon, MountainMark, SearchIcon } from "@/components/icons";

export const NAV = [
  { href: "/businesses", label: "Businesses" },
  { href: "/events", label: "Events" },
  { href: "/deals", label: "Deals" },
  { href: "/things-to-do", label: "Things to Do" },
  { href: "/articles", label: "Articles" },
] as const;

export function Wordmark({ name, inverse = false }: { name: string; inverse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-heading text-lg font-bold uppercase tracking-[0.12em] ${inverse ? "text-text-on-inverse" : "text-surface-inverse"}`}>
      <MountainMark className={inverse ? "text-text-on-inverse" : "text-surface-inverse"} />
      {name}
    </span>
  );
}

const linkClass = "rounded-chip px-2 py-1 font-medium text-text-body hover:text-text hover:underline underline-offset-4";
const ctaClass = "rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover";

export function Header({ tenantName }: { tenantName: string }) {
  return (
    <header className="border-b border-border bg-surface-page">
      <div className="mx-auto flex w-full max-w-[var(--container-max)] items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link href="/" aria-label={`${tenantName} home`}><Wordmark name={tenantName} /></Link>

        <nav aria-label="Main" className="hidden items-center gap-4 lg:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className={linkClass}>{n.label}</Link>)}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/businesses" aria-label="Search the directory" className="rounded-button p-2 text-text-body hover:bg-surface-muted"><SearchIcon /></Link>
          <Link href="/list-your-business" className={`${ctaClass} hidden sm:inline-block`}>List Your Business</Link>
          {/* Mobile menu: native <details>, so it works without JavaScript and is keyboard accessible. */}
          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-button p-2 text-text-body hover:bg-surface-muted [&::-webkit-details-marker]:hidden" aria-label="Menu"><MenuIcon /></summary>
            <nav aria-label="Mobile" className="absolute right-0 z-20 mt-2 w-56 rounded-card border border-border bg-surface-card p-2 shadow-card">
              <ul>
                {NAV.map((n) => <li key={n.href}><Link href={n.href} className="block rounded-chip px-3 py-2 font-medium text-text-body hover:bg-surface-muted">{n.label}</Link></li>)}
                <li><Link href="/list-your-business" className="mt-1 block rounded-button bg-brand px-3 py-2 text-center font-semibold text-brand-contrast">List Your Business</Link></li>
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
