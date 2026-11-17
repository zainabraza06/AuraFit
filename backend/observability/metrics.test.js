import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { httpMetrics, metricsHandler, registry, routeLabel, llmCalls } from './metrics.js';

function app() {
  const a = express();
  a.use(httpMetrics);
  a.get('/metrics', metricsHandler);
  const r = express.Router();
  r.get('/:id', (req, res) => res.json({ id: req.params.id }));
  r.get('/boom', (req, res) => res.status(500).json({ error: 'x' }));
  a.use('/api/products', r);
  return a;
}

test('latency is labelled by route pattern, not the raw URL (bounded cardinality)', async () => {
  const a = app();
  await request(a).get('/api/products/123');
  await request(a).get('/api/products/456');
  const text = await registry.metrics();
  assert.match(text, /http_requests_total\{method="GET",route="\/api\/products\/:id",status="2xx"\} 2/);
  assert.ok(!text.includes('/api/products/123'));
});

test('unknown URLs collapse into one "unmatched" label', async () => {
  const a = app();
  await request(a).get('/no/such/path/1');
  await request(a).get('/no/such/path/2');
  assert.match(await registry.metrics(), /route="unmatched",status="4xx"\} 2/);
});

test('/metrics is open without a token and protected with one', async () => {
  const a = app();
  delete process.env.METRICS_TOKEN;
  assert.equal((await request(a).get('/metrics')).status, 200);
  process.env.METRICS_TOKEN = 's3cret';
  assert.equal((await request(a).get('/metrics')).status, 401);
  assert.equal((await request(a).get('/metrics').set('Authorization', 'Bearer wrong')).status, 401);
  const ok = await request(a).get('/metrics').set('Authorization', 'Bearer s3cret');
  assert.equal(ok.status, 200);
  assert.match(ok.text, /http_request_duration_seconds/);
  delete process.env.METRICS_TOKEN;
});

test('scraping /metrics does not count itself', async () => {
  const a = app();
  await request(a).get('/metrics');
  assert.ok(!/route="\/metrics"/.test(await registry.metrics()));
});

test('llm counter records outcomes per provider', async () => {
  llmCalls.inc({ provider: 'test-provider', outcome: 'failure' });
  assert.match(await registry.metrics(), /llm_calls_total\{provider="test-provider",outcome="failure"\} 1/);
});

test('routeLabel handles missing route', () => {
  assert.equal(routeLabel({}), 'unmatched');
});

test('circuit breaker feeds the LLM metrics, including the cooldown gauge', async () => {
  const { recordLlmProviderFailure, recordLlmProviderSuccess, resetLlmCircuitForTests } = await import('../services/llmCircuitBreaker.js');
  resetLlmCircuitForTests();
  for (let i = 0; i < 3; i++) recordLlmProviderFailure('groq');
  let text = await registry.metrics();
  assert.match(text, /llm_calls_total\{provider="groq",outcome="failure"\} 3/);
  assert.match(text, /llm_provider_in_cooldown\{provider="groq"\} 1/);
  recordLlmProviderSuccess('groq');
  text = await registry.metrics();
  assert.match(text, /llm_provider_in_cooldown\{provider="groq"\} 0/);
  assert.match(text, /llm_calls_total\{provider="groq",outcome="success"\} 1/);
});
