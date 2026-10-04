import Link from "next/link";
import { buildBusinessesUrl, pageWindow, type SearchFilters } from "@/lib/directory/search-params";

export function Pagination({ filters, totalPages }: { filters: SearchFilters; totalPages: number }) {
  if (totalPages <= 1) return null;
  const cur = filters.page;
  const item = "inline-flex min-w-10 items-center justify-center rounded-button border border-border bg-surface-card px-3 py-2 text-sm font-semibold text-text hover:bg-surface-muted";
  return (
    <nav aria-label="Pagination" className="mt-8">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {cur > 1 && <li><Link href={buildBusinessesUrl(filters, { page: cur - 1 })} rel="prev" className={item}>Previous<span className="sr-only"> page</span></Link></li>}
        {pageWindow(cur, totalPages).map((p, i) => p === "gap"
          ? <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-text-muted">…</li>
          : <li key={p}>
              {p === cur
                ? <span aria-current="page" className="inline-flex min-w-10 items-center justify-center rounded-button bg-surface-inverse px-3 py-2 text-sm font-bold text-text-on-inverse">{p}<span className="sr-only"> (current page)</span></span>
                : <Link href={buildBusinessesUrl(filters, { page: p })} className={item}><span className="sr-only">Page </span>{p}</Link>}
            </li>)}
        {cur < totalPages && <li><Link href={buildBusinessesUrl(filters, { page: cur + 1 })} rel="next" className={item}>Next<span className="sr-only"> page</span></Link></li>}
      </ul>
    </nav>
  );
}
