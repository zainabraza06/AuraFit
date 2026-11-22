// Generates dashboards/api.json. Run: node observability/grafana/build-api-dashboard.cjs
const ds = { type: 'prometheus', uid: 'prometheus' };
let id = 0;
const panel = (title, type, x, y, w, h, exprs, defaults = {}, extra = {}) => ({
  id: ++id, title, type, datasource: ds, gridPos: { x, y, w, h },
  targets: exprs.map(([expr, legendFormat], i) => ({ refId: String.fromCharCode(65 + i), expr, legendFormat: legendFormat || '', datasource: ds })),
  fieldConfig: { defaults, overrides: [] }, ...extra,
});
const steps = (...s) => ({ thresholds: { mode: 'absolute', steps: s.map(([color, value]) => ({ color, value })) } });
const neutral = { color: { mode: 'fixed', fixedColor: 'blue' }, ...steps(['blue', null]) };
const rate5m = 'rate(http_requests_total[5m])';

const dashboard = {
  uid: 'aurafit-api', title: 'AuraFit API and LLM', schemaVersion: 39, version: 1, refresh: '10s',
  time: { from: 'now-1h', to: 'now' }, tags: ['aurafit'],
  panels: [
    panel('Requests / sec', 'stat', 0, 0, 4, 4, [[`sum(${rate5m})`]], { unit: 'reqps', ...neutral }),
    panel('5xx error rate', 'stat', 4, 0, 4, 4, [['sum(rate(http_requests_total{status="5xx"}[5m])) / clamp_min(sum(rate(http_requests_total[5m])), 0.001)']], { unit: 'percentunit', ...steps(['green', null], ['orange', 0.01], ['red', 0.05]) }),
    panel('p95 latency', 'stat', 8, 0, 4, 4, [['histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))']], { unit: 's', ...steps(['green', null], ['orange', 1], ['red', 3]) }),
    panel('LLM failure ratio', 'stat', 12, 0, 4, 4, [['sum(rate(llm_calls_total{outcome="failure"}[10m])) / clamp_min(sum(rate(llm_calls_total[10m])), 0.001)']], { unit: 'percentunit', ...steps(['green', null], ['orange', 0.2], ['red', 0.5]) }),
    panel('LLM providers in cooldown', 'stat', 16, 0, 4, 4, [['sum(llm_provider_in_cooldown) or vector(0)']], { unit: 'none', ...steps(['green', null], ['red', 1]) }),
    panel('Event loop lag p99', 'stat', 20, 0, 4, 4, [['nodejs_eventloop_lag_p99_seconds']], { unit: 's', ...steps(['green', null], ['orange', 0.1], ['red', 0.5]) }),

    panel('Requests / sec by route (top 8)', 'timeseries', 0, 4, 12, 8, [[`topk(8, sum by (route) (${rate5m}))`, '{{route}}']], { unit: 'reqps' }),
    panel('Latency by route, p95 (top 8)', 'timeseries', 12, 4, 12, 8, [['topk(8, histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m]))))', '{{route}}']], { unit: 's' }),

    panel('Overall latency p50 / p95 / p99', 'timeseries', 0, 12, 12, 8, [
      ['histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', 'p50'],
      ['histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', 'p95'],
      ['histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', 'p99'],
    ], { unit: 's' }),
    panel('Errors by route (4xx / 5xx per sec)', 'timeseries', 12, 12, 12, 8, [['sum by (route, status) (rate(http_requests_total{status=~"4xx|5xx"}[5m]))', '{{route}} {{status}}']], { unit: 'reqps' }),

    panel('LLM calls by provider and outcome', 'timeseries', 0, 20, 12, 8, [['sum by (provider, outcome) (rate(llm_calls_total[5m]))', '{{provider}} {{outcome}}']], { unit: 'ops' }),
    panel('Fallbacks and skipped providers (app events)', 'timeseries', 12, 20, 12, 8, [['sum by (name) (rate(app_events_total[5m]))', '{{name}}']], { unit: 'ops' }),

    panel('Heap used / RSS', 'timeseries', 0, 28, 12, 8, [['nodejs_heap_size_used_bytes{job="api"}', 'heap used'], ['process_resident_memory_bytes{job="api"}', 'rss']], { unit: 'bytes' }),
    panel('CPU (cores) and event-loop lag', 'timeseries', 12, 28, 12, 8, [['rate(process_cpu_seconds_total{job="api"}[1m])', 'cpu cores'], ['nodejs_eventloop_lag_p99_seconds{job="api"}', 'loop lag p99 (s)']], {}),

    // ── LLM gateway, agent, feedback (added with the gateway/agent/feedback work) ──
    panel('LLM latency p95 by provider', 'timeseries', 0, 36, 12, 8, [['histogram_quantile(0.95, sum by (le, provider) (rate(llm_call_duration_seconds_bucket{outcome="success"}[10m])))', '{{provider}}']], { unit: 's' }),
    panel('LLM tokens / sec (input vs output)', 'timeseries', 12, 36, 12, 8, [['sum by (provider, direction) (rate(llm_tokens_total[5m]))', '{{provider}} {{direction}}']], { unit: 'ops' }),
    panel('LLM provider self-test (1 = healthy)', 'stat', 0, 44, 8, 5, [['llm_provider_up', '{{provider}}']], { unit: 'none', min: 0, max: 1, ...steps(['red', null], ['green', 1]) }),
    panel('Agent runs by outcome', 'timeseries', 8, 44, 8, 5, [['sum by (outcome) (rate(agent_runs_total[10m]))', '{{outcome}}']], { unit: 'ops' }),
    panel('Agent steps per run, p95', 'stat', 16, 44, 8, 5, [['histogram_quantile(0.95, sum by (le) (rate(agent_steps_bucket[1h])))']], { unit: 'none', ...steps(['green', null], ['orange', 5], ['red', 7]) }),
    panel('Shopper feedback by action and publish result', 'timeseries', 0, 49, 24, 8, [['sum by (action, result) (rate(feedback_events_total[5m]))', '{{action}} {{result}}']], { unit: 'ops' }),
  ],
};
require('fs').writeFileSync(require('path').join(__dirname, 'dashboards/api.json'), JSON.stringify(dashboard, null, 2) + '\n');
console.log('wrote api.json with', dashboard.panels.length, 'panels');
