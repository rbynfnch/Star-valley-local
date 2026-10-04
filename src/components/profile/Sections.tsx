import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon, GlobeIcon, PhoneIcon, PinIcon } from "@/components/icons";
import type { ProfileView, PhotoView } from "@/lib/directory/profile";

export function Card({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="scroll-mt-6 rounded-card bg-surface-card p-5 shadow-card">
      <h2 id={id ? `${id}-h` : undefined} className="mb-3 font-heading text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

const btn = "inline-flex items-center gap-2 rounded-button px-4 py-2.5 font-semibold";

// Free listings show Call, Website and Directions only (CLAUDE.md §6).
export function ActionButtons({ v }: { v: ProfileView }) {
  return (
    <div className="flex flex-wrap gap-2">
      {v.telHref && <a href={v.telHref} className={`${btn} bg-brand text-brand-contrast hover:bg-brand-hover`}><PhoneIcon />Call<span className="sr-only"> {v.name}</span></a>}
      {/* a paid placement makes this link advertising: rel=sponsored */}
      {v.website && <a href={v.website.href} target="_blank" rel={v.featured ? "sponsored noopener noreferrer" : "noopener noreferrer"} className={`${btn} border border-border bg-surface-card text-text hover:bg-surface-muted`}><GlobeIcon />Website<span className="sr-only"> for {v.name} (opens in a new tab)</span></a>}
      {v.directionsHref && <a href={v.directionsHref} target="_blank" rel="noopener noreferrer" className={`${btn} border border-border bg-surface-card text-text hover:bg-surface-muted`}><PinIcon />Directions<span className="sr-only"> to {v.name} (opens in a new tab)</span></a>}
    </div>
  );
}

export function HoursCard({ v }: { v: ProfileView }) {
  return (
    <Card title="Hours" id="hours">
      {v.hours.kind === "unknown" ? <p className="text-text-muted">Hours not provided.</p> : (
        <dl className="space-y-1.5">
          {v.hours.groups.map((g) => (
            <div key={g.label} className="flex justify-between gap-4">
              <dt className="font-medium text-text">{g.label}</dt>
              <dd className={g.closed ? "text-text-muted" : "text-text-body"}>{g.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {v.hoursNote && <p className="mt-3 text-sm text-text-muted">{v.hoursNote}</p>}
    </Card>
  );
}

export function DetailsCard({ v }: { v: ProfileView }) {
  const row = "grid grid-cols-[6rem_1fr] gap-x-3 gap-y-0.5";
  return (
    <Card title="Business details" id="details">
      <dl className="space-y-3">
        {v.phone && <div className={row}><dt className="font-medium text-text">Phone</dt><dd>{v.telHref ? <a href={v.telHref}>{v.phone}</a> : v.phone}</dd></div>}
        {v.website && <div className={row}><dt className="font-medium text-text">Website</dt><dd className="break-all"><a href={v.website.href} target="_blank" rel={v.featured ? "sponsored noopener noreferrer" : "noopener noreferrer"}>{v.website.label}</a></dd></div>}
        {v.email && <div className={row}><dt className="font-medium text-text">Email</dt><dd className="break-all"><a href={`mailto:${v.email}`}>{v.email}</a></dd></div>}
        {v.addressLines.length > 0 && <div className={row}><dt className="font-medium text-text">Address</dt><dd>{v.addressLines.map((l) => <span key={l} className="block">{l}</span>)}</dd></div>}
        {v.serviceAreas.length > 0 && <div className={row}><dt className="font-medium text-text">Also serves</dt><dd>{v.serviceAreas.join(", ")}</dd></div>}
        {v.priceLabel && <div className={row}><dt className="font-medium text-text">Price</dt><dd>{v.priceLabel}</dd></div>}
        {v.social.length > 0 && (
          <div className={row}><dt className="font-medium text-text">Follow</dt>
            <dd><ul className="flex flex-wrap gap-x-3 gap-y-1">{v.social.map((s) => <li key={s.href}><a href={s.href} target="_blank" rel="noopener noreferrer nofollow">{s.label}<span className="sr-only"> (opens in a new tab)</span></a></li>)}</ul></dd></div>
        )}
        {v.googleReviewsHref && <div className={row}><dt className="font-medium text-text">Reviews</dt><dd><a href={v.googleReviewsHref} target="_blank" rel="noopener noreferrer nofollow">See reviews on Google<span className="sr-only"> (opens in a new tab)</span></a></dd></div>}
      </dl>
    </Card>
  );
}

export function VerificationCard({ v }: { v: ProfileView }) {
  if (!v.verification) {
    return v.claimable ? (
      <Card title="Is this your business?" id="claim">
        <p className="text-text-body">Claim this listing to confirm your details, add photos and more, and show customers you are verified.</p>
        <p className="mt-3"><Link href={`/list-your-business?claim=${encodeURIComponent(v.slug)}`} className="inline-flex items-center gap-1 font-semibold">Claim this business <ArrowRightIcon /></Link></p>
      </Card>
    ) : null;
  }
  const gold = v.verification.level === "gold";
  return (
    <Card title={v.verification.label} id="verified">
      <p className="text-text-body">{gold ? "The owner's identity was confirmed and an additional proof was checked." : "The owner's identity was confirmed."}</p>
      {/* CLAUDE.md §6: the annual re-verification date is shown only once verified */}
      <ul className="mt-2 space-y-0.5 text-sm text-text-muted">
        {v.verification.verifiedText && <li>{v.verification.verifiedText}</li>}
        {v.verification.reverifyText && <li>{v.verification.reverifyText}</li>}
      </ul>
    </Card>
  );
}

function Img({ p, priority = false, sizes }: { p: PhotoView; priority?: boolean; sizes: string }) {
  return <Image src={p.url} alt={p.alt} fill sizes={sizes} priority={priority} className="object-cover" />;
}
export function CoverBanner({ photo }: { photo: PhotoView }) {
  return <div className="relative aspect-[3/1] w-full overflow-hidden bg-surface-muted sm:aspect-[4/1]"><Img p={photo} priority sizes="100vw" /></div>;
}
export function Gallery({ photos, name }: { photos: PhotoView[]; name: string }) {
  return (
    <Card title="Photos" id="photos">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => <li key={p.url} className="relative aspect-[4/3] overflow-hidden rounded-chip bg-surface-muted"><Img p={{ ...p, alt: p.alt || `${name} photo` }} sizes="(min-width: 1024px) 20vw, 45vw" /></li>)}
      </ul>
    </Card>
  );
}

export function ServicesCard({ services }: { services: string[] }) {
  return (
    <Card title="Services" id="services">
      <ul className="flex flex-wrap gap-2">{services.map((s) => <li key={s} className="rounded-pill bg-surface-muted px-3 py-1 text-sm font-medium text-text">{s}</li>)}</ul>
    </Card>
  );
}

export function DealsCard({ deals }: { deals: ProfileView["deals"] }) {
  return (
    <Card title="Deals & promotions" id="deals">
      <ul className="space-y-4">
        {deals.map((d) => (
          <li key={d.id} className="rounded-chip border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              {d.badge && <span className="rounded-chip bg-featured-bg px-2 py-0.5 text-xs font-bold uppercase text-on-light-accent">{d.badge}</span>}
              <h3 className="font-heading text-lg font-bold">{d.title}</h3>
            </div>
            {d.description && <p className="mt-1 text-text-body">{d.description}</p>}
            <p className="mt-1 text-sm text-text-muted">{d.validText}{d.terms ? ` · ${d.terms}` : ""}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function FaqCard({ faqs }: { faqs: ProfileView["faqs"] }) {
  return (
    <Card title="Frequently asked questions" id="faqs">
      <div className="divide-y divide-border">
        {faqs.map((f) => (
          <details key={f.question} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-text [&::-webkit-details-marker]:hidden">{f.question}<span aria-hidden="true" className="group-open:rotate-180">▾</span></summary>
            <p className="mt-2 text-text-body">{f.answer}</p>
          </details>
        ))}
      </div>
    </Card>
  );
}
