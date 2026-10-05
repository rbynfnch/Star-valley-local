import Image from "next/image";
import Link from "next/link";
import { formatEventDay, formatTimeRange } from "@/lib/format";
import type { ArticleCard } from "@/lib/content/articles";
import type { DealCard } from "@/lib/content/deals";
import type { EventItem } from "@/lib/content/events";
import { categoryStyle } from "@/components/directory/CategoryTile";

export function EventRow({ ev, tz }: { ev: EventItem; tz: string }) {
  const day = formatEventDay(ev.start, tz);
  return (
    <li className="overflow-hidden rounded-card bg-surface-card shadow-card">
      <Link href={`/events/${ev.slug}`} className="flex gap-4 p-4 hover:bg-surface-muted">
        <time dateTime={ev.start.toISOString()} className="flex w-16 shrink-0 flex-col items-center self-start rounded-chip bg-surface-inverse py-2 text-text-on-inverse">
          <span className="text-xs font-bold tracking-wide">{day.month}</span>
          <span className="font-heading text-2xl font-bold leading-none">{day.day}</span>
          <span className="text-[0.7rem] font-semibold opacity-90">{day.weekday}</span>
        </time>
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-bold leading-snug [overflow-wrap:anywhere]">{ev.title}</h3>
          {ev.where && <p className="text-sm text-text-muted [overflow-wrap:anywhere]">{ev.where}</p>}
          <p className="text-sm text-text-muted">
            {formatTimeRange(ev.start, ev.end, tz, ev.allDay)}
            {ev.repeatText && <span className="ml-2 rounded-chip bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-text-body">{ev.repeatText}</span>}
          </p>
          {ev.category && <p className="mt-1"><span style={categoryStyle(ev.categoryColor)} className="rounded-chip px-2 py-0.5 text-xs font-semibold">{ev.category}</span></p>}
        </div>
      </Link>
    </li>
  );
}

export function DealItem({ d }: { d: DealCard }) {
  return (
    <li className="flex flex-col gap-2 rounded-card bg-surface-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {d.badge && <span className="rounded-chip bg-featured-bg px-2 py-0.5 text-xs font-bold tracking-wide text-on-light-accent">{d.badge}</span>}
        {d.endsSoon && <span className="rounded-chip bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-body">Ends soon</span>}
      </div>
      <h3 className="font-heading text-xl font-bold leading-snug [overflow-wrap:anywhere]">{d.title}</h3>
      <p className="text-sm text-text-muted [overflow-wrap:anywhere]">
        <Link href={`/business/${d.businessSlug}`} className="font-semibold text-link underline underline-offset-4">{d.businessName}</Link>
        {[d.categoryName, d.communityName].filter(Boolean).length > 0 && <> · {[d.categoryName, d.communityName].filter(Boolean).join(" · ")}</>}
      </p>
      {d.description && <p className="text-text-body [overflow-wrap:anywhere]">{d.description}</p>}
      <p className="mt-auto pt-1 text-sm text-text-muted">{d.validText}</p>
      {d.terms && <p className="text-xs text-text-muted [overflow-wrap:anywhere]">{d.terms}</p>}
      <p><Link href={`/business/${d.businessSlug}#deals`} className="inline-block rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">View deal<span className="sr-only"> from {d.businessName}</span></Link></p>
    </li>
  );
}

export function ArticleTile({ a, priority = false }: { a: ArticleCard; priority?: boolean }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-card bg-surface-card shadow-card">
      <Link href={`/articles/${a.slug}`} className="relative block aspect-[16/9] bg-surface-muted" tabIndex={-1} aria-hidden="true">
        {a.image && <Image src={a.image.url} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" priority={priority} className="object-cover" />}
        {a.categoryName && <span style={categoryStyle(a.categoryColor)} className="absolute left-3 top-3 rounded-pill px-3 py-1 text-xs font-bold uppercase tracking-wide">{a.categoryName}</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-sm text-text-muted"><time dateTime={a.date}>{a.dateText}</time></p>
        <h3 className="font-heading text-xl font-bold leading-snug [overflow-wrap:anywhere]"><Link href={`/articles/${a.slug}`} className="text-text hover:underline underline-offset-4">{a.title}</Link></h3>
        {a.excerpt && <p className="text-text-body [overflow-wrap:anywhere]">{a.excerpt}</p>}
        <p className="mt-auto pt-2 text-sm text-text-muted">{[a.authorName && `By ${a.authorName}`, a.readText].filter(Boolean).join(" · ")}</p>
      </div>
    </li>
  );
}
