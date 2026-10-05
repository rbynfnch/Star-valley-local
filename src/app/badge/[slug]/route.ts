import { getDirectoryData } from "@/lib/directory/data";
import { parseSlug } from "@/lib/claim/input";
import { getTenant } from "@/lib/tenant/resolve";

// "Verified on <tenant>" badge for a verified business to put on its own website. Public (it is embedded elsewhere), but only for businesses
// that really are verified, so it cannot be used to claim a verification that does not exist. Text is escaped; sizes are fixed.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const slug = parseSlug((await ctx.params).slug);
  const tenant = await getTenant();
  if (!slug || !tenant) return new Response("Not found", { status: 404 });
  const p = await getDirectoryData().businessProfile(tenant.id, slug);
  if (!p || p.business.verification_level === "none") return new Response("Not found", { status: 404 });
  const gold = p.business.verification_level === "gold";
  const label = gold ? "Gold Verified" : "Verified", name = esc(tenant.name.slice(0, 40));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="64" viewBox="0 0 220 64" role="img" aria-label="${label} on ${name}">
<title>${label} on ${name}</title><rect width="220" height="64" rx="8" fill="#193153"/><circle cx="32" cy="32" r="16" fill="${gold ? "#D2A52E" : "#5E6B4E"}"/>
<path d="M24 32.5l5.5 5.5L40 26" fill="none" stroke="${gold ? "#1F2428" : "#FFFFFF"}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
<text x="58" y="29" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="bold" fill="#E8E1D6">${label}</text>
<text x="58" y="47" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="#E8E1D6">on ${name}</text></svg>`;
  const headers: Record<string, string> = { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" };
  if (new URL(request.url).searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename="verified-${slug}.svg"`;
  return new Response(svg, { headers });
}
