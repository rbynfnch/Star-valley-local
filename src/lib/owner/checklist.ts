// "What to do next" for an owner: only true statements about this business, in the order that helps most.
export interface Facts {
  id: string; tier: "free" | "enhanced"; verification: "none" | "green" | "gold"; hasHours: boolean; hasLogo: boolean; hasCover: boolean;
  hasWebsite: boolean; hasDescription: boolean; postcardPending: boolean; newLeads: number;
}
export interface Step { key: string; text: string; href: string; done: boolean }

export function nextSteps(f: Facts): Step[] {
  const base = `/dashboard/${f.id}`;
  const steps: Step[] = [
    { key: "leads", text: f.newLeads === 1 ? "You have 1 new quote request" : `You have ${f.newLeads} new quote requests`, href: `${base}/leads`, done: f.newLeads === 0 },
    { key: "verify", text: "Get verified (confirm by text message or email link)", href: `/list-your-business`, done: f.verification !== "none" },
    { key: "hours", text: "Add your opening hours", href: `${base}/content#hours-h`, done: f.hasHours },
    { key: "logo", text: "Add your logo", href: `${base}/content#photos-h`, done: f.hasLogo },
    { key: "cover", text: "Add a cover photo", href: `${base}/content#photos-h`, done: f.hasCover },
    { key: "website", text: "Add your website so customers can find you", href: `${base}/profile`, done: f.hasWebsite },
  ];
  if (f.tier === "enhanced") steps.push({ key: "description", text: "Write a longer description", href: `${base}/profile`, done: f.hasDescription });
  else steps.push({ key: "upgrade", text: "Upgrade to Enhanced for more photos, services, deals and a Request a Quote button", href: `${base}/plan`, done: false });
  if (f.verification === "green") steps.push(f.postcardPending
    ? { key: "postcard", text: "Enter the code from your postcard to earn Gold Verified", href: "/verify/postcard", done: false }
    : { key: "gold", text: "Ask us for a verification postcard to earn Gold Verified", href: `${base}/plan`, done: false });
  // show what is left first, then what is done
  return [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)];
}
