import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlameMark } from "@/components/hotlist/Flame";
import { PageHero } from "@/components/site/PageHero";
import { getTenant } from "@/lib/tenant/resolve";

export const metadata: Metadata = { title: "Submit a Hotlist offer", description: "How a Star Valley business gets an offer onto the Local Hotlist.", alternates: { canonical: "/hotlist/submit" } };

const li = "flex gap-3 text-text-body";
export default async function SubmitOffer() {
  if (!(await getTenant())) notFound();
  return (
    <main id="main">
      <PageHero id="submit-h" title="Submit a Hotlist offer" intro="The Hotlist is curated. We pick offers locals will actually want, so the bar is deliberately high." />
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-8">
        <section aria-labelledby="bar-h" className="space-y-3">
          <h2 id="bar-h" className="font-heading text-2xl font-bold text-text">What makes the cut</h2>
          <ul className="space-y-2">
            {["A real saving: at least $10 off, or at least 20% off the original value.", "A clear price: the original value and the Hotlist price, in dollars.", "A real end date, within 120 days, and a quantity if it is limited.", "Simple redemption: what the customer shows or says, and where.", "A good photo. The Hotlist is photography-led."].map((t) => (
              <li key={t} className={li}><FlameMark height={18} className="mt-1" /><span>{t}</span></li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="how-h" className="space-y-3">
          <h2 id="how-h" className="font-heading text-2xl font-bold text-text">How it works</h2>
          <ol className="list-decimal space-y-2 pl-6 text-text-body">
            <li>You send us the offer: title, description, original value, Hotlist price, end date, quantity, how to redeem, a photo, the category and your terms.</li>
            <li>An editor reviews it. We may ask you to sharpen it, or say no.</li>
            <li>If it is approved, it goes on the Hotlist. Customers sign in, tap Get deal and receive a personal code to show you.</li>
            <li>Customers pay you the Hotlist price when they redeem. We do not take payment.</li>
          </ol>
        </section>
        <section aria-labelledby="who-h" className="space-y-3 rounded-card bg-surface-muted p-6">
          <h2 id="who-h" className="font-heading text-2xl font-bold text-text">Who can submit</h2>
          <p className="text-text-body">Verified owners with an Enhanced listing. Submitting from your own dashboard is coming; until then, tell us about your offer when you list or upgrade, or ask us in person.</p>
          <p className="flex flex-wrap gap-3">
            <Link href="/list-your-business" className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Claim your business</Link>
            <Link href="/pricing" className="rounded-button border border-text px-5 py-2 font-semibold text-text hover:bg-surface-card">See Enhanced</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
