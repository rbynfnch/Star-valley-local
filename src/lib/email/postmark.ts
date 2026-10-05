// Postmark's /email endpoint over plain fetch (no SDK). Classifies failures so the worker knows what is worth retrying.
export type Fetch = typeof fetch;
export interface OutgoingEmail { from: string; to: string; subject: string; text: string; html: string; tag: string; metadata: Record<string, string> }
export type SendResult = { ok: true; messageId: string } | { ok: false; permanent: boolean; error: string };

// ErrorCodes that are about THIS message and will never succeed on retry: 300 invalid email, 406 inactive recipient (a prior bounce or
// complaint). Account and sender-signature problems (10, 400, 401, 405...) affect every email, so they retry and then surface as failed.
const PERMANENT_CODES = new Set([300, 406]);

export async function sendPostmark(m: OutgoingEmail, cfg: { token: string; stream: string; apiBase?: string; fetchImpl?: Fetch }): Promise<SendResult> {
  let res: Response;
  try {
    res = await (cfg.fetchImpl ?? fetch)(`${(cfg.apiBase ?? "https://api.postmarkapp.com").replace(/\/+$/, "")}/email`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": cfg.token },
      body: JSON.stringify({ From: m.from, To: m.to, Subject: m.subject, TextBody: m.text, HtmlBody: m.html, MessageStream: cfg.stream, Tag: m.tag, Metadata: m.metadata, TrackOpens: false, TrackLinks: "None" }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) { return { ok: false, permanent: false, error: `network: ${e instanceof Error ? e.name : "error"}` }; }
  let body: { ErrorCode?: number; Message?: string; MessageID?: string } = {};
  try { body = (await res.json()) as typeof body; } catch { /* not json */ }
  if (res.ok && body.ErrorCode === 0 && body.MessageID) return { ok: true, messageId: body.MessageID };
  const code = body.ErrorCode ?? 0;
  const error = `postmark ${res.status}${code ? ` #${code}` : ""}: ${String(body.Message ?? "no message").slice(0, 200)}`;
  if (res.status === 429 || res.status >= 500) return { ok: false, permanent: false, error };
  return { ok: false, permanent: PERMANENT_CODES.has(code), error };
}
