import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, parseHex } from './color.ts';

test('black on white is 21:1 and the ratio is symmetric', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#000000'), contrastRatio('#000000', '#ffffff'));
});
test('identical colours are 1:1', () => assert.equal(contrastRatio('#bc563b', '#bc563b'), 1));
test('matches known WCAG values', () => {
  assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48');   // the classic just-fails-AA grey
  assert.equal(contrastRatio('#767676', '#ffffff').toFixed(2), '4.54');   // the classic just-passes grey
});
test('parseHex rejects anything but #rrggbb', () => {
  assert.deepEqual(parseHex('#0a0B0c'), [10, 11, 12]);
  for (const bad of ['red', '#fff', '#12345', '#1234567', '123456', 'rgb(0,0,0)', '']) assert.throws(() => parseHex(bad));
});
