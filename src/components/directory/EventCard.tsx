import Link from "next/link";
import { formatEventDay, formatTimeRange } from "@/lib/format";
import type { EventCardModel } from "@/lib/directory/home";
import { categoryStyle } from "./CategoryTile";

export function EventCard({ ev, tz }: { ev: EventCardModel; tz: string }) {
  const day = formatEventDay(ev.start, tz);
  return (
    <li className="overflow-hidden rounded-card bg-surface-card shadow-card">
      <div className="h-2" style={categoryStyle(ev.categoryColor)} aria-hidden />
      <Link href={`/events/${ev.slug}`} className="flex gap-4 p-4 hover:bg-surface-muted">
        <time dateTime={ev.start.toISOString()} className="flex w-14 shrink-0 flex-col items-center self-start rounded-chip bg-surface-inverse py-1.5 text-text-on-inverse">
          <span className="text-xs font-bold tracking-wide">{day.month}</span>
          <span className="font-heading text-2xl font-bold leading-none">{day.day}</span>
        </time>
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-bold leading-snug">{ev.title}</h3>
          {ev.where && <p className="text-sm text-text-muted">{ev.where}</p>}
          <p className="text-sm text-text-muted">
            {formatTimeRange(ev.start, ev.end, tz, ev.allDay)}
            {ev.recurring && <span className="ml-2 rounded-chip bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-text-body">Repeats</span>}
          </p>
        </div>
      </Link>
    </li>
  );
}
