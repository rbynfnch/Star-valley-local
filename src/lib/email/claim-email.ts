import { escapeHtml } from "./templates.ts";

// The "confirm you manage this business" email. Sent straight from the claim action (never through the outbox), because the
// link carries a one-time secret that must not be stored anywhere readable.
export interface ClaimEmailInput { tenantName: string; mailingAddress: string | null; contactEmail: string | null; businessName: string; link: string; minutes: number }
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export function renderClaimEmail(i: ClaimEmailInput): { subject: string; text: string; html: string } {
  const tenant = clean(i.tenantName, 80), biz = clean(i.businessName, 120);
  const when = i.minutes % 60 === 0 ? `${i.minutes / 60} hour${i.minutes === 60 ? "" : "s"}` : `${i.minutes} minutes`;
  const paras = [
    `Someone asked to claim ${biz} on ${tenant} and chose to confirm it by email. If that was you, press the button below, signed in to the account you asked from.`,
    `The link works for ${when}. Opening it changes nothing by itself; you will be asked to confirm.`,
    "If you did not ask for this, ignore this email and nobody gets access.",
  ];
  const footer = [`You are getting this because ${biz} lists this email address on ${tenant}.`, ...(i.contactEmail ? [`Questions? Write to ${clean(i.contactEmail, 120)}.`] : []), ...(i.mailingAddress ? [clean(i.mailingAddress, 200)] : [])];
  const text = ["Hello,", "", ...paras.flatMap((p) => [p, ""]), `Confirm: ${i.link}`, "", `— ${tenant}`, "", "--", ...footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1f2428"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#ffffff;border-radius:8px;padding:24px"><p style="margin:0 0 16px;font-size:14px;color:#355c73;font-weight:bold">${escapeHtml(tenant)}</p><p style="margin:0 0 16px">Hello,</p>${paras.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join("")}<p style="margin:24px 0"><a href="${escapeHtml(i.link)}" style="background:#193153;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">Confirm I manage ${escapeHtml(biz)}</a></p><p style="margin:16px 0 0">— ${escapeHtml(tenant)}</p></div><p style="font-size:12px;color:#68727a;line-height:1.5;margin:16px 0 0">${footer.map(escapeHtml).join("<br>")}</p></div></body></html>`;
  return { subject: `Confirm you manage ${biz}`.slice(0, 200), text, html };
}
