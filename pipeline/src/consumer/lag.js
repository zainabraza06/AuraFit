import { metrics } from '../common/metrics.js';

/**
 * Polls broker offsets and publishes consumer lag (log end - committed) per topic.
 * This is the headline health signal on the Grafana dashboard.
 */
export function startLagMonitor(kafka, groupId, topics, intervalMs = 2000) {
  const admin = kafka.admin();
  let timer;
  const tick = async () => {
    for (const topic of topics) {
      try {
        const [latest, committed] = await Promise.all([
          admin.fetchTopicOffsets(topic),
          admin.fetchOffsets({ groupId, topics: [topic] }),
        ]);
        const done = new Map(committed[0].partitions.map((p) => [p.partition, Number(p.offset)]));
        const lag = latest.reduce((sum, p) => {
          const c = done.get(p.partition);
          return sum + Number(p.high) - (c >= 0 ? c : Number(p.low));
        }, 0);
        metrics.consumerLag.set({ topic }, lag);
      } catch { /* broker briefly unavailable; keep the last value */ }
    }
  };
  return admin.connect().then(() => {
    timer = setInterval(tick, intervalMs);
    return () => { clearInterval(timer); return admin.disconnect(); };
  });
}
