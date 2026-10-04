import { notFound } from "next/navigation";
import { categoryColors, palette, pairings, resolve, semantic } from "@/styles/tokens";
import { contrastRatio } from "@/lib/color";

export const metadata = { title: "Styleguide", robots: { index: false, follow: false } };

// Dev-only: renders every token so it can be compared with the mockups. 404 in production.
export default function Styleguide() {
  if (process.env.NODE_ENV === "production") notFound();

  const categoryTiles: { token: keyof typeof categoryColors; label: string }[] = [
    { token: "brick", label: "Eat & Drink" }, { token: "lake", label: "Home & Property" },
    { token: "sunset", label: "Health & Wellness" }, { token: "lavender", label: "Family" },
    { token: "navy", label: "Outdoor" }, { token: "plum", label: "Shopping" }, { token: "lake", label: "Professional Services" },
  ];
  const badges: { token: keyof typeof categoryColors; label: string }[] = [
    { token: "navy", label: "Things to Do" }, { token: "navy", label: "Local News" }, { token: "sage", label: "Guides & Resources" },
    { token: "brick", label: "Business Spotlight" }, { token: "slate", label: "Seasonal" }, { token: "sky", label: "Community" },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-[var(--container-max)] space-y-12 px-4 py-10 sm:px-8">
      <header>
        <h1 className="text-4xl font-bold">Styleguide</h1>
        <p className="mt-2 text-text-muted">Development only. Tokens extracted from /design; see docs/DESIGN_TOKENS.md.</p>
      </header>

      <section aria-labelledby="sg-type">
        <h2 id="sg-type" className="mb-4 text-2xl font-bold">Type</h2>
        <div className="space-y-3 rounded-card bg-surface-card p-6 shadow-card">
          <p className="font-heading text-5xl font-bold">Find Local. Discover More.</p>
          <p className="font-heading text-3xl font-semibold">The Latest from Star Valley</p>
          <p className="text-lg text-text-body">Body: Whether you&apos;re a local or just visiting, Star Valley has something for everyone.</p>
          <p className="text-text-muted">Muted: From fall hikes and local events to great food and family fun.</p>
          <p className="text-sm text-text-subtle">Subtle: Oct 22, 2026 · 2 min read</p>
          <p><a href="#sg-type">An inline link</a> and <span className="font-medium text-brand-text">brand text on cream</span></p>
        </div>
      </section>

      <section aria-labelledby="sg-buttons">
        <h2 id="sg-buttons" className="mb-4 text-2xl font-bold">Buttons, badges, focus</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-card bg-surface-card p-6 shadow-card">
          <button className="rounded-button bg-brand px-5 py-2.5 font-semibold text-brand-contrast hover:bg-brand-hover">List Your Business</button>
          <button className="rounded-button bg-navy-700 px-5 py-2.5 font-semibold text-white hover:bg-navy-800">View Public Listing</button>
          <button className="rounded-button border border-border bg-surface-card px-5 py-2.5 font-semibold text-text hover:bg-surface-muted">Directions</button>
          <span className="rounded-chip bg-featured-bg px-2.5 py-1 text-xs font-bold uppercase text-on-light-accent">Featured</span>
          <span className="rounded-chip bg-gold-bg px-2.5 py-1 text-xs font-bold uppercase text-on-light-accent">Gold Verified</span>
          <span className="rounded-chip bg-verified-bg px-2.5 py-1 text-xs font-bold uppercase text-verified-text">Verified</span>
          <span className="rounded-chip bg-verified-solid px-2.5 py-1 text-xs font-bold uppercase text-white">Verified</span>
          <a href="#sg-buttons" className="rounded-button px-3 py-2 font-medium">Tab here: visible focus ring</a>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b.label} className="rounded-pill px-3 py-1 text-xs font-bold uppercase tracking-wide"
              style={{ background: categoryColors[b.token].bg, color: categoryColors[b.token].fg }}>{b.label}</span>
          ))}
        </div>
      </section>

      <section aria-labelledby="sg-tiles">
        <h2 id="sg-tiles" className="mb-4 text-2xl font-bold">Category tiles</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {categoryTiles.map((t, i) => (
            <li key={i} className="flex aspect-[4/3] items-end rounded-card p-3 text-sm font-semibold shadow-card"
              style={{ background: categoryColors[t.token].bg, color: categoryColors[t.token].fg }}>{t.label}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sg-colors">
        <h2 id="sg-colors" className="mb-4 text-2xl font-bold">Palette</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Object.entries(palette).map(([name, hex]) => (
            <li key={name} className="overflow-hidden rounded-card bg-surface-card shadow-card">
              <div className="h-14 border-b border-border" style={{ background: hex }} />
              <p className="px-3 pt-2 text-sm font-semibold text-text">{name}</p>
              <p className="px-3 pb-2 text-xs text-text-muted">{hex}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sg-contrast">
        <h2 id="sg-contrast" className="mb-4 text-2xl font-bold">Contrast (WCAG 2.1 AA)</h2>
        <div className="overflow-x-auto rounded-card bg-surface-card shadow-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Contrast ratio of every foreground and background pairing used in the UI</caption>
            <thead className="bg-surface-muted text-text">
              <tr><th scope="col" className="px-4 py-2">Pairing</th><th scope="col" className="px-4 py-2">Ratio</th><th scope="col" className="px-4 py-2">Needs</th><th scope="col" className="px-4 py-2">Result</th></tr>
            </thead>
            <tbody>
              {pairings.map((p) => {
                const r = contrastRatio(resolve(p.fg), resolve(p.bg));
                return (
                  <tr key={p.name} className="border-t border-border">
                    <th scope="row" className="px-4 py-2 font-medium text-text">{p.name}</th>
                    <td className="px-4 py-2">{r.toFixed(2)}:1</td><td className="px-4 py-2">{p.min}:1</td>
                    <td className="px-4 py-2 font-semibold">{r >= p.min ? "Pass" : "FAIL"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-text-muted">{Object.keys(semantic).length} semantic tokens, {Object.keys(palette).length} palette colours.</p>
      </section>
    </main>
  );
}
