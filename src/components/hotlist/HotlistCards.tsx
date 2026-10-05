import Image from "next/image";
import Link from "next/link";
import { BADGE_LABELS, STATE_LABELS, categoryLabel, dealFacts, dealState, remaining, timeLeft, type DealState, type HotlistBadge } from "@/lib/hotlist/model";
import type { HotlistListRow } from "@/lib/directory/types";
import type { CardData } from "@/lib/hotlist/view";
import { FlameMark } from "./Flame";

export type { CardData } from "@/lib/hotlist/view";

export function Badge({ badge }: { badge: HotlistBadge }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip bg-hotlist-bg px-2.5 py-1 text-xs font-semibold text-hotlist-text shadow-sm ring-1 ring-black/15">
      <FlameMark height={12} />{BADGE_LABELS[badge]}
    </span>
  );
}

export function StateTag({ state, left }: { state: DealState | null; left?: number | null }) {
  if (!state || state === "active") return null;
  const text = state === "limited" && left !== null && left !== undefined ? `Only ${left} left` : STATE_LABELS[state];
  const tone = state === "sold_out" || state === "expired" ? "bg-charcoal text-white" : "bg-white text-text";
  return <span className={`rounded-chip px-2.5 py-1 text-xs font-semibold ${tone}`}>{text}</span>;
}

/** What you get, what you save, when it ends: always the same three lines, in the same place. */
export function Facts({ row, tz, now, large = false, inverse = false }: { row: HotlistListRow; tz: string; now: Date; large?: boolean; inverse?: boolean }) {
  const strong = inverse ? "text-white" : "text-text", soft = inverse ? "text-text-on-inverse" : "text-text-muted";
  const f = dealFacts(row, tz);
  if (!f) return null;
  const left = timeLeft(row.ends_at, now, tz);
  return (
    <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <div><dt className="sr-only">Hotlist price</dt><dd className={`font-heading font-bold ${strong} ${large ? "text-4xl" : "text-2xl"}`}>{f.price}</dd></div>
      <div><dt className="sr-only">Value</dt><dd className={`text-sm ${soft}`}>{f.value}</dd></div>
      <div><dt className="sr-only">Savings</dt><dd className={`text-sm font-semibold ${strong}`}>{f.save}</dd></div>
      {left && <div className="basis-full"><dt className="sr-only">When it ends</dt><dd className={`text-sm ${soft}`}>{left === "Ended" ? "Ended" : `${f.ends} · ${left}`}</dd></div>}
    </dl>
  );
}

function Photo({ data, sizes, priority, ratio = "aspect-[4/3]" }: { data: CardData; sizes: string; priority?: boolean; ratio?: string }) {
  return (
    <div className={`relative ${ratio} overflow-hidden bg-surface-muted`}>
      {data.image && <Image src={data.image.url} alt={data.image.alt} fill sizes={sizes} priority={priority} className="object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none" />}
    </div>
  );
}

/** A standard grid card. The whole card is one link (the title); the business link sits outside it. */
export function HotlistCard({ data, tz, now, priority = false }: { data: CardData; tz: string; now: Date; priority?: boolean }) {
  const r = data.row, state = dealState(r, now);
  const left = state === "limited" ? remaining(r) : null;
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-card bg-surface-card shadow-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
      <Photo data={data} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" priority={priority} />
      <div className="absolute left-3 top-3 flex flex-wrap gap-2"><Badge badge={r.badge} /><StateTag state={state} left={left} /></div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-sm text-text-muted">{[categoryLabel(r.category), data.town].filter(Boolean).join(" · ")}</p>
        <h3 className="font-heading text-xl font-bold leading-snug [overflow-wrap:anywhere]">
          <Link href={`/hotlist/${r.slug}`} className="text-text after:absolute after:inset-0 after:content-[''] focus:outline-none">{r.title}</Link>
        </h3>
        <p className="text-sm text-text-muted [overflow-wrap:anywhere]">{r.business_name}</p>
        {r.kind === "deal" ? <Facts row={r} tz={tz} now={now} /> : r.summary && <p className="text-text-body [overflow-wrap:anywhere]">{r.summary}</p>}
      </div>
    </li>
  );
}

/** The lead item in "The hottest right now": heavier than the rest. */
export function HottestPrimary({ data, tz, now }: { data: CardData; tz: string; now: Date }) {
  const r = data.row, state = dealState(r, now);
  return (
    <div className="group relative overflow-hidden rounded-card bg-surface-inverse text-text-on-inverse shadow-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand lg:grid lg:grid-cols-5">
      <div className="lg:col-span-3"><Photo data={data} sizes="(min-width: 1024px) 60vw, 100vw" priority ratio="aspect-[16/10] lg:h-full lg:aspect-auto lg:min-h-[22rem]" /></div>
      <div className="absolute left-4 top-4 flex flex-wrap gap-2"><Badge badge={r.badge} /><StateTag state={state} left={state === "limited" ? remaining(r) : null} /></div>
      <div className="flex flex-col justify-center gap-3 p-6 lg:col-span-2 lg:p-8">
        <p className="text-sm text-text-on-inverse">{[categoryLabel(r.category), data.town].filter(Boolean).join(" · ")}</p>
        <h3 className="font-heading text-3xl font-bold leading-tight [overflow-wrap:anywhere]">
          <Link href={`/hotlist/${r.slug}`} className="text-text-on-inverse after:absolute after:inset-0 after:content-[''] focus:outline-none">{r.title}</Link>
        </h3>
        <p className="text-text-on-inverse [overflow-wrap:anywhere]">{r.business_name}{r.summary ? ` · ${r.summary}` : ""}</p>
        {r.kind === "deal" && <Facts row={r} tz={tz} now={now} large inverse />}
        <p className="mt-1"><span className="inline-block rounded-button bg-hotlist-bg px-5 py-2.5 font-semibold text-hotlist-text">{r.kind === "deal" ? "Get deal" : "See the pick"}</span></p>
      </div>
    </div>
  );
}

/** Compact row used by "On the Hotlist this week". */
export function WeekRow({ data, tz }: { data: CardData; tz: string }) {
  const r = data.row, f = dealFacts(r, tz);
  return (
    <li className="group relative flex items-center gap-4 border-b border-border py-4 first:pt-0 last:border-b-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
      <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-card bg-surface-muted sm:h-24 sm:w-32">
        {data.image && <Image src={data.image.url} alt="" fill sizes="128px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-muted">{[categoryLabel(r.category), data.town].filter(Boolean).join(" · ")}</p>
        <h3 className="font-heading text-lg font-bold leading-snug [overflow-wrap:anywhere]">
          <Link href={`/hotlist/${r.slug}`} className="text-text after:absolute after:inset-0 after:content-[''] focus:outline-none">{r.title}</Link>
        </h3>
        <p className="text-sm text-text-muted [overflow-wrap:anywhere]">{r.business_name}</p>
      </div>
      <p className="hidden shrink-0 text-right sm:block">{f ? <><span className="font-heading text-xl font-bold text-text">{f.price}</span><br /><span className="text-sm text-text-muted">{f.save}</span></> : <span className="text-sm font-semibold text-text">Hotlist Pick</span>}</p>
    </li>
  );
}
