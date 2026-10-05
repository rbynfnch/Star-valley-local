"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { DAYS, OTHER_LINKS, RANGES_PER_DAY, SOCIAL_KINDS, MAX_FAQS } from "@/lib/admin/content-input";
import { dayInput, hoursGrid } from "@/lib/admin/content-view";
import { mediaUrl } from "@/lib/media";
import { deleteDeal, deletePhoto, reorderPhotos, saveAreas, saveDeal, saveFaqs, saveHighlights, saveHours, saveLinks, saveServices, updatePhoto, uploadPhoto, type ContentState } from "./actions";

type Opt = { id: string; name: string };
type Deal = { id: string; title: string; description: string | null; terms: string | null; discount_type: "percent" | "amount" | "bogo" | "other"; discount_value: number | string | null; status: string; starts_at: string; ends_at: string | null };
type Photo = { id: string; role: "logo" | "cover" | "gallery"; caption: string | null; alt: string | null; bucket: string; path: string };
export interface Content {
  enhanced: boolean; home_community_id: string | null; primary_category_id: string | null; highlights: string[]; price_range: number | null;
  hours: { day: number; opens: string; closes: string }[]; services: string[]; links: { kind: string; url: string }[]; faqs: { question: string; answer: string }[];
  community_ids: string[]; category_ids: string[]; deals: Deal[]; photos: Photo[];
}

const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const btn = "rounded-button px-4 py-2 text-sm font-semibold disabled:opacity-60";
const primary = `${btn} bg-brand text-brand-contrast hover:bg-brand-hover`;
const ghost = `${btn} border border-slate-600 text-text`;
const label = "text-sm font-medium text-text";

const Msg = ({ s }: { s: ContentState }) => (
  <>
    {s.error && <p role="alert" className="text-sm font-medium text-danger-text">{s.error}</p>}
    {s.message && <p role="status" className="text-sm font-medium text-green-800">{s.message}</p>}
  </>
);

/** A section's form: onSubmit instead of <form action> (React 19 resets a form after its action, which would wipe the fields on a failed save). */
function Section({ id, title, hint, business, action, children, button = "Save", reset = false }: {
  id: string; title: string; hint?: React.ReactNode; business: string; action: (s: ContentState, f: FormData) => Promise<ContentState>; children: React.ReactNode; button?: string; reset?: boolean }) {
  const [state, dispatch, pending] = useActionState<ContentState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (reset && state.message) formRef.current?.reset(); }, [reset, state]);      // clear an "add" form only after it succeeded; a failed save keeps what was typed
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-card bg-surface-card p-4 shadow-card">
      <h2 id={`${id}-h`} className="font-heading text-lg font-semibold text-text">{title}</h2>
      {hint && <p className="mt-1 text-sm text-text-muted">{hint}</p>}
      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => dispatch(fd)); }}
        className="mt-3 space-y-3">
        <input type="hidden" name="business" value={business} />
        {children}
        <Msg s={state} />
        <button type="submit" disabled={pending} className={primary}>{pending ? "Saving…" : button}</button>
      </form>
    </section>
  );
}

/** A button that runs a one-shot server action (delete, reorder) and shows its message. */
function useOneShot(action: (f: FormData) => Promise<ContentState>) {
  const [state, setState] = useState<ContentState>({});
  const [pending, start] = useTransition();
  const run = (fd: FormData) => start(async () => { try { setState(await action(fd)); } catch { setState({ error: "That could not be completed. Reload the page and try again." }); } });
  return { state, pending, run };
}

const PRICE = [["", "Not shown"], ["0", "Free"], ["1", "$"], ["2", "$$"], ["3", "$$$"]] as const;

function Locked({ title, planHref }: { title: string; planHref: string }) {
  return (
    <section aria-label={title} className="rounded-card border border-dashed border-slate-600 bg-surface-card p-4">
      <h2 className="font-heading text-lg font-semibold text-text">{title}</h2>
      <p className="mt-1 text-sm text-text-body">Part of an Enhanced listing. <a href={planHref} className="font-semibold text-link underline">See the plans</a>.</p>
    </section>
  );
}

