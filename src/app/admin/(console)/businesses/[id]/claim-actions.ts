"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isUuid } from "@/lib/admin/detail-input";
import { requireArea } from "@/lib/admin/session";
import { inviteSmsBody } from "@/lib/claim/input";
import { renderClaimEmail } from "@/lib/email/claim-email";
import { sendPostmark } from "@/lib/email/postmark";
import { emailConfig } from "@/lib/email/server";
import { baseUrl } from "@/lib/email/templates";
import { sendSms, smsConfigFromEnv } from "@/lib/sms/twilio";
import { createServiceClient } from "@/lib/supabase/service";

export interface ClaimLinkState { error?: string; saved?: string }
const FAIL = "The link could not be sent. Try again in a minute.";
const INVITE_DAYS = 7;
const friendly = (e: { code?: string; message?: string }) => (["22023", "53400", "P0002"].includes(e.code ?? "") && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

// Staff pick the business and the channel; the server picks the DESTINATION (the phone or email already on the listing).
// Receiving the link there is the proof, so staff can never redirect a claim to an address they typed.
export async function sendClaimLink(_prev: ClaimLinkState, form: FormData): Promise<ClaimLinkState> {
  const staff = await requireArea("crm");
  const business = String(form.get("business") ?? "");
  const channel = form.get("channel") === "sms" ? "sms" : form.get("channel") === "email" ? "email" : null;
  if (!isUuid(business) || !channel) return { error: "Choose how to send the link." };
  const method = channel === "sms" ? "sms_code" : "email_link";

  const service = createServiceClient();
  const { data, error } = await service.rpc("claim_invite", { p_tenant: staff.tenant.id, p_business: business, p_staff: staff.userId, p_method: method });
  if (error || !data) return { error: error ? friendly(error) : FAIL };
  const c = data as { claim_id: string; secret: string; destination: string; business_name: string };
  const cancel = () => service.from("claims").update({ status: "cancelled" }).eq("id", c.claim_id);

  const h = await headers();
  const base = baseUrl((h.get("host") ?? "").toLowerCase());
  if (!base) { await cancel(); return { error: FAIL }; }
  const link = `${base}/list-your-business/confirm?c=${c.claim_id}&t=${c.secret}`;

  if (channel === "email") {
    const blocked = await service.rpc("email_is_blocked", { p_tenant: staff.tenant.id, p_email: c.destination });
    if (blocked.error || blocked.data === true) { await cancel(); return { error: blocked.error ? FAIL : "That address bounced or opted out, so we will not email it. Try the text option, or visit in person." }; }
    const cfg = emailConfig();
    if (!cfg) {
      if (process.env.NODE_ENV === "production") { await cancel(); return { error: "Email is not set up yet." }; }
      console.warn(`[DEV ONLY: email not configured] claim invite for ${c.business_name}: ${link}`);
    } else {
      const mail = renderClaimEmail({ tenantName: staff.tenant.name, mailingAddress: null, contactEmail: null, businessName: c.business_name, link, minutes: INVITE_DAYS * 1440, invite: true });
      const sent = await sendPostmark({ from: cfg.from, to: c.destination, ...mail, tag: "claim_invite", metadata: { tenant_id: staff.tenant.id, claim_id: c.claim_id } }, cfg);
      if (!sent.ok) { await cancel(); return { error: "The email could not be sent. Try again in a minute." }; }
    }
  } else {
    const cfg = smsConfigFromEnv();
    if (!cfg) {
      if (process.env.NODE_ENV === "production") { await cancel(); return { error: "Text messages are not set up yet." }; }
      console.warn(`[DEV ONLY: Twilio not configured] claim invite for ${c.business_name}: ${link}`);
    } else {
      try { await sendSms(cfg, c.destination, inviteSmsBody(staff.tenant.name, c.business_name, link, INVITE_DAYS)); }
      catch { await cancel(); return { error: "The text message could not be sent. Try again in a minute." }; }
    }
  }
  await service.rpc("claim_invite_sent", { p_claim: c.claim_id, p_staff: staff.userId });
  revalidatePath(`/admin/businesses/${business}`);
  return { saved: channel === "sms" ? "Text sent to the number on file." : "Email sent to the address on file." };
}
