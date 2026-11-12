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
  const base = { brand: 'TestBrand', gender: 'women', price: 3000, embedding: [1, 0, 0] };
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
  const { searchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const { analyzeSearchQuery } = await import('../services/searchQueryIntel.js');
  const { results } = await searchAcrossCatalogs(analyzeSearchQuery('emerald lawn suit'), [1, 0, 0], { limit: 10, catalog: 'clothing' });
  const n = results.map((r) => r.name);
  assert.ok(n.includes('Emerald Lawn Suit'));
  assert.ok(!n.includes('Emerald Lawn Suit Sold Out'), `sold-out item leaked: ${n}`);
});
