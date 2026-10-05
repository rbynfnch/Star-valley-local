import { test } from "node:test";
import assert from "node:assert/strict";
import { runEmailJob, type WorkerDeps } from "./worker.ts";
import type { QueuedEmail } from "./templates.ts";

const mk = (id: string, kind = "listing_renewal_reminder"): QueuedEmail => ({ id, kind, recipient_email: `${id}@x.test`, attempts: 1, payload: { ends_at: "2026-12-01T07:00:00Z" },
  tenant: { id: "t", slug: "s", name: "SVL", mailing_address: "1 Main", contact_email: null, timezone: null, domain: "svl.example" }, business: { id: "b", slug: "a", name: "A" } });
function deps(batches: QueuedEmail[][], send: WorkerDeps["send"]) {
  const log: string[] = []; let i = 0;
  const d: WorkerDeps = { from: "SVL <b@biz.example>", batchSize: 2,
    maintenance: async () => { log.push("maintenance"); },
    claim: async (n) => { log.push(`claim ${n}`); return batches[i++] ?? []; },
    complete: async (id, m) => { log.push(`complete ${id} ${m}`); },
    fail: async (id, e, p) => { log.push(`fail ${id} ${p ? "permanent" : "retry"} ${e}`); }, send };
  return { d, log };
}
const ok = (async (m) => ({ ok: true as const, messageId: "m-" + m.metadata.notification_id })) as WorkerDeps["send"];

test("maintenance first, then claims in batches until a short batch", async () => {
  const { d, log } = deps([[mk("a"), mk("b")], [mk("c")]], ok);
  const r = await runEmailJob(d);
  assert.deepEqual(r, { sent: 3, retried: 0, failed: 0, batches: 2, maintenance: "ok" });
  assert.deepEqual(log, ["maintenance", "claim 2", "complete a m-a", "complete b m-b", "claim 2", "complete c m-c"]);
});
test("sends from the configured sender with kind as tag and ids as metadata", async () => {
  let seen: Parameters<WorkerDeps["send"]>[0] | null = null;
  const { d } = deps([[mk("a")]], (async (m) => { seen = m; return { ok: true, messageId: "x" }; }) as WorkerDeps["send"]);
  await runEmailJob(d);
  assert.equal(seen!.from, "SVL <b@biz.example>"); assert.equal(seen!.to, "a@x.test"); assert.equal(seen!.tag, "listing_renewal_reminder"); assert.deepEqual(seen!.metadata, { notification_id: "a", tenant_id: "t" });
  assert.match(seen!.text, /1 Main/);
});
test("a maintenance failure does not stop delivery of what is already queued", async () => {
  const { d, log } = deps([[mk("a")]], ok); d.maintenance = async () => { throw new Error("db down"); };
  const r = await runEmailJob(d);
  assert.equal(r.maintenance, "error"); assert.equal(r.sent, 1); assert.ok(log.includes("complete a m-a"));
});
test("maintenance can be skipped", async () => {
  const { d, log } = deps([[]], ok); d.runMaintenance = false;
  const r = await runEmailJob(d);
  assert.equal(r.maintenance, "skipped"); assert.ok(!log.includes("maintenance"));
});
test("transient failures are reported as retries, permanent ones as failed, and other mail still goes", async () => {
  const send = (async (m) => m.metadata.notification_id === "a" ? { ok: false, permanent: false, error: "postmark 500" } : m.metadata.notification_id === "b" ? { ok: false, permanent: true, error: "postmark #406" } : { ok: true, messageId: "m" }) as WorkerDeps["send"];
  const { d, log } = deps([[mk("a"), mk("b")], [mk("c")]], send);
  const r = await runEmailJob(d);
  assert.deepEqual([r.sent, r.retried, r.failed], [1, 1, 1]);
  assert.ok(log.includes("fail a retry postmark 500") && log.includes("fail b permanent postmark #406"));
});
test("a send that throws is a retry, not a crash", async () => {
  const { d, log } = deps([[mk("a"), mk("b")]], (async (m) => { if (m.metadata.notification_id === "a") throw new Error("boom"); return { ok: true, messageId: "m" }; }) as WorkerDeps["send"]);
  const r = await runEmailJob(d);
  assert.equal(r.retried, 1); assert.equal(r.sent, 1); assert.ok(log.some((l) => l.startsWith("fail a retry")));
});
test("an unknown kind fails permanently without being sent", async () => {
  let sent = 0;
  const { d, log } = deps([[mk("a", "newsletter")]], (async () => { sent++; return { ok: true, messageId: "m" }; }) as WorkerDeps["send"]);
  const r = await runEmailJob(d);
  assert.equal(sent, 0); assert.equal(r.failed, 1); assert.ok(log.some((l) => l.startsWith("fail a permanent no template")));
});
test("it stops after maxBatches even if the queue is endless", async () => {
  let calls = 0;
  const { d } = deps([], ok); d.maxBatches = 3; d.claim = async () => { calls++; return [mk("a" + calls), mk("b" + calls)]; };
  const r = await runEmailJob(d);
  assert.equal(r.batches, 3); assert.equal(calls, 3);
});
test("a claim failure propagates so the caller reports it", async () => {
  const { d } = deps([], ok); d.claim = async () => { throw new Error("claim failed"); };
  await assert.rejects(runEmailJob(d), /claim failed/);
});
