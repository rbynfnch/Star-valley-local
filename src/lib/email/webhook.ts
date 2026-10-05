// Postmark webhook payloads -> the suppression we should record (or null for events we ignore).
export interface Suppression { email: string; reason: "bounce" | "complaint" | "unsubscribe"; tenantId: string | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HARD = new Set(["HardBounce", "BadEmailAddress", "ManuallyDeactivated", "SpamNotification"]);

export function parseWebhook(body: unknown): Suppression | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const type = typeof b.RecordType === "string" ? b.RecordType : "";
  const emailRaw = typeof b.Email === "string" ? b.Email : typeof b.Recipient === "string" ? b.Recipient : "";
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  const md = b.Metadata && typeof b.Metadata === "object" ? (b.Metadata as Record<string, unknown>) : {};
  const tenantId = typeof md.tenant_id === "string" && UUID.test(md.tenant_id) ? md.tenant_id.toLowerCase() : null;
  if (type === "SpamComplaint") return { email, reason: "complaint", tenantId };
  if (type === "Bounce") {
    const t = typeof b.Type === "string" ? b.Type : "";
    if (t === "SpamNotification" || t === "SpamComplaint") return { email, reason: "complaint", tenantId };
    return HARD.has(t) ? { email, reason: "bounce", tenantId } : null;          // soft and transient bounces are not suppressed
  }
  if (type === "SubscriptionChange" && b.SuppressSending === true) return { email, reason: "unsubscribe", tenantId };
  return null;
}
