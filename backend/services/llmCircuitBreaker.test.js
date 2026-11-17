import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { canUseLlmProvider, recordLlmProviderFailure, recordLlmProviderSuccess, resetLlmCircuitForTests } from './llmCircuitBreaker.js';

beforeEach(() => resetLlmCircuitForTests());

test('provider stays usable below the failure threshold', () => {
  recordLlmProviderFailure('p'); recordLlmProviderFailure('p');
  assert.equal(canUseLlmProvider('p'), true);
});

test('three consecutive failures open the circuit (regression: counter used to reset every call)', () => {
  for (let i = 0; i < 3; i++) recordLlmProviderFailure('p');
  assert.equal(canUseLlmProvider('p'), false);
  assert.equal(canUseLlmProvider('other'), true, 'other providers are unaffected');
});

test('a success in between resets the count', () => {
  recordLlmProviderFailure('p'); recordLlmProviderFailure('p');
  recordLlmProviderSuccess('p');
  recordLlmProviderFailure('p'); recordLlmProviderFailure('p');
  assert.equal(canUseLlmProvider('p'), true);
});

test('circuit closes again after the cooldown elapses', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  for (let i = 0; i < 3; i++) recordLlmProviderFailure('p');
  assert.equal(canUseLlmProvider('p'), false);
  t.mock.timers.setTime(1_000_000 + 61_000);
  assert.equal(canUseLlmProvider('p'), true);
  recordLlmProviderFailure('p'); // first failure after recovery starts a fresh count
  assert.equal(canUseLlmProvider('p'), true);
});

// ── shared (Redis) layer ─────────────────────────────────────────────────────
import { enableSharedCircuit, syncSharedCooldowns } from './llmCircuitBreaker.js';

function fakeRedis() {
  const kv = new Map();
  return {
    kv,
    set: async (k, v, _px, ms) => { kv.set(k, { v, until: Date.now() + ms }); return 'OK'; },
    mget: async (keys) => keys.map((k) => { const e = kv.get(k); return e && e.until > Date.now() ? e.v : null; }),
  };
}

test('a cooldown tripped on one instance is seen by another through Redis', async () => {
  const redis = fakeRedis();
  enableSharedCircuit(redis, { providerIds: ['groq'], intervalMs: 3_600_000 });
  for (let i = 0; i < 3; i++) recordLlmProviderFailure('groq');
  await new Promise((r) => setImmediate(r));
  assert.ok(redis.kv.has('llm:cooldown:groq'), 'trip is published');

  // simulate a second instance: fresh local state, same Redis
  resetLlmCircuitForTests();
  assert.equal(canUseLlmProvider('groq'), true, 'a fresh instance does not know yet');
  enableSharedCircuit(redis, { providerIds: ['groq'], intervalMs: 3_600_000 });
  await syncSharedCooldowns(['groq']);
  assert.equal(canUseLlmProvider('groq'), false, 'it learns about the cooldown from Redis');
});

test('immediate trip honours a provider-specified cooldown (HTTP 429 Retry-After)', () => {
  recordLlmProviderFailure('mistral', { immediate: true, cooldownMs: 5000 });
  assert.equal(canUseLlmProvider('mistral'), false);
});

test('Redis errors never break local breaker behaviour', async () => {
  const broken = { set: async () => { throw new Error('down'); }, mget: async () => { throw new Error('down'); } };
  enableSharedCircuit(broken, { providerIds: ['p'], intervalMs: 3_600_000 });
  for (let i = 0; i < 3; i++) recordLlmProviderFailure('p');
  await syncSharedCooldowns(['p']);
  assert.equal(canUseLlmProvider('p'), false);
  assert.equal(canUseLlmProvider('q'), true);
});
