import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio, HEX6 } from '../lib/color.ts';
import { buildCss } from '../../scripts/build-tokens.ts';
import { categoryColors, categoryPairings, palette, pairings, resolve, semantic, THEME_KEYS } from './tokens.ts';

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

test('the mockup colours that fail AA are not used with the failing text colour', () => {
  // Documented in docs/DESIGN_TOKENS.md: these raw mockup values must never be paired with white text.
  for (const raw of ['#c2593d', '#dc882d', '#69976b', '#a786bd', '#b49bc0']) {
    assert.ok(contrastRatio('#ffffff', raw) < 4.5, `${raw} was expected to fail with white (documents why we adjusted it)`);
  }
});

test('theme keys all point at real semantic tokens', () => {
  for (const [k, v] of Object.entries(THEME_KEYS)) assert.ok(v in semantic, `${k} -> ${v}`);
});

test('seed colour tokens exist (categories.color_token / article_categories.color_token)', () => {
  const seed = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');
  const used = new Set([...seed.matchAll(/'(brick|lake|sunset|lavender|plum|navy|sage|slate|sky)'/g)].map((m) => m[1]));
  for (const name of used) assert.ok(name in categoryColors, `seed uses unknown colour token ${name}`);
});
