/**
 * metrics.js — Prometheus metrics for the API.
 *
 * Kept free of imports from the rest of the app so any module can record a
 * metric without creating import cycles.
 *
 * Label discipline: HTTP routes are labelled by their route PATTERN
 * ("/api/products/:id"), never the raw URL, so cardinality stays bounded.
 */
import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'HTTP requests by method, route pattern and status class',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency by method and route pattern',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [registry],
});

export const llmCalls = new client.Counter({
  name: 'llm_calls_total',
  help: 'LLM provider calls by provider and outcome (success|failure)',
  labelNames: ['provider', 'outcome'],
  registers: [registry],
});

export const llmDuration = new client.Histogram({
  name: 'llm_call_duration_seconds',
  help: 'LLM provider call latency by provider, feature and outcome',
  labelNames: ['provider', 'feature', 'outcome'],
  buckets: [0.25, 0.5, 1, 2, 4, 8, 15, 30, 60],
  registers: [registry],
});

export const llmTokens = new client.Counter({
  name: 'llm_tokens_total',
  help: 'LLM tokens used by provider, feature and direction (input|output), as reported by the provider',
  labelNames: ['provider', 'feature', 'direction'],
  registers: [registry],
});

export const agentRuns = new client.Counter({
  name: 'agent_runs_total',
  help: 'Stylist agent runs by how they ended (answered|budget|llm_failed)',
  labelNames: ['outcome'],
  registers: [registry],
});

export const agentSteps = new client.Histogram({
  name: 'agent_steps',
  help: 'Decision steps used per stylist agent run',
  buckets: [1, 2, 3, 4, 5, 6, 8, 12],
  registers: [registry],
});

export const llmUp = new client.Gauge({
  name: 'llm_provider_up',
  help: '1 if the provider passed its last self-test, 0 if it failed',
  labelNames: ['provider'],
  registers: [registry],
});

export const llmCooldown = new client.Gauge({
  name: 'llm_provider_in_cooldown',
  help: '1 while the circuit breaker is skipping this provider',
  labelNames: ['provider'],
  registers: [registry],
});

export const appEvents = new client.Counter({
  name: 'app_events_total',
  help: 'Named application events (recommendation / fallback counters)',
  labelNames: ['name'],
  registers: [registry],
});

const UNMATCHED = 'unmatched';

/** "/api/products/:id" from the matched route; falls back to a constant, never the raw URL. */
export function routeLabel(req) {
  if (req.route?.path === undefined) return UNMATCHED;
  const base = req.baseUrl || '';
  const p = typeof req.route.path === 'string' ? req.route.path : UNMATCHED;
  return `${base}${p === '/' ? '' : p}` || '/';
}

/** Express middleware: record count + latency when the response finishes. */
export function httpMetrics(req, res, next) {
  if (req.path === '/metrics') return next();
  const stop = httpDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: routeLabel(req), status: `${Math.floor(res.statusCode / 100)}xx` };
    httpRequests.inc(labels);
    stop(labels);
  });
  next();
}

/**
 * GET /metrics handler. If METRICS_TOKEN is set a matching Bearer token is required
 * (the endpoint exposes internals; do not leave it open on a public host).
 */
export function metricsHandler(req, res) {
  const token = process.env.METRICS_TOKEN;
  if (token && req.get('authorization') !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  registry.metrics().then((body) => {
    res.set('Content-Type', registry.contentType).send(body);
  }).catch((err) => res.status(500).json({ error: err.message }));
}
