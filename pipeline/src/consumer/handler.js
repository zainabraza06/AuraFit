import { validateEvent } from '../common/events.js';
import { QUEUES } from '../common/topics.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds the per-message handler. All I/O is injected so the logic is testable
 * without Kafka, Redis, Mongo or RabbitMQ.
 *
 * Pipeline: parse -> validate -> dedupe -> store -> enqueue jobs -> mark seen.
 * Anything unrecoverable goes to the dead-letter topic with the reason; the
 * offset is then committed so one bad message never blocks the partition.
 */
export function createHandler({ store, dedupe, jobs, sendToDlq, metrics, logger, maxRetries = 3, backoffMs = 100 }) {
  async function fail(raw, reason, outcome, type = 'unknown') {
    await sendToDlq(raw, reason);
    metrics.events.inc({ type, outcome });
    logger.warn('event dead-lettered', { reason, outcome });
  }

  async function enqueueJobs(event, priceDrop) {
    const { payload } = event;
    if (payload.imageUrl) {
      await jobs.publish(QUEUES.image, { eventId: event.eventId, productUrl: payload.productUrl, imageUrl: payload.imageUrl });
    }
    if (priceDrop) {
      await jobs.publish(QUEUES.notify, { eventId: event.eventId, ...priceDrop });
    }
  }

  return async function handle(rawValue) {
    const stop = metrics.latency.startTimer();
    try {
      let parsed;
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        return await fail(rawValue, 'malformed JSON', 'invalid');
      }

      const check = validateEvent(parsed);
      if (!check.ok) return await fail(rawValue, check.reason, 'invalid', parsed?.type);
      const { event } = check;

      if (await dedupe.has(event.eventId)) {
        metrics.events.inc({ type: event.type, outcome: 'duplicate' });
        return;
      }

      let lastErr;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await store.save(event);
          // A retry may follow a failure after the DB write, so jobs are re-offered;
          // workers are idempotent (job-done marker + lock) which makes that safe.
          if (res.outcome === 'stored' || attempt > 1) await enqueueJobs(event, res.priceDrop);
          await dedupe.mark(event.eventId);
          metrics.events.inc({ type: event.type, outcome: res.outcome });
          return;
        } catch (err) {
          lastErr = err;
          logger.warn('store attempt failed', { attempt, err: err.message });
          if (attempt < maxRetries) await sleep(backoffMs * 2 ** (attempt - 1));
        }
      }
      await fail(rawValue, `store failed after ${maxRetries} attempts: ${lastErr.message}`, 'dlq', event.type);
    } finally {
      stop();
    }
  };
}
