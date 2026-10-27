/**
 * Load test: pushes N products through Kafka -> consumer -> Mongo/RabbitMQ and reports
 * end-to-end throughput plus integrity (loss / duplicates / dead-letters).
 *
 *   node scripts/loadtest.js --products=20000 --dup=0.05 --invalid=50
 *
 * Needs the stack up (`docker compose up -d`) and Kafka/Mongo reachable on localhost.
 * Injects deliberate duplicates and malformed messages to prove they are
 * de-duplicated / dead-lettered rather than counted.
 */
import { createPublisher, connectMongo, generateWorkload, newRunId, arg, countRun, dlqSize, waitFor, saveReport, TOPICS } from './lib.js';
import { createKafka } from '../src/common/kafka.js';

const products = Number(arg('products', 20000));
const dupRatio = Number(arg('dup', 0.05));
const invalid = Number(arg('invalid', 50));
const timeoutMs = Number(arg('timeout', 300)) * 1000;
const runId = newRunId();

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function main() {
  await connectMongo(process.env.MONGO_URI || 'mongodb://localhost:27017/aurafit_pipeline');
  const publisher = await createPublisher('loadtest');
  const rawProducer = createKafka('loadtest-raw').producer();
  await rawProducer.connect();

  const w = generateWorkload(runId, products);
  const dlqBefore = await dlqSize();
  console.log(`run ${runId}: ${w.discovered.length} discovered + ${w.drops.length} price drops, ` +
    `+${Math.floor(products * dupRatio)} duplicates, +${invalid} malformed`);

  const t0 = Date.now();
  for (const batch of chunk(w.discovered, 1000)) await publisher.publish(batch);
  for (const batch of chunk(w.drops, 1000)) await publisher.publish(batch);
  const publishMs = Date.now() - t0;

  // Redelivery simulation: the same events sent again must be ignored.
  const dups = w.discovered.slice(0, Math.floor(products * dupRatio));
  for (const batch of chunk(dups, 1000)) await publisher.publish(batch);
  if (invalid) {
    await rawProducer.send({
      topic: TOPICS.discovered,
      messages: Array.from({ length: invalid }, (_, i) => ({ key: `bad-${i}`, value: i % 2 ? '{broken json' : JSON.stringify({ type: 'product.discovered', nope: i }) })),
    });
  }

  const result = await waitFor(async () => {
    const c = await countRun(runId);
    return { ...c, done: c.stored >= w.expectedStored && c.notifications >= w.expectedNotifications && c.droppedState >= w.expectedNotifications };
  }, { timeoutMs });
  const totalMs = Date.now() - t0;

  // Give the DLQ producer a moment, then read how many bad messages were parked.
  const dlq = (await dlqSize()) - dlqBefore;
  const final = await countRun(runId);

  const report = {
    runId, at: new Date().toISOString(),
    input: { products, uniqueEvents: w.expectedStored, duplicatesSent: dups.length, malformedSent: invalid },
    result: {
      stored: final.stored, distinctEventIds: final.distinct, notifications: final.notifications,
      productsWithCorrectFinalPrice: final.droppedState, expectedFinalPrices: w.expectedNotifications,
      lost: w.expectedStored - final.stored,
      duplicatesStored: final.stored - final.distinct,
      deadLettered: dlq,
      timedOut: result.timedOut,
    },
    performance: {
      publishSeconds: +(publishMs / 1000).toFixed(2),
      endToEndSeconds: +(totalMs / 1000).toFixed(2),
      eventsPerSecondEndToEnd: Math.round(w.expectedStored / (totalMs / 1000)),
    },
  };
  const file = saveReport('loadtest', report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nsaved ${file}`);

  await publisher.disconnect();
  await rawProducer.disconnect();
  const ok = !result.timedOut && report.result.lost === 0 && report.result.duplicatesStored === 0 && dlq === invalid && final.notifications === w.expectedNotifications && final.droppedState === w.expectedNotifications;
  console.log(ok ? '\nPASS: zero loss, zero duplicates, bad messages dead-lettered' : '\nFAIL: see report');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
