import Link from "next/link";
import { ArrowRightIcon, GlobeIcon, PhoneIcon, PinIcon } from "@/components/icons";
import type { BusinessCardModel } from "@/lib/directory/home";

const action = "inline-flex items-center gap-1.5 rounded-button border border-border bg-surface-card px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted";

// Free listings show Call / Website / Directions only (CLAUDE.md §6). No ratings, no distance, no "open now".
export function BusinessCard({ b, featured = false }: { b: BusinessCardModel; featured?: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-card bg-surface-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {featured && <span className="rounded-chip bg-featured-bg px-2 py-0.5 text-xs font-bold text-on-light-accent">Featured</span>}
        {b.verification?.level === "gold" && <span className="rounded-chip bg-gold-bg px-2 py-0.5 text-xs font-bold text-on-light-accent">{b.verification.label}</span>}
        {b.verification?.level === "green" && <span className="rounded-chip bg-verified-bg px-2 py-0.5 text-xs font-bold text-verified-text">{b.verification.label}</span>}
      </div>
      <div>
        <h3 className="font-heading text-xl font-bold leading-snug">
          <Link href={`/business/${b.slug}`} className="text-text hover:underline underline-offset-4">{b.name}</Link>
        </h3>
        <p className="text-sm text-text-muted">{[b.categoryName, b.communityName].filter(Boolean).join(" · ")}</p>
      </div>
      {b.description && <p className="text-text-body">{b.description}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {b.telHref && <a href={b.telHref} data-track="phone_click" data-business={b.id} className={action}><PhoneIcon />Call<span className="sr-only"> {b.name}</span></a>}
        {/* A paid placement is advertising: mark the outbound link rel=sponsored (and never pass SEO credit). */}
        {b.website && <a href={b.website.href} data-track="website_click" data-business={b.id} className={action} target="_blank" rel={featured ? "sponsored noopener noreferrer" : "noopener noreferrer"}><GlobeIcon />Website<span className="sr-only"> for {b.name} (opens in a new tab)</span></a>}
        {b.directionsHref && <a href={b.directionsHref} data-track="directions_click" data-business={b.id} className={action} target="_blank" rel="noopener noreferrer"><PinIcon />Directions<span className="sr-only"> to {b.name} (opens in a new tab)</span></a>}
      </div>
    </li>
  );
}
export { ArrowRightIcon };
