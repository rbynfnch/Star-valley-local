import { mediaUrl } from "../media.ts";
import type { Community, HotlistFeatureRow, HotlistListRow, MediaRow } from "../directory/types.ts";

export interface CardData { row: HotlistListRow; image: { url: string; alt: string } | null; town: string | null }

/** Joins a Hotlist row with its photo and the business's town. Missing photos stay null: the card shows an empty tile, never a broken image. */
export function toCards(rows: HotlistListRow[], media: MediaRow[], communities: Community[], mediaBase: string | null): CardData[] {
  const m = new Map(media.map((x) => [x.id, x])), c = new Map(communities.map((x) => [x.id, x.name]));
  return rows.map((row) => {
    const a = row.image_media_id ? m.get(row.image_media_id) : undefined;
    const url = a ? mediaUrl(mediaBase, a.storage_bucket, a.storage_path) : null;
    return { row, image: a && url ? { url, alt: a.alt_text ?? "" } : null, town: row.community_id ? c.get(row.community_id) ?? null : null };
  });
}

export interface Landing { hottest: CardData[]; deals: CardData[]; picks: CardData[]; week: CardData[]; business: CardData | null }

/** The curated landing page. Slots come from the editors' lists (in their order); "Hot deals" and "Hotlist picks" are the newest live items
 *  not already shown in "hottest" or as the Hotlist business, so the page never repeats itself. */
export function buildLanding(all: CardData[], features: HotlistFeatureRow[]): Landing {
  const byId = new Map(all.map((c) => [c.row.id, c]));
  const slot = (s: HotlistFeatureRow["slot"]) => features.filter((f) => f.slot === s).sort((a, b) => a.position - b.position).map((f) => byId.get(f.item_id)).filter((c): c is CardData => !!c);
  const hottest = slot("hottest").slice(0, 3), week = slot("this_week").slice(0, 8), business = slot("business")[0] ?? null;
  const shown = new Set([...hottest.map((c) => c.row.id), ...(business ? [business.row.id] : [])]);
  return {
    hottest, week, business,
    deals: all.filter((c) => c.row.kind === "deal" && !shown.has(c.row.id)).slice(0, 6),
    picks: all.filter((c) => c.row.kind === "pick" && !shown.has(c.row.id)).slice(0, 6),
  };
}
