import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThemeStyle } from './theme.ts';

test('no theme, null and undefined produce no overrides and no complaints', () => {
  assert.deepEqual(buildThemeStyle(undefined), { style: {}, rejected: [] });
  assert.deepEqual(buildThemeStyle(null), { style: {}, rejected: [] });
  assert.deepEqual(buildThemeStyle({}), { style: {}, rejected: [] });
});

test('a valid override becomes a CSS variable, lower-cased', () => {
  const { style, rejected } = buildThemeStyle({ brand: '#1D5A8A', surfaceInverse: '#102A43' });
  assert.deepEqual(style, { '--brand': '#1d5a8a', '--surface-inverse': '#102a43' });
  assert.deepEqual(rejected, []);
});

test('INJECTION: anything that is not a plain #rrggbb is rejected, never emitted', () => {
  const evil = ['red', '#fff', 'url(https://evil.example/x)', '#bc563b; background:url(//evil)', 'var(--x)',
    '#bc563b}</style><script>', 'expression(alert(1))', '#bc563b ', ' #bc563b', '#BC563G', 123, null, {}, ['#bc563b']];
  for (const value of evil) {
    const { style, rejected } = buildThemeStyle({ brand: value });
    assert.deepEqual(style, {}, `emitted for ${JSON.stringify(value)}`);
    assert.equal(rejected.length, 1);
  }
});

test('INJECTION: unknown keys and prototype tricks are ignored', () => {
  const { style, rejected } = buildThemeStyle(JSON.parse('{"__proto__":"#000000","constructor":"#000000","position":"#000000","--brand":"#000000","brand; x":"#000000"}'));
  assert.deepEqual(style, {});
  assert.equal(rejected.length, 5);
  assert.equal(({} as Record<string, unknown>).brand, undefined, 'Object.prototype must not be polluted');
});

test('non-object themes are rejected safely', () => {
  for (const t of ['#bc563b', 42, true, ['brand'], () => 1]) {
    const { style, rejected } = buildThemeStyle(t);
    assert.deepEqual(style, {});
    assert.equal(rejected.length, 1);
  }
});

test('ACCESSIBILITY: white button text on a white brand is rejected and the default stays', () => {
  const { style, rejected } = buildThemeStyle({ brand: '#ffffff' });
  assert.deepEqual(style, {});
  assert.match(rejected.map((r) => r.reason).join(' '), /button text on brand/);
});

test('ACCESSIBILITY: a pale brand that fails with white text is rejected, a dark one passes', () => {
  assert.deepEqual(buildThemeStyle({ brand: '#f19561' }).style, {});                      // 2.3:1 with white
  assert.deepEqual(buildThemeStyle({ brand: '#1d5a8a' }).style, { '--brand': '#1d5a8a' }); // passes
});

test('ACCESSIBILITY: unreadable text and a dark page are rejected', () => {
  assert.deepEqual(buildThemeStyle({ surfacePage: '#000000' }).style, {});                // body text would vanish
  assert.deepEqual(buildThemeStyle({ text: '#fbf8f3' }).style, {});                       // cream text on cream page
  assert.deepEqual(buildThemeStyle({ textMuted: '#cccccc' }).style, {});
});

test('ACCESSIBILITY: a footer colour that makes white text unreadable is rejected', () => {
  assert.deepEqual(buildThemeStyle({ surfaceInverse: '#f5f5f5' }).style, {});
});

test('overrides that pass together are all kept; a failing one does not take the good ones with it', () => {
  const { style, rejected } = buildThemeStyle({ brand: '#1d5a8a', brandHover: '#12406a', surfaceInverse: '#f5f5f5' });
  assert.deepEqual(style, { '--brand': '#1d5a8a', '--brand-hover': '#12406a' });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].key, 'surfaceInverse');
});

test('a colour that is fine alone but fails against another override is dropped, defaults restored', () => {
  // brandContrast white on default brand passes; making brand white too breaks it: both overrides involved are dropped
  const { style } = buildThemeStyle({ brand: '#eeeeee', brandContrast: '#ffffff' });
  assert.deepEqual(style, {});
});

test('output only ever contains --custom-property names', () => {
  const { style } = buildThemeStyle({ brand: '#1d5a8a', link: '#1d5a8a', text: '#101010' });
  for (const k of Object.keys(style)) assert.match(k, /^--[a-z-]+$/);
});
