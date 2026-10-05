import { localInstant } from "./editorial-input.ts";
import { isUuid } from "./detail-input.ts";

// Parser for the Hotlist item form. Friendly messages here; save_hotlist_item / hotlist_clean enforce every rule again.
type Res<T> = { ok: true; value: T } | { ok: false; error: string };
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };
const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const oneLine = (s: string) => clean(s).replace(/\s+/g, " ");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "25", "$25", "24.50", "1,200" -> cents. Anything else (negative, three decimals, words) is null. */
export function dollarsToCents(raw: string): number | null {
  const s = raw.replace(/[\s$,]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const centsToDollars = (c: number | null | undefined): string => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

export interface HotlistInput {
  id: string | null; businessSlug: string; status: "draft" | "pending" | "published" | "archived";
  fields: Record<string, string | number | null>;
}
const STATUSES = ["draft", "pending", "published", "archived"] as const;

export function parseHotlistInput(f: FormData, tz: string, now = new Date()): Res<HotlistInput> {
  const idRaw = str(f, "id"); const id = idRaw ? idRaw : null;
  if (id && !isUuid(id)) return { ok: false, error: "Unknown item." };
  const kind = str(f, "kind") === "pick" ? "pick" : "deal";
  const businessSlug = oneLine(str(f, "business")).toLowerCase();
  if (!SLUG.test(businessSlug)) return { ok: false, error: "Enter the business's web address name (for example sample-creekside-cafe)." };
  const status = STATUSES.find((s) => s === str(f, "status")) ?? "draft";
  const title = oneLine(str(f, "title"));
  if (title.length < 3) return { ok: false, error: "The title is too short." };
  const startDate = str(f, "start_date").trim();
  const starts = startDate ? localInstant(startDate, "", tz) : now;
  if (!starts) return { ok: false, error: "The start date is not valid." };
  const endDate = str(f, "end_date").trim();
  // "Through that day": stored as the start of the next local day, the same convention as deals elsewhere.
  const endsDay = endDate ? localInstant(endDate, "", tz) : null;
  if (endDate && !endsDay) return { ok: false, error: "The end date is not valid." };
  const ends = endsDay ? new Date(endsDay.getTime() + 36 * 3600_000) : null;
  let endIso: string | null = null;
  if (ends) { const next = localInstant(new Date(ends).toISOString().slice(0, 10), "", tz); endIso = (next && next > endsDay! ? next : new Date(endsDay!.getTime() + 24 * 3600_000)).toISOString(); }
  const fields: HotlistInput["fields"] = {
    kind, category: str(f, "category"), badge: kind === "pick" ? "hotlist_pick" : str(f, "badge"), title,
    summary: oneLine(str(f, "summary")) || null, body: clean(str(f, "body")) || null, terms: clean(str(f, "terms")) || null,
    starts_at: starts.toISOString(), ends_at: endIso,
  };
  if (kind === "deal") {
    const orig = dollarsToCents(str(f, "original")), price = dollarsToCents(str(f, "price"));
    if (orig === null || price === null) return { ok: false, error: "Enter the original value and the Hotlist price in dollars, like 40 or 24.50." };
    const qtyRaw = str(f, "quantity").trim();
    const qty = qtyRaw ? Number(qtyRaw) : null;
    if (qty !== null && (!Number.isInteger(qty) || qty < 1 || qty > 10000)) return { ok: false, error: "The quantity is a whole number from 1 to 10,000, or blank for unlimited." };
    Object.assign(fields, { original_cents: orig, price_cents: price, quantity: qty, code_prefix: oneLine(str(f, "code_prefix")).toUpperCase(), redemption: clean(str(f, "redemption")) });
  }
  return { ok: true, value: { id, businessSlug, status, fields } };
}

export const slotFromForm = (v: unknown): "hottest" | "this_week" | "business" | null => (v === "hottest" || v === "this_week" || v === "business" ? v : null);
export const SLOT_LIMITS = { hottest: 3, this_week: 8, business: 1 } as const;
export function parseFeatureIds(f: FormData, slot: keyof typeof SLOT_LIMITS): Res<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= SLOT_LIMITS[slot]; i++) { const v = str(f, `item_${i}`).trim(); if (v) { if (!isUuid(v)) return { ok: false, error: "Unknown item." }; ids.push(v); } }
  if (new Set(ids).size !== ids.length) return { ok: false, error: "An item can only appear once in a slot." };
  return { ok: true, value: ids };
}
