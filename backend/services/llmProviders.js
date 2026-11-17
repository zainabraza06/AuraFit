/**
 * llmProviders.js — text-completion providers behind one interface.
 *
 * Each provider: { id, enabled(env), call({ system, user, temperature, timeoutMs, signal }) -> { text, usage } }
 *   usage = { input, output } tokens as reported by the provider (undefined when not reported).
 * Errors carry `.status` (HTTP) and `.retryAfterMs` when the provider asked us to back off.
 *
 * Model ids are env-overridable. The defaults below were verified against each provider's live model
 * list (see docs/PLAN.md 3.0); the old defaults (llama-3.1-8b-instant, gemini-2.0-flash,
 * llama-3.2-3b-instruct:free) had all been retired and silently 404'd.
 */
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

const isRealKey = (k, placeholder) => Boolean(k) && k !== placeholder;

function wrapHttpError(err, label) {
  const status = err.response?.status;
  const detail = err.response?.data?.error?.message || err.response?.data?.message || err.message;
  const e = new Error(`${label}${status ? ` HTTP ${status}` : ''}: ${String(detail).slice(0, 160)}`);
  e.status = status;
  const ra = Number(err.response?.headers?.['retry-after']);
  if (ra > 0) e.retryAfterMs = ra * 1000;
  return e;
}

/** OpenAI-compatible chat completions (Mistral, Groq, OpenRouter, Ollama's /v1). */
async function openAiChat({ label, url, headers, body, timeoutMs, signal }) {
  try {
    const { data } = await axios.post(url, body, { headers, timeout: timeoutMs, signal });
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${label} empty response`);
    return { text, usage: { input: data?.usage?.prompt_tokens, output: data?.usage?.completion_tokens } };
  } catch (err) {
    throw err.response ? wrapHttpError(err, label) : err;
  }
}

const messages = (system, user) => [{ role: 'system', content: system }, { role: 'user', content: user }];

// Mistral's free tier allows ~1 request/second: throttle globally.
let mistralNextAt = 0;
async function mistralThrottle() {
  const wait = Math.max(0, mistralNextAt - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  mistralNextAt = Date.now() + 1100;
}

export function geminiModelChain(env = process.env) {
  const raw = env.GEMINI_FALLBACK_MODELS;
  if (raw?.trim()) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
}

export function buildProviders(env = process.env) {
  const providers = [];

  providers.push({
    id: 'groq',
    enabled: () => isRealKey(env.GROQ_API_KEY, 'your_groq_api_key_here'),
    call: ({ system, user, temperature, timeoutMs, signal }) =>
      openAiChat({
        label: 'Groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: { model: env.GROQ_MODEL || 'openai/gpt-oss-20b', messages: messages(system, user), temperature, response_format: { type: 'json_object' } },
        timeoutMs, signal,
      }),
  });

  for (const model of geminiModelChain(env)) {
    providers.push({
      id: model,
      enabled: () => isRealKey(env.GEMINI_API_KEY),
      async call({ system, user, temperature, timeoutMs }) {
        const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
        const m = genAI.getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json', temperature } });
        const result = await Promise.race([
          m.generateContent(`${system}\n\n${user}`),
          new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${model} timed out`), { status: 504 })), timeoutMs)),
        ]);
        const text = result.response.text();
        if (!text) throw new Error(`${model} empty response`);
        const u = result.response.usageMetadata;
        return { text, usage: { input: u?.promptTokenCount, output: u?.candidatesTokenCount } };
      },
    });
  }

  providers.push({
    id: 'mistral',
    enabled: () => isRealKey(env.MISTRAL_API_KEY, 'your_mistral_api_key_here'),
    async call({ system, user, temperature, timeoutMs, signal }) {
      await mistralThrottle();
      return openAiChat({
        label: 'Mistral',
        url: 'https://api.mistral.ai/v1/chat/completions',
        headers: { Authorization: `Bearer ${env.MISTRAL_API_KEY}` },
        body: { model: env.MISTRAL_MODEL || 'mistral-small-latest', messages: messages(system, user), temperature, response_format: { type: 'json_object' } },
        timeoutMs, signal,
      });
    },
  });

  providers.push({
    id: 'openrouter',
    enabled: () => isRealKey(env.OPENROUTER_API_KEY, 'your_openrouter_api_key_here'),
    call: ({ system, user, temperature, timeoutMs, signal }) =>
      openAiChat({
        label: 'OpenRouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': env.OPENROUTER_HTTP_REFERER || 'https://aurafit.local',
          'X-Title': env.OPENROUTER_APP_TITLE || 'AuraFit',
        },
        body: { model: env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free', messages: messages(system, user), temperature },
        timeoutMs, signal,
      }),
  });

  // Local model for development and offline tests: OLLAMA_URL=http://localhost:11434
  providers.push({
    id: 'ollama',
    enabled: () => Boolean(env.OLLAMA_URL),
    call: ({ system, user, temperature, timeoutMs, signal }) =>
      openAiChat({
        label: 'Ollama',
        url: `${env.OLLAMA_URL.replace(/\/$/, '')}/v1/chat/completions`,
        headers: {},
        body: { model: env.OLLAMA_MODEL || 'qwen3:8b', messages: messages(system, user), temperature, response_format: { type: 'json_object' } },
        timeoutMs, signal,
      }),
  });

  return providers;
}

/**
 * Provider order. LLM_PROVIDER_ORDER="groq,gemini,mistral,openrouter,ollama" ("gemini" expands to its model chain).
 * Default puts providers that were verified working first.
 */
export function orderProviders(providers, env = process.env) {
  const order = (env.LLM_PROVIDER_ORDER || 'ollama,groq,gemini,openrouter,mistral').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const groupOf = (p) => (p.id.startsWith('gemini') ? 'gemini' : p.id);
  const rank = (p) => { const i = order.indexOf(groupOf(p)); return i === -1 ? order.length : i; };
  return [...providers].sort((a, b) => rank(a) - rank(b)); // stable: keeps the Gemini model order
}
