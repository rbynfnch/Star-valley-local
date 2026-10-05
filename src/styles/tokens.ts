// Design tokens: the single source of truth. The colours are the locked brand palette in docs/STYLE_GUIDE.md.
// `npm run tokens` generates src/styles/tokens.generated.css from this file; a test fails if it is stale.
//
// Every foreground/background pairing the UI uses is checked against WCAG 2.1 AA in tokens.test.ts (CLAUDE.md §10).

export const palette = {
  white: '#ffffff',
  // The locked brand palette (docs/STYLE_GUIDE.md section 1). Do not change these values.
  navy: '#193153',         // Star Valley Navy: primary brand, headers, logo
  charcoal: '#1F2428',     // primary text, dark backgrounds
  'valley-blue': '#355C73', // secondary brand: links, hover, focus
  terracotta: '#A24B2A',   // warm accent, editorial emphasis, errors and destructive actions
  sage: '#5E6B4E',         // Original Sage: natural secondary (takes white text)
  'sage-light': '#7C8B63', // New Sage: fresh lighter green (graphic use; text on it is large-only)
  stone: '#68727A',        // secondary neutral (text on white only)
  'sky-gray': '#A7B0B5',   // light neutral: dividers, backgrounds, disabled
  cream: '#E8E1D6',        // primary light background (bands and sections; long reading stays on white)
  mustard: '#D2A52E',      // energy, highlights, Featured, Hotlist (background or accent, never text on Cream)
  // One derived tone, the only one: Stone darkened (same hue, lightness only) so muted text reaches 4.5:1 on Cream too.
  'stone-700': '#566068',
} as const;

export type PaletteKey = keyof typeof palette;

// Semantic tokens: what components use, and what a tenant may override (THEME_KEYS).
export const semantic = {
  brand: palette.navy,
  'brand-hover': palette['valley-blue'],
  'brand-contrast': palette.cream,              // text on brand
  'brand-text': palette.navy,                   // brand colour used as text on light surfaces
  danger: palette.terracotta,                   // destructive buttons, error and warning text
  'danger-contrast': palette.white,
  'danger-text': palette.terracotta,            // 5.87:1 on white, 4.52:1 on Cream (keep it 16px or larger on Cream)
  'surface-page': palette.white,
  'surface-card': palette.white,
  'surface-muted': palette.cream,
  'surface-inverse': palette.navy,              // footer
  'surface-inverse-deep': palette.charcoal,     // admin / owner sidebar
  'text-on-inverse': palette.cream,
  text: palette.charcoal,
  'text-body': palette.charcoal,
  'text-muted': palette['stone-700'],
  'text-subtle': palette.stone,                 // white backgrounds only (3.78:1 on Cream)
  link: palette['valley-blue'],
  focus: palette['valley-blue'],
  border: palette['sky-gray'],                  // decoration: dividers and card edges (inputs use a darker border)
  // status
  'verified-bg': palette.sage,
  'verified-text': palette.white,
  'verified-solid': palette.sage,
  'gold-bg': palette.mustard,
  'featured-bg': palette.mustard,
  'on-light-accent': palette.charcoal,          // text on Mustard fills
  // Hotlist
  'hotlist-bg': palette.mustard,
  'hotlist-text': palette.charcoal,
} as const;

export type SemanticKey = keyof typeof semantic;

// Category tiles and article badges. categories.color_token / article_categories.color_token store the NAME.
// A few calm accents, not a rainbow (STYLE_GUIDE section 2). Each carries the text colour that passes AA on it.
export const categoryColors = {
  navy:       { bg: palette.navy,          fg: palette.cream },
  valley:     { bg: palette['valley-blue'], fg: palette.white },
  sage:       { bg: palette.sage,          fg: palette.white },
  terracotta: { bg: palette.terracotta,    fg: palette.white },
  mustard:    { bg: palette.mustard,       fg: palette.charcoal },
  charcoal:   { bg: palette.charcoal,      fg: palette.cream },
} as const;

export type CategoryColorName = keyof typeof categoryColors;

/** Colour names stored in the database before the brand palette: they keep working and map to the nearest current accent. */
export const legacyCategoryColors: Record<string, CategoryColorName> = {
  brick: 'terracotta', lake: 'valley', sunset: 'mustard', lavender: 'sage', plum: 'terracotta', slate: 'valley', sky: 'valley',
};
export function categoryColor(token: string | null | undefined): { bg: string; fg: string } {
  const name = token && token in categoryColors ? (token as CategoryColorName) : token ? legacyCategoryColors[token] : undefined;
  return categoryColors[name ?? 'navy'];
}

