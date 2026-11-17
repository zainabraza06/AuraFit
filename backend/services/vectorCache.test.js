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

// ── truncated (Matryoshka) vectors ───────────────────────────────────────────
import { truncateAndNormalize as _trunc, searchDims as _searchDims } from './embeddings.js';

test('truncateAndNormalize keeps the first N dims and re-normalises to unit length', () => {
  const v = _trunc([3, 4, 100, 100], 2);
  assert.equal(v.length, 2);
  assert.ok(Math.abs(v[0] - 0.6) < 1e-6 && Math.abs(v[1] - 0.8) < 1e-6);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
  assert.equal(_trunc([1, 2], 10).length, 2, 'never longer than the input');
  assert.deepEqual([..._trunc([0, 0, 0], 2)], [0, 0], 'zero vector does not produce NaN');
});

test('loadCandidates truncates + normalises and caches truncated and full sets separately', async () => {
  clearVectorCache();
  let finds = 0;
  const Model = { find: () => ({ lean: async () => { finds++; return [{ name: 'a', embedding: [3, 4, 9, 9] }]; } }) };
  const full = await loadCandidates(Model, 'c', {}, {});
  const cut = await loadCandidates(Model, 'c', {}, {}, { truncate: 2 });
  assert.equal(full[0].embedding.length, 4);
  assert.equal(cut[0].embedding.length, 2);
  assert.ok(Math.abs(cut[0].embedding[0] - 0.6) < 1e-6);
  assert.equal(finds, 2);
  await loadCandidates(Model, 'c', {}, {}, { truncate: 2 });
  assert.equal(finds, 2, 'second truncated load is a cache hit');
});

test('searchDims defaults to 256, can be set up to full size, and ignores nonsense values', () => {
  delete process.env.EMBEDDING_SEARCH_DIMS;
  assert.equal(_searchDims(), 256);
  process.env.EMBEDDING_SEARCH_DIMS = '1024';
  assert.equal(_searchDims(), 1024);
  process.env.EMBEDDING_SEARCH_DIMS = '7';
  assert.equal(_searchDims(), 256);
  process.env.EMBEDDING_SEARCH_DIMS = 'abc';
  assert.equal(_searchDims(), 256);
  delete process.env.EMBEDDING_SEARCH_DIMS;
});
