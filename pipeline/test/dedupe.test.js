import test from 'node:test';
import assert from 'node:assert/strict';
import { createDedupe } from '../src/common/dedupe.js';
import { fakeRedis } from './helpers.js';

test('unseen id is not a duplicate until marked', async () => {
  const d = createDedupe(fakeRedis(), 60);
  assert.equal(await d.has('abc'), false);
  await d.mark('abc');
  assert.equal(await d.has('abc'), true);
  assert.equal(await d.has('other'), false);
});