export const typography = {
  // Bricolage Grotesque for headlines, feature titles, section headings, Hotlist and prominent numbers; Inter for everything else.
  // Both are self-hosted (src/app/fonts, loaded in src/app/layout.tsx), so there is no third-party request at runtime.
  'font-heading': 'var(--font-heading-face), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  'font-sans': 'var(--font-sans-face), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export const shape = {
  // Provisional: measured by eye from the mockups.
  'radius-chip': '0.375rem',
  'radius-button': '0.5rem',
  'radius-card': '0.75rem',
  'radius-pill': '9999px',
  'container-max': '72rem',
  'shadow-card': '0 1px 2px rgb(25 49 83 / 0.07), 0 4px 14px rgb(25 49 83 / 0.06)',
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
  { name: 'body text on Cream', fg: 'text-body', bg: 'surface-muted', min: 4.5 },
  { name: 'heading on page', fg: 'text', bg: 'surface-page', min: 4.5 },
  { name: 'heading on card', fg: 'text', bg: 'surface-card', min: 4.5 },
  { name: 'muted text on page', fg: 'text-muted', bg: 'surface-page', min: 4.5 },
  { name: 'muted text on card', fg: 'text-muted', bg: 'surface-card', min: 4.5 },
  { name: 'muted text on muted surface', fg: 'text-muted', bg: 'surface-muted', min: 4.5 },
  { name: 'subtle text on page', fg: 'text-subtle', bg: 'surface-page', min: 4.5 },
  { name: 'subtle text on card', fg: 'text-subtle', bg: 'surface-card', min: 4.5 },
  { name: 'link on page', fg: 'link', bg: 'surface-page', min: 4.5 },
  { name: 'link on card', fg: 'link', bg: 'surface-card', min: 4.5 },
  { name: 'link on Cream', fg: 'link', bg: 'surface-muted', min: 4.5 },
  { name: 'brand text on page', fg: 'brand-text', bg: 'surface-page', min: 4.5 },
  { name: 'brand text on card', fg: 'brand-text', bg: 'surface-card', min: 4.5 },
  { name: 'brand text on Cream', fg: 'brand-text', bg: 'surface-muted', min: 4.5 },
  { name: 'button text on brand', fg: 'brand-contrast', bg: 'brand', min: 4.5 },
  { name: 'button text on brand hover', fg: 'brand-contrast', bg: 'brand-hover', min: 4.5 },
  { name: 'danger text on page', fg: 'danger-text', bg: 'surface-page', min: 4.5 },
  { name: 'danger text on card', fg: 'danger-text', bg: 'surface-card', min: 4.5 },
  { name: 'danger text on Cream', fg: 'danger-text', bg: 'surface-muted', min: 4.5 },
  { name: 'text on danger button', fg: 'danger-contrast', bg: 'danger', min: 4.5 },
  { name: 'footer text on inverse', fg: 'text-on-inverse', bg: 'surface-inverse', min: 4.5 },
  { name: 'sidebar text on deep inverse', fg: 'text-on-inverse', bg: 'surface-inverse-deep', min: 4.5 },
  { name: 'white on inverse', fg: 'white', bg: 'surface-inverse', min: 4.5 },
  { name: 'text on the hero gradient end (Valley Blue)', fg: 'text-on-inverse', bg: 'valley-blue', min: 4.5 },
  { name: 'focus ring on page (UI)', fg: 'focus', bg: 'surface-page', min: 3 },
  { name: 'focus ring on card (UI)', fg: 'focus', bg: 'surface-card', min: 3 },
  { name: 'focus ring on Cream (UI)', fg: 'focus', bg: 'surface-muted', min: 3 },
  { name: 'verified pill', fg: 'verified-text', bg: 'verified-bg', min: 4.5 },
  { name: 'solid verified badge', fg: 'white', bg: 'verified-solid', min: 4.5 },
  { name: 'gold verified badge', fg: 'on-light-accent', bg: 'gold-bg', min: 4.5 },
  { name: 'featured badge', fg: 'on-light-accent', bg: 'featured-bg', min: 4.5 },
  { name: 'Hotlist button and label', fg: 'hotlist-text', bg: 'hotlist-bg', min: 4.5 },
  { name: 'Mustard on Navy (Hotlist on dark)', fg: 'mustard', bg: 'navy', min: 4.5 },
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
