import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ClothingProduct from '../models/ClothingProduct.js';
import { EMBEDDING_MODEL_ID, setEmbeddingBackend } from '../services/embeddings.js';
import { clearVectorCache } from '../services/vectorCache.js';
import { _resetQuotaMemory } from '../middleware/quota.js';

let mongod;
let app;
let productId;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.AGENT_ANON_DAILY_LIMIT = '3';
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);
  setEmbeddingBackend({ embed: async (texts) => texts.map(() => [1, 0, 0]) });
  clearVectorCache();
  const p = await ClothingProduct.create({ name: 'Green Mehndi Suit', brand: 'B', gender: 'women', price: 6000, primaryColor: 'Green', productUrl: 'https://t.pk/g', embedding: [1, 0, 0], embeddingModel: EMBEDDING_MODEL_ID, inStock: true });
  productId = String(p._id);
  const { createApp } = await import('../app.js');
  app = createApp();
  _resetQuotaMemory();
});

after(async () => {
  setEmbeddingBackend(null);
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

function scriptedLlm() {
  let i = 0;
  return async () => [
    { action: 'tool', tool: 'search_catalog', args: { query: 'green mehndi suit' } },
    { action: 'final', answer: 'This green suit is perfect for a mehndi.', picks: [{ id: productId, why: 'green, festive' }, { id: 'f'.repeat(24), why: 'invented' }] },
  ][i++];
}

test('POST /api/stylist/ask runs the agent against the real tools and returns grounded picks', async () => {
  app.locals.agentLlm = scriptedLlm();
  const res = await request(app).post('/api/stylist/ask').send({ message: 'green outfit for a mehndi' });
  assert.equal(res.status, 200);
  assert.match(res.body.answer, /green suit/);
  assert.deepEqual(res.body.picks.map((p) => p.name), ['Green Mehndi Suit']);
  assert.equal(res.body.meta.toolCalls, 1);
  assert.equal(res.body.meta.stopReason, 'answered');
});

test('rejects missing or too-short messages', async () => {
  assert.equal((await request(app).post('/api/stylist/ask').send({})).status, 400);
  assert.equal((await request(app).post('/api/stylist/ask').send({ message: 'hi' })).status, 400);
  assert.equal((await request(app).post('/api/stylist/ask').send({ message: 'x'.repeat(501) })).status, 400);
});

test('anonymous callers hit the daily quota (costly endpoint)', async () => {
  _resetQuotaMemory();
  app.locals.agentLlm = async () => ({ action: 'final', answer: 'ok', picks: [] });
  const send = () => request(app).post('/api/stylist/ask').send({ message: 'something nice' });
  for (let i = 0; i < 3; i++) assert.equal((await send()).status, 200);
  const blocked = await send();
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers['retry-after']);
});
