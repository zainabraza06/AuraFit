import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheResponse, _clearMemoryCache, _memoryCacheSize } from './cache.js';

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

test('no redis configured => first request runs the handler (MISS), the next is served from memory (HIT)', async () => {
  _clearMemoryCache();
  const mw = cacheResponse(30, { redis: () => null });
  const first = await run(mw, { method: 'GET', originalUrl: '/mem/a' });
  assert.equal(first.from, 'handler');
  assert.equal(first.headers['X-Cache'], 'MISS');
  const second = await run(mw, { method: 'GET', originalUrl: '/mem/a' });
  assert.equal(second.from, 'cache');
  assert.equal(second.headers['X-Cache'], 'HIT');
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

// ── in-process fallback: TTL, coalescing, safety ─────────────────────────────
function runWith(mw, req, handler) {
  return new Promise((resolve) => {
    const headers = {};
    const closers = [];
    const res = {
      statusCode: 200,
      set: (k, v) => { headers[k] = v; return res; },
      type: () => res,
      send: (b) => resolve({ headers, body: b, from: 'cache' }),
      json: (b) => { resolve({ headers, body: b, from: 'handler' }); return res; },
      on: (ev, fn) => { if (ev === 'close') closers.push(fn); },
    };
    mw(req, res, () => handler(res));
  });
}

test('memory cache entries expire after the TTL', async () => {
  _clearMemoryCache();
  let t = 1000;
  const mw = cacheResponse(10, { redis: () => null, now: () => t });
  const req = { method: 'GET', originalUrl: '/mem/ttl' };
  await runWith(mw, req, (res) => res.json({ n: 1 }));
  t += 5000;
  assert.equal((await runWith(mw, req, (res) => res.json({ n: 2 }))).from, 'cache');
  t += 6000;
  const after = await runWith(mw, req, (res) => res.json({ n: 3 }));
  assert.equal(after.from, 'handler', 'expired entries are recomputed');
});

test('concurrent identical requests run the handler ONCE; the rest are COALESCED', async () => {
  _clearMemoryCache();
  const mw = cacheResponse(30, { redis: () => null });
  const req = { method: 'GET', originalUrl: '/mem/coalesce' };
  let runs = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = async (res) => { runs++; await gate; res.json({ big: 'result' }); };
  const results = Promise.all([1, 2, 3, 4, 5].map(() => runWith(mw, req, slow)));
  await new Promise((r) => setImmediate(r));
  release();
  const out = await results;
  assert.equal(runs, 1);
  assert.equal(out.filter((o) => o.headers['X-Cache'] === 'COALESCED').length, 4);
  assert.ok(out.every((o) => JSON.stringify(o.body).includes('big') || typeof o.body === 'string'));
});

test('errors and non-200 responses are never cached, and waiters fall through to run themselves', async () => {
  _clearMemoryCache();
  const mw = cacheResponse(30, { redis: () => null });
  const req = { method: 'GET', originalUrl: '/mem/fail' };
  const first = await runWith(mw, req, (res) => { res.statusCode = 500; res.json({ error: 'boom' }); });
  assert.equal(first.from, 'handler');
  const second = await runWith(mw, req, (res) => res.json({ ok: true }));
  assert.equal(second.from, 'handler', 'a 500 must not be served from cache');
  assert.equal(_memoryCacheSize(), 1, 'only the later 200 is stored');
});

test('different query strings are different entries; POST is never cached', async () => {
  _clearMemoryCache();
  const mw = cacheResponse(30, { redis: () => null });
  await runWith(mw, { method: 'GET', originalUrl: '/mem/p?page=1' }, (res) => res.json({ page: 1 }));
  const p2 = await runWith(mw, { method: 'GET', originalUrl: '/mem/p?page=2' }, (res) => res.json({ page: 2 }));
  assert.equal(p2.from, 'handler');
  const post = await runWith(mw, { method: 'POST', originalUrl: '/mem/p?page=1' }, (res) => res.json({ posted: true }));
  assert.equal(post.from, 'handler');
  assert.equal(post.headers['X-Cache'], undefined);
});
