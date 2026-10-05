// The dark page header used by the listing pages.
export function PageHero({ id, eyebrow, title, intro, children }: { id: string; eyebrow?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="bg-[linear-gradient(115deg,var(--navy)_0%,var(--navy)_55%,var(--valley-blue)_100%)] text-text-on-inverse">
      <div className="mx-auto w-full max-w-[var(--container-max)] space-y-4 px-4 py-10 sm:px-8">
        {eyebrow && <p className="text-sm font-bold text-text-on-inverse">{eyebrow}</p>}
        <h1 id={id} className="font-heading text-4xl font-bold text-text-on-inverse">{title}</h1>
        {intro && <p className="max-w-2xl text-lg text-text-on-inverse">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

export function ChipNav({ label, items }: { label: string; items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav aria-label={label} className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.href}>
            <a href={i.href} aria-current={i.active ? "page" : undefined}
              className={`inline-block rounded-pill border px-4 py-1.5 text-sm font-semibold ${i.active ? "border-transparent bg-surface-inverse text-text-on-inverse" : "border-border bg-surface-card text-text hover:bg-surface-muted"}`}>
              {i.label}{i.count !== undefined && <span className="ml-1.5 font-normal opacity-80">{i.count}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
