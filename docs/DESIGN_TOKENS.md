# Design tokens

Extracted from the four mockups in `/design`. Source of truth: `src/styles/tokens.ts`. `npm run tokens`
generates `src/styles/tokens.generated.css` (CSS variables plus the Tailwind v4 `@theme` mapping); a test fails
if the generated file is stale. Look at everything rendered at `/styleguide` (development only; it returns 404 in
production).

## How the colours were extracted

Region medians were sampled from the large flat areas (buttons, category tiles, sidebars, footer, page
background, badges), not from photos or text edges. The mockups are AI-generated, so each "flat" colour carries
noise; values were cross-checked across mockups. Where two samples disagreed I took the cleaner (larger, solid)
area.

## Where I changed a mockup colour, and why

CLAUDE.md §10 requires WCAG 2.1 AA. The mockups put text on several colours that fail it. I kept each hue and
changed only lightness (or chose the text colour).

| Token | Mockup sample | Problem | Final | Result |
|---|---|---|---|---|
| `brick-600` (CTA, Eat & Drink) | `#c2593d` | white text 4.38:1 | `#bc563b` | 4.6:1 with white |
| `brick-700` (hover, and brick used **as text**) | n/a | brick text on cream needs 4.5:1 | `#9f4932` | passes |
| `amber-500` (Health & Wellness tile) | `#dc882d` | white text 2.76:1 | same fill, **dark text** (`navy-900`) | 5.1:1 |
| `lavender-500` (Shopping / Events) | `#a786bd` | white text 3.09:1 | same fill, **dark text** | 4.5:1 |
| `lavender-400` (Family) | `#b49bc0` | white text fails | same fill, **dark text** | 5.6:1 |
| `lavender-700` (new) | n/a | a purple that can carry white text | `#8e63aa` | passes |
| `green-700` (solid Verified) | `#69976b` | white text 3.37:1 | `#577e59` | passes |
| `green-100` + `green-800` (Verified pill) | `#c3ddc8` | n/a | text `#446246` | passes |
| `ink-500` (meta text) | `#8b99a2` | 2.7:1 on cream | `#5f6e77` | 4.98:1 |

Unchanged because they already pass: `ink-600` muted text `#526876` (5.5:1), `lake-700` links `#255c90`
(6.6:1), `lake-500` (white text 5.2:1), `sage-600`, `slate-600`, `gold-300` and `orange-400` with dark text, navy
backgrounds with white text (10.7 to 14:1).

A test (`tokens.test.ts`) checks **every** pairing the UI uses, and that the raw mockup values that fail are
documented as failing.

## Semantic tokens and categories

Components use semantic names (`bg-brand`, `text-text-muted`, `bg-surface-card`, `rounded-card`,
`shadow-card`, `bg-cat-lake text-cat-lake-fg`). Palette names are available too (`bg-navy-800`).

`categories.color_token` and `article_categories.color_token` store a **name** from `categoryColors`:
`brick`, `lake`, `sunset`, `lavender`, `plum`, `navy`, `sage`, `slate`, `sky`. A test checks the seed only
uses names that exist. Mockup mapping: Eat & Drink `brick`, Home & Property `lake`, Health & Wellness `sunset`,
Family `lavender`, Outdoor `navy`, Shopping `plum`, Professional Services `lake`; article badges: Local News and
Things to Do `navy`, Guides `sage`, Business Spotlight `brick`, Seasonal `slate`, Community `sky`.

## Per-tenant overrides

`tenants.theme` is a JSON object of camelCase keys to `#rrggbb` values, for example
`{"brand": "#1d5a8a", "surfaceInverse": "#102a43"}`. Allowed keys: `brand`, `brandHover`, `brandContrast`,
`brandText`, `surfacePage`, `surfaceCard`, `surfaceMuted`, `surfaceInverse`, `surfaceInverseDeep`, `text`,
`textBody`, `textMuted`, `textSubtle`, `link`.

`buildThemeStyle(theme)` (`src/lib/tenant/theme.ts`) turns that into CSS variables for `<html style>`:
- **Injection-safe:** only allow-listed keys with strict `#rrggbb` values are emitted; anything else is
  rejected and never reaches the page.
- **Accessibility-safe:** an override that would break an AA pairing (white button text on a pale brand, an
  unreadable footer, body text on a dark page) is rejected and the default stays. It returns the rejections so
  an admin screen can explain why.

Tenant resolution (host to tenant) arrives in slice 2; until then the layout uses the default tokens.

## Provisional (identified by eye, please confirm)

- **Fonts:** Bricolage Grotesque (headlines, prominent numbers) and Inter (UI, body), self-hosted variable woff2 via `next/font/local`.
  I matched the look; I could not extract the real typefaces from an image.
- **Radii, container width, shadow:** `0.5rem` buttons, `0.75rem` cards, `72rem` container, a soft card shadow.
- **Spacing scale:** Tailwind's default, not extracted.

## Not done yet

- **Logo.** The mountain-and-sun wordmark is a raster in the mockups. CLAUDE.md asks for it recoloured to the
  new palette; I need the logo as SVG (or a high-resolution PNG) to do that properly.
- **Icons.** The mockups use a line-icon set. Picking a library is a new dependency, so I will ask first.
- **Dark mode.** None of the mockups show one; not built.
