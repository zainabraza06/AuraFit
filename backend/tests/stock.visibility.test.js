/**
 * Out-of-stock products must not surface in browse, keyword search or semantic search.
 * Regression: only the recommendation engine filtered on inStock, so once the scraper
 * correctly marked sold-out items (e.g. 429 Khaadi rows) they still showed up in the UI.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ClothingProduct from '../models/ClothingProduct.js';
import { EMBEDDING_MODEL_ID } from '../services/embeddings.js';
import { clearVectorCache } from '../services/vectorCache.js';

let mongod;
let app;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.HUGGING_FACE_API_KEY = '';
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  const mod = await import('../app.js');
  app = mod.createApp();
  await mongoose.connect(process.env.MONGO_URI);
  await ClothingProduct.init();
  const base = { brand: 'TestBrand', gender: 'women', price: 3000, embedding: [1, 0, 0], embeddingModel: EMBEDDING_MODEL_ID };
  await ClothingProduct.create([
    { ...base, name: 'Emerald Lawn Suit', productUrl: 'https://t.pk/in', inStock: true },
    { ...base, name: 'Emerald Lawn Suit Sold Out', productUrl: 'https://t.pk/out', inStock: false },
    { ...base, name: 'Emerald Lawn Suit Legacy', productUrl: 'https://t.pk/legacy' }, // inStock never set: still visible
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const names = (res) => (res.body.products || res.body.results || []).map((p) => p.name);

test('browse hides out-of-stock products but keeps rows where stock was never recorded', async () => {
  const res = await request(app).get('/api/products');
  assert.equal(res.status, 200);
  const n = names(res);
  assert.ok(n.includes('Emerald Lawn Suit'));
  assert.ok(n.includes('Emerald Lawn Suit Legacy'));
  assert.ok(!n.includes('Emerald Lawn Suit Sold Out'), `sold-out item leaked: ${n}`);
});

test('keyword search hides out-of-stock products', async () => {
  const res = await request(app).get('/api/search').query({ q: 'Emerald' });
  assert.equal(res.status, 200);
  const n = names(res);
  assert.ok(n.length >= 1, 'expected matches');
  assert.ok(!n.includes('Emerald Lawn Suit Sold Out'), `sold-out item leaked: ${n}`);
});

test('featured and stats only count products that are actually available', async () => {
  const featured = await request(app).get('/api/products/featured');
  assert.ok(!(featured.body.featured || []).some((p) => p.name.includes('Sold Out')));
  const stats = await request(app).get('/api/products/stats');
  assert.equal(stats.body.total, 2, 'sold-out row must not be counted');
});

test('semantic search candidates exclude out-of-stock products', async () => {
  clearVectorCache();
  const { searchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const { analyzeSearchQuery } = await import('../services/searchQueryIntel.js');
  const { results } = await searchAcrossCatalogs(analyzeSearchQuery('emerald lawn suit'), [1, 0, 0], { limit: 10, catalog: 'clothing' });
  const n = results.map((r) => r.name);
  assert.ok(n.includes('Emerald Lawn Suit'));
  assert.ok(!n.includes('Emerald Lawn Suit Sold Out'), `sold-out item leaked: ${n}`);
});

test('vectors from a different embedding model are never used (dimensions are not comparable)', async () => {
  clearVectorCache();
  await ClothingProduct.create({
    name: 'Emerald Lawn Suit Old Model', brand: 'TestBrand', gender: 'women', price: 3000,
    productUrl: 'https://t.pk/oldmodel', inStock: true,
    embedding: new Array(384).fill(0.05), embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
  });
  const { searchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const { analyzeSearchQuery } = await import('../services/searchQueryIntel.js');
  const { results } = await searchAcrossCatalogs(analyzeSearchQuery('emerald lawn suit'), [1, 0, 0], { limit: 10, catalog: 'clothing' });
  assert.ok(!results.map((r) => r.name).includes('Emerald Lawn Suit Old Model'));
});

test('semantic search sees the WHOLE catalog, not just the first 400 rows (regression: .limit(400))', async () => {
  clearVectorCache();
  const filler = Array.from({ length: 450 }, (_, i) => ({
    name: `Filler Kurta ${i}`, brand: 'TestBrand', gender: 'women', price: 2000, productUrl: `https://t.pk/filler/${i}`,
    inStock: true, embedding: [0, 1, 0], embeddingModel: EMBEDDING_MODEL_ID,
  }));
  await ClothingProduct.insertMany(filler);
  // inserted AFTER 450 others => beyond the old 400-row window; it is the only one pointing at the query direction
  await ClothingProduct.create({
    name: 'Zinnia Gold Bridal Lehnga', brand: 'TestBrand', gender: 'women', price: 90000, productUrl: 'https://t.pk/zinnia',
    inStock: true, embedding: [0, 0, 1], embeddingModel: EMBEDDING_MODEL_ID,
  });
  const { searchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const { analyzeSearchQuery } = await import('../services/searchQueryIntel.js');
  const { results, totalCandidates } = await searchAcrossCatalogs(analyzeSearchQuery('bridal lehnga'), [0, 0, 1], { limit: 5, catalog: 'clothing' });
  assert.ok(totalCandidates > 450, `only ${totalCandidates} candidates were considered`);
  assert.equal(results[0].name, 'Zinnia Gold Bridal Lehnga');
});

test('gender/category filters are applied in memory on ONE cached candidate set', async () => {
  clearVectorCache();
  await ClothingProduct.create([
    { name: 'Mens Cotton Kurta', brand: 'TestBrand', gender: 'men', price: 3000, productUrl: 'https://t.pk/men1', inStock: true, embedding: [0, 0, 1], embeddingModel: EMBEDDING_MODEL_ID },
    { name: 'Kids Frock', brand: 'TestBrand', gender: 'kids', price: 1500, productUrl: 'https://t.pk/kid1', inStock: true, embedding: [0, 0, 1], embeddingModel: EMBEDDING_MODEL_ID },
  ]);
  const { searchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const { analyzeSearchQuery } = await import('../services/searchQueryIntel.js');
  const { vectorCacheSize } = await import('../services/vectorCache.js');
  const sig = analyzeSearchQuery('kurta');
  const men = await searchAcrossCatalogs(sig, [0, 0, 1], { limit: 50, catalog: 'clothing', gender: 'men' });
  assert.ok(men.results.length >= 1 && men.results.every((r) => r.gender === 'men'));
  const kids = await searchAcrossCatalogs(sig, [0, 0, 1], { limit: 50, catalog: 'clothing', gender: 'kids' });
  assert.ok(kids.results.length >= 1 && kids.results.every((r) => r.gender === 'kids'));
  const both = await searchAcrossCatalogs(sig, [0, 0, 1], { limit: 50, catalog: 'clothing', gender: 'men,kids' });
  assert.ok(both.results.every((r) => ['men', 'kids'].includes(r.gender)));
  assert.equal(vectorCacheSize(), 1, 'three different filters must share one cache entry');
});

test('keyword fallback (regexSearchAcrossCatalogs, used when local models are off) works, honours gender and hides sold-out items', async () => {
  // Regression: the in-memory gender change removed an import this path still used, so every keyword-mode search threw.
  const { regexSearchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const all = await regexSearchAcrossCatalogs({ keywords: ['emerald'] }, { limit: 20, catalog: 'clothing' });
  const names = all.results.map((r) => r.name);
  assert.ok(names.includes('Emerald Lawn Suit'));
  assert.ok(!names.includes('Emerald Lawn Suit Sold Out'), `sold-out item leaked: ${names}`);
  const men = await regexSearchAcrossCatalogs({ keywords: ['kurta'], gender: 'men' }, { limit: 20, catalog: 'clothing' });
  assert.ok(men.results.length >= 1 && men.results.every((r) => r.gender === 'men'));
  assert.equal(all.results[0].catalog, 'clothing');
});

test('keyword fallback ranks by how many terms match and treats user text as text, not as a regex', async () => {
  const { regexSearchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  await ClothingProduct.create([
    { name: 'Zeta Cotton Kurta', brand: 'TestBrand', gender: 'women', price: 2000, productUrl: 'https://t.pk/zk', inStock: true, primaryColor: 'White', colors: ['White'], embedding: [0, 1, 0], embeddingModel: EMBEDDING_MODEL_ID },
    { name: 'Zeta Wide Leg Pants', brand: 'TestBrand', gender: 'women', price: 2000, productUrl: 'https://t.pk/zp', inStock: true, primaryColor: 'White', colors: ['White'], embedding: [0, 1, 0], embeddingModel: EMBEDDING_MODEL_ID },
    { name: 'Zeta Red Kurta', brand: 'TestBrand', gender: 'women', price: 2000, productUrl: 'https://t.pk/zr', inStock: true, primaryColor: 'Red', colors: ['Red'], embedding: [0, 1, 0], embeddingModel: EMBEDDING_MODEL_ID },
  ]);
  const { results } = await regexSearchAcrossCatalogs({ color: ['White'], keywords: ['zeta', 'kurta'] }, { limit: 3, catalog: 'clothing' });
  assert.equal(results[0].name, 'Zeta Cotton Kurta', `ranked: ${results.map((r) => r.name)}`);
  // regex metacharacters must be literal: this would match everything (or hang) if it were interpreted as a pattern
  const hostile = await regexSearchAcrossCatalogs({ keywords: ['(a+)+$', '.*'] }, { limit: 5, catalog: 'clothing' });
  assert.equal(hostile.results.length, 0);
});

test('product-page recommendations never ship raw embedding vectors to the client', async () => {
  const src = await ClothingProduct.create({ name: 'Rec Source Suit', brand: 'TestBrand', gender: 'women', price: 3000, productUrl: 'https://t.pk/recsrc', inStock: true, embedding: [1, 0, 0], embeddingModel: EMBEDDING_MODEL_ID, primaryColor: 'Red', colors: ['Red'], occasion: ['party'] });
  await ClothingProduct.create({ name: 'Rec Other Suit', brand: 'TestBrand', gender: 'women', price: 3200, productUrl: 'https://t.pk/recother', inStock: true, embedding: [1, 0, 0], embeddingModel: EMBEDDING_MODEL_ID, primaryColor: 'Red', colors: ['Red'], occasion: ['party'] });
  const res = await request(app).get(`/api/recommendations/${src._id}`);
  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes('"embedding"'), 'a raw embedding vector reached the client');
});
