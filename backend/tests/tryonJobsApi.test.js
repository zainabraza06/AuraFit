import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createTryonQueue } from '../services/tryonQueue.js';
import { createMongoTryonStore } from '../services/tryonStore.js';
import { _resetQuotaMemory } from '../middleware/quota.js';

const PNG = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(String(n).padEnd(16, '.'))]);
let mongod;
let app;
let gate; // resolves the currently running fake generation

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { createApp } = await import('../app.js');
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(() => {
  _resetQuotaMemory();
  gate = null;
  app.locals.tryonQueue = createTryonQueue({
    store: createMongoTryonStore(),
    run: () => new Promise((resolve, reject) => { gate = { resolve: () => resolve({ resultUrl: 'https://cdn.example/result.png', provider: 'fake' }), reject }; }),
  });
});

const submit = (person = 1, clothing = 2, ip = '9.9.9.1') =>
  request(app).post('/api/tryon/jobs').set('X-Forwarded-For', ip)
    .attach('person', PNG(person), { filename: 'p.png', contentType: 'image/png' })
    .attach('clothing', PNG(clothing), { filename: 'c.png', contentType: 'image/png' });

const until = async (fn, ms = 2000) => { const t = Date.now(); while (!(await fn())) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 10)); } };

test('submit returns 202 immediately with a job id and Location; polling shows progress to done', async () => {
  const res = await submit();
  assert.equal(res.status, 202);
  assert.ok(res.body.id);
  assert.match(res.headers.location, /\/api\/tryon\/jobs\//);
  await until(() => gate);
  const running = await request(app).get(`/api/tryon/jobs/${res.body.id}`).set('X-Forwarded-For', '9.9.9.1');
  assert.equal(running.body.status, 'running');
  gate.resolve();
  await until(async () => (await request(app).get(`/api/tryon/jobs/${res.body.id}`).set('X-Forwarded-For', '9.9.9.1')).body.status === 'done');
  const done = await request(app).get(`/api/tryon/jobs/${res.body.id}`).set('X-Forwarded-For', '9.9.9.1');
  assert.equal(done.body.resultUrl, 'https://cdn.example/result.png');
});

test('the same images again return the cached result at once (200, cached, nothing re-run)', async () => {
  const first = await submit(5, 6);
  await until(() => gate);
  gate.resolve();
  await until(async () => (await request(app).get(`/api/tryon/jobs/${first.body.id}`).set('X-Forwarded-For', '9.9.9.1')).body.status === 'done');
  gate = null;
  const again = await submit(5, 6, '9.9.9.2');
  assert.equal(again.status, 200);
  assert.equal(again.body.cached, true);
  assert.equal(again.body.resultUrl, 'https://cdn.example/result.png');
  assert.equal(gate, null, 'no generation was started');
});

test("another caller cannot read someone else's job (404)", async () => {
  const res = await submit(7, 8, '9.9.9.1');
  const other = await request(app).get(`/api/tryon/jobs/${res.body.id}`).set('X-Forwarded-For', '8.8.8.8');
  assert.equal(other.status, 404);
});

test('validation: missing images, non-images and unsafe URLs are 400 and never queued', async () => {
  assert.equal((await request(app).post('/api/tryon/jobs').send({})).status, 400);
  const fake = await request(app).post('/api/tryon/jobs').set('X-Forwarded-For', '9.9.9.3')
    .attach('person', Buffer.from('<html>not an image</html>'), { filename: 'p.png', contentType: 'image/png' })
    .attach('clothing', PNG(2), { filename: 'c.png', contentType: 'image/png' });
  assert.equal(fake.status, 400);
  const ssrf = await request(app).post('/api/tryon/jobs').set('X-Forwarded-For', '9.9.9.4')
    .field('personUrl', 'http://169.254.169.254/latest/meta-data').field('clothingUrl', 'https://cdn.example/c.jpg');
  assert.equal(ssrf.status, 400);
  assert.equal(gate, null);
});

test('a caller with too many jobs in flight gets 429 with Retry-After', async () => {
  app.locals.tryonQueue = createTryonQueue({ store: createMongoTryonStore(), maxPerOwner: 1, run: () => new Promise(() => {}) });
  assert.equal((await submit(11, 12, '7.7.7.7')).status, 202);
  const busy = await submit(13, 14, '7.7.7.7');
  assert.equal(busy.status, 429);
  assert.ok(busy.headers['retry-after']);
});

test('SSE stream: sends the current state, then each change, and closes when the job finishes', async () => {
  const sub = await submit(21, 22, '6.6.6.6');
  await until(() => gate);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/tryon/jobs/${sub.body.id}/events`, { headers: { 'X-Forwarded-For': '6.6.6.6' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (re) => { while (!re.test(text)) { const { value, done } = await reader.read(); if (done) return; text += decoder.decode(value); } };
    await readUntil(/"status":"running"/);
    gate.resolve();
    await readUntil(/"status":"done"/);
    const { done } = await reader.read();
    assert.equal(done, true, 'server closes the stream after the terminal state');
    assert.match(text, /event: status/);
    assert.match(text, /result\.png/);
  } finally {
    server.close();
  }
});

test('a stale queued/running job from a dead process is failed on startup', async () => {
  const store = createMongoTryonStore();
  await store.save({ id: 'ghost1', owner: 'ip:1', cacheKey: 'k', status: 'running', createdAt: Date.now() });
  const q = createTryonQueue({ store, run: async () => ({}) });
  assert.ok((await q.failStale()) >= 1);
  const ghost = await store.get('ghost1');
  assert.equal(ghost.status, 'failed');
  assert.equal(ghost.reason, 'server_restarted');
});
