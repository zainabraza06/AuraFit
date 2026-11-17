/**
 * Skip an LLM provider for a cooldown after repeated failures (controlled degradation).
 *
 * State is per-process, plus an OPTIONAL shared layer in Redis: when one API instance trips a provider,
 * it writes `llm:cooldown:<id>` with a TTL, and every instance polls those keys, so a dead provider is
 * skipped fleet-wide after one instance notices instead of each instance burning its own 3 failures.
 * The shared layer is best-effort: Redis errors are swallowed and local behaviour is unchanged.
 */
import { llmCalls, llmCooldown } from '../observability/metrics.js';

const COOLDOWN_MS = Number(process.env.LLM_PROVIDER_COOLDOWN_MS || 60_000);
const FAILURES_BEFORE_COOLDOWN = Number(process.env.LLM_PROVIDER_FAIL_THRESHOLD || 3);
const KEY = (id) => `llm:cooldown:${id}`;

/** @type {Record<string, { consecutiveFailures: number; cooldownUntil: number }>} */
const state = Object.create(null);
/** Cooldowns learned from other instances: providerId -> epoch ms. */
const sharedUntil = Object.create(null);

let shared = null; // { redis, timer }

export function canUseLlmProvider(providerId) {
  const now = Date.now();
  if (now < (sharedUntil[providerId] || 0)) return false;
  const h = state[providerId];
  if (!h) return true;
  return now >= (h.cooldownUntil || 0);
}

/** @param {string} providerId */
export function recordLlmProviderSuccess(providerId) {
  llmCalls.inc({ provider: providerId, outcome: 'success' });
  llmCooldown.set({ provider: providerId }, 0);
  state[providerId] = { consecutiveFailures: 0, cooldownUntil: 0 };
}

function publishCooldown(providerId, ms) {
  if (!shared) return;
  shared.redis.set(KEY(providerId), String(Date.now() + ms), 'PX', ms).catch(() => {});
}

/**
 * @param {string} providerId
 * @param {{ cooldownMs?: number, immediate?: boolean }} [opts] immediate = trip now (e.g. HTTP 429 with Retry-After)
 */
export function recordLlmProviderFailure(providerId, opts = {}) {
  const now = Date.now();
  llmCalls.inc({ provider: providerId, outcome: 'failure' });
  let h = state[providerId] || { consecutiveFailures: 0, cooldownUntil: 0 };
  // Start a fresh count only once a cooldown has actually ended. (Before: `now >= cooldownUntil` was
  // true for every fresh provider (cooldownUntil = 0), so the counter reset on each failure and the
  // breaker never tripped.)
  if (h.cooldownUntil && now >= h.cooldownUntil) {
    h.consecutiveFailures = 0;
    h.cooldownUntil = 0;
    llmCooldown.set({ provider: providerId }, 0);
  }
  h.consecutiveFailures += 1;
  if (opts.immediate || h.consecutiveFailures >= FAILURES_BEFORE_COOLDOWN) {
    const ms = opts.cooldownMs || COOLDOWN_MS;
    h.cooldownUntil = now + ms;
    llmCooldown.set({ provider: providerId }, 1);
    h.consecutiveFailures = 0;
    publishCooldown(providerId, ms);
  }
  state[providerId] = h;
}

/** Pull cooldowns written by other instances. Exposed for tests; normally driven by the poll timer. */
export async function syncSharedCooldowns(providerIds) {
  if (!shared) return;
  try {
    const ids = providerIds || Object.keys({ ...state, ...sharedUntil });
    if (!ids.length) return;
    const values = await shared.redis.mget(ids.map(KEY));
    ids.forEach((id, i) => {
      const until = Number(values[i]) || 0;
      sharedUntil[id] = until;
      if (until > Date.now()) llmCooldown.set({ provider: id }, 1);
    });
  } catch {
    // Redis trouble: keep whatever we already know
  }
}

/**
 * Turn on cross-instance sharing.
 * @param {any} redis ioredis-compatible client
 * @param {{ providerIds: string[], intervalMs?: number }} opts
 */
export function enableSharedCircuit(redis, { providerIds, intervalMs = 3000 } = { providerIds: [] }) {
  disableSharedCircuit();
  shared = { redis, providerIds, timer: null };
  const tick = () => syncSharedCooldowns(providerIds);
  shared.timer = setInterval(tick, intervalMs);
  shared.timer.unref?.();
  tick();
}

export function disableSharedCircuit() {
  if (shared?.timer) clearInterval(shared.timer);
  shared = null;
}

export function resetLlmCircuitForTests() {
  for (const k of Object.keys(state)) delete state[k];
  for (const k of Object.keys(sharedUntil)) delete sharedUntil[k];
  disableSharedCircuit();
}
