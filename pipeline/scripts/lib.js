import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createKafka } from '../src/common/kafka.js';
import { createPublisher } from '../src/common/publisher.js';
import { buildEvent } from '../src/common/events.js';
import { EVENT_TYPES, TOPICS } from '../src/common/topics.js';
import { connectMongo, models } from '../src/common/db.js';

export { createPublisher, connectMongo, models, TOPICS };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

export const newRunId = () => `r${Date.now().toString(36)}`;
export const urlPrefix = (runId) => `https://loadtest.aurafit.local/${runId}/`;

/**
 * Builds the workload. Every product gets a `discovered` event; `dropRatio` of
 * them also get a later `price_changed` to a lower price, which must produce
 * exactly one price-drop notification each.
 */
export function generateWorkload(runId, products, dropRatio = 0.1) {
  const discovered = [];
  const drops = [];
  const dropCount = Math.floor(products * dropRatio);
  for (let i = 0; i < products; i++) {
    const base = { productUrl: `${urlPrefix(runId)}p/${i}`, brand: 'LoadTest', name: `Item ${i}`, currency: 'PKR' };
    discovered.push(buildEvent(EVENT_TYPES.DISCOVERED, { ...base, price: 1000 }, 'loadtest'));
    if (i < dropCount) drops.push(buildEvent(EVENT_TYPES.PRICE_CHANGED, { ...base, oldPrice: 1000, newPrice: 800 }, 'loadtest'));
  }
  return { discovered, drops, expectedStored: discovered.length + drops.length, expectedNotifications: drops.length };
}

/** Sum of (log end - committed) across partitions for a consumer group. */
export async function totalLag(kafka, groupId) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    let lag = 0;
    for (const topic of [TOPICS.discovered, TOPICS.priceChanged]) {
      const [latest, committed] = await Promise.all([admin.fetchTopicOffsets(topic), admin.fetchOffsets({ groupId, topics: [topic] })]);
      const done = new Map(committed[0].partitions.map((p) => [p.partition, Number(p.offset)]));
      for (const p of latest) lag += Number(p.high) - (done.get(p.partition) >= 0 ? done.get(p.partition) : Number(p.low));
    }
    return lag;
  } finally {
    await admin.disconnect();
  }
}

export async function dlqSize() {
  const admin = createKafka('loadtest-admin').admin();
  await admin.connect();
  try {
    const offs = await admin.fetchTopicOffsets(TOPICS.deadLetter);
    return offs.reduce((s, p) => s + Number(p.high) - Number(p.low), 0);
  } finally {
    await admin.disconnect();
  }
}

/** Counts what actually landed in Mongo for one run. */
export async function countRun(runId) {
  const re = new RegExp(`^${urlPrefix(runId).replace(/[.*+?^${}()|[\]\/]/g, '\$&')}`);
  const [stored, distinct, notifications] = await Promise.all([
    models.ProcessedEvent.countDocuments({ productUrl: re }),
    models.ProcessedEvent.distinct('eventId', { productUrl: re }).then((a) => a.length),
    models.Notification.countDocuments({ productUrl: re }),
  ]);
  return { stored, distinct, notifications };
}

export async function waitFor(check, { timeoutMs, intervalMs = 250 }) {
  const t0 = Date.now();
  for (;;) {
    const v = await check();
    if (v.done) return { ...v, waitedMs: Date.now() - t0, timedOut: false };
    if (Date.now() - t0 > timeoutMs) return { ...v, waitedMs: Date.now() - t0, timedOut: true };
    await sleep(intervalMs);
  }
}

export function saveReport(name, report) {
  const file = resolve(import.meta.dirname, '../../docs/results', `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  return file;
}
