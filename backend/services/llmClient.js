/**
 * Multi-provider JSON completions.
 * Priority: OpenRouter → Groq → Gemini 1.5 Flash → Gemini 2.5 Flash
 * Per-provider circuit breaker skips providers in cooldown after repeated failures.
 */
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  canUseLlmProvider,
  recordLlmProviderFailure,
  recordLlmProviderSuccess
} from './llmCircuitBreaker.js';
import { bumpMetric, logRecommendationEvent } from './recommendationMetrics.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function openRouterHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://aurafit.local',
    'X-Title': process.env.OPENROUTER_APP_TITLE || 'AuraFit'
  };
}

async function callOpenRouter(system, user, temperature = 0.1) {
  const model = process.env.OPENROUTER_MODEL || 'google/gemma-2-9b-it:free';
  const { data } = await axios.post(
    OPENROUTER_URL,
    {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature
    },
    { headers: openRouterHeaders(), timeout: 60000 }
  );
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter empty response');
  return text;
}

async function callGroq(system, user, temperature = 0.1) {
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const { data } = await axios.post(
    GROQ_URL,
    {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature,
      response_format: { type: 'json_object' }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq empty response');
  return text;
}

async function callGemini(modelName, combinedPrompt, temperature = 0.1) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: 'application/json', temperature }
  });
  const result = await model.generateContent(combinedPrompt);
  const text = result.response.text();
  if (!text) throw new Error('Gemini empty response');
  return text;
}

/**
 * Try providers in order until one returns text (caller parses JSON).
 * @param {{ system: string, user: string, temperature?: number }} opts
 * @returns {{ text: string, provider: string }}
 */
export async function completeJsonWithProviderFallback(opts) {
  const { system, user, temperature = 0.1 } = opts;
  const combined = `${system}\n\n${user}`;

  if (
    process.env.OPENROUTER_API_KEY &&
    process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here'
  ) {
    if (!canUseLlmProvider('openrouter')) {
      bumpMetric('llm_openrouter_skipped_cooldown');
      logRecommendationEvent({ event: 'llm_provider_skipped', provider: 'openrouter' });
    } else {
      try {
        const text = await callOpenRouter(system, user, temperature);
        recordLlmProviderSuccess('openrouter');
        return { text: text.trim(), provider: 'openrouter' };
      } catch (e) {
        recordLlmProviderFailure('openrouter');
        console.warn('[llmClient] OpenRouter failed:', e.message);
      }
    }
  }

  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
    if (!canUseLlmProvider('groq')) {
      bumpMetric('llm_groq_skipped_cooldown');
      logRecommendationEvent({ event: 'llm_provider_skipped', provider: 'groq' });
    } else {
      try {
        const text = await callGroq(system, user, temperature);
        recordLlmProviderSuccess('groq');
        return { text: text.trim(), provider: 'groq' };
      } catch (e) {
        recordLlmProviderFailure('groq');
        console.warn('[llmClient] Groq failed:', e.message);
      }
    }
  }

  if (process.env.GEMINI_API_KEY) {
    for (const modelName of ['gemini-1.5-flash', 'gemini-2.5-flash']) {
      if (!canUseLlmProvider(modelName)) {
        bumpMetric('llm_gemini_skipped_cooldown');
        logRecommendationEvent({ event: 'llm_provider_skipped', provider: modelName });
        continue;
      }
      try {
        const text = await callGemini(modelName, combined, temperature);
        recordLlmProviderSuccess(modelName);
        return { text: text.trim(), provider: modelName };
      } catch (e) {
        recordLlmProviderFailure(modelName);
        console.warn(`[llmClient] ${modelName} failed:`, e.message);
      }
    }
  }

  throw new Error('All LLM providers failed or no API keys configured');
}

/**
 * Intent parsing: user message is separate from the system prompt (two-part chat shape).
 * @param {string} message user text
 * @param {string} prompt system / instructions
 */
export async function parseIntentWithProviderOrder(message, prompt) {
  const system = `${prompt}\nReturn ONLY a valid JSON object.`;
  const user = message;

  if (
    process.env.OPENROUTER_API_KEY &&
    process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here'
  ) {
    if (!canUseLlmProvider('openrouter')) {
      bumpMetric('llm_openrouter_skipped_cooldown');
    } else {
      try {
        const text = await callOpenRouter(system, user, 0.1);
        recordLlmProviderSuccess('openrouter');
        console.log('Intent parsed by: OpenRouter');
        return JSON.parse(stripFences(text));
      } catch (e) {
        recordLlmProviderFailure('openrouter');
        console.warn('OpenRouter intent parse failed:', e.message);
      }
    }
  }

  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
    if (!canUseLlmProvider('groq')) {
      bumpMetric('llm_groq_skipped_cooldown');
    } else {
      try {
        const text = await callGroq(system, user, 0.1);
        recordLlmProviderSuccess('groq');
        console.log('Intent parsed by: Groq');
        return JSON.parse(stripFences(text));
      } catch (e) {
        recordLlmProviderFailure('groq');
        console.warn('Groq intent parse failed:', e.message);
      }
    }
  }

  if (process.env.GEMINI_API_KEY) {
    const combined = `${prompt}\n\nUser Request: "${message}"`;
    for (const modelName of ['gemini-1.5-flash', 'gemini-2.5-flash']) {
      if (!canUseLlmProvider(modelName)) {
        bumpMetric('llm_gemini_skipped_cooldown');
        continue;
      }
      try {
        const text = await callGemini(modelName, combined, 0.1);
        recordLlmProviderSuccess(modelName);
        console.log(`Intent parsed by: ${modelName}`);
        return JSON.parse(stripFences(text));
      } catch (e) {
        recordLlmProviderFailure(modelName);
        console.warn(`${modelName} intent parse failed:`, e.message);
      }
    }
  }

  throw new Error('All AI providers exhausted or failed.');
}

function stripFences(text) {
  let t = text;
  if (t.includes('```')) t = t.replace(/```json/gi, '').replace(/```/g, '').trim();
  return t;
}
