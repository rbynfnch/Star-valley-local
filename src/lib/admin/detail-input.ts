import { zonedToUtc } from "../events/recurrence.ts";
import { STAGES } from "./list-params.ts";

// Validate what the business-detail forms post, before anything reaches the database. The database re-checks everything
// (these only give friendly messages and drop junk early).
export const COMM_KINDS = ["note", "call", "visit", "dm", "email", "sms", "meeting", "postcard"] as const;
export const OUTCOMES = ["visited", "claimed_together", "pitched", "follow_up"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };
// Browsers submit textarea newlines as CRLF (HTML spec); store plain LF.
const clean = (s: string, max: number) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

export function parseStageInput(f: FormData): Result<{ business: string; stage: (typeof STAGES)[number]; lostReason: string | null }> {
  const business = str(f, "business");
  if (!isUuid(business)) return { ok: false, error: "Unknown business." };
  const stage = (STAGES as readonly string[]).includes(str(f, "stage")) ? (str(f, "stage") as (typeof STAGES)[number]) : null;
  if (!stage) return { ok: false, error: "Choose a lead stage." };
  const reason = clean(str(f, "lost_reason"), 500);
  return { ok: true, value: { business, stage, lostReason: stage === "lost" && reason ? reason : null } };
}

export function parseCommInput(f: FormData, tz: string, now = new Date()): Result<{ business: string; kind: (typeof COMM_KINDS)[number]; subject: string | null; body: string | null; outcome: (typeof OUTCOMES)[number] | null; followUpAt: string | null }> {
  const business = str(f, "business");
  if (!isUuid(business)) return { ok: false, error: "Unknown business." };
  const kind = (COMM_KINDS as readonly string[]).includes(str(f, "kind")) ? (str(f, "kind") as (typeof COMM_KINDS)[number]) : null;
  if (!kind) return { ok: false, error: "Choose what kind of entry this is." };
  const outcomeRaw = str(f, "outcome");
  const outcome = (OUTCOMES as readonly string[]).includes(outcomeRaw) ? (outcomeRaw as (typeof OUTCOMES)[number]) : null;
  if (outcomeRaw && !outcome) return { ok: false, error: "Unknown visit outcome." };
  if (outcome && kind !== "visit") return { ok: false, error: "An outcome only applies to a visit." };
  const subject = clean(str(f, "subject"), 200) || null;
  const body = clean(str(f, "body"), 5000) || null;
  if (!subject && !body && !outcome) return { ok: false, error: "Write something, or pick a visit outcome." };
  let followUpAt: string | null = null;
  const d = str(f, "follow_up");
  if (d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return { ok: false, error: "Follow-up must be a date." };
    const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const check = new Date(Date.UTC(y, mo - 1, da));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return { ok: false, error: "Follow-up must be a real date." };
    const at = zonedToUtc({ y, m: mo, d: da, h: 9, mi: 0 }, tz);   // 9:00 AM in the tenant's own timezone
    if (at.getTime() < now.getTime() - 24 * 3600 * 1000) return { ok: false, error: "Follow-up date is in the past." };
    followUpAt = at.toISOString();
  }
  return { ok: true, value: { business, kind, subject, body, outcome, followUpAt } };
}
