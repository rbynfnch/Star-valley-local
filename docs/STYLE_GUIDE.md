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
| Label / eyebrow | Small uppercase with generous letter spacing |

> **Open decision: the actual typefaces are not chosen.** The site currently uses Source Serif 4 for headlines and Inter
> for body, picked by eye from the early mockups. A serif headline does not match "modern sans with character". Candidate
> display faces to review on real headlines are listed in "Applying this guide". Self-hosting through `next/font` keeps the
> choice free of runtime third-party requests.

---

## 07. Typography rules

### Headlines

Prefer **What's Happening in Star Valley** over **WHAT'S HAPPENING IN STAR VALLEY!!!** The brand has confidence without
shouting.

- Use **sentence case** (or title case for named things) for most digital content.
- Uppercase is reserved for: navigation, small labels, categories, dates, short calls to action, occasional campaign
  graphics.
- No exclamation marks in headlines.

---

## 08. Photography style

Photography should feel **documentary, warm and real.**

| Priority | Over |
|---|---|
| Real people | polished stock photography |
| Real businesses | generic storefronts |
| Real events | staged community scenes |
| Real landscapes | generic mountain imagery |

**Color treatment.** Natural, slightly warm, crisp, dimensional, minimally processed. Avoid heavy filters. The colors of
Star Valley should come from the actual environment, not from an Instagram preset.

---

## 09. Graphic elements

Star Valley Local should eventually develop a small library of proprietary graphic elements.

1. **The Star.** A subtle reference to Star Valley. Not a generic five-point star pasted onto everything.
2. **Valley line.** A simplified geographic line or contour that can become a recurring visual motif.
3. **Editorial rule.** Thin horizontal lines can separate: LOCAL / BUSINESS / EVENTS / HOTLIST.
4. **Corner shapes.** Small geometric accents create visual continuity across social graphics.
5. **Organic shapes.** Sage and mustard can occasionally appear as organic blocks behind photography or headlines.

---

## 10. The Star Valley Local "Flame"

For Local Hotlist, this gets its own visual language. The flame should be:

- proprietary
- simple
- recognizable at 24px
- strong enough for merchandise
- recognizable without the wordmark
- related to Star Valley Local
- **not** a generic flame emoji shape

### Hotlist color treatment

| Level | Colors |
|---|---|
| Primary | Navy + Mustard |
| Secondary | Cream + Navy |
| Occasional | Navy + Terracotta |

The mustard becomes the visual signal for **HOT / NOW / DON'T MISS.**

> The flame mark has to be designed (it is an illustration task, not something to generate in code). Until it exists, the
> site uses a text label ("Hotlist") with no flame glyph.

---

## 11. Iconography

Icons should be **simple + geometric + slightly rounded.**

**Avoid:** detailed illustrations, overly thin line icons, cartoon icons, mismatched icon sets, excessive Western imagery.

**Suggested set:** Location, Events, Hotlist, Favorites, Featured, Business, Food, Shopping, Deals, Community.

The production icon set uses **one custom style**, not emoji. (Emoji in the list above are only a shorthand for the
concepts.)

Practical rules for the build: one stroke width and one corner radius across the whole set; icons that carry meaning have a
text label or accessible name; icon-only controls need an accessible name and a 3:1 contrast.

---

## 12. Buttons

| Button | Treatment | Example |
|---|---|---|
| **Primary CTA** | Navy background, Cream text | EXPLORE LOCAL |
| **Secondary CTA** | Cream background, Navy border, Navy text | VIEW EVENTS |
| **Hotlist CTA** | Mustard background, Charcoal or Navy text | SEE THE HOTLIST |

Buttons are: rounded but not pill-shaped everywhere; substantial; highly readable; action-oriented. Button labels are
short uppercase calls to action (the one place uppercase CTAs are expected).

---

## 13. Cards

Cards should feel **editorial, not like database records.** The visual hierarchy makes the content more important than the
UI container.

**Business card:** Photo, Business Name, Category, Location, Short descriptor, **→ Explore**

**Event card:** Date, Event Name, Location, Short description, **→ Details**

**Hotlist card:** HOTLIST label, Large image, Headline, Why it's worth knowing, **→ See it**

Product rules that apply regardless of style (from `CLAUDE.md`): no star ratings or review counts on cards, no distance and
no "open now"; location is a community label.

---

