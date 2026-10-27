import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheResponse } from './cache.js';

function fakeClient() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); return 'OK'; } };
}
function run(mw, req) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      set: (k, v) => { headers[k] = v; return res; },
      type: () => res,
      send: (b) => resolve({ headers, body: b, from: 'cache' }),
      json: (b) => { resolve({ headers, body: b, from: 'handler' }); return res; },
    };
    mw(req, res, () => res.json({ items: [1, 2] }));
  });
}

test('miss then hit; second call is served from cache', async () => {
  const c = fakeClient();
  const mw = cacheResponse(30, { redis: () => c });
  const req = { method: 'GET', originalUrl: '/api/products?page=1' };
  const first = await run(mw, req);
  assert.equal(first.headers['X-Cache'], 'MISS');
  await new Promise((r) => setImmediate(r));
  const second = await run(mw, req);
  assert.equal(second.headers['X-Cache'], 'HIT');
  assert.equal(second.from, 'cache');
});

test('no redis configured => passes straight through', async () => {
  const out = await run(cacheResponse(30, { redis: () => null }), { method: 'GET', originalUrl: '/x' });
  assert.equal(out.from, 'handler');
  assert.equal(out.headers['X-Cache'], undefined);
});

test('redis error is fail-open', async () => {
  const bad = { get: async () => { throw new Error('down'); } };
  const out = await run(cacheResponse(30, { redis: () => bad }), { method: 'GET', originalUrl: '/x' });
  assert.equal(out.from, 'handler');
});

test('non-GET and non-200 responses are not cached', async () => {
  const c = fakeClient();
  const mw = cacheResponse(30, { redis: () => c });
  await run(mw, { method: 'POST', originalUrl: '/y' });
  assert.equal(c.m.size, 0);
});
