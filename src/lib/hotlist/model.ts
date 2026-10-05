// Local Hotlist: the vocabulary and the rules a page needs. The database owns what is allowed (hotlist_clean) and who may do what;
// this turns rows into labels, states and money text, and is the same code the newsletter block uses.
export type HotlistKind = "deal" | "pick";
export type HotlistCategory = "places" | "eat_drink" | "things_to_do" | "shop" | "new_notable";
export type HotlistBadge = "hot_deal" | "local_exclusive" | "limited_drop" | "hotlist_pick";
export type HotlistSlot = "hottest" | "this_week" | "business";
export type DealState = "active" | "limited" | "ending_soon" | "sold_out" | "expired";

export const CATEGORIES: { value: HotlistCategory; label: string }[] = [
  { value: "places", label: "Places" }, { value: "eat_drink", label: "Eat + Drink" }, { value: "things_to_do", label: "Things to Do" },
  { value: "shop", label: "Shop" }, { value: "new_notable", label: "New + Notable" },
];
export const categoryLabel = (c: string): string => CATEGORIES.find((x) => x.value === c)?.label ?? "Hotlist";
export const isCategory = (v: unknown): v is HotlistCategory => CATEGORIES.some((c) => c.value === v);

export const BADGE_LABELS: Record<HotlistBadge, string> = { hot_deal: "Hot Deal", local_exclusive: "Local Exclusive", limited_drop: "Limited Drop", hotlist_pick: "Hotlist Pick" };
export const DEAL_BADGES: HotlistBadge[] = ["hot_deal", "local_exclusive", "limited_drop"];

export const STATE_LABELS: Record<DealState, string> = { active: "Available now", limited: "Limited", ending_soon: "Ending soon", sold_out: "Sold out", expired: "Ended" };
export const claimable = (s: DealState | null): boolean => s === "active" || s === "limited" || s === "ending_soon";

export interface Offerish { kind: HotlistKind; ends_at: string | null; quantity: number | null; claimed_count: number | string }

/** Where a deal stands right now. Picks have no state. Sold out wins over ending soon: nothing left to claim. */
export function dealState(i: Offerish, now: Date): DealState | null {
  if (i.kind !== "deal") return null;
  const t = now.getTime(), end = i.ends_at ? new Date(i.ends_at).getTime() : null;
  if (end !== null && end <= t) return "expired";
  const claimed = Number(i.claimed_count) || 0;
  if (i.quantity !== null && claimed >= i.quantity) return "sold_out";
  if (end !== null && end - t <= 48 * 3600_000) return "ending_soon";
  if (i.quantity !== null && i.quantity - claimed <= Math.max(3, Math.ceil(i.quantity * 0.25))) return "limited";
  return "active";
}
export const remaining = (i: { quantity: number | null; claimed_count: number | string }): number | null => (i.quantity === null ? null : Math.max(0, i.quantity - (Number(i.claimed_count) || 0)));

export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  const d = cents / 100;
  return Number.isInteger(d) ? `$${d.toLocaleString("en-US")}` : `$${d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const savingsCents = (i: { original_cents: number | null; price_cents: number | null }): number | null => (i.original_cents !== null && i.price_cents !== null ? i.original_cents - i.price_cents : null);

/** The three facts a deal must show clearly: what you get, what you save, when it ends. */
export function dealFacts(i: { original_cents: number | null; price_cents: number | null; ends_at: string | null }, tz: string): { value: string; price: string; save: string; ends: string } | null {
  const s = savingsCents(i);
  if (s === null || i.price_cents === null || i.original_cents === null) return null;
  return { value: `${money(i.original_cents)} value`, price: money(i.price_cents), save: `Save ${money(s)}`, ends: i.ends_at ? `Ends ${endDay(i.ends_at, tz)}` : "" };
}
/** The last day an offer is valid. An end at exactly local midnight is how the editor stores "through that day", so it reads as the day before. */
function lastInstant(iso: string, tz: string): Date {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(d);
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 1);
  return at("hour") === 0 && at("minute") === 0 && at("second") === 0 ? new Date(d.getTime() - 3600_000) : d;
}
export function endDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(lastInstant(iso, tz));
}

/** "Ends today", "Ends tomorrow", "2 days left" … for urgency lines. Calendar days in the tenant's time zone. */
export function timeLeft(iso: string | null, now: Date, tz: string): string | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (end.getTime() <= now.getTime()) return "Ended";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const diff = Math.round((Date.parse(day(lastInstant(iso, tz))) - Date.parse(day(now))) / 86400_000);
  if (diff <= 0) { const h = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 3600_000)); return h <= 6 ? `${h} hour${h === 1 ? "" : "s"} left` : "Ends today"; }
  if (diff === 1) return "Ends tomorrow";
  return `${diff} days left`;
}

export interface HotlistRowLike { id: string; slug: string; kind: HotlistKind; category: HotlistCategory; badge: HotlistBadge; title: string; summary: string | null;
  business_name: string; business_slug: string; community_id: string | null; image_media_id: string | null; starts_at: string; ends_at: string | null;
  original_cents: number | null; price_cents: number | null; quantity: number | null; claimed_count: number | string; published_at: string | null }

/** Share text for the Web Share sheet, copy-link and social posts. */
export function shareText(i: { title: string; business_name: string; kind: HotlistKind; price_cents: number | null; original_cents: number | null }): string {
  return i.kind === "deal" && i.price_cents !== null && i.original_cents !== null
    ? `${i.title} at ${i.business_name}: ${money(i.price_cents)} (${money(i.original_cents)} value). On the Local Hotlist.`
    : `${i.title} at ${i.business_name}. On the Local Hotlist.`;
}
