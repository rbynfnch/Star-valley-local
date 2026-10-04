import Link from "next/link";
import { buildBusinessesUrl, hasActiveFilters, type SearchFilters } from "@/lib/directory/search-params";

type Named = { slug: string; name: string };

export function ActiveFilters({ filters, communities, categories }: { filters: SearchFilters; communities: Named[]; categories: Named[] }) {
  if (!hasActiveFilters(filters)) return null;
  const chips: { key: string; label: string; url: string }[] = [];
  const drop = (o: Partial<SearchFilters>) => buildBusinessesUrl(filters, { ...o, page: 1 });
  if (filters.q) chips.push({ key: "q", label: `"${filters.q}"`, url: drop({ q: "" }) });
  for (const s of filters.communities) chips.push({ key: `c-${s}`, label: communities.find((c) => c.slug === s)?.name ?? s, url: drop({ communities: filters.communities.filter((x) => x !== s) }) });
  for (const s of filters.categories) chips.push({ key: `k-${s}`, label: categories.find((c) => c.slug === s)?.name ?? s, url: drop({ categories: filters.categories.filter((x) => x !== s) }) });
  if (filters.featured) chips.push({ key: "featured", label: "Featured only", url: drop({ featured: false }) });
  if (filters.verified) chips.push({ key: "verified", label: "Verified only", url: drop({ verified: false }) });
  if (filters.deals) chips.push({ key: "deals", label: "Deals & offers", url: drop({ deals: false }) });
  if (filters.quotes) chips.push({ key: "quotes", label: "Accepts quote requests", url: drop({ quotes: false }) });
  for (const n of filters.price) chips.push({ key: `p-${n}`, label: n === 0 ? "Free" : "$".repeat(n), url: drop({ price: filters.price.filter((x) => x !== n) }) });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters" role="group">
      {chips.map((c) => (
        <Link key={c.key} href={c.url} className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-3 py-1 text-sm font-medium text-text hover:bg-border">
          {c.label}<span aria-hidden="true">×</span><span className="sr-only"> (remove filter)</span>
        </Link>
      ))}
      <Link href="/businesses" className="text-sm font-semibold underline underline-offset-4">Clear all</Link>
    </div>
  );
}