/** `owner` = a business owner (not staff) is editing: Enhanced-only sections are locked while the listing is Free, and the notes speak to them. */
export function ContentEditor({ business, content: c, communities, categories, tz, mediaBase, owner = false, planHref = "" }: { business: string; content: Content; communities: Opt[]; categories: Opt[]; tz: string; mediaBase: string | null; owner?: boolean; planHref?: string }) {
  const lock = owner && !c.enhanced;
  const grid = hoursGrid(c.hours, RANGES_PER_DAY);
  const linkOf = (kind: string) => c.links.find((l) => l.kind === kind)?.url ?? "";
  const others = c.links.filter((l) => l.kind === "other").map((l) => l.url);
  const faqRows = Math.min(MAX_FAQS, c.faqs.length + 3);
  // Re-key a section when its saved data changes so the fields show what the server now holds.
  const key = (v: unknown) => JSON.stringify(v);

  return (
    <div className="mt-4 space-y-4">
      {!c.enhanced && !owner && (
        <p role="note" className="rounded-card border border-slate-600 bg-surface-muted p-3 text-sm text-text">
          This business is on the <strong>Free</strong> plan. You can fill everything in now, but highlights, services, links, questions, deals and extra photos show on the public page only while it has an active Enhanced listing.
        </p>
      )}

      {lock ? <Locked title="Highlights" planHref={planHref} /> : (
      <Section id="highlights" title="Highlights and price level" business={business} action={saveHighlights} hint="Short selling points, one per line (up to 8, 40 characters each).">
        <div key={key([c.highlights, c.price_range])} className="space-y-3">
          <div>
            <label htmlFor="highlights" className={label}>Highlights</label>
            <textarea id="highlights" name="highlights" rows={4} defaultValue={c.highlights.join("\n")} className={field} />
          </div>
          <div>
            <label htmlFor="price_range" className={label}>Price level</label>
            <select id="price_range" name="price_range" defaultValue={c.price_range === null ? "" : String(c.price_range)} className={`${field} sm:max-w-xs`}>
              {PRICE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      </Section>
      )}

      <Section id="hours" title="Hours" business={business} action={saveHours} hint="Up to three time ranges a day (for a lunch break, say). Leave a day empty for closed or unknown. Use 11:59 PM then 12:00 AM for hours past midnight.">
        <div key={key(c.hours)} className="space-y-2">
          {DAYS.map((name, day) => (
            <fieldset key={name} className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-start">
              <legend className="sr-only">{name}</legend>
              <span aria-hidden className="pt-1.5 text-sm font-medium text-text">{name}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {Array.from({ length: RANGES_PER_DAY }, (_, i) => (
                  <div key={i} className="flex items-center gap-1 text-sm">
                    <input type="time" name={`h${day}_${i}_o`} defaultValue={grid[day][i]?.opens ?? ""} aria-label={`${name} range ${i + 1} opens`} className="rounded-button border border-slate-600 bg-surface-card px-1.5 py-1 text-sm text-text" />
                    <span aria-hidden>–</span>
                    <input type="time" name={`h${day}_${i}_c`} defaultValue={grid[day][i]?.closes ?? ""} aria-label={`${name} range ${i + 1} closes`} className="rounded-button border border-slate-600 bg-surface-card px-1.5 py-1 text-sm text-text" />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </Section>

      {lock ? <Locked title="Services" planHref={planHref} /> : (
      <Section id="services" title="Services" business={business} action={saveServices} hint="One per line, up to 40.">
        <div key={key(c.services)}>
          <label htmlFor="services" className="sr-only">Services, one per line</label>
          <textarea id="services" name="services" rows={6} defaultValue={c.services.join("\n")} className={field} />
        </div>
      </Section>
      )}

      {lock ? <Locked title="Social and other links" planHref={planHref} /> : (
      <Section id="links" title="Social and other links" business={business} action={saveLinks} hint="Full web addresses. Each network must be that network's own address.">
        <div key={key(c.links)} className="grid gap-3 md:grid-cols-2">
          {SOCIAL_KINDS.map((s) => (
            <div key={s.kind}>
              <label htmlFor={`link_${s.kind}`} className={label}>{s.label}</label>
              <input id={`link_${s.kind}`} name={`link_${s.kind}`} type="url" defaultValue={linkOf(s.kind)} placeholder="https://" maxLength={300} className={field} />
            </div>
          ))}
          {Array.from({ length: OTHER_LINKS }, (_, i) => (
            <div key={i}>
              <label htmlFor={`other_${i}`} className={label}>Other link {i + 1}</label>
              <input id={`other_${i}`} name={`other_${i}`} type="url" defaultValue={others[i] ?? ""} placeholder="https://" maxLength={300} className={field} />
            </div>
          ))}
        </div>
      </Section>
      )}

      {lock ? <Locked title="Questions and answers" planHref={planHref} /> : (
      <Section id="faqs" title="Questions and answers" business={business} action={saveFaqs} hint="Common questions. Both parts are needed; empty rows are ignored. These also help the page show up in answer-style search.">
        <div key={key(c.faqs)} className="space-y-3">
          {Array.from({ length: faqRows }, (_, i) => (
            <div key={i} className="grid gap-2 rounded-card bg-surface-muted p-3 md:grid-cols-2">
              <div>
                <label htmlFor={`faq_q_${i}`} className={label}>Question {i + 1}</label>
                <input id={`faq_q_${i}`} name={`faq_q_${i}`} defaultValue={c.faqs[i]?.question ?? ""} maxLength={200} className={field} />
              </div>
              <div>
                <label htmlFor={`faq_a_${i}`} className={label}>Answer {i + 1}</label>
                <textarea id={`faq_a_${i}`} name={`faq_a_${i}`} rows={2} defaultValue={c.faqs[i]?.answer ?? ""} maxLength={1000} className={field} />
              </div>
            </div>
          ))}
        </div>
      </Section>
      )}

      <Section id="areas" title="Service area and extra categories" business={business} action={saveAreas} hint="Where this business works besides its home community, and any other categories it fits. The home community and primary category are already included.">
        <div key={key([c.community_ids, c.category_ids])} className="grid gap-4 md:grid-cols-2">
          <fieldset>
            <legend className={label}>Also serves</legend>
            <div className="mt-1 space-y-1">
              {communities.filter((o) => o.id !== c.home_community_id).map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-text"><input type="checkbox" name="community" value={o.id} defaultChecked={c.community_ids.includes(o.id)} />{o.name}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={label}>Also listed under (up to 5)</legend>
            <div className="mt-1 space-y-1">
              {categories.filter((o) => o.id !== c.primary_category_id).map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-text"><input type="checkbox" name="category" value={o.id} defaultChecked={c.category_ids.includes(o.id)} />{o.name}</label>
              ))}
            </div>
          </fieldset>
        </div>
      </Section>

      {lock ? <Locked title="Deals" planHref={planHref} /> : <DealsSection business={business} deals={c.deals} tz={tz} />}
      <PhotosSection business={business} photos={c.photos} mediaBase={mediaBase} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------- deals
function DealFields({ deal, tz, idp }: { deal?: Deal; tz: string; idp: string }) {
  const [type, setType] = useState<string>(deal?.discount_type ?? "percent");
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {deal && <input type="hidden" name="deal" value={deal.id} />}
      <div className="md:col-span-2">
        <label htmlFor={`${idp}-title`} className={label}>Title</label>
        <input id={`${idp}-title`} name="title" defaultValue={deal?.title ?? ""} maxLength={120} required className={field} />
      </div>
      <div>
        <label htmlFor={`${idp}-type`} className={label}>Kind of deal</label>
        <select id={`${idp}-type`} name="discount_type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
          <option value="percent">Percent off</option><option value="amount">Dollars off</option><option value="bogo">Buy one, get one</option><option value="other">Other offer</option>
        </select>
      </div>
      {(type === "percent" || type === "amount") && (
        <div>
          <label htmlFor={`${idp}-value`} className={label}>{type === "percent" ? "Percent off" : "Dollars off"}</label>
          <input id={`${idp}-value`} name="discount_value" inputMode="decimal" defaultValue={deal?.discount_value ?? ""} className={field} />
        </div>
      )}
      <div>
        <label htmlFor={`${idp}-status`} className={label}>Status</label>
        <select id={`${idp}-status`} name="status" defaultValue={deal?.status ?? "published"} className={field}>
          <option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${idp}-starts`} className={label}>First day <span className="font-normal text-text-muted">(blank: today)</span></label>
        <input id={`${idp}-starts`} type="date" name="starts" defaultValue={deal ? dayInput(deal.starts_at, tz) : ""} className={field} />
      </div>
      <div>
        <label htmlFor={`${idp}-ends`} className={label}>Last day <span className="font-normal text-text-muted">(blank: no end)</span></label>
        <input id={`${idp}-ends`} type="date" name="ends" defaultValue={deal ? dayInput(deal.ends_at, tz, 1) : ""} className={field} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`${idp}-desc`} className={label}>Description</label>
        <textarea id={`${idp}-desc`} name="description" rows={2} maxLength={500} defaultValue={deal?.description ?? ""} className={field} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`${idp}-terms`} className={label}>Terms</label>
        <input id={`${idp}-terms`} name="terms" maxLength={500} defaultValue={deal?.terms ?? ""} className={field} />
      </div>
    </div>
  );
}

function DealCard({ business, deal, tz }: { business: string; deal: Deal; tz: string }) {
  const del = useOneShot(deleteDeal);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="rounded-card border border-slate-600 p-3">
      <Section id={`deal-${deal.id}`} title={deal.title} business={business} action={saveDeal} button="Save deal">
        <div key={JSON.stringify(deal)}><DealFields deal={deal} tz={tz} idp={`d-${deal.id}`} /></div>
      </Section>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!confirm ? <button type="button" onClick={() => setConfirm(true)} className={ghost}>Delete deal…</button> : (
          <>
            <span className="text-sm text-text">Delete this deal for good? Its view history stays, but the deal is gone.</span>
            <button type="button" disabled={del.pending} className={`${btn} bg-danger text-danger-contrast`} onClick={() => { const fd = new FormData(); fd.set("business", business); fd.set("deal", deal.id); del.run(fd); }}>Yes, delete</button>
            <button type="button" onClick={() => setConfirm(false)} className={ghost}>Keep</button>
          </>
        )}
        <Msg s={del.state} />
      </div>
    </li>
  );
}

function DealsSection({ business, deals, tz }: { business: string; deals: Deal[]; tz: string }) {
  return (
    <section aria-labelledby="deals-h" className="space-y-3 rounded-card bg-surface-card p-4 shadow-card">
      <h2 id="deals-h" className="font-heading text-lg font-semibold text-text">Deals</h2>
      <p className="text-sm text-text-muted">Up to 25 at a time. A deal shows publicly while it is published and inside its dates. Archive old deals instead of deleting them when you can.</p>
      {deals.length > 0 && <ul className="space-y-3">{deals.map((d) => <DealCard key={d.id} business={business} deal={d} tz={tz} />)}</ul>}
      <div className="rounded-card border border-dashed border-slate-600 p-3">
        <Section id="deal-new" title="Add a deal" business={business} action={saveDeal} button="Add deal" reset>
          <DealFields tz={tz} idp="d-new" />
        </Section>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------- photos
function PhotoCard({ business, photo, mediaBase, index, galleryIds }: { business: string; photo: Photo; mediaBase: string | null; index: number; galleryIds: string[] }) {
  const del = useOneShot(deletePhoto), move = useOneShot(reorderPhotos);
  const [confirm, setConfirm] = useState(false);
  const url = mediaUrl(mediaBase, photo.bucket, photo.path);
  const gi = galleryIds.indexOf(photo.id);
  const swap = (dir: -1 | 1) => { const ids = [...galleryIds]; [ids[gi], ids[gi + dir]] = [ids[gi + dir], ids[gi]]; const fd = new FormData(); fd.set("business", business); ids.forEach((i) => fd.append("order", i)); move.run(fd); };
  return (
    <li className="rounded-card border border-slate-600 p-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-surface-muted sm:w-40">
          {url ? <Image src={url} alt={photo.alt ?? ""} fill sizes="160px" unoptimized className="object-cover" /> : <span className="p-2 text-xs text-text-muted">No preview</span>}
        </div>
        <div className="min-w-0">
          <Section id={`photo-${photo.id}`} title={photo.role === "logo" ? "Logo" : photo.role === "cover" ? "Cover photo" : `Photo ${index + 1}`} business={business} action={updatePhoto} button="Save photo">
            <input type="hidden" name="photo" value={photo.id} />
            <div key={JSON.stringify([photo.alt, photo.caption, photo.role])} className="space-y-3">
            <div>
              <label htmlFor={`pa-${photo.id}`} className={label}>Alt text <span className="font-normal text-text-muted">(describes the photo for people who cannot see it)</span></label>
              <input id={`pa-${photo.id}`} name="alt" defaultValue={photo.alt ?? ""} maxLength={200} required className={field} />
            </div>
            <div>
              <label htmlFor={`pc-${photo.id}`} className={label}>Caption</label>
              <input id={`pc-${photo.id}`} name="caption" defaultValue={photo.caption ?? ""} maxLength={150} className={field} />
            </div>
            <div>
              <label htmlFor={`pr-${photo.id}`} className={label}>Use as</label>
              <select id={`pr-${photo.id}`} name="role" defaultValue={photo.role} className={`${field} sm:max-w-xs`}>
                <option value="gallery">Gallery photo</option><option value="cover">Cover photo (replaces the current one)</option><option value="logo">Logo (replaces the current one)</option>
              </select>
            </div>
            </div>
          </Section>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {photo.role === "gallery" && galleryIds.length > 1 && (
              <>
                <button type="button" disabled={move.pending || gi === 0} onClick={() => swap(-1)} className={ghost} aria-label={`Move photo ${index + 1} earlier`}>Move earlier</button>
                <button type="button" disabled={move.pending || gi === galleryIds.length - 1} onClick={() => swap(1)} className={ghost} aria-label={`Move photo ${index + 1} later`}>Move later</button>
              </>
            )}
            {!confirm ? <button type="button" onClick={() => setConfirm(true)} className={ghost}>Delete…</button> : (
              <>
                <span className="text-sm text-text">Delete this photo and its file?</span>
                <button type="button" disabled={del.pending} className={`${btn} bg-danger text-danger-contrast`} onClick={() => { const fd = new FormData(); fd.set("business", business); fd.set("photo", photo.id); del.run(fd); }}>Yes, delete</button>
                <button type="button" onClick={() => setConfirm(false)} className={ghost}>Keep</button>
              </>
            )}
          </div>
          <Msg s={del.state} /><Msg s={move.state} />
        </div>
      </div>
    </li>
  );
}

function PhotosSection({ business, photos, mediaBase }: { business: string; photos: Photo[]; mediaBase: string | null }) {
  const galleryIds = photos.filter((p) => p.role === "gallery").map((p) => p.id);
  return (
    <section aria-labelledby="photos-h" className="space-y-3 rounded-card bg-surface-card p-4 shadow-card">
      <h2 id="photos-h" className="font-heading text-lg font-semibold text-text">Photos</h2>
      <p className="text-sm text-text-muted">JPEG, PNG or WebP, at most 5 MB, at least 200 pixels on a side. A business has one logo and one cover photo; setting a new one replaces the old. Up to 30 photos in all. Free listings show the logo and one photo.</p>
      {photos.length > 0 && <ul className="space-y-3">{photos.map((p, i) => <PhotoCard key={p.id} business={business} photo={p} mediaBase={mediaBase} index={i} galleryIds={galleryIds} />)}</ul>}
      <div className="rounded-card border border-dashed border-slate-600 p-3">
        <Section id="photo-new" title="Add a photo" business={business} action={uploadPhoto} button="Upload photo" reset>
          <div>
            <label htmlFor="pn-file" className={label}>Photo file</label>
            <input id="pn-file" type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-sm text-text" />
          </div>
          <div>
            <label htmlFor="pn-alt" className={label}>Alt text <span className="font-normal text-text-muted">(required, except for a logo)</span></label>
            <input id="pn-alt" name="alt" maxLength={200} className={field} />
          </div>
          <div>
            <label htmlFor="pn-caption" className={label}>Caption</label>
            <input id="pn-caption" name="caption" maxLength={150} className={field} />
          </div>
          <div>
            <label htmlFor="pn-role" className={label}>Use as</label>
            <select id="pn-role" name="role" defaultValue="gallery" className={`${field} sm:max-w-xs`}>
              <option value="gallery">Gallery photo</option><option value="cover">Cover photo</option><option value="logo">Logo</option>
            </select>
          </div>
        </Section>
      </div>
    </section>
  );
}
