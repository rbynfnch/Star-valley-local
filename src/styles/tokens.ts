// Design tokens: the single source of truth. Extracted from the mockups in /design (see docs/DESIGN_TOKENS.md).
// `npm run tokens` generates src/styles/tokens.generated.css from this file; a test fails if it is stale.
//
// Rule: keep the mockup HUE; where a mockup colour fails WCAG 2.1 AA (CLAUDE.md §10) with the text the mockup
// puts on it, adjust only its lightness. Every adjustment is listed in docs/DESIGN_TOKENS.md.

export const palette = {
  // neutrals
  white: '#ffffff',
  'cream-50': '#fbf8f3',   // page background (mockup samples #faf8f4 .. #fcf8f3)
  'cream-100': '#f4efe7',  // muted surface / alt section
  'cream-200': '#e7e0d4',  // borders, dividers
  'ink-900': '#0f2538',    // headings (mockup #001c36 .. #163356)
  'ink-700': '#233e51',    // nav and body text (mockup #233e51)
  'ink-600': '#526876',    // muted text (mockup #526876)
  'ink-500': '#5f6e77',    // subtle/meta text (mockup #8b99a2 FAILED AA -> darkened to #5f6e77)
  // navy: footer, admin and owner sidebars, primary-dark buttons
  'navy-900': '#152e41',   // admin sidebar (mockup #152e41)
  'navy-800': '#1c3749',   // footer, pills (mockup #1c3749)
  'navy-700': '#214157',   // buttons on light (mockup #214157)
  // brick: the call-to-action colour
  'brick-600': '#bc563b',  // CTA with white text (mockup #c2593d gave 4.38:1 -> lightness lowered, 4.6:1)
  'brick-700': '#9f4932',  // hover, and brick used AS TEXT on cream (needs 4.5:1)
  // blues
  'lake-700': '#255c90',   // Home & Property tile, links (mockup #255c90)
  'lake-500': '#38729e',   // Community badge, focus ring (mockup #38729e)
  // warm accents
  'amber-500': '#dc882d',  // Health & Wellness tile (mockup #dc882d); takes DARK text, white gives 2.8:1
  'orange-400': '#f19561', // "Featured" badge (mockup #f19561); takes dark text
  'gold-300': '#ecca98',   // "Gold Verified" badge (mockup #ecca98); takes dark text
  // purples
  'lavender-400': '#b49bc0', // Family tile (mockup #b49bc0); takes dark text
  'lavender-500': '#a786bd', // Shopping tile / Events badge (mockup #a786bd); takes dark text
  'lavender-700': '#8e63aa', // purple that CAN take white text (lightness lowered from #a786bd)
  // greens and slates
  'sage-600': '#627a55',   // Guides & Resources badge (mockup #627a55)
  'slate-600': '#4c6d74',  // Seasonal badge (mockup #4c6d74)
  'green-100': '#c3ddc8',  // "Verified" pill background (mockup #c3ddc8)
  'green-700': '#577e59',  // solid Verified green with white text (mockup #69976b gave 3.4:1 -> lowered)
  'green-800': '#446246',  // text on green-100
} as const;

export type PaletteKey = keyof typeof palette;

// Semantic tokens: what components use, and what a tenant may override (THEME_KEYS).
export const semantic = {
  brand: palette['brick-600'],
  'brand-hover': palette['brick-700'],
  'brand-contrast': palette.white,              // text on brand
  'brand-text': palette['brick-700'],           // brand colour used as text on light surfaces
  'surface-page': palette['cream-50'],
  'surface-card': palette.white,
  'surface-muted': palette['cream-100'],
  'surface-inverse': palette['navy-800'],       // footer
  'surface-inverse-deep': palette['navy-900'],  // admin / owner sidebar
  'text-on-inverse': palette.white,
  text: palette['ink-900'],
  'text-body': palette['ink-700'],
  'text-muted': palette['ink-600'],
  'text-subtle': palette['ink-500'],
  link: palette['lake-700'],
  focus: palette['lake-500'],
  border: palette['cream-200'],
  // status
  'verified-bg': palette['green-100'],
  'verified-text': palette['green-800'],
  'verified-solid': palette['green-700'],
  'gold-bg': palette['gold-300'],
  'featured-bg': palette['orange-400'],
  'on-light-accent': palette['navy-900'],       // dark text used on amber / orange / gold / lavender fills
} as const;

export type SemanticKey = keyof typeof semantic;

// Category tiles and article badges. categories.color_token / article_categories.color_token store the NAME.
export const categoryColors = {
  brick:    { bg: palette['brick-600'],    fg: palette.white },
  lake:     { bg: palette['lake-700'],     fg: palette.white },
  sunset:   { bg: palette['amber-500'],    fg: palette['navy-900'] },
  lavender: { bg: palette['lavender-400'], fg: palette['navy-900'] },
  plum:     { bg: palette['lavender-500'], fg: palette['navy-900'] },
  navy:     { bg: palette['navy-800'],     fg: palette.white },
  sage:     { bg: palette['sage-600'],     fg: palette.white },
  slate:    { bg: palette['slate-600'],    fg: palette.white },
  sky:      { bg: palette['lake-500'],     fg: palette.white },
} as const;

