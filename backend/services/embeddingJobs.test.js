import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ClothingProduct from '../models/ClothingProduct.js';
import { embedPending, textHash } from './embeddingJobs.js';
import { setEmbeddingBackend, EMBEDDING_MODEL_ID } from './embeddings.js';

let mongod;
before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await ClothingProduct.init();
});
after(async () => {
  setEmbeddingBackend(null);
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await ClothingProduct.deleteMany({});
  setEmbeddingBackend({ embed: async (texts) => texts.map((t) => [t.length, 1, 0]) });
});

const p = (n, extra = {}) => ({ name: `Suit ${n}`, brand: 'B', gender: 'women', price: 1000, productUrl: `https://t.pk/${n}`, ...extra });
const build = (d) => d.name;

test('embeds rows with no vector, an empty vector, or a vector from another model; skips current ones', async () => {
  await ClothingProduct.create([
    p(1),                                                                   // never embedded
    p(2, { embedding: [], embeddingModel: undefined }),                     // empty
    p(3, { embedding: new Array(384).fill(0.1), embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2' }), // stale model
    p(4, { embedding: [9, 9, 9], embeddingModel: EMBEDDING_MODEL_ID, embeddingTextHash: textHash('Suit 4') }), // already current
  ]);
  const r = await embedPending(ClothingProduct, build);
  assert.deepEqual(r, { embedded: 3, failed: 0, remaining: 0 });

  const docs = await ClothingProduct.find({}).sort({ name: 1 }).lean();
  assert.deepEqual(docs[3].embedding, [9, 9, 9], 'current vector must not be recomputed');
  for (const d of docs.slice(0, 3)) {
    assert.equal(d.embedding.length, 3);
    assert.equal(d.embeddingModel, EMBEDDING_MODEL_ID);
  }
});

test('is idempotent: a second run finds nothing to do', async () => {
  await ClothingProduct.create([p(1), p(2)]);
  await embedPending(ClothingProduct, build);
  assert.deepEqual(await embedPending(ClothingProduct, build), { embedded: 0, failed: 0, remaining: 0 });
});

test('handles more rows than one chunk', async () => {
  await ClothingProduct.create(Array.from({ length: 25 }, (_, i) => p(i)));
  const r = await embedPending(ClothingProduct, build, { chunk: 10 });
  assert.equal(r.embedded, 25);
  assert.equal(await ClothingProduct.countDocuments({ embedding: { $size: 0 } }), 0);
  assert.equal(await ClothingProduct.countDocuments({ embeddingModel: EMBEDDING_MODEL_ID }), 25);
});

test('one bad row does not sink its chunk or loop forever', async () => {
  await ClothingProduct.create([p(1), p(2, { name: 'BAD' }), p(3)]);
  setEmbeddingBackend({ embed: async (texts) => { if (texts.some((t) => t === 'BAD')) throw new Error('cannot embed'); return texts.map(() => [1, 0, 0]); } });
  const r = await embedPending(ClothingProduct, build, { chunk: 10 });
  assert.deepEqual(r, { embedded: 2, failed: 1, remaining: 1 });
});

test('respects limit', async () => {
  await ClothingProduct.create(Array.from({ length: 6 }, (_, i) => p(i)));
  const r = await embedPending(ClothingProduct, build, { limit: 4, chunk: 2 });
  assert.equal(r.embedded, 4);
  assert.equal(r.remaining, 2);
});

test('text that changed since the vector was made triggers a re-embed; unchanged text does not', async () => {
  await ClothingProduct.create([p(1), p(2)]);
  await embedPending(ClothingProduct, build);                         // both embedded from "Suit N"
  assert.deepEqual(await embedPending(ClothingProduct, build), { embedded: 0, failed: 0, remaining: 0 });

  // a scrape rewrites product 1's name (and so its embedding text); product 2 is untouched
  await ClothingProduct.updateOne({ productUrl: 'https://t.pk/1' }, { $set: { name: 'Suit 1 - now with embroidery' } });
  const r = await embedPending(ClothingProduct, build);
  assert.equal(r.embedded, 1);

  const [one, two] = await Promise.all([
    ClothingProduct.findOne({ productUrl: 'https://t.pk/1' }).lean(),
    ClothingProduct.findOne({ productUrl: 'https://t.pk/2' }).lean(),
  ]);
  assert.equal(one.embeddingTextHash, textHash('Suit 1 - now with embroidery'));
  assert.equal(one.embedding[0], 'Suit 1 - now with embroidery'.length, 'vector must be recomputed from the new text');
  assert.equal(two.embeddingTextHash, textHash('Suit 2'));
});

test('legacy rows that have the current model but no text hash are re-embedded once', async () => {
  await ClothingProduct.create([p(1, { embedding: [1, 1, 1], embeddingModel: EMBEDDING_MODEL_ID })]);
  assert.equal((await embedPending(ClothingProduct, build)).embedded, 1);
  assert.equal((await embedPending(ClothingProduct, build)).embedded, 0);
});
