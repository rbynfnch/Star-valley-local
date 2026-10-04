// Turns tenants.theme (jsonb written by staff) into CSS variables for <html style>.
//
// Two safety properties, both tested:
//  1. INJECTION: only allow-listed keys with strict #rrggbb values reach the style attribute, so a malicious or
//     mistaken theme value (e.g. "red; background:url(...)") can never become CSS.
//  2. ACCESSIBILITY: an override that would break a WCAG AA pairing the UI relies on (brand button text, body
//     text on the page, footer text...) is rejected and the default stays, so a tenant cannot ship an
//     unreadable site. CLAUDE.md §10: WCAG 2.1 AA.
import { contrastRatio, HEX6 } from '../color.ts';
import { pairings, semantic, THEME_KEYS, type SemanticKey, type ThemeKey } from '../../styles/tokens.ts';

export type RejectedOverride = { key: string; reason: string };
export type ThemeResult = { style: Record<string, string>; rejected: RejectedOverride[] };

const VAR_BY_THEME_KEY = THEME_KEYS as Record<string, SemanticKey>;
const THEME_KEY_BY_VAR = Object.fromEntries(Object.entries(THEME_KEYS).map(([k, v]) => [v, k])) as Record<string, ThemeKey>;

export function buildThemeStyle(theme: unknown): ThemeResult {
  const rejected: RejectedOverride[] = [];
  const accepted = new Map<SemanticKey, string>();

  if (theme === null || typeof theme !== 'object' || Array.isArray(theme)) {
    if (theme !== null && theme !== undefined) rejected.push({ key: '(theme)', reason: 'must be an object' });
    return { style: {}, rejected };
  }

  for (const [key, value] of Object.entries(theme as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(VAR_BY_THEME_KEY, key)) {
      rejected.push({ key, reason: 'unknown theme key' });
      continue;
    }
    if (typeof value !== 'string' || !HEX6.test(value)) {
      rejected.push({ key, reason: 'must be a #rrggbb colour' });
      continue;
    }
    accepted.set(VAR_BY_THEME_KEY[key], value.toLowerCase());
  }

  // Drop overrides that break an AA pairing, until stable (removing one can only restore defaults).
  const colourOf = (k: string, current: Map<SemanticKey, string>): string =>
    current.get(k as SemanticKey) ?? ((semantic as Record<string, string>)[k] ?? '');
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const p of pairings) {
      const involved = [p.fg, p.bg].filter((k) => accepted.has(k as SemanticKey));
      if (involved.length === 0) continue;
      const fg = colourOf(p.fg, accepted);
      const bg = colourOf(p.bg, accepted);
      if (!HEX6.test(fg) || !HEX6.test(bg)) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio < p.min) {
        for (const k of involved) {
          accepted.delete(k as SemanticKey);
          rejected.push({
            key: THEME_KEY_BY_VAR[k] ?? k,
            reason: `breaks "${p.name}": ${ratio.toFixed(2)}:1, needs ${p.min}:1`,
          });
        }
        changed = true;
      }
    }
    if (!changed) break;
  }

  const style: Record<string, string> = {};
  for (const [k, v] of accepted) style[`--${k}`] = v;
  return { style, rejected };
}
