import http from 'node:http';
import client from 'prom-client';
import { config } from './config.js';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const metrics = {
  events: new client.Counter({
    name: 'pipeline_events_total',
    help: 'Events handled by the consumer, by type and outcome',
    labelNames: ['type', 'outcome'], // outcome: stored | duplicate | invalid | dlq
    registers: [registry],
  }),
  latency: new client.Histogram({
    name: 'pipeline_event_processing_seconds',
    help: 'Time to validate, dedupe and store one event',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  }),
  consumerLag: new client.Gauge({
    name: 'pipeline_consumer_lag',
    help: 'Kafka messages behind the log end, per topic',
    labelNames: ['topic'],
    registers: [registry],
  }),
  queueDepth: new client.Gauge({
    name: 'pipeline_queue_depth',
    help: 'Ready messages in a RabbitMQ queue',
    labelNames: ['queue'],
    registers: [registry],
  }),
  jobs: new client.Counter({
    name: 'pipeline_jobs_total',
    help: 'Background jobs by queue and outcome',
    labelNames: ['queue', 'outcome'], // outcome: done | retried | dead | skipped_locked
    registers: [registry],
  }),
};

/** Exposes /metrics for Prometheus and /healthz for Docker. */
export function startMetricsServer(port = config.metricsPort) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', registry.contentType);
      return res.end(await registry.metrics());
    }
    if (req.url === '/healthz') return res.end('ok');
    res.statusCode = 404;
    res.end();
  });
  server.listen(port);
  return server;
}
