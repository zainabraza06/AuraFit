import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { embedQuery, embedDocuments, formatQuery, cosine, setEmbeddingBackend, EMBEDDING_MODEL_ID } from './embeddings.js';

afterEach(() => setEmbeddingBackend(null));

/** Deterministic fake: vector = [length, 1]; records every batch it receives. */
function fakeBackend() {
  const batches = [];
  let active = 0;
  let peak = 0;
  return {
    batches,
    get peak() { return peak; },
    async embed(texts) {
      peak = Math.max(peak, ++active);
      batches.push([...texts]);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return texts.map((t) => [t.length, 1]);
    },
  };
}

test('queries are sent with the task instruction; documents are sent unchanged', async () => {
  const fb = fakeBackend();
  setEmbeddingBackend(fb);
  await embedQuery('black lawn suit');
  await embedDocuments(['Printed lawn suit']);
  assert.equal(fb.batches[0][0], formatQuery('black lawn suit'));
  assert.match(fb.batches[0][0], /^Instruct: .*\nQuery: black lawn suit$/s);
  assert.deepEqual(fb.batches[1], ['Printed lawn suit']);
});

test('documents are batched and returned in the original order', async () => {
  const fb = fakeBackend();
  setEmbeddingBackend(fb);
  const texts = Array.from({ length: 19 }, (_, i) => 'x'.repeat(i + 1));
  const vecs = await embedDocuments(texts, { batchSize: 8 });
  assert.deepEqual(fb.batches.map((b) => b.length), [8, 8, 3]);
  assert.deepEqual(vecs.map((v) => v[0]), texts.map((t) => t.length));
});

test('concurrent callers never run the backend at the same time', async () => {
  const fb = fakeBackend();
  setEmbeddingBackend(fb);
  await Promise.all([embedQuery('a'), embedQuery('b'), embedDocuments(['c', 'd']), embedQuery('e')]);
  assert.equal(fb.peak, 1);
});

test('a failing call does not poison later calls', async () => {
  let n = 0;
  setEmbeddingBackend({ embed: async (t) => { if (++n === 1) throw new Error('boom'); return t.map(() => [1, 0]); } });
  await assert.rejects(embedQuery('first'), /boom/);
  assert.deepEqual(await embedQuery('second'), [1, 0]);
});

test('rejects empty queries and a backend that returns the wrong number of vectors', async () => {
  setEmbeddingBackend(fakeBackend());
  await assert.rejects(embedQuery('   '), /empty/);
  setEmbeddingBackend({ embed: async () => [[1]] });
  await assert.rejects(embedDocuments(['a', 'b'], { batchSize: 2 }), /returned 1 vectors for 2/);
});

test('cosine: identical = 1, orthogonal = 0, mismatched dimensions = 0 (never NaN)', () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 0, 0], [1, 0]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
});

test('model id is exported so stored vectors can be tagged with it', () => {
  assert.match(EMBEDDING_MODEL_ID, /Qwen3-Embedding/);
});
