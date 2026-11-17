import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { completeJsonWithProviderFallback, parseIntentWithProviderOrder, setProvidersForTests, parseJsonLoose } from '../services/llmClient.js';
import { resetLlmCircuitForTests, canUseLlmProvider } from '../services/llmCircuitBreaker.js';
import { buildProviders, orderProviders, geminiModelChain } from '../services/llmProviders.js';
import { registry } from '../observability/metrics.js';

const fake = (id, impl) => ({ id, enabled: () => true, call: impl });
const ok = (text, usage) => async () => ({ text, usage });

beforeEach(() => resetLlmCircuitForTests());
afterEach(() => setProvidersForTests(null));

test('uses the first healthy provider and reports which one answered', async () => {
  setProvidersForTests([fake('a', ok('{"x":1}')), fake('b', ok('{"x":2}'))]);
  const r = await completeJsonWithProviderFallback({ system: 's', user: 'u' });
  assert.equal(r.provider, 'a');
  assert.equal(r.text, '{"x":1}');
});

test('falls through failing providers and records the failure', async () => {
  setProvidersForTests([fake('a', async () => { throw new Error('boom'); }), fake('b', ok('{"x":2}'))]);
  const r = await completeJsonWithProviderFallback({ system: 's', user: 'u' });
  assert.equal(r.provider, 'b');
});

test('HTTP 429 trips the breaker immediately and the provider is skipped afterwards', async () => {
  let calls = 0;
  const limited = fake('limited', async () => { calls++; throw Object.assign(new Error('rate limited'), { status: 429, retryAfterMs: 5000 }); });
  setProvidersForTests([limited, fake('b', ok('{"ok":true}'))]);
  await completeJsonWithProviderFallback({ system: 's', user: 'u' });
  await completeJsonWithProviderFallback({ system: 's', user: 'u' });
  assert.equal(calls, 1, 'second request must not call the rate-limited provider');
  assert.equal(canUseLlmProvider('limited'), false);
});

test('validate: invalid output moves to the next provider WITHOUT tripping the breaker', async () => {
  const validate = (o) => { if (!Array.isArray(o.rankings)) throw new Error('no rankings'); return o; };
  setProvidersForTests([fake('sloppy', ok('{"nope":1}')), fake('good', ok('{"rankings":[1]}'))]);
  for (let i = 0; i < 4; i++) {
    const r = await completeJsonWithProviderFallback({ system: 's', user: 'u', validate });
    assert.equal(r.provider, 'good');
    assert.deepEqual(r.value, { rankings: [1] });
  }
  assert.equal(canUseLlmProvider('sloppy'), true, 'bad shape is a quality issue, not an outage');
});

test('throws with the list of what was tried when every provider fails', async () => {
  setProvidersForTests([fake('a', async () => { throw new Error('x'); }), fake('b', async () => { throw new Error('y'); })]);
  await assert.rejects(() => completeJsonWithProviderFallback({ system: 's', user: 'u' }), (e) => e.tried.length === 2 && /All LLM providers failed/.test(e.message));
});

test('a provider that exceeds nothing but is disabled is never called', async () => {
  let called = false;
  setProvidersForTests([{ id: 'off', enabled: () => false, call: async () => { called = true; return { text: '{}' }; } }, fake('on', ok('{"a":1}'))]);
  const r = await completeJsonWithProviderFallback({ system: 's', user: 'u' });
  assert.equal(r.provider, 'on');
  assert.equal(called, false);
});

test('parseIntent returns a JSON object, tolerating code fences, and rejects non-objects', async () => {
  setProvidersForTests([fake('a', ok('```json\n{"color":"red"}\n```'))]);
  assert.deepEqual(await parseIntentWithProviderOrder('red dress', 'prompt'), { color: 'red' });
  setProvidersForTests([fake('a', ok('[1,2]')), fake('b', ok('{"color":"blue"}'))]);
  assert.deepEqual(await parseIntentWithProviderOrder('blue', 'prompt'), { color: 'blue' });
});

test('token usage and latency are exported as Prometheus metrics', async () => {
  setProvidersForTests([fake('metered', ok('{"a":1}', { input: 120, output: 30 }))]);
  await completeJsonWithProviderFallback({ system: 's', user: 'u', feature: 'rank' });
  const text = await registry.metrics();
  assert.match(text, /llm_tokens_total\{provider="metered",feature="rank",direction="input"\} 120/);
  assert.match(text, /llm_tokens_total\{provider="metered",feature="rank",direction="output"\} 30/);
  assert.match(text, /llm_call_duration_seconds_count\{provider="metered",feature="rank",outcome="success"\} 1/);
});

test('parseJsonLoose strips fences', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonLoose('not json'));
});

test('provider registry: only configured providers are enabled; Ollama is opt-in; order is configurable', () => {
  const env = { GROQ_API_KEY: 'k', GEMINI_API_KEY: 'k', OPENROUTER_API_KEY: 'your_openrouter_api_key_here' };
  const enabled = buildProviders(env).filter((p) => p.enabled()).map((p) => p.id);
  assert.ok(enabled.includes('groq') && enabled.includes('gemini-3.5-flash-lite'));
  assert.ok(!enabled.includes('openrouter'), 'placeholder key is not a real key');
  assert.ok(!enabled.includes('mistral') && !enabled.includes('ollama'));
  assert.ok(buildProviders({ ...env, OLLAMA_URL: 'http://localhost:11434' }).some((p) => p.id === 'ollama' && p.enabled()));

  const ordered = orderProviders(buildProviders(env), { LLM_PROVIDER_ORDER: 'gemini,groq' }).map((p) => p.id);
  assert.ok(ordered.indexOf('gemini-3.5-flash-lite') < ordered.indexOf('groq'));
  assert.deepEqual(geminiModelChain({ GEMINI_FALLBACK_MODELS: 'a, b' }), ['a', 'b']);
});

test('default model ids are not the retired ones', () => {
  const ids = buildProviders({}).map((p) => p.id).join(' ');
  assert.ok(!/gemini-2\.0|gemini-1\.5|gemini-2\.5/.test(ids));
});
