import Link from "next/link";
import { NAV, Wordmark } from "./Header";

export function Footer({ tenantName, tagline }: { tenantName: string; tagline: string | null }) {
  return (
    <footer className="mt-16 bg-surface-inverse text-text-on-inverse">
      <div className="mx-auto grid w-full max-w-[var(--container-max)] gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-3">
          <Wordmark name={tenantName} inverse />
          {tagline && <p className="font-heading text-lg italic">{tagline}</p>}
        </div>
        <nav aria-label="Footer: explore">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-on-inverse">Explore</h2>
          <ul className="space-y-2">
            {NAV.map((n) => <li key={n.href}><Link href={n.href} className="text-text-on-inverse underline-offset-4 hover:underline">{n.label}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Footer: for businesses">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-on-inverse">For businesses</h2>
          <ul className="space-y-2">
            <li><Link href="/list-your-business" className="text-text-on-inverse underline-offset-4 hover:underline">List Your Business</Link></li>
          </ul>
        </nav>
      </div>
      <p className="border-t border-white/20 px-4 py-4 text-center text-sm text-text-on-inverse">© {new Date().getFullYear()} {tenantName}. All rights reserved.</p>
    </footer>
  );
}
