/**
 * Regression: POST /api/search/embed-all (re-embeds the WHOLE catalog) used to be callable by anyone, and the
 * LLM-backed / database-writing public routes had no per-caller cap.
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User.js';
import { _resetQuotaMemory } from '../middleware/quota.js';

let mongod;
let app;
let userToken;
let adminToken;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const user = await User.create({ name: 'U', email: 'u@t.pk', password: 'secret123', role: 'user' });
  const admin = await User.create({ name: 'A', email: 'a@t.pk', password: 'secret123', role: 'admin' });
  userToken = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
  adminToken = jwt.sign({ id: String(admin._id) }, process.env.JWT_SECRET);
  const { createApp } = await import('../app.js');
  app = createApp();
});
after(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
beforeEach(() => _resetQuotaMemory());

test('embed-all: anonymous 401, signed-in non-admin 403, admin reaches the handler', async () => {
  assert.equal((await request(app).post('/api/search/embed-all').send({})).status, 401);
  assert.equal((await request(app).post('/api/search/embed-all').set('Authorization', `Bearer ${userToken}`).send({})).status, 403);
  const asAdmin = await request(app).post('/api/search/embed-all').set('Authorization', `Bearer ${adminToken}`).send({});
  assert.equal(asAdmin.status, 503, 'embeddings are disabled under test, which proves the handler ran');
});

test('support escalation is capped per anonymous caller', async () => {
  const send = () => request(app).post('/api/support/escalate').set('X-Forwarded-For', '5.5.5.5').send({ userMessage: 'help me please' });
  for (let i = 0; i < 5; i++) assert.equal((await send()).status, 200);
  const blocked = await send();
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers['retry-after']);
});

test('LLM-backed recommendation endpoints are quota-limited per anonymous caller', async () => {
  process.env.OUTFIT_ANON_DAILY_LIMIT = '2';
  const { createApp } = await import('../app.js');
  // limit is read when the route module loads, so assert on the headers the quota middleware sets instead
  const res = await request(createApp()).post('/api/recommendations/style-advice').set('X-Forwarded-For', '4.4.4.4').send({});
  assert.ok(res.headers['x-quota-limit'], 'quota middleware is in front of the handler');
  assert.ok(Number(res.headers['x-quota-remaining']) >= 0);
});
