import { escapeHtml } from "./templates.ts";
import { dealFacts, categoryLabel, type HotlistCategory, type HotlistKind } from "../hotlist/model.ts";

// "This week's Hotlist": a reusable block for newsletters (consumer audience). One featured deal, two to four more items and a link to
// the full Hotlist. Pure: the caller supplies the items, the tenant's origin and time zone. Inline styles only (email clients).
export interface BlockItem { title: string; slug: string; kind: HotlistKind; category: HotlistCategory; businessName: string; imageUrl?: string | null;
  originalCents: number | null; priceCents: number | null; endsAt: string | null }
const clean = (s: string, n: number) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

export function renderHotlistBlock(o: { origin: string; tz: string; items: BlockItem[] }): { html: string; text: string; count: number } {
  const picks = o.items.slice(0, 5);
  if (picks.length === 0) return { html: "", text: "", count: 0 };
  const [lead, ...rest] = picks;
  const url = (i: BlockItem) => `${o.origin}/hotlist/${encodeURIComponent(i.slug)}`;
  const facts = (i: BlockItem) => { const f = dealFacts({ original_cents: i.originalCents, price_cents: i.priceCents, ends_at: i.endsAt }, o.tz); return f ? `${f.price} · ${f.value} · ${f.save}${f.ends ? ` · ${f.ends}` : ""}` : "Hotlist Pick"; };
  const img = (i: BlockItem, w: number) => i.imageUrl ? `<img src="${escapeHtml(i.imageUrl)}" alt="" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border-radius:6px" />` : "";
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:#1f2428"><tr><td>
<p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#193153">Local Hotlist</p>
<h2 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#1f2428">This week&#39;s Hotlist</h2>
<a href="${escapeHtml(url(lead))}" style="text-decoration:none;color:#1f2428;display:block">${img(lead, 520)}<p style="margin:12px 0 2px;font-size:20px;font-weight:bold">${escapeHtml(clean(lead.title, 90))}</p></a>
<p style="margin:0 0 4px;font-size:14px;color:#566068">${escapeHtml(clean(lead.businessName, 80))} · ${escapeHtml(categoryLabel(lead.category))}</p>
<p style="margin:0 0 12px;font-size:16px;font-weight:bold">${escapeHtml(facts(lead))}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url(lead))}" style="background:#193153;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;display:inline-block">${lead.kind === "deal" ? "Get deal" : "See the pick"}</a></p>
${rest.map((i) => `<p style="margin:0 0 14px;padding-top:12px;border-top:1px solid #a7b0b5"><a href="${escapeHtml(url(i))}" style="color:#193153;font-weight:bold;font-size:16px">${escapeHtml(clean(i.title, 90))}</a><br /><span style="font-size:14px;color:#566068">${escapeHtml(clean(i.businessName, 80))} · ${escapeHtml(facts(i))}</span></p>`).join("\n")}
<p style="margin:16px 0 0"><a href="${escapeHtml(o.origin)}/hotlist" style="color:#193153;font-weight:bold">See the full Hotlist →</a></p>
</td></tr></table>`;
  const text = ["THIS WEEK'S HOTLIST", "", `${clean(lead.title, 90)} — ${clean(lead.businessName, 80)}`, facts(lead), url(lead), "",
    ...rest.flatMap((i) => [`${clean(i.title, 90)} — ${clean(i.businessName, 80)} (${facts(i)})`, url(i), ""]), `See the full Hotlist: ${o.origin}/hotlist`].join("\n");
  return { html, text, count: picks.length };
}
