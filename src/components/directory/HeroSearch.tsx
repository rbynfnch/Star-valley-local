"use client";
import { useState } from "react";
import { SearchIcon } from "@/components/icons";

const SCOPES = [
  { value: "businesses", label: "Businesses", action: "/businesses" },
  { value: "events", label: "Events", action: "/events" },
  { value: "hotlist", label: "Hotlist", action: "/hotlist" },
  { value: "articles", label: "Articles", action: "/articles" },
] as const;

// A plain GET form, so it works without JavaScript (it searches businesses). With JavaScript the scope pills
// change where the form submits. Not a tablist: these are choices in a form, so a radio group is the right control.
export function HeroSearch({ communities }: { communities: { slug: string; name: string }[] }) {
  const [scope, setScope] = useState<(typeof SCOPES)[number]["value"]>("businesses");
  const action = SCOPES.find((s) => s.value === scope)!.action;
  return (
    <form action={action} method="get" role="search" aria-label="Search" className="w-full max-w-2xl space-y-3">
      <fieldset>
        <legend className="sr-only">What to search</legend>
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <label key={s.value} className={`cursor-pointer rounded-pill px-4 py-1.5 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white ${scope === s.value ? "bg-white text-text" : "bg-white/15 text-white hover:bg-white/25"}`}>
              <input type="radio" name="scope" value={s.value} checked={scope === s.value} onChange={() => setScope(s.value)} className="sr-only" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2 rounded-card bg-surface-card p-2 shadow-card sm:flex-row sm:items-center">
        <div className="flex-1">
          <label htmlFor="hero-q" className="sr-only">What are you looking for?</label>
          <input id="hero-q" name="q" type="search" placeholder="What are you looking for?" autoComplete="off" className="w-full rounded-button bg-transparent px-3 py-2.5 text-text placeholder:text-text-muted" />
        </div>
        <div className="sm:border-l sm:border-border sm:pl-2">
          <label htmlFor="hero-community" className="sr-only">Community</label>
          <select id="hero-community" name="community" defaultValue="" className="w-full rounded-button bg-transparent px-3 py-2.5 text-text sm:w-48">
            <option value="">All locations</option>
            {communities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="flex items-center justify-center gap-2 rounded-button bg-brand px-5 py-2.5 font-semibold text-brand-contrast hover:bg-brand-hover">
          <SearchIcon /><span className="sm:sr-only">Search</span>
        </button>
      </div>
    </form>
  );
}
