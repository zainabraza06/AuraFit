import test from 'node:test';
import assert from 'node:assert/strict';
import { selfTestProviders } from '../services/llmHealth.js';
import { registry } from '../observability/metrics.js';

const p = (id, impl) => ({ id, enabled: () => true, call: impl });

test('self-test reports healthy and broken providers and sets the up gauge', async () => {
  const lines = [];
  const r = await selfTestProviders({
    log: (l) => lines.push(JSON.parse(l)),
    providers: [
      p('good', async () => ({ text: '{"ok":true}' })),
      p('retired-model', async () => { throw new Error('HTTP 404: model not found'); }),
      p('garbage', async () => ({ text: 'sure! here you go' })),
      { id: 'disabled', enabled: () => false, call: async () => ({ text: '{}' }) },
    ],
  });
  assert.equal(r.configured, 3);
  assert.equal(r.healthy, 1);
  assert.deepEqual(r.results.map((x) => [x.id, x.ok]), [['good', true], ['retired-model', false], ['garbage', false]]);
  assert.match(r.results[1].error, /404/);
  const metrics = await registry.metrics();
  assert.match(metrics, /llm_provider_up\{provider="good"\} 1/);
  assert.match(metrics, /llm_provider_up\{provider="retired-model"\} 0/);
  assert.ok(!lines.some((l) => l.level === 'error'), 'one healthy provider is not an error');
});

test('self-test logs an error when every provider fails or none is configured', async () => {
  const lines = [];
  await selfTestProviders({ log: (l) => lines.push(JSON.parse(l)), providers: [p('a', async () => { throw new Error('x'); })] });
  assert.ok(lines.some((l) => l.level === 'error' && /EVERY/.test(l.error)));
  const none = [];
  await selfTestProviders({ log: (l) => none.push(JSON.parse(l)), providers: [] });
  assert.ok(none.some((l) => l.level === 'error' && /NO LLM provider/.test(l.error)));
});
