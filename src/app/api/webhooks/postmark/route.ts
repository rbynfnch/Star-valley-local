import { NextResponse } from "next/server";
import { basicOk } from "@/lib/email/auth";
import { parseWebhook } from "@/lib/email/webhook";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Postmark calls this (HTTP Basic auth) for bounces, spam complaints and unsubscribes. Hard bounces and complaints block all further
// mail to the address; an unsubscribe is recorded but never blocks service notices. Unknown or soft events are acknowledged and ignored.
export async function POST(req: Request) {
  if (!basicOk(req.headers.get("authorization"), process.env.POSTMARK_WEBHOOK_USER, process.env.POSTMARK_WEBHOOK_PASSWORD)) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "www-authenticate": 'Basic realm="webhook"', "cache-control": "no-store" } });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const s = parseWebhook(body);
  if (!s) return NextResponse.json({ ignored: true });
  const { error } = await createServiceClient().rpc("record_email_suppression", { p_tenant: s.tenantId, p_email: s.email, p_reason: s.reason, p_audience: null });
  if (error) return NextResponse.json({ error: "could not record" }, { status: 500 });          // Postmark retries on 5xx
  return NextResponse.json({ recorded: true });
}
