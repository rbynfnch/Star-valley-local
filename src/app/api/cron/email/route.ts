import { NextResponse } from "next/server";
import { bearerOk } from "@/lib/email/auth";
import { runConfiguredEmailJob } from "@/lib/email/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Call from a scheduler every few minutes with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this header itself).
// ?maintenance=0 skips queueing the daily reminders and only delivers what is already queued. Safe to run often and to overlap:
// claims are leased in the database, and queueing is idempotent.
async function handle(req: Request) {
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET)) return new NextResponse("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  const maintenance = new URL(req.url).searchParams.get("maintenance") !== "0";
  let result;
  try { result = await runConfiguredEmailJob({ maintenance }); } catch { return NextResponse.json({ error: "job failed" }, { status: 500, headers: { "cache-control": "no-store" } }); }
  const failed = "error" in result;
  return NextResponse.json(result, { status: failed ? 503 : 200, headers: { "cache-control": "no-store" } });
}
export const GET = handle;
export const POST = handle;
