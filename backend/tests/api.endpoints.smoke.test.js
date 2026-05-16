import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import User from '../models/User.js';
import ClothingProduct from '../models/ClothingProduct.js';
import Outfit from '../models/Outfit.js';

let mongod;
let app;
let server;
let baseUrl;

let userToken;
let adminToken;
let seededProduct;

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  // Ensure smoke tests don't make external network calls.
  process.env.HUGGING_FACE_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  process.env.REPLICATE_API_KEY = '';

  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  // Import app after env is set so dotenv doesn't override test vars.
  const mod = await import('../app.js');
  app = mod.createApp();

  await mongoose.connect(process.env.MONGO_URI);

  // Seed users
  const user = await User.create({ name: 'Test User', email: 'user@example.com', password: 'password123' });
  const admin = await User.create({ name: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' });
  userToken = signToken(user._id);
  adminToken = signToken(admin._id);

  // Seed a product for product/favorites/recs/outfits
  seededProduct = await ClothingProduct.create({
    name: 'Test Kurta',
    brand: 'TestBrand',
    gender: 'women',
    price: 2500,
    productUrl: 'https://example.com/test-kurta'
  });

  // Only needed for SSE fetch test
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  }
});

test('health check works', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('auth endpoints work', async () => {
  const bad = await request(app).post('/api/auth/register').send({});
  assert.equal(bad.status, 400);

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'New', email: 'new@example.com', password: 'password123' });
  assert.equal(reg.status, 201);
  assert.ok(reg.body.token);

  const login = await request(app).post('/api/auth/login').send({ email: 'new@example.com', password: 'password123' });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);

  const meNo = await request(app).get('/api/auth/me');
  assert.equal(meNo.status, 401);

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'new@example.com');

  const cpBad = await request(app)
    .put('/api/auth/change-password')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ currentPassword: 'password123', newPassword: '123' });
  assert.equal(cpBad.status, 400);
});

test('products endpoints work', async () => {
  const list = await request(app).get('/api/products');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.products));

  const featured = await request(app).get('/api/products/featured');
  assert.equal(featured.status, 200);

  const stats = await request(app).get('/api/products/stats');
  assert.equal(stats.status, 200);

  const badId = await request(app).get('/api/products/not-an-id');
  assert.equal(badId.status, 400);

  const byId = await request(app).get(`/api/products/${seededProduct._id}`);
  assert.equal(byId.status, 200);
  assert.equal(String(byId.body.product.id || byId.body.product._id), String(seededProduct._id));
});

test('search endpoints work (text + suggestions)', async () => {
  const s1 = await request(app).get('/api/search');
  assert.equal(s1.status, 200);

  const sug = await request(app).get('/api/search/suggestions').query({ q: 'Te' });
  assert.equal(sug.status, 200);
  assert.ok(Array.isArray(sug.body.suggestions));
});

test('vector search endpoints return expected config errors', async () => {
  const noQ = await request(app).get('/api/search/semantic');
  assert.equal(noQ.status, 400);

  const noKey = await request(app).get('/api/search/semantic').query({ q: 'red kurta' });
  assert.equal(noKey.status, 503);

  const embedNoKey = await request(app).post('/api/search/embed-all').send({ limit: 1 });
  assert.equal(embedNoKey.status, 503);
});

test('recommendations endpoints are reachable without calling AI', async () => {
  const recs = await request(app).get(`/api/recommendations/${seededProduct._id}`);
  // Recommendation engine may return 200 or 404 if product lookup differs; never 500.
  assert.ok([200, 404].includes(recs.status), `unexpected status: ${recs.status}`);

  const outfitMissing = await request(app).post('/api/recommendations/outfit').send({});
  assert.equal(outfitMissing.status, 400);
});

test('favorites endpoints work (protected)', async () => {
  const noAuth = await request(app).get('/api/favorites');
  assert.equal(noAuth.status, 401);

  const list0 = await request(app).get('/api/favorites').set('Authorization', `Bearer ${userToken}`);
  assert.equal(list0.status, 200);

  const add = await request(app)
    .post(`/api/favorites/${seededProduct._id}`)
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(add.status, 201);

  const check = await request(app)
    .get(`/api/favorites/check/${seededProduct._id}`)
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(check.status, 200);
  assert.equal(check.body.favorited, true);

  const del = await request(app)
    .delete(`/api/favorites/${seededProduct._id}`)
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(del.status, 200);
});

test('outfits endpoints work (protected)', async () => {
  const noAuth = await request(app).get('/api/outfits');
  assert.equal(noAuth.status, 401);

  const created = await request(app)
    .post('/api/outfits')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ heroProductId: seededProduct._id, accessoryIds: [], reasoning: 'test', name: 'Test', occasion: ['casual'] });
  assert.equal(created.status, 201);
  assert.ok(created.body._id);

  const list = await request(app).get('/api/outfits').set('Authorization', `Bearer ${userToken}`);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));

  const del = await request(app)
    .delete(`/api/outfits/${created.body._id}`)
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(del.status, 200);

  // Ensure it is gone
  const still = await Outfit.findById(created.body._id).lean();
  assert.equal(still, null);
});

test('wardrobe endpoints are reachable (avoid external Gemini call)', async () => {
  const noAuth = await request(app).get('/api/wardrobe');
  assert.equal(noAuth.status, 401);

  const list = await request(app).get('/api/wardrobe').set('Authorization', `Bearer ${userToken}`);
  assert.equal(list.status, 200);

  const addNoFile = await request(app).post('/api/wardrobe').set('Authorization', `Bearer ${userToken}`);
  assert.equal(addNoFile.status, 400);
});

test('tryon and image search endpoints validate inputs (no external calls)', async () => {
  const tryonNoFiles = await request(app).post('/api/tryon');
  assert.equal(tryonNoFiles.status, 400);

  const imgNoFile = await request(app).post('/api/search/visual/image');
  assert.equal(imgNoFile.status, 400);
});

test('admin endpoints enforce auth and work for admins', async () => {
  const noAuth = await request(app).get('/api/admin/stats');
  assert.equal(noAuth.status, 401);

  const userForbidden = await request(app)
    .get('/api/admin/stats')
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(userForbidden.status, 403);

  const stats = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(stats.status, 200);

  const status = await request(app)
    .get('/api/admin/scraper/status')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(status.status, 200);

  const logs = await request(app)
    .get('/api/admin/scraper/logs')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(logs.status, 200);

  const audit = await request(app)
    .post('/api/admin/catalog/lexical-audit')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ limit: 5 });
  assert.equal(audit.status, 200);

  // Brand deletion is safe in memory DB
  const delBrand = await request(app)
    .delete('/api/admin/products/brand/TestBrand')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(delBrand.status, 200);
});

test('admin SSE stream endpoint responds with event-stream', async () => {
  const resp = await fetch(`${baseUrl}/api/admin/scraper/stream`, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });

  assert.equal(resp.status, 200);
  const ct = resp.headers.get('content-type') || '';
  assert.ok(ct.includes('text/event-stream'));

  // Read one chunk to ensure stream is live, then cancel.
  const reader = resp.body.getReader();
  const race = await Promise.race([
    reader.read(),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 750))
  ]);

  // Close the stream regardless.
  try { await reader.cancel(); } catch { /* ignore */ }

  assert.ok(!race?.timeout, 'SSE stream did not emit initial data in time');
});
