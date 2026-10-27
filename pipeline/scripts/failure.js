/**
 * Failure test: SIGKILL consumer(s) mid-run and prove nothing is lost or duplicated.
 *
 *   node scripts/failure.js --products=20000 --mode=one     # kill 1 of 2 consumers
 *   node scripts/failure.js --products=20000 --mode=all     # kill every consumer, restart later
 *
 * `docker kill` sends SIGKILL, so there is no graceful shutdown or offset commit:
 * the in-flight messages are redelivered and must be absorbed by dedupe + the
 * unique eventId index. Run from anywhere; docker compose is invoked at the repo root.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createPublisher, connectMongo, generateWorkload, newRunId, arg, countRun, totalLag, waitFor, sleep, saveReport } from './lib.js';
import { createKafka } from '../src/common/kafka.js';
import { config } from '../src/common/config.js';

const products = Number(arg('products', 20000));
const mode = arg('mode', 'one');
const killAtPct = Number(arg('kill-at', 40));
const downSeconds = Number(arg('down', 8));
const rateBatch = Number(arg('batch', 250));
const rateDelayMs = Number(arg('delay', 25));
const repoRoot = resolve(import.meta.dirname, '../..');
const runId = newRunId();

const docker = (...args) => execFileSync('docker', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
const consumers = () => docker('compose', 'ps', '-q', 'consumer').split(/\r?\n/).filter(Boolean);

async function main() {
  await connectMongo(process.env.MONGO_URI || 'mongodb://localhost:27017/aurafit_pipeline');

  if (consumers().length < 2) {
    console.log('scaling consumer to 2 replicas...');
    docker('compose', 'up', '-d', '--no-recreate', '--scale', 'consumer=2');
    await sleep(15000); // let the group rebalance
  }
  const victims = mode === 'all' ? consumers() : consumers().slice(0, 1);

  const w = generateWorkload(runId, products);
  const all = [...w.discovered, ...w.drops];
  const publisher = await createPublisher('failure-test');
  const kafka = createKafka('failure-test-admin');
  console.log(`run ${runId}: ${all.length} unique events, mode=${mode}, will SIGKILL ${victims.length} consumer(s) at ~${killAtPct}%`);

  const t0 = Date.now();
  let published = 0;
  let killed = null;

  // Publish at a steady pace so the kill lands while the consumer is busy.
  const producing = (async () => {
    for (let i = 0; i < all.length; i += rateBatch) {
      await publisher.publish(all.slice(i, i + rateBatch));
      published = Math.min(all.length, i + rateBatch);
      if (rateDelayMs) await sleep(rateDelayMs);
    }
  })();

  while (!killed) {
    const { stored } = await countRun(runId);
    if (stored >= all.length * (killAtPct / 100)) {
      const lagAtKill = await totalLag(kafka, config.kafka.groupId).catch(() => null);
      victims.forEach((id) => docker('kill', id));
      killed = { at: Date.now() - t0, storedAtKill: stored, publishedAtKill: published, lagAtKill };
      console.log(`SIGKILL sent to ${victims.length} consumer(s): stored=${stored} published=${published} lag=${lagAtKill}`);
    } else {
      await sleep(50);
    }
  }

  await producing;
  await sleep(downSeconds * 1000);
  victims.forEach((id) => docker('start', id));
  console.log(`restarted after ${downSeconds}s down`);

  const wait = await waitFor(async () => {
    const c = await countRun(runId);
    return { ...c, done: c.stored >= all.length && c.notifications >= w.expectedNotifications };
  }, { timeoutMs: 300000 });
  const totalMs = Date.now() - t0;
  const final = await countRun(runId);

  const report = {
    runId, at: new Date().toISOString(), mode,
    input: { uniqueEvents: all.length, expectedNotifications: w.expectedNotifications },
    fault: { signal: 'SIGKILL', consumersKilled: victims.length, downSeconds, ...killed },
    result: {
      stored: final.stored, distinctEventIds: final.distinct, notifications: final.notifications,
      lost: all.length - final.stored,
      duplicatesStored: final.stored - final.distinct,
      lostNotifications: w.expectedNotifications - final.notifications,
      duplicateNotifications: Math.max(0, final.notifications - w.expectedNotifications),
      timedOut: wait.timedOut,
    },
    performance: { endToEndSeconds: +(totalMs / 1000).toFixed(2), eventsPerSecondEndToEnd: Math.round(all.length / (totalMs / 1000)) },
  };
  const file = saveReport(`failure-${mode}`, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nsaved ${file}`);

  await publisher.disconnect();
  const r = report.result;
  const ok = !r.timedOut && r.lost === 0 && r.duplicatesStored === 0 && r.lostNotifications === 0 && r.duplicateNotifications === 0;
  const inFlight = (killed.lagAtKill ?? 0) > 0;
  console.log(ok
    ? `\nPASS: consumer crash mid-run, ${r.stored}/${all.length} stored, 0 lost, 0 duplicated${inFlight ? '' : ' (WARNING: lag was 0 at kill time, so the crash may not have hit in-flight work; rerun with a higher --products)'}`
    : '\nFAIL: see report');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
