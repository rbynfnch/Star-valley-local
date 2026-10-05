import { render, type QueuedEmail } from "./templates.ts";
import type { OutgoingEmail, SendResult } from "./postmark.ts";

// One run of the email job: queue what is due (daily maintenance), then claim, send and settle a batch.
// Everything outside this function (database, provider, clock) is injected so it can be tested without either.
export interface WorkerDeps {
  maintenance: () => Promise<unknown>;
  claim: (limit: number) => Promise<QueuedEmail[]>;
  complete: (id: string, messageId: string) => Promise<void>;
  fail: (id: string, error: string, permanent: boolean) => Promise<void>;
  send: (m: OutgoingEmail) => Promise<SendResult>;
  from: string;
  runMaintenance?: boolean;
  batchSize?: number;
  maxBatches?: number;
}
export interface WorkerResult { sent: number; retried: number; failed: number; batches: number; maintenance: "ok" | "skipped" | "error" }

export async function runEmailJob(d: WorkerDeps): Promise<WorkerResult> {
  const r: WorkerResult = { sent: 0, retried: 0, failed: 0, batches: 0, maintenance: "skipped" };
  if (d.runMaintenance !== false) {
    try { await d.maintenance(); r.maintenance = "ok"; } catch { r.maintenance = "error"; }       // a maintenance failure must not stop already-queued mail
  }
  const size = d.batchSize ?? 20;
  for (let i = 0; i < (d.maxBatches ?? 5); i++) {
    const batch = await d.claim(size);
    if (batch.length === 0) break;
    r.batches++;
    for (const e of batch) {
      const out = render(e);
      if (!out) { await d.fail(e.id, `no template for ${String(e.kind).slice(0, 60)}`, true); r.failed++; continue; }
      let res: SendResult;
      try { res = await d.send({ from: d.from, to: e.recipient_email, subject: out.subject, text: out.text, html: out.html, tag: e.kind, metadata: { notification_id: e.id, tenant_id: e.tenant.id } }); }
      catch { res = { ok: false, permanent: false, error: "send threw" }; }
      if (res.ok) { await d.complete(e.id, res.messageId); r.sent++; }
      else {
        await d.fail(e.id, res.error, res.permanent);
        if (res.permanent) r.failed++; else r.retried++;
      }
    }
    if (batch.length < size) break;
  }
  return r;
}
