import { isUuid } from "./detail-input.ts";

export const KINDS = ["update", "business", "event"] as const;
export const STATUSES = ["pending", "approved", "rejected", "spam"] as const;
export const MOD_PAGE_SIZE = 20;
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export interface ModFilters { status: (typeof STATUSES)[number]; kind: (typeof KINDS)[number] | null; page: number }
export function parseModParams(sp: Raw): ModFilters {
  const status = (STATUSES as readonly string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as ModFilters["status"]) : "pending";
  const kind = (KINDS as readonly string[]).includes(one(sp.kind) ?? "") ? (one(sp.kind) as (typeof KINDS)[number]) : null;
  const n = Number.parseInt(one(sp.page) ?? "1", 10);
  return { status, kind, page: Number.isFinite(n) && n >= 1 ? Math.min(n, 10000) : 1 };
}
export function modQuery(f: ModFilters, over: Partial<ModFilters> = {}): string {
  const m = { ...f, ...over }; const u = new URLSearchParams();
  if (m.status !== "pending") u.set("status", m.status);
  if (m.kind) u.set("kind", m.kind);
  if (m.page > 1) u.set("page", String(m.page));
  const s = u.toString(); return s ? `?${s}` : "";
}

export type ReviewInput = { id: string; action: "approve" | "reject" | "spam"; notes: string | null; apply: boolean; force: boolean };
export function parseReviewInput(f: FormData): { ok: true; value: ReviewInput } | { ok: false; error: string } {
  const g = (k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };
  const id = g("id");
  if (!isUuid(id)) return { ok: false, error: "Unknown submission." };
  const action = g("action");
  if (action !== "approve" && action !== "reject" && action !== "spam") return { ok: false, error: "Choose approve, reject or spam." };
  const notes = g("notes").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 1000) || null;
  return { ok: true, value: { id, action, notes, apply: g("apply") === "yes", force: g("force") === "yes" } };
}
