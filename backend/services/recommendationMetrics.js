/**
 * Lightweight in-process counters + structured logs for recommendation / LLM flows.
 * Safe no-op style: never throws. Optional snapshot for a future health endpoint.
 */
const counts = Object.create(null);

/** @param {string} name */
export function bumpMetric(name, delta = 1) {
  counts[name] = (counts[name] || 0) + delta;
}

export function snapshotRecommendationMetrics() {
  return { ...counts };
}

/** @param {Record<string, unknown>} payload */
export function logRecommendationEvent(payload) {
  try {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        channel: 'recommendation',
        ...payload
      })
    );
  } catch {
    // ignore
  }
}
