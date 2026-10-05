"use client";

import Image from "next/image";
import { startTransition, useActionState, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { removeCover, uploadCover, deleteArticle, deleteEvent, type EditorialState } from "./actions";

export const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
export const labelCls = "text-sm font-medium text-text";
export const primary = "rounded-button bg-brand px-5 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60";
export const ghost = "rounded-button border border-slate-600 px-4 py-2 text-sm font-semibold text-text disabled:opacity-60";

export const Msg = ({ s }: { s: EditorialState }) => (<>
  {s.error && <p role="alert" className="text-sm font-medium text-danger-text">{s.error}</p>}
  {s.message && <p role="status" className="text-sm font-medium text-green-800">{s.message}</p>}
</>);

/** A form that submits through a server action without React 19's automatic form reset (which would wipe the fields on a failed save). */
export function ActionForm({ action, children, className, buttonLabel = "Save", pendingLabel = "Saving…" }: {
  action: (s: EditorialState, f: FormData) => Promise<EditorialState>; children: React.ReactNode; className?: string; buttonLabel?: string; pendingLabel?: string }) {
  const [state, dispatch, pending] = useActionState<EditorialState, FormData>(action, {});
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => dispatch(fd)); }} className={className ?? "space-y-4"}>
      {children}
      <Msg s={state} />
      <button type="submit" disabled={pending} className={primary}>{pending ? pendingLabel : buttonLabel}</button>
    </form>
  );
}

export function DeleteButton({ kind, id, what }: { kind: "article" | "event"; id: string; what: string }) {
  const [state, dispatch, pending] = useActionState<EditorialState, FormData>(kind === "article" ? deleteArticle : deleteEvent, {});
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!confirm ? <button type="button" className={ghost} onClick={() => setConfirm(true)}>Delete {what}…</button> : (
        <>
          <span className="text-sm text-text">Delete this {what} for good?</span>
          <button type="button" disabled={pending} className="rounded-button bg-danger px-4 py-2 text-sm font-semibold text-danger-contrast disabled:opacity-60" onClick={() => { const fd = new FormData(); fd.set("id", id); startTransition(() => dispatch(fd)); }}>Yes, delete</button>
          <button type="button" className={ghost} onClick={() => setConfirm(false)}>Keep</button>
        </>
      )}
      <Msg s={state} />
    </div>
  );
}

export function CoverImage({ kind, id, current, mediaBase }: { kind: "article" | "event"; id: string; current: { bucket: string; path: string; alt: string | null } | null; mediaBase: string | null }) {
  const url = current ? mediaUrl(mediaBase, current.bucket, current.path) : null;
  const [rm, rmDispatch, rmPending] = useActionState<EditorialState, FormData>(removeCover, {});
  return (
    <section aria-labelledby="cover-h" className="rounded-card bg-surface-card p-4 shadow-card">
      <h2 id="cover-h" className="font-heading text-lg font-semibold text-text">{kind === "article" ? "Cover image" : "Event image"}</h2>
      <p className="mt-1 text-sm text-text-muted">JPEG, PNG or WebP, at most 5 MB, at least 200 pixels on a side. Describe it for people who cannot see it.</p>
      {current && (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div className="relative aspect-[16/9] w-48 overflow-hidden rounded-card bg-surface-muted">{url ? <Image src={url} alt={current.alt ?? ""} fill sizes="192px" unoptimized className="object-cover" /> : <span className="p-2 text-xs text-text-muted">No preview</span>}</div>
          <div className="min-w-0 text-sm text-text"><p className="[overflow-wrap:anywhere]">{current.alt}</p>
            <button type="button" disabled={rmPending} className={`${ghost} mt-2`} onClick={() => { const fd = new FormData(); fd.set("kind", kind); fd.set("id", id); startTransition(() => rmDispatch(fd)); }}>Remove image</button>
          </div>
        </div>
      )}
      <Msg s={rm} />
      <ActionForm action={uploadCover} className="mt-4 space-y-3" buttonLabel={current ? "Replace image" : "Upload image"} pendingLabel="Uploading…">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
        <div><label htmlFor="cover-file" className={labelCls}>Image file</label><input id="cover-file" type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-sm text-text" /></div>
        <div><label htmlFor="cover-alt" className={labelCls}>Alt text</label><input id="cover-alt" name="alt" maxLength={200} required className={field} /></div>
      </ActionForm>
    </section>
  );
}
