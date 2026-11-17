import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requestLogger, resolveRequestId } from '../middleware/requestLogger.js';

async function withApp(setup, fn) {
  const lines = [];
  const app = express();
  app.use(requestLogger({ write: (l) => lines.push(JSON.parse(l)) }));
  setup(app);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`, lines); } finally { server.close(); }
}

test('resolveRequestId keeps a sane id and replaces junk', () => {
  assert.equal(resolveRequestId('abc-12345678'), 'abc-12345678');
  assert.notEqual(resolveRequestId('bad id with spaces'), 'bad id with spaces');
  assert.notEqual(resolveRequestId('x'), 'x');
  assert.match(resolveRequestId(undefined), /^[0-9a-f-]{36}$/);
});

test('logs one JSON line per request with the route PATTERN, status and id', async () => {
  await withApp(
    (app) => {
      app.get('/api/products/:id', (req, res) => res.json({ ok: true }));
      app.get('/api/boom', (req, res) => res.status(500).json({}));
    },
    async (base, lines) => {
      const r = await fetch(`${base}/api/products/123456?token=secret`, { headers: { 'x-request-id': 'trace-abcdef12' } });
      assert.equal(r.headers.get('x-request-id'), 'trace-abcdef12');
      await fetch(`${base}/api/boom`);
      await new Promise((r2) => setTimeout(r2, 20));
      assert.equal(lines.length, 2);
      assert.equal(lines[0].reqId, 'trace-abcdef12');
      assert.equal(lines[0].route, '/api/products/:id');
      assert.equal(lines[0].status, 200);
      assert.equal(lines[0].level, 'info');
      assert.ok(!JSON.stringify(lines[0]).includes('secret'), 'query string must not be logged');
      assert.ok(!JSON.stringify(lines[0]).includes('123456'), 'raw ids must not be logged');
      assert.equal(lines[1].level, 'error');
      assert.ok(typeof lines[0].ms === 'number');
    },
  );
});

test('unmatched routes are labelled and health/metrics are not logged', async () => {
  await withApp(
    (app) => { app.get('/api/health', (req, res) => res.json({})); },
    async (base, lines) => {
      await fetch(`${base}/api/health`);
      await fetch(`${base}/nope`);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(lines.length, 1);
      assert.equal(lines[0].route, 'unmatched');
      assert.equal(lines[0].level, 'warn');
    },
  );
});
