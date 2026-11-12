import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadCandidates, clearVectorCache, vectorCacheSize } from './vectorCache.js';

beforeEach(() => clearVectorCache());

/** Minimal stand-in for a Mongoose model: counts find() calls. */
function fakeModel(rows, { delayMs = 0, fail = false } = {}) {
  const m = {
    calls: 0,
    find() {
      m.calls++;
      const p = new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error('db down')) : resolve(rows.map((r) => ({ ...r })))), delayMs));
      return { lean: () => p };
    },
  };
  return m;
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({ _id: i, name: `P${i}`, embedding: [i, 1, 0] }));

test('returns every matching row, with no 400-row cap, and stores vectors compactly', async () => {
  const m = fakeModel(rows(1500));
  const docs = await loadCandidates(m, 'clothing', { a: 1 }, { embedding: 1 });
  assert.equal(docs.length, 1500);
  assert.ok(docs[0].embedding instanceof Float32Array);
  assert.deepEqual([...docs[1499].embedding], [1499, 1, 0]);
});

test('a second identical request is served from memory', async () => {
  const m = fakeModel(rows(10));
  await loadCandidates(m, 'clothing', { a: 1 }, {});
  await loadCandidates(m, 'clothing', { a: 1 }, {});
  assert.equal(m.calls, 1);
});

test('different filters or catalogs are cached separately', async () => {
  const m = fakeModel(rows(3));
  await loadCandidates(m, 'clothing', { gender: 'women' }, {});
  await loadCandidates(m, 'clothing', { gender: 'men' }, {});
  await loadCandidates(m, 'shoes', { gender: 'women' }, {});
  assert.equal(m.calls, 3);
});

test('concurrent first requests share a single database read', async () => {
  const m = fakeModel(rows(5), { delayMs: 20 });
  await Promise.all(Array.from({ length: 6 }, () => loadCandidates(m, 'clothing', {}, {})));
  assert.equal(m.calls, 1);
});

test('entries expire after the TTL', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const m = fakeModel(rows(2));
  await loadCandidates(m, 'clothing', {}, {});
  t.mock.timers.setTime(1_000_000 + 6 * 60 * 1000);
  await loadCandidates(m, 'clothing', {}, {});
  assert.equal(m.calls, 2);
});

test('a failed read is not cached, so the next request retries', async () => {
  const bad = fakeModel(rows(2), { fail: true });
  await assert.rejects(loadCandidates(bad, 'clothing', {}, {}), /db down/);
  await new Promise((r) => setImmediate(r));
  assert.equal(vectorCacheSize(), 0);
  const good = fakeModel(rows(2));
  assert.equal((await loadCandidates(good, 'clothing', {}, {})).length, 2);
});
