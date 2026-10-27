/**
 * productEvents.js — bridge from the scraper to the Kafka pipeline.
 *
 * Off by default (PIPELINE_ENABLED=true turns it on) and fail-open: a broker
 * outage must never abort a scrape, so publish errors are logged and swallowed.
 *
 * The envelope and eventId hashing mirror pipeline/src/common/events.js; a test
 * in pipeline/test asserts the two stay in sync.
 */
import { createHash } from 'crypto';

export const EVENT_TYPES = {
  DISCOVERED: 'product.discovered',
  PRICE_CHANGED: 'product.price_changed',
};

export function eventIdFor(type, payload) {
  const basis = type === EVENT_TYPES.PRICE_CHANGED
    ? [type, payload.productUrl, payload.oldPrice, payload.newPrice]
    : [type, payload.productUrl, payload.price];
  return createHash('sha256').update(basis.join('|')).digest('hex').slice(0, 32);
}

export function buildEvent(type, payload) {
  return {
    eventId: eventIdFor(type, payload),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    source: 'scraper',
    payload,
  };
}

const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

/**
 * Maps one upsert outcome to zero or more events.
 *   inserted -> product.discovered
 *   updated with a different price -> product.price_changed
 */
export function eventsForUpsert({ outcome, oldPrice }, product) {
  const base = { productUrl: product.productUrl, brand: product.brand, name: product.name };
  const imageUrl = product.imageUrl || product.images?.[0];
  const currency = product.currency || 'PKR';

  if (outcome === 'inserted') {
    return [buildEvent(EVENT_TYPES.DISCOVERED, compact({
      ...base, price: product.price, compareAtPrice: product.compareAtPrice, currency,
      imageUrl, category: product.category, subCategory: product.subCategory,
    }))];
  }
  if (outcome === 'updated' && typeof oldPrice === 'number' && oldPrice !== product.price) {
    return [buildEvent(EVENT_TYPES.PRICE_CHANGED, compact({
      ...base, oldPrice, newPrice: product.price, currency, imageUrl,
    }))];
  }
  return [];
}

export const isPipelineEnabled = () => String(process.env.PIPELINE_ENABLED || '').toLowerCase() === 'true';

/**
 * Buffers events during a scrape and ships them in batches.
 * `publisherFactory` is injectable for tests; default lazily imports kafkajs.
 */
export function createEventEmitter({ enabled = isPipelineEnabled(), publisherFactory = defaultPublisher, batchSize = 200, logger = console } = {}) {
  let buffer = [];
  let publisher = null;
  let sent = 0;

  async function flush() {
    if (!enabled || buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    try {
      publisher ||= await publisherFactory();
      await publisher.publish(batch);
      sent += batch.length;
    } catch (err) {
      logger.warn?.(`[pipeline] publish failed, ${batch.length} events dropped: ${err.message}`);
    }
  }

  return {
    async record(result, product) {
      if (!enabled) return;
      buffer.push(...eventsForUpsert(result, product));
      if (buffer.length >= batchSize) await flush();
    },
    flush,
    async close() {
      await flush();
      await publisher?.disconnect?.();
      return sent;
    },
  };
}

async function defaultPublisher() {
  const { Kafka, logLevel } = await import('kafkajs');
  const kafka = new Kafka({
    clientId: 'aurafit-scraper',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });
  const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
  await producer.connect();
  return {
    async publish(events) {
      const byTopic = new Map();
      for (const e of events) {
        const list = byTopic.get(e.type) || [];
        list.push({ key: e.payload.productUrl, value: JSON.stringify(e) });
        byTopic.set(e.type, list);
      }
      await producer.sendBatch({ acks: -1, topicMessages: [...byTopic].map(([topic, messages]) => ({ topic, messages })) });
    },
    disconnect: () => producer.disconnect(),
  };
}
