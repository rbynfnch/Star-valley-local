import { createHash } from "node:crypto";

// Helpers for /api/track. Everything is validated again by record_tracking in the database.

/** Crawlers, link previewers, headless browsers and scripts. A missing User-Agent counts as a bot. */
const BOT = /bot\b|crawl|spider|slurp|facebookexternalhit|embedly|preview|fetch|monitor|uptime|pingdom|lighthouse|headless|phantom|puppeteer|playwright|selenium|curl\/|wget|python-requests|python-urllib|aiohttp|go-http-client|java\/|okhttp|libwww|httpclient|node-fetch|axios|postman|scrapy|gptbot|claudebot|ccbot|bytespider|ahrefs|semrush|mj12|dotbot/i;
export const isBot = (ua: string | null | undefined): boolean => !ua || ua.length < 10 || ua.length > 600 || BOT.test(ua);

/** Do Not Track and Global Privacy Control are honoured: nothing is recorded. */
export const optedOut = (h: { get(name: string): string | null }): boolean => h.get("dnt") === "1" || h.get("sec-gpc") === "1";

/**
 * An anonymous visitor id that only lasts a day: salted hash of (day, tenant, ip, user agent). The IP is used here and never stored,
 * and the id cannot be linked from one day to the next.
 */
export function sessionHash(o: { salt: string; day: string; tenant: string; ip: string; ua: string }): string {
  return createHash("sha256").update([o.salt, o.day, o.tenant, o.ip, o.ua].join("\u0000")).digest("hex").slice(0, 32);
}
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CLIENT_TYPES = ["profile_view", "website_click", "phone_click", "directions_click", "search_appearance", "deal_view", "article_view"] as const;
const SURFACES = ["home", "search", "category", "community", "category_community", "profile", "things_to_do", "deals"];
export const MAX_BODY = 16_384;
export const MAX_EVENTS = 50;

export interface TrackEvent { type: string; business_id?: string; deal_id?: string; article_id?: string; community_id?: string; category_id?: string; query?: string; surface?: string }
export interface TrackBody { events: TrackEvent[]; referrer: string | null }

/** The request body, or null if it is not a track request. Bad individual events are dropped, not fatal. */
export function parseTrackBody(text: string): TrackBody | null {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_BODY) return null;
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== "object" || !Array.isArray((j as { events?: unknown }).events)) return null;
  const events: TrackEvent[] = [];
  for (const raw of (j as { events: unknown[] }).events.slice(0, MAX_EVENTS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.type !== "string" || !(CLIENT_TYPES as readonly string[]).includes(r.type)) continue;
    const e: TrackEvent = { type: r.type };
    let bad = false;
    for (const k of ["business_id", "deal_id", "article_id", "community_id", "category_id"] as const) {
      const v = r[k];
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && UUID.test(v)) e[k] = v.toLowerCase(); else bad = true;
    }
    if (bad) continue;
    if (typeof r.query === "string") e.query = r.query.slice(0, 400);
    if (typeof r.surface === "string" && SURFACES.includes(r.surface)) e.surface = r.surface;
    events.push(e);
  }
  const ref = (j as { referrer?: unknown }).referrer;
  return { events, referrer: typeof ref === "string" && /^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$/i.test(ref) ? ref.toLowerCase() : null };
}

/** The referring site's host, or null when the visitor came from this site or from nowhere. Never the path or query. */
export function referrerHost(referrer: string | null | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  try { const h = new URL(referrer).hostname.toLowerCase(); return h && h !== ownHost.toLowerCase().split(":")[0] ? h : null; } catch { return null; }
}
