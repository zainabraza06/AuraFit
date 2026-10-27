import test from 'node:test';
import assert from 'node:assert/strict';
import { retry } from '../src/common/retry.js';

test('retries until success', async () => {
  let n = 0;
  assert.equal(await retry(async () => { if (++n < 3) throw new Error('refused'); return 'ok'; }, { delayMs: 1 }), 'ok');
  assert.equal(n, 3);
});

test('gives up after max attempts and surfaces the last error', async () => {
  let n = 0;
  await assert.rejects(retry(async () => { n++; throw new Error(`fail ${n}`); }, { attempts: 3, delayMs: 1 }), /fail 3/);
});
