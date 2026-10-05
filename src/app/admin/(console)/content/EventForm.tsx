"use client";

import { useState } from "react";
import { WEEKDAYS, type Repeat } from "@/lib/admin/editorial-input";
import { saveEvent } from "./actions";
import { ActionForm, field, labelCls } from "./EditorialBits";

export interface EventValues {
  id: string | null; title: string; description: string; community: string; category: string; venue: string; address: string; start_date: string; start_time: string; end_date: string; end_time: string;
  all_day: boolean; repeat: Repeat; repeat_until: string; url: string; organizer: string; status: string;
}
type Opt = { id: string; name: string };

export function EventForm({ v, communities, categories }: { v: EventValues; communities: Opt[]; categories: Opt[] }) {
  const [allDay, setAllDay] = useState(v.all_day);
  const [freq, setFreq] = useState<string>(v.repeat.freq);
  return (
    <ActionForm action={saveEvent} buttonLabel={v.id ? "Save event" : "Create event"}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div><label htmlFor="title" className={labelCls}>Title</label><input id="title" name="title" defaultValue={v.title} maxLength={150} required className={field} /></div>
      <div><label htmlFor="description" className={labelCls}>Description</label><textarea id="description" name="description" rows={5} maxLength={3000} defaultValue={v.description} className={field} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label htmlFor="community" className={labelCls}>Community</label>
          <select id="community" name="community" defaultValue={v.community} className={field}><option value="">Anywhere in the valley</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="category" className={labelCls}>Type of event</label>
          <select id="category" name="category" defaultValue={v.category} className={field}><option value="">None</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="venue" className={labelCls}>Venue</label><input id="venue" name="venue" defaultValue={v.venue} maxLength={150} className={field} /></div>
        <div><label htmlFor="address" className={labelCls}>Street address</label><input id="address" name="address" defaultValue={v.address} maxLength={200} className={field} /></div>
      </div>
      <fieldset className="rounded-card border border-slate-600 p-3">
        <legend className="px-1 text-sm font-semibold text-text">When <span className="font-normal text-text-muted">(Mountain time)</span></legend>
        <label className="flex items-center gap-2 text-sm text-text"><input id="all_day" type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />All day</label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label htmlFor="start_date" className={labelCls}>First day</label><input id="start_date" type="date" name="start_date" defaultValue={v.start_date} required className={field} /></div>
          {!allDay && <div><label htmlFor="start_time" className={labelCls}>Starts</label><input id="start_time" type="time" name="start_time" defaultValue={v.start_time} className={field} /></div>}
          <div><label htmlFor="end_date" className={labelCls}>Last day <span className="font-normal text-text-muted">(blank: same day)</span></label><input id="end_date" type="date" name="end_date" defaultValue={v.end_date} className={field} /></div>
          {!allDay && <div><label htmlFor="end_time" className={labelCls}>Ends</label><input id="end_time" type="time" name="end_time" defaultValue={v.end_time} className={field} /></div>}
        </div>
      </fieldset>
      <fieldset className="rounded-card border border-slate-600 p-3">
        <legend className="px-1 text-sm font-semibold text-text">Repeats</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label htmlFor="repeat" className={labelCls}>How often</label>
            <select id="repeat" name="repeat" value={freq} onChange={(e) => setFreq(e.target.value)} className={field}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly (same day of the month)</option></select></div>
          {freq !== "none" && <div><label htmlFor="repeat_interval" className={labelCls}>Every <span className="font-normal text-text-muted">({freq === "daily" ? "days" : freq === "weekly" ? "weeks" : "months"})</span></label>
            <input id="repeat_interval" name="repeat_interval" type="number" min={1} max={52} defaultValue={v.repeat.interval} className={field} /></div>}
          {freq !== "none" && <div><label htmlFor="repeat_until" className={labelCls}>Until <span className="font-normal text-text-muted">(blank: keeps going)</span></label><input id="repeat_until" type="date" name="repeat_until" defaultValue={v.repeat_until} className={field} /></div>}
        </div>
        {freq === "weekly" && (
          <fieldset className="mt-3"><legend className={labelCls}>On <span className="font-normal text-text-muted">(blank: the same weekday as the first day)</span></legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{WEEKDAYS.map(([d, name]) => <label key={d} className="flex items-center gap-1.5 text-sm text-text"><input type="checkbox" name="repeat_days" value={d} defaultChecked={v.repeat.days.includes(d)} />{name}</label>)}</div></fieldset>
        )}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label htmlFor="url" className={labelCls}>Event website</label><input id="url" name="url" type="url" defaultValue={v.url} maxLength={300} placeholder="https://" className={field} /></div>
        <div><label htmlFor="organizer" className={labelCls}>Hosted by a business <span className="font-normal text-text-muted">(web address name)</span></label><input id="organizer" name="organizer" defaultValue={v.organizer} placeholder="valley-plumbing" className={field} /></div>
        <div><label htmlFor="status" className={labelCls}>Status</label>
          <select id="status" name="status" defaultValue={v.status} className={field}><option value="published">Published</option><option value="cancelled">Cancelled (hidden)</option><option value="pending">Pending (hidden)</option></select></div>
      </div>
    </ActionForm>
  );
}
