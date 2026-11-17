import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import { IMAGE_EMBEDDING_MODEL_ID, setImageEmbeddingBackend, embedImage, embedTextForImages, isImageEmbeddingConfigured } from '../services/imageEmbeddings.js';
import { embedPendingImages, isImageVectorStale, needsImageEmbeddingFilter } from '../services/imageEmbeddingJobs.js';
import { searchByImageVector, fuseRankings } from '../services/visualSearch.js';
import { clearVectorCache } from '../services/vectorCache.js';

let mongod;
const base = { brand: 'B', gender: 'women', price: 3000, inStock: true };

before(async () => {
  process.env.NODE_ENV = 'test';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

// Fake CLIP: the "image" is a tiny buffer whose first byte picks an axis; text "red"/"blue" pick axes too.
const fakeClip = {
  embedImage: async (buf) => { if (buf.length === 0) throw new Error('cannot decode'); const v = [0, 0, 0]; v[buf[0] % 3] = 1; return v; },
  embedText: async (t) => (/red/.test(t) ? [1, 0, 0] : /blue/.test(t) ? [0, 1, 0] : [0, 0, 1]),
};
after(async () => {
  setImageEmbeddingBackend(null);
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
beforeEach(async () => {
  setImageEmbeddingBackend(fakeClip); // each test starts from the same fake
  await ClothingProduct.deleteMany({});
  await ShoeProduct.deleteMany({});
  clearVectorCache();
});

test('tests never load CLIP by accident; a fake backend enables it', () => {
  assert.equal(isImageEmbeddingConfigured(), true);
  setImageEmbeddingBackend(null);
  assert.equal(isImageEmbeddingConfigured(), false);
  setImageEmbeddingBackend({ embedImage: async () => [1, 0, 0], embedText: async () => [1, 0, 0] });
  assert.equal(isImageEmbeddingConfigured(), true);
});

test('stale detection: missing, other model, or changed image url', () => {
  const ok = { imageEmbedding: [1], imageEmbeddingModel: IMAGE_EMBEDDING_MODEL_ID, imageUrl: 'https://a/1.jpg', imageEmbeddingUrl: 'https://a/1.jpg' };
  assert.equal(isImageVectorStale(ok), false);
  assert.equal(isImageVectorStale({ ...ok, imageEmbedding: [] }), true);
  assert.equal(isImageVectorStale({ ...ok, imageEmbeddingModel: 'other' }), true);
  assert.equal(isImageVectorStale({ ...ok, imageUrl: 'https://a/2.jpg' }), true);
  assert.equal(needsImageEmbeddingFilter().$or.length, 4);
});

test('embedPendingImages embeds new products, skips unfetchable/undecodable ones, and is idempotent', async () => {
  await ClothingProduct.create([
    { ...base, name: 'Red One', productUrl: 'https://t/1', imageUrl: 'https://img/red.jpg' },
    { ...base, name: 'Blue One', productUrl: 'https://t/2', imageUrl: 'https://img/blue.jpg' },
    { ...base, name: 'Broken Download', productUrl: 'https://t/3', imageUrl: 'https://img/404.jpg' },
    { ...base, name: 'Broken Decode', productUrl: 'https://t/4', imageUrl: 'https://img/empty.jpg' },
    { ...base, name: 'Sold Out', productUrl: 'https://t/5', imageUrl: 'https://img/red2.jpg', inStock: false },
  ]);
  const fetchImage = async (url) => {
    if (url.includes('404')) throw new Error('HTTP 404');
    if (url.includes('empty')) return Buffer.alloc(0);
    return Buffer.from([url.includes('red') ? 0 : 1, 1, 1, 1]);
  };
  const first = await embedPendingImages(ClothingProduct, { fetchImage, concurrency: 3 });
  assert.equal(first.scanned, 4, 'sold-out products are not embedded');
  assert.equal(first.embedded, 2);
  assert.equal(first.skipped, 2);
  assert.equal(first.failures.length, 2);

  const red = await ClothingProduct.findOne({ name: 'Red One' }).select('+imageEmbedding').lean();
  assert.deepEqual(red.imageEmbedding, [1, 0, 0]);
  assert.equal(red.imageEmbeddingModel, IMAGE_EMBEDDING_MODEL_ID);
  assert.equal(red.imageEmbeddingUrl, 'https://img/red.jpg');

  // second run only retries the two failures; nothing already done is recomputed
  let fetches = 0;
  const again = await embedPendingImages(ClothingProduct, { fetchImage: async (u) => { fetches++; return fetchImage(u); } });
  assert.equal(again.scanned, 2);
  assert.equal(fetches, 2);

  // a changed image makes only that product stale
  await ClothingProduct.updateOne({ name: 'Red One' }, { $set: { imageUrl: 'https://img/red-new.jpg' } });
  const third = await embedPendingImages(ClothingProduct, { fetchImage });
  assert.ok(third.scanned >= 1);
  assert.equal((await ClothingProduct.findOne({ name: 'Red One' }).lean()).imageEmbeddingUrl, 'https://img/red-new.jpg');
});

test('limit caps how many products one run processes', async () => {
  await ClothingProduct.create(Array.from({ length: 5 }, (_, i) => ({ ...base, name: `P${i}`, productUrl: `https://t/p${i}`, imageUrl: `https://img/${i}.jpg` })));
  const r = await embedPendingImages(ClothingProduct, { fetchImage: async () => Buffer.from([2, 1]), limit: 2 });
  assert.equal(r.embedded, 2);
});

test('searchByImageVector ranks by visual similarity, respects catalog/gender/stock and ignores other models', async () => {
  const mk = (name, vec, extra = {}) => ({ ...base, name, productUrl: `https://t/${name}`, imageEmbedding: vec, imageEmbeddingModel: IMAGE_EMBEDDING_MODEL_ID, ...extra });
  await ClothingProduct.create([
    mk('Red Suit', [1, 0, 0]),
    mk('Pink Suit', [0.8, 0.6, 0]),
    mk('Blue Suit', [0, 1, 0]),
    mk('Red But Sold Out', [1, 0, 0], { inStock: false }),
    mk('Red Mens', [1, 0, 0], { gender: 'men' }),
    mk('Red Other Model', [1, 0, 0], { imageEmbeddingModel: 'some/other:q8' }),
  ]);
  await ShoeProduct.create(mk('Red Shoe', [1, 0, 0]));

  const all = await searchByImageVector([1, 0, 0], { limit: 10 });
  const names = all.map((r) => r.name);
  assert.deepEqual(names.slice(0, 3).sort(), ['Red Mens', 'Red Shoe', 'Red Suit'].sort());
  assert.ok(!names.includes('Red But Sold Out') && !names.includes('Red Other Model'));
  assert.equal(all.find((r) => r.name === 'Red Suit').catalog, 'clothing');
  assert.ok(all.every((r) => !('imageEmbedding' in r)), 'vectors never leave the service');
  assert.ok(names.indexOf('Pink Suit') < names.indexOf('Blue Suit'));

  const women = await searchByImageVector([1, 0, 0], { catalog: 'clothing', gender: 'women' });
  assert.ok(!women.some((r) => r.name === 'Red Mens' || r.name === 'Red Shoe'));
  assert.equal(women[0].name, 'Red Suit');
});

test('text finds photos: the CLIP text vector ranks the matching product image first (cross-modal)', async () => {
  const mk = (name, vec) => ({ ...base, name, productUrl: `https://t/${name}`, imageEmbedding: vec, imageEmbeddingModel: IMAGE_EMBEDDING_MODEL_ID });
  await ClothingProduct.create([mk('Looks Red', [1, 0, 0]), mk('Looks Blue', [0, 1, 0])]);
  const res = await searchByImageVector(await embedTextForImages('a blue dress'), { catalog: 'clothing' });
  assert.equal(res[0].name, 'Looks Blue');
});

test('fuseRankings: items in both lists rise above items in one; order is deterministic', () => {
  const p = (id) => ({ _id: id, name: id });
  const textRank = [p('a'), p('b'), p('c')];
  const visualRank = [p('d'), p('b'), p('a')];
  const fused = fuseRankings(textRank, visualRank).map((x) => x.name);
  assert.deepEqual(fused.slice(0, 2).sort(), ['a', 'b']);
  assert.equal(fused.length, 4);
  assert.ok(fused.indexOf('b') < fused.indexOf('c') && fused.indexOf('b') < fused.indexOf('d'));
  assert.deepEqual(fuseRankings([], []), []);
  assert.deepEqual(fuseRankings([p('x')], []).map((x) => x.name), ['x']);
});

test('embedImage / embedTextForImages go through the injected backend', async () => {
  assert.deepEqual(await embedImage(Buffer.from([2, 9])), [0, 0, 1]);
  assert.deepEqual(await embedTextForImages('red'), [1, 0, 0]);
});

test('imageEmbedding is never returned by default (it used to leak into every list/search response)', async () => {
  await ClothingProduct.create({ ...base, name: 'Has Vector', productUrl: 'https://t/hv', imageEmbedding: [1, 0, 0], imageEmbeddingModel: IMAGE_EMBEDDING_MODEL_ID });
  const plain = await ClothingProduct.findOne({ name: 'Has Vector' }).lean();
  assert.equal('imageEmbedding' in plain, false);
  const withoutText = await ClothingProduct.findOne({ name: 'Has Vector' }, { embedding: 0 }).lean();
  assert.equal('imageEmbedding' in withoutText, false, 'the common {embedding:0} projection must not bring it back');
  const asked = await ClothingProduct.findOne({ name: 'Has Vector' }, 'imageEmbedding').lean();
  assert.deepEqual(asked.imageEmbedding, [1, 0, 0], 'still available when asked for by name');
});
