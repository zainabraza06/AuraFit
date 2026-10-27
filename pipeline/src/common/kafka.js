import { Kafka, logLevel } from 'kafkajs';
import { config } from './config.js';
import { TOPICS } from './topics.js';

export function createKafka(clientId = config.kafka.clientId) {
  return new Kafka({
    clientId,
    brokers: config.kafka.brokers,
    logLevel: logLevel.WARN,
    retry: { initialRetryTime: 300, retries: 8 },
  });
}

/** Idempotent so startup order (compose) doesn't matter. */
export async function ensureTopics(kafka, partitions = 3) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      waitForLeaders: true,
      topics: Object.values(TOPICS).map((topic) => ({ topic, numPartitions: partitions, replicationFactor: 1 })),
    });
  } finally {
    await admin.disconnect();
  }
}
