import { createKafka } from './kafka.js';
import { partitionKey } from './events.js';

/**
 * Event publisher used by the scraper side.
 * acks=-1 + idempotent producer: a broker retry cannot write a message twice.
 */
export async function createPublisher(clientId = 'aurafit-scraper') {
  const producer = createKafka(clientId).producer({ idempotent: true, maxInFlightRequests: 1 });
  await producer.connect();
  return {
    /** @param {Array<object>} events built via buildEvent() */
    async publish(events) {
      if (!events.length) return;
      const byTopic = new Map();
      for (const e of events) {
        const list = byTopic.get(e.type) || [];
        list.push({ key: partitionKey(e), value: JSON.stringify(e) });
        byTopic.set(e.type, list);
      }
      await producer.sendBatch({
        acks: -1,
        topicMessages: [...byTopic].map(([topic, messages]) => ({ topic, messages })),
      });
    },
    disconnect: () => producer.disconnect(),
  };
}
