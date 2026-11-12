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
