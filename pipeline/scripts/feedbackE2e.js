/**
 * Feedback end-to-end: API publisher -> Kafka (user.feedback) -> consumer -> Mongo.
 *
 *   node scripts/feedbackE2e.js --events=200
 *
 * Uses the REAL backend publisher (backend/events/feedbackEvents.js), so it proves the event the API emits is
 * accepted by the consumer in a running stack, not just in unit tests. Checks:
 *   - every distinct event is stored exactly once even though half of them are published twice (redelivery)
 *   - malformed feedback is dead-lettered, not stored
 * Needs the stack up (`docker compose up -d kafka mongo redis rabbitmq consumer`).
 */
import { connectMongo, models, dlqSize, waitFor, arg, newRunId, sleep } from './lib.js';
import { createKafka } from '../src/common/kafka.js';
import { TOPICS } from '../src/common/topics.js';
import { buildFeedbackEvent, createFeedbackPublisher } from '../../backend/events/feedbackEvents.js';

const total = Number(arg('events', 200));
const runId = newRunId();
const marker = `e2e ${runId}`;

async function main() {
  await connectMongo(process.env.MONGO_URI || 'mongodb://localhost:27017/aurafit_pipeline');
  const send = createFeedbackPublisher({ enabled: true });
  const dlqBefore = await dlqSize();

  const events = Array.from({ length: total }, (_, i) =>
    buildFeedbackEvent({ action: i % 2 ? 'result_click' : 'save', clientEventId: `${runId}-${i}-xxxxxxxx`, surface: 'search', productUrl: `https://loadtest.aurafit.local/${runId}/p/${i % 50}`, catalog: 'clothing', query: marker, position: i % 10 }, `u:e2e-${runId}`),
  );

  const t0 = Date.now();
  let failed = 0;
  for (const e of events) if ((await send(e)) !== 'sent') failed++;
  // redelivery: the first half is published a second time
  for (const e of events.slice(0, Math.floor(total / 2))) if ((await send(e)) !== 'sent') failed++;

  // malformed feedback that bypasses the API's validation (as a buggy producer could)
  const raw = createKafka('feedback-e2e-raw').producer();
  await raw.connect();
  const bad = 5;
  await raw.send({ topic: TOPICS.feedback, messages: Array.from({ length: bad }, (_, i) => ({ key: `bad${i}`, value: JSON.stringify({ eventId: `badbadbad${i}`, type: 'user.feedback', version: 1, occurredAt: new Date().toISOString(), source: 'e2e', payload: { action: 'explode', actor: 'x' } }) })) });
  await raw.disconnect();

  const stored = () => models.Feedback.countDocuments({ query: marker });
  const waited = await waitFor(async () => ({ done: (await stored()) >= total && (await dlqSize()) - dlqBefore >= bad }), { timeoutMs: 90_000 });
  const ok = !waited.timedOut;
  await sleep(2000); // give any stray duplicate a chance to show up
  const finalStored = await stored();
  const dlqDelta = (await dlqSize()) - dlqBefore;

  const problems = [];
  if (failed) problems.push(`${failed} publishes failed`);
  if (finalStored !== total) problems.push(`stored ${finalStored}, expected exactly ${total} (loss or duplicates)`);
  if (dlqDelta !== bad) problems.push(`dead-lettered ${dlqDelta}, expected ${bad}`);
  if (!ok && !problems.length) problems.push('timed out waiting for the consumer');

  console.log(`feedback e2e: published ${total} (+${Math.floor(total / 2)} duplicates, +${bad} malformed) in ${Date.now() - t0} ms; stored ${finalStored}; dead-lettered ${dlqDelta}`);
  if (problems.length) {
    console.error(`FAILED:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('PASSED: exactly-once storage under redelivery, bad events dead-lettered');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