export type CategoryColorName = keyof typeof categoryColors;

export const typography = {
  // Provisional: identified by eye from the mockups (serif headlines, humanist sans body). Confirm the faces.
  'font-heading': 'var(--font-heading-face), Georgia, "Times New Roman", serif',
  'font-sans': 'var(--font-sans-face), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export const shape = {
  // Provisional: measured by eye from the mockups.
  'radius-chip': '0.375rem',
  'radius-button': '0.5rem',
  'radius-card': '0.75rem',
  'radius-pill': '9999px',
  'container-max': '72rem',
  'shadow-card': '0 1px 2px rgb(21 46 65 / 0.06), 0 4px 12px rgb(21 46 65 / 0.05)',
} as const;

// Tenant-overridable keys (camelCase in tenants.theme jsonb) -> semantic CSS variable.
export const THEME_KEYS = {
  brand: 'brand',
  brandHover: 'brand-hover',
  brandContrast: 'brand-contrast',
  brandText: 'brand-text',
  surfacePage: 'surface-page',
  surfaceCard: 'surface-card',
  surfaceMuted: 'surface-muted',
  surfaceInverse: 'surface-inverse',
  surfaceInverseDeep: 'surface-inverse-deep',
  text: 'text',
  textBody: 'text-body',
  textMuted: 'text-muted',
  textSubtle: 'text-subtle',
  link: 'link',
} as const satisfies Record<string, SemanticKey>;

export type ThemeKey = keyof typeof THEME_KEYS;

// Every foreground/background combination the UI uses, with the WCAG 2.1 AA minimum.
// 4.5 = normal text, 3 = large text (>= 24px, or >= 18.66px bold) and UI components.
// A test checks all of these against the defaults; buildThemeStyle() checks the ones with `themeKeys` against
// a tenant's overrides and rejects any override that would break them.
export type Pairing = { name: string; fg: SemanticKey | PaletteKey; bg: SemanticKey | PaletteKey; min: number };
export const pairings: Pairing[] = [
  { name: 'body text on page', fg: 'text-body', bg: 'surface-page', min: 4.5 },
  { name: 'heading on page', fg: 'text', bg: 'surface-page', min: 4.5 },
  { name: 'heading on card', fg: 'text', bg: 'surface-card', min: 4.5 },
  { name: 'muted text on page', fg: 'text-muted', bg: 'surface-page', min: 4.5 },
  { name: 'muted text on card', fg: 'text-muted', bg: 'surface-card', min: 4.5 },
  { name: 'muted text on muted surface', fg: 'text-muted', bg: 'surface-muted', min: 4.5 },
  { name: 'subtle text on page', fg: 'text-subtle', bg: 'surface-page', min: 4.5 },
  { name: 'subtle text on card', fg: 'text-subtle', bg: 'surface-card', min: 4.5 },
  { name: 'subtle text on muted surface', fg: 'text-subtle', bg: 'surface-muted', min: 4.5 },
  { name: 'link on page', fg: 'link', bg: 'surface-page', min: 4.5 },
  { name: 'link on card', fg: 'link', bg: 'surface-card', min: 4.5 },
  { name: 'brand text on page', fg: 'brand-text', bg: 'surface-page', min: 4.5 },
  { name: 'brand text on card', fg: 'brand-text', bg: 'surface-card', min: 4.5 },
  { name: 'button text on brand', fg: 'brand-contrast', bg: 'brand', min: 4.5 },
  { name: 'button text on brand hover', fg: 'brand-contrast', bg: 'brand-hover', min: 4.5 },
  { name: 'footer text on inverse', fg: 'text-on-inverse', bg: 'surface-inverse', min: 4.5 },
  { name: 'sidebar text on deep inverse', fg: 'text-on-inverse', bg: 'surface-inverse-deep', min: 4.5 },
  { name: 'focus ring on page (UI)', fg: 'focus', bg: 'surface-page', min: 3 },
  { name: 'focus ring on card (UI)', fg: 'focus', bg: 'surface-card', min: 3 },
  { name: 'verified pill', fg: 'verified-text', bg: 'verified-bg', min: 4.5 },
  { name: 'solid verified badge', fg: 'white', bg: 'verified-solid', min: 4.5 },
  { name: 'gold verified badge', fg: 'on-light-accent', bg: 'gold-bg', min: 4.5 },
  { name: 'featured badge', fg: 'on-light-accent', bg: 'featured-bg', min: 4.5 },
  { name: 'white on lavender-700', fg: 'white', bg: 'lavender-700', min: 4.5 },
];

// Category tiles are checked separately (each name carries its own foreground).
export function categoryPairings(): { name: string; fg: string; bg: string; min: number }[] {
  return (Object.keys(categoryColors) as CategoryColorName[]).map((k) => ({
    name: `category tile "${k}"`, fg: categoryColors[k].fg, bg: categoryColors[k].bg, min: 4.5,
  }));
}

export function resolve(key: SemanticKey | PaletteKey): string {
  return (key in semantic ? semantic[key as SemanticKey] : palette[key as PaletteKey]) as string;
}
