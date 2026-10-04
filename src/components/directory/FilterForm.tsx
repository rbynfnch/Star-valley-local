import Link from "next/link";
import type { SearchFilters } from "@/lib/directory/search-params";

export const FORM_ID = "directory-form";
type Named = { slug: string; name: string };

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-border pt-4">
      <legend className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-text">{legend}</legend>
      <div className="space-y-1.5">{children}</div>
    </fieldset>
  );
}
function Check({ name, value, label, checked, extra }: { name: string; value: string; label: string; checked: boolean; extra?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-text-body">
      <input type="checkbox" form={FORM_ID} name={name} value={value} defaultChecked={checked} className="size-4 accent-[var(--surface-inverse)]" />
      <span>{label}{extra && <span className="sr-only"> {extra}</span>}</span>
    </label>
  );
}

// All controls belong to the one GET <form id="directory-form"> via the `form` attribute, so the banner search box and
// this sidebar submit together, with no JavaScript. Deliberately NOT auto-submitting on change (that is disorienting
// for keyboard and screen-reader users); there is an Apply button.
export function FilterForm({ filters, communities, categories }: { filters: SearchFilters; communities: Named[]; categories: Named[] }) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="dir-sort" className="mb-1 block text-sm font-bold uppercase tracking-wide text-text">Sort by</label>
        <select id="dir-sort" form={FORM_ID} name="sort" defaultValue={filters.sort} className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-text">
          <option value="relevance">Most relevant</option>
          <option value="name">Name (A to Z)</option>
        </select>
      </div>
      <Group legend="Location">
        {communities.map((c) => <Check key={c.slug} name="community" value={c.slug} label={c.name} checked={filters.communities.includes(c.slug)} />)}
      </Group>
      <Group legend="Category">
        {categories.map((c) => <Check key={c.slug} name="category" value={c.slug} label={c.name} checked={filters.categories.includes(c.slug)} />)}
      </Group>
      <Group legend="Business type">
        <Check name="featured" value="1" label="Featured only" checked={filters.featured} />
        <Check name="verified" value="1" label="Verified only" checked={filters.verified} />
        <Check name="deals" value="1" label="Deals & offers" checked={filters.deals} />
        <Check name="quotes" value="1" label="Accepts quote requests" checked={filters.quotes} />
      </Group>
      <Group legend="Price range">
        <Check name="price" value="0" label="Free" checked={filters.price.includes(0)} />
        <Check name="price" value="1" label="$" extra="(inexpensive)" checked={filters.price.includes(1)} />
        <Check name="price" value="2" label="$$" extra="(moderate)" checked={filters.price.includes(2)} />
        <Check name="price" value="3" label="$$$" extra="(expensive)" checked={filters.price.includes(3)} />
      </Group>
      <div className="flex items-center gap-4 border-t border-border pt-4">
        <button type="submit" form={FORM_ID} className="rounded-button bg-brand px-5 py-2.5 font-semibold text-brand-contrast hover:bg-brand-hover">Apply filters</button>
        <Link href="/businesses" className="font-semibold underline underline-offset-4">Clear</Link>
      </div>
    </div>
  );
}
