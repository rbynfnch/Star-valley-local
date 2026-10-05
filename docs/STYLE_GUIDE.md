# STAR VALLEY LOCAL: Brand Style Guide

**Version 1.0.** The palette in section 1 is locked.

> **Status of the code.** This guide is the new source of truth for the brand. The site as built today still uses the
> colours extracted from the early mockups (see `docs/DESIGN_TOKENS.md`). Moving the site onto this palette is a separate,
> reviewed step: see "Applying this guide to the site" at the end. Nothing in `src/` has been changed by this document.

---

## 01. Color palette

The palette should feel like Star Valley without looking like a tourism brand: deep mountain blues, warm earth, natural
greens, stone neutrals, and one energetic golden accent.

### Primary colors

| Color | Hex | Role |
|---|---|---|
| Star Valley Navy | `#193153` | Primary brand / headers / logo |
| Charcoal | `#1F2428` | Primary text / dark backgrounds |
| Valley Blue | `#355C73` | Secondary brand color |

### Earth and natural colors

| Color | Hex | Role |
|---|---|---|
| Terracotta | `#A24B2A` | Warm accent / editorial emphasis |
| Original Sage | `#5E6B4E` | Natural secondary color |
| New Sage | `#7C8B63` | Fresh, lighter green accent |
| Stone | `#68727A` | Secondary neutral |
| Sky Gray | `#A7B0B5` | Light neutral |

### Warm colors

| Color | Hex | Role |
|---|---|---|
| Cream | `#E8E1D6` | Primary light background |
| Mustard | `#D2A52E` | Energy / highlights / Hotlist accent |

### Why the two new colors

**New Sage, `#7C8B63`.** Works with the existing `#5E6B4E` without making the palette feel repetitive. The darker sage
anchors sections; the lighter sage provides cards, category backgrounds, badges, illustrations, social graphics and subtle
UI highlights.

**Mustard, `#D2A52E`.** Deliberately a golden mustard rather than a bright yellow. It works against the navy beautifully
and gives Star Valley Local an energetic accent without making the brand feel childish.

### The locked palette

```
#193153  Star Valley Navy      #A24B2A  Terracotta       #68727A  Stone
#1F2428  Charcoal              #5E6B4E  Original Sage    #A7B0B5  Sky Gray
#355C73  Valley Blue           #7C8B63  New Sage         #E8E1D6  Cream
                                                         #D2A52E  Mustard
```

---

## 02. Color hierarchy

The most important rule: **don't use every color equally.** Star Valley Local should have a recognizable visual base.

| Share | What |
|---|---|
| **60%** | Cream / white / neutral space |
| **20%** | Star Valley Navy + Charcoal |
| **10%** | Valley Blue / Stone / Sky |
| **10%** | Terracotta / Sage / Mustard |

This gives the brand a sophisticated editorial appearance.

---

## 03. Signature color pairings

These combinations should become recognizable Star Valley Local combinations.

**Primary: Star Valley Navy + Cream** (`#193153` + `#E8E1D6`).
Website hero sections, major brand graphics, signage, presentations, primary campaigns.

**Local / Natural: Navy + Sage** (`#193153` + `#7C8B63`).
Community, outdoors, local businesses, agriculture, seasonal content.

**Hotlist: Navy + Mustard** (`#193153` + `#D2A52E`).
This could become particularly important. The mustard becomes the visual energy of Local Hotlist, while navy keeps it
connected to Star Valley Local.

**Editorial: Charcoal + Cream + Terracotta** (`#1F2428` + `#E8E1D6` + `#A24B2A`).
Articles, profiles, storytelling, food, culture, feature pieces.

---

## 04. Color accessibility

For digital interfaces, don't rely on the lighter colors for body text.

**Best dark-text combinations:** Charcoal on Cream, Navy on Cream, White on Navy, White on Charcoal.

**Accent colors.** Mustard, sage, terracotta and sky should primarily function as visual accents, backgrounds, borders,
tags and graphic elements. This keeps the site readable while preserving the personality of the palette.

### Measured contrast (WCAG 2.1)

Ratios computed with the project's own `contrastRatio()` (`src/lib/color.ts`). **AA needs 4.5:1 for normal text, 3:1 for
large text (24px, or 18.66px bold) and for non-text UI such as borders and icons.**

| Pairing (text on background) | Ratio | Use |
|---|---|---|
| White on Charcoal | 15.66 | Any text |
| White on Navy | 13.08 | Any text |
| Charcoal on Cream | 12.06 | Any text |
| Navy on Cream | 10.07 | Any text |
| Cream on Navy | 10.07 | Any text |
| Cream on Charcoal | 12.06 | Any text |
| White on Valley Blue | 7.17 | Any text |
| Valley Blue on White | 7.17 | Any text, links |
| Charcoal on Sky Gray | 7.10 | Any text |
| Charcoal on Mustard | 6.83 | Any text (Hotlist button) |
| Navy on Sky Gray | 5.93 | Any text |
| Sky Gray on Navy | 5.93 | Any text |
| White on Terracotta | 5.87 | Any text (buttons) |
| Mustard on Navy | 5.71 | Any text |
| Navy on Mustard | 5.71 | Any text |
| White on Original Sage | 5.69 | Any text |
| Cream on Valley Blue | 5.52 | Any text |
| Valley Blue on Cream | 5.52 | Any text, links |
| Stone on White | 4.91 | Any text |
| White on Stone | 4.91 | Any text |
| Terracotta on Cream | 4.52 | Text passes, only just: avoid below 14px |
| Cream on Terracotta | 4.52 | Text passes, only just: avoid below 14px |
| Cream on Original Sage | 4.38 | **Large text only**; use white for small text |
| Charcoal on New Sage | 4.27 | **Large text only** |
| Stone on Cream | 3.78 | **Large text only**; Stone body text goes on white |
| White on New Sage | 3.66 | **Large text only** |
| **Navy on New Sage** | **3.57** | **Large text only (see below)** |
| Navy on Stone | 2.66 | **Never for text** |

