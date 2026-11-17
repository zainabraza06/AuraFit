import test from 'node:test';
import assert from 'node:assert/strict';
import { createTryonQueue, createMemoryStore, tryonCacheKey, QueueBusyError } from '../services/tryonQueue.js';

const img = (n) => ({ buffer: Buffer.from(String(n)), mimetype: 'image/png' });
const tick = () => new Promise((r) => setImmediate(r));
const until = async (fn, ms = 1000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout waiting'); await tick(); } };

/** A run function whose completion the test controls. */
function controlled() {
  const calls = [];
  const run = (input) => new Promise((resolve, reject) => calls.push({ input, resolve: (v = { resultUrl: 'https://r/x.png', provider: 'fake' }) => resolve(v), reject }));
  return { run, calls };
}

test('cache key depends on both images and the description, not on object identity', () => {
  const a = tryonCacheKey({ person: img(1), clothing: img(2), description: 'kurta' });
  assert.equal(a, tryonCacheKey({ person: img(1), clothing: img(2), description: 'kurta' }));
  assert.notEqual(a, tryonCacheKey({ person: img(1), clothing: img(3), description: 'kurta' }));
  assert.notEqual(a, tryonCacheKey({ person: img(1), clothing: img(2), description: 'other' }));
  assert.notEqual(tryonCacheKey({ person: { url: 'https://a/1.jpg' }, clothing: img(2) }), tryonCacheKey({ person: { url: 'https://a/2.jpg' }, clothing: img(2) }));
});

test('submit returns immediately as queued/running; completion is visible by polling', async () => {
  const { run, calls } = controlled();
  const q = createTryonQueue({ run });
  const job = await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  assert.ok(['queued', 'running'].includes(job.status));
  await until(() => calls.length === 1);
  assert.equal((await q.get(job.id, 'u:1')).status, 'running');
  calls[0].resolve();
  await until(async () => true);
  await tick(); await tick();
  const done = await q.get(job.id, 'u:1');
  assert.equal(done.status, 'done');
  assert.equal(done.resultUrl, 'https://r/x.png');
});

test('other callers cannot see a job (it looks like not-found)', async () => {
  const { run } = controlled();
  const q = createTryonQueue({ run });
  const job = await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  assert.equal(await q.get(job.id, 'u:2'), null);
  assert.equal(await q.get('nope', 'u:1'), null);
});

test('same inputs again are served from the cache without running anything', async () => {
  let runs = 0;
  const q = createTryonQueue({ run: async () => { runs++; return { resultUrl: 'https://r/1.png', provider: 'fake' }; } });
  const first = await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  await until(async () => runs === 1 || true); await tick(); await tick();
  assert.equal((await q.get(first.id, 'u:1')).status, 'done');
  const again = await q.submit({ person: img(1), clothing: img(2) }, 'u:2');
  assert.equal(again.status, 'done');
  assert.equal(again.cached, true);
  assert.equal(again.resultUrl, 'https://r/1.png');
  assert.equal(runs, 1);
});

test('an identical request already in flight is joined, not run twice', async () => {
  const { run, calls } = controlled();
  const q = createTryonQueue({ run });
  const a = await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  const b = await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  assert.equal(a.id, b.id);
  await until(() => calls.length >= 1);
  assert.equal(calls.length, 1);
});

test('concurrency is bounded and the rest wait their turn in order', async () => {
  const { run, calls } = controlled();
  const q = createTryonQueue({ run, maxConcurrent: 2, maxPerOwner: 10 });
  const jobs = [];
  for (let i = 0; i < 4; i++) jobs.push(await q.submit({ person: img(i), clothing: img(100) }, `u:${i}`));
  await until(() => calls.length === 2);
  assert.deepEqual(q.stats(), { running: 2, queued: 2 });
  assert.equal(jobs[3].queuedAhead >= 0, true);
  calls[0].resolve();
  await until(() => calls.length === 3);
  assert.deepEqual(q.stats(), { running: 2, queued: 1 });
  calls[1].resolve(); calls[2].resolve();
  await until(() => calls.length === 4);
  calls[3].resolve();
});

test('overload is rejected fast: queue full and per-owner limit', async () => {
  const { run } = controlled();
  const q = createTryonQueue({ run, maxConcurrent: 1, maxQueued: 1, maxPerOwner: 2 });
  await q.submit({ person: img(1), clothing: img(9) }, 'u:a');           // running
  await q.submit({ person: img(2), clothing: img(9) }, 'u:b');           // queued (queue now full)
  await assert.rejects(() => q.submit({ person: img(3), clothing: img(9) }, 'u:c'), (e) => e instanceof QueueBusyError && e.code === 'busy');

  const q2 = createTryonQueue({ run, maxConcurrent: 1, maxQueued: 10, maxPerOwner: 2 });
  await q2.submit({ person: img(1), clothing: img(9) }, 'u:x');
  await q2.submit({ person: img(2), clothing: img(9) }, 'u:x');
  await assert.rejects(() => q2.submit({ person: img(3), clothing: img(9) }, 'u:x'), (e) => e.code === 'owner_limit');
  await q2.submit({ person: img(4), clothing: img(9) }, 'u:y'); // someone else is unaffected
});

test('a failing run marks the job failed with the reason; a hung run times out', async () => {
  const q = createTryonQueue({ run: async () => { throw Object.assign(new Error('internal'), { userMessage: 'Please use a full-body photo', reason: 'bad_person_photo' }); } });
  const j = await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  await until(async () => true); await tick(); await tick();
  const failed = await q.get(j.id, 'u:1');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'Please use a full-body photo');
  assert.equal(failed.reason, 'bad_person_photo');

  const hung = createTryonQueue({ run: () => new Promise(() => {}), jobTimeoutMs: 20 });
  const h = await hung.submit({ person: img(5), clothing: img(6) }, 'u:1');
  await new Promise((r) => setTimeout(r, 60));
  const timedOut = await hung.get(h.id, 'u:1');
  assert.equal(timedOut.status, 'failed');
  assert.equal(timedOut.reason, 'timeout');
});

test('subscribers receive status changes after they subscribe and can unsubscribe (SSE sends the current state first)', async () => {
  const { run, calls } = controlled();
  const q = createTryonQueue({ run });
  const job = await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  const seen = [];
  const off = q.subscribe(job.id, (v) => seen.push(v.status));
  await until(() => calls.length === 1);
  calls[0].resolve();
  await until(() => seen.includes('done'));
  assert.equal(seen.at(-1), 'done');
  off();
  const before = seen.length;
  q.subscribe(job.id, () => {})(); // subscribe + unsubscribe is harmless
  assert.equal(seen.length, before);
});

test('stale jobs from a previous process are failed on startup', async () => {
  const store = createMemoryStore();
  await store.save({ id: 'old1', owner: 'u:1', cacheKey: 'k', status: 'running', createdAt: 1 });
  await store.save({ id: 'old2', owner: 'u:1', cacheKey: 'k2', status: 'done', createdAt: 1, finishedAt: 2 });
  const q = createTryonQueue({ run: async () => ({}), store });
  assert.equal(await q.failStale(), 1);
  assert.equal((await store.get('old1')).status, 'failed');
  assert.equal((await store.get('old2')).status, 'done');
});

test('image buffers are released once the job finishes', async () => {
  const { run, calls } = controlled();
  const q = createTryonQueue({ run });
  await q.submit({ person: img(1), clothing: img(2) }, 'u:1');
  await until(() => calls.length === 1);
  const held = calls[0].input;
  assert.ok(held.person.buffer);
  calls[0].resolve();
  await tick(); await tick();
  assert.equal(held.person, null);
});
