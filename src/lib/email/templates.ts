// Plain, friendly service emails. Everything interpolated is escaped for HTML; the text part is the primary version.
export type NotificationKind = "verification_reminder" | "verification_lapsed" | "featured_grace_reminder" | "featured_ended_unverified" | "placement_renewal_reminder" | "listing_renewal_reminder" | "staff_no_contact_alert";
export interface QueuedEmail {
  id: string; kind: string; recipient_email: string; attempts: number; payload: Record<string, unknown>;
  tenant: { id: string; slug: string; name: string; mailing_address: string | null; contact_email: string | null; timezone: string | null; domain: string | null };
  business: { id: string; slug: string; name: string } | null;
}
export interface Rendered { subject: string; text: string; html: string }

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The public base URL for a tenant: its primary domain; http only for local development hosts. */
export function baseUrl(domain: string | null | undefined): string | null {
  const d = (domain ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(d)) return null;
  const local = /(^|\.)localhost(:\d+)?$/.test(d) || /^127\./.test(d);
  return `${local ? "http" : "https"}://${d}`;
}

function when(iso: unknown, tz: string | null): string {
  const d = new Date(str(iso));
  if (Number.isNaN(d.getTime())) return "soon";
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Denver", dateStyle: "long" }).format(d); } catch { return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(d); }
}
const SLOT: Record<string, string> = { homepage: "the home page", things_to_do: "Things to Do", category: "its category page", community: "its community page" };
function spots(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((p) => (p && typeof p === "object" ? SLOT[str((p as Record<string, unknown>).slot_type)] : undefined)).filter((x): x is string => !!x))];
}
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const dollars = (cents: number | null) => (cents && cents > 0 ? `$${(cents / 100).toFixed(2)}` : null);

type Body = { subject: string; paragraphs: string[]; action?: { label: string; url: string | null } };

export function render(e: QueuedEmail): Rendered | null {
  const t = e.tenant, tz = t.timezone, base = baseUrl(t.domain), p = e.payload ?? {};
  const name = str(p.business_name, 120) || e.business?.name || "your business";
  const slug = e.business?.slug ?? str(p.business_slug, 100);
  const claim = base && slug ? `${base}/list-your-business?claim=${encodeURIComponent(slug)}` : null;
  const at = spots(p.placements);
  const featured = at.length ? `Featured on ${list(at)}` : "Featured";
  let b: Body | null = null;

  switch (e.kind as NotificationKind) {
    case "verification_reminder": {
      const days = num(p.days_left);
      b = { subject: `Time to re-verify ${name}`, paragraphs: [
        `${name} is due for its yearly re-verification on ${when(p.due_at, tz)}${days !== null ? ` (${days} day${days === 1 ? "" : "s"} away)` : ""}.`,
        "It takes a minute: we text a code to the phone number on your listing. Staying verified keeps the Verified badge on your page, and it is required for a Featured spot."], action: { label: "Re-verify now", url: claim } };
      break;
    }
    case "verification_lapsed": {
      const g = num(p.grace_days);
      b = { subject: `${name} needs to be re-verified to stay Featured`, paragraphs: [
        `${name}'s verification has lapsed. Your ${featured.toLowerCase()} placement stays live for now${g ? `, but only for ${g} days` : ""}: verify by ${when(p.ends_at, tz)} to keep it.`,
        "Verifying takes a minute with a text-message code to your listing's phone number."], action: { label: "Verify now", url: claim } };
      break;
    }
    case "featured_grace_reminder": {
      const d = num(p.days_left);
      b = { subject: d !== null && d <= 1 ? `Last day to verify ${name}` : `${d ?? "A few"} days left to verify ${name}`, paragraphs: [
        `${name}'s ${featured.toLowerCase()} placement ends on ${when(p.ends_at, tz)} unless the business is verified again.`,
        "Verify now and nothing changes for you."], action: { label: "Verify now", url: claim } };
      break;
    }
    case "featured_ended_unverified": {
      const credit = dollars(num(p.credit_cents));
      b = { subject: `${name} is no longer Featured`, paragraphs: [
        `Because ${name} was not re-verified in time, its Featured placement has ended. Your listing is still on Star Valley Local.`,
        ...(credit ? [`We have recorded a credit of ${credit} for the unused time.`] : []),
        "Verify again whenever you are ready and we can help you get a Featured spot back, if one is open."], action: { label: "Verify your business", url: claim } };
      break;
    }
    case "placement_renewal_reminder":
      b = { subject: `${name}'s Featured spot ends ${when(p.ends_at, tz)}`, paragraphs: [
        `${name}'s Featured placement ends on ${when(p.ends_at, tz)}.`,
        "Spots are limited, so if you would like to keep yours, renew before then. Reply to this email and we will take care of it."], action: { label: "See plans and open spots", url: base ? `${base}/pricing` : null } };
      break;
    case "listing_renewal_reminder":
      b = { subject: `${name}'s Enhanced listing ends ${when(p.ends_at, tz)}`, paragraphs: [
        `${name}'s Enhanced listing ends on ${when(p.ends_at, tz)}. After that the page goes back to the free listing: your photos, services, deals and the Request a Quote button will no longer show.`,
        "To keep them, renew before then. Reply to this email and we will take care of it."], action: { label: "See plans", url: base ? `${base}/pricing` : null } };
      break;
    case "staff_no_contact_alert": {
      const orig = str(p.original_kind, 60).replace(/_/g, " ");
      const adminUrl = base && e.business ? `${base}/admin/businesses/${e.business.id}` : null;
      b = { subject: `Staff: nobody to email at ${name}`, paragraphs: [
        `A notice (${orig || "grace period step"}) was due for ${name}, but the business has no owner or contact email on file.`,
        "Please call or visit so they hear about it in person."], action: { label: "Open in admin", url: adminUrl } };
      break;
    }
    default:
      return null;
  }

  const footer = [`You are getting this service notice because you manage ${name} on ${t.name}.`, ...(t.contact_email ? [`Questions? Write to ${t.contact_email}.`] : []), ...(t.mailing_address ? [t.mailing_address] : [])];
  const text = [`Hello,`, "", ...b.paragraphs.flatMap((x) => [x, ""]), ...(b.action?.url ? [`${b.action.label}: ${b.action.url}`, ""] : []), `— ${t.name}`, "", "--", ...footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1f2428"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#ffffff;border-radius:8px;padding:24px"><p style="margin:0 0 16px;font-size:14px;color:#355c73;font-weight:bold">${escapeHtml(t.name)}</p><p style="margin:0 0 16px">Hello,</p>${b.paragraphs.map((x) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(x)}</p>`).join("")}${b.action?.url ? `<p style="margin:24px 0"><a href="${escapeHtml(b.action.url)}" style="background:#193153;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">${escapeHtml(b.action.label)}</a></p>` : ""}<p style="margin:16px 0 0">— ${escapeHtml(t.name)}</p></div><p style="font-size:12px;color:#68727a;line-height:1.5;margin:16px 0 0">${footer.map(escapeHtml).join("<br>")}</p></div></body></html>`;
  return { subject: b.subject.replace(/[\r\n]+/g, " ").slice(0, 200), text, html };
}
