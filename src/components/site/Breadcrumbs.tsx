import Link from "next/link";
import type { Crumb } from "@/lib/directory/hub";

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-text-on-inverse">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === crumbs.length - 1
              ? <span aria-current="page" className="font-semibold">{c.name}</span>
              : <Link href={c.path} className="text-text-on-inverse underline underline-offset-4 hover:no-underline">{c.name}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
