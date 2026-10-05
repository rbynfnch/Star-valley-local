import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio, HEX6 } from '../lib/color.ts';
import { buildCss } from '../../scripts/build-tokens.ts';
import { categoryColor, categoryColors, categoryPairings, palette, pairings, resolve, semantic, THEME_KEYS } from './tokens.ts';

test('generated CSS is up to date (run `npm run tokens`)', () => {
  const onDisk = readFileSync(new URL('./tokens.generated.css', import.meta.url), 'utf8');
  assert.equal(onDisk, buildCss());
});

test('every palette, semantic and category colour is a #rrggbb hex', () => {
  for (const [k, v] of Object.entries(palette)) assert.match(v, HEX6, `palette ${k}`);
  for (const [k, v] of Object.entries(semantic)) assert.match(v, HEX6, `semantic ${k}`);
  for (const [k, v] of Object.entries(categoryColors)) { assert.match(v.bg, HEX6, k); assert.match(v.fg, HEX6, k); }
});

test('every UI foreground/background pairing meets WCAG 2.1 AA', () => {
  const failures: string[] = [];
  for (const p of pairings) {
    const r = contrastRatio(resolve(p.fg), resolve(p.bg));
    if (r < p.min) failures.push(`${p.name}: ${r.toFixed(2)}:1 < ${p.min}:1`);
  }
  assert.deepEqual(failures, []);
});

test('every category tile and article badge colour meets AA with its own text colour', () => {
  const failures = categoryPairings().filter((p) => contrastRatio(p.fg, p.bg) < p.min)
    .map((p) => `${p.name}: ${contrastRatio(p.fg, p.bg).toFixed(2)}:1`);
  assert.deepEqual(failures, []);
});

test('the palette is exactly the locked brand palette in docs/STYLE_GUIDE.md', () => {
  const guide = readFileSync(new URL('../../docs/STYLE_GUIDE.md', import.meta.url), 'utf8');
  const locked: Record<string, string> = { navy: '#193153', charcoal: '#1F2428', 'valley-blue': '#355C73', terracotta: '#A24B2A', sage: '#5E6B4E', 'sage-light': '#7C8B63', stone: '#68727A', 'sky-gray': '#A7B0B5', cream: '#E8E1D6', mustard: '#D2A52E' };
  for (const [k, hex] of Object.entries(locked)) {
    assert.equal(palette[k as keyof typeof palette], hex, `palette ${k}`);
    assert.ok(guide.includes(hex), `${hex} appears in the style guide`);
  }
  const brand = new Set(Object.values(locked).map((h) => h.toLowerCase()).concat(['#ffffff', palette['stone-700'].toLowerCase()]));
  for (const [k, v] of Object.entries(palette)) assert.ok(brand.has(v.toLowerCase()), `palette ${k} (${v}) is a brand colour, white, or the one documented derived tone`);
});

test('the one derived tone is Stone made darker, not a new hue', () => {
  const hue = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    return d === 0 ? 0 : (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; };
  assert.ok(Math.abs(hue(palette['stone-700']) - hue(palette.stone)) < 6, 'same hue');
  assert.ok(contrastRatio(palette['stone-700'], palette.cream) >= 4.5, 'reaches 4.5:1 on Cream');
});

test('rules from the style guide that tokens must keep', () => {
  assert.ok(contrastRatio(palette.mustard, palette.cream) < 3, 'Mustard is never text on Cream (the guide forbids it): it is below 3:1 there');
  assert.ok(contrastRatio(palette.navy, palette['sage-light']) < 4.5, 'Navy on New Sage is large-text only, so no pairing may use it');
  for (const p of pairings) assert.ok(!(p.fg === 'navy' && p.bg === 'sage-light') && p.bg !== 'sage-light', p.name);
});

test('colour names stored before the brand palette still resolve; unknown or empty names fall back to Navy', () => {
  for (const old of ['brick', 'lake', 'sunset', 'lavender', 'plum', 'slate', 'sky']) { const c = categoryColor(old); assert.ok(Object.values(categoryColors).some((x) => x.bg === c.bg), old); }
  assert.equal(categoryColor('nope').bg, palette.navy); assert.equal(categoryColor(null).bg, palette.navy); assert.equal(categoryColor('mustard').fg, palette.charcoal);
});

test('theme keys all point at real semantic tokens', () => {
  for (const [k, v] of Object.entries(THEME_KEYS)) assert.ok(v in semantic, `${k} -> ${v}`);
});

test('seed colour tokens exist (categories.color_token / article_categories.color_token)', () => {
  const seed = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');
  const used = new Set([...seed.matchAll(/'(navy|valley|sage|terracotta|mustard|charcoal|brick|lake|sunset|lavender|plum|slate|sky)'/g)].map((m) => m[1]));
  for (const name of used) assert.ok(name in categoryColors, `seed uses a colour token that is not a current one: ${name}`);
});
