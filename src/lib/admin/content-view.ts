// Display helpers for the content editor.
/** A timestamp as the YYYY-MM-DD an <input type="date"> wants, in the tenant's timezone, optionally moved back some days. */
export function dayInput(iso: string | null | undefined, tz: string, backDays = 0): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day") - backDays)).toISOString().slice(0, 10);
}

/** Hours as the form grid wants them: per day, up to `perDay` ranges, each "HH:MM". Anything beyond is dropped. */
export function hoursGrid(rows: { day: number; opens: string; closes: string }[], perDay = 3): { opens: string; closes: string }[][] {
  const grid: { opens: string; closes: string }[][] = Array.from({ length: 7 }, () => []);
  for (const r of rows) if (r.day >= 0 && r.day < 7 && grid[r.day].length < perDay) grid[r.day].push({ opens: r.opens, closes: r.closes });
  return grid;
}
