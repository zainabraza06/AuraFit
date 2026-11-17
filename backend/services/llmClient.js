/**
 * Multi-provider JSON completions.
 *
 * Providers live in llmProviders.js; this file runs them in order with, per call:
 *   - a timeout (per feature),
 *   - the circuit breaker (skip providers in cooldown; trip immediately on HTTP 429),
 *   - optional output validation (a provider that returns invalid JSON/shape is skipped to the next),
 *   - Prometheus latency + token metrics and one structured log line.
 * Tests can swap the whole provider list with setProvidersForTests().
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  canUseLlmProvider,
  recordLlmProviderFailure,
  recordLlmProviderSuccess
} from './llmCircuitBreaker.js';
import { bumpMetric, logRecommendationEvent } from './recommendationMetrics.js';
import { buildProviders, orderProviders, geminiModelChain } from './llmProviders.js';
import { llmDuration, llmTokens } from '../observability/metrics.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);

/** Per-feature timeouts: interactive features fail fast, batch enrichment may wait longer. */
export const FEATURE_TIMEOUTS_MS = {
  intent: 12000,
  rank: 25000,
  outfit: 25000,
  enrich: 45000,
  default: DEFAULT_TIMEOUT_MS,
};

let providerOverride = null;
/** Test seam: replace providers with fakes. Pass null to restore the real ones. */
export function setProvidersForTests(list) {
  providerOverride = list;
}

function activeProviders() {
  const all = providerOverride || orderProviders(buildProviders());
  return all.filter((p) => p.enabled());
}

function stripFences(text) {
  let t = text;
  if (t.includes('```')) t = t.replace(/```json/gi, '').replace(/```/g, '').trim();
  return t;
}

/** Parse model output as JSON (tolerating code fences). Throws on failure. */
export function parseJsonLoose(text) {
  return JSON.parse(stripFences(String(text).trim()));
}

/**
 * Run the provider chain until one returns acceptable output.
 * @param {{ system: string, user: string, temperature?: number, feature?: string, timeoutMs?: number,
 *           validate?: (parsed: any) => any }} opts
 *   validate: receives the parsed JSON, returns the (possibly normalised) value or throws.
 * @returns {Promise<{ text: string, provider: string, value?: any }>}
 */
async function runChain(opts) {
  const { system, user, temperature = 0.1, feature = 'default', validate } = opts;
  const timeoutMs = opts.timeoutMs || FEATURE_TIMEOUTS_MS[feature] || FEATURE_TIMEOUTS_MS.default;
  const tried = [];

  for (const p of activeProviders()) {
    if (!canUseLlmProvider(p.id)) {
      bumpMetric(`llm_${p.id.startsWith('gemini') ? 'gemini' : p.id}_skipped_cooldown`);
      logRecommendationEvent({ event: 'llm_provider_skipped', provider: p.id });
      continue;
    }
    const started = Date.now();
    try {
      const { text, usage } = await p.call({ system, user, temperature, timeoutMs });
      const seconds = (Date.now() - started) / 1000;
      let value;
      if (validate) {
        try {
          value = validate(parseJsonLoose(text));
        } catch (ve) {
          // The provider answered but not in the shape we need: try the next one, don't punish the breaker.
          llmDuration.observe({ provider: p.id, feature, outcome: 'invalid' }, seconds);
          tried.push(`${p.id}: invalid output (${ve.message})`.slice(0, 160));
          continue;
        }
      }
      llmDuration.observe({ provider: p.id, feature, outcome: 'success' }, seconds);
      if (usage?.input) llmTokens.inc({ provider: p.id, feature, direction: 'input' }, usage.input);
      if (usage?.output) llmTokens.inc({ provider: p.id, feature, direction: 'output' }, usage.output);
      recordLlmProviderSuccess(p.id);
      logRecommendationEvent({ event: 'llm_call', provider: p.id, feature, ms: Date.now() - started, tokensIn: usage?.input, tokensOut: usage?.output });
      return { text: text.trim(), provider: p.id, value };
    } catch (e) {
      llmDuration.observe({ provider: p.id, feature, outcome: 'failure' }, (Date.now() - started) / 1000);
      // 429 / 5xx on a provider: stop hammering it, honour Retry-After when given.
      if (e.status === 429) recordLlmProviderFailure(p.id, { immediate: true, cooldownMs: e.retryAfterMs || 60_000 });
      else recordLlmProviderFailure(p.id);
      tried.push(`${p.id}: ${e.message}`.slice(0, 160));
      console.warn(`[llmClient] ${p.id} failed:`, e.message);
    }
  }

  const err = new Error('All LLM providers failed or no API keys configured');
  err.tried = tried;
  throw err;
}

/**
 * Try providers in order until one returns text (caller parses JSON).
 * @param {{ system: string, user: string, temperature?: number, feature?: string, timeoutMs?: number, validate?: (parsed:any)=>any }} opts
 * @returns {Promise<{ text: string, provider: string, value?: any }>}
 */
export async function completeJsonWithProviderFallback(opts) {
  try {
    return await runChain(opts);
  } catch (e) {
    logger.error('llm', 'All LLM providers exhausted (completeJson)', { prompt: opts.user?.slice(0, 300), tried: e.tried });
    throw e;
  }
}

/**
 * Intent parsing: user message is separate from the system prompt (two-part chat shape).
 * @param {string} message user text
 * @param {string} prompt system / instructions
 */
export async function parseIntentWithProviderOrder(message, prompt) {
  try {
    const { text } = await runChain({
      system: `${prompt}\nReturn ONLY a valid JSON object.`,
      user: message,
      temperature: 0.1,
      feature: 'intent',
      validate: (o) => {
        if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not a JSON object');
        return o;
      },
    });
    return parseJsonLoose(text);
  } catch (e) {
    logger.error('llm', 'All LLM providers exhausted (parseIntent)', { message: message?.slice(0, 300), tried: e.tried });
    throw new Error('All AI providers exhausted or failed.');
  }
}

// ─── Vision (image analysis) ────────────────────────────────────────────────────

async function callGeminiVision(modelName, prompt, imageBase64, mimeType, temperature = 0.1) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: 'application/json', temperature }
  });
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: imageBase64, mimeType } }
  ]);
  const text = result.response.text();
  if (!text) throw new Error('Gemini vision empty response');
  return text;
}

/**
 * Analyze an image with a text prompt, trying vision-capable providers in order:
 * the current Gemini flash models. Returns parsed JSON.
 * @param {{ prompt: string, imageBase64: string, mimeType: string }} opts
 * @returns {Promise<{ data: object, provider: string }>}
 */
export async function analyzeImageWithProviderFallback(opts) {
  const { prompt, imageBase64, mimeType } = opts;

  if (process.env.GEMINI_API_KEY) {
    for (const modelName of geminiModelChain()) {
      if (!canUseLlmProvider(modelName)) continue;
      const started = Date.now();
      try {
        const text = await callGeminiVision(modelName, prompt, imageBase64, mimeType, 0.2);
        llmDuration.observe({ provider: modelName, feature: 'vision', outcome: 'success' }, (Date.now() - started) / 1000);
        recordLlmProviderSuccess(modelName);
        return { data: parseJsonLoose(text), provider: modelName };
      } catch (e) {
        llmDuration.observe({ provider: modelName, feature: 'vision', outcome: 'failure' }, (Date.now() - started) / 1000);
        recordLlmProviderFailure(modelName);
        console.warn(`[llmClient] ${modelName} vision failed:`, e.message);
      }
    }
  }

  throw new Error('All vision providers failed or no API keys configured');
}