## 14. Social media style

Social should look unmistakably like Star Valley Local even before someone sees the account name.

**The formula:** large headline, strong photography, one brand accent, a small Star Valley Local mark.

Example, "5 THINGS TO DO THIS WEEKEND": Cream background, Navy headline, Mustard date/accent, photography underneath. This
creates repeatable recognition.

---

## 15. Social content categories

Each category has its own subtle visual accent. This creates organization without turning the feed into a rainbow.

| Category | Accent |
|---|---|
| LOCAL | Navy |
| EVENTS | Valley Blue |
| HOTLIST | Mustard |
| COMMUNITY | Sage |
| STORIES | Terracotta |
| BUSINESS | Charcoal / Cream |

(Applying the contrast rules in section 04: Sage backgrounds carry Navy or Charcoal only at large sizes, or a Cream/White
panel carries the small text.)

---

## 16. Brand don'ts

- **Don't** use mountains as the logo simply because Star Valley is mountainous.
- **Don't** make everything brown and western.
- **Don't** use every palette color in every design.
- **Don't** put giant logos on every graphic.
- **Don't** use excessive badges and stickers.
- **Don't** make every post look identical.
- **Don't** use generic stock photos of cowboys, barns and mountains.
- **Don't** make the brand feel like a chamber of commerce.
- **Don't** make "local" synonymous with amateur.

---

## 17. The brand should feel like

- A modern local magazine.
- A useful digital guide.
- A trusted community connector.
- A place people check regularly.
- A brand businesses want to be associated with.

---

## 18. Visual north star

If we have to make a design decision and aren't sure which direction to go, ask:

> **Would this look at home on the cover of a really good modern regional magazine?**

If yes, it's probably on brand. If it looks like a coupon mailer, a tourism brochure, a Facebook community group, a Chamber
directory, or a Western gift shop: rethink it.

---

## Applying this guide to the site

Not done yet, by design: it changes how every public and admin page looks, so it should be reviewed first.

**What would change** (source of truth `src/styles/tokens.ts`; `npm run tokens` regenerates the CSS; `tokens.test.ts` checks
every pairing the UI uses):

| Today (from the early mockups) | Under this guide |
|---|---|
| Page background: warm off-white | Cream `#E8E1D6` for large areas, white for cards and long reading |
| Primary button: brick `#bc563b`, white text | Navy `#193153`, Cream text |
| Header / footer: navy-800 | Star Valley Navy `#193153` |
| Body text: ink / slate | Charcoal `#1F2428` |
| Links: lake-700 | Valley Blue `#355C73` |
| Category tiles: nine hues (brick, lake, sunset, lavender, plum, navy, sage, slate, sky) | Fewer, calmer accents: Navy, Valley Blue, Sage, Terracotta, Mustard. The nine-hue set conflicts with "don't use every color equally" |
| Verified badge: green | Sage family (white text on Original Sage is 5.69:1) |
| Featured / sponsored marker | Mustard with Charcoal text (6.83:1) |

**Per-tenant theming stays.** `tenants.theme` overrides still go through `buildThemeStyle()` and its contrast guard, so
Teton Valley Local and the next tenants can bring their own palette; this guide defines Star Valley's.

**Decisions needed before building it:**

1. **Typefaces.** The guide asks for a modern, high-character display sans and a very readable body sans, but names none.
   Candidates to try on real headlines (all open-licence, self-hostable): *Bricolage Grotesque*, *Familjen Grotesk*,
   *Space Grotesk*, *Outfit*, *DM Sans* for display; *Inter*, *Public Sans* or *Source Sans 3* for body. I would shortlist
   two display faces and look at them on the home page before committing.
2. **Logo.** I still need the logo as SVG. The guide requires a single-color primary mark (Navy / Cream / Charcoal), which
   makes it easy to recolor once I have vector artwork.
3. **Hotlist.** "Local Hotlist" is not in `CLAUDE.md` (V1 or V2/V3). The guide gives it a visual identity, a flame mark and
   Mustard signalling. Is it a product feature to plan for (a curated weekly list in the Articles / Things to Do engine),
   or a social-only format for now? That decides whether it needs data model and pages.
4. **Cream as the page background** is a strong, warm base but it reduces contrast for Stone and Terracotta text (section
   04). I would use Cream for hero bands and section backgrounds and keep long-form reading and cards on white.
