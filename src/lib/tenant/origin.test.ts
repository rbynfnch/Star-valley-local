import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originFromRequest } from './origin.ts';

test('production defaults to https, dev to http, the forwarded proto wins when valid', () => {
  assert.equal(originFromRequest('a.example.com', null, true), 'https://a.example.com');
  assert.equal(originFromRequest('star-valley.localhost:3000', null, false), 'http://star-valley.localhost:3000');
  assert.equal(originFromRequest('a.example.com', 'http', true), 'http://a.example.com');
  assert.equal(originFromRequest('a.example.com', 'https, http', false), 'https://a.example.com');
});
test('a bogus proto cannot inject a scheme; no host means no origin', () => {
  assert.equal(originFromRequest('a.example.com', 'javascript', true), 'https://a.example.com');
  assert.equal(originFromRequest(null, 'https', true), null);
});
