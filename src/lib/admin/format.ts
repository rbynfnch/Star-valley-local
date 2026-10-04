/** "Oct 4, 2026, 9:00 AM" in the tenant's timezone; "–" for missing or invalid input. */
export function formatStamp(iso: string | null | undefined, tz: string): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d);
}
export function formatDay(iso: string | null | undefined, tz: string): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium" }).format(d);
}
export const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
