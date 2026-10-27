import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLimit } from '../src/common/pool.js';

test('never exceeds the concurrency limit and processes every item', async () => {
  let active = 0, peak = 0, done = 0;
  await mapLimit(Array.from({ length: 50 }), 8, async () => {
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 2));
    active--; done++;
  });
  assert.equal(done, 50);
  assert.ok(peak <= 8 && peak > 1, `peak=${peak}`);
});

test('a failure rejects and stops starting new work', async () => {
  let started = 0;
  await assert.rejects(mapLimit(Array.from({ length: 100 }), 2, async (_, i) => {
    started++;
    if (i === 3) throw new Error('boom');
    await new Promise((r) => setTimeout(r, 1));
  }), /boom/);
  assert.ok(started < 100);
});

test('empty input resolves', async () => {
  await mapLimit([], 4, async () => { throw new Error('never'); });
});
