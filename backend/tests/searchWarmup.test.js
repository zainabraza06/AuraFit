import test from 'node:test';
import assert from 'node:assert/strict';
import { warmUpSearch } from '../services/searchWarmup.js';

test('warm-up is skipped (not an error) when embeddings are unavailable under test', async () => {
  process.env.NODE_ENV = 'test';
  const r = await warmUpSearch({ log: () => {} });
  assert.equal(r.ok, false);
  assert.match(r.skipped, /not configured/);
});
