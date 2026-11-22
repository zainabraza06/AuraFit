/**
 * The shared circuit breaker against a REAL Redis (the unit tests use a fake). Skipped unless REDIS_TEST_URL is set:
 *   docker compose up -d redis && REDIS_TEST_URL=redis://localhost:6379 node --test services/llmCircuitBreaker.redis.test.js
 * The CI e2e job sets it.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import { canUseLlmProvider, recordLlmProviderFailure, resetLlmCircuitForTests, enableSharedCircuit, syncSharedCooldowns, disableSharedCircuit } from './llmCircuitBreaker.js';

const URL = process.env.REDIS_TEST_URL;
const skip = URL ? false : 'REDIS_TEST_URL not set';
const redis = URL ? new Redis(URL, { maxRetriesPerRequest: 1 }) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

after(async () => {
  disableSharedCircuit();
  if (redis) { await redis.del('llm:cooldown:redis-test-a', 'llm:cooldown:redis-test-b'); await redis.quit(); }
});

test('a cooldown tripped by one instance is seen by another through a real Redis', { skip }, async () => {
  await redis.del('llm:cooldown:redis-test-a');
  resetLlmCircuitForTests();
  enableSharedCircuit(redis, { providerIds: ['redis-test-a'], intervalMs: 3_600_000 });
  for (let i = 0; i < 3; i++) recordLlmProviderFailure('redis-test-a');
  await sleep(100);
  assert.ok(Number(await redis.get('llm:cooldown:redis-test-a')) > Date.now(), 'the trip is stored in Redis with a future deadline');
  assert.ok((await redis.pttl('llm:cooldown:redis-test-a')) > 0, 'and it has a TTL, so it cannot get stuck');

  resetLlmCircuitForTests(); // "another instance": no local memory of the failures
  enableSharedCircuit(redis, { providerIds: ['redis-test-a'], intervalMs: 3_600_000 });
  assert.equal(canUseLlmProvider('redis-test-a'), true, 'before syncing it does not know');
  await syncSharedCooldowns(['redis-test-a']);
  assert.equal(canUseLlmProvider('redis-test-a'), false, 'after syncing it skips the provider');
});

test('the cooldown expires on its own in Redis and the provider becomes usable again', { skip }, async () => {
  await redis.del('llm:cooldown:redis-test-b');
  resetLlmCircuitForTests();
  enableSharedCircuit(redis, { providerIds: ['redis-test-b'], intervalMs: 3_600_000 });
  recordLlmProviderFailure('redis-test-b', { immediate: true, cooldownMs: 400 });
  await sleep(100);
  resetLlmCircuitForTests();
  enableSharedCircuit(redis, { providerIds: ['redis-test-b'], intervalMs: 3_600_000 });
  await syncSharedCooldowns(['redis-test-b']);
  assert.equal(canUseLlmProvider('redis-test-b'), false);
  await sleep(500);
  await syncSharedCooldowns(['redis-test-b']);
  assert.equal(canUseLlmProvider('redis-test-b'), true, 'Redis dropped the key, so the shared cooldown is gone');
});
