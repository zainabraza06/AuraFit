/**
 * feedbackEvents.js — API side of the shopper-feedback stream (clicks, saves, thumbs, try-on...).
 *
 * POST /api/feedback validates the body, replaces the user/session identity with a salted hash, and
 * publishes to the `user.feedback` Kafka topic. Fail-open: feedback is analytics, so a broker outage
 * must never break the shopper's request (it is counted and dropped, never queued unbounded).
 * Envelope and event id mirror pipeline/src/common/events.js; pipeline/test/contract.test.js keeps them in sync.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FEEDBACK_TOPIC = 'user.feedback';
export const FEEDBACK_ACTIONS = ['result_click', 'save', 'unsave', 'thumb_up', 'thumb_down', 'tryon_start', 'outfit_accept', 'outfit_reject'];

export const FeedbackBody = z.object({
  action: z.enum(FEEDBACK_ACTIONS),
  clientEventId: z.string().min(8).max(64),
  surface: z.enum(['search', 'product', 'outfit', 'agent', 'tryon']).default('search'),
  productUrl: z.string().url().max(500).optional(),
  catalog: z.enum(['clothing', 'shoes', 'jewelry', 'watches']).optional(),
  query: z.string().max(200).optional(),
  position: z.number().int().min(0).max(200).optional(),
  sessionId: z.string().min(8).max(64).optional(),
});

/** Salted hash: stable per person (so we can count distinct shoppers) but not reversible to an id. */
export function actorHash(identity, salt = process.env.FEEDBACK_SALT || 'dev-only-salt') {
  return createHash('sha256').update(`${salt}|${identity}`).digest('hex').slice(0, 24);
}

export function feedbackEventId(payload) {
  return createHash('sha256').update([FEEDBACK_TOPIC, payload.actor, payload.clientEventId].join('|')).digest('hex').slice(0, 32);
}

const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

/** Build the envelope from a validated body and the caller identity. */
export function buildFeedbackEvent(body, identity) {
  const { sessionId, ...rest } = body;
  const payload = compact({ ...rest, actor: actorHash(identity || sessionId || 'anonymous') });
  return {
    eventId: feedbackEventId(payload),
    type: FEEDBACK_TOPIC,
    version: 1,
    occurredAt: new Date().toISOString(),
    source: 'api',
    payload,
  };
}

export const isFeedbackPipelineEnabled = () => String(process.env.PIPELINE_ENABLED || '').toLowerCase() === 'true';

let producerPromise;
async function defaultPublish(event) {
  producerPromise ||= (async () => {
    const { Kafka, logLevel } = await import('kafkajs');
    const kafka = new Kafka({ clientId: 'aurafit-api', brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','), logLevel: logLevel.WARN });
    const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
    await producer.connect();
    return producer;
  })();
  const producer = await producerPromise.catch((e) => { producerPromise = undefined; throw e; });
  await producer.send({ topic: FEEDBACK_TOPIC, acks: -1, messages: [{ key: event.payload.productUrl || event.payload.actor, value: JSON.stringify(event) }] });
}

/**
 * @param {{ publish?: (event: object) => Promise<void>, enabled?: boolean }} [opts]
 * @returns {(event: object) => Promise<'sent'|'disabled'|'failed'>}
 */
export function createFeedbackPublisher({ publish = defaultPublish, enabled = isFeedbackPipelineEnabled() } = {}) {
  return async function send(event) {
    if (!enabled) return 'disabled';
    try {
      await publish(event);
      return 'sent';
    } catch (err) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'feedback_publish_failed', error: err.message }));
      return 'failed';
    }
  };
}
