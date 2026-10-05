import { createServiceClient } from "@/lib/supabase/service";
import { sendPostmark } from "./postmark";
import { runEmailJob, type WorkerDeps, type WorkerResult } from "./worker";
import type { QueuedEmail } from "./templates";

/** Reads the email settings. Returns null (never throws) when sending is not configured, so a cron hit says so instead of crashing. */
export function emailConfig(env: Record<string, string | undefined> = process.env) {
  const token = env.POSTMARK_BUSINESS_SERVER_TOKEN, from = env.EMAIL_FROM_BUSINESS;
  if (!token || !from) return null;
  return { token, from, stream: env.POSTMARK_BUSINESS_STREAM || "outbound", apiBase: env.POSTMARK_API_BASE };
}

/** The real job: Supabase (service role, database functions) and Postmark's business server. Only transactional mail goes through here. */
export async function runConfiguredEmailJob(opts: { maintenance: boolean }): Promise<WorkerResult | { error: string }> {
  const cfg = emailConfig();
  if (!cfg) return { error: "email is not configured (POSTMARK_BUSINESS_SERVER_TOKEN, EMAIL_FROM_BUSINESS)" };
  const db = createServiceClient();
  const deps: WorkerDeps = {
    from: cfg.from, runMaintenance: opts.maintenance,
    maintenance: async () => { const { error } = await db.rpc("email_run_maintenance"); if (error) throw new Error("maintenance failed"); },
    claim: async (limit) => { const { data, error } = await db.rpc("email_claim_batch", { p_limit: limit }); if (error) throw new Error("claim failed"); return (data ?? []) as QueuedEmail[]; },
    complete: async (id, messageId) => { await db.rpc("email_complete", { p_id: id, p_message_id: messageId }); },
    fail: async (id, error, permanent) => { await db.rpc("email_fail", { p_id: id, p_error: error, p_permanent: permanent }); },
    send: (m) => sendPostmark(m, cfg),
  };
  return runEmailJob(deps);
}
