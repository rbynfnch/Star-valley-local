import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { isBot, optedOut, parseTrackBody, referrerHost, sessionHash, utcDay, MAX_BODY } from "@/lib/tracking/input";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";

export const dynamic = "force-dynamic";

// Event tracking beacon (CLAUDE.md §9). Always answers 204 and never says why something was not recorded: bots, Do Not Track /
// Global Privacy Control, staff and owners, noise and failures all look the same from outside. No cookies are set and no IP address
// is stored; the visitor id is a salted hash that changes every day.
const drop = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });

/** Reads at most `max` bytes of the body (a missing or false content-length cannot make us buffer more). null = too large. */
async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(req: Request) {
  try {
    const h = await headers();
    if (isBot(h.get("user-agent")) || optedOut(h)) return drop();
    const host = (h.get("host") ?? "").toLowerCase();
    const origin = h.get("origin");
    if (origin) { try { if (new URL(origin).host.toLowerCase() !== host) return drop(); } catch { return drop(); } }     // same-site beacons only
    const site = h.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "same-site") return drop();                              // browsers say where a request came from; a page beacon is same-origin
    if (Number(h.get("content-length") ?? 0) > MAX_BODY) return drop();
    const text = await readCapped(req, MAX_BODY);
    if (text === null) return drop();
    const body = parseTrackBody(text);
    if (!body || body.events.length === 0) return drop();
    const tenant = await getTenant();
    if (!tenant) return drop();
    const salt = process.env.TRACKING_SALT;
    if (process.env.NODE_ENV === "production" && (!salt || salt.length < 16)) return drop();            // fail closed: no salt, no tracking

    // Who is looking? A signed-in staff member or owner is not counted (the database decides; we only pass the id along).
    let userId: string | null = null;
    if (authConfigured() && (await cookies()).getAll().some((c) => c.name.startsWith("sb-"))) {
      userId = (await (await createUserClient()).auth.getUser()).data.user?.id ?? null;
    }
    // The client address as the platform reports it. The LAST x-forwarded-for entry was added by our own proxy; the first can be
    // anything the visitor typed, so using it would let a script mint a new "visitor" per request.
    const xff = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const ip = h.get("x-real-ip")?.trim() || xff.at(-1) || "unknown";
    const session = sessionHash({ salt: salt ?? "dev-only-salt", day: utcDay(), tenant: tenant.id, ip, ua: h.get("user-agent") ?? "" });
    const ref = referrerHost(body.referrer ? `https://${body.referrer}/` : null, host);
    const { error } = await createServiceClient().rpc("record_tracking", {
      p_tenant: tenant.id, p_events: body.events, p_session: session, p_referrer: ref, p_user: userId,
    });
    void error;                                                                                          // a failed insert must never reach the visitor
  } catch { /* tracking never breaks a page */ }
  return drop();
}
