/**
 * llmHealth.js — startup self-test for the LLM provider chain.
 *
 * Each enabled provider gets one tiny JSON request. The result is logged per provider and exported
 * as the `llm_provider_up` gauge, and a loud error is logged when NO provider works. This is what
 * would have caught the retired model ids (they 404'd silently for weeks behind the fallback chain).
 */
import { buildProviders, orderProviders } from './llmProviders.js';
import { llmUp } from '../observability/metrics.js';

/**
 * @param {{ providers?: any[], timeoutMs?: number, log?: (line: string) => void }} [opts]
 * @returns {Promise<{ results: { id: string, ok: boolean, ms: number, error?: string }[], healthy: number, configured: number }>}
 */
export async function selfTestProviders({ providers, timeoutMs = 20000, log = console.log } = {}) {
  const list = (providers || orderProviders(buildProviders())).filter((p) => p.enabled());
  const results = await Promise.all(
    list.map(async (p) => {
      const started = Date.now();
      try {
        const { text } = await p.call({ system: 'Return ONLY JSON.', user: 'Return {"ok":true}', temperature: 0, timeoutMs });
        JSON.parse(String(text).replace(/```json|```/gi, '').trim());
        llmUp.set({ provider: p.id }, 1);
        return { id: p.id, ok: true, ms: Date.now() - started };
      } catch (e) {
        llmUp.set({ provider: p.id }, 0);
        return { id: p.id, ok: false, ms: Date.now() - started, error: String(e.message).slice(0, 160) };
      }
    }),
  );
  const healthy = results.filter((r) => r.ok).length;
  for (const r of results) log(JSON.stringify({ level: r.ok ? 'info' : 'warn', msg: 'llm_selftest', provider: r.id, ok: r.ok, ms: r.ms, error: r.error }));
  if (results.length === 0) log(JSON.stringify({ level: 'error', msg: 'llm_selftest', error: 'NO LLM provider is configured: AI features will use fallbacks only' }));
  else if (healthy === 0) log(JSON.stringify({ level: 'error', msg: 'llm_selftest', error: 'EVERY configured LLM provider failed its self-test', configured: results.length }));
  return { results, healthy, configured: results.length };
}
