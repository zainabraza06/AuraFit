/**
 * Skip an LLM provider for a cooldown after repeated failures (controlled degradation).
 */
const COOLDOWN_MS = Number(process.env.LLM_PROVIDER_COOLDOWN_MS || 60_000);
const FAILURES_BEFORE_COOLDOWN = Number(process.env.LLM_PROVIDER_FAIL_THRESHOLD || 3);

/** @type {Record<string, { consecutiveFailures: number; cooldownUntil: number }>} */
const state = Object.create(null);

export function canUseLlmProvider(providerId) {
  const h = state[providerId];
  if (!h) return true;
  return Date.now() >= (h.cooldownUntil || 0);
}

/** @param {string} providerId */
export function recordLlmProviderSuccess(providerId) {
  state[providerId] = { consecutiveFailures: 0, cooldownUntil: 0 };
}

/** @param {string} providerId */
export function recordLlmProviderFailure(providerId) {
  const now = Date.now();
  let h = state[providerId] || { consecutiveFailures: 0, cooldownUntil: 0 };
  if (now >= h.cooldownUntil) h.consecutiveFailures = 0;
  h.consecutiveFailures += 1;
  if (h.consecutiveFailures >= FAILURES_BEFORE_COOLDOWN) {
    h.cooldownUntil = now + COOLDOWN_MS;
    h.consecutiveFailures = 0;
  }
  state[providerId] = h;
}

export function resetLlmCircuitForTests() {
  for (const k of Object.keys(state)) delete state[k];
}
