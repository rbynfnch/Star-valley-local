"use client";

import Link from "next/link";
import { EndButton, PromoteForm, type Product } from "@/components/admin/BillingForms";
import type { SlotView } from "@/lib/admin/placements-view";
import { activatePlacement, endPlacement } from "./actions";

export function PlacementsBoard({ slots, products, canEdit }: { slots: SlotView[]; products: Product[]; canEdit: boolean }) {
  return (
    <ul className="mt-4 space-y-4">
      {slots.map((s) => (
        <li key={s.key} className="rounded-card bg-surface-card p-4 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold text-text">{s.title}</h2>
            <p className={s.full ? "text-sm font-semibold text-brand-text" : "text-sm text-text-body"}>{s.used} of {s.max} used{s.full ? ": full" : ""}</p>
          </div>
          {s.holders.length === 0 ? <p className="mt-2 text-sm text-text-muted">Nobody yet.</p> : (
            <ul className="mt-2 divide-y divide-slate-600/15 text-sm">
              {s.holders.map((h) => (
                <li key={h.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link href={`/admin/businesses/${h.businessId}`} className="font-medium text-link underline [overflow-wrap:anywhere]">{h.name}</Link>
                      <p className="text-text-body">{h.source} · {h.upcoming ? "starts later, " : ""}ends {h.ends}{h.autoRenews ? " · renews itself" : ""}{h.soon ? <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text">Ends in {h.daysLeft} {h.daysLeft === 1 ? "day" : "days"}</span> : null}</p>
                    </div>
                    {canEdit && <EndButton action={endPlacement} fields={{ id: h.id, business: h.businessId }} label="End now" confirmLabel="End this placement" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {s.waitlist.length > 0 && (
            <div className="mt-3 border-t border-slate-600/20 pt-3">
              <h3 className="text-sm font-semibold text-text">Waitlist</h3>
              <ol className="mt-1 space-y-2 text-sm">
                {s.waitlist.map((w) => (
                  <li key={w.id} className="rounded-card bg-surface-muted p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-text"><span className="text-text-muted">#{w.position}</span> <Link href={`/admin/businesses/${w.businessId}`} className="font-medium text-link underline">{w.name}</Link> <span className="text-text-muted">since {w.since}</span></p>
                      {canEdit && <div className="flex flex-wrap gap-2"><PromoteForm action={activatePlacement} waitlistId={w.id} products={products} /><EndButton action={endPlacement} fields={{ id: w.id, business: w.businessId }} label="Remove" confirmLabel="Remove from the waitlist" /></div>}
                    </div>
                    {w.reason && <p className="mt-1 text-text-muted">{w.reason}.</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
