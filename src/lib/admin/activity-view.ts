// The staff "Listing performance" card: counts for a period, change against the period before, and a sentence for the sales pitch.
export interface Activity {
  days: number; current: Record<string, number>; previous: Record<string, number>; visitors: number;
  top_searches: { query: string; n: number }[]; first_event_at: string | null;
}
const ROWS: [string, string][] = [
  ["profile_view", "Profile views"], ["phone_click", "Calls (taps on Call)"], ["website_click", "Website clicks"], ["directions_click", "Directions taps"],
  ["quote_request", "Quote requests"], ["search_appearance", "Times shown in search and listings"], ["deal_view", "Deal views"],
];
const n = (o: Record<string, number> | undefined, k: string) => (o && Number.isFinite(o[k]) ? Math.max(0, Math.trunc(o[k])) : 0);
const plural = (c: number, one: string, many: string) => `${c.toLocaleString("en-US")} ${c === 1 ? one : many}`;

/** "+12 vs the 30 days before", "no change", "new" (nothing before), or "" when both are zero. */
export function change(cur: number, prev: number, days: number): string {
  if (cur === 0 && prev === 0) return "";
  if (prev === 0) return "new";
  if (cur === prev) return "no change";
  return `${cur > prev ? "+" : "−"}${Math.abs(cur - prev).toLocaleString("en-US")} vs the ${days} days before`;
}

export function activityView(a: Activity) {
  const rows = ROWS.map(([key, label]) => ({ key, label, count: n(a.current, key), change: change(n(a.current, key), n(a.previous, key), a.days) }));
  const views = n(a.current, "profile_view"), calls = n(a.current, "phone_click"), web = n(a.current, "website_click");
  const empty = rows.every((r) => r.count === 0);
  // The line staff can say or paste: only true, only non-zero parts.
  const parts = [views > 0 && plural(views, "view", "views"), calls > 0 && plural(calls, "call tap", "call taps"), web > 0 && plural(web, "website click", "website clicks")].filter(Boolean) as string[];
  const pitch = parts.length ? `In the last ${a.days} days this listing got ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}.` : null;
  return { rows, empty, visitors: Math.max(0, Math.trunc(a.visitors) || 0), pitch, topSearches: (a.top_searches ?? []).slice(0, 5), since: a.first_event_at };
}