### Rules that follow from the numbers

1. **The "Navy + Sage" pairing is a graphic pairing.** Navy on New Sage is 3.57:1. Use it for blocks, borders, badges and
   large display type (24px and up). **Do not set small text on New Sage.** If a card has body copy, put the copy on
   Cream or White and use New Sage for the card's edge, tag or header band.
2. **Stone is for white backgrounds.** Stone on Cream is 3.78:1. Meta text (dates, captions) in Stone sits on white, or
   moves to Charcoal on Cream.
3. **Terracotta text on Cream is at the limit** (4.52:1). Fine for 16px+ emphasis and eyebrow labels; never for fine print.
4. **Mustard is a background or an accent on Navy or Charcoal, never text on Cream** (mustard on cream is far below
   3:1). Text on a Mustard background is Charcoal or Navy.
5. **Non-text elements (input borders, icons that carry meaning, focus rings) need 3:1** against what they sit on. Sky Gray
   on Cream is only 1.70:1 and Mustard on Cream 1.77:1, so neither can be an input border or a meaningful icon there.
   Stone (3.78:1 on Cream, 4.91:1 on White), Valley Blue (5.52:1 on Cream) and Navy do pass. Sky Gray is for decoration:
   dividers, backgrounds, disabled states.
6. Never convey meaning by color alone (a Hotlist item says "Hotlist", a Featured business says "Featured").

---

## 05. Logo colors

The primary logo has a limited color system.

| Use | Treatment |
|---|---|
| **Preferred** | Navy logo on Cream or White |
| **Reverse** | Cream logo on Navy |
| **Secondary** | Charcoal logo on Cream |
| **Special application** | Navy + Mustard, for select campaigns or Hotlist applications |

**Do not make the primary logo a multi-colored logo.** The brand needs a strong monochromatic version so it remains
recognizable everywhere.

---

## 06. Typography direction

The typography should reinforce the idea: **modern local media, not local directory software.**

**Display typeface.** A high-character modern sans-serif: distinctive letterforms, strong large headlines, excellent
numbers, editorial personality, clean geometry.

**Body typeface.** A highly readable modern sans-serif. Priorities: readability, clean spacing, digital performance,
excellent small-size rendering.

### Hierarchy

| Level | Character |
|---|---|
| H1 | Large, confident, editorial |
| H2 | Strong section heading |
| H3 | Compact supporting headline |
| Body | Simple and highly readable |
| Label / eyebrow | Small, sentence case, semibold (all-caps avoided per the typography decision) |

> **Decided: Bricolage Grotesque + Inter.** Bricolage Grotesque is used for headlines, feature titles, major section
> headings, Hotlist branding and prominent numbers. Inter is used for navigation, body copy, listings, metadata, buttons,
> forms and UI. Both are OFL variable fonts, self-hosted (latin subset) through `next/font/local` in `src/app/layout.tsx`
> with licences in `src/app/fonts/`. Weights stay restrained (regular, medium, semibold, bold), and all-caps and
> decorative type are avoided.

Teton Valley Local and the next tenants can bring their own palette; this guide defines Star Valley's.

**Decisions needed before building it:**

1. **Typefaces — resolved** (Bricolage Grotesque + Inter, see above). Original note: the guide asks for a modern, high-character display sans and a very readable body sans, but names none.
   Candidates to try on real headlines (all open-licence, self-hostable): *Bricolage Grotesque*, *Familjen Grotesk*,
   *Space Grotesk*, *Outfit*, *DM Sans* for display; *Inter*, *Public Sans* or *Source Sans 3* for body. I would shortlist
   two display faces and look at them on the home page before committing.
2. **Logo.** Raster logos were supplied and cropped into `public/brand/` (mark, lockup, Local Hotlist). I still want SVG artwork, plus a Cream reverse version for navy backgrounds. The guide requires a single-color primary mark (Navy / Cream / Charcoal), which
   makes it easy to recolor once I have vector artwork.
3. **Hotlist.** "Local Hotlist" is not in `CLAUDE.md` (V1 or V2/V3). The guide gives it a visual identity, a flame mark and
   Mustard signalling. Is it a product feature to plan for (a curated weekly list in the Articles / Things to Do engine),
   or a social-only format for now? That decides whether it needs data model and pages.
4. **Cream as the page background** is a strong, warm base but it reduces contrast for Stone and Terracotta text (section
   04). I would use Cream for hero bands and section backgrounds and keep long-form reading and cards on white.
