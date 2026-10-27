import { config } from '../common/config.js';
import { createLogger } from '../common/logger.js';
import { createKafka, ensureTopics } from '../common/kafka.js';
import { createRedis } from '../common/redis.js';
import { createDedupe } from '../common/dedupe.js';
import { connectMongo, models } from '../common/db.js';
import { connectRabbit } from '../common/rabbit.js';
import { metrics, startMetricsServer } from '../common/metrics.js';
import { TOPICS, QUEUES } from '../common/topics.js';
import { createStore } from './store.js';
import { createHandler } from './handler.js';
import { startLagMonitor } from './lag.js';

const logger = createLogger('consumer');

async function main() {
  startMetricsServer();
  await connectMongo();
  const redis = createRedis();
  const rabbit = await connectRabbit();

  const kafka = createKafka('aurafit-consumer');
  await ensureTopics(kafka);

  const dlqProducer = kafka.producer();
  await dlqProducer.connect();
  const sendToDlq = (raw, reason) => dlqProducer.send({
    topic: TOPICS.deadLetter,
    messages: [{ value: String(raw), headers: { reason: String(reason).slice(0, 500) } }],
  });

  const handle = createHandler({
    store: createStore(models),
    dedupe: createDedupe(redis, config.dedupeTtlSeconds),
    jobs: rabbit,
    sendToDlq,
    metrics,
    logger,
    maxRetries: config.maxRetries,
  });

  const consumer = kafka.consumer({ groupId: config.kafka.groupId });
  await consumer.connect();
  await consumer.subscribe({ topics: [TOPICS.discovered, TOPICS.priceChanged], fromBeginning: true });
  await consumer.run({
    // Partitions are independent, so process them in parallel; order within a partition is kept.
    partitionsConsumedConcurrently: Number(process.env.CONSUMER_CONCURRENCY || 3),
    // Offsets are committed only after this resolves: a crash mid-message
    // means redelivery (at-least-once), which dedupe turns into exactly-once effects.
    eachMessage: async ({ message }) => handle(message.value?.toString() ?? ''),
  });

  const stopLag = await startLagMonitor(kafka, config.kafka.groupId, [TOPICS.discovered, TOPICS.priceChanged]);
  const depthTimer = setInterval(async () => {
    for (const q of [QUEUES.image, QUEUES.notify, QUEUES.deadLetter]) {
      try { metrics.queueDepth.set({ queue: q }, await rabbit.depth(q)); } catch { /* channel closing */ }
    }
  }, 2000);

  logger.info('consumer running', { brokers: config.kafka.brokers });

  const shutdown = async (sig) => {
    logger.info('shutting down', { sig });
    clearInterval(depthTimer);
    await stopLag();
    await consumer.disconnect();
    await dlqProducer.disconnect();
    await rabbit.close();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('consumer crashed', { err: err.message });
  process.exit(1);
});
