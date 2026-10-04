import type { SearchResult, SearchRow } from "./types.ts";

/** search_businesses() repeats the full match count on every row (count(*) over ()); split it off. bigint may arrive as a string. */
export function splitSearchRows(raw: (SearchRow & { total_count: number | string })[]): SearchResult {
  const total = raw.length ? Number(raw[0].total_count) : 0;
  const rows = raw.map((r) => {
    const row: Record<string, unknown> = { ...r };
    delete row.total_count;
    return row as unknown as SearchRow;
  });
  return { rows, total: Number.isFinite(total) ? total : 0 };
}
